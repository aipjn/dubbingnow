import { createHash } from "node:crypto";
import { z } from "zod";
import { languages } from "../lib/catalog";
const codes = new Set<string>(languages.map((l) => l.code));
const language = z.string().refine((s) => codes.has(s), "Unsupported language");
const tier = z.enum(["standard", "high_fidelity"]);
const consent = z
  .object({
    speaker: z.number().int().min(0).max(7),
    uploadId: z.string().uuid(),
  })
  .strict();
function validVoice(r: {
  voiceMode?: string;
  consentUploads?: { speaker: number; uploadId: string }[];
  uploadId: string;
}) {
  const uploads = r.consentUploads || [];
  return r.voiceMode === "clone"
    ? new Set(uploads.map((c) => c.speaker)).size === uploads.length &&
        new Set(uploads.map((c) => c.uploadId)).size === uploads.length &&
        uploads.every((c) => c.uploadId !== r.uploadId)
    : uploads.length === 0;
}
export const emptyBody = z.object({}).strict();
export const humanBody = z
  .object({ token: z.string().min(1).max(2048) })
  .strict();
export const profileBody = z
  .object({ displayName: z.string().trim().min(1).max(80) })
  .strict();
export const statusBody = z
  .object({ status: z.enum(["active", "suspended"]) })
  .strict();
export const adjustmentBody = z
  .object({
    deltaCredits: z
      .number()
      .int()
      .refine((n) => Number.isSafeInteger(n) && n !== 0),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const uploadBody = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.enum(["audio/mp4", "audio/mpeg", "audio/wav"]),
    sizeBytes: z.number().int().positive().max(500000000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const timelineBody = z
  .object({
    durationSeconds: z.number().positive().max(7200),
    audioOffsetSeconds: z.number().nonnegative().max(7200),
  })
  .strict()
  .refine((t) => t.audioOffsetSeconds < t.durationSeconds);
export const quoteBody = z
  .object({
    uploadId: z.string().uuid(),
    sourceLanguage: z.string().refine((s) => s === "auto" || codes.has(s)),
    targetLanguage: language,
    voiceTier: tier,
    voiceMode: z.enum(["preset", "clone"]).optional(),
    consentUploads: z.array(consent).min(1).max(8).optional(),
    timeline: timelineBody.optional(),
  })
  .strict()
  .refine(
    validVoice,
    "Cloning requires a distinct consent upload for each speaker",
  )
  .refine(
    (r) => r.sourceLanguage !== r.targetLanguage,
    "Choose a different target language",
  );
export const jobBody = z
  .object({ ...quoteBody.shape, quoteId: z.string().uuid() })
  .strict()
  .refine(
    validVoice,
    "Cloning requires a distinct consent upload for each speaker",
  )
  .refine((r) => r.sourceLanguage !== r.targetLanguage);
export const policyBody = z
  .object({
    version: z.string().min(1).max(128),
    signupCredits: z.number().int().nonnegative(),
    guestTrialSeconds: z.number().int().positive().max(7200),
    guestTrialUses: z.number().int().positive(),
    creditsPerMinute: z
      .object({
        standard: z.number().int().positive(),
        high_fidelity: z.number().int().positive(),
      })
      .strict(),
    rounding: z.enum(["per_second", "per_minute"]),
    minimumCredits: z.number().int().positive(),
    maxDurationSeconds: z.number().int().positive().max(7200),
  })
  .strict();
export function canonical(input: unknown): string {
  return JSON.stringify(input, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
