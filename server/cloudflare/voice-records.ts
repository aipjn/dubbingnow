import { D1Client } from "./d1";
import type { ServerConfig } from "../config";
import { requireValue } from "../errors";

export class VoiceRecords {
  readonly db: D1Client;
  constructor(config: ServerConfig, db?: D1Client) {
    this.db = db || new D1Client(config);
  }
  async get<T>(id: string): Promise<T | undefined> {
    const row = await this.db.get<{ record: string }>(
      "SELECT record FROM voice_records WHERE id=?",
      id,
    );
    return row ? JSON.parse(row.record) : undefined;
  }
  async create(id: string, record: unknown) {
    return (
      await this.db.atomic(async (tx) => {
        if (await this.get(id)) return false;
        tx.run(
          "INSERT INTO voice_records VALUES(?,?,?)",
          id,
          JSON.stringify(record),
          Date.now(),
        );
        return true;
      })
    ).value;
  }
  async save(id: string, record: { title: string; modelId?: string }) {
    await this.db.atomic(async (tx) => {
      const existing = await this.get<{ title: string; modelId?: string }>(id);
      requireValue(
        !existing ||
          (existing.title === record.title &&
            (!existing.modelId || existing.modelId === record.modelId)),
        "SERVICE_UNAVAILABLE",
        "The saved voice changed. No new voice will be created.",
        503,
      );
      tx.run(
        "INSERT INTO voice_records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,updated=excluded.updated",
        id,
        JSON.stringify(record),
        Date.now(),
      );
    });
  }
}
