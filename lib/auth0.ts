import type { Auth0Client } from "@auth0/auth0-spa-js";
import { ApiError } from "./api/errors";
export interface IdentityToken {
  token: string;
  expiresAt: string;
}
export interface IdentityBridge {
  getToken(): Promise<IdentityToken | null>;
  login(mode: "login" | "register", returnTo: string): Promise<void>;
  logout(): Promise<void>;
}
export function safeReturnPath(path: unknown): string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\x00-\x1f]/.test(path)
  )
    return "/account";
  const url = new URL(path, "https://local.invalid");
  if (
    url.origin !== "https://local.invalid" ||
    url.pathname.startsWith("/auth/")
  )
    return "/account";
  return url.pathname + url.search + url.hash;
}
let clientPromise: Promise<Auth0Client> | undefined;
let callbackReturnTo = "/account";
export function getCallbackReturnTo() {
  return callbackReturnTo;
}
function configured() {
  return !!(
    process.env.NEXT_PUBLIC_AUTH0_DOMAIN &&
    process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID &&
    process.env.NEXT_PUBLIC_AUTH0_AUDIENCE
  );
}
async function client() {
  if (!configured())
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      "Sign-in is unavailable. Please try again later.",
    );
  clientPromise ||= (async () => {
    const { Auth0Client } = await import("@auth0/auth0-spa-js");
    const sdk = new Auth0Client({
      domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN!,
      clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!,
      authorizationParams: {
        redirect_uri: window.location.origin + "/auth/callback",
        audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE!,
        scope: "openid profile email offline_access",
      },
      cacheLocation: "memory",
      useRefreshTokens: true,
      useRefreshTokensFallback: true,
    });
    const query = new URLSearchParams(window.location.search);
    if (
      window.location.pathname === "/auth/callback" &&
      query.has("state") &&
      (query.has("code") || query.has("error"))
    ) {
      try {
        const result = await sdk.handleRedirectCallback();
        callbackReturnTo = safeReturnPath(result.appState?.returnTo);
      } finally {
        window.history.replaceState({}, "", "/auth/callback");
      }
    } else await sdk.checkSession();
    return sdk;
  })();
  return clientPromise;
}
export const auth0Identity: IdentityBridge = {
  async getToken() {
    if (typeof window === "undefined" || !configured()) return null;
    const sdk = await client();
    if (!(await sdk.isAuthenticated())) return null;
    try {
      const token = await sdk.getTokenSilently({ detailedResponse: true });
      if (!token) throw new Error("No access token returned.");
      return {
        token: token.access_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      };
    } catch {
      throw new ApiError(
        "UNAUTHORIZED",
        "Your login expired. Sign in again to access your credits.",
        false,
        401,
      );
    }
  },
  async login(mode, returnTo) {
    // A failed callback must not prevent a fresh login attempt.
    try {
      await client();
    } catch {
      clientPromise = undefined;
    }
    await (
      await client()
    ).loginWithRedirect({
      appState: { returnTo: safeReturnPath(returnTo) },
      authorizationParams: mode === "register" ? { screen_hint: "signup" } : {},
    });
  },
  async logout() {
    await (
      await client()
    ).logout({ logoutParams: { returnTo: window.location.origin } });
  },
};
