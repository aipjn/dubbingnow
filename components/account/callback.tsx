"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCallbackReturnTo } from "@/lib/auth0";
import { useAccount } from "./provider";
export function AuthCallback() {
  const { session, loading, error, errorCode, refresh, logout } = useAccount(),
    router = useRouter();
  const [checking, setChecking] = useState(false);
  const verificationRequired = errorCode === "EMAIL_NOT_VERIFIED";
  useEffect(() => {
    if (!loading && !error && session?.user)
      router.replace(getCallbackReturnTo());
  }, [loading, error, session, router]);
  return (
    <div className="account-card">
      <p role={error ? "alert" : "status"}>
        {loading
          ? "Completing sign-in…"
          : error ||
            (session?.user
              ? "Opening your account…"
              : "Sign-in did not complete. Please try again.")}
      </p>
      {!loading && verificationRequired && (
        <>
          <p>
            After verifying your email, return here to continue. Your credits
            will be added once verification is complete.
          </p>
          <button
            className="button button-dark"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                await refresh();
              } catch {
                /* The account provider displays the current error. */
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking
              ? "Checking verification…"
              : "I verified my email — continue"}
          </button>
          <button className="button button-light" onClick={() => void logout()}>
            Use another account
          </button>
        </>
      )}
      {!loading && !session?.user && !verificationRequired && (
        <Link className="button button-dark" href="/login">
          Try sign-in again
        </Link>
      )}
    </div>
  );
}
