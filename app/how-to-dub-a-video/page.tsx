import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/shell";
export const metadata: Metadata = {
  title: "How to Dub a Video into Another Language | DubbingNow",
  description:
    "Learn how to prepare a video, choose a target language, review translated speech, and download an AI dub.",
  alternates: { canonical: "/how-to-dub-a-video" },
};
export default function Guide() {
  return (
    <>
      <Breadcrumbs items={[{ name: "How to dub a video" }]} />
      <article className="article container">
        <span className="eyebrow">THE CREATOR’S GUIDE</span>
        <h1>How to dub a video.</h1>
        <p className="article-lead">
          Take your recording from one language to another without rebuilding
          the whole edit.
        </p>
        <h2>1. Start with a clear recording</h2>
        <p>
          Choose an MP4 or MOV video. MP3 and WAV recordings work with the audio
          tool. For this release, use one speaker with clear speech and limited
          background noise.
        </p>
        <h2>2. Choose the original and target languages</h2>
        <p>
          Select the spoken language, or use auto-detect. Then choose the
          language your new audience speaks. A target language is the language
          of the generated speech, not a translation of the website interface.
        </p>
        <h2>3. Start the dubbing workflow</h2>
        <p>
          Choose voice cloning or an available preset voice. The service
          transcribes and translates the speech, generates the new voice track,
          and aligns the audio. Keep the page open to follow the progress.
        </p>
        <h2>4. Listen before you publish</h2>
        <p>
          Review names, specialist terms, and the timing of the translated
          speech. If possible, ask someone fluent in the target language to
          listen. AI translation can miss context, jokes, and cultural nuances.
        </p>
        <h2>5. Download and share</h2>
        <p>
          Preview and download your dubbed video from the same page. Audio
          inputs produce audio. This workflow does not change embedded text or
          lip movements.
        </p>
        <Link className="button button-dark" href="/auto-dubbing#dubbing-tool">
          Try Auto Dubbing →
        </Link>
      </article>
    </>
  );
}
