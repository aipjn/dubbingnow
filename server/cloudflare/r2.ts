import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { ServerConfig } from "../config";
import type { UploadRequest } from "../../lib/api/types";
import { requireValue } from "../errors";

export class R2Storage {
  readonly client: S3Client;
  constructor(
    readonly config: ServerConfig,
    client?: S3Client,
  ) {
    requireValue(
      config.cloudflareAccountId &&
        config.r2Bucket &&
        config.r2AccessKeyId &&
        config.r2SecretAccessKey,
      "SERVICE_UNAVAILABLE",
      "Cloudflare R2 is not configured.",
      503,
    );
    this.client =
      client ||
      new S3Client({
        region: "auto",
        endpoint: `https://${config.cloudflareAccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.r2AccessKeyId!,
          secretAccessKey: config.r2SecretAccessKey!,
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 10000, requestTimeout: 120000 },
      });
  }
  private object(Key: string) {
    return { Bucket: this.config.r2Bucket!, Key };
  }
  async uploadUrl(id: string, input: UploadRequest, expires: number) {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        ...this.object(`uploads/${id}`),
        ContentType: input.contentType,
        ContentLength: input.sizeBytes,
        IfNoneMatch: "*",
      }),
      {
        expiresIn: Math.max(1, Math.floor((expires - Date.now()) / 1000)),
        signableHeaders: new Set([
          "content-type",
          "content-length",
          "if-none-match",
        ]),
      },
    );
    return {
      url,
      method: "PUT" as const,
      headers: { "Content-Type": input.contentType, "If-None-Match": "*" },
    };
  }
  async head(key: string) {
    try {
      return await this.client.send(new HeadObjectCommand(this.object(key)));
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode: number } }).$metadata
          ?.httpStatusCode === 404
      )
        return undefined;
      throw error;
    }
  }
  async download(
    key: string,
    filename: string,
    limit: number,
    expectedHash?: string,
  ) {
    const object = await this.client.send(
      new GetObjectCommand(this.object(key)),
    );
    requireValue(
      object.Body && object.ContentLength && object.ContentLength <= limit,
      "UPLOAD_INCOMPLETE",
      "The stored recording does not match its upload ticket.",
      400,
    );
    const handle = await open(filename, "wx", 0o600),
      hash = createHash("sha256");
    let total = 0;
    try {
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        requireValue(
          total <= limit,
          "FILE_TOO_LARGE",
          "The stored recording exceeds its upload ticket.",
          413,
        );
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length)
          offset += (await handle.write(chunk, offset, chunk.length - offset))
            .bytesWritten;
      }
      requireValue(
        total === object.ContentLength &&
          (!expectedHash || hash.digest("hex") === expectedHash),
        "UPLOAD_INCOMPLETE",
        "The stored recording failed its size or hash check.",
      );
    } finally {
      await handle.close();
      (object.Body as { destroy?: () => void }).destroy?.();
    }
  }
  async publish(
    key: string,
    filename: string,
    size: number,
    contentType = "audio/wav",
  ) {
    await this.client.send(
      new PutObjectCommand({
        ...this.object(key),
        Body: createReadStream(filename),
        ContentLength: size,
        ContentType: contentType,
        IfNoneMatch: "*",
      }),
    );
  }
  async resultUrl(key: string, head = false, downloadFilename?: string) {
    return getSignedUrl(
      this.client,
      head
        ? new HeadObjectCommand(this.object(key))
        : new GetObjectCommand({
            ...this.object(key),
            ResponseContentType: "audio/wav",
            ...(downloadFilename
              ? {
                  ResponseContentDisposition: `attachment; filename="${downloadFilename}"`,
                }
              : {}),
          }),
      { expiresIn: 300 },
    );
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand(this.object(key)));
  }
}
