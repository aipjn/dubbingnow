// Imported by the media worker, never by the first-screen rendering code.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  WavOutputFormat,
  canEncodeAudio,
} from "mediabunny";
import type { ExtractedAudio, MergedVideo } from "./local-media-types";

const makeInput = (blob: Blob) =>
  new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
const basename = (name: string) => name.replace(/\.[^.]+$/, "");

export async function probeAudio(audio: Blob) {
  const input = makeInput(audio);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("This recording has no readable audio track.");
    const durationSeconds =
      (await track.computeDuration()) -
      Math.max(0, await track.getFirstTimestamp());
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
      throw new Error("This recording has no usable duration.");
    return { durationSeconds };
  } finally {
    input.dispose();
  }
}

export async function extractAudio(
  video: File,
  preferM4a: boolean,
  onProgress: (progress: number) => void,
  maxDurationSeconds?: number,
): Promise<ExtractedAudio> {
  const input = makeInput(video);
  let output: Output | undefined;
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!videoTrack)
      throw new Error(
        "This file has no readable video track. Choose an MP4 or MOV video.",
      );
    if (!audioTrack)
      throw new Error(
        "This video has no audio track. Choose a video with recorded speech.",
      );
    const videoOrigin = Math.max(0, await videoTrack.getFirstTimestamp());
    const videoEnd = await videoTrack.computeDuration();
    const durationSeconds = videoEnd - videoOrigin;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
      throw new Error("The video has no usable duration.");
    if (maxDurationSeconds && durationSeconds > maxDurationSeconds)
      throw new Error(
        `This video exceeds your ${maxDurationSeconds}-second limit. Choose a shorter recording or sign in for a longer recording.`,
      );
    const audioOrigin = Math.max(0, await audioTrack.getFirstTimestamp());
    const timeline = {
      durationSeconds,
      audioOffsetSeconds: Math.max(0, audioOrigin - videoOrigin),
    };
    if (timeline.audioOffsetSeconds >= durationSeconds)
      throw new Error("The audio track starts after this video ends.");
    const target = new BufferTarget();
    const codec = await audioTrack.getCodec();
    if (preferM4a && codec === "aac" && audioOrigin >= videoOrigin) {
      output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target,
      });
      const source = new EncodedAudioPacketSource("aac");
      output.addAudioTrack(source);
      const config = await audioTrack.getDecoderConfig();
      if (!config)
        throw new Error("The audio track is missing its codec configuration.");
      await output.start();
      for await (const packet of new EncodedPacketSink(audioTrack).packets()) {
        if (packet.timestamp >= videoEnd) break;
        await source.add(
          packet.clone({ timestamp: packet.timestamp - audioOrigin }),
          { decoderConfig: config },
        );
        onProgress(
          Math.min(
            99,
            Math.max(
              0,
              ((packet.timestamp - audioOrigin) / durationSeconds) * 100,
            ),
          ),
        );
      }
      source.close();
      await output.finalize();
      if (!target.buffer) throw new Error("No audio data could be extracted.");
      return {
        buffer: target.buffer,
        filename: `${basename(video.name)}-audio.m4a`,
        contentType: "audio/mp4",
        timeline,
        copied: true,
      };
    }
    if (!(await audioTrack.canDecode()))
      throw new Error(
        "This browser cannot decode this video’s audio codec. Try an MP4 with AAC audio.",
      );
    output = new Output({ format: new WavOutputFormat(), target });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: { discard: true },
      // Preserve the original bandwidth/channel layout in the WAV fallback.
      // The backend creates a mono recognition copy; cloning also evaluates it at 24 kHz.
      audio: {
        codec: "pcm-s16",
        sampleRate: Math.min(48000, await audioTrack.getSampleRate()),
        numberOfChannels: Math.min(2, await audioTrack.getNumberOfChannels()),
      },
      trim: { start: Math.max(audioOrigin, videoOrigin), end: videoEnd },
      showWarnings: false,
    });
    if (!conversion.isValid || !conversion.utilizedTracks.includes(audioTrack))
      throw new Error(
        "This browser cannot extract this audio format. Try an MP4 with AAC audio.",
      );
    conversion.onProgress = (progress) => onProgress(progress * 100);
    await conversion.execute();
    if (!target.buffer) throw new Error("No audio data could be extracted.");
    return {
      buffer: target.buffer,
      filename: `${basename(video.name)}-audio.wav`,
      contentType: "audio/wav",
      timeline,
      copied: false,
    };
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally {
    input.dispose();
  }
}

export async function mergeAudio(
  video: File,
  audio: Blob,
  enforceAlignment: boolean,
  onProgress: (progress: number) => void,
): Promise<MergedVideo> {
  const videoInput = makeInput(video);
  const audioInput = makeInput(audio);
  let output: Output | undefined;
  try {
    const videoTrack = await videoInput.getPrimaryVideoTrack();
    const audioTrack = await audioInput.getPrimaryAudioTrack();
    if (!videoTrack) throw new Error("This file has no readable video track.");
    if (!audioTrack)
      throw new Error("The replacement file has no readable audio track.");
    const videoOrigin = Math.max(0, await videoTrack.getFirstTimestamp());
    const durationSeconds = (await videoTrack.computeDuration()) - videoOrigin;
    const audioDuration =
      (await audioTrack.computeDuration()) -
      Math.max(0, await audioTrack.getFirstTimestamp());
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
      throw new Error("The video has no usable duration.");
    if (enforceAlignment && Math.abs(audioDuration - durationSeconds) > 0.25)
      throw new Error(
        "Your video could not be prepared because the audio timing is incorrect. You can still download the audio.",
      );
    const codec = await videoTrack.getCodec();
    const format = new Mp4OutputFormat({ fastStart: "in-memory" });
    if (!codec || !format.getSupportedVideoCodecs().includes(codec))
      throw new Error(
        "This video codec cannot be copied into MP4. Please use an MP4 or MOV with H.264 or HEVC video.",
      );
    const config = await videoTrack.getDecoderConfig();
    if (!config)
      throw new Error("The video track is missing its codec configuration.");
    if (
      (await audioTrack.getCodec()) !== "aac" &&
      !(await canEncodeAudio("aac"))
    ) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }
    const target = new BufferTarget();
    output = new Output({ format, target });
    const source = new EncodedVideoPacketSource(codec);
    output.addVideoTrack(source, {
      transformationMatrix: await videoTrack.getTransformationMatrix(),
      decoderConfig: config,
    });
    const audioConversion = await Conversion.init({
      input: audioInput,
      output,
      tracks: "primary",
      composable: true,
      video: { discard: true },
      audio: { codec: "aac" },
      trim: { end: durationSeconds },
      showWarnings: false,
    });
    if (
      !audioConversion.isValid ||
      !audioConversion.utilizedTracks.includes(audioTrack)
    )
      throw new Error(
        "This browser cannot process the replacement audio. Try WAV or AAC/M4A.",
      );
    let videoProgress = 0;
    let audioProgress = 0;
    const report = () =>
      onProgress(Math.min(99, (videoProgress + audioProgress) / 2));
    audioConversion.onProgress = (progress) => {
      audioProgress = progress * 100;
      report();
    };
    await output.start();
    await Promise.all([
      (async () => {
        for await (const packet of new EncodedPacketSink(
          videoTrack,
        ).packets()) {
          await source.add(
            packet.clone({ timestamp: packet.timestamp - videoOrigin }),
            { decoderConfig: config },
          );
          videoProgress = Math.max(
            videoProgress,
            Math.min(
              100,
              ((packet.timestamp - videoOrigin + packet.duration) /
                durationSeconds) *
                100,
            ),
          );
          report();
        }
        source.close();
        videoProgress = 100;
        report();
      })(),
      audioConversion.execute(),
    ]);
    await output.finalize();
    if (!target.buffer)
      throw new Error("The combined video could not be created.");
    return {
      buffer: target.buffer,
      filename: `${basename(video.name)}-dubbed.mp4`,
      contentType: "video/mp4",
      durationSeconds,
      videoCopied: true,
    };
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally {
    videoInput.dispose();
    audioInput.dispose();
  }
}
