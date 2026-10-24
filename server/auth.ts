import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { ServerConfig } from "./config";
import { BackendError, requireValue } from "./errors";
import type { Identity } from "./store";
export type VerifyIdentity = (token: string) => Promise<Identity>;
export function makeIdentityVerifier(
  config: ServerConfig,
  key?: JWTVerifyGetKey,
): VerifyIdentity {
  let jwks = key;
  const cached = new Map<string, { identity: Identity; expires: number }>();
  return async (token) => {
    requireValue(
      config.authIssuer && config.authAudience,
      "SERVICE_UNAVAILABLE",
      "Sign-in is not configured yet.",
      503,
    );
    jwks ||= createRemoteJWKSet(
      new URL(".well-known/jwks.json", config.authIssuer),
      { timeoutDuration: 10000 },
    );
    let payload;
    try {
      payload = (
        await jwtVerify(token, jwks, {
          issuer: config.authIssuer,
          audience: config.authAudience,
          algorithms: ["RS256"],
          requiredClaims: ["sub", "exp", "iat"],
        })
      ).payload;
    } catch {
      throw new BackendError(
        "UNAUTHORIZED",
        "Invalid or expired sign-in token.",
        401,
      );
    }
    requireValue(
      typeof payload.sub === "string" && payload.sub.length < 256,
      "UNAUTHORIZED",
      "Invalid sign-in identity.",
      401,
    );
    const tokenKey = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(token))
      .then((b) => Buffer.from(b).toString("hex"));
    const previous = cached.get(tokenKey);
    if (previous && previous.expires > Date.now()) return previous.identity;
    let response: Response;
    try {
      response = await fetch(new URL("userinfo", config.authIssuer), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
    } catch {
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "The sign-in service is unavailable.",
        503,
        true,
      );
    }
    if (!response.ok)
      throw new BackendError(
        response.status === 401 ? "UNAUTHORIZED" : "SERVICE_UNAVAILABLE",
        "Could not verify account details.",
        response.status === 401 ? 401 : 503,
      );
    const info = await response.json();
    requireValue(
      info.sub === payload.sub &&
        typeof info.email === "string" &&
        info.email.length <= 254,
      "UNAUTHORIZED",
      "Could not verify account details.",
      401,
    );
    requireValue(
      info.email_verified === true,
      "EMAIL_NOT_VERIFIED",
      "Verify your email before using your account. Check your inbox and spam folder for the verification message.",
      401,
    );
    const identity = {
      issuer: config.authIssuer,
      subject: payload.sub,
      email: info.email,
      name: typeof info.name === "string" ? info.name.slice(0, 80) : "Member",
    };
    if (cached.size >= 1000) cached.delete(cached.keys().next().value!);
    cached.set(tokenKey, { identity, expires: Date.now() + 300000 });
    return identity;
  };
}
export type VerifyHuman = (token: string, ip?: string) => Promise<void>;
export function makeHumanVerifier(config: ServerConfig): VerifyHuman {
  return async (token, ip) => {
    requireValue(
      config.turnstileSecret,
      "SERVICE_UNAVAILABLE",
      "Human verification is not configured yet.",
      503,
    );
    let response: Response;
    try {
      response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: new URLSearchParams({
            secret: config.turnstileSecret,
            response: token,
            ...(ip ? { remoteip: ip } : {}),
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw new BackendError(
        "SERVICE_UNAVAILABLE",
        "Verification is unavailable. Please retry.",
        503,
        true,
      );
    }
    const result = await response.json();
    requireValue(
      response.ok &&
        result.success === true &&
        result.action === "guest_trial" &&
        config.allowedOrigins.some(
          (origin) => new URL(origin).hostname === result.hostname,
        ),
      "HUMAN_VERIFICATION_FAILED",
      "Please complete human verification again.",
      403,
    );
  };
}
