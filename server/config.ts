import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
export interface ServerConfig {
  persistence?: "local" | "cloudflare";
  cloudflareAccountId?: string;
  d1DatabaseId?: string;
  d1ApiToken?: string;
  r2Bucket?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  dataDir: string;
  origin: string;
  signingSecret: string;
  googleKey: string;
  textModel: string;
  standardTtsModel: string;
  fidelityTtsModel: string;
  ffmpeg: string;
  ffprobe: string;
  authIssuer: string;
  authAudience: string;
  adminSubjects: string[];
  turnstileSecret: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  guestIpUses: number;
  maxFileBytes: number;
  retentionMs: number;
  maxSegments: number;
  synthesisConcurrency?: number;
  combinedTextPipeline?: boolean;
  streamingTextPipeline?: boolean;
  cloneProvider?: "google" | "fish";
  fishKey?: string;
  fishModel?: string;
  fishVoiceId?: string;
  fishVoiceMode?: "inline" | "saved_test" | "per_job";
  fishAllowVoiceCreation?: boolean;
  maxDurationSeconds?: number;
  signupCreditsCap?: number;
  maxActiveJobs?: number;
  maxQueueWaitMs?: number;
  maxJobRunMs?: number;
  userDailySeconds?: number;
  globalDailySeconds?: number;
  dailyUploadBytes?: number;
  acceptingJobs?: boolean;
  requireWorker?: boolean;
  minFreeDiskBytes?: number;
  maxSpeakers?: number;
  globalDailyUploadBytes?: number;
}
function positiveEnv(
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(`Invalid ${name}.`);
  return value;
}
export function loadConfig(): ServerConfig {
  const persistence =
    process.env.PERSISTENCE_DRIVER ||
    (process.env.BACKEND_LOCAL === "true" ? "local" : "cloudflare");
  if (!["local", "cloudflare"].includes(persistence))
    throw new Error("Invalid PERSISTENCE_DRIVER.");
  if (process.env.VERCEL && persistence !== "cloudflare")
    throw new Error("Vercel requires Cloudflare persistence.");
  // Runtime storage is mounted separately; do not include private data in build tracing.
  const dataDir = path.resolve(
    /* turbopackIgnore: true */ persistence === "cloudflare"
      ? process.env.BACKEND_TEMP_DIR || path.join(tmpdir(), "dubbingnow")
      : process.env.BACKEND_DATA_DIR || ".data",
  );
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  let signingSecret = process.env.STORAGE_SIGNING_SECRET || "";
  if (!signingSecret) {
    if (persistence === "cloudflare")
      throw new Error(
        "Cloud persistence requires a shared STORAGE_SIGNING_SECRET.",
      );
    if (
      process.env.NODE_ENV === "production" &&
      process.env.BACKEND_LOCAL !== "true"
    )
      throw new Error("STORAGE_SIGNING_SECRET is required in production.");
    const filename = path.join(dataDir, "signing-secret");
    try {
      writeFileSync(filename, randomBytes(48).toString("base64url"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    signingSecret = readFileSync(filename, "utf8").trim();
  }
  if (signingSecret.length < 32)
    throw new Error("Use at least 32 characters for STORAGE_SIGNING_SECRET.");
  const origin = new URL(
    process.env.BACKEND_PUBLIC_URL || "http://127.0.0.1:3000",
  ).origin;
  const authIssuer =
    process.env.AUTH0_ISSUER ||
    (process.env.NEXT_PUBLIC_AUTH0_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/`
      : "");
  if (authIssuer && !authIssuer.startsWith("https://"))
    throw new Error("Auth0 issuer must use HTTPS.");
  const guestIpUses = Number(process.env.GUEST_IP_TRIAL_USES || 3);
  if (!Number.isSafeInteger(guestIpUses) || guestIpUses < 1)
    throw new Error("Invalid GUEST_IP_TRIAL_USES.");
  const synthesisConcurrency = Number(process.env.SYNTHESIS_CONCURRENCY || 3);
  if (
    !Number.isInteger(synthesisConcurrency) ||
    synthesisConcurrency < 1 ||
    synthesisConcurrency > 8
  )
    throw new Error("SYNTHESIS_CONCURRENCY must be between 1 and 8.");
  const textPipeline = process.env.TEXT_PIPELINE || "combined";
  if (!["combined", "separate"].includes(textPipeline))
    throw new Error("TEXT_PIPELINE must be combined or separate.");
  const cloneProvider = process.env.CLONE_PROVIDER || "fish";
  if (!["google", "fish"].includes(cloneProvider))
    throw new Error("CLONE_PROVIDER must be google or fish.");
  const fishVoiceMode = process.env.FISH_VOICE_MODE || "inline";
  if (!["inline", "saved_test", "per_job"].includes(fishVoiceMode))
    throw new Error("FISH_VOICE_MODE must be inline, saved_test or per_job.");
  return {
    persistence: persistence as "local" | "cloudflare",
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
    d1DatabaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || "",
    d1ApiToken: process.env.CLOUDFLARE_D1_API_TOKEN || "",
    r2Bucket: process.env.CLOUDFLARE_R2_BUCKET || "dubbingnow-audio",
    r2AccessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
    r2SecretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
    dataDir,
    origin,
    signingSecret,
    googleKey: process.env.GEMINI_API_KEY || "",
    textModel: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
    standardTtsModel:
      process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
    fidelityTtsModel:
      process.env.GEMINI_HIGH_FIDELITY_TTS_MODEL || "gemini-3.8-flash-tts",
    ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH || "ffprobe",
    authIssuer: authIssuer ? authIssuer.replace(/\/$/, "") + "/" : "",
    authAudience:
      process.env.AUTH0_AUDIENCE ||
      process.env.NEXT_PUBLIC_AUTH0_AUDIENCE ||
      "",
    adminSubjects: (process.env.AUTH0_ADMIN_SUBJECTS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    turnstileSecret: process.env.TURNSTILE_SECRET_KEY || "",
    allowedOrigins: [
      origin,
      ...(process.env.API_ALLOWED_ORIGINS || "")
        .split(",")
        .filter(Boolean)
        .map((s) => new URL(s).origin),
    ],
    trustProxy: process.env.TRUST_PROXY === "true",
    guestIpUses,
    maxFileBytes: positiveEnv("MAX_FILE_BYTES", 100_000_000, 500_000_000),
    retentionMs: 86400_000,
    maxSegments: 600,
    synthesisConcurrency,
    combinedTextPipeline: textPipeline === "combined",
    streamingTextPipeline: process.env.STREAM_TEXT_PIPELINE === "true",
    cloneProvider: cloneProvider as "google" | "fish",
    fishKey: process.env.FISH_API_KEY || "",
    fishModel: process.env.FISH_TTS_MODEL || "s2.1-pro-free",
    fishVoiceId: process.env.FISH_REFERENCE_ID || "",
    fishVoiceMode: fishVoiceMode as "inline" | "saved_test" | "per_job",
    fishAllowVoiceCreation: process.env.FISH_ALLOW_VOICE_CREATION === "true",
    maxDurationSeconds: positiveEnv("MAX_DURATION_SECONDS", 300, 7200),
    signupCreditsCap: positiveEnv("SIGNUP_CREDITS_CAP", 50),
    maxActiveJobs: positiveEnv("MAX_ACTIVE_JOBS", 20),
    maxQueueWaitMs: positiveEnv("MAX_QUEUE_WAIT_SECONDS", 600) * 1000,
    maxJobRunMs: positiveEnv("MAX_JOB_RUN_SECONDS", 900) * 1000,
    userDailySeconds: positiveEnv("USER_DAILY_AUDIO_SECONDS", 1800),
    globalDailySeconds: positiveEnv("GLOBAL_DAILY_AUDIO_SECONDS", 18000),
    dailyUploadBytes: positiveEnv("USER_DAILY_UPLOAD_BYTES", 500_000_000),
    acceptingJobs: process.env.PAUSE_NEW_JOBS !== "true",
    requireWorker:
      process.env.NODE_ENV === "production" &&
      process.env.BACKEND_LOCAL !== "true",
    minFreeDiskBytes: positiveEnv(
      "MIN_FREE_DISK_BYTES",
      persistence === "cloudflare" ? 250_000_000 : 500_000_000,
    ),
    maxSpeakers: positiveEnv("MAX_SPEAKERS", 1, 8),
    globalDailyUploadBytes: positiveEnv(
      "GLOBAL_DAILY_UPLOAD_BYTES",
      5_000_000_000,
    ),
  };
}
