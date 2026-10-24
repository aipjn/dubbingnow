import { setTimeout as delay } from "node:timers/promises";
import type { ServerConfig } from "../config";
import { BackendError } from "../errors";

export type SqlValue = string | number | null;
export interface Statement {
  sql: string;
  params: SqlValue[];
}
export interface QueryResult {
  results: Record<string, unknown>[];
  meta: { changes: number };
}
export class D1Failure extends Error {}
export class Mutation {
  readonly statements: Statement[] = [];
  run(sql: string, ...params: SqlValue[]) {
    this.statements.push({ sql, params });
  }
}

/** Business writes use a revision fence inside an atomic D1 batch. Independent
 * rate/heartbeat rows and non-terminal stage updates use conditional single SQL statements. */
export class D1Client {
  constructor(
    readonly config: ServerConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  async batch(statements: Statement[]): Promise<QueryResult[]> {
    if (
      !this.config.cloudflareAccountId ||
      !this.config.d1DatabaseId ||
      !this.config.d1ApiToken
    )
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "Cloudflare D1 is not configured.",
        503,
      );
    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.cloudflare.com/client/v4/accounts/${this.config.cloudflareAccountId}/d1/database/${this.config.d1DatabaseId}/query`,
        {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${this.config.d1ApiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ batch: statements }),
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      // An interrupted write may have committed. Never replay a non-idempotent batch blindly.
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "Cloudflare D1 could not be reached. Retry the original request with the same request key.",
        503,
        true,
      );
    }
    const data = (await response.json()) as {
      success: boolean;
      result?: (QueryResult & { success: boolean; error?: string })[];
      errors?: { message: string }[];
    };
    if (!response.ok || !data.success || data.result?.some((r) => !r.success)) {
      const message = [
        ...(data.errors?.map((e) => e.message) || []),
        ...(data.result?.map((r) => r.error || "") || []),
      ].join(" ");
      if (
        message.includes("mutation_revision.version") ||
        message.includes("optimistic_revision")
      )
        throw new D1Failure("revision conflict");
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "Cloudflare D1 could not complete the operation.",
        503,
        true,
      );
    }
    if (!data.result || data.result.length !== statements.length)
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "Cloudflare D1 returned an incomplete response.",
        503,
        true,
      );
    return data.result;
  }
  async all<T>(sql: string, ...params: SqlValue[]) {
    return (await this.batch([{ sql, params }]))[0].results as T[];
  }
  async get<T>(sql: string, ...params: SqlValue[]) {
    return (await this.all<T>(sql, ...params))[0];
  }
  async atomic<T>(
    plan: (mutation: Mutation) => Promise<T>,
  ): Promise<{ value: T; results: QueryResult[] }> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const before = await this.get<{ version: number }>(
        "SELECT version FROM mutation_revision WHERE id=1",
      );
      if (!before)
        throw new BackendError(
          "SERVICE_UNAVAILABLE",
          "Apply the Cloudflare database migration first.",
          503,
        );
      const mutation = new Mutation();
      let value: T;
      try {
        value = await plan(mutation);
      } catch (error) {
        // A concurrent mutation can invalidate a business precondition, including idempotency reads.
        const after = await this.get<{ version: number }>(
          "SELECT version FROM mutation_revision WHERE id=1",
        );
        if (after?.version !== before.version) {
          await delay(10 * (attempt + 1));
          continue;
        }
        throw error;
      }
      if (!mutation.statements.length) return { value, results: [] };
      try {
        const results = await this.batch([
          {
            sql: "UPDATE mutation_revision SET version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE id=1",
            params: [before.version],
          },
          ...mutation.statements,
        ]);
        return { value, results: results.slice(1) };
      } catch (error) {
        if (!(error instanceof D1Failure)) throw error;
        await delay(10 * (attempt + 1));
      }
    }
    throw new BackendError(
      "SERVICE_UNAVAILABLE",
      "The database is busy. Please retry shortly.",
      503,
      true,
    );
  }
}
