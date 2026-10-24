import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account/dashboard";
export const metadata: Metadata = {
  title: "My Account & Credits | DubbingNow",
  robots: { index: false, follow: false },
};
export default function Account() {
  return (
    <section className="account-page account-wide container">
      <span className="eyebrow">YOUR ACCOUNT</span>
      <h1>More room for your stories.</h1>
      <AccountDashboard />
    </section>
  );
}
