import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/shell";
export function generateStaticParams() {
  return [{ slug: "preparing-a-video-for-dubbing" }];
}
export const dynamicParams = false;
export const metadata: Metadata = {
  title: "Prepare Your Video for AI Dubbing | DubbingNow",
  description:
    "Prepare clear, single-speaker video for AI dubbing, with practical checks for narration, names, translation, and timing.",
  alternates: { canonical: "/blog/preparing-a-video-for-dubbing" },
};
export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if ((await params).slug !== "preparing-a-video-for-dubbing") notFound();
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "Journal", href: "/blog" },
          { name: "Preparing a video" },
        ]}
      />
      <article className="article container">
        <span className="eyebrow">CREATOR’S GUIDE</span>
        <h1>Before you dub: give your words room to breathe.</h1>
        <p className="article-lead">
          A strong translated recording starts with speech that is easy to hear
          and understand.
        </p>
        <h2>Keep the dialogue clear</h2>
        <p>
          Use the cleanest available audio track. If background music covers the
          dialogue, lower it in your original edit. Avoid heavy reverb and
          clipping, which can make short words and names hard to recognize.
        </p>
        <h2>Use one narrator per recording</h2>
        <p>
          This release supports one clear speaker per recording. Multi-speaker
          interviews and overlapping conversations are not supported, even if
          speakers take turns. Start with a solo narration or prepare a new
          single-narrator explanation of the material.
        </p>
        <h2>Check names and specialist language</h2>
        <p>
          Make a list of names, product terms, and technical words before you
          review the result. Listen for them in the translated recording instead
          of assuming that a fluent-sounding sentence is accurate.
        </p>
        <h2>Plan for translated speech</h2>
        <p>
          The same idea can take different amounts of time in different
          languages. Pauses in the original recording give the translated speech
          room without requiring extreme changes in speaking speed.
        </p>
        <h2>Review with your audience in mind</h2>
        <p>
          Have a fluent listener review the output when possible. Check tone,
          cultural references, and timing before publishing, especially for
          instructions and educational material.
        </p>
        <Link className="button button-dark" href="/ai-video-dubbing">
          Try AI Video Dubbing →
        </Link>
      </article>
    </>
  );
}
