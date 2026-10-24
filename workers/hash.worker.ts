import { createSHA256 } from "hash-wasm";

self.onmessage = async ({ data }: MessageEvent<Blob>) => {
  try {
    const hasher = await createSHA256();
    hasher.init();
    for (let offset = 0; offset < data.size; offset += 4 * 1024 * 1024) {
      hasher.update(
        new Uint8Array(
          await data.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer(),
        ),
      );
    }
    self.postMessage({ hash: hasher.digest("hex") });
  } catch {
    self.postMessage({
      error: "Unable to read this recording. Try a smaller file.",
    });
  }
};
