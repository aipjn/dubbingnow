import type { Metadata } from "next";
import Link from "next/link";
import { supportEmail } from "@/lib/service-info";

export const metadata: Metadata = {
  title: "Refund Policy — DubbingNow",
  description:
    "Refund eligibility for DubbingNow monthly subscriptions and how to request a refund.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicy() {
  return (
    <article className="article container">
      <h1>Refund Policy</h1>
      <p className="article-lead">
        Last updated: <time dateTime="2026-11-09">November 9, 2026</time>
      </p>

      <h2>Free trial</h2>
      <p>
        You can try dubbing once for up to 30 seconds after verification,
        without creating an account. Eligible new accounts receive a one-time
        grant of 50 credits, enough for 5 minutes of standard dubbing. Both
        allowances are free.
      </p>

      <h2>Failed or cancelled jobs</h2>
      <p>
        If a dubbing job fails or you cancel it before it finishes, any credits
        reserved for the job are automatically returned to your account. The job
        uses none of your credits.
      </p>

      <h2>Monthly subscriptions</h2>
      <p>
        Once subscriptions open, you can cancel Creator or Studio from your
        account at any time to stop the next renewal. Charges for the current
        billing period are generally nonrefundable. If you have used none of
        that period’s allowance, contact us within 7 days of the charge so we
        can review your request.
      </p>

      <h2>How to request a refund</h2>
      <p>
        {supportEmail ? (
          <>
            Email{" "}
            <a className="underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          </>
        ) : (
          <>
            Get in touch through our{" "}
            <Link className="underline" href="/contact">
              contact page
            </Link>
          </>
        )}{" "}
        and include the email address on your account and your order number. We
        aim to reply within 3 business days.
      </p>

      <p>
        Once subscription checkout opens, this policy applies to purchases made
        through our checkout provider, which acts as the merchant of record.
      </p>
    </article>
  );
}
