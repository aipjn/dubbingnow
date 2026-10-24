import type { Metadata } from "next";
import { AuthForm } from "@/components/account/auth-form";
export const metadata: Metadata = {
  title: "Create an Account | DubbingNow",
  robots: { index: false, follow: false },
};
export default function Register() {
  return (
    <section className="account-page container">
      <span className="eyebrow">A NEW AUDIENCE STARTS HERE</span>
      <h1>Your story, more languages.</h1>
      <p>Create an account and start with free dubbing credits.</p>
      <AuthForm mode="register" />
    </section>
  );
}
