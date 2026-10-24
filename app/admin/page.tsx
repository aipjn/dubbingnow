import type { Metadata } from "next";
import { AdminDashboard } from "@/components/account/admin";
export const metadata: Metadata = {
  title: "User & Credit Administration | DubbingNow",
  robots: { index: false, follow: false },
};
export default function Admin() {
  return (
    <section className="account-page account-wide container">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Users & credits.</h1>
      <AdminDashboard />
    </section>
  );
}
