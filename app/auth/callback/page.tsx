import type { Metadata } from "next";
import { AuthCallback } from "@/components/account/callback";
export const metadata: Metadata = {
  title: "Completing Sign-in | DubbingNow",
  robots: { index: false, follow: false },
};
export default function Callback() {
  return (
    <section className="account-page container">
      <h1>Welcome to DubbingNow.</h1>
      <AuthCallback />
    </section>
  );
}
