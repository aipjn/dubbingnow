import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

// Apply NODE_OPTIONS and proxy settings at Node startup without passing
// --env-file into Next.js workers, which reject that flag in NODE_OPTIONS.
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)],
  { env: process.env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  });
}
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
});
