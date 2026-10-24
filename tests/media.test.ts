import test from "node:test";
import assert from "node:assert/strict";
import { validateFile } from "../lib/media";

test("media validation accepts supported extensions and enforces the selected tool", () => {
  assert.equal(
    validateFile({ name: "INTERVIEW.MOV", size: 15 }, "video"),
    "video/quicktime",
  );
  assert.equal(
    validateFile({ name: "lecture.wav", size: 15 }, "audio"),
    "audio/wav",
  );
  assert.throws(
    () => validateFile({ name: "video.mp4", size: 15 }, "audio"),
    /MP3 or WAV/,
  );
  assert.throws(
    () => validateFile({ name: "track.mp3", size: 15 }, "video"),
    /MP4 or MOV/,
  );
  assert.throws(
    () => validateFile({ name: "data.exe", size: 15 }, "all"),
    /MP4, MOV, MP3, or WAV/,
  );
});
test("media validation honors server size limits and rejects empty files", () => {
  assert.throws(
    () => validateFile({ name: "clip.mp4", size: 500_000_001 }, "all"),
    /500 MB/,
  );
  assert.equal(
    validateFile({ name: "clip.mp4", size: 500_000_000 }, "all"),
    "video/mp4",
  );
  assert.throws(
    () => validateFile({ name: "clip.mp4", size: 101 }, "all", 100),
    /smaller/,
  );
  assert.throws(
    () => validateFile({ name: "clip.mp4", size: 0 }, "all"),
    /empty/,
  );
});
