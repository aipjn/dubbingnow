import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/shell";
export const metadata: Metadata = {
  title: "The DubbingNow Journal - Dubbing Guides",
  description:
    "Practical guides for translating your recordings and reaching audiences in another language.",
  alternates: { canonical: "/blog" },
};
export default function Blog() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Journal" }]} />
      <section className="page-heading container">
        <span className="eyebrow">NOTES FOR A WORLD OF CREATORS</span>
        <h1>The journal.</h1>
        <p>Small guides for stories that travel.</p>
      </section>
      <section className="container journal-list">
        <Link href="/blog/preparing-a-video-for-dubbing">
          <span className="eyebrow">CREATOR’S GUIDE · 3 MIN READ</span>
          <h2>Before you dub: make your recording easier to translate.</h2>
          <p>
            A few practical steps for clearer speech, better context, and a
            smoother review.
          </p>
          <span className="text-link">Read the guide →</span>
        </Link>
      </section>
    </>
  );
}
