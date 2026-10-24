import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { productionProblems } from "../production-check";
import { loadConfig } from "../config";
import { diskReady } from "../health";
import { buildConfigProblems } from "../build-config";

async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 16))
    throw new Error("Node.js 22.16 or newer is required.");
  const issues = productionProblems(process.env);
  if (process.argv.includes("--require-build"))
    issues.push(...(await buildConfigProblems(process.env)));
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  for (const executable of [config.ffmpeg, config.ffprobe])
    await promisify(execFile)(executable, ["-version"], { timeout: 10000 });
  if (!(await diskReady(config)))
    throw new Error(
      "Persistent disk is unavailable or below the free-space threshold.",
    );
  console.log(
    "Production configuration and local media runtime passed. External accounts, DNS, TLS and live login still need acceptance testing.",
  );
}
void main().catch(() => {
  console.error(
    "Production runtime check failed. Check disk and FFmpeg configuration.",
  );
  process.exitCode = 1;
});
