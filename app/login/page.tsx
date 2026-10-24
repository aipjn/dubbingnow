import type { Metadata } from "next";
import { AuthForm } from "@/components/account/auth-form";
export const metadata: Metadata = {
  title: "Sign In | DubbingNow",
  robots: { index: false, follow: false },
};
export default function Login() {
  return (
    <section className="account-page container">
      <span className="eyebrow">WELCOME BACK</span>
      <h1>Continue your story.</h1>
      <p>Sign in to use your credits and manage your account.</p>
      <AuthForm mode="login" />
    </section>
  );
}
