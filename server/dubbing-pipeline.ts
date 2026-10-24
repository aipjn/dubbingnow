import path from "node:path";
import { rm } from "node:fs/promises";
import type { ServerConfig } from "./config";
import type { JobStatus, VoiceTier } from "../lib/api/types";
import type {
  Segment,
  SpeechProvider,
  VoicePresentation,
  TranslatedSegmentHandler,
} from "./providers/google";
import { decodeChunk, alignSegment, AudioWriter } from "./media";
import { requireValue } from "./errors";
import { PipelineMetrics, mapConcurrent } from "./pipeline-metrics";
import {
  scanReferences,
  rankReferences,
  type ReferenceCandidate,
} from "./voice-reference";

export interface PipelineInput {
  source: string;
  audioDuration: number;
  duration: number;
  offset: number;
  sourceLanguage: string;
  targetLanguage: string;
  tier: VoiceTier;
  mode: "preset" | "clone";
  consentFiles: Map<number, string>;
  dir: string;
}
export interface PipelineReport {
  mode: "preset" | "clone";
  audioSeconds: number;
  segments: number;
  speakers: number;
  concurrency: number;
  references: ReferenceCandidate[];
  referenceRejections: Record<string, number>;
  timings: ReturnType<PipelineMetrics["snapshot"]>;
  cloneProvider?: "google" | "fish";
  savedVoiceReused?: boolean;
  streamingText?: boolean;
  synthesisCharacters?: number;
}
export async function analyzeRecording(
  config: ServerConfig,
  provider: SpeechProvider,
  input: PipelineInput,
  signal: AbortSignal,
  metrics = new PipelineMetrics(),
  stage: (
    status: JobStatus,
    progress: number,
  ) => void | Promise<void> = () => {},
  includeTranslation = false,
  onSegment?: TranslatedSegmentHandler,
) {
  const batches: Segment[][] = [],
    speakers = new Map<number, VoicePresentation>();
  const translatedBatches: Segment[][] = [];
  let detected = input.sourceLanguage,
    context = "",
    count = 0;
  let candidates: ReferenceCandidate[] = [];
  const rejections: Record<string, number> = {};
  for (let start = 0; start < input.audioDuration; start += 120) {
    signal.throwIfAborted();
    await stage("transcribing", 5 + (30 * start) / input.audioDuration);
    const duration = Math.min(120, input.audioDuration - start);
    const chunk = await metrics.measure("decode", () =>
      decodeChunk(
        config,
        input.source,
        path.join(input.dir, "chunk.wav"),
        start,
        duration,
        signal,
        input.mode === "clone" ? 24000 : 16000,
      ),
    );
    const combined =
      includeTranslation &&
      config.combinedTextPipeline &&
      provider.transcribeTranslated;
    const transcript: {
      language: string;
      segments: Segment[];
      translatedSegments?: Segment[];
    } = combined
      ? await metrics.measure("transcribeTranslate", () =>
          provider.transcribeTranslated!(
            chunk,
            duration,
            input.sourceLanguage,
            input.targetLanguage,
            context,
            signal,
            onSegment
              ? (original, translated) =>
                  onSegment(
                    {
                      ...original,
                      start: original.start + start,
                      end: original.end + start,
                    },
                    {
                      ...translated,
                      start: translated.start + start,
                      end: translated.end + start,
                    },
                  )
              : undefined,
          ),
        )
      : await metrics.measure("transcribe", () =>
          provider.transcribe(
            chunk,
            duration,
            input.sourceLanguage,
            context,
            signal,
          ),
        );
    if (transcript.translatedSegments)
      translatedBatches.push(
        transcript.translatedSegments.map((s) => ({
          ...s,
          start: s.start + start,
          end: s.end + start,
        })),
      );
    if (detected === "auto") detected = transcript.language;
    count += transcript.segments.length;
    requireValue(
      count <= config.maxSegments,
      "PROCESSING_FAILED",
      "This recording contains too many speech segments.",
      502,
    );
    for (const segment of transcript.segments) {
      if (
        !speakers.has(segment.speaker) ||
        speakers.get(segment.speaker) === "neutral"
      )
        speakers.set(segment.speaker, segment.voicePresentation || "neutral");
      segment.voicePresentation = speakers.get(segment.speaker);
    }
    if (input.mode === "clone") {
      const scan = await metrics.measure("referenceSelection", async () =>
        scanReferences(chunk, transcript.segments, start),
      );
      candidates = rankReferences([...candidates, ...scan.candidates]);
      for (const [reason, n] of Object.entries(scan.rejected))
        rejections[reason] = (rejections[reason] || 0) + n;
    }
    context = transcript.segments
      .map(
        (s) => `Speaker ${s.speaker} (${s.voicePresentation} voice): ${s.text}`,
      )
      .join("\n");
    batches.push(
      transcript.segments.map((s) => ({
        ...s,
        start: s.start + start,
        end: s.end + start,
      })),
    );
  }
  requireValue(
    count > 0,
    "PROCESSING_FAILED",
    "No readable speech was found in this recording.",
    502,
  );
  return {
    batches,
    translatedBatches,
    speakers,
    detected,
    count,
    candidates,
    rejections,
  };
}

export async function dubRecording(
  config: ServerConfig,
  provider: SpeechProvider,
  input: PipelineInput,
  signal: AbortSignal,
  metrics = new PipelineMetrics(),
  stage: (
    status: JobStatus,
    progress: number,
  ) => void | Promise<void> = () => {},
) {
  if (input.mode === "clone")
    requireValue(
      provider.replicate,
      "SERVICE_UNAVAILABLE",
      "Voice cloning is not configured.",
      503,
    );
  const concurrency = config.synthesisConcurrency ?? 3;
  const controller = new AbortController();
  signal = AbortSignal.any([signal, controller.signal]);
  const existingVoice =
    input.mode === "clone" && provider.existingVoice
      ? await metrics.measure("savedVoice", () =>
          provider.existingVoice!(signal),
        )
      : undefined;
  const streaming = !!(
    config.streamingTextPipeline &&
    config.combinedTextPipeline &&
    existingVoice &&
    input.mode === "clone" &&
    provider.cloneProvider === "fish" &&
    provider.singleVoiceTest &&
    provider.requiresConsentRecording === false &&
    provider.transcribeTranslated
  );
  async function synthesize(
    segment: Segment,
    index: number,
    voice: string | undefined,
    presentation: VoicePresentation | undefined,
    child: AbortSignal,
  ) {
    const start = segment.start + input.offset;
    if (start >= input.duration) return null;
    metrics.mark("firstSynthesisStart");
    const clip = await metrics.measure("synthesize", () =>
      provider.speak(
        segment.text,
        segment.speaker,
        input.tier,
        input.targetLanguage,
        child,
        presentation,
        voice,
      ),
    );
    metrics.audioReady();
    const file = await metrics.measure("align", () =>
      alignSegment(
        config,
        clip,
        input.dir,
        index,
        Math.min(segment.end - segment.start, input.duration - start),
        child,
      ),
    );
    return { file, start };
  }
  const early: ReturnType<typeof synthesize>[] = [];
  const active = new Set<ReturnType<typeof synthesize>>();
  let firstSpeaker: number | undefined;
  const onSegment: TranslatedSegmentHandler = async (original, translated) => {
    requireValue(
      early.length < config.maxSegments,
      "PROCESSING_FAILED",
      "Too many streamed speech segments.",
      502,
    );
    firstSpeaker ??= original.speaker;
    requireValue(
      original.speaker === firstSpeaker,
      "INVALID_REQUEST",
      "This test uses one saved voice. Choose a single-speaker recording until more voices are enabled.",
    );
    metrics.mark("firstTranslatedSegment");
    // Backpressure bounds real in-flight TTS+alignment, including across audio chunks.
    while (active.size >= concurrency) await Promise.race(active);
    signal.throwIfAborted();
    const task = synthesize(
      translated,
      early.length,
      existingVoice,
      original.voicePresentation,
      signal,
    ).catch((error) => {
      controller.abort(error);
      throw error;
    });
    early.push(task);
    active.add(task);
    void task.finally(() => active.delete(task)).catch(() => {});
  };
  try {
    const {
      batches,
      translatedBatches,
      speakers,
      detected,
      count,
      candidates,
      rejections,
    } = await analyzeRecording(
      config,
      provider,
      input,
      signal,
      metrics,
      stage,
      true,
      streaming ? onSegment : undefined,
    );
    metrics.mark("analysisCompleted");
    requireValue(
      speakers.size <= (config.maxSpeakers ?? 8),
      "INVALID_REQUEST",
      `Choose a recording with at most ${config.maxSpeakers ?? 8} speaker(s). Your reservation was returned.`,
      422,
    );
    const selected = [...speakers.keys()].map((s) =>
      candidates.find((c) => c.speaker === s),
    );
    if (input.mode === "clone") {
      if (provider.singleVoiceTest)
        requireValue(
          speakers.size === 1,
          "INVALID_REQUEST",
          "This test uses one saved voice. Choose a single-speaker recording until more voices are enabled.",
        );
      // New clones always wait for full validation; speculative TTS only uses an existing Fish voice.
      for (const speaker of speakers.keys()) {
        requireValue(
          provider.requiresConsentRecording === false ||
            input.consentFiles.has(speaker),
          "INVALID_REQUEST",
          `Add the original speaker's consent recording for speaker ${speaker + 1}.`,
        );
        requireValue(
          existingVoice || candidates.some((c) => c.speaker === speaker),
          "PROCESSING_FAILED",
          `Speaker ${speaker + 1} needs a clean, natural 10–30 second passage without overlapping voices.`,
          422,
        );
      }
    }
    const voiceKeys = new Map<number, string>();
    let translated: Segment[][] = [];
    await stage("translating", 35);
    // Voice preparation and translation are independent; drain both on failure.
    await mapConcurrent(
      ["translation", "voice"] as const,
      2,
      signal,
      async (task, _index, child) => {
        if (task === "translation") {
          translated =
            translatedBatches.length === batches.length
              ? translatedBatches
              : await mapConcurrent(
                  batches,
                  Math.min(concurrency, 2),
                  child,
                  (segments, _i, s) =>
                    metrics.measure("translate", () =>
                      provider.translate(segments, input.targetLanguage, s),
                    ),
                );
        } else if (input.mode === "clone") {
          if (existingVoice) {
            for (const speaker of speakers.keys())
              voiceKeys.set(speaker, existingVoice);
            return;
          }
          await mapConcurrent(
            selected as ReferenceCandidate[],
            concurrency,
            child,
            async (candidate, i, s) => {
              const reference = await metrics.measure("referenceExtract", () =>
                decodeChunk(
                  config,
                  input.source,
                  path.join(input.dir, `reference-${i}.wav`),
                  candidate.start,
                  candidate.end - candidate.start,
                  s,
                  24000,
                ),
              );
              const consentSource = input.consentFiles.get(candidate.speaker);
              // Limit consent to 30s; provider verifies the spoken statement and speaker match.
              const consent = consentSource
                ? await metrics.measure("consentDecode", () =>
                    decodeChunk(
                      config,
                      consentSource,
                      path.join(input.dir, `consent-${i}.wav`),
                      0,
                      30,
                      s,
                      24000,
                    ),
                  )
                : Buffer.alloc(0);
              const referenceText = batches
                .flat()
                .filter(
                  (segment) =>
                    segment.speaker === candidate.speaker &&
                    segment.start >= candidate.start - 0.03 &&
                    segment.end <= candidate.end + 0.03,
                )
                .map((s) => s.text)
                .join(" ");
              const voice = await metrics.measure("replicate", () =>
                provider.replicate!(
                  reference,
                  consent,
                  s,
                  referenceText,
                  candidate.speaker,
                ),
              );
              voiceKeys.set(candidate.speaker, voice);
            },
          );
        }
      },
    );
    const segments = translated.flat();
    requireValue(
      !early.length || early.length === segments.length,
      "PROCESSING_FAILED",
      "Incomplete streamed translation.",
      502,
    );
    if (segments.length) metrics.mark("firstTranslatedSegment");
    let finished = 0;
    await stage("synthesizing", 50);
    const aligned = await mapConcurrent(
      segments,
      concurrency,
      signal,
      async (segment, index, child) => {
        const result =
          index < early.length
            ? await early[index]
            : await synthesize(
                segment,
                index,
                voiceKeys.get(segment.speaker),
                speakers.get(segment.speaker),
                child,
              );
        finished++;
        await stage("synthesizing", 50 + (40 * finished) / segments.length);
        return result;
      },
    );
    const output = path.join(input.dir, "result.wav"),
      writer = new AudioWriter(output, input.duration);
    try {
      await stage("aligning", 90);
      await metrics.measure("write", async () => {
        await writer.init();
        for (const item of aligned)
          if (item) {
            await writer.add(item.file, item.start, signal);
            await rm(item.file, { force: true });
          }
      });
    } finally {
      await metrics.measure("flush", () => writer.close());
    }
    signal.throwIfAborted();
    const report: PipelineReport = {
      mode: input.mode,
      audioSeconds: input.audioDuration,
      segments: count,
      speakers: speakers.size,
      concurrency,
      references: selected.filter((c): c is ReferenceCandidate => !!c),
      referenceRejections: rejections,
      timings: metrics.snapshot(),
      cloneProvider:
        input.mode === "clone" ? provider.cloneProvider || "google" : undefined,
      savedVoiceReused: !!existingVoice,
      streamingText: streaming && early.length > 0,
      synthesisCharacters: segments.reduce(
        (sum, segment) => sum + segment.text.length,
        0,
      ),
    };
    return {
      output,
      sourceLanguage: detected,
      speakerCount: speakers.size,
      report,
    };
  } finally {
    controller.abort();
    await Promise.allSettled(early);
  }
}
