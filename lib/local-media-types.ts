export interface VideoTimeline {
  /** Final audio starts at video time 0 and covers this duration. */
  durationSeconds: number;
  /** Add this leading silence before translated speech. */
  audioOffsetSeconds: number;
}
export interface ExtractedAudio {
  buffer: ArrayBuffer;
  filename: string;
  contentType: "audio/mp4" | "audio/wav";
  timeline: VideoTimeline;
  copied: boolean;
}
export interface MergedVideo {
  buffer: ArrayBuffer;
  filename: string;
  contentType: "video/mp4";
  durationSeconds: number;
  videoCopied: true;
}
export interface AudioDuration {
  durationSeconds: number;
}
export type MediaWorkerRequest =
  | { operation: "probe"; audio: Blob }
  | {
      operation: "extract";
      video: File;
      preferM4a: boolean;
      maxDurationSeconds?: number;
    }
  | { operation: "merge"; video: File; audio: Blob; enforceAlignment: boolean };
export type MediaWorkerResponse =
  | { type: "progress"; progress: number }
  | { type: "result"; result: ExtractedAudio | MergedVideo | AudioDuration }
  | { type: "error"; message: string };
