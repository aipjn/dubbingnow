import type { Metadata } from "next";
import Link from "next/link";
import { PricingCards } from "@/components/pricing";
import { Breadcrumbs } from "@/components/shell";
import { Faq } from "@/components/content";
export const metadata: Metadata = {
  title: "AI Dubbing Pricing - Start Free | DubbingNow",
  description:
    "Compare monthly AI dubbing plans and get 5 minutes of standard dubbing when you create a free account.",
  alternates: { canonical: "/pricing" },
};

const pricingRows = [
  {
    name: "Free",
    amountMinor: 0,
    allowance: "50 credits (5 minutes) on signup",
  },
  { name: "Creator", amountMinor: 1900, allowance: "200 credits (20 minutes)" },
  { name: "Studio", amountMinor: 4900, allowance: "600 credits (60 minutes)" },
];

export default function PricingPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Pricing" }]} />
      <section className="page-heading container">
        <span className="eyebrow">START SMALL. THINK GLOBAL.</span>
        <p>
          <strong>From $0.82 per minute of dubbed video</strong>
        </p>
        <h1>AI dubbing pricing and credit plans</h1>
        <p>
          More stories. <em>Fewer boundaries.</em>
        </p>
      </section>
      <section className="container">
        <table className="language-guidance-table mb-8">
          <caption className="sr-only">
            AI dubbing plan prices and allowances
          </caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">Price</th>
              <th scope="col">Standard dubbing allowance</th>
            </tr>
          </thead>
          <tbody>
            {pricingRows.map(({ name, amountMinor, allowance }) => (
              <tr key={name}>
                <th scope="row">
                  {name}
                  {name === "Creator" && (
                    <span className="block text-xs">Most Popular</span>
                  )}
                </th>
                <td data-amount-minor={amountMinor}>
                  {`$${amountMinor / 100}${amountMinor > 0 ? " per month" : ""}`}
                </td>
                <td>{allowance}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PricingCards />
      </section>
      <Faq
        items={[
          [
            "How much does AI dubbing cost?",
            "AI dubbing starts at $0.82 per minute with Studio. Creator includes 20 minutes for $19 per month, and Studio includes 60 minutes for $49 per month. New accounts get 5 minutes of standard dubbing once at signup.",
          ],
          [
            "How are credits counted?",
            "A minute costs 10 credits in standard mode and 20 credits in high-fidelity mode. Each target language is a separate job. Downloading an existing result or retrying a download uses no additional credits.",
          ],
          [
            "What counts as a minute?",
            "We count the duration of the original video or audio for each target language. Signed-in uploads can be up to 5 minutes per file. Split longer videos into shorter clips and submit them separately.",
          ],
          [
            "What happens if a job fails or I cancel it?",
            "You can cancel a dubbing job while it is processing. If a job fails or the service confirms the cancellation, we automatically return its reserved credits to your account.",
          ],
          [
            "Can I cancel anytime?",
            <>
              Once subscriptions open, you can cancel at any time to stop the
              next renewal. See the{" "}
              <Link className="underline" href="/refund-policy">
                Refund Policy
              </Link>{" "}
              for details about cancellation and refunds.
            </>,
          ],
        ]}
      />
      <p className="container pb-12">
        <Link className="text-link underline" href="/refund-policy">
          Refund Policy
        </Link>
      </p>
    </>
  );
}
