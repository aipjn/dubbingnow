import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ServerConfig } from "../server/config";
import { FishVoice } from "../server/providers/fish";
import { wavHeader } from "../server/media";
const signal = () => new AbortController().signal;
async function fixture(
  options: {
    lostResponse?: boolean;
    rejectCreation?: boolean;
    existing?: boolean;
  } = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), "fish-single-voice-"));
  const config = {
    dataDir: dir,
    fishKey: "test-key-not-real",
    fishModel: "s2.1-pro",
  } as ServerConfig;
  let posts = 0,
    syntheses = 0,
    missing = false;
  const models: { _id: string; state: string; type: string; title: string }[] =
    options.existing
      ? [
          {
            _id: "owned-test-voice",
            type: "tts",
            title: "Existing voice",
            state: "trained",
          },
        ]
      : [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-key-not-real",
    );
    const endpoint = new URL(String(url)).pathname;
    if (endpoint === "/model" && init?.method === "POST") {
      posts++;
      const form = init.body as FormData;
      assert.equal(form.get("visibility"), "private");
      assert.equal(form.get("train_mode"), "fast");
      assert.equal(form.get("generate_sample"), "false");
      assert.ok(form.get("voices") instanceof Blob);
      if (options.rejectCreation) return new Response(null, { status: 402 });
      const model = {
        _id: "one-persistent-voice",
        state: "trained",
        type: "tts",
        title: String(form.get("title")),
      };
      models.push(model);
      if (options.lostResponse) throw new TypeError("response lost");
      return Response.json(model, { status: 201 });
    }
    if (endpoint === "/model")
      return Response.json({ total: models.length, items: models });
    if (endpoint.startsWith("/model/")) {
      if (missing) return new Response(null, { status: 404 });
      return Response.json(
        models.find((m) => m._id === endpoint.slice(7)) || {},
        { status: 200 },
      );
    }
    if (endpoint === "/v1/tts") {
      syntheses++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.reference_id, models[0]._id);
      assert.equal(body.format, "wav");
      assert.equal(body.sample_rate, 24000);
      assert.equal(body.references, undefined);
      return new Response(
        new Uint8Array(Buffer.concat([wavHeader(24000), Buffer.alloc(48000)])),
      );
    }
    throw new Error("Unexpected Fish API request");
  };
  return {
    config,
    dir,
    fetcher,
    models,
    counts: () => ({ posts, syntheses }),
    setMissing: () => {
      missing = true;
    },
    close: () => rm(dir, { recursive: true, force: true }),
  };
}
test("Fish registers exactly one private voice and reuses it across jobs, different reference inputs and process instances", async () => {
  const f = await fixture();
  try {
    const first = await new FishVoice(f.config, f.fetcher).ensure(
      wavHeader(0),
      "Original reference words.",
      signal(),
    );
    const restarted = new FishVoice(f.config, f.fetcher);
    assert.equal(
      await restarted.ensure(
        Buffer.from("different source"),
        "Different source.",
        signal(),
      ),
      first,
    );
    await restarted.speak("Hola.", first, signal());
    await restarted.speak("Bonjour.", first, signal());
    assert.deepEqual(f.counts(), { posts: 1, syntheses: 2 });
    const record = JSON.parse(
      await readFile(path.join(f.dir, "fish-test-voice.json"), "utf8"),
    );
    assert.equal(record.modelId, first);
    assert.equal(record.state, "registered");
    assert.equal(JSON.stringify(record).includes("test-key"), false);
  } finally {
    await f.close();
  }
});
test("Fish adopts the sole existing owned voice without consuming a clone slot", async () => {
  const f = await fixture({ existing: true });
  try {
    assert.equal(
      await new FishVoice(f.config, f.fetcher).ensure(
        wavHeader(0),
        undefined,
        signal(),
      ),
      "owned-test-voice",
    );
    assert.equal(f.counts().posts, 0);
  } finally {
    await f.close();
  }
});
test("a lost creation response is reconciled from the remote inventory without a second POST", async () => {
  const f = await fixture({ lostResponse: true });
  try {
    await assert.rejects(
      new FishVoice(f.config, f.fetcher).ensure(
        wavHeader(0),
        undefined,
        signal(),
      ),
      /interrupted/,
    );
    assert.equal(
      await new FishVoice(f.config, f.fetcher).ensure(
        wavHeader(0),
        undefined,
        signal(),
      ),
      "one-persistent-voice",
    );
    assert.equal(f.counts().posts, 1);
  } finally {
    await f.close();
  }
});
test("a failed or uncertain creation attempt never automatically repeats, and a missing saved voice is not replaced", async () => {
  const f = await fixture({ rejectCreation: true });
  const saved = await fixture({ existing: true });
  try {
    await assert.rejects(
      new FishVoice(f.config, f.fetcher).ensure(
        wavHeader(0),
        undefined,
        signal(),
      ),
      /did not complete/,
    );
    await assert.rejects(
      new FishVoice(f.config, f.fetcher).ensure(
        wavHeader(0),
        undefined,
        signal(),
      ),
      /will not be repeated/,
    );
    assert.equal(f.counts().posts, 1);
    const voice = new FishVoice(saved.config, saved.fetcher);
    await voice.existing(signal());
    saved.setMissing();
    await assert.rejects(
      voice.ensure(wavHeader(0), undefined, signal()),
      /HTTP 404/,
    );
    assert.equal(saved.counts().posts, 0);
  } finally {
    await f.close();
    await saved.close();
  }
});
test("competing Fish provider instances cannot allocate two voice slots", async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        new FishVoice(f.config, f.fetcher).ensure(
          wavHeader(0),
          undefined,
          signal(),
        ),
      ),
    );
    assert.ok(results.some((r) => r.status === "fulfilled"));
    assert.equal(f.counts().posts, 1);
    assert.equal(
      await new FishVoice(f.config, f.fetcher).existing(signal()),
      "one-persistent-voice",
    );
  } finally {
    await f.close();
  }
});
