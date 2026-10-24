import { mkdir, readFile, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID, createHash } from "node:crypto";
import type { ServerConfig } from "../config";
import { BackendError, requireValue } from "../errors";
import { GoogleProvider, type VoicePresentation } from "./google";
import type { VoiceTier } from "../../lib/api/types";
import { VoiceRecords } from "../cloudflare/voice-records";

interface Model {
  _id: string;
  state: "created" | "training" | "trained" | "failed";
  type?: string;
  title?: string;
}
interface VoiceRecord {
  version: 1;
  state: "creating" | "registered";
  title: string;
  modelId?: string;
  createdAt: string;
}
type Observe = (request: {
  endpoint: string;
  status: number;
  durationMs: number;
  attempt: number;
}) => void;
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;

/** One durable voice per workspace. No delete/update or inline-clone path is provided. */
export class FishVoice {
  private filename: string;
  private cloud?: VoiceRecords;
  private recordId: string;
  constructor(
    readonly config: ServerConfig,
    private fetcher: typeof fetch = fetch,
    private observe?: Observe,
    private scope?: string,
    voiceRecords?: VoiceRecords,
  ) {
    this.recordId = scope
      ? createHash("sha256").update(scope).digest("hex")
      : "saved-test";
    if (config.persistence === "cloudflare")
      this.cloud = voiceRecords || new VoiceRecords(config);
    this.filename = path.join(
      config.dataDir,
      scope
        ? "fish-voice-" +
            createHash("sha256").update(scope).digest("hex") +
            ".json"
        : "fish-test-voice.json",
    );
  }
  private async request(
    endpoint: string,
    init: RequestInit,
    signal: AbortSignal,
    creation = false,
  ) {
    requireValue(
      this.config.fishKey,
      "SERVICE_UNAVAILABLE",
      "Fish Audio is not configured.",
      503,
    );
    const started = performance.now();
    let status = 0;
    try {
      const response = await this.fetcher(
        `https://api.fish.audio/${endpoint}`,
        {
          ...init,
          redirect: "error",
          headers: {
            ...Object.fromEntries(new Headers(init.headers)),
            Authorization: `Bearer ${this.config.fishKey}`,
          },
          signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
        },
      );
      status = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        throw new BackendError(
          "PROCESSING_FAILED",
          creation
            ? "Fish voice creation did not complete. Check the saved voice before trying again; no second clone will be created automatically."
            : `Fish Audio request failed (HTTP ${status}). The saved test voice will be kept.`,
          502,
          status === 429 || status >= 500,
        );
      }
      return response;
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted();
      if (error instanceof BackendError) throw error;
      throw new BackendError(
        "PROCESSING_FAILED",
        creation
          ? "Fish voice creation was interrupted. Its saved creation record will be checked before any further attempt."
          : "Fish Audio could not be reached. The saved test voice will be kept.",
        502,
        true,
      );
    } finally {
      this.observe?.({
        endpoint: endpoint.startsWith("v1/tts") ? "fish/tts" : "fish/model",
        status,
        durationMs: performance.now() - started,
        attempt: 0,
      });
    }
  }
  private async record(): Promise<VoiceRecord | undefined> {
    try {
      const record = this.cloud
        ? await this.cloud.get<VoiceRecord>(this.recordId)
        : (JSON.parse(await readFile(this.filename, "utf8")) as VoiceRecord);
      if (!record) return undefined;
      requireValue(
        record.version === 1 &&
          ["creating", "registered"].includes(record.state) &&
          typeof record.title === "string" &&
          (!record.modelId || idPattern.test(record.modelId)),
        "SERVICE_UNAVAILABLE",
        "The saved Fish voice record needs attention. No new voice will be created.",
        503,
      );
      return record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      if (error instanceof BackendError) throw error;
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "The saved Fish voice record cannot be read. No new voice will be created.",
        503,
      );
    }
  }
  private async save(record: VoiceRecord) {
    if (this.cloud) {
      await this.cloud.save(this.recordId, record);
      return;
    }
    await mkdir(this.config.dataDir, { recursive: true, mode: 0o700 });
    const temporary = this.filename + "." + randomUUID() + ".tmp";
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(record, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, this.filename);
    const directory = await open(this.config.dataDir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async models(signal: AbortSignal): Promise<Model[]> {
    const response = await this.request(
      "model?self=true&page_size=100&page_number=1",
      {},
      signal,
    );
    const data = await response.json();
    requireValue(
      Array.isArray(data.items),
      "PROCESSING_FAILED",
      "Fish returned no voice inventory.",
      502,
    );
    return data.items.filter((m: Model) => m.type === "tts");
  }
  private async ready(id: string, signal: AbortSignal) {
    requireValue(
      idPattern.test(id),
      "SERVICE_UNAVAILABLE",
      "Invalid saved Fish voice ID.",
      503,
    );
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await this.request(
        `model/${encodeURIComponent(id)}`,
        {},
        signal,
      );
      const model = (await response.json()) as Model;
      requireValue(
        model._id === id && model.state !== "failed",
        "PROCESSING_FAILED",
        "The saved Fish voice is unavailable. It will not be replaced automatically.",
        502,
      );
      if (model.state === "trained") return id;
      requireValue(
        ["created", "training"].includes(model.state),
        "PROCESSING_FAILED",
        "Fish returned an invalid voice state.",
        502,
      );
      await delay(1000, undefined, { signal });
    }
    throw new BackendError(
      "PROCESSING_FAILED",
      "The saved Fish voice is still preparing. Retry this job later using the same voice.",
      502,
      true,
    );
  }
  async existing(signal: AbortSignal): Promise<string | undefined> {
    if (!this.scope && this.config.fishVoiceId)
      return this.ready(this.config.fishVoiceId, signal);
    const record = await this.record();
    if (record?.modelId) return this.ready(record.modelId, signal);
    // A production task must never adopt the account's sole (or another task's) voice.
    if (this.scope && !record) return undefined;
    const models = await this.models(signal);
    const candidates = record
      ? models.filter((m) => m.title === record.title)
      : models;
    if (candidates.length === 1) {
      const model = candidates[0];
      await this.save({
        version: 1,
        state: "registered",
        title: model.title || "Saved test voice",
        modelId: model._id,
        createdAt: record?.createdAt || new Date().toISOString(),
      });
      return this.ready(model._id, signal);
    }
    requireValue(
      candidates.length === 0 && (this.scope || models.length === 0),
      "SERVICE_UNAVAILABLE",
      "Select the existing Fish test voice with FISH_REFERENCE_ID. No new voice will be created.",
      503,
    );
    requireValue(
      !record,
      "SERVICE_UNAVAILABLE",
      "A Fish voice creation attempt is already recorded. Check Fish and the saved record; creation will not be repeated automatically.",
      503,
    );
    return undefined;
  }
  async ensure(
    reference: Buffer,
    text: string | undefined,
    signal: AbortSignal,
  ) {
    const saved = await this.existing(signal);
    if (saved) return saved;
    requireValue(
      !this.scope || this.config.fishAllowVoiceCreation === true,
      "SERVICE_UNAVAILABLE",
      "Voice creation is not enabled for this service. No new voice was created.",
      503,
    );
    if (this.cloud) {
      const record: VoiceRecord = {
        version: 1,
        state: "creating",
        title: `DubbingNow ${this.scope ? "private" : "test"} ${randomUUID()}`,
        createdAt: new Date().toISOString(),
      };
      // Claim the creation intent in D1 before calling Fish; a crashed or timed-out
      // process cannot create a second voice from another server instance.
      if (!(await this.cloud.create(this.recordId, record))) {
        const voice = await this.existing(signal);
        requireValue(
          voice,
          "SERVICE_UNAVAILABLE",
          "This voice is already being created. Retry later; no extra voice was created.",
          503,
          true,
        );
        return voice;
      }
      return this.create(record, reference, text, signal);
    }
    await mkdir(this.config.dataDir, { recursive: true, mode: 0o700 });
    const lock = this.filename + ".lock";
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(lock, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Another process may still be registering this one voice. Never steal its lock.
      for (let attempt = 0; attempt < 30; attempt++) {
        const record = await this.record();
        if (record?.modelId) return this.ready(record.modelId, signal);
        await delay(1000, undefined, { signal });
      }
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "The single Fish test voice is being registered. Retry later; no extra voice will be created.",
        503,
        true,
      );
    }
    try {
      const voice = await this.existing(signal);
      if (voice) return voice;
      const record: VoiceRecord = {
        version: 1,
        state: "creating",
        title: `DubbingNow ${this.scope ? "private" : "test"} ${randomUUID()}`,
        createdAt: new Date().toISOString(),
      };
      // Durable intent BEFORE the only POST. Timeouts, crashes and errors never trigger a repeat POST.
      await this.save(record);
      return await this.create(record, reference, text, signal);
    } finally {
      await handle.close();
      await rm(lock, { force: true });
    }
  }
  private async create(
    record: VoiceRecord,
    reference: Buffer,
    text: string | undefined,
    signal: AbortSignal,
  ) {
    const body = new FormData();
    body.set("type", "tts");
    body.set("title", record.title);
    body.set("train_mode", "fast");
    body.set("visibility", "private");
    body.set("enhance_audio_quality", "false");
    body.set("generate_sample", "false");
    body.append(
      "voices",
      new Blob([new Uint8Array(reference)], { type: "audio/wav" }),
      "reference.wav",
    );
    if (text) body.append("texts", text);
    const response = await this.request(
      "model",
      { method: "POST", body },
      signal,
      true,
    );
    const model = (await response.json()) as Model;
    requireValue(
      typeof model._id === "string" && idPattern.test(model._id),
      "PROCESSING_FAILED",
      "Fish returned no voice ID. The creation record was retained; no automatic recreation will occur.",
      502,
    );
    await this.save({ ...record, state: "registered", modelId: model._id });
    return this.ready(model._id, signal);
  }
  async speak(text: string, voice: string, signal: AbortSignal) {
    requireValue(
      idPattern.test(voice),
      "PROCESSING_FAILED",
      "A saved Fish voice is required.",
      502,
    );
    const response = await this.request(
      "v1/tts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          model: this.config.fishModel || "s2.1-pro-free",
        },
        body: JSON.stringify({
          text,
          reference_id: voice,
          format: "wav",
          sample_rate: 24000,
          latency: "normal",
          temperature: 0.5,
          top_p: 0.7,
        }),
      },
      signal,
    );
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        requireValue(
          size <= 16 * 1024 * 1024,
          "PROCESSING_FAILED",
          "Fish returned too much audio.",
          502,
        );
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const wav = Buffer.concat(chunks);
    requireValue(
      wav.length >= 44 &&
        wav.toString("ascii", 0, 4) === "RIFF" &&
        wav.toString("ascii", 8, 12) === "WAVE",
      "PROCESSING_FAILED",
      "Fish returned invalid WAV audio. The saved voice will be kept.",
      502,
    );
    return wav;
  }
}

export class FishDubbingProvider extends GoogleProvider {
  readonly cloneProvider = "fish" as const;
  readonly requiresConsentRecording = false;
  readonly singleVoiceTest: boolean;
  private fish: FishVoice;
  private fetcherForVoice: typeof fetch;
  private observeVoice?: Observe;
  private scope?: { owner: string; jobId: string };
  constructor(
    config: ServerConfig,
    fetcher: typeof fetch = fetch,
    observe?: Observe,
    scope?: { owner: string; jobId: string },
  ) {
    super(config, fetcher, observe);
    this.fish = new FishVoice(config, fetcher, observe);
    this.fetcherForVoice = fetcher;
    this.observeVoice = observe;
    this.singleVoiceTest = config.fishVoiceMode !== "per_job";
    this.scope = scope;
    if (!this.singleVoiceTest)
      requireValue(
        scope?.owner && scope?.jobId,
        "SERVICE_UNAVAILABLE",
        "Private voice task context is required.",
        503,
      );
  }
  existingVoice(signal: AbortSignal) {
    if (!this.singleVoiceTest) return Promise.resolve(undefined);
    return this.fish.existing(signal);
  }
  replicate(
    reference: Buffer,
    _consent: Buffer,
    signal: AbortSignal,
    referenceText?: string,
    speaker = 0,
  ) {
    if (this.singleVoiceTest)
      return this.fish.ensure(reference, referenceText, signal);
    requireValue(
      Number.isInteger(speaker) && speaker >= 0 && speaker <= 7,
      "INVALID_REQUEST",
      "Invalid speaker.",
    );
    const scope = `${this.scope!.owner}:${this.scope!.jobId}:${speaker}`;
    return new FishVoice(
      this.config,
      this.fetcherForVoice,
      this.observeVoice,
      scope,
    ).ensure(reference, referenceText, signal);
  }
  speak(
    text: string,
    speaker: number,
    tier: VoiceTier,
    language: string,
    signal: AbortSignal,
    presentation?: VoicePresentation,
    voice?: string,
  ) {
    requireValue(
      voice,
      "PROCESSING_FAILED",
      "The saved Fish test voice is required for cloning.",
      502,
    );
    return this.fish.speak(text, voice, signal);
  }
}
