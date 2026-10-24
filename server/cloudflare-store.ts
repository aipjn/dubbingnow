import { randomUUID, randomBytes } from "node:crypto";

import type {
  BillingPolicy,
  CreditEntry,
  Job,
  JobResult,
  JobStatus,
  ManagedUser,
  Quota,
  Quote,
  QuoteRequest,
  CreateJobRequest,
  Session,
  User,
} from "../lib/api/types";
import {
  defaultBillingPolicy,
  estimateCredits,
  validatePolicy,
} from "../lib/billing/policy";
import type { ServerConfig } from "./config";
import { BackendError, requireValue } from "./errors";
import { canonical, hash } from "./validation";
export interface Identity {
  issuer: string;
  subject: string;
  email: string;
  name: string;
}
export interface Actor {
  id: string;
  kind: "guest" | "user";
  user?: User;
}
export interface UploadRow {
  id: string;
  owner: string;
  kind: string;
  input: string;
  expires: number;
  status: string;
  duration: number | null;
  created: number;
}
export interface JobRow {
  id: string;
  owner: string;
  kind: string;
  status: JobStatus;
  input: string;
  credits: number;
  duration: number;
  created: number;
  updated: number;
  progress: number;
  settled: number;
  lease: string | null;
  lease_expires: number | null;
  result: string | null;
  error: string | null;
  trial_risk: string | null;
}
type UserRow = {
  id: string;
  issuer: string;
  subject: string;
  email: string;
  name: string;
  role: User["role"];
  status: User["status"];
  created: number;
  available: number;
  reserved: number;
};
type GuestRow = {
  id: string;
  token_hash: string;
  expires: number;
  remaining: number;
  max_seconds: number;
  verified: number | null;
  risk: string;
};
type QuoteRow = {
  id: string;
  owner: string;
  kind: string;
  input: string;
  credits: number;
  duration: number;
  policy_version: string;
  expires: number;
  job_id: string | null;
};
const iso = (time: number) => new Date(time).toISOString();
const activeSql =
  "('queued','transcribing','translating','synthesizing','aligning','rendering')";

import { D1Client, type Mutation, type SqlValue } from "./cloudflare/d1";
export class CloudflareStore {
  constructor(
    readonly config: ServerConfig,
    readonly db = new D1Client(config),
  ) {}
  get<T>(sql: string, ...args: SqlValue[]) {
    return this.db.get<T>(sql, ...args);
  }
  all<T>(sql: string, ...args: SqlValue[]) {
    return this.db.all<T>(sql, ...args);
  }
  async run(sql: string, ...args: SqlValue[]) {
    const batch = await this.db.atomic(async (tx) => {
      tx.run(sql, ...args);
    });
    return { changes: batch.results[0].meta.changes };
  }
  close() {}
  async policy(): Promise<BillingPolicy> {
    const policy: BillingPolicy = JSON.parse(
      (await this.get<{
        policy: string;
      }>("SELECT policy FROM settings WHERE id=1"))!.policy,
    );
    return {
      ...policy,
      signupCredits: Math.min(
        policy.signupCredits,
        this.config.signupCreditsCap ?? policy.signupCredits,
      ),
      maxDurationSeconds: Math.min(
        policy.maxDurationSeconds,
        this.config.maxDurationSeconds ?? 7200,
      ),
    };
  }
  private async account(id: string) {
    return await this.get<UserRow>(
      "SELECT a.*,w.available,w.reserved FROM accounts a JOIN wallets w ON a.id=w.owner WHERE a.id=?",
      id,
    );
  }
  private user(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.name,
      role: row.role,
      status: row.status,
      createdAt: iso(row.created),
    };
  }
  async managed(id: string): Promise<ManagedUser> {
    const row = await this.account(id);
    requireValue(row, "INVALID_REQUEST", "User not found.", 404);
    return {
      ...this.user(row),
      availableCredits: row.available,
      reservedCredits: row.reserved,
    };
  }
  async userBySubject(issuer: string, subject: string) {
    return (
      await this.get<{
        id: string;
      }>(
        "SELECT id FROM accounts WHERE issuer=? AND subject=?",
        issuer,
        subject,
      )
    )?.id;
  }
  async actor(id: string): Promise<Actor> {
    const user = await this.account(id);
    if (user) {
      requireValue(
        user.status === "active",
        "ACCOUNT_SUSPENDED",
        "This account is suspended.",
        403,
      );
      return { id, kind: "user", user: this.user(user) };
    }
    const guest = await this.get<GuestRow>(
      "SELECT * FROM guests WHERE id=?",
      id,
    );
    requireValue(
      guest && guest.expires > Date.now(),
      "UNAUTHORIZED",
      "Your guest session has expired.",
      401,
    );
    return { id, kind: "guest" };
  }
  async guestByToken(token: string): Promise<Actor> {
    const row = await this.get<GuestRow>(
      "SELECT * FROM guests WHERE token_hash=?",
      hash(token),
    );
    requireValue(row, "UNAUTHORIZED", "Invalid guest session.", 401);
    return await this.actor(row.id);
  }
  async quota(actor: Actor): Promise<Quota> {
    actor = await this.actor(actor.id);
    const policy = await this.policy(),
      row = actor.kind === "user" ? await this.account(actor.id) : undefined;
    const guest =
      actor.kind === "guest"
        ? await this.get<GuestRow>("SELECT * FROM guests WHERE id=?", actor.id)
        : undefined;
    return {
      kind: actor.kind,
      availableCredits: row?.available || 0,
      reservedCredits: row?.reserved || 0,
      trial: guest
        ? {
            remainingUses: guest.remaining,
            maxDurationSeconds: Math.min(
              guest.max_seconds,
              this.config.maxDurationSeconds ?? 7200,
            ),
            verifiedUntil: guest.verified ? iso(guest.verified) : null,
          }
        : null,
      maxDurationSeconds: Math.min(
        guest?.max_seconds || policy.maxDurationSeconds,
        this.config.maxDurationSeconds ?? 7200,
      ),
      maxFileBytes: this.config.maxFileBytes,
      voiceTier: "standard",
    };
  }
  async admin(actor: Actor) {
    const current = await this.actor(actor.id);
    requireValue(
      current.user?.role === "admin",
      "FORBIDDEN",
      "Administrator access is required.",
      403,
    );
  }
  async requireUser(actor: Actor) {
    const current = await this.actor(actor.id);
    requireValue(
      current.kind === "user",
      "UNAUTHORIZED",
      "Sign in to continue.",
      401,
    );
    return current.user!;
  }
  async trialReady(actor: Actor) {
    if (actor.kind === "user") return;
    const quota = await this.quota(actor);
    requireValue(
      quota.trial!.remainingUses > 0,
      "TRIAL_LIMIT_EXCEEDED",
      "Your free trial is used. Create an account for free credits.",
      403,
    );
    requireValue(
      quota.trial!.verifiedUntil &&
        Date.parse(quota.trial!.verifiedUntil) > Date.now(),
      "HUMAN_VERIFICATION_REQUIRED",
      "Complete verification to start your free trial.",
      403,
    );
  }
  async history(actor: Actor, cursor?: string) {
    await this.requireUser(actor);
    const seq = cursor
      ? (
          await this.get<{
            seq: number;
          }>("SELECT seq FROM credits WHERE owner=? AND id=?", actor.id, cursor)
        )?.seq
      : undefined;
    requireValue(
      !cursor || seq !== undefined,
      "INVALID_REQUEST",
      "Invalid transaction cursor.",
    );
    const rows = await this.all<{
      id: string;
      type: CreditEntry["type"];
      delta: number;
      balance: number;
      created: number;
      note: string;
      job_id: string | null;
    }>(
      "SELECT * FROM credits WHERE owner=? AND seq<? ORDER BY seq DESC LIMIT 21",
      actor.id,
      seq || Number.MAX_SAFE_INTEGER,
    );
    const items = rows.slice(0, 20).map((r) => ({
      id: r.id,
      type: r.type,
      deltaCredits: r.delta,
      balanceAfter: r.balance,
      createdAt: iso(r.created),
      note: r.note,
      jobId: r.job_id,
    }));
    return { items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null };
  }
  async listUsers(actor: Actor, query: string, cursor?: string) {
    await this.admin(actor);
    let after = cursor
      ? await this.get<{
          created: number;
          id: string;
        }>("SELECT created,id FROM accounts WHERE id=?", cursor)
      : undefined;
    requireValue(!cursor || after, "INVALID_REQUEST", "Invalid user cursor.");
    const rows = await this.all<UserRow>(
      "SELECT a.*,w.available,w.reserved FROM accounts a JOIN wallets w ON a.id=w.owner WHERE (instr(lower(email),?)>0 OR instr(lower(name),?)>0) AND (created>? OR (created=? AND a.id>?)) ORDER BY created,a.id LIMIT 21",
      query.toLowerCase(),
      query.toLowerCase(),
      after?.created || 0,
      after?.created || 0,
      after?.id || "",
    );
    const items = rows.slice(0, 20).map((row) => ({
      ...this.user(row),
      availableCredits: row.available,
      reservedCredits: row.reserved,
    }));
    return { items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null };
  }
  private async prior(
    actor: Actor,
    operation: string,
    key: string,
    input: unknown,
  ) {
    const bodyHash = hash(canonical(input));
    const saved = await this.get<{
      hash: string;
      resource: string;
    }>(
      "SELECT hash,resource FROM idempotency WHERE owner=? AND operation=? AND key=?",
      actor.id,
      operation,
      key,
    );
    requireValue(
      !saved || saved.hash === bodyHash,
      "IDEMPOTENCY_CONFLICT",
      "This request key was used with different details.",
      409,
    );
    return { hash: bodyHash, id: saved?.resource };
  }
  async upload(actor: Actor, id: string): Promise<UploadRow> {
    const row = await this.get<UploadRow>(
      "SELECT * FROM uploads WHERE id=? AND owner=?",
      id,
      actor.id,
    );
    requireValue(row, "UPLOAD_INCOMPLETE", "Upload not found.", 404);
    requireValue(
      row.expires > Date.now() || row.status === "complete",
      "UPLOAD_EXPIRED",
      "Upload expired.",
      410,
    );
    return row;
  }
  private async validateConsents(actor: Actor, input: QuoteRequest) {
    if (input.voiceMode !== "clone") return;
    if (this.config.cloneProvider === "fish") {
      requireValue(
        !input.consentUploads?.length,
        "INVALID_REQUEST",
        "Fish cloning uses the original recording directly.",
      );
      return;
    }
    requireValue(
      input.consentUploads?.length,
      "INVALID_REQUEST",
      "Add a consent recording for each speaker.",
    );
    for (const consent of input.consentUploads!) {
      const upload = await this.upload(actor, consent.uploadId);
      requireValue(
        upload.status === "complete" && upload.duration,
        "UPLOAD_INCOMPLETE",
        "Complete each consent upload before requesting a quote.",
      );
      requireValue(
        upload.duration <= 30 && JSON.parse(upload.input).sizeBytes <= 2000000,
        "INVALID_REQUEST",
        "Use a consent recording up to 30 seconds and 2 MB.",
      );
    }
  }
  async job(actor: Actor, id: string): Promise<JobRow> {
    await this.actor(actor.id);
    const row = await this.get<JobRow>(
      "SELECT * FROM jobs WHERE id=? AND owner=?",
      id,
      actor.id,
    );
    requireValue(row, "JOB_NOT_FOUND", "Task not found.", 404);
    return row;
  }
  async workerHealthy() {
    return !!(await this.get(
      "SELECT id FROM worker_heartbeats WHERE updated>? LIMIT 1",
      Date.now() - 30000,
    ));
  }
  async jobPage(actor: Actor, cursor?: string) {
    await this.actor(actor.id);
    const after = cursor
      ? await this.get<{
          created: number;
          id: string;
        }>(
          "SELECT created,id FROM jobs WHERE id=? AND owner=?",
          cursor,
          actor.id,
        )
      : undefined;
    requireValue(!cursor || after, "INVALID_REQUEST", "Invalid task cursor.");
    const rows = await this.all<JobRow>(
      "SELECT * FROM jobs WHERE owner=? AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT 21",
      actor.id,
      after?.created ?? Number.MAX_SAFE_INTEGER,
      after?.created ?? Number.MAX_SAFE_INTEGER,
      after?.id ?? "",
    );
    return {
      rows: rows.slice(0, 20),
      nextCursor: rows.length > 20 ? rows[19].id : null,
    };
  }
  private entry(
    tx: Mutation,
    owner: string,
    type: CreditEntry["type"],
    delta: number,
    note: string,
    jobId: string | null = null,
  ) {
    // The wallet update precedes this statement in the same D1 batch.
    tx.run(
      "INSERT INTO credits(id,owner,type,delta,balance,created,note,job_id) SELECT ?,?,?,?,available,?,?,? FROM wallets WHERE owner=?",
      randomUUID(),
      owner,
      type,
      delta,
      Date.now(),
      note,
      jobId,
      owner,
    );
  }
  private audit(
    tx: Mutation,
    actor: string,
    action: string,
    target: string,
    before: unknown,
    after: unknown,
  ) {
    tx.run(
      "INSERT INTO audit(actor,action,target,before_json,after_json,created) VALUES(?,?,?,?,?,?)",
      actor,
      action,
      target,
      JSON.stringify(before),
      JSON.stringify(after),
      Date.now(),
    );
  }
  async ensureUser(identity: Identity): Promise<Actor> {
    const { value: id } = await this.db.atomic(async (tx) => {
      const current = await this.userBySubject(
        identity.issuer,
        identity.subject,
      );
      if (current) {
        await this.actor(current);
        return current;
      }
      const id = randomUUID();
      const claimed = await this.get(
        "SELECT id FROM accounts WHERE issuer=? AND lower(trim(email))=lower(?) LIMIT 1",
        identity.issuer,
        identity.email.trim(),
      );
      const credits = claimed ? 0 : (await this.policy()).signupCredits;
      tx.run(
        "INSERT INTO accounts VALUES(?,?,?,?,?,?,?,?)",
        id,
        identity.issuer,
        identity.subject,
        identity.email.trim(),
        identity.name,
        this.config.adminSubjects.includes(identity.subject) ? "admin" : "user",
        "active",
        Date.now(),
      );
      tx.run("INSERT INTO wallets VALUES(?,?,0)", id, credits);
      this.entry(tx, id, "signup_bonus", credits, "Welcome credits");
      return id;
    });
    return this.actor(id);
  }
  async createGuest(risk: string): Promise<Session> {
    const id = randomUUID(),
      token = `guest_${randomBytes(32).toString("base64url")}`,
      expires = Date.now() + 30 * 86400000,
      p = await this.policy();
    await this.run(
      "INSERT INTO guests VALUES(?,?,?,?,?,?,?)",
      id,
      hash(token),
      expires,
      p.guestTrialUses,
      p.guestTrialSeconds,
      null,
      risk,
    );
    return { id, token, expiresAt: iso(expires), user: null };
  }
  async verifyGuest(actor: Actor, token: string) {
    requireValue(
      actor.kind === "guest",
      "INVALID_REQUEST",
      "Your account uses credits.",
    );
    await this.db.atomic(async (tx) => {
      const fingerprint = hash(token);
      requireValue(
        !(await this.get(
          "SELECT hash FROM human_tokens WHERE hash=?",
          fingerprint,
        )),
        "HUMAN_VERIFICATION_FAILED",
        "Complete verification again.",
        403,
      );
      requireValue(
        (await this.quota(actor)).trial!.remainingUses > 0,
        "TRIAL_LIMIT_EXCEEDED",
        "Your free trial is used.",
        403,
      );
      tx.run(
        "INSERT INTO human_tokens VALUES(?,?)",
        fingerprint,
        Date.now() + 86400000,
      );
      tx.run(
        "UPDATE guests SET verified=? WHERE id=?",
        Date.now() + 600000,
        actor.id,
      );
    });
    return this.quota(actor);
  }
  async rate(key: string, max: number, periodMs: number) {
    // A single conditional UPSERT is atomic; polling does not contend with wallet transactions.
    const now = Date.now();
    const [result] = await this.db.batch([
      {
        sql: "INSERT INTO limits VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET started=CASE WHEN started+?<=? THEN excluded.started ELSE started END,count=CASE WHEN started+?<=? THEN 1 ELSE count+1 END WHERE started+?<=? OR count<? RETURNING count",
        params: [key, now, periodMs, now, periodMs, now, periodMs, now, max],
      },
    ]);
    requireValue(
      result.results.length > 0,
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
      429,
    );
  }
  async updateProfile(actor: Actor, name: string) {
    await this.requireUser(actor);
    await this.run("UPDATE accounts SET name=? WHERE id=?", name, actor.id);
    return (await this.actor(actor.id)).user!;
  }
  async updateUser(actor: Actor, id: string, status: User["status"]) {
    await this.db.atomic(async (tx) => {
      await this.admin(actor);
      requireValue(
        id !== actor.id,
        "INVALID_REQUEST",
        "You cannot suspend your own account.",
      );
      const before = await this.managed(id);
      tx.run("UPDATE accounts SET status=? WHERE id=?", status, id);
      this.audit(tx, actor.id, "user.status", id, before, {
        ...before,
        status,
      });
      if (status === "suspended")
        for (const row of await this.all<JobRow>(
          `SELECT * FROM jobs WHERE owner=? AND status IN ${activeSql}`,
          id,
        ))
          this.settleInside(tx, row, "failed", null, {
            code: "ACCOUNT_SUSPENDED",
            message: "Account suspended during processing.",
            retryable: false,
          });
    });
    return this.managed(id);
  }
  async adjustCredits(
    actor: Actor,
    id: string,
    delta: number,
    reason: string,
    key: string,
  ) {
    await this.db.atomic(async (tx) => {
      await this.admin(actor);
      const previous = await this.prior(actor, `adjust:${id}`, key, {
        deltaCredits: delta,
        reason,
      });
      if (previous.id) return;
      const before = await this.managed(id),
        after = before.availableCredits + delta;
      requireValue(
        Number.isSafeInteger(after) && after >= 0,
        "INVALID_REQUEST",
        "The balance cannot be negative or exceed the supported range.",
      );
      tx.run(
        "UPDATE wallets SET available=available+? WHERE owner=?",
        delta,
        id,
      );
      this.entry(tx, id, "adjustment", delta, reason);
      this.audit(tx, actor.id, "credits.adjust", id, before, {
        ...before,
        availableCredits: after,
        reason,
      });
      this.remember(tx, actor, `adjust:${id}`, key, previous.hash, id);
    });
    return this.managed(id);
  }
  async updatePolicy(actor: Actor, input: BillingPolicy) {
    try {
      validatePolicy(input);
    } catch {
      throw new BackendError("INVALID_REQUEST", "Invalid credit settings.");
    }
    return (
      await this.db.atomic(async (tx) => {
        await this.admin(actor);
        const before = await this.policy();
        requireValue(
          before.version === input.version,
          "POLICY_CONFLICT",
          "The policy changed. Reload it before saving.",
          409,
        );
        const next = { ...input, version: randomUUID() };
        tx.run("UPDATE settings SET policy=? WHERE id=1", JSON.stringify(next));
        this.audit(tx, actor.id, "policy.update", "1", before, next);
        return next;
      })
    ).value;
  }
  private remember(
    tx: Mutation,
    actor: Actor,
    operation: string,
    key: string,
    bodyHash: string,
    id: string,
  ) {
    tx.run(
      "INSERT INTO idempotency VALUES(?,?,?,?,?,?)",
      actor.id,
      operation,
      key,
      bodyHash,
      id,
      Date.now(),
    );
  }
  private async useDailyBudget(
    tx: Mutation,
    bucket: string,
    amount: number,
    maximum: number,
  ) {
    const id = new Date().toISOString().slice(0, 10) + ":" + bucket;
    const used =
      (
        await this.get<{ used: number }>(
          "SELECT used FROM daily_usage WHERE id=?",
          id,
        )
      )?.used || 0;
    requireValue(
      used + amount <= maximum,
      "QUOTA_EXCEEDED",
      "The daily processing or upload allowance has been reached. Please try again tomorrow.",
      429,
    );
    tx.run(
      "INSERT INTO daily_usage VALUES(?,?) ON CONFLICT(id) DO UPDATE SET used=used+excluded.used",
      id,
      amount,
    );
  }
  async newUpload(actor: Actor, input: unknown): Promise<UploadRow> {
    const { value: id } = await this.db.atomic(async (tx) => {
      await this.trialReady(actor);
      requireValue(
        (await this.get<{ count: number }>(
          "SELECT count(*) AS count FROM uploads WHERE owner=? AND expires>? AND status!='complete'",
          actor.id,
          Date.now(),
        ))!.count < 5,
        "RATE_LIMITED",
        "Too many pending uploads.",
        429,
      );
      const size = (input as { sizeBytes: number }).sizeBytes;
      requireValue(
        Number.isSafeInteger(size) &&
          size > 0 &&
          size <= this.config.maxFileBytes,
        "FILE_TOO_LARGE",
        "This file exceeds the upload limit.",
        413,
      );
      await this.useDailyBudget(
        tx,
        `uploads:${actor.id}`,
        size,
        this.config.dailyUploadBytes ?? 1000000000,
      );
      await this.useDailyBudget(
        tx,
        "uploads:global",
        size,
        this.config.globalDailyUploadBytes ?? 5000000000,
      );
      const id = randomUUID();
      tx.run(
        "INSERT INTO uploads VALUES(?,?,?,?,?,'created',NULL,?)",
        id,
        actor.id,
        actor.kind,
        canonical(input),
        Date.now() + 900000,
        Date.now(),
      );
      return id;
    });
    return this.upload(actor, id);
  }
  async quote(actor: Actor, input: QuoteRequest): Promise<Quote> {
    await this.trialReady(actor);
    requireValue(
      !(
        input.voiceMode === "clone" &&
        this.config.cloneProvider === "fish" &&
        input.voiceTier !== "standard"
      ),
      "INVALID_REQUEST",
      "This cloning service supports the standard credit rate only.",
    );
    await this.validateConsents(actor, input);
    const media = await this.upload(actor, input.uploadId);
    requireValue(
      media.status === "complete" && media.duration,
      "UPLOAD_INCOMPLETE",
      "Complete the upload before requesting a quote.",
    );
    if (input.voiceMode === "clone" && this.config.cloneProvider !== "fish")
      requireValue(
        media.duration >= 10,
        "INVALID_REQUEST",
        "Cloning needs at least 10 seconds of clear speech from each speaker.",
      );
    const duration = Math.ceil(
        Math.max(
          media.duration + (input.timeline?.audioOffsetSeconds || 0),
          input.timeline?.durationSeconds || 0,
        ),
      ),
      quota = await this.quota(actor),
      policy = await this.policy();
    requireValue(
      duration <= quota.maxDurationSeconds,
      actor.kind === "guest" ? "TRIAL_LIMIT_EXCEEDED" : "QUOTA_EXCEEDED",
      `Choose a recording up to ${quota.maxDurationSeconds} seconds.`,
      403,
    );
    if (input.timeline)
      requireValue(
        media.duration + (input.timeline.audioOffsetSeconds || 0) <=
          input.timeline.durationSeconds + 0.25,
        "INVALID_REQUEST",
        "The audio does not fit the video timeline.",
      );
    const credits =
      actor.kind === "guest"
        ? 0
        : estimateCredits(duration, policy, input.voiceTier);
    requireValue(
      credits <= quota.availableCredits,
      "INSUFFICIENT_CREDITS",
      "You need more credits for this recording.",
      402,
    );
    const id = randomUUID(),
      expires = Date.now() + 900000;
    await this.run(
      "INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?,NULL)",
      id,
      actor.id,
      actor.kind,
      canonical(input),
      credits,
      duration,
      policy.version,
      expires,
    );
    return {
      id,
      kind: actor.kind === "guest" ? "trial" : "credits",
      durationSeconds: duration,
      credits,
      policyVersion: policy.version,
      expiresAt: iso(expires),
    };
  }
  async createJob(
    actor: Actor,
    input: CreateJobRequest,
    key: string,
    providerReady: boolean,
  ): Promise<JobRow> {
    await this.recoverExpiredJobs();
    const { value: id } = await this.db.atomic(async (tx) => {
      await this.actor(actor.id);
      const prior = await this.prior(actor, "job", key, input);
      if (prior.id) return prior.id;
      requireValue(
        this.config.acceptingJobs !== false,
        "SERVICE_UNAVAILABLE",
        "New recordings are temporarily paused. Your credits have not been reserved.",
        503,
        true,
      );
      requireValue(
        !this.config.requireWorker || (await this.workerHealthy()),
        "SERVICE_UNAVAILABLE",
        "The processing service is unavailable. Please retry shortly.",
        503,
        true,
      );
      await this.validateConsents(actor, input);
      requireValue(
        providerReady,
        "SERVICE_UNAVAILABLE",
        "Dubbing is not configured yet. Please try again later.",
        503,
      );
      const quote = await this.get<QuoteRow>(
        "SELECT * FROM quotes WHERE id=? AND owner=?",
        input.quoteId,
        actor.id,
      );
      const { quoteId: _, ...request } = input;
      requireValue(
        quote && quote.input === canonical(request),
        "INVALID_REQUEST",
        "Request a quote for this recording.",
      );
      requireValue(
        quote.expires > Date.now(),
        "QUOTE_EXPIRED",
        "This quote expired. Start again.",
        410,
      );
      requireValue(
        !quote.job_id,
        "IDEMPOTENCY_CONFLICT",
        "This quote already belongs to another task.",
        409,
      );
      await this.trialReady(actor);
      requireValue(
        (await this.get<{ count: number }>(
          `SELECT count(*) AS count FROM jobs WHERE status IN ${activeSql}`,
        ))!.count < (this.config.maxActiveJobs ?? 20),
        "RATE_LIMITED",
        "The queue is full. Please retry shortly.",
        429,
        true,
      );
      requireValue(
        (await this.get<{ count: number }>(
          `SELECT count(*) AS count FROM jobs WHERE owner=? AND status IN ${activeSql}`,
          actor.id,
        ))!.count < 3,
        "RATE_LIMITED",
        "Wait for an active recording to finish.",
        429,
      );
      const media = await this.upload(actor, input.uploadId);
      requireValue(
        media.status === "complete" && media.duration,
        "UPLOAD_INCOMPLETE",
        "The source recording is unavailable.",
      );
      await this.useDailyBudget(
        tx,
        `audio:${actor.id}`,
        quote.duration,
        this.config.userDailySeconds ?? 1800,
      );
      await this.useDailyBudget(
        tx,
        "audio:global",
        quote.duration,
        this.config.globalDailySeconds ?? 18000,
      );
      const id = randomUUID(),
        now = Date.now();
      let trialRisk: string | null = null;
      if (actor.kind === "user") {
        requireValue(
          (await this.managed(actor.id)).availableCredits >= quote.credits,
          "INSUFFICIENT_CREDITS",
          "You need more credits for this recording.",
          402,
        );
        tx.run(
          "UPDATE wallets SET available=available-?,reserved=reserved+? WHERE owner=?",
          quote.credits,
          quote.credits,
          actor.id,
        );
        this.entry(
          tx,
          actor.id,
          "reserve",
          -quote.credits,
          "Reserved for dubbing",
          id,
        );
      } else {
        const guest = (await this.get<GuestRow>(
          "SELECT * FROM guests WHERE id=?",
          actor.id,
        ))!;
        trialRisk = guest.risk + ":" + new Date().toISOString().slice(0, 10);
        const budget = await this.get<{ used: number }>(
          "SELECT used FROM trial_budgets WHERE id=?",
          trialRisk,
        );
        requireValue(
          (budget?.used || 0) < this.config.guestIpUses,
          "TRIAL_LIMIT_EXCEEDED",
          "The free trial limit for this network has been reached. Sign in to continue.",
          403,
        );
        tx.run(
          "INSERT INTO trial_budgets VALUES(?,1) ON CONFLICT(id) DO UPDATE SET used=used+1",
          trialRisk,
        );
        tx.run(
          "UPDATE guests SET remaining=remaining-1,verified=NULL WHERE id=?",
          actor.id,
        );
      }
      tx.run(
        "INSERT INTO jobs(id,owner,kind,status,input,credits,duration,created,updated,progress,trial_risk) VALUES(?,?,?,'queued',?,?,?,?,?,0,?)",
        id,
        actor.id,
        actor.kind,
        canonical(request),
        quote.credits,
        input.timeline?.durationSeconds || media.duration!,
        now,
        now,
        trialRisk,
      );
      tx.run("UPDATE quotes SET job_id=? WHERE id=?", id, input.quoteId);
      this.remember(tx, actor, "job", key, prior.hash, id);
      return id;
    });
    return this.job(actor, id);
  }
  private settleInside(
    tx: Mutation,
    row: JobRow,
    status: "completed" | "failed" | "cancelled",
    result: JobResult | null,
    error: Job["error"],
  ) {
    if (row.settled) return false;
    tx.run(
      "UPDATE jobs SET status=?,settled=1,updated=?,progress=?,result=?,error=?,lease=NULL,lease_expires=NULL WHERE id=? AND settled=0",
      status,
      Date.now(),
      status === "completed" ? 100 : row.progress,
      result ? JSON.stringify(result) : null,
      error ? JSON.stringify(error) : null,
      row.id,
    );
    if (row.kind === "user") {
      tx.run(
        "UPDATE wallets SET reserved=reserved-?,available=available+? WHERE owner=?",
        row.credits,
        status === "completed" ? 0 : row.credits,
        row.owner,
      );
      this.entry(
        tx,
        row.owner,
        status === "completed" ? "consume" : "release",
        status === "completed" ? 0 : row.credits,
        status === "completed"
          ? "Dubbing completed"
          : "Dubbing cancelled or failed",
        row.id,
      );
    } else if (status !== "completed") {
      tx.run("UPDATE guests SET remaining=remaining+1 WHERE id=?", row.owner);
      if (row.trial_risk)
        tx.run(
          "UPDATE trial_budgets SET used=used-1 WHERE id=?",
          row.trial_risk,
        );
    }
    return true;
  }
  async cancel(actor: Actor, id: string) {
    await this.db.atomic(async (tx) => {
      const row = await this.job(actor, id);
      requireValue(
        !["completed", "failed"].includes(row.status),
        "JOB_NOT_CANCELLABLE",
        "This task already finished.",
        409,
      );
      this.settleInside(tx, row, "cancelled", null, null);
    });
    return this.job(actor, id);
  }
  async settle(
    id: string,
    lease: string,
    status: "completed" | "failed",
    result: JobResult | null,
    error: Job["error"],
  ) {
    return (
      await this.db.atomic(async (tx) => {
        const row = await this.get<JobRow>("SELECT * FROM jobs WHERE id=?", id);
        if (
          !row ||
          row.lease !== lease ||
          row.settled ||
          !row.lease_expires ||
          row.lease_expires <= Date.now()
        )
          return false;
        return this.settleInside(tx, row, status, result, error);
      })
    ).value;
  }
  async claim(): Promise<JobRow | undefined> {
    await this.recoverExpiredJobs();
    const { value: claimed } = await this.db.atomic(async (tx) => {
      for (const row of await this.all<JobRow>(
        "SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 20",
      )) {
        try {
          await this.actor(row.owner);
        } catch (error) {
          if (
            !(error instanceof BackendError) ||
            !["ACCOUNT_SUSPENDED", "UNAUTHORIZED"].includes(error.code)
          )
            throw error;
          this.settleInside(tx, row, "failed", null, {
            code: "ACCOUNT_SUSPENDED",
            message: "This account cannot process recordings.",
            retryable: false,
          });
          continue;
        }
        const lease = randomUUID(),
          now = Date.now();
        tx.run(
          "UPDATE jobs SET status='transcribing',lease=?,lease_expires=?,updated=? WHERE id=? AND status='queued'",
          lease,
          now + 60000,
          now,
          row.id,
        );
        return {
          ...row,
          status: "transcribing" as const,
          lease,
          lease_expires: now + 60000,
          updated: now,
        };
      }
      return undefined;
    });
    return claimed;
  }
  async heartbeat(id: string, lease: string) {
    const now = Date.now();
    const [r] = await this.db.batch([
      {
        sql: `UPDATE jobs SET lease_expires=? WHERE id=? AND lease=? AND status IN ${activeSql} AND status!='queued' AND lease_expires>? RETURNING id`,
        params: [now + 60000, id, lease, now],
      },
    ]);
    return r.results.length > 0;
  }
  async stage(id: string, lease: string, status: JobStatus, progress: number) {
    const [r] = await this.db.batch([
      {
        sql: `UPDATE jobs SET status=?,progress=MAX(progress,?),updated=? WHERE id=? AND lease=? AND status IN ${activeSql} AND status!='queued' AND lease_expires>? RETURNING id`,
        params: [
          status,
          Math.round(progress),
          Date.now(),
          id,
          lease,
          Date.now(),
        ],
      },
    ]);
    requireValue(
      r.results.length > 0,
      "JOB_NOT_CANCELLABLE",
      "Processing stopped.",
      409,
    );
  }
  async workerBeat(id: string) {
    await this.db.batch([
      {
        sql: "INSERT INTO worker_heartbeats VALUES(?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated",
        params: [id, Date.now()],
      },
    ]);
  }
  async workerStopped(id: string) {
    await this.db.batch([
      { sql: "DELETE FROM worker_heartbeats WHERE id=?", params: [id] },
    ]);
  }
  async recoverExpiredJobs() {
    // No transaction or revision write on the common polling path with nothing to recover.
    const sql = `SELECT * FROM jobs WHERE settled=0 AND ((status='queued' AND created<?) OR (status!='queued' AND status IN ${activeSql} AND lease_expires<?))`;
    const params = [
      Date.now() - (this.config.maxQueueWaitMs ?? 600000),
      Date.now(),
    ];
    if (!(await this.all(sql, ...params)).length) return;
    await this.db.atomic(async (tx) => {
      for (const row of await this.all<JobRow>(sql, ...params))
        this.settleInside(tx, row, "failed", null, {
          code: "PROCESSING_FAILED",
          message:
            "Processing timed out or was interrupted. Your reservation was returned.",
          retryable: true,
        });
    });
  }
}
