import {
  extractAudio,
  mergeAudio,
  probeAudio,
} from "../lib/local-media-engine";
import type {
  MediaWorkerRequest,
  MediaWorkerResponse,
} from "../lib/local-media-types";

self.onmessage = async ({ data }: MessageEvent<MediaWorkerRequest>) => {
  const onProgress = (progress: number) =>
    self.postMessage({
      type: "progress",
      progress,
    } satisfies MediaWorkerResponse);
  try {
    const result =
      data.operation === "probe"
        ? await probeAudio(data.audio)
        : data.operation === "extract"
          ? await extractAudio(
              data.video,
              data.preferM4a,
              onProgress,
              data.maxDurationSeconds,
            )
          : await mergeAudio(
              data.video,
              data.audio,
              data.enforceAlignment,
              onProgress,
            );
    self.postMessage({ type: "result", result } satisfies MediaWorkerResponse, {
      transfer: "buffer" in result ? [result.buffer] : [],
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Local media processing failed. Try a smaller file.",
    } satisfies MediaWorkerResponse);
  }
};
