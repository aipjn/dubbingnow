/** Shared wire contracts. Keep docs/openapi.yaml in sync. */
import type { VideoTimeline } from "../local-media-types";
export type LanguageCode = string;
export type VoiceTier = "standard" | "high_fidelity";
export type VoiceMode = "preset" | "clone";
export interface SpeakerConsent {
  /** Zero-based speaker number in order of first appearance. */
  speaker: number;
  uploadId: string;
}
export type JobStatus =
  | "queued"
  | "transcribing"
  | "translating"
  | "synthesizing"
  | "aligning"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";
export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "EMAIL_NOT_VERIFIED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "UPLOAD_EXPIRED"
  | "UPLOAD_INCOMPLETE"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_CANCELLABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "RESULT_EXPIRED"
  | "CHECKOUT_EXPIRED"
  | "PROCESSING_FAILED"
  | "SERVICE_UNAVAILABLE"
  | "HUMAN_VERIFICATION_REQUIRED"
  | "HUMAN_VERIFICATION_FAILED"
  | "TRIAL_LIMIT_EXCEEDED"
  | "INSUFFICIENT_CREDITS"
  | "QUOTE_EXPIRED"
  | "FORBIDDEN"
  | "ACCOUNT_SUSPENDED"
  | "POLICY_CONFLICT"
  | "NETWORK_ERROR";
export interface ErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  createdAt: string;
}
export interface Session {
  id: string;
  token: string;
  expiresAt: string;
  user: User | null;
}
export interface BillingPolicy {
  version: string;
  signupCredits: number;
  guestTrialSeconds: number;
  guestTrialUses: number;
  creditsPerMinute: Record<VoiceTier, number>;
  rounding: "per_second" | "per_minute";
  minimumCredits: number;
  maxDurationSeconds: number;
}
export interface Quota {
  kind: "guest" | "user";
  availableCredits: number;
  reservedCredits: number;
  trial: {
    remainingUses: number;
    maxDurationSeconds: number;
    verifiedUntil: string | null;
  } | null;
  maxDurationSeconds: number;
  maxFileBytes: number;
  voiceTier: VoiceTier;
}
export interface HumanVerification {
  token: string;
}
/** Local preview only. Never sent to a live API. */
export interface DemoIdentity {
  email: string;
  displayName: string;
  administrator?: boolean;
}
export interface CreditEntry {
  id: string;
  type:
    | "signup_bonus"
    | "reserve"
    | "consume"
    | "release"
    | "purchase"
    | "adjustment";
  deltaCredits: number;
  balanceAfter: number;
  createdAt: string;
  note: string;
  jobId: string | null;
}
export interface CreditHistory {
  items: CreditEntry[];
  nextCursor: string | null;
}
export interface Quote {
  id: string;
  kind: "trial" | "credits";
  durationSeconds: number;
  credits: number;
  policyVersion: string;
  expiresAt: string;
}
export interface ManagedUser extends User {
  availableCredits: number;
  reservedCredits: number;
}
export interface UserList {
  items: ManagedUser[];
  nextCursor: string | null;
}
export interface UploadRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}
export interface UploadTicket {
  id: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}
export interface UploadedMedia {
  id: string;
  durationSeconds: number;
  mediaType: "audio";
}
export interface QuoteRequest {
  uploadId: string;
  sourceLanguage: LanguageCode | "auto";
  targetLanguage: LanguageCode;
  voiceTier: VoiceTier;
  voiceMode?: VoiceMode;
  consentUploads?: SpeakerConsent[];
  timeline?: VideoTimeline;
}
export interface CreateJobRequest extends QuoteRequest {
  quoteId: string;
}
export interface Asset {
  url: string;
  filename: string;
  contentType: string;
  expiresAt: string | null;
}
export interface JobResult {
  mediaType: "audio";
  preview: Asset;
  download: Asset;
  durationSeconds: number;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  speakerCount: number;
  isDemo: boolean;
  voiceMode?: VoiceMode;
}
export interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  pollAfterMs: number;
  cacheHit: boolean;
  result: JobResult | null;
  error: ErrorBody["error"] | null;
}
export interface JobHistory {
  items: {
    id: string;
    status: JobStatus;
    createdAt: string;
    targetLanguage: string;
    durationSeconds: number;
    resultAvailable: boolean;
    resultExpiresAt: string | null;
  }[];
  nextCursor: string | null;
}
export interface ApiLanguage {
  code: string;
  name: string;
  supportsSource: boolean;
  supportsTarget: boolean;
}
export interface Capabilities {
  maxSpeakers?: number;
  voiceCloning?: {
    enabled?: boolean;
    provider: "google" | "fish";
    requiresConsentRecording: boolean;
    singleVoiceTest: boolean;
  };
  languages: ApiLanguage[];
  maxFileBytes: number;
  acceptedContentTypes: string[];
}
export interface CheckoutRequest {
  planId: "creator" | "studio";
}
export interface Checkout {
  id: string;
  url: string;
  expiresAt: string;
}
export interface CheckoutStatus {
  id: string;
  status: "pending" | "paid" | "cancelled" | "expired";
  creditsGranted: number;
}
export interface BillingPlan {
  id: "free" | "creator" | "studio";
  name: string;
  amountMinor: number | null;
  currency: "USD";
  includedCredits: number;
  available: boolean;
}
export interface DubbingApi {
  readonly mode: "demo" | "live";
  getSession(signal?: AbortSignal): Promise<Session>;
  getPolicy(signal?: AbortSignal): Promise<BillingPolicy>;
  verifyGuest(input: HumanVerification, signal?: AbortSignal): Promise<Quota>;
  login(
    mode: "login" | "register",
    returnTo: string,
    preview?: DemoIdentity,
  ): Promise<void>;
  logout(): Promise<void>;
  updateProfile(input: { displayName: string }): Promise<User>;
  getCreditHistory(cursor?: string): Promise<CreditHistory>;
  quoteJob(input: QuoteRequest, signal?: AbortSignal): Promise<Quote>;
  listUsers(query?: string, cursor?: string): Promise<UserList>;
  updateUser(
    id: string,
    input: { status: User["status"] },
  ): Promise<ManagedUser>;
  adjustCredits(
    id: string,
    input: { deltaCredits: number; reason: string },
    key: string,
  ): Promise<ManagedUser>;
  updatePolicy(input: BillingPolicy): Promise<BillingPolicy>;
  getCapabilities(signal?: AbortSignal): Promise<Capabilities>;
  getQuota(signal?: AbortSignal): Promise<Quota>;
  createUpload(
    input: UploadRequest,
    signal?: AbortSignal,
  ): Promise<UploadTicket>;
  uploadFile(
    ticket: UploadTicket,
    file: Blob,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  completeUpload(id: string, signal?: AbortSignal): Promise<UploadedMedia>;
  createJob(
    input: CreateJobRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Job>;
  getJob(id: string, signal?: AbortSignal): Promise<Job>;
  listJobs(cursor?: string, signal?: AbortSignal): Promise<JobHistory>;
  cancelJob(id: string, signal?: AbortSignal): Promise<Job>;
  getPlans(signal?: AbortSignal): Promise<BillingPlan[]>;
  getCheckout(id: string, signal?: AbortSignal): Promise<CheckoutStatus>;
  createCheckout(
    input: CheckoutRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Checkout>;
}
