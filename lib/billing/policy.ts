import type { BillingPolicy, VoiceTier } from "../api/types";
/** Preview defaults only. The live service returns its own versioned policy. */
export const defaultBillingPolicy: BillingPolicy = {
  version: "preview-1",
  signupCredits: 500,
  guestTrialSeconds: 30,
  guestTrialUses: 1,
  creditsPerMinute: { standard: 10, high_fidelity: 20 },
  rounding: "per_second",
  minimumCredits: 1,
  maxDurationSeconds: 7200,
};
export function estimateCredits(
  durationSeconds: number,
  policy: BillingPolicy,
  tier: VoiceTier,
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("A valid recording duration is required.");
  const seconds = Math.ceil(durationSeconds);
  const rate = policy.creditsPerMinute[tier];
  const product =
    policy.rounding === "per_minute"
      ? Math.ceil(seconds / 60) * rate
      : seconds * rate;
  if (!Number.isSafeInteger(product))
    throw new Error("The credit price exceeds the supported range.");
  return Math.max(
    policy.minimumCredits,
    Math.ceil(policy.rounding === "per_minute" ? product : product / 60),
  );
}
export function validatePolicy(policy: BillingPolicy) {
  for (const value of [
    policy.signupCredits,
    policy.guestTrialSeconds,
    policy.guestTrialUses,
    policy.minimumCredits,
    policy.maxDurationSeconds,
    ...Object.values(policy.creditsPerMinute),
  ])
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Policy values must be non-negative integers.");
  if (
    policy.guestTrialSeconds < 1 ||
    policy.guestTrialUses < 1 ||
    policy.maxDurationSeconds < policy.guestTrialSeconds ||
    policy.maxDurationSeconds > 7200 ||
    policy.minimumCredits < 1 ||
    Object.values(policy.creditsPerMinute).some((value) => value < 1)
  )
    throw new Error(
      "Duration limits and credit rates must be positive and valid.",
    );
  if (
    Object.values(policy.creditsPerMinute).some(
      (rate) => !Number.isSafeInteger(rate * policy.maxDurationSeconds),
    )
  )
    throw new Error("The credit rate exceeds the supported range.");
  if (!["per_second", "per_minute"].includes(policy.rounding))
    throw new Error("Choose a supported billing increment.");
}
