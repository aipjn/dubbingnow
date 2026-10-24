import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// These settings are embedded in the browser bundle or statically rendered pages.
// Keep this list in sync with the public environment settings used by the app.
export const publicBuildKeys = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_AUTH0_DOMAIN",
  "NEXT_PUBLIC_AUTH0_CLIENT_ID",
  "NEXT_PUBLIC_AUTH0_AUDIENCE",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "NEXT_PUBLIC_OPERATOR_NAME",
] as const;

function buildPrefix(env: Record<string, string | undefined>) {
  const values = publicBuildKeys.map((key) => [key, env[key] || ""]);
  const hash = createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex");
  return `web-vc-${hash}-`;
}

export function makeBuildId(env: Record<string, string | undefined>) {
  return buildPrefix(env) + randomUUID();
}

export async function buildConfigProblems(
  env: Record<string, string | undefined>,
  root = process.cwd(),
): Promise<string[]> {
  let id: string;
  try {
    id = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
  } catch {
    return [
      "Production build is missing; run npm run build before starting the API.",
    ];
  }
  if (!id.startsWith(buildPrefix(env)))
    return [
      "Production build does not match NEXT_PUBLIC_* settings. Rebuild with the service environment before starting the API.",
    ];
  return [];
}
