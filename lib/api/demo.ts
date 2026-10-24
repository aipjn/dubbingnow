import { languages } from "../catalog";
import {
  defaultBillingPolicy,
  estimateCredits,
  validatePolicy,
} from "../billing/policy";
import { ApiError } from "./errors";
import type {
  BillingPlan,
  BillingPolicy,
  CreditEntry,
  CreateJobRequest,
  DubbingApi,
  Job,
  JobHistory,
  JobStatus,
  DemoIdentity,
  ManagedUser,
  Quota,
  Quote,
  QuoteRequest,
  Session,
  UploadRequest,
  UploadTicket,
  UploadedMedia,
  User,
} from "./types";

type AccountRecord = {
  user: User;
  availableCredits: number;
  reservedCredits: number;
  entries: CreditEntry[];
};
type StoredJob = {
  job: Job;
  started: number;
  owner: string;
  reserved: number;
  settled: boolean;
  trial: boolean;
};
type DemoState = {
  policy: BillingPolicy;
  guest: { id: string; remainingUses: number; verifiedUntil: string | null };
  activeUserId: string | null;
  users: AccountRecord[];
  uploads: Record<string, UploadedMedia & { owner: string }>;
  quotes: Record<
    string,
    { quote: Quote; input: QuoteRequest; owner: string; jobId?: string }
  >;
  jobs: Record<string, StoredJob>;
  keys: Record<string, { digest: string; id: string }>;
  usedTokens: string[];
};
const statuses: JobStatus[] = [
  "queued",
  "transcribing",
  "translating",
  "synthesizing",
  "aligning",
  "rendering",
  "completed",
];
const storageKey = "dubbingnow.demo.v3";
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const digest = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export class DemoDubbingApi implements DubbingApi {
  readonly mode = "demo" as const;
  private state: DemoState;
  private storage?: Storage;
  private mutation: Promise<unknown> = Promise.resolve();
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(operation);
    this.mutation = result.catch(() => {});
    return result;
  }
  constructor(options: { storage?: Storage; policy?: BillingPolicy } = {}) {
    this.storage =
      options.storage ||
      (typeof window !== "undefined" ? window.localStorage : undefined);
    const policy = structuredClone(options.policy || defaultBillingPolicy);
    this.state = {
      policy,
      guest: {
        id: crypto.randomUUID(),
        remainingUses: policy.guestTrialUses,
        verifiedUntil: null,
      },
      activeUserId: null,
      users: [],
      uploads: {},
      quotes: {},
      jobs: {},
      keys: {},
      usedTokens: [],
    };
    try {
      const saved = this.storage?.getItem(storageKey);
      if (saved) this.state = JSON.parse(saved);
    } catch {
      this.storage?.removeItem(storageKey);
    }
    this.save();
  }
  private save() {
    this.storage?.setItem(storageKey, JSON.stringify(this.state));
  }
  private account() {
    const account = this.state.users.find(
      (u) => u.user.id === this.state.activeUserId,
    );
    if (account?.user.status === "suspended")
      throw new ApiError(
        "ACCOUNT_SUSPENDED",
        "This account is suspended. Contact support.",
        false,
        403,
      );
    return account;
  }
  private owner() {
    return this.account()?.user.id || this.state.guest.id;
  }
  private requireUser() {
    const account = this.account();
    if (!account)
      throw new ApiError("UNAUTHORIZED", "Sign in to continue.", false, 401);
    return account;
  }
  private admin() {
    if (this.requireUser().user.role !== "admin")
      throw new ApiError(
        "FORBIDDEN",
        "Administrator access is required.",
        false,
        403,
      );
  }
  private requireHuman(token: string) {
    const time = Number(token.split(".")[1]);
    if (
      !token.startsWith("demo-human.") ||
      !Number.isFinite(time) ||
      Date.now() - time > 300000 ||
      time > Date.now() + 1000 ||
      this.state.usedTokens.includes(token)
    )
      throw new ApiError(
        "HUMAN_VERIFICATION_FAILED",
        "Please complete verification again.",
        false,
        403,
      );
    this.state.usedTokens.push(token);
    this.state.usedTokens = this.state.usedTokens.slice(-1000);
    this.save();
  }
  private trialReady() {
    const trial = this.state.guest;
    if (trial.remainingUses < 1)
      throw new ApiError(
        "TRIAL_LIMIT_EXCEEDED",
        "Your free trial is used. Create an account for free credits.",
        false,
        403,
      );
    if (!trial.verifiedUntil || Date.parse(trial.verifiedUntil) <= Date.now())
      throw new ApiError(
        "HUMAN_VERIFICATION_REQUIRED",
        "Complete verification to start your free trial.",
        false,
        403,
      );
  }
  private addEntry(
    account: AccountRecord,
    type: CreditEntry["type"],
    delta: number,
    note: string,
    jobId: string | null = null,
  ) {
    account.entries.unshift({
      id: crypto.randomUUID(),
      type,
      deltaCredits: delta,
      balanceAfter: account.availableCredits,
      createdAt: new Date().toISOString(),
      note,
      jobId,
    });
  }
  private async prior(scope: string, key: string, input: unknown) {
    const id = `${scope}:${key}`;
    const bodyHash = await digest(canonical(input));
    const entry = this.state.keys[id];
    if (entry && entry.digest !== bodyHash)
      throw new ApiError(
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used with different details.",
        false,
        409,
      );
    return { storageId: id, digest: bodyHash, existing: entry?.id };
  }
  async getSession(): Promise<Session> {
    const account = this.account();
    const id = account?.user.id || this.state.guest.id;
    return {
      id,
      token: `demo-${id}`,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      user: account ? { ...account.user } : null,
    };
  }
  async getPolicy() {
    return structuredClone(this.state.policy);
  }
  async getCapabilities() {
    return {
      languages: languages.map((l) => ({
        code: l.code,
        name: l.name,
        supportsSource: true,
        supportsTarget: true,
      })),
      maxFileBytes: 500000000,
      acceptedContentTypes: ["audio/mp4", "audio/mpeg", "audio/wav"],
    };
  }
  async getQuota(): Promise<Quota> {
    const account = this.account();
    return {
      kind: account ? "user" : "guest",
      availableCredits: account?.availableCredits || 0,
      reservedCredits: account?.reservedCredits || 0,
      trial: account
        ? null
        : {
            remainingUses: this.state.guest.remainingUses,
            maxDurationSeconds: this.state.policy.guestTrialSeconds,
            verifiedUntil: this.state.guest.verifiedUntil,
          },
      maxDurationSeconds: account
        ? this.state.policy.maxDurationSeconds
        : this.state.policy.guestTrialSeconds,
      maxFileBytes: 500000000,
      voiceTier: "standard",
    };
  }
  async verifyGuest(input: { token: string }) {
    if (this.account())
      throw new ApiError(
        "INVALID_REQUEST",
        "Your account already uses credits.",
      );
    this.requireHuman(input.token);
    if (this.state.guest.remainingUses < 1) this.trialReady();
    this.state.guest.verifiedUntil = new Date(
      Date.now() + 600000,
    ).toISOString();
    this.save();
    return this.getQuota();
  }
  async login(
    _mode: "login" | "register",
    _returnTo: string,
    preview?: DemoIdentity,
  ) {
    if (!preview)
      throw new ApiError("INVALID_REQUEST", "Enter a preview identity.");
    const email = preview.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || !preview.displayName.trim())
      throw new ApiError(
        "INVALID_REQUEST",
        "Enter a name and valid sample email.",
      );
    let account = this.state.users.find((u) => u.user.email === email);
    if (!account) {
      account = {
        user: {
          id: crypto.randomUUID(),
          email,
          displayName: preview.displayName.trim().slice(0, 80),
          role: preview.administrator ? "admin" : "user",
          status: "active",
          createdAt: new Date().toISOString(),
        },
        availableCredits: this.state.policy.signupCredits,
        reservedCredits: 0,
        entries: [],
      };
      this.addEntry(
        account,
        "signup_bonus",
        account.availableCredits,
        "Welcome credits",
      );
      this.state.users.push(account);
    }
    if (account.user.status !== "active")
      throw new ApiError(
        "ACCOUNT_SUSPENDED",
        "This account is suspended. Contact support.",
        false,
        403,
      );
    this.state.activeUserId = account.user.id;
    this.save();
  }
  async logout() {
    this.state.activeUserId = null;
    this.save();
  }
  async updateProfile(input: { displayName: string }) {
    const account = this.requireUser();
    if (!input.displayName.trim())
      throw new ApiError("INVALID_REQUEST", "Enter your name.");
    account.user.displayName = input.displayName.trim().slice(0, 80);
    this.save();
    return { ...account.user };
  }
  async getCreditHistory(cursor?: string) {
    const entries = this.requireUser().entries;
    const offset = cursor ? entries.findIndex((e) => e.id === cursor) + 1 : 0;
    const items = entries.slice(offset, offset + 20);
    return {
      items: structuredClone(items),
      nextCursor: offset + 20 < entries.length ? items.at(-1)!.id : null,
    };
  }
  async createUpload(input: UploadRequest): Promise<UploadTicket> {
    if (!this.account()) this.trialReady();
    if (
      !(await this.getCapabilities()).acceptedContentTypes.includes(
        input.contentType,
      )
    )
      throw new ApiError(
        "UNSUPPORTED_MEDIA",
        "Choose supported audio or video.",
      );
    const id = crypto.randomUUID();
    this.state.uploads[id] = {
      id,
      durationSeconds: 12,
      mediaType: "audio",
      owner: this.owner(),
    };
    this.save();
    return {
      id,
      url: "demo://local-only",
      method: "PUT",
      headers: {},
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
  }
  async uploadFile(
    ticket: UploadTicket,
    file: Blob,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ) {
    if (typeof window !== "undefined") {
      const { probeAudioDuration } = await import("../local-media");
      const result = await probeAudioDuration(file, { signal });
      const upload = this.state.uploads[ticket.id];
      if (upload) upload.durationSeconds = Math.ceil(result.durationSeconds);
      this.save();
    }
    for (let progress = 0; progress <= 100; progress += 20) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(progress);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
  async completeUpload(id: string): Promise<UploadedMedia> {
    const media = this.state.uploads[id];
    if (!media || media.owner !== this.owner())
      throw new ApiError("UPLOAD_INCOMPLETE", "Choose your recording again.");
    return {
      id: media.id,
      mediaType: "audio",
      durationSeconds: media.durationSeconds,
    };
  }
  async quoteJob(input: QuoteRequest): Promise<Quote> {
    if (input.voiceMode === "clone")
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "The demo cannot clone voices. Connect the live service to use cloning.",
      );
    const media = await this.completeUpload(input.uploadId);
    const quota = await this.getQuota();
    const durationSeconds = Math.ceil(
      Math.max(
        media.durationSeconds + (input.timeline?.audioOffsetSeconds || 0),
        input.timeline?.durationSeconds || 0,
      ),
    );
    if (durationSeconds > quota.maxDurationSeconds)
      throw new ApiError(
        quota.kind === "guest" ? "TRIAL_LIMIT_EXCEEDED" : "QUOTA_EXCEEDED",
        quota.kind === "guest"
          ? `Choose a recording up to ${quota.maxDurationSeconds} seconds, or create an account for free credits.`
          : "This recording exceeds the duration limit.",
      );
    if (input.sourceLanguage === input.targetLanguage)
      throw new ApiError(
        "INVALID_REQUEST",
        "Choose a different target language.",
      );
    if (quota.kind === "guest") this.trialReady();
    const credits =
      quota.kind === "guest"
        ? 0
        : estimateCredits(durationSeconds, this.state.policy, input.voiceTier);
    if (credits > quota.availableCredits)
      throw new ApiError(
        "INSUFFICIENT_CREDITS",
        "You need more credits for this recording.",
        false,
        402,
      );
    const quote: Quote = {
      id: crypto.randomUUID(),
      kind: quota.kind === "guest" ? "trial" : "credits",
      durationSeconds,
      credits,
      policyVersion: this.state.policy.version,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
    this.state.quotes[quote.id] = {
      quote: structuredClone(quote),
      input: structuredClone(input),
      owner: this.owner(),
    };
    this.save();
    return { ...quote };
  }
  createJob(input: CreateJobRequest, key: string): Promise<Job> {
    if (input.voiceMode === "clone")
      return Promise.reject(
        new ApiError(
          "SERVICE_UNAVAILABLE",
          "The demo cannot clone voices. Connect the live service to use cloning.",
        ),
      );
    return this.serialize(() => this.createJobOnce(input, key));
  }
  private async createJobOnce(
    input: CreateJobRequest,
    key: string,
  ): Promise<Job> {
    const owner = this.owner();
    const previous = await this.prior(`${owner}:jobs`, key, input);
    if (owner !== this.owner())
      throw new ApiError(
        "UNAUTHORIZED",
        "The active account changed. Start again.",
        false,
        401,
      );
    if (previous.existing) return this.getJob(previous.existing);
    const record = this.state.quotes[input.quoteId];
    const { quoteId: _quote, ...request } = input;
    if (
      !record ||
      record.owner !== owner ||
      canonical(request) !== canonical(record.input)
    )
      throw new ApiError(
        "INVALID_REQUEST",
        "Request a new price quote for this recording.",
      );
    if (Date.parse(record.quote.expiresAt) <= Date.now())
      throw new ApiError(
        "QUOTE_EXPIRED",
        "The price quote expired. Start again.",
        false,
        410,
      );
    if (record.jobId)
      throw new ApiError(
        "IDEMPOTENCY_CONFLICT",
        "This quote already belongs to a task. Use the original request key.",
        false,
        409,
      );
    const account = this.account();
    if (!account) this.trialReady();
    if (account && account.availableCredits < record.quote.credits)
      throw new ApiError(
        "INSUFFICIENT_CREDITS",
        "You need more credits for this recording.",
        false,
        402,
      );
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const job: Job = {
      id,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      pollAfterMs: 650,
      cacheHit: false,
      error: null,
      result: null,
    };
    if (account) {
      account.availableCredits -= record.quote.credits;
      account.reservedCredits += record.quote.credits;
      this.addEntry(
        account,
        "reserve",
        -record.quote.credits,
        "Reserved for dubbing",
        id,
      );
    } else {
      this.state.guest.remainingUses--;
      this.state.guest.verifiedUntil = null;
    }
    record.jobId = id;
    this.state.jobs[id] = {
      job,
      started: Date.now(),
      owner,
      reserved: record.quote.credits,
      settled: false,
      trial: !account,
    };
    this.state.keys[previous.storageId] = { digest: previous.digest, id };
    this.save();
    return { ...job };
  }
  async getJob(id: string): Promise<Job> {
    const stored = this.state.jobs[id];
    if (!stored || stored.owner !== this.owner())
      throw new ApiError("JOB_NOT_FOUND", "Task not found.", false, 404);
    if (!["cancelled", "completed", "failed"].includes(stored.job.status)) {
      const index = Math.min(
        6,
        Math.floor((Date.now() - stored.started) / 650),
      );
      stored.job = {
        ...stored.job,
        status: statuses[index],
        progress: Math.round((index / 6) * 100),
        updatedAt: new Date().toISOString(),
      };
      if (index === 6) {
        const asset = {
          url: "/demo/spanish.wav",
          filename: "dubbingnow-spanish-sample.wav",
          contentType: "audio/wav",
          expiresAt: null,
        };
        stored.job.result = {
          mediaType: "audio",
          preview: asset,
          download: asset,
          durationSeconds: 12,
          sourceLanguage: "en",
          targetLanguage: "es",
          speakerCount: 1,
          isDemo: true,
        };
        if (!stored.settled) {
          const account = this.state.users.find(
            (u) => u.user.id === stored.owner,
          );
          if (account) {
            account.reservedCredits -= stored.reserved;
            this.addEntry(account, "consume", 0, "Dubbing completed", id);
          }
          stored.settled = true;
        }
      }
      this.save();
    }
    return structuredClone(stored.job);
  }
  async listJobs(cursor?: string): Promise<JobHistory> {
    const jobs = Object.values(this.state.jobs)
      .filter((j) => j.owner === this.owner())
      .sort(
        (a, b) =>
          b.job.createdAt.localeCompare(a.job.createdAt) ||
          b.job.id.localeCompare(a.job.id),
      );
    const index = cursor ? jobs.findIndex((j) => j.job.id === cursor) : -1;
    if (cursor && index < 0)
      throw new ApiError("INVALID_REQUEST", "Invalid task cursor.");
    const page = jobs.slice(index + 1, index + 22);
    return {
      items: page.slice(0, 20).map(({ job }) => ({
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        targetLanguage: job.result?.targetLanguage || "es",
        durationSeconds: job.result?.durationSeconds || 0,
        resultAvailable: job.status === "completed",
        resultExpiresAt: null,
      })),
      nextCursor: page.length > 20 ? page[19].job.id : null,
    };
  }
  async cancelJob(id: string) {
    await this.getJob(id);
    const stored = this.state.jobs[id];
    if (["completed", "failed"].includes(stored.job.status))
      throw new ApiError(
        "JOB_NOT_CANCELLABLE",
        "This task already finished.",
        false,
        409,
      );
    if (!stored.settled) {
      if (stored.trial) this.state.guest.remainingUses++;
      else {
        const account = this.state.users.find(
          (u) => u.user.id === stored.owner,
        )!;
        account.availableCredits += stored.reserved;
        account.reservedCredits -= stored.reserved;
        this.addEntry(
          account,
          "release",
          stored.reserved,
          "Dubbing cancelled",
          id,
        );
      }
      stored.settled = true;
    }
    stored.job = {
      ...stored.job,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return structuredClone(stored.job);
  }
  async getPlans(): Promise<BillingPlan[]> {
    return [
      {
        id: "free",
        name: "Free",
        amountMinor: 0,
        currency: "USD",
        includedCredits: this.state.policy.signupCredits,
        available: true,
      },
      {
        id: "creator",
        name: "Creator",
        amountMinor: null,
        currency: "USD",
        includedCredits: 1000,
        available: false,
      },
      {
        id: "studio",
        name: "Studio",
        amountMinor: null,
        currency: "USD",
        includedCredits: 5000,
        available: false,
      },
    ];
  }
  async getCheckout(_id: string): Promise<never> {
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      "No payment was processed in this preview.",
    );
  }
  async createCheckout(_input?: {
    planId: "creator" | "studio";
  }): Promise<never> {
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      "Purchases are disabled in this preview. No payment has been taken.",
    );
  }
  async listUsers(query = "", cursor?: string) {
    this.admin();
    const all = this.state.users.filter((u) =>
      `${u.user.email} ${u.user.displayName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    const offset = cursor ? all.findIndex((u) => u.user.id === cursor) + 1 : 0;
    const items = all.slice(offset, offset + 20).map((u) => this.managed(u));
    return {
      items,
      nextCursor: offset + 20 < all.length ? items.at(-1)!.id : null,
    };
  }
  private managed(account: AccountRecord): ManagedUser {
    return {
      ...account.user,
      availableCredits: account.availableCredits,
      reservedCredits: account.reservedCredits,
    };
  }
  async updateUser(id: string, input: { status: User["status"] }) {
    this.admin();
    const account = this.state.users.find((u) => u.user.id === id);
    if (!account) throw new ApiError("INVALID_REQUEST", "User not found.");
    if (id === this.state.activeUserId)
      throw new ApiError(
        "INVALID_REQUEST",
        "You cannot suspend your own account.",
      );
    account.user.status = input.status;
    this.save();
    return this.managed(account);
  }
  adjustCredits(
    id: string,
    input: { deltaCredits: number; reason: string },
    key: string,
  ) {
    return this.serialize(() => this.adjustOnce(id, input, key));
  }
  private async adjustOnce(
    id: string,
    input: { deltaCredits: number; reason: string },
    key: string,
  ) {
    this.admin();
    const previous = await this.prior(`admin:${id}:credits`, key, input);
    const account = this.state.users.find((u) => u.user.id === id);
    if (!account) throw new ApiError("INVALID_REQUEST", "User not found.");
    if (previous.existing) return this.managed(account);
    if (
      !Number.isSafeInteger(input.deltaCredits) ||
      input.deltaCredits === 0 ||
      !input.reason.trim() ||
      account.availableCredits + input.deltaCredits < 0
    )
      throw new ApiError(
        "INVALID_REQUEST",
        "Use a nonzero integer adjustment and reason; the balance cannot be negative.",
      );
    account.availableCredits += input.deltaCredits;
    this.addEntry(
      account,
      "adjustment",
      input.deltaCredits,
      input.reason.trim(),
    );
    this.state.keys[previous.storageId] = { digest: previous.digest, id };
    this.save();
    return this.managed(account);
  }
  async updatePolicy(input: BillingPolicy) {
    this.admin();
    validatePolicy(input);
    if (input.version !== this.state.policy.version)
      throw new ApiError(
        "POLICY_CONFLICT",
        "The policy changed. Reload it before saving.",
        false,
        409,
      );
    this.state.policy = {
      ...structuredClone(input),
      version: crypto.randomUUID(),
    };
    this.save();
    return this.getPolicy();
  }
}
