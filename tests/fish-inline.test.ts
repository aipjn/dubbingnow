import test from "node:test";
import assert from "node:assert/strict";
import { decode } from "@msgpack/msgpack";
import { FishDubbingProvider } from "../server/providers/fish";
import type { ServerConfig } from "../server/config";
import { wavHeader } from "../server/media";

const config = {
  dataDir: "/unused-inline-reference",
  fishKey: "fixture-key",
  fishVoiceId: "old-shared-test-voice",
  fishAllowVoiceCreation: false,
} as ServerConfig;
const signal = () => new AbortController().signal;
const reference = (sample: number) =>
  Buffer.concat([wavHeader(24000), Buffer.alloc(48000, sample)]);

test("default Fish cloning uses the task's audio and transcript, ignoring a configured shared voice", async () => {
  const original = reference(1);
  let calls = 0;
  const provider = new FishDubbingProvider(config, async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, "/v1/tts");
    assert.equal(
      new Headers(init?.headers).get("Content-Type"),
      "application/msgpack",
    );
    const body = decode(init!.body as Uint8Array) as {
      reference_id?: string;
      text: string;
      references: { audio: Uint8Array; text: string }[];
    };
    assert.equal(body.reference_id, undefined);
    assert.equal(body.text, "Hola.");
    assert.equal(body.references[0].text, "Original reference words.");
    assert.deepEqual(Buffer.from(body.references[0].audio), original);
    return new Response(new Uint8Array(reference(0)));
  });
  assert.equal(provider.singleVoiceTest, false);
  assert.equal(await provider.existingVoice(signal()), undefined);
  const voice = await provider.replicate(
    original,
    Buffer.alloc(0),
    signal(),
    "Original reference words.",
  );
  assert.notEqual(voice, config.fishVoiceId);
  await provider.speak(
    "Hola.",
    0,
    "standard",
    "es",
    signal(),
    undefined,
    voice,
  );
  assert.equal(calls, 1, "No saved-model lookup or creation is allowed");
});

test("inline references cannot cross task instances and each task keeps its own speaker audio", async () => {
  const seen: number[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = decode(init!.body as Uint8Array) as {
      references: { audio: Uint8Array }[];
    };
    seen.push(body.references[0].audio.at(-1)!);
    return new Response(new Uint8Array(reference(0)));
  };
  const a = new FishDubbingProvider(config, fetcher, undefined, {
    owner: "a",
    jobId: "one",
  });
  const b = new FishDubbingProvider(config, fetcher, undefined, {
    owner: "b",
    jobId: "two",
  });
  const keyA = await a.replicate(
    reference(1),
    Buffer.alloc(0),
    signal(),
    "Speaker A.",
  );
  const keyB = await b.replicate(
    reference(2),
    Buffer.alloc(0),
    signal(),
    "Speaker B.",
  );
  await assert.rejects(
    async () =>
      b.speak("Hola.", 0, "standard", "es", signal(), undefined, keyA),
    /reference is unavailable/,
  );
  await a.speak("Hola.", 0, "standard", "es", signal(), undefined, keyA);
  await b.speak("Hola.", 0, "standard", "es", signal(), undefined, keyB);
  assert.deepEqual(seen, [1, 2]);
});

test("an inline synthesis failure never falls back to the saved test voice or registers a model", async () => {
  let calls = 0;
  const provider = new FishDubbingProvider(config, async (url) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, "/v1/tts");
    return new Response(null, { status: 402 });
  });
  await assert.rejects(
    async () => provider.replicate(reference(1), Buffer.alloc(0), signal(), ""),
    /original transcript/,
  );
  const key = await provider.replicate(
    reference(1),
    Buffer.alloc(0),
    signal(),
    "Reference speech.",
  );
  await assert.rejects(
    provider.speak("Hola.", 0, "standard", "es", signal(), undefined, key),
    /HTTP 402/,
  );
  assert.equal(calls, 1);
});
