import { ApiError } from "./api/errors";

export type MediaKind = "all" | "video" | "audio";
export const mediaTypes: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};
export function validateFile(
  file: Pick<File, "name" | "size">,
  kind: MediaKind,
  maxBytes = 500_000_000,
) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const contentType = mediaTypes[ext];
  if (!contentType || (kind !== "all" && !contentType.startsWith(kind + "/")))
    throw new ApiError(
      "UNSUPPORTED_MEDIA",
      kind === "audio"
        ? "Choose an MP3 or WAV recording, or M4A audio."
        : kind === "video"
          ? "Choose an MP4 or MOV video."
          : "Choose an MP4, MOV, MP3, or WAV recording.",
    );
  if (file.size === 0)
    throw new ApiError(
      "INVALID_REQUEST",
      "This file is empty. Please choose another recording.",
    );
  if (file.size > maxBytes)
    throw new ApiError(
      "FILE_TOO_LARGE",
      `Choose a file smaller than ${Math.round(maxBytes / 1_000_000)} MB.`,
    );
  return contentType;
}
/** Hash off the UI thread. One full-file digest; it never leaves the browser except as the upload metadata. */
export async function hashFile(
  file: Blob,
  signal?: AbortSignal,
): Promise<string> {
  const worker = new Worker(
    new URL("../workers/hash.worker.ts", import.meta.url),
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
    worker.onmessage = ({
      data,
    }: MessageEvent<{ hash?: string; error?: string }>) => {
      cleanup();
      if (data.hash) resolve(data.hash);
      else
        reject(
          new ApiError(
            "INVALID_REQUEST",
            data.error || "Could not read this recording.",
          ),
        );
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new ApiError(
          "INVALID_REQUEST",
          "Could not read this recording. Try a smaller file.",
        ),
      );
    };
    worker.postMessage(file);
  });
}
