import test from "node:test";
import assert from "node:assert/strict";
import { GoogleProvider } from "../server/providers/google";
import type { ServerConfig } from "../server/config";
import { wavHeader } from "../server/media";
const config = {
  googleKey: "test-only-key",
  textModel: "text-test-model",
  fidelityTtsModel: "tts-test-model",
} as ServerConfig;
const signal = () => new AbortController().signal;
test("combined transcription preserves original text for reference selection and translates without changing the speaker/timeline", async () => {
  const provider = new GoogleProvider(config, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.ok(
      body.response_format.schema.properties.segments.items.properties
        .translatedText,
    );
    assert.match(body.input[0].text, /keeping text as the verbatim ORIGINAL/);
    assert.equal(body.store, false);
    return Response.json({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                language: "en",
                segments: [
                  {
                    start: 0,
                    end: 4,
                    speaker: 2,
                    text: "Hello there.",
                    translatedText: "Hola.",
                    referenceQuality: {
                      cleanSpeech: true,
                      naturalDelivery: true,
                      overlappingSpeech: false,
                    },
                  },
                ],
              }),
            },
          ],
        },
      ],
    });
  });
  const result = await provider.transcribeTranslated(
    Buffer.from("test-only-audio"),
    4,
    "auto",
    "es",
    "",
    signal(),
  );
  assert.equal(result.segments[0].text, "Hello there.");
  assert.equal(result.translatedSegments[0].text, "Hola.");
  assert.equal(result.translatedSegments[0].speaker, 2);
  assert.equal(result.translatedSegments[0].end, result.segments[0].end);
  assert.equal("translatedText" in result.segments[0], false);
});
test("combined transcription rejects missing translation and invalid timing", async () => {
  for (const segment of [
    { start: 0, end: 1, speaker: 0, text: "Hello." },
    { start: 0, end: 5, speaker: 0, text: "Hello.", translatedText: "Hola." },
  ]) {
    const provider = new GoogleProvider(config, async () =>
      Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({ language: "en", segments: [segment] }),
              },
            ],
          },
        ],
      }),
    );
    await assert.rejects(
      provider.transcribeTranslated(
        Buffer.alloc(1),
        4,
        "en",
        "es",
        "",
        signal(),
      ),
      /invalid transcript|could not be aligned/,
    );
  }
});
test("replication verifies a stateless key and reports a consent rejection without synthesizing a replacement", async () => {
  const wav = wavHeader(0);
  const failed = new GoogleProvider(
    config,
    async () => new Response(null, { status: 400 }),
  );
  await assert.rejects(
    failed.replicate(wav, wav, signal()),
    /could not verify/,
  );
  const persistent = new GoogleProvider(config, async () =>
    Response.json({ id: "voice_persistent" }),
  );
  await assert.rejects(
    persistent.replicate(wav, wav, signal()),
    /no stateless cloned voice/,
  );
});
