// Four real browser runs in ABBA order. No mocked providers or response replay.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(".runtime/full-chain/comparison-" + Date.now());
await mkdir(root, { recursive: true });
const rows = [];
const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
try {
  for (const streaming of [false, true, true, false]) {
    console.log(
      `Starting run ${rows.length + 1}/4: ${streaming ? "streaming" : "batch"}`,
    );
    const output = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--env-file-if-exists=.env.local",
          "--import",
          "tsx",
          "tests/live-full-chain.mjs",
        ],
        {
          env: {
            ...process.env,
            STREAM_TEXT_PIPELINE: String(streaming),
            TEXT_PIPELINE: "combined",
            SYNTHESIS_CONCURRENCY: "3",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (bytes) => {
        stdout += bytes;
      });
      child.stderr.on("data", (bytes) => {
        stderr += bytes;
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolve(stdout)
          : reject(
              new Error(
                `Full-chain run failed (${code}). ${stderr.slice(-1500)}`,
              ),
            ),
      );
    });
    const summary = output
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line))
      .find((item) => item.report);
    assert.ok(summary);
    const report = JSON.parse(await readFile(summary.report, "utf8"));
    assert.equal(report.streaming, streaming);
    assert.equal(report.backendTimings.streamingText, streaming);
    assert.equal(report.backendTimings.concurrency, 3);
    if (rows.length) assert.equal(report.sourceSha256, rows[0].sourceSha256);
    const metrics = report.backendTimings.timings;
    const row = {
      mode: streaming ? "streaming" : "batch",
      readyMs: report.readyMs,
      queueMs: report.backendTimings.queueMs,
      serverMs: metrics.wallMs,
      analysisMs: metrics.phases.transcribeTranslate.spanMs,
      firstSynthesisMs: metrics.milestones.firstSynthesisStart,
      analysisCompletedMs: metrics.milestones.analysisCompleted,
      firstAnyAudioMs: metrics.firstAudioMs,
      synthesisSpanMs: metrics.phases.synthesize.spanMs,
      segments: report.backendTimings.segments,
      characters: report.backendTimings.synthesisCharacters,
      sourceSha256: report.sourceSha256,
      report: summary.report,
      result: report.result,
    };
    rows.push(row);
    await writeFile(
      path.join(root, "runs.json"),
      JSON.stringify(rows, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(row));
  }
  const summaries = ["batch", "streaming"].map((mode) => {
    const runs = rows.filter((row) => row.mode === mode);
    return {
      mode,
      runs: runs.length,
      meanReadyMs:
        runs.reduce((sum, row) => sum + row.readyMs, 0) / runs.length,
      medianReadyMs: median(runs.map((row) => row.readyMs)),
      minReadyMs: Math.min(...runs.map((row) => row.readyMs)),
      maxReadyMs: Math.max(...runs.map((row) => row.readyMs)),
    };
  });
  const report = {
    outcome: "completed",
    order: "batch,streaming,streaming,batch",
    inputSeconds: 17.208333,
    scope:
      "Click to downloadable video; includes browser extraction/upload, real HTTP API and queue, Google, fixed Fish voice, alignment and browser MP4 merge. Same input hash, models, prompt and concurrency=3. Auth0/Turnstile excluded via isolated verified guest fixtures. Live generation can vary between runs; segment and character counts retained.",
    summaries,
    deltaMs: summaries[0].meanReadyMs - summaries[1].meanReadyMs,
    improvementPercent:
      (100 * (summaries[0].meanReadyMs - summaries[1].meanReadyMs)) /
      summaries[0].meanReadyMs,
    rows,
  };
  await writeFile(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({ ...report, report: path.join(root, "report.json") }),
  );
} catch (error) {
  await writeFile(
    path.join(root, "failure.json"),
    JSON.stringify({ error: error.message, rows }, null, 2),
    { mode: 0o600 },
  );
  console.error(error.message);
  console.error("Comparison artifacts: " + root);
  process.exitCode = 1;
}
