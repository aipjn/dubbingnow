"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { getApi } from "@/lib/api";
import { errorMessage } from "@/lib/api/errors";
import type { BillingPlan } from "@/lib/api/types";
import { defaultBillingPolicy } from "@/lib/billing/policy";
import { useAccount } from "./account/provider";

const CREDITS_PER_MINUTE = 10;
const planIds = ["free", "creator", "studio"] as const;

export function PricingCards() {
  const { policy, session } = useAccount();
  const [offers, setOffers] = useState<BillingPlan[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    getApi()
      .getPlans()
      .then((value) => {
        if (!alive) return;
        setOffers(value);
        setError("");
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [policy?.version]);
  const loading = offers === null && !error;
  const cards = loading ? planIds.map(() => null) : (offers ?? []);
  const displayPolicy = policy ?? defaultBillingPolicy;

  return (
    <>
      {loading && (
        <p className="sr-only" role="status">
          Loading pricing plans
        </p>
      )}
      <div className="pricing-grid" aria-busy={loading}>
        {cards.map((offer, index) => {
          const id = offer?.id ?? planIds[index];
          const free = id === "free";
          const featured = id === "creator";
          const buttonClass = `button ${featured ? "button-dark" : "button-light"}`;
          const buttonText = free
            ? session?.user
              ? "My credits →"
              : "Create free account →"
            : "Subscriptions are opening soon";
          const buttonHref = free
            ? session?.user
              ? "/account"
              : "/register"
            : "/contact";
          return (
            <article
              aria-hidden={loading || undefined}
              className={`pricing-card${featured ? " featured-plan" : ""}${loading ? " pricing-card-skeleton" : ""}`}
              key={id}
            >
              <span className="plan-name">{offer?.name ?? "Plan name"}</span>
              <p>
                {free
                  ? "Find your voice in another language."
                  : "Make room for your next audience."}
              </p>
              <div
                className={`price${offer?.amountMinor === null ? " pending-price" : ""}`}
              >
                {offer
                  ? offer.amountMinor === null
                    ? "Coming soon"
                    : new Intl.NumberFormat("en", {
                        style: "currency",
                        currency: offer.currency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      }).format(offer.amountMinor / 100)
                  : "—"}
                {offer?.amountMinor !== null && (
                  <span>{free ? " on signup" : " per month"}</span>
                )}
              </div>
              <span className="plan-minutes">
                {offer
                  ? Math.floor(offer.includedCredits / CREDITS_PER_MINUTE)
                  : "—"}{" "}
                minutes · <span>{offer?.includedCredits ?? "—"} credits</span>
              </span>
              <p className="pricing-credit-rate">
                {CREDITS_PER_MINUTE} credits = 1 minute (high-fidelity mode uses
                2x credits)
              </p>
              {offer ? (
                <Link className={buttonClass} href={buttonHref}>
                  {buttonText}
                </Link>
              ) : (
                <span className={buttonClass}>{buttonText}</span>
              )}
              <ul>
                {[
                  free
                    ? "Granted once on your first sign-in"
                    : "Monthly dubbing allowance",
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
          );
        })}
      </div>
      <div className="pricing-note">
        <p>
          Try a recording up to {displayPolicy.guestTrialSeconds} seconds
          without signing in, after human verification.{" "}
          {displayPolicy.guestTrialUses} free{" "}
          {displayPolicy.guestTrialUses === 1 ? "try" : "tries"}.
        </p>
        <Link className="text-link" href="/#dubbing-tool">
          Try for free →
        </Link>
        <p>
          Standard: {displayPolicy.creditsPerMinute.standard} credits / minute ·
          High-fidelity: {displayPolicy.creditsPerMinute.high_fidelity} credits
          / minute. Billed{" "}
          {displayPolicy.rounding === "per_second"
            ? "by the second"
            : "per started minute"}
          , rounded up to whole credits with a minimum of{" "}
          {displayPolicy.minimumCredits} credit
          {displayPolicy.minimumCredits === 1 ? "" : "s"} per job.
        </p>
        {!process.env.NEXT_PUBLIC_API_BASE_URL && (
          <p>Demo accounts use a separate welcome credit allowance.</p>
        )}
      </div>
      {error && (
        <p className="checkout-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
