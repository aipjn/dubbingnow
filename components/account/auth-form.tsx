"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getApi } from "@/lib/api";
import { errorMessage } from "@/lib/api/errors";
import { safeReturnPath } from "@/lib/auth0";
import { useAccount } from "./provider";
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter(),
    { policy, refresh, session } = useAccount();
  const demo = !process.env.NEXT_PUBLIC_API_BASE_URL;
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [administrator, setAdministrator] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = safeReturnPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      await getApi().login(
        mode,
        next,
        demo ? { email, displayName: name, administrator } : undefined,
      );
      if (demo) {
        await refresh();
        router.push(next);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (session?.user)
    return (
      <div className="account-card">
        <p>You are signed in as {session.user.email}.</p>
        <Link className="button button-dark" href="/account">
          My account →
        </Link>
      </div>
    );
  return (
    <form className="account-card auth-form" onSubmit={submit}>
      {mode === "register" && (
        <p className="auth-benefit">
          {policy
            ? `${policy.signupCredits} free credits when you create your account. No subscription required.`
            : "Create an account to receive free credits."}
        </p>
      )}
      {demo ? (
        <>
          <p className="account-demo-note">
            Preview identity · Use a sample email and name. This simulates an
            account in this browser; real sign-in uses Auth0.
          </p>
          <label>
            Your name
            <input
              autoComplete="off"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Sample email
            <input
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="preview-admin">
            <input
              type="checkbox"
              checked={administrator}
              onChange={(event) => setAdministrator(event.target.checked)}
            />
            Preview administrator (new demo identities only)
          </label>
        </>
      ) : (
        <p>
          Continue to our secure sign-in page to{" "}
          {mode === "register" ? "create your account" : "sign in"}. You can
          also choose a connected social account.
        </p>
      )}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      <button className="button button-dark" disabled={busy}>
        {busy
          ? "Please wait…"
          : demo
            ? "Continue with preview identity"
            : mode === "login"
              ? "Continue to sign in"
              : "Create account"}
      </button>
      <p>
        {mode === "login" ? (
          <>
            New here? <Link href="/register">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        )}
      </p>
      <Link href="/#dubbing-tool">Try without an account →</Link>
    </form>
  );
}
