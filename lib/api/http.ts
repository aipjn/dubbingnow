import { auth0Identity, type IdentityBridge } from "../auth0";
import { ApiError, isErrorBody } from "./errors";
import type {
  BillingPlan,
  BillingPolicy,
  CheckoutStatus,
  CreditHistory,
  Quote,
  QuoteRequest,
  UserList,
  User,
  ManagedUser,
  Capabilities,
  Checkout,
  CheckoutRequest,
  CreateJobRequest,
  DubbingApi,
  Job,
  JobHistory,
  Quota,
  Session,
  UploadedMedia,
  UploadRequest,
  UploadTicket,
} from "./types";

const SESSION_KEY = "dubbingnow.session.v1";
export class HttpDubbingApi implements DubbingApi {
  readonly mode = "live" as const;
  private session: Session | null = null;
  private sessionPromise: Promise<Session> | null = null;
  constructor(
    private baseUrl: string,
    private identity: IdentityBridge = auth0Identity,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    authorized = true,
  ): Promise<T> {
    const session = authorized
      ? await this.getSession(init.signal || undefined)
      : null;
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (session) headers.set("Authorization", `Bearer ${session.token}`);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1${path}`, {
        ...init,
        headers,
        cache: "no-store",
        credentials: "omit",
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiError(
        "NETWORK_ERROR",
        "We couldn’t reach the dubbing service. Check your connection and try again.",
        true,
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isErrorBody(body))
        throw new ApiError(
          body.error.code,
          body.error.message,
          body.error.retryable,
          response.status,
          body.error.requestId,
        );
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "The dubbing service is temporarily unavailable.",
        response.status >= 500,
        response.status,
      );
    }
    if (body === null)
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "The service returned an invalid response.",
        true,
      );
    return body as T;
  }

  async getSession(signal?: AbortSignal): Promise<Session> {
    if (this.sessionPromise) return this.sessionPromise;
    this.sessionPromise = this.restoreSession(signal).finally(() => {
      this.sessionPromise = null;
    });
    return this.sessionPromise;
  }
  private async restoreSession(signal?: AbortSignal): Promise<Session> {
    const identity = await this.identity.getToken();
    if (identity) {
      const user =
        this.session?.user ||
        (await this.request<User>(
          "/users/me",
          { signal, headers: { Authorization: `Bearer ${identity.token}` } },
          false,
        ));
      this.session = { id: user.id, ...identity, user };
      return this.session;
    }
    if (this.session?.user)
      throw new ApiError(
        "UNAUTHORIZED",
        "Your login expired. Sign in again to access your credits.",
        false,
        401,
      );
    if (this.session && Date.parse(this.session.expiresAt) > Date.now())
      return this.session;
    let saved: Session | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    if (saved?.token && !saved.user) {
      if (Date.parse(saved.expiresAt) <= Date.now())
        throw new ApiError(
          "UNAUTHORIZED",
          "Your guest session has expired. Sign in or contact support to recover it.",
          false,
          401,
        );
      this.session = { ...saved, user: null };
      return this.session;
    }
    const guest = await this.request<Session>(
      "/sessions",
      { method: "POST", body: "{}", signal },
      false,
    );
    this.session = guest;
    localStorage.setItem(SESSION_KEY, JSON.stringify(guest));
    return guest;
  }
  getPolicy(signal?: AbortSignal) {
    return this.request<BillingPolicy>("/billing/policy", { signal }, false);
  }
  verifyGuest(input: { token: string }, signal?: AbortSignal) {
    return this.request<Quota>("/guest/verify", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });
  }
  async login(mode: "login" | "register", returnTo: string) {
    await this.identity.login(mode, returnTo);
  }
  async logout() {
    this.session = null;
    await this.identity.logout();
  }
  async updateProfile(input: { displayName: string }) {
    const user = await this.request<User>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    if (this.session) this.session = { ...this.session, user };
    return user;
  }
  getCreditHistory(cursor?: string) {
    return this.request<CreditHistory>(
      `/credits/transactions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
  }
  quoteJob(input: QuoteRequest, signal?: AbortSignal) {
    return this.request<Quote>("/jobs/quote", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });
  }
  listUsers(query = "", cursor?: string) {
    const params = new URLSearchParams({ query });
    if (cursor) params.set("cursor", cursor);
    return this.request<UserList>(`/admin/users?${params}`);
  }
  updateUser(id: string, input: { status: User["status"] }) {
    return this.request<ManagedUser>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  adjustCredits(
    id: string,
    input: { deltaCredits: number; reason: string },
    key: string,
  ) {
    return this.request<ManagedUser>(
      `/admin/users/${encodeURIComponent(id)}/credits`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(input),
      },
    );
  }
  updatePolicy(input: BillingPolicy) {
    return this.request<BillingPolicy>("/admin/billing/policy", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
  getCapabilities(signal?: AbortSignal) {
    return this.request<Capabilities>("/capabilities", { signal }, false);
  }
  getQuota(signal?: AbortSignal) {
    return this.request<Quota>("/quota", { signal });
  }
  createUpload(input: UploadRequest, signal?: AbortSignal) {
    return this.request<UploadTicket>("/uploads", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });
  }
  uploadFile(
    ticket: UploadTicket,
    file: Blob,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.timeout = 120000;
      xhr.open(ticket.method, ticket.url);
      for (const [key, value] of Object.entries(ticket.headers))
        xhr.setRequestHeader(key, value);
      const abort = () => xhr.abort();
      const cleanup = () => signal?.removeEventListener("abort", abort);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else
          reject(
            new ApiError(
              "UPLOAD_INCOMPLETE",
              "Upload failed. Please upload the file again.",
              true,
              xhr.status,
            ),
          );
      };
      xhr.onerror = () => {
        cleanup();
        reject(
          new ApiError(
            "NETWORK_ERROR",
            "Upload interrupted. Check your connection and retry.",
            true,
          ),
        );
      };
      xhr.ontimeout = () => {
        cleanup();
        reject(
          new ApiError(
            "NETWORK_ERROR",
            "The upload timed out. Check your connection and try again.",
            true,
          ),
        );
      };
      xhr.onabort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      xhr.send(file);
    });
  }
  completeUpload(id: string, signal?: AbortSignal) {
    return this.request<UploadedMedia>(
      `/uploads/${encodeURIComponent(id)}/complete`,
      { method: "POST", body: "{}", signal },
    );
  }
  createJob(input: CreateJobRequest, key: string, signal?: AbortSignal) {
    return this.request<Job>("/jobs", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(input),
      signal,
    });
  }
  getJob(id: string, signal?: AbortSignal) {
    return this.request<Job>(`/jobs/${encodeURIComponent(id)}`, { signal });
  }
  listJobs(cursor?: string, signal?: AbortSignal) {
    return this.request<JobHistory>(
      `/jobs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal },
    );
  }
  cancelJob(id: string, signal?: AbortSignal) {
    return this.request<Job>(`/jobs/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: "{}",
      signal,
    });
  }
  getPlans(signal?: AbortSignal) {
    return this.request<BillingPlan[]>("/billing/plans", { signal }, false);
  }
  getCheckout(id: string, signal?: AbortSignal) {
    return this.request<CheckoutStatus>(
      `/billing/checkouts/${encodeURIComponent(id)}`,
      { signal },
    );
  }
  createCheckout(input: CheckoutRequest, key: string, signal?: AbortSignal) {
    return this.request<Checkout>("/billing/checkout", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(input),
      signal,
    });
  }
}
