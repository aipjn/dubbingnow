import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  GoogleProvider,
  type SpeechProvider,
  type Segment,
} from "../server/providers/google";
import { JsonArrayObjects } from "../server/providers/google-stream";
import { dubRecording } from "../server/dubbing-pipeline";
import { wavHeader } from "../server/media";
import type { ServerConfig } from "../server/config";

test("incremental JSON extracts closed segment objects across escaped strings, nested objects and character boundaries", () => {
  const parser = new JsonArrayObjects();
  const segments = [
    {
      text: 'voz \\" } ] { "segments": [',
      referenceQuality: { cleanSpeech: true },
    },
    { text: "你好, España" },
  ];
  const json = JSON.stringify({ language: "en", segments });
  const result = [...json].flatMap((c) => parser.push(c));
  assert.deepEqual(result, segments);
  assert.equal(parser.text, json);
});

function streamEvents(json: string, failure = false) {
  const events = [
    { event_type: "step.start", index: 0, step: { type: "thought" } },
    {
      event_type: "step.delta",
      index: 0,
      delta: { type: "text", text: "ignore thought" },
    },
    { event_type: "step.start", index: 1, step: { type: "model_output" } },
    ...[...json].map((text) => ({
      event_type: "step.delta",
      index: 1,
      delta: { type: "text", text },
    })),
    ...(failure
      ? []
      : [
          {
            event_type: "interaction.completed",
            interaction: { status: "completed" },
          },
        ]),
  ];
  const encoded = new TextEncoder().encode(
    events.map((e) => "data: " + JSON.stringify(e) + "\r\n\r\n").join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split UTF-8 bytes and CRLF frame delimiters across reads.
        for (let i = 0; i < encoded.length; i += 7)
          controller.enqueue(encoded.slice(i, i + 7));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const segment = {
  start: 0,
  end: 2,
  speaker: 0,
  text: "Hello.",
  translatedText: "Hola, España.",
};
test("Google streams complete validated segments once and requires successful terminal event without retrying a truncated stream", async () => {
  for (const failure of [false, true]) {
    let calls = 0;
    const emitted: Segment[] = [];
    const provider = new GoogleProvider(
      { googleKey: "test-only", textModel: "test" } as ServerConfig,
      async (_url, init) => {
        calls++;
        assert.equal(JSON.parse(String(init?.body)).stream, true);
        return streamEvents(
          JSON.stringify({ language: "en", segments: [segment] }),
          failure,
        );
      },
    );
    const task = provider.transcribeTranslated(
      Buffer.alloc(1),
      2,
      "en",
      "es",
      "",
      new AbortController().signal,
      async (_original, translated) => {
        emitted.push(translated);
      },
    );
    if (failure) await assert.rejects(task, /interrupted/);
    else assert.equal((await task).translatedSegments[0].text, "Hola, España.");
    assert.equal(emitted.length, 1);
    assert.equal(calls, 1);
  }
});
test("invalid streamed timings do not reach the TTS callback", async () => {
  let callbacks = 0;
  const provider = new GoogleProvider(
    { googleKey: "test-only", textModel: "test" } as ServerConfig,
    async () =>
      streamEvents(
        JSON.stringify({ language: "en", segments: [{ ...segment, end: 9 }] }),
      ),
  );
  await assert.rejects(
    provider.transcribeTranslated(
      Buffer.alloc(1),
      2,
      "en",
      "es",
      "",
      new AbortController().signal,
      async () => {
        callbacks++;
      },
    ),
    /could not be aligned/,
  );
  assert.equal(callbacks, 0);
});

test("streaming pipeline overlaps analysis and synthesis, bounds concurrency and drains in-flight work before failure returns", async () => {
  for (const fail of [false, true]) {
    const dir = await mkdtemp(path.join(tmpdir(), "stream-pipeline-"));
    let active = 0,
      maximum = 0,
      spoken = 0,
      analysisDone = false,
      early = false;
    const config = {
      dataDir: dir,
      maxSegments: 100,
      ffmpeg: "ffmpeg",
      ffprobe: "ffprobe",
      combinedTextPipeline: true,
      streamingTextPipeline: true,
      synthesisConcurrency: 3,
    } as ServerConfig;
    const source = path.join(dir, "source.wav");
    await writeFile(
      source,
      Buffer.concat([wavHeader(3 * 24000), Buffer.alloc(3 * 48000)]),
    );
    const segments: Segment[] = Array.from({ length: 6 }, (_, i) => ({
      start: i * 0.5,
      end: (i + 1) * 0.5,
      speaker: 0,
      text: `Sentence ${i}.`,
    }));
    const provider: SpeechProvider = {
      cloneProvider: "fish",
      singleVoiceTest: true,
      requiresConsentRecording: false,
      existingVoice: async () => "one-saved-voice",
      replicate: async () => {
        throw new Error("must never clone");
      },
      transcribe: async () => {
        throw new Error("combined only");
      },
      translate: async (s) => s,
      transcribeTranslated: async (
        _audio,
        _duration,
        _source,
        _target,
        _context,
        _signal,
        onSegment,
      ) => {
        assert.ok(onSegment);
        for (const s of segments) {
          await onSegment(s, s);
          if (fail) throw new Error("stream ended unexpectedly");
        }
        analysisDone = true;
        return { language: "en", segments, translatedSegments: segments };
      },
      speak: async (
        _text,
        _speaker,
        _tier,
        _language,
        signal,
        _presentation,
        voice,
      ) => {
        assert.equal(voice, "one-saved-voice");
        early ||= !analysisDone;
        spoken++;
        maximum = Math.max(maximum, ++active);
        try {
          await delay(40, undefined, { signal });
          return Buffer.concat([wavHeader(9600), Buffer.alloc(19200)]);
        } finally {
          active--;
        }
      },
    };
    try {
      const task = dubRecording(
        config,
        provider,
        {
          source,
          audioDuration: 3,
          duration: 3,
          offset: 0,
          sourceLanguage: "en",
          targetLanguage: "es",
          tier: "standard",
          mode: "clone",
          consentFiles: new Map(),
          dir,
        },
        new AbortController().signal,
      );
      if (fail) {
        await assert.rejects(task, /stream ended unexpectedly/);
        await assert.rejects(access(path.join(dir, "result.wav")));
        assert.equal(spoken, 1);
      } else {
        const result = await task;
        assert.equal(result.report.streamingText, true);
        assert.equal(spoken, 6);
        assert.equal(maximum, 3);
        assert.ok(
          result.report.timings.milestones.firstSynthesisStart <
            result.report.timings.milestones.analysisCompleted,
        );
      }
      assert.equal(active, 0);
      assert.equal(early, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});
