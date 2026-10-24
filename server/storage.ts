import {
  createHmac,
  timingSafeEqual,
  randomUUID,
  createHash,
} from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  rename,
  unlink,
  stat,
  rm,
} from "node:fs/promises";
import path from "node:path";
import type { ServerConfig } from "./config";
import { BackendError, requireValue } from "./errors";
import { probe } from "./media";
import type { DataStore } from "./persistence";
import { R2Storage } from "./cloudflare/r2";
import type { UploadRow } from "./store";
import type { UploadRequest } from "../lib/api/types";
interface Ticket {
  scope: "upload" | "result";
  id: string;
  owner: string;
  expires: number;
}
export class PrivateStorage {
  readonly r2?: R2Storage;
  constructor(
    readonly config: ServerConfig,
    readonly store: DataStore,
    r2?: R2Storage,
  ) {
    this.r2 =
      r2 ||
      (config.persistence === "cloudflare" ? new R2Storage(config) : undefined);
  }
  file(id: string, scope: "upload" | "result") {
    requireValue(
      /^[a-f0-9-]{36}$/.test(id),
      "INVALID_REQUEST",
      "Invalid resource ID.",
    );
    return path.join(
      this.config.dataDir,
      scope === "upload" ? "uploads" : "results",
      scope === "upload" ? id : `${id}.wav`,
    );
  }
  sign(ticket: Ticket) {
    const data = Buffer.from(JSON.stringify(ticket)).toString("base64url"),
      signature = createHmac("sha256", this.config.signingSecret)
        .update(data)
        .digest("base64url");
    return `${data}.${signature}`;
  }
  async verify(
    token: string | null,
    scope: Ticket["scope"],
    id: string,
  ): Promise<Ticket> {
    requireValue(
      token && token.length < 2048,
      "UNAUTHORIZED",
      "A valid file authorization is required.",
      401,
    );
    const [data, signature, ...extra] = token.split(".");
    const actual = createHmac("sha256", this.config.signingSecret)
        .update(data)
        .digest(),
      provided = Buffer.from(signature || "", "base64url");
    requireValue(
      !extra.length &&
        provided.length === actual.length &&
        timingSafeEqual(actual, provided),
      "UNAUTHORIZED",
      "Invalid file authorization.",
      401,
    );
    let ticket: Ticket;
    try {
      ticket = JSON.parse(Buffer.from(data, "base64url").toString());
    } catch {
      throw new BackendError(
        "UNAUTHORIZED",
        "Invalid file authorization.",
        401,
      );
    }
    requireValue(
      ticket &&
        ticket.scope === scope &&
        ticket.id === id &&
        typeof ticket.owner === "string" &&
        Number.isSafeInteger(ticket.expires),
      "UNAUTHORIZED",
      "Invalid file authorization.",
      401,
    );
    requireValue(
      ticket.expires > Date.now(),
      scope === "upload" ? "UPLOAD_EXPIRED" : "RESULT_EXPIRED",
      "File authorization expired. Refresh the link.",
      410,
    );
    await this.store.actor(ticket.owner);
    return ticket;
  }
  url(
    scope: Ticket["scope"],
    id: string,
    owner: string,
    expires = Date.now() + 900000,
  ) {
    const token = this.sign({ scope, id, owner, expires });
    return `${this.config.origin}/v1/files/${scope}/${encodeURIComponent(id)}?ticket=${encodeURIComponent(token)}`;
  }
  async put(request: Request, id: string, token: string | null) {
    requireValue(
      !this.r2,
      "INVALID_REQUEST",
      "Use the direct R2 upload URL supplied by the upload ticket.",
    );
    const ticket = await this.verify(token, "upload", id),
      actor = await this.store.actor(ticket.owner),
      row = await this.store.upload(actor, id),
      input: UploadRequest = JSON.parse(row.input);
    await this.store.trialReady(actor);
    await this.store.rate("put:" + actor.id, 60, 3600000);
    requireValue(
      request.headers.get("content-type")?.split(";")[0] === input.contentType,
      "UNSUPPORTED_MEDIA",
      "The upload content type does not match its ticket.",
      415,
    );
    const length = request.headers.get("content-length");
    if (length)
      requireValue(
        Number(length) === input.sizeBytes,
        "UPLOAD_INCOMPLETE",
        "The uploaded size does not match its ticket.",
      );
    requireValue(request.body, "UPLOAD_INCOMPLETE", "The upload is empty.");
    requireValue(
      Number(
        (
          await this.store.run(
            "UPDATE uploads SET status='writing' WHERE id=? AND status='created'",
            id,
          )
        ).changes,
      ) === 1,
      "UPLOAD_INCOMPLETE",
      "This upload is already being received or completed.",
      409,
    );
    const filename = this.file(id, "upload"),
      temporary = filename + "." + randomUUID() + ".part";
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    const reader = request.body.getReader();
    let total = 0;
    try {
      await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
      handle = await open(temporary, "wx", 0o600);
      const hash = createHash("sha256");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        requireValue(
          total <= input.sizeBytes && total <= this.config.maxFileBytes,
          "FILE_TOO_LARGE",
          "This upload exceeds its authorized size.",
          413,
        );
        hash.update(value);
        let offset = 0;
        while (offset < value.length) {
          const { bytesWritten } = await handle.write(
            value,
            offset,
            value.length - offset,
          );
          offset += bytesWritten;
        }
      }
      requireValue(
        total === input.sizeBytes && hash.digest("hex") === input.sha256,
        "UPLOAD_INCOMPLETE",
        "The uploaded bytes do not match the file hash and size.",
      );
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, filename);
      await this.store.run(
        "UPDATE uploads SET status='uploaded' WHERE id=?",
        id,
      );
    } catch (err) {
      await reader.cancel().catch(() => {});
      await handle?.close();
      await unlink(temporary).catch(() => {});
      await this.store.run(
        "UPDATE uploads SET status='created' WHERE id=? AND status='writing'",
        id,
      );
      throw err;
    } finally {
      reader.releaseLock();
    }
  }
  async complete(owner: string, id: string) {
    const actor = await this.store.actor(owner),
      row = await this.store.upload(actor, id);
    await this.store.trialReady(actor);
    if (row.status === "complete")
      return {
        id,
        mediaType: "audio" as const,
        durationSeconds: Math.ceil(row.duration!),
      };
    if (this.r2) return this.completeR2(actor.id, row);
    requireValue(
      row.status === "uploaded",
      "UPLOAD_INCOMPLETE",
      "The file has not finished uploading.",
    );
    const meta = await probe(this.config, this.file(id, "upload")),
      input: UploadRequest = JSON.parse(row.input);
    const valid =
      input.contentType === "audio/mp4"
        ? meta.codec === "aac" && /mov|mp4|m4a/.test(meta.format)
        : input.contentType === "audio/mpeg"
          ? meta.codec === "mp3" && meta.format.includes("mp3")
          : meta.format.includes("wav") && meta.codec.startsWith("pcm_");
    requireValue(
      valid,
      "UNSUPPORTED_MEDIA",
      "The actual audio format does not match the upload ticket.",
      415,
    );
    const quota = await this.store.quota(actor);
    requireValue(
      Math.ceil(meta.duration) <= quota.maxDurationSeconds,
      actor.kind === "guest" ? "TRIAL_LIMIT_EXCEEDED" : "QUOTA_EXCEEDED",
      `Choose a recording up to ${quota.maxDurationSeconds} seconds.`,
      403,
    );
    await this.store.run(
      "UPDATE uploads SET status='complete',duration=? WHERE id=? AND status IN ('uploaded','complete')",
      meta.duration,
      id,
    );
    return {
      id,
      mediaType: "audio" as const,
      durationSeconds: Math.ceil(meta.duration),
    };
  }
  async resultExists(id: string) {
    if (this.r2) {
      const key = await this.resultKey(id);
      return !!key && !!(await this.r2.head(key));
    }
    try {
      return (await stat(this.file(id, "result"))).isFile();
    } catch {
      return false;
    }
  }
  async uploadTicket(row: UploadRow, input: UploadRequest) {
    const destination = this.r2
      ? await this.r2.uploadUrl(row.id, input, row.expires)
      : {
          url: this.url("upload", row.id, row.owner, row.expires),
          method: "PUT" as const,
          headers: { "Content-Type": input.contentType },
        };
    return {
      id: row.id,
      ...destination,
      expiresAt: new Date(row.expires).toISOString(),
    };
  }
  private async completeR2(owner: string, row: UploadRow) {
    const input: UploadRequest = JSON.parse(row.input),
      key = `uploads/${row.id}`;
    requireValue(
      row.status === "created" || row.status === "uploaded",
      "UPLOAD_INCOMPLETE",
      "The upload is not ready.",
      409,
    );
    const meta = await this.r2!.head(key);
    requireValue(
      meta &&
        meta.ContentLength === input.sizeBytes &&
        meta.ContentType === input.contentType,
      "UPLOAD_INCOMPLETE",
      "The stored size or content type does not match its upload ticket.",
    );
    const work = path.join(this.config.dataDir, "work");
    await mkdir(work, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(path.join(work, "verify-"));
    try {
      const filename = path.join(dir, "source");
      await this.r2!.download(key, filename, input.sizeBytes, input.sha256);
      const audio = await probe(this.config, filename);
      const valid =
        input.contentType === "audio/mp4"
          ? audio.codec === "aac" && /mov|mp4|m4a/.test(audio.format)
          : input.contentType === "audio/mpeg"
            ? audio.codec === "mp3" && audio.format.includes("mp3")
            : audio.format.includes("wav") && audio.codec.startsWith("pcm_");
      requireValue(
        valid,
        "UNSUPPORTED_MEDIA",
        "The actual audio format does not match the upload ticket.",
        415,
      );
      const actor = await this.store.actor(owner),
        quota = await this.store.quota(actor);
      await this.store.trialReady(actor);
      requireValue(
        Math.ceil(audio.duration) <= quota.maxDurationSeconds,
        actor.kind === "guest" ? "TRIAL_LIMIT_EXCEEDED" : "QUOTA_EXCEEDED",
        `Choose a recording up to ${quota.maxDurationSeconds} seconds.`,
        403,
      );
      await this.store.run(
        "UPDATE uploads SET status='complete',duration=? WHERE id=? AND status IN ('created','uploaded')",
        audio.duration,
        row.id,
      );
      return {
        id: row.id,
        mediaType: "audio" as const,
        durationSeconds: Math.ceil(audio.duration),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  async sourceFile(row: UploadRow, dir: string) {
    if (!this.r2) return this.file(row.id, "upload");
    const input: UploadRequest = JSON.parse(row.input),
      filename = path.join(dir, `source-${row.id}`);
    await this.r2.download(
      `uploads/${row.id}`,
      filename,
      input.sizeBytes,
      input.sha256,
    );
    return filename;
  }
  async publish(id: string, lease: string, filename: string) {
    if (this.r2) {
      const key = `results/${id}/${lease}.wav`;
      await this.r2.publish(key, filename, (await stat(filename)).size);
      return key;
    }
    const final = this.file(id, "result");
    await mkdir(path.dirname(final), { recursive: true, mode: 0o700 });
    await rename(filename, final);
    return final;
  }
  async removeResult(key: string) {
    if (this.r2) await this.r2.remove(key);
    else await rm(key, { force: true });
  }
  async resultKey(id: string) {
    const row = await this.store.get<{ result: string | null }>(
      "SELECT result FROM jobs WHERE id=?",
      id,
    );
    const key = row?.result
      ? (JSON.parse(row.result) as { _storageKey?: string })._storageKey
      : undefined;
    return key &&
      key.startsWith(`results/${id}/`) &&
      /^results\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.wav$/.test(key)
      ? key
      : undefined;
  }
}
