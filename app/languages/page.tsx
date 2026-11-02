import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Breadcrumbs } from "@/components/shell";
import { languages } from "@/lib/catalog";
export const metadata: Metadata = {
  title: "Dubbing Languages - Explore Video Translation | DubbingNow",
  description:
    "Explore target languages for AI video and audio dubbing, from Spanish and French to Japanese and Chinese.",
  alternates: { canonical: "/languages" },
};
export default function LanguagesPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Languages" }]} />
      <section className="page-heading container">
        <span className="eyebrow">YOUR STORY CAN GO FURTHER</span>
        <h1>A world of languages.</h1>
        <p>
          Choose the next language for your video or audio.
          <br />
          Explore 12 supported languages for clear, single-speaker recordings.
        </p>
      </section>
      <section className="container language-grid">
        {languages.map((lang) => (
          <Link
            key={lang.code}
            href={`/languages/${lang.slug}/dub-video-to-${lang.slug}`}
          >
            <span className="language-flag">{lang.flag}</span>
            <h2>{lang.name} dubbing</h2>
            <span>{lang.native}</span>
            <span className="language-grid-cta">
              Dub into {lang.name}
              <ArrowUpRight size={16} />
            </span>
          </Link>
        ))}
      </section>
      <p className="container catalog-note">
        Choose a source and target language in the tool. Review translated
        speech for meaning, pronunciation, and timing before sharing it.
      </p>
    </>
  );
}
