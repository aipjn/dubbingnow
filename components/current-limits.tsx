"use client";

import { useAccount } from "./account/provider";
import { estimateCredits } from "@/lib/billing/policy";

export function CurrentLimits() {
  const { policy } = useAccount();
  if (!policy)
    return (
      <p>
        The upload tool shows the current duration limit, guest trial allowance,
        and credit quote before you start. Check Pricing for the latest account
        allowance and rates.
      </p>
    );
  return (
    <>
      <p>
        Current limits: account recordings can be up to{" "}
        {policy.maxDurationSeconds} seconds ({policy.maxDurationSeconds / 60}{" "}
        minutes), subject to your available credits. Guests get{" "}
        {policy.guestTrialUses}{" "}
        {policy.guestTrialUses === 1 ? "trial" : "trials"} of up to{" "}
        {policy.guestTrialSeconds} seconds after human verification. Eligible
        new accounts receive {policy.signupCredits} credits once.
      </p>
      <p>
        Standard speech costs {policy.creditsPerMinute.standard} credits per
        minute; high-fidelity speech costs{" "}
        {policy.creditsPerMinute.high_fidelity}. Billing is{" "}
        {policy.rounding === "per_second"
          ? "calculated by the second and rounded up to a whole credit"
          : "rounded up to a started minute"}
        , with a minimum of {policy.minimumCredits}{" "}
        {policy.minimumCredits === 1 ? "credit" : "credits"}. For example, a
        30-second standard job costs {estimateCredits(30, policy, "standard")}{" "}
        credits. Your quote confirms the cost before you submit.
      </p>
    </>
  );
}
