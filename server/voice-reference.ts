import type { Segment } from "./providers/google";
import { requireValue } from "./errors";

export interface ReferenceCandidate {
  speaker: number;
  start: number;
  end: number;
  score: number;
  activeRatio: number;
  clippedRatio: number;
  rmsDb: number;
  longestSilenceSeconds: number;
}
export interface ReferenceScan {
  candidates: ReferenceCandidate[];
  rejected: Record<string, number>;
}
// Read RIFF chunks instead of assuming FFmpeg always writes a 44-byte header.
export function wavPcm(wav: Buffer) {
  requireValue(
    wav.toString("ascii", 0, 4) === "RIFF" &&
      wav.toString("ascii", 8, 12) === "WAVE",
    "PROCESSING_FAILED",
    "Invalid reference WAV.",
    502,
  );
  let valid = false;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const name = wav.toString("ascii", offset, offset + 4),
      size = wav.readUInt32LE(offset + 4);
    const begin = offset + 8;
    requireValue(
      begin + size <= wav.length,
      "PROCESSING_FAILED",
      "Truncated reference WAV.",
      502,
    );
    if (name === "fmt " && size >= 16)
      valid =
        wav.readUInt16LE(begin) === 1 &&
        wav.readUInt16LE(begin + 2) === 1 &&
        wav.readUInt32LE(begin + 4) === 24000 &&
        wav.readUInt16LE(begin + 14) === 16;
    if (name === "data") {
      requireValue(
        valid && size % 2 === 0,
        "PROCESSING_FAILED",
        "Use 24 kHz mono 16-bit reference audio.",
        502,
      );
      return wav.subarray(begin, begin + size);
    }
    offset = begin + size + (size % 2);
  }
  throw new Error("Reference WAV has no PCM data.");
}

/** Rank complete contiguous turns, never concatenate different speakers or crop mid-sentence. */
export function scanReferences(
  wav: Buffer,
  segments: Segment[],
  offset = 0,
): ReferenceScan {
  const pcm = wavPcm(wav),
    frameSamples = 480;
  const frames: {
    energy: number;
    count: number;
    clips: number;
    active: boolean;
  }[] = [];
  for (let begin = 0; begin < pcm.length / 2; begin += frameSamples) {
    let energy = 0,
      clips = 0;
    const count = Math.min(frameSamples, pcm.length / 2 - begin);
    for (let i = 0; i < count; i++) {
      const v = pcm.readInt16LE((begin + i) * 2) / 32768;
      energy += v * v;
      if (Math.abs(v) >= 0.999) clips++;
    }
    frames.push({
      energy,
      clips,
      count,
      active: energy / count >= 10 ** (-45 / 10),
    });
  }
  const candidates: ReferenceCandidate[] = [],
    rejected: Record<string, number> = {};
  const reject = (reason: string) => {
    rejected[reason] = (rejected[reason] || 0) + 1;
  };
  for (let i = 0; i < segments.length; i++) {
    const first = segments[i];
    for (let j = i; j < segments.length; j++) {
      const last = segments[j],
        previous = segments[j - 1];
      if (
        last.speaker !== first.speaker ||
        (j > i &&
          (last.start - previous.end > 0.35 ||
            last.start < previous.end - 0.03))
      )
        break;
      const quality = last.referenceQuality;
      if (
        !quality?.cleanSpeech ||
        !quality.naturalDelivery ||
        quality.overlappingSpeech
      ) {
        reject("unclean_or_unnatural_or_unverified");
        break;
      }
      const duration = last.end - first.start;
      if (duration > 30) break;
      if (duration < 10) {
        reject("too_short");
        continue;
      }
      const selection = frames.slice(
        Math.floor(first.start / 0.02),
        Math.ceil(last.end / 0.02),
      );
      if (!selection.length) continue;
      let energy = 0,
        samples = 0,
        clips = 0,
        active = 0,
        silence = 0,
        longest = 0;
      for (const f of selection) {
        energy += f.energy;
        samples += f.count;
        clips += f.clips;
        if (f.active) {
          active++;
          silence = 0;
        } else {
          silence++;
          longest = Math.max(longest, silence);
        }
      }
      const activeRatio = active / selection.length,
        clippedRatio = clips / samples;
      const rmsDb = 10 * Math.log10(Math.max(1e-12, energy / samples));
      if (clippedRatio > 0.002) {
        reject("clipping");
        continue;
      }
      if (activeRatio < 0.65 || longest * 0.02 > 0.9) {
        reject("silence");
        continue;
      }
      if (rmsDb < -35 || rmsDb > -8) {
        reject("level");
        continue;
      }
      const text = segments
        .slice(i, j + 1)
        .map((s) => s.text)
        .join(" ");
      const letters = text.match(/[\p{L}\p{N}]/gu) || [];
      if (letters.length < 15) {
        reject("insufficient_speech");
        continue;
      }
      const variety =
        new Set(letters.map((c) => c.toLowerCase())).size /
        Math.max(1, letters.length);
      const score =
        55 * activeRatio +
        20 * (1 - Math.abs(duration - 20) / 20) +
        10 * (1 - Math.min(1, Math.abs(rmsDb + 20) / 20)) +
        10 * Math.min(1, variety * 3) +
        (/[.!?。！？]["'”’）)]?$/.test(last.text.trim()) ? 5 : 0);
      candidates.push({
        speaker: first.speaker,
        start: offset + first.start,
        end: offset + last.end,
        score,
        activeRatio,
        clippedRatio,
        rmsDb,
        longestSilenceSeconds: longest * 0.02,
      });
    }
  }
  return { candidates: rankReferences(candidates), rejected };
}
export function rankReferences(candidates: ReferenceCandidate[], limit = 3) {
  const selected: ReferenceCandidate[] = [];
  for (const c of [...candidates].sort(
    (a, b) => b.score - a.score || a.start - b.start,
  )) {
    const same = selected.filter((s) => s.speaker === c.speaker);
    if (
      same.length >= limit ||
      same.some((s) => c.start < s.end && c.end > s.start)
    )
      continue;
    selected.push(c);
  }
  return selected;
}
