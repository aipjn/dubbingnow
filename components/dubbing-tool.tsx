"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileAudio2,
  Film,
  Globe2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useAccount } from "./account/provider";
import { HumanVerification } from "./account/human-verification";
import { getApi } from "@/lib/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type {
  Capabilities,
  CreateJobRequest,
  Job,
  Quota,
  VoiceMode,
} from "@/lib/api/types";
import { hashFile, type MediaKind, validateFile } from "@/lib/media";
import {
  extractVideoAudio,
  mergeVideoAudio,
  probeAudioDuration,
} from "@/lib/local-media";
import type { VideoTimeline } from "@/lib/local-media-types";
import { BrowserDubbingTimings } from "@/lib/dubbing-timings";

const labels: Record<string, string> = {
  queued: "Waiting to start",
  transcribing: "Listening to every speaker",
  translating: "Translating your story",
  synthesizing: "Creating the new voices",
  aligning: "Getting the timing just right",
  rendering: "Putting it all together",
  completed: "Your recording is ready",
  cancelled: "Dubbing cancelled",
  failed: "Dubbing couldn’t finish",
};

interface VideoContext {
  filename: string;
  sizeBytes: number;
  sha256: string;
  timeline: VideoTimeline;
  jobId?: string;
}
const terminal = (job: Job) =>
  ["completed", "failed", "cancelled"].includes(job.status);
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function DubbingTool(props: {
  kind?: MediaKind;
  defaultTarget?: string;
}) {
  const { session } = useAccount();
  return <DubbingToolContent key={session?.id || "initial"} {...props} />;
}
function DubbingToolContent({
  kind = "all",
  defaultTarget = "es",
}: {
  kind?: MediaKind;
  defaultTarget?: string;
}) {
  const account = useAccount();
  const activeKey = `dubbingnow.active-job.v2.${account.session?.id || "initial"}`;
  const pendingKey = `dubbingnow.pending-job.v2.${account.session?.id || "initial"}`;
  const videoKey = `dubbingnow.local-video.v2.${account.session?.id || "initial"}`;
  const completedKey = `dubbingnow.completed-job.v1.${account.session?.id || "initial"}`;
  const [humanToken, setHumanToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationReset, setVerificationReset] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("auto");
  const [target, setTarget] = useState(defaultTarget);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("preset");
  const [consentFiles, setConsentFiles] = useState<(File | null)[]>([null]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const consentRequired =
    capabilities?.voiceCloning?.requiresConsentRecording ?? true;
  useEffect(() => {
    if (
      capabilities?.voiceCloning?.provider === "fish" &&
      capabilities.voiceCloning.enabled !== false
    )
      setVoiceMode("clone");
  }, [capabilities?.voiceCloning?.provider]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [phase, setPhaseState] = useState<
    | "idle"
    | "extracting"
    | "hashing"
    | "uploading"
    | "creating"
    | "processing"
    | "merging"
  >("idle");
  const browserTimings = useRef(new BrowserDubbingTimings());
  const timingKey = `dubbingnow.client-timing.v1.${account.session?.id || "initial"}`;
  const setPhase = useCallback(
    (next: typeof phase) => {
      const report = browserTimings.current.transition(next);
      if (report)
        try {
          sessionStorage.setItem(timingKey, JSON.stringify(report));
        } catch {
          /* Diagnostics must not interrupt processing. */
        }
      setPhaseState(next);
    },
    [timingKey],
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [demo, setDemo] = useState(!process.env.NEXT_PUBLIC_API_BASE_URL);
  const [initializing, setInitializing] = useState(true);
  const [recoverable, setRecoverable] = useState(false);
  const [refreshingResult, setRefreshingResult] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [videoContext, setVideoContext] = useState<VideoContext | null>(null);
  const [localVideo, setLocalVideo] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [pending, setPending] = useState<{
    input: CreateJobRequest;
    key: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const jobRef = useRef<Job | null>(null);
  const originalVideoRef = useRef<File | null>(null);
  const videoContextRef = useRef<VideoContext | null>(null);
  const trialVerified = !!(
    quota?.trial?.remainingUses &&
    quota.trial.verifiedUntil &&
    Date.parse(quota.trial.verifiedUntil) > now
  );
  async function verifyTrial() {
    if (verifying || !humanToken) return;
    setVerifying(true);
    setError("");
    try {
      setQuota(await getApi().verifyGuest({ token: humanToken }));
      setNow(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setVerifying(false);
      setHumanToken("");
      setVerificationReset((value) => value + 1);
    }
  }
  const busy = phase !== "idle";
  useEffect(
    () => () => {
      if (localVideo) URL.revokeObjectURL(localVideo.url);
    },
    [localVideo],
  );

  const updateVideoContext = useCallback((context: VideoContext | null) => {
    videoContextRef.current = context;
    setVideoContext(context);
    if (context) sessionStorage.setItem(videoKey, JSON.stringify(context));
    else sessionStorage.removeItem(videoKey);
  }, []);

  const finishLocalVideo = useCallback(
    async (completed: Job, signal: AbortSignal) => {
      const context = videoContextRef.current;
      const original = originalVideoRef.current;
      if (
        !context ||
        !original ||
        !completed.result ||
        completed.status !== "completed"
      )
        return;
      setPhase("merging");
      setLocalProgress(0);
      const response = await fetch(completed.result.download.url, {
        signal,
        credentials: "omit",
      });
      if (!response.ok)
        throw new Error(
          "Your video could not be prepared. Refresh the download links and try again.",
        );
      const merged = await mergeVideoAudio(original, await response.blob(), {
        enforceAlignment: !completed.result.isDemo,
        signal,
        onProgress: setLocalProgress,
      });
      if (signal.aborted) return;
      setLocalVideo({
        url: URL.createObjectURL(
          new Blob([merged.buffer], { type: merged.contentType }),
        ),
        filename: merged.filename,
      });
    },
    [],
  );

  const updateJob = useCallback((next: Job) => {
    setJob(next);
    jobRef.current = next;
    if (!terminal(next)) sessionStorage.setItem(activeKey, next.id);
    else sessionStorage.removeItem(activeKey);
    if (next.status === "completed")
      sessionStorage.setItem(completedKey, next.id);
  }, []);

  const watchJob = useCallback(
    async (initial: Job, signal: AbortSignal) => {
      setPhase("processing");
      let current = initial;
      updateJob(current);
      while (!terminal(current)) {
        await sleep(
          Math.max(500, Math.min(current.pollAfterMs, 10_000)),
          signal,
        );
        current = await getApi().getJob(current.id, signal);
        if (signal.aborted) return;
        updateJob(current);
      }
      if (current.status === "failed")
        setError(
          current.error?.message ||
            "This recording couldn’t be processed. Your reserved allowance will be returned.",
        );
      setQuota(await getApi().getQuota(signal));
      await finishLocalVideo(current, signal);
      setPhase("idle");
      setRecoverable(false);
    },
    [updateJob, finishLocalVideo],
  );

  useEffect(() => {
    if (!account.session) {
      if (account.error) {
        setError(account.error);
        setInitializing(false);
      }
      return;
    }
    let alive = true;
    const api = getApi();
    setDemo(api.mode === "demo");
    async function init() {
      try {
        const [caps, remaining] = await Promise.all([
          api.getCapabilities(),
          api.getQuota(),
        ]);
        if (!alive) return;
        setCapabilities(caps);
        setQuota(remaining);
        if (
          !caps.languages.some(
            (l) => l.code === defaultTarget && l.supportsTarget,
          )
        )
          setTarget(caps.languages.find((l) => l.supportsTarget)?.code || "");
        const requested = new URLSearchParams(window.location.search).get(
          "job",
        );
        let saved =
          requested ||
          sessionStorage.getItem(activeKey) ||
          sessionStorage.getItem(completedKey);
        const request = sessionStorage.getItem(pendingKey);
        const storedVideo = sessionStorage.getItem(videoKey);
        if (storedVideo) {
          try {
            const context = JSON.parse(storedVideo) as VideoContext;
            if (
              (!saved && (request || context.jobId)) ||
              context.jobId === saved
            ) {
              updateVideoContext(context);
              saved ||= context.jobId || null;
            } else {
              sessionStorage.removeItem(videoKey);
            }
          } catch {
            sessionStorage.removeItem(videoKey);
          }
        }
        if (request) {
          try {
            setPending(JSON.parse(request));
            setRecoverable(true);
            setError(
              "A previous request needs a status check. Resume it before starting another recording.",
            );
          } catch {
            sessionStorage.removeItem(pendingKey);
          }
        }
        if (saved) {
          const controller = new AbortController();
          controllerRef.current = controller;
          try {
            await watchJob(
              await api.getJob(saved, controller.signal),
              controller.signal,
            );
          } catch (err) {
            if (alive && !(err instanceof Error && err.name === "AbortError")) {
              if (
                err instanceof ApiError &&
                ["RESULT_EXPIRED", "JOB_NOT_FOUND"].includes(err.code)
              ) {
                sessionStorage.removeItem(activeKey);
                sessionStorage.removeItem(completedKey);
                sessionStorage.removeItem(videoKey);
                updateVideoContext(null);
                setRecoverable(false);
                setPhase("idle");
                setError(errorMessage(err));
                return;
              }
              setError(errorMessage(err));
              setRecoverable(!jobRef.current || !terminal(jobRef.current));
              setPhase("idle");
            }
          }
        }
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setInitializing(false);
      }
    }
    void init();
    return () => {
      alive = false;
      controllerRef.current?.abort();
    };
  }, [
    defaultTarget,
    watchJob,
    updateVideoContext,
    account.session?.id,
    account.error,
  ]);

  function chooseFile(next: File) {
    if (busy || pending || (jobRef.current && !terminal(jobRef.current)))
      return;
    try {
      const contentType = validateFile(
        next,
        kind,
        /\.(mp4|mov)$/i.test(next.name)
          ? 500_000_000
          : Math.min(
              quota?.maxFileBytes || 500_000_000,
              capabilities?.maxFileBytes || 500_000_000,
            ),
      );
      setFile(next);
      originalVideoRef.current = contentType.startsWith("video/") ? next : null;
      updateVideoContext(null);
      setLocalVideo(null);
      setError("");
      setJob(null);
      jobRef.current = null;
      setRecoverable(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function useSample() {
    try {
      const video = kind === "video";
      const response = await fetch(
        video ? "/demo/english.mp4" : "/demo/english.wav",
      );
      if (!response.ok)
        throw new Error(
          "The sample is unavailable. Please choose your own recording.",
        );
      chooseFile(
        new File(
          [await response.blob()],
          video ? "a-story-worth-sharing.mp4" : "a-story-worth-sharing.wav",
          { type: video ? "video/mp4" : "audio/wav" },
        ),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function submit(resume = false) {
    if (busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError("");
    setRecoverable(false);
    setPhase(resume ? "processing" : "hashing");
    let request = pending;
    try {
      const api = getApi();
      if (resume && jobRef.current && !terminal(jobRef.current)) {
        await watchJob(
          await api.getJob(jobRef.current.id, controller.signal),
          controller.signal,
        );
        return;
      }
      const savedJob =
        resume && !jobRef.current ? sessionStorage.getItem(activeKey) : null;
      if (savedJob) {
        await watchJob(
          await api.getJob(savedJob, controller.signal),
          controller.signal,
        );
        return;
      }
      if (!request) {
        if (!file || !quota || !capabilities) return;
        if (source === target)
          throw new Error(
            "Choose a different target language from the source language.",
          );
        if (
          !demo &&
          voiceMode === "clone" &&
          consentRequired &&
          consentFiles.some((f) => !f)
        )
          throw new Error("Add a consent recording for each original speaker.");
        if (!demo && voiceMode === "clone" && consentRequired)
          for (const consent of consentFiles) {
            validateFile(consent!, "audio", 2_000_000);
            const info = await probeAudioDuration(consent!, {
              signal: controller.signal,
            });
            if (info.durationSeconds > 30)
              throw new Error("Use consent recordings up to 30 seconds.");
          }
        const inputType = validateFile(file, kind);
        let upload = file;
        let timeline: VideoTimeline | undefined;
        if (inputType.startsWith("video/")) {
          setPhase("extracting");
          setLocalProgress(0);
          const extracted = await extractVideoAudio(file, {
            preferM4a: capabilities.acceptedContentTypes.includes("audio/mp4"),
            maxDurationSeconds: quota.maxDurationSeconds,
            signal: controller.signal,
            onProgress: setLocalProgress,
          });
          upload = new File([extracted.buffer], extracted.filename, {
            type: extracted.contentType,
          });
          timeline = extracted.timeline;
          setPhase("hashing");
          const originalHash = await hashFile(file, controller.signal);
          updateVideoContext({
            filename: file.name,
            sizeBytes: file.size,
            sha256: originalHash,
            timeline,
          });
        }
        const contentType = validateFile(
          upload,
          "audio",
          Math.min(quota.maxFileBytes, capabilities.maxFileBytes),
        );
        if (!capabilities.acceptedContentTypes.includes(contentType))
          throw new Error(
            "The service does not currently support this file format.",
          );
        setPhase("hashing");
        if (!timeline) {
          const duration = await probeAudioDuration(upload, {
            signal: controller.signal,
          });
          if (Math.ceil(duration.durationSeconds) > quota.maxDurationSeconds)
            throw new Error(
              `Choose a recording up to ${quota.maxDurationSeconds} seconds, or sign in for a longer recording.`,
            );
        }
        const sha256 = demo
          ? "0".repeat(64)
          : await hashFile(upload, controller.signal);
        const ticket = await api.createUpload(
          {
            filename: upload.name,
            sizeBytes: upload.size,
            contentType,
            sha256,
          },
          controller.signal,
        );
        setPhase("uploading");
        setUploadProgress(0);
        await api.uploadFile(
          ticket,
          upload,
          setUploadProgress,
          controller.signal,
        );
        const media = await api.completeUpload(ticket.id, controller.signal);
        const requiredSeconds = Math.ceil(
          Math.max(media.durationSeconds, timeline?.durationSeconds || 0),
        );
        if (requiredSeconds > quota.maxDurationSeconds)
          throw new Error(
            `Choose a recording up to ${quota.maxDurationSeconds} seconds, or sign in for a longer recording.`,
          );
        const consentUploads: { speaker: number; uploadId: string }[] = [];
        if (!demo && voiceMode === "clone" && consentRequired) {
          for (const [speaker, consent] of consentFiles.entries()) {
            const consentType = validateFile(consent!, "audio", 2_000_000);
            const consentHash = await hashFile(consent!, controller.signal);
            const consentTicket = await api.createUpload(
              {
                filename: consent!.name,
                sizeBytes: consent!.size,
                contentType: consentType,
                sha256: consentHash,
              },
              controller.signal,
            );
            await api.uploadFile(
              consentTicket,
              consent!,
              setUploadProgress,
              controller.signal,
            );
            await api.completeUpload(consentTicket.id, controller.signal);
            consentUploads.push({ speaker, uploadId: consentTicket.id });
          }
        }
        const input = {
          uploadId: media.id,
          sourceLanguage: source,
          targetLanguage: target,
          voiceTier: quota.voiceTier,
          ...(!demo && voiceMode === "clone"
            ? { voiceMode, ...(consentRequired ? { consentUploads } : {}) }
            : {}),
          ...(timeline ? { timeline } : {}),
        };
        const quote = await api.quoteJob(input, controller.signal);
        request = {
          input: { ...input, quoteId: quote.id },
          key: crypto.randomUUID(),
        };
        setPending(request);
        sessionStorage.setItem(pendingKey, JSON.stringify(request));
      }
      setPhase("creating");
      const created = await api.createJob(
        request.input,
        request.key,
        controller.signal,
      );
      updateJob(created);
      if (videoContextRef.current)
        updateVideoContext({ ...videoContextRef.current, jobId: created.id });
      sessionStorage.removeItem(pendingKey);
      setPending(null);
      request = null;
      await watchJob(created, controller.signal);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(errorMessage(err));
      if (
        err instanceof ApiError &&
        [
          "HUMAN_VERIFICATION_REQUIRED",
          "HUMAN_VERIFICATION_FAILED",
          "TRIAL_LIMIT_EXCEEDED",
          "INSUFFICIENT_CREDITS",
        ].includes(err.code)
      ) {
        setVerificationReset((value) => value + 1);
        try {
          setQuota(await getApi().getQuota());
        } catch {}
      }
      if (
        request &&
        err instanceof ApiError &&
        !err.retryable &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 401 &&
        err.status !== 429
      ) {
        setPending(null);
        sessionStorage.removeItem(pendingKey);
        request = null;
      }
      setRecoverable(
        (!!jobRef.current && !terminal(jobRef.current)) ||
          !!sessionStorage.getItem(activeKey) ||
          !!request,
      );
      setPhase("idle");
    }
  }
  async function cancel() {
    const current = jobRef.current;
    if (current && !terminal(current)) {
      try {
        const cancelled = await getApi().cancelJob(current.id);
        controllerRef.current?.abort();
        updateJob(cancelled);
        setQuota(await getApi().getQuota());
        setPhase("idle");
        setRecoverable(false);
        setError("");
      } catch (err) {
        setError(errorMessage(err));
      }
    } else if (
      phase === "hashing" ||
      phase === "uploading" ||
      phase === "extracting" ||
      phase === "merging"
    ) {
      controllerRef.current?.abort();
      setPhase("idle");
    }
  }
  function reset() {
    setFile(null);
    setJob(null);
    jobRef.current = null;
    setError("");
    setRecoverable(false);
    originalVideoRef.current = null;
    updateVideoContext(null);
    setLocalVideo(null);
    sessionStorage.removeItem(activeKey);
    sessionStorage.removeItem(completedKey);
    if (new URLSearchParams(window.location.search).has("job")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("job");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
    if (inputRef.current) inputRef.current.value = "";
  }
  async function retryLocalMerge() {
    if (!jobRef.current || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError("");
    try {
      await finishLocalVideo(jobRef.current, controller.signal);
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError"))
        setError(errorMessage(err));
    } finally {
      setPhase("idle");
    }
  }
  async function restoreOriginal(next: File) {
    if (!videoContextRef.current || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("hashing");
    setError("");
    try {
      validateFile(next, "video");
      if (
        next.size !== videoContextRef.current.sizeBytes ||
        (await hashFile(next, controller.signal)) !==
          videoContextRef.current.sha256
      )
        throw new Error(
          "This is not the original video for this task. Please select the same original file.",
        );
      originalVideoRef.current = next;
      setFile(next);
      if (jobRef.current)
        await finishLocalVideo(jobRef.current, controller.signal);
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError"))
        setError(errorMessage(err));
    } finally {
      setPhase("idle");
    }
  }
  async function refreshResult() {
    if (!jobRef.current) return;
    setRefreshingResult(true);
    setError("");
    try {
      updateJob(await getApi().getJob(jobRef.current.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshingResult(false);
    }
  }
  const result =
    job?.status === "completed" &&
    (!videoContext || localVideo || (!busy && !initializing))
      ? job.result
      : null;
  const format =
    kind === "video"
      ? "MP4, MOV"
      : kind === "audio"
        ? "MP3, WAV, M4A"
        : "MP4, MOV, MP3, WAV, M4A";
  const accept =
    kind === "video"
      ? ".mp4,.mov"
      : kind === "audio"
        ? ".mp3,.wav,.m4a"
        : ".mp4,.mov,.mp3,.wav,.m4a";
  return (
    <div className="tool-wrap" id="dubbing-tool">
      <div className="tool-card">
        <div className="tool-card-heading">
          <span>
            <span className="live-dot" />{" "}
            {result
              ? "Your new voice is ready"
              : "Let’s give your story a new voice"}
          </span>
          <span className="tool-free">
            {demo ? "Interactive demo" : "Free to start"}
          </span>
        </div>
        {result ? (
          <div className="result-panel">
            <span className="success-icon">
              <CheckCircle2 size={28} />
            </span>
            <h2>
              {result.isDemo
                ? "Meet your sample result."
                : "Ready for a new audience."}
            </h2>
            <p>
              {result.isDemo
                ? videoContext
                  ? "This video uses a fixed Spanish audio sample. Your selected file has not been translated."
                  : "This English → Spanish sample demonstrates the result player. Your selected file has not been translated."
                : `${result.speakerCount} ${result.speakerCount === 1 ? "speaker" : "speakers"} · ${Math.ceil(result.durationSeconds / 60)} min · ${result.targetLanguage.toUpperCase()}`}
            </p>
            {localVideo ? (
              <video
                className="result-video"
                controls
                preload="metadata"
                src={localVideo.url}
                aria-label="Dubbed video preview"
                onError={() =>
                  setError(
                    "The preview could not be loaded. Refresh its links and try again.",
                  )
                }
              />
            ) : (
              <audio
                controls
                preload="metadata"
                src={result.preview.url}
                aria-label="Dubbed audio preview"
                onError={() =>
                  setError(
                    "The preview could not be loaded. Refresh its links and try again.",
                  )
                }
              />
            )}
            <div className="result-actions">
              <a
                className="button button-dark"
                href={localVideo?.url || result.download.url}
                download={localVideo?.filename || result.download.filename}
              >
                <Download size={17} />
                {localVideo
                  ? "Download video"
                  : result.isDemo
                    ? "Download sample"
                    : "Download recording"}
              </a>
              <button
                className="button button-light"
                onClick={reset}
                disabled={busy}
              >
                <RefreshCw size={16} />
                Dub another
              </button>
              {!result.isDemo && (
                <button
                  className="button button-light"
                  onClick={() => void refreshResult()}
                  disabled={refreshingResult || busy}
                >
                  <RefreshCw size={16} />
                  Refresh links
                </button>
              )}
              {localVideo && (
                <a
                  className="button button-light"
                  href={result.download.url}
                  download={result.download.filename}
                >
                  <FileAudio2 size={16} />
                  Download audio
                </a>
              )}
            </div>
            {videoContext && !localVideo && (
              <div className="video-recovery">
                {busy ? (
                  <div role="status">
                    <Loader2 size={16} className="spin" />
                    Preparing your video…
                    <button
                      className="button button-light"
                      onClick={() => void cancel()}
                    >
                      Cancel
                    </button>
                  </div>
                ) : originalVideoRef.current ? (
                  <button
                    className="button button-light"
                    onClick={() => void retryLocalMerge()}
                  >
                    <Film size={16} />
                    Retry video download
                  </button>
                ) : (
                  <>
                    <p>
                      To download your video after refreshing, select{" "}
                      <strong>{videoContext.filename}</strong> again. Your
                      dubbing task is saved; you won’t be charged again.
                    </p>
                    <input
                      type="file"
                      accept=".mp4,.mov"
                      aria-label="Reselect original video"
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void restoreOriginal(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
              </div>
            )}
            {!result.isDemo && result.download.expiresAt && (
              <small>
                Download link expires{" "}
                {new Date(result.download.expiresAt).toLocaleString()}.
              </small>
            )}
          </div>
        ) : (
          <>
            <div className="tool-body">
              <div className="upload-column">
                <input
                  ref={inputRef}
                  id="recording-file"
                  className="sr-only"
                  type="file"
                  accept={accept}
                  disabled={busy || !!pending || recoverable}
                  onChange={(event) => {
                    const next = event.target.files?.[0];
                    if (next) chooseFile(next);
                    event.target.value = "";
                  }}
                />
                <div
                  className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const next = event.dataTransfer.files[0];
                    if (next) chooseFile(next);
                  }}
                >
                  <div className="upload-art">
                    <span className="upload-art-back">
                      <AudioLines size={24} />
                    </span>
                    <span className="upload-art-front">
                      {file ? <Check size={27} /> : <Upload size={27} />}
                    </span>
                  </div>
                  <strong>
                    {file
                      ? file.name
                      : `Drop your ${kind === "audio" ? "audio" : kind === "video" ? "video" : "video or audio"} here`}
                  </strong>
                  <span className="dropzone-meta">
                    {file
                      ? `${(file.size / 1_000_000).toFixed(1)} MB · Ready to ${demo ? "preview" : "dub"}`
                      : `${format} · Up to ${Math.round((quota?.maxFileBytes || 500_000_000) / 1_000_000)} MB`}
                  </span>
                  <button
                    className="choose-button"
                    disabled={busy || !!pending || recoverable}
                    onClick={() => inputRef.current?.click()}
                  >
                    {file ? "Choose another file" : "Choose a file"}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <span className="file-security">
                  <LockKeyhole size={12} />
                  {demo
                    ? "Your files stay on this device"
                    : "Private upload. Secure download."}
                </span>
              </div>
              <div className="settings-column">
                <label className="field-label" htmlFor="source-language">
                  Original language
                </label>
                <div className="select-wrap">
                  <AudioLines size={16} />
                  <select
                    id="source-language"
                    value={source}
                    disabled={busy || !!pending || recoverable}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="auto">Auto-detect language</option>
                    {capabilities?.languages
                      .filter((l) => l.supportsSource)
                      .map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
                <label
                  className="field-label target-label"
                  htmlFor="target-language"
                >
                  Dub into
                </label>
                <div className="select-wrap">
                  <Globe2 size={16} />
                  <select
                    id="target-language"
                    value={target}
                    disabled={busy || !!pending || recoverable || !capabilities}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {capabilities ? (
                      capabilities.languages
                        .filter((l) => l.supportsTarget)
                        .map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))
                    ) : (
                      <option value={target}>Loading languages…</option>
                    )}
                  </select>
                  <ChevronDown size={14} />
                </div>
                {!demo && (
                  <>
                    <label
                      className="field-label target-label"
                      htmlFor="voice-mode"
                    >
                      Voice
                    </label>
                    <div className="select-wrap">
                      <AudioLines size={16} />
                      <select
                        id="voice-mode"
                        value={voiceMode}
                        disabled={busy || !!pending || recoverable}
                        onChange={(e) =>
                          setVoiceMode(e.target.value as VoiceMode)
                        }
                      >
                        <option value="preset">Preset voices</option>
                        <option
                          value="clone"
                          disabled={
                            capabilities?.voiceCloning?.enabled === false
                          }
                        >
                          {capabilities?.voiceCloning?.singleVoiceTest
                            ? "Clone voice (saved test voice)"
                            : "Clone original voices (preview)"}
                        </option>
                      </select>
                      <ChevronDown size={14} />
                    </div>
                    {voiceMode === "clone" &&
                      capabilities?.voiceCloning?.singleVoiceTest && (
                        <p className="clone-consents">
                          Testing with one saved voice. The first voice is saved
                          and reused for later tests. Choose a single-speaker
                          recording.
                        </p>
                      )}
                    {capabilities?.maxSpeakers === 1 &&
                      !capabilities?.voiceCloning?.singleVoiceTest && (
                        <p className="clone-consents">
                          For this release, choose a clear recording with one
                          speaker. Background music is replaced by the new voice
                          track.
                        </p>
                      )}
                    {voiceMode === "clone" &&
                      !capabilities?.voiceCloning?.singleVoiceTest &&
                      !consentRequired && (
                        <p className="clone-consents">
                          Include a clear 10–30 second passage of the original
                          speaker for voice cloning.
                        </p>
                      )}
                    {voiceMode === "clone" && consentRequired && (
                      <div className="clone-consents">
                        <p>
                          Each original speaker must record their consent. List
                          speakers in the order they first speak.
                        </p>
                        <details>
                          <summary>What to record</summary>
                          <p>
                            Record the following statement in your own voice, in
                            English or Chinese. MP3 or WAV, up to 30 seconds and
                            2 MB.
                          </p>
                          <blockquote>
                            I am the owner of this voice and I consent to Google
                            using this voice to create a synthetic voice model.
                          </blockquote>
                          <blockquote>
                            我是此声音的拥有者并授权谷歌使用此声音创建语音合成模型
                          </blockquote>
                        </details>
                        {consentFiles.map((consent, speaker) => (
                          <label key={speaker} className="consent-file-label">
                            Speaker {speaker + 1} consent
                            {consent ? ` · ${consent.name}` : ""}
                            <input
                              type="file"
                              accept=".wav,.mp3"
                              disabled={busy || !!pending || recoverable}
                              onChange={(e) => {
                                const next = e.target.files?.[0] || null;
                                setConsentFiles((files) =>
                                  files.map((f, i) =>
                                    i === speaker ? next : f,
                                  ),
                                );
                              }}
                            />
                          </label>
                        ))}
                        <div className="consent-actions">
                          <button
                            type="button"
                            disabled={
                              busy ||
                              !!pending ||
                              recoverable ||
                              consentFiles.length >= 8
                            }
                            onClick={() =>
                              setConsentFiles((files) => [...files, null])
                            }
                          >
                            Add speaker
                          </button>
                          {consentFiles.length > 1 && (
                            <button
                              type="button"
                              disabled={busy || !!pending || recoverable}
                              onClick={() =>
                                setConsentFiles((files) => files.slice(0, -1))
                              }
                            >
                              Remove last speaker
                            </button>
                          )}
                        </div>
                        <p>
                          We choose a clean 10–30 second passage from your
                          recording for each voice. Recordings with too little
                          clear speech cannot be cloned.
                        </p>
                      </div>
                    )}
                  </>
                )}
                <button
                  className="dub-button"
                  disabled={
                    !file ||
                    busy ||
                    initializing ||
                    !quota ||
                    !capabilities ||
                    recoverable ||
                    !!pending ||
                    (!demo &&
                      voiceMode === "clone" &&
                      consentRequired &&
                      consentFiles.some((f) => !f)) ||
                    (quota.kind === "guest"
                      ? !trialVerified
                      : quota.availableCredits <
                        (account.policy?.minimumCredits || 1))
                  }
                  onClick={() => void submit()}
                >
                  {busy ? (
                    <>
                      <Loader2 size={17} className="spin" />
                      {phase === "hashing"
                        ? "Preparing your file"
                        : phase === "extracting"
                          ? "Preparing your file"
                          : phase === "merging"
                            ? "Finishing your video"
                            : phase === "uploading"
                              ? `Uploading ${uploadProgress}%`
                              : phase === "creating"
                                ? "Starting your dub"
                                : "Dubbing in progress"}
                    </>
                  ) : (
                    <>
                      <Sparkles size={17} />
                      Dub {kind === "audio" ? "Audio" : "Video"}
                      {quota?.kind === "guest" ? " Free" : ""}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <span className="allowance">
                  {quota ? (
                    <>
                      <span className="allowance-dot" />
                      {quota.kind === "guest"
                        ? `${quota.trial?.maxDurationSeconds || 30}s free trial · ${quota.trial?.remainingUses || 0} ${quota.trial?.remainingUses === 1 ? "try" : "tries"} left`
                        : `${quota.availableCredits} credits available${quota.reservedCredits ? ` · ${quota.reservedCredits} reserved` : ""}`}
                    </>
                  ) : initializing ? (
                    "Loading your allowance…"
                  ) : (
                    "Allowance unavailable"
                  )}
                </span>
              </div>
            </div>
            {busy && (
              <div className="processing" role="status" aria-live="polite">
                <div>
                  <span>
                    {phase === "processing" && job
                      ? labels[job.status]
                      : phase === "hashing"
                        ? "Preparing your recording"
                        : phase === "extracting"
                          ? "Preparing your recording"
                          : phase === "merging"
                            ? "Finishing your video"
                            : phase === "creating"
                              ? "Starting your task"
                              : "Uploading your recording"}
                  </span>
                  {(phase === "hashing" ||
                    phase === "extracting" ||
                    phase === "uploading" ||
                    phase === "processing" ||
                    phase === "merging") && (
                    <button onClick={() => void cancel()}>
                      <X size={14} />
                      Cancel
                    </button>
                  )}
                </div>
                <progress
                  value={
                    phase === "extracting" || phase === "merging"
                      ? localProgress
                      : phase === "uploading"
                        ? uploadProgress
                        : job?.progress || 0
                  }
                  max={100}
                  aria-label="Dubbing progress"
                />
              </div>
            )}
            {quota?.kind === "guest" &&
              !!quota.trial?.remainingUses &&
              !trialVerified &&
              !busy &&
              !pending &&
              !recoverable && (
                <div className="trial-verification">
                  <p>
                    Verify to unlock your {quota.trial.maxDurationSeconds}
                    -second free trial.
                  </p>
                  <HumanVerification
                    action="guest_trial"
                    onToken={setHumanToken}
                    resetKey={verificationReset}
                    disabled={verifying}
                  />
                  <button
                    className="button button-light"
                    disabled={!humanToken || verifying}
                    onClick={() => void verifyTrial()}
                  >
                    {verifying ? "Verifying…" : "Unlock free trial"}
                  </button>
                </div>
              )}
            {quota?.kind === "user" && account.policy && (
              <p className="credit-rate">
                {account.policy.creditsPerMinute[quota.voiceTier]} credits /
                minute ·{" "}
                {account.policy.rounding === "per_second"
                  ? "billed by the second"
                  : "per started minute"}
                . Failed or cancelled jobs return their credits.
              </p>
            )}
            <div className="tool-bottom">
              <span>
                <CheckCircle2 size={14} />
                {quota?.kind === "user"
                  ? "Your credits, your stories"
                  : "No sign-up required"}
                <span className="bottom-dot">·</span>Every speaker
              </span>
              <button
                onClick={() => void useSample()}
                disabled={busy || !!pending || recoverable}
              >
                Try a sample
                <ArrowRight size={13} />
              </button>
            </div>
          </>
        )}
        {!result &&
          quota &&
          (quota.kind === "guest"
            ? quota.trial?.remainingUses === 0
            : quota.availableCredits <
              (account.policy?.minimumCredits || 1)) && (
            <div className="quota-upgrade">
              <span>
                {quota.kind === "guest"
                  ? "Your free trial is used. Create an account for free credits."
                  : "You need more credits for your next dub."}
              </span>
              <Link href={quota.kind === "guest" ? "/register" : "/pricing"}>
                {quota.kind === "guest" ? "Create account" : "Explore credits"}{" "}
                <ArrowUpRight size={13} />
              </Link>
            </div>
          )}
        {error && (
          <div className="tool-error" role="alert">
            <p>{error}</p>
            {recoverable ? (
              <button onClick={() => void submit(true)} disabled={busy}>
                Resume / check status <RefreshCw size={13} />
              </button>
            ) : !capabilities || !quota ? (
              <button onClick={() => window.location.reload()}>
                Reconnect <RefreshCw size={13} />
              </button>
            ) : !result ? (
              <Link href={quota.kind === "guest" ? "/register" : "/pricing"}>
                {quota.kind === "guest" ? "Create account" : "Explore credits"}{" "}
                <ArrowUpRight size={13} />
              </Link>
            ) : null}
          </div>
        )}
      </div>
      <div className="tool-caption">
        {demo ? (
          <>
            <span className="demo-dot" />
            Demo preview · No files are uploaded or translated. Results use a
            fixed Spanish sample.
          </>
        ) : (
          <>
            <Film size={13} />
            <FileAudio2 size={13} />
            Preview your dub here, then download and share it.
          </>
        )}
      </div>
    </div>
  );
}
