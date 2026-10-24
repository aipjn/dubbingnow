"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { getApi } from "@/lib/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { BillingPlan } from "@/lib/api/types";
import { useAccount } from "./account/provider";
export function PricingCards() {
  const { policy, session } = useAccount();
  const [offers, setOffers] = useState<BillingPlan[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    let alive = true;
    getApi()
      .getPlans()
      .then((value) => {
        if (alive) setOffers(value);
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [policy?.version]);
  async function checkout(planId: "creator" | "studio") {
    if (!session?.user) {
      window.location.assign("/login?next=%2Fpricing");
      return;
    }
    setBusy(planId);
    setError("");
    const keyName = `dubbingnow.checkout.${session.id}.${planId}`;
    try {
      const key = sessionStorage.getItem(keyName) || crypto.randomUUID();
      sessionStorage.setItem(keyName, key);
      const result = await getApi().createCheckout({ planId }, key);
      const url = new URL(result.url);
      if (url.protocol !== "https:")
        throw new Error(
          "The payment service returned an invalid checkout URL.",
        );
      window.location.assign(url.href);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CHECKOUT_EXPIRED")
        sessionStorage.removeItem(keyName);
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="pricing-grid">
        {offers.map((offer) => (
          <article
            className={`pricing-card ${offer.id === "creator" ? "featured-plan" : ""}`}
            key={offer.id}
          >
            <span className="plan-name">{offer.name}</span>
            <p>
              {offer.id === "free"
                ? "Find your voice in another language."
                : "Make room for your next audience."}
            </p>
            <div
              className={`price ${offer.amountMinor === null ? "pending-price" : ""}`}
            >
              {offer.amountMinor === null
                ? "Coming soon"
                : new Intl.NumberFormat("en", {
                    style: "currency",
                    currency: offer.currency,
                    maximumFractionDigits: 2,
                  }).format(offer.amountMinor / 100)}
              {offer.amountMinor !== null && (
                <span>
                  {offer.id === "free" ? "/ welcome gift" : "/ credit pack"}
                </span>
              )}
            </div>
            <span className="plan-minutes">
              {offer.includedCredits} credits
            </span>
            {offer.id === "free" ? (
              <Link
                className="button button-light"
                href={session?.user ? "/account" : "/register"}
              >
                {session?.user ? "My credits →" : "Create free account →"}
              </Link>
            ) : (
              <button
                className={`button ${offer.id === "creator" ? "button-dark" : "button-light"}`}
                disabled={
                  !!busy || !offer.available || offer.amountMinor === null
                }
                onClick={() => void checkout(offer.id as "creator" | "studio")}
              >
                {busy === offer.id
                  ? "Opening checkout…"
                  : `Choose ${offer.name}`}
              </button>
            )}
            <ul>
              {[
                offer.id === "free"
                  ? "Granted once on your first sign-in"
                  : "One-time credit pack",
                "Audio and video dubbing",
                "Clear single-speaker recordings",
                "Download your finished recording",
              ].map((feature) => (
                <li key={feature}>
                  <Check size={15} />
                  {feature}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {!offers.length && !error && <p role="status">Loading credit packs…</p>}
      {policy && (
        <div className="pricing-note">
          <p>
            Try a recording up to {policy.guestTrialSeconds} seconds without
            signing in, after human verification. {policy.guestTrialUses} free{" "}
            {policy.guestTrialUses === 1 ? "try" : "tries"}.
          </p>
          <Link className="text-link" href="/#dubbing-tool">
            Try for free →
          </Link>
          <p>
            Standard: {policy.creditsPerMinute.standard} credits / minute ·
            High-fidelity: {policy.creditsPerMinute.high_fidelity} credits /
            minute. Billed{" "}
            {policy.rounding === "per_second"
              ? "by the second"
              : "per started minute"}
            , rounded up to whole credits; minimum {policy.minimumCredits}{" "}
            credit{policy.minimumCredits === 1 ? "" : "s"} per job.
          </p>
        </div>
      )}
      {!process.env.NEXT_PUBLIC_API_BASE_URL && (
        <p className="pricing-note">
          Preview rates · Credit packs and rates are provisional. Purchases are
          disabled.
        </p>
      )}
      {error && (
        <p className="checkout-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
