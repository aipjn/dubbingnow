import type { Metadata } from "next";
import { PricingCards } from "@/components/pricing";
import { Breadcrumbs } from "@/components/shell";
import { Faq } from "@/components/content";
export const metadata: Metadata = {
  title: "AI Dubbing Pricing - Start Free | DubbingNow",
  description:
    "Start with a free dubbing allowance, then choose a credit pack for more audio and video translation.",
  alternates: { canonical: "/pricing" },
};
export default function PricingPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Pricing" }]} />
      <section className="page-heading container">
        <span className="eyebrow">START SMALL. THINK GLOBAL.</span>
        <h1>
          More stories.
          <br />
          <em>Fewer boundaries.</em>
        </h1>
        <p>
          Try it for free. Make room for your next audience.
          <br />
          Simple credit packs, without a recurring subscription.
        </p>
      </section>
      <section className="container">
        <PricingCards />
      </section>
      <Faq
        items={[
          [
            "How are credits counted?",
            "Credits are calculated from the recording length and the current rate and billing increment shown above. Each target language is a separate job.",
          ],
          [
            "What happens if a job fails?",
            "Reserved credits are returned for failed or cancelled jobs. Downloading an existing result does not consume additional credits.",
          ],
          [
            "Do paid credits expire?",
            "The proposed credit packs are one-time purchases with no expiry. Final pricing and terms will be confirmed before checkout is enabled.",
          ],
          [
            "Can I cancel a job?",
            "Yes, while a job is processing. Cancellation is confirmed by the service, and reserved credits are returned.",
          ],
        ]}
      />
    </>
  );
}
