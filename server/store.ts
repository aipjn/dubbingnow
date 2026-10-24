import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
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
export class Store {
  readonly db: DatabaseSync;
  constructor(
    readonly config: ServerConfig,
    filename = path.join(config.dataDir, "dubbing.sqlite"),
  ) {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    if (
      (this.db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version > 1
    ) {
      this.db.close();
      throw new Error("This database requires a newer backend version.");
    }
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), policy TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,issuer TEXT NOT NULL,subject TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('user','admin')),status TEXT NOT NULL CHECK(status IN ('active','suspended')),created INTEGER NOT NULL,UNIQUE(issuer,subject));
      CREATE TABLE IF NOT EXISTS wallets(owner TEXT PRIMARY KEY REFERENCES accounts(id),available INTEGER NOT NULL CHECK(available>=0),reserved INTEGER NOT NULL CHECK(reserved>=0));
      CREATE TABLE IF NOT EXISTS credits(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),type TEXT NOT NULL,delta INTEGER NOT NULL,balance INTEGER NOT NULL,created INTEGER NOT NULL,note TEXT NOT NULL,job_id TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS bonus_once ON credits(owner) WHERE type='signup_bonus';
      CREATE TABLE IF NOT EXISTS guests(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,remaining INTEGER NOT NULL CHECK(remaining>=0),max_seconds INTEGER NOT NULL,verified INTEGER,risk TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trial_budgets(id TEXT PRIMARY KEY,used INTEGER NOT NULL CHECK(used>=0));
      CREATE TABLE IF NOT EXISTS limits(id TEXT PRIMARY KEY,started INTEGER NOT NULL,count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS human_tokens(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,input TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,duration REAL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,input TEXT NOT NULL,credits INTEGER NOT NULL,duration INTEGER NOT NULL,policy_version TEXT NOT NULL,expires INTEGER NOT NULL,job_id TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,input TEXT NOT NULL,credits INTEGER NOT NULL,duration REAL NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,progress INTEGER NOT NULL,settled INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_expires INTEGER,result TEXT,error TEXT,trial_risk TEXT);
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status,created);
      CREATE TABLE IF NOT EXISTS idempotency(owner TEXT NOT NULL,operation TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,resource TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner,operation,key));
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_usage(id TEXT PRIMARY KEY,used INTEGER NOT NULL CHECK(used>=0));
      CREATE TABLE IF NOT EXISTS worker_heartbeats(id TEXT PRIMARY KEY,updated INTEGER NOT NULL);
      PRAGMA user_version=1;`);
    this.run(
      "INSERT OR IGNORE INTO settings VALUES(1,?)",
      JSON.stringify({ ...defaultBillingPolicy, version: randomUUID() }),
    );
  }
  get<T>(sql: string, ...args: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }
  all<T>(sql: string, ...args: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }
  run(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(callback: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
  close() {
    this.db.close();
  }
  policy(): BillingPolicy {
    const policy: BillingPolicy = JSON.parse(
      this.get<{ policy: string }>("SELECT policy FROM settings WHERE id=1")!
        .policy,
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
  private account(id: string) {
    return this.get<UserRow>(
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
  managed(id: string): ManagedUser {
    const row = this.account(id);
    requireValue(row, "INVALID_REQUEST", "User not found.", 404);
    return {
      ...this.user(row),
      availableCredits: row.available,
      reservedCredits: row.reserved,
    };
  }
  userBySubject(issuer: string, subject: string) {
    return this.get<{ id: string }>(
      "SELECT id FROM accounts WHERE issuer=? AND subject=?",
      issuer,
      subject,
    )?.id;
  }
  ensureUser(identity: Identity): Actor {
    return this.transaction(() => {
      let id = this.userBySubject(identity.issuer, identity.subject);
      if (!id) {
        id = randomUUID();
        const claimed = this.get(
          "SELECT id FROM accounts WHERE issuer=? AND lower(email)=lower(?) LIMIT 1",
          identity.issuer,
          identity.email.trim(),
        );
        const credits = claimed ? 0 : this.policy().signupCredits;
        this.run(
          "INSERT INTO accounts VALUES(?,?,?,?,?,?,?,?)",
          id,
          identity.issuer,
          identity.subject,
          identity.email,
          identity.name,
          this.config.adminSubjects.includes(identity.subject)
            ? "admin"
            : "user",
          "active",
          Date.now(),
        );
        this.run("INSERT INTO wallets VALUES(?,?,0)", id, credits);
        this.entry(id, "signup_bonus", credits, "Welcome credits");
      }
      const row = this.account(id)!;
      requireValue(
        row.status === "active",
        "ACCOUNT_SUSPENDED",
        "This account is suspended. Contact support.",
        403,
      );
      return { id, kind: "user", user: this.user(row) };
    });
  }
  actor(id: string): Actor {
    const user = this.account(id);
    if (user) {
      requireValue(
        user.status === "active",
        "ACCOUNT_SUSPENDED",
        "This account is suspended.",
        403,
      );
      return { id, kind: "user", user: this.user(user) };
    }
    const guest = this.get<GuestRow>("SELECT * FROM guests WHERE id=?", id);
    requireValue(
      guest && guest.expires > Date.now(),
      "UNAUTHORIZED",
      "Your guest session has expired.",
      401,
    );
    return { id, kind: "guest" };
  }
  guestByToken(token: string): Actor {
    const row = this.get<GuestRow>(
      "SELECT * FROM guests WHERE token_hash=?",
      hash(token),
    );
    requireValue(row, "UNAUTHORIZED", "Invalid guest session.", 401);
    return this.actor(row.id);
  }
  createGuest(risk: string): Session {
    const id = randomUUID(),
      token = `guest_${randomBytes(32).toString("base64url")}`,
      expires = Date.now() + 30 * 86400000,
      p = this.policy();
    this.run(
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
  quota(actor: Actor): Quota {
    actor = this.actor(actor.id);
    const policy = this.policy(),
      row = actor.kind === "user" ? this.account(actor.id) : undefined;
    const guest =
      actor.kind === "guest"
        ? this.get<GuestRow>("SELECT * FROM guests WHERE id=?", actor.id)
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
  admin(actor: Actor) {
    const current = this.actor(actor.id);
    requireValue(
      current.user?.role === "admin",
      "FORBIDDEN",
      "Administrator access is required.",
      403,
    );
  }
  requireUser(actor: Actor) {
    const current = this.actor(actor.id);
    requireValue(
      current.kind === "user",
      "UNAUTHORIZED",
      "Sign in to continue.",
      401,
    );
    return current.user!;
  }
  trialReady(actor: Actor) {
    if (actor.kind === "user") return;
    const quota = this.quota(actor);
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
  verifyGuest(actor: Actor, token: string) {
    requireValue(
      actor.kind === "guest",
      "INVALID_REQUEST",
      "Your account uses credits.",
    );
    return this.transaction(() => {
      const fingerprint = hash(token);
      requireValue(
        !this.get("SELECT hash FROM human_tokens WHERE hash=?", fingerprint),
        "HUMAN_VERIFICATION_FAILED",
        "Complete verification again.",
        403,
      );
      requireValue(
        this.quota(actor).trial!.remainingUses > 0,
        "TRIAL_LIMIT_EXCEEDED",
        "Your free trial is used.",
        403,
      );
      this.run(
        "INSERT INTO human_tokens VALUES(?,?)",
        fingerprint,
        Date.now() + 86400000,
      );
      this.run(
        "UPDATE guests SET verified=? WHERE id=?",
        Date.now() + 600000,
        actor.id,
      );
      return this.quota(actor);
    });
  }
  rate(key: string, max: number, periodMs: number) {
    this.transaction(() => {
      const now = Date.now(),
        row = this.get<{ started: number; count: number }>(
          "SELECT * FROM limits WHERE id=?",
          key,
        );
      if (!row || row.started + periodMs <= now)
        this.run(
          "INSERT INTO limits VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET started=excluded.started,count=1",
          key,
          now,
        );
      else {
        requireValue(
          row.count < max,
          "RATE_LIMITED",
          "Too many requests. Please try again later.",
          429,
        );
        this.run("UPDATE limits SET count=count+1 WHERE id=?", key);
      }
    });
  }
  private entry(
    owner: string,
    type: CreditEntry["type"],
    delta: number,
    note: string,
    jobId: string | null = null,
  ) {
    const row = this.account(owner)!;
    this.run(
      "INSERT INTO credits(id,owner,type,delta,balance,created,note,job_id) VALUES(?,?,?,?,?,?,?,?)",
      randomUUID(),
      owner,
      type,
      delta,
      row.available,
      Date.now(),
      note,
      jobId,
    );
  }
  private audit(
    actor: string,
    action: string,
    target: string,
    before: unknown,
    after: unknown,
  ) {
    this.run(
      "INSERT INTO audit(actor,action,target,before_json,after_json,created) VALUES(?,?,?,?,?,?)",
      actor,
      action,
      target,
      JSON.stringify(before),
      JSON.stringify(after),
      Date.now(),
    );
  }
  updateProfile(actor: Actor, name: string) {
    this.requireUser(actor);
    this.run("UPDATE accounts SET name=? WHERE id=?", name, actor.id);
    return this.actor(actor.id).user!;
  }
  history(actor: Actor, cursor?: string) {
    this.requireUser(actor);
    const seq = cursor
      ? this.get<{ seq: number }>(
          "SELECT seq FROM credits WHERE owner=? AND id=?",
          actor.id,
          cursor,
        )?.seq
      : undefined;
    requireValue(
      !cursor || seq !== undefined,
      "INVALID_REQUEST",
      "Invalid transaction cursor.",
    );
    const rows = this.all<{
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
  listUsers(actor: Actor, query: string, cursor?: string) {
    this.admin(actor);
    let after = cursor
      ? this.get<{ created: number; id: string }>(
          "SELECT created,id FROM accounts WHERE id=?",
          cursor,
        )
      : undefined;
    requireValue(!cursor || after, "INVALID_REQUEST", "Invalid user cursor.");
    const rows = this.all<UserRow>(
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
  updateUser(actor: Actor, id: string, status: User["status"]) {
    this.admin(actor);
    requireValue(
      id !== actor.id,
      "INVALID_REQUEST",
      "You cannot suspend your own account.",
    );
    return this.transaction(() => {
      const before = this.managed(id);
      this.run("UPDATE accounts SET status=? WHERE id=?", status, id);
      this.audit(actor.id, "user.status", id, before, this.managed(id));
      if (status === "suspended")
        for (const row of this.all<JobRow>(
          `SELECT * FROM jobs WHERE owner=? AND status IN ${activeSql}`,
          id,
        ))
          this.settleInside(row, "failed", null, {
            code: "ACCOUNT_SUSPENDED",
            message: "Account suspended during processing.",
            retryable: false,
          });
      return this.managed(id);
    });
  }
  private prior(actor: Actor, operation: string, key: string, input: unknown) {
    const bodyHash = hash(canonical(input));
    const saved = this.get<{ hash: string; resource: string }>(
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
  private remember(
    actor: Actor,
    operation: string,
    key: string,
    bodyHash: string,
    id: string,
  ) {
    this.run(
      "INSERT INTO idempotency VALUES(?,?,?,?,?,?)",
      actor.id,
      operation,
      key,
      bodyHash,
      id,
      Date.now(),
    );
  }
  adjustCredits(
    actor: Actor,
    id: string,
    delta: number,
    reason: string,
    key: string,
  ) {
    this.admin(actor);
    return this.transaction(() => {
      const previous = this.prior(actor, `adjust:${id}`, key, {
        deltaCredits: delta,
        reason,
      });
      if (previous.id) return this.managed(id);
      const before = this.managed(id);
      requireValue(
        Number.isSafeInteger(before.availableCredits + delta) &&
          before.availableCredits + delta >= 0,
        "INVALID_REQUEST",
        "The balance cannot be negative or exceed the supported range.",
      );
      this.run(
        "UPDATE wallets SET available=available+? WHERE owner=?",
        delta,
        id,
      );
      this.entry(id, "adjustment", delta, reason);
      this.audit(actor.id, "credits.adjust", id, before, {
        ...this.managed(id),
        reason,
      });
      this.remember(actor, `adjust:${id}`, key, previous.hash, id);
      return this.managed(id);
    });
  }
  updatePolicy(actor: Actor, input: BillingPolicy) {
    this.admin(actor);
    try {
      validatePolicy(input);
    } catch {
      throw new BackendError("INVALID_REQUEST", "Invalid credit settings.");
    }
    return this.transaction(() => {
      const before = this.policy();
      requireValue(
        before.version === input.version,
        "POLICY_CONFLICT",
        "The policy changed. Reload it before saving.",
        409,
      );
      const next = { ...input, version: randomUUID() };
      this.run("UPDATE settings SET policy=? WHERE id=1", JSON.stringify(next));
      this.audit(actor.id, "policy.update", "1", before, next);
      return next;
    });
  }
  newUpload(actor: Actor, input: unknown) {
    return this.transaction(() => this.newUploadInside(actor, input));
  }
  private newUploadInside(actor: Actor, input: unknown) {
    this.trialReady(actor);
    requireValue(
      this.get<{ count: number }>(
        "SELECT count(*) AS count FROM uploads WHERE owner=? AND expires>? AND status!='complete'",
        actor.id,
        Date.now(),
      )!.count < 5,
      "RATE_LIMITED",
      "Too many pending uploads.",
      429,
    );
    const id = randomUUID(),
      expires = Date.now() + 900000;
    const size = (input as { sizeBytes: number }).sizeBytes;
    requireValue(
      Number.isSafeInteger(size) &&
        size > 0 &&
        size <= this.config.maxFileBytes,
      "FILE_TOO_LARGE",
      "This file exceeds the upload limit.",
      413,
    );
    this.useDailyBudget(
      `uploads:${actor.id}`,
      size,
      this.config.dailyUploadBytes ?? 1_000_000_000,
    );
    this.useDailyBudget(
      "uploads:global",
      size,
      this.config.globalDailyUploadBytes ?? 5_000_000_000,
    );
    this.run(
      "INSERT INTO uploads VALUES(?,?,?,?,?,'created',NULL,?)",
      id,
      actor.id,
      actor.kind,
      canonical(input),
      expires,
      Date.now(),
    );
    return this.upload(actor, id);
  }
  upload(actor: Actor, id: string): UploadRow {
    const row = this.get<UploadRow>(
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
  quote(actor: Actor, input: QuoteRequest): Quote {
    this.trialReady(actor);
    requireValue(
      !(
        input.voiceMode === "clone" &&
        this.config.cloneProvider === "fish" &&
        input.voiceTier !== "standard"
      ),
      "INVALID_REQUEST",
      "This cloning service supports the standard credit rate only.",
    );
    this.validateConsents(actor, input);
    const media = this.upload(actor, input.uploadId);
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
      quota = this.quota(actor),
      policy = this.policy();
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
    this.run(
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
  private validateConsents(actor: Actor, input: QuoteRequest) {
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
      const upload = this.upload(actor, consent.uploadId);
      requireValue(
        upload.status === "complete" && upload.duration,
        "UPLOAD_INCOMPLETE",
        "Complete each consent upload before requesting a quote.",
      );
      requireValue(
        upload.duration <= 30 &&
          JSON.parse(upload.input).sizeBytes <= 2_000_000,
        "INVALID_REQUEST",
        "Use a consent recording up to 30 seconds and 2 MB.",
      );
    }
  }
  createJob(
    actor: Actor,
    input: CreateJobRequest,
    key: string,
    providerReady: boolean,
  ): JobRow {
    return this.transaction(() => {
      this.actor(actor.id);
      const prior = this.prior(actor, "job", key, input);
      if (prior.id) return this.job(actor, prior.id);
      requireValue(
        this.config.acceptingJobs !== false,
        "SERVICE_UNAVAILABLE",
        "New recordings are temporarily paused. Your credits have not been reserved.",
        503,
        true,
      );
      requireValue(
        !this.config.requireWorker || this.workerHealthy(),
        "SERVICE_UNAVAILABLE",
        "The processing service is unavailable. Please retry shortly.",
        503,
        true,
      );
      this.recoverExpiredInside();
      this.validateConsents(actor, input);
      requireValue(
        providerReady,
        "SERVICE_UNAVAILABLE",
        "Dubbing is not configured yet. Please try again later.",
        503,
      );
      const quote = this.get<QuoteRow>(
          "SELECT * FROM quotes WHERE id=? AND owner=?",
          input.quoteId,
          actor.id,
        ),
        { quoteId: _quote, ...request } = input;
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
      this.trialReady(actor);
      requireValue(
        this.get<{ count: number }>(
          `SELECT count(*) AS count FROM jobs WHERE status IN ${activeSql}`,
        )!.count < (this.config.maxActiveJobs ?? 20),
        "RATE_LIMITED",
        "The queue is full. Please retry shortly.",
        429,
        true,
      );
      this.useDailyBudget(
        `audio:${actor.id}`,
        quote.duration,
        this.config.userDailySeconds ?? 1800,
      );
      this.useDailyBudget(
        "audio:global",
        quote.duration,
        this.config.globalDailySeconds ?? 18000,
      );
      requireValue(
        this.get<{ count: number }>(
          `SELECT count(*) AS count FROM jobs WHERE owner=? AND status IN ${activeSql}`,
          actor.id,
        )!.count < 3,
        "RATE_LIMITED",
        "Wait for an active recording to finish.",
        429,
      );
      const id = randomUUID(),
        now = Date.now(),
        media = this.upload(actor, input.uploadId);
      let trialRisk: string | null = null;
      if (actor.kind === "user") {
        requireValue(
          this.managed(actor.id).availableCredits >= quote.credits,
          "INSUFFICIENT_CREDITS",
          "You need more credits for this recording.",
          402,
        );
        this.run(
          "UPDATE wallets SET available=available-?,reserved=reserved+? WHERE owner=?",
          quote.credits,
          quote.credits,
          actor.id,
        );
        this.entry(
          actor.id,
          "reserve",
          -quote.credits,
          "Reserved for dubbing",
          id,
        );
      } else {
        const guest = this.get<GuestRow>(
          "SELECT * FROM guests WHERE id=?",
          actor.id,
        )!;
        trialRisk = guest.risk + ":" + new Date().toISOString().slice(0, 10);
        this.run("INSERT OR IGNORE INTO trial_budgets VALUES(?,0)", trialRisk);
        requireValue(
          this.get<{ used: number }>(
            "SELECT used FROM trial_budgets WHERE id=?",
            trialRisk,
          )!.used < this.config.guestIpUses,
          "TRIAL_LIMIT_EXCEEDED",
          "The free trial limit for this network has been reached. Sign in to continue.",
          403,
        );
        this.run("UPDATE trial_budgets SET used=used+1 WHERE id=?", trialRisk);
        this.run(
          "UPDATE guests SET remaining=remaining-1,verified=NULL WHERE id=?",
          actor.id,
        );
      }
      this.run(
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
      this.run("UPDATE quotes SET job_id=? WHERE id=?", id, input.quoteId);
      this.remember(actor, "job", key, prior.hash, id);
      return this.job(actor, id);
    });
  }
  job(actor: Actor, id: string): JobRow {
    this.actor(actor.id);
    const row = this.get<JobRow>(
      "SELECT * FROM jobs WHERE id=? AND owner=?",
      id,
      actor.id,
    );
    requireValue(row, "JOB_NOT_FOUND", "Task not found.", 404);
    return row;
  }
  private settleInside(
    row: JobRow,
    status: "completed" | "failed" | "cancelled",
    result: JobResult | null,
    error: Job["error"],
  ) {
    if (row.settled) return false;
    this.run(
      "UPDATE jobs SET status=?,settled=1,updated=?,progress=?,result=?,error=?,lease=NULL,lease_expires=NULL WHERE id=? AND settled=0",
      status,
      Date.now(),
      status === "completed" ? 100 : row.progress,
      result ? JSON.stringify(result) : null,
      error ? JSON.stringify(error) : null,
      row.id,
    );
    if (row.kind === "user") {
      this.run(
        "UPDATE wallets SET reserved=reserved-?,available=available+? WHERE owner=?",
        row.credits,
        status === "completed" ? 0 : row.credits,
        row.owner,
      );
      this.entry(
        row.owner,
        status === "completed" ? "consume" : "release",
        status === "completed" ? 0 : row.credits,
        status === "completed"
          ? "Dubbing completed"
          : "Dubbing cancelled or failed",
        row.id,
      );
    } else if (status !== "completed") {
      this.run("UPDATE guests SET remaining=remaining+1 WHERE id=?", row.owner);
      if (row.trial_risk)
        this.run(
          "UPDATE trial_budgets SET used=used-1 WHERE id=?",
          row.trial_risk,
        );
    }
    return true;
  }
  cancel(actor: Actor, id: string) {
    return this.transaction(() => {
      const row = this.job(actor, id);
      requireValue(
        !["completed", "failed"].includes(row.status),
        "JOB_NOT_CANCELLABLE",
        "This task already finished.",
        409,
      );
      this.settleInside(row, "cancelled", null, null);
      return this.job(actor, id);
    });
  }
  settle(
    id: string,
    lease: string,
    status: "completed" | "failed",
    result: JobResult | null,
    error: Job["error"],
  ) {
    return this.transaction(() => {
      const row = this.get<JobRow>("SELECT * FROM jobs WHERE id=?", id);
      if (!row || row.lease !== lease || row.settled) return false;
      return this.settleInside(row, status, result, error);
    });
  }
  claim(): JobRow | undefined {
    return this.transaction(() => {
      this.recoverExpiredInside();
      for (const row of this.all<JobRow>(
        "SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 20",
      )) {
        try {
          this.actor(row.owner);
        } catch {
          this.settleInside(row, "failed", null, {
            code: "ACCOUNT_SUSPENDED",
            message: "This account cannot process recordings.",
            retryable: false,
          });
          continue;
        }
        const lease = randomUUID();
        this.run(
          "UPDATE jobs SET status='transcribing',lease=?,lease_expires=?,updated=? WHERE id=? AND status='queued'",
          lease,
          Date.now() + 60000,
          Date.now(),
          row.id,
        );
        return this.get<JobRow>("SELECT * FROM jobs WHERE id=?", row.id);
      }
      return undefined;
    });
  }
  heartbeat(id: string, lease: string) {
    return (
      Number(
        this.run(
          `UPDATE jobs SET lease_expires=? WHERE id=? AND lease=? AND status IN ${activeSql} AND status!='queued'`,
          Date.now() + 60000,
          id,
          lease,
        ).changes,
      ) > 0
    );
  }
  private useDailyBudget(bucket: string, amount: number, maximum: number) {
    const id = new Date().toISOString().slice(0, 10) + ":" + bucket;
    const used =
      this.get<{ used: number }>("SELECT used FROM daily_usage WHERE id=?", id)
        ?.used || 0;
    requireValue(
      used + amount <= maximum,
      "QUOTA_EXCEEDED",
      "The daily processing or upload allowance has been reached. Please try again tomorrow.",
      429,
    );
    this.run(
      "INSERT INTO daily_usage VALUES(?,?) ON CONFLICT(id) DO UPDATE SET used=used+excluded.used",
      id,
      amount,
    );
  }
  workerBeat(id: string) {
    this.run(
      "INSERT INTO worker_heartbeats VALUES(?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated",
      id,
      Date.now(),
    );
  }
  workerStopped(id: string) {
    this.run("DELETE FROM worker_heartbeats WHERE id=?", id);
  }
  workerHealthy() {
    return !!this.get(
      "SELECT id FROM worker_heartbeats WHERE updated>? LIMIT 1",
      Date.now() - 30000,
    );
  }
  recoverExpiredJobs() {
    this.transaction(() => this.recoverExpiredInside());
  }
  private recoverExpiredInside() {
    for (const row of this.all<JobRow>(
      `SELECT * FROM jobs WHERE settled=0 AND ((status='queued' AND created<?) OR (status!='queued' AND status IN ${activeSql} AND lease_expires<?))`,
      Date.now() - (this.config.maxQueueWaitMs ?? 600000),
      Date.now(),
    ))
      this.settleInside(row, "failed", null, {
        code: "PROCESSING_FAILED",
        message:
          "Processing timed out or was interrupted. Your reservation was returned.",
        retryable: true,
      });
  }
  jobPage(actor: Actor, cursor?: string) {
    this.actor(actor.id);
    const after = cursor
      ? this.get<{ created: number; id: string }>(
          "SELECT created,id FROM jobs WHERE id=? AND owner=?",
          cursor,
          actor.id,
        )
      : undefined;
    requireValue(!cursor || after, "INVALID_REQUEST", "Invalid task cursor.");
    const rows = this.all<JobRow>(
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
  stage(id: string, lease: string, status: JobStatus, progress: number) {
    requireValue(
      Number(
        this.run(
          `UPDATE jobs SET status=?,progress=?,updated=? WHERE id=? AND lease=? AND status IN ${activeSql} AND status!='queued'`,
          status,
          Math.round(progress),
          Date.now(),
          id,
          lease,
        ).changes,
      ) > 0,
      "JOB_NOT_CANCELLABLE",
      "Processing stopped.",
      409,
    );
  }
}
