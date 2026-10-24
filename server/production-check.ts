export function productionProblems(
  env: Record<string, string | undefined>,
): string[] {
  const issues: string[] = [];
  const cloud = env.PERSISTENCE_DRIVER === "cloudflare" || !!env.VERCEL;
  const required = [
    "BACKEND_PUBLIC_URL",
    "STORAGE_SIGNING_SECRET",
    "GEMINI_API_KEY",
    "FISH_API_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_AUTH0_DOMAIN",
    "NEXT_PUBLIC_AUTH0_CLIENT_ID",
    "NEXT_PUBLIC_AUTH0_AUDIENCE",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "NEXT_PUBLIC_SUPPORT_EMAIL",
    "NEXT_PUBLIC_OPERATOR_NAME",
  ];
  if (cloud)
    required.push(
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_D1_DATABASE_ID",
      "CLOUDFLARE_D1_API_TOKEN",
      "CLOUDFLARE_R2_BUCKET",
      "CLOUDFLARE_R2_ACCESS_KEY_ID",
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    );
  else required.push("BACKEND_DATA_DIR");
  for (const key of required)
    if (!env[key]?.trim()) issues.push(`${key} is required.`);
  if (env.BACKEND_LOCAL !== "false")
    issues.push("BACKEND_LOCAL must be false.");
  if ((env.STORAGE_SIGNING_SECRET?.length || 0) < 32)
    issues.push("STORAGE_SIGNING_SECRET needs at least 32 characters.");
  if (!cloud && !env.BACKEND_DATA_DIR?.startsWith("/"))
    issues.push("BACKEND_DATA_DIR must be an absolute persistent directory.");
  if (env.VERCEL && env.PERSISTENCE_DRIVER !== "cloudflare")
    issues.push("Vercel requires PERSISTENCE_DRIVER=cloudflare.");
  for (const key of ["BACKEND_PUBLIC_URL", "NEXT_PUBLIC_SITE_URL"]) {
    try {
      const url = new URL(env[key] || "");
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        /localhost|127\.0\.0\.1|example\.(com|test)|\.invalid$/.test(
          url.hostname,
        )
      )
        issues.push(`${key} needs the real public HTTPS origin.`);
    } catch {
      issues.push(`${key} is not a valid URL.`);
    }
  }
  if (env.NEXT_PUBLIC_API_BASE_URL && env.NEXT_PUBLIC_API_BASE_URL !== "/") {
    try {
      const api = new URL(env.NEXT_PUBLIC_API_BASE_URL);
      const backend = new URL(env.BACKEND_PUBLIC_URL || "");
      if (
        api.protocol !== "https:" ||
        api.username ||
        api.password ||
        api.pathname !== "/" ||
        api.search ||
        api.hash ||
        api.origin !== backend.origin
      )
        issues.push(
          "NEXT_PUBLIC_API_BASE_URL must be / or the public HTTPS backend origin, without a path or query.",
        );
    } catch {
      issues.push(
        "NEXT_PUBLIC_API_BASE_URL must be / or the public HTTPS backend origin, without a path or query.",
      );
    }
  }
  try {
    const site = new URL(env.NEXT_PUBLIC_SITE_URL || "").origin;
    const backend = new URL(env.BACKEND_PUBLIC_URL || "").origin;
    if (site !== backend && env.NEXT_PUBLIC_API_BASE_URL !== "/") {
      const allowed = (env.API_ALLOWED_ORIGINS || "")
        .split(",")
        .filter((value) => value.trim())
        .map((value) => new URL(value.trim()).origin);
      if (!allowed.includes(site))
        issues.push(
          "API_ALLOWED_ORIGINS must include the frontend origin for a separate API domain.",
        );
    }
  } catch {
    issues.push(
      "Public origins and API_ALLOWED_ORIGINS must contain valid URLs.",
    );
  }
  if (env.NEXT_PUBLIC_AUTH0_DOMAIN) {
    try {
      const tenant = new URL(`https://${env.NEXT_PUBLIC_AUTH0_DOMAIN}`);
      if (
        tenant.host !== env.NEXT_PUBLIC_AUTH0_DOMAIN ||
        tenant.pathname !== "/" ||
        tenant.search ||
        tenant.hash
      )
        issues.push(
          "NEXT_PUBLIC_AUTH0_DOMAIN must be a hostname without a scheme or path.",
        );
    } catch {
      issues.push(
        "NEXT_PUBLIC_AUTH0_DOMAIN must be a hostname without a scheme or path.",
      );
    }
  }
  if (
    env.AUTH0_AUDIENCE &&
    env.AUTH0_AUDIENCE !== env.NEXT_PUBLIC_AUTH0_AUDIENCE
  )
    issues.push("Public and server Auth0 audience must match.");
  if (
    env.AUTH0_ISSUER &&
    env.AUTH0_ISSUER.replace(/\/$/, "") !==
      `https://${env.NEXT_PUBLIC_AUTH0_DOMAIN}`
  )
    issues.push("Public Auth0 domain and server issuer must match.");
  if (
    env.FISH_VOICE_MODE &&
    !["inline", "per_job"].includes(env.FISH_VOICE_MODE)
  )
    issues.push(
      "Production cloning requires FISH_VOICE_MODE=inline or per_job.",
    );
  if (
    env.FISH_VOICE_MODE === "per_job" &&
    env.FISH_ALLOW_VOICE_CREATION !== "true"
  )
    issues.push(
      "Production clone creation is disabled; enable only after capacity is available.",
    );
  if (env.CLONE_PROVIDER && env.CLONE_PROVIDER !== "fish")
    issues.push("This deployment template expects CLONE_PROVIDER=fish.");
  if (env.PAUSE_NEW_JOBS === "true") issues.push("New jobs are paused.");
  for (const key of ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"])
    if (/^[123]x0{5}/.test(env[key] || ""))
      issues.push(`${key} must not use a testing key.`);
  if (
    env.NEXT_PUBLIC_SUPPORT_EMAIL &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.NEXT_PUBLIC_SUPPORT_EMAIL)
  )
    issues.push("NEXT_PUBLIC_SUPPORT_EMAIL must be a working contact address.");
  if (env.NEXT_PUBLIC_API_BASE_URL === "/") {
    try {
      if (
        new URL(env.NEXT_PUBLIC_SITE_URL!).origin !==
        new URL(env.BACKEND_PUBLIC_URL!).origin
      )
        issues.push(
          "Same-origin API requires matching site and backend origins.",
        );
    } catch {
      /* Reported above. */
    }
  }
  return issues;
}
