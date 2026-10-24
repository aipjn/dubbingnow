import type {
  ExtractedAudio,
  MediaWorkerRequest,
  MediaWorkerResponse,
  MergedVideo,
  AudioDuration,
} from "./local-media-types";

function runMediaWorker<T extends ExtractedAudio | MergedVideo | AudioDuration>(
  request: MediaWorkerRequest,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  const worker = new Worker(
    new URL("../workers/media.worker.ts", import.meta.url),
  );
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<MediaWorkerResponse>) => {
      if (data.type === "progress") {
        onProgress(Math.round(data.progress));
        return;
      }
      cleanup();
      if (data.type === "result") {
        onProgress(100);
        resolve(data.result as T);
      } else reject(new Error(data.message));
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Local media processing could not finish. Try a smaller MP4 with AAC audio, or another browser.",
        ),
      );
    };
    worker.postMessage(request);
  });
}
export function probeAudioDuration(
  audio: Blob,
  options: { signal?: AbortSignal } = {},
) {
  return runMediaWorker<AudioDuration>(
    { operation: "probe", audio },
    () => {},
    options.signal,
  );
}
export function extractVideoAudio(
  video: File,
  options: {
    preferM4a?: boolean;
    maxDurationSeconds?: number;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  } = {},
) {
  return runMediaWorker<ExtractedAudio>(
    {
      operation: "extract",
      video,
      preferM4a: options.preferM4a !== false,
      maxDurationSeconds: options.maxDurationSeconds,
    },
    options.onProgress || (() => {}),
    options.signal,
  );
}
export function mergeVideoAudio(
  video: File,
  audio: Blob,
  options: {
    enforceAlignment?: boolean;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  } = {},
) {
  return runMediaWorker<MergedVideo>(
    {
      operation: "merge",
      video,
      audio,
      enforceAlignment: options.enforceAlignment !== false,
    },
    options.onProgress || (() => {}),
    options.signal,
  );
}
