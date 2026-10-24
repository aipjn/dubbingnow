import {
  createHmac,
  timingSafeEqual,
  randomUUID,
  createHash,
} from "node:crypto";
import { mkdir, open, rename, unlink, stat } from "node:fs/promises";
import path from "node:path";
import type { ServerConfig } from "./config";
import { BackendError, requireValue } from "./errors";
import { probe } from "./media";
import { Store } from "./store";
import type { UploadRequest } from "../lib/api/types";
interface Ticket {
  scope: "upload" | "result";
  id: string;
  owner: string;
  expires: number;
}
export class PrivateStorage {
  constructor(
    readonly config: ServerConfig,
    readonly store: Store,
  ) {}
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
  verify(token: string | null, scope: Ticket["scope"], id: string): Ticket {
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
    this.store.actor(ticket.owner);
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
    const ticket = this.verify(token, "upload", id),
      actor = this.store.actor(ticket.owner),
      row = this.store.upload(actor, id),
      input: UploadRequest = JSON.parse(row.input);
    this.store.trialReady(actor);
    this.store.rate("put:" + actor.id, 60, 3600000);
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
        this.store.run(
          "UPDATE uploads SET status='writing' WHERE id=? AND status='created'",
          id,
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
      this.store.run("UPDATE uploads SET status='uploaded' WHERE id=?", id);
    } catch (err) {
      await reader.cancel().catch(() => {});
      await handle?.close();
      await unlink(temporary).catch(() => {});
      this.store.run(
        "UPDATE uploads SET status='created' WHERE id=? AND status='writing'",
        id,
      );
      throw err;
    } finally {
      reader.releaseLock();
    }
  }
  async complete(owner: string, id: string) {
    const actor = this.store.actor(owner),
      row = this.store.upload(actor, id);
    this.store.trialReady(actor);
    if (row.status === "complete")
      return {
        id,
        mediaType: "audio" as const,
        durationSeconds: Math.ceil(row.duration!),
      };
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
    const quota = this.store.quota(actor);
    requireValue(
      Math.ceil(meta.duration) <= quota.maxDurationSeconds,
      actor.kind === "guest" ? "TRIAL_LIMIT_EXCEEDED" : "QUOTA_EXCEEDED",
      `Choose a recording up to ${quota.maxDurationSeconds} seconds.`,
      403,
    );
    this.store.run(
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
    try {
      return (await stat(this.file(id, "result"))).isFile();
    } catch {
      return false;
    }
  }
}
