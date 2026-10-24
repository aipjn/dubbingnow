import type { Metadata } from "next";
import { BillingReturn } from "@/components/billing-return";
export const metadata: Metadata = {
  title: "Your Credits | DubbingNow",
  robots: { index: false, follow: false },
};
export default function BillingReturnPage() {
  return (
    <section className="page-heading container">
      <span className="eyebrow">BACK TO YOUR STORY</span>
      <h1>Your dubbing credits.</h1>
      <BillingReturn />
    </section>
  );
}
