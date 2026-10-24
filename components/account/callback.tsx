"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCallbackReturnTo } from "@/lib/auth0";
import { useAccount } from "./provider";
export function AuthCallback() {
  const { session, loading, error } = useAccount(),
    router = useRouter();
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
      {!loading && !session?.user && (
        <Link className="button button-dark" href="/login">
          Try sign-in again
        </Link>
      )}
    </div>
  );
}
