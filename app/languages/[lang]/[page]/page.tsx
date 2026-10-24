import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DubbingTool } from "@/components/dubbing-tool";
import { Breadcrumbs } from "@/components/shell";
import { Faq, HowItWorks, JsonLd, ToolLinks } from "@/components/content";
import { commonFaqs, languages } from "@/lib/catalog";
export function generateStaticParams() {
  return languages.map((l) => ({
    lang: l.slug,
    page: `dub-video-to-${l.slug}`,
  }));
}
export const dynamicParams = false;
async function lookup(params: Promise<{ lang: string; page: string }>) {
  const p = await params;
  return languages.find(
    (l) => l.slug === p.lang && p.page === `dub-video-to-${l.slug}`,
  );
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; page: string }>;
}): Promise<Metadata> {
  const l = await lookup(params);
  return l
    ? {
        title: `Dub Video to ${l.name} Online | DubbingNow`,
        description: `Translate your video or audio into ${l.name} with AI dubbing. One recording, consistent preset voices, and a preview on the same page.`,
        alternates: {
          canonical: `/languages/${l.slug}/dub-video-to-${l.slug}`,
        },
      }
    : {};
}
export default async function LanguagePage({
  params,
}: {
  params: Promise<{ lang: string; page: string }>;
}) {
  const l = await lookup(params);
  if (!l) notFound();
  return (
    <>
      <JsonLd
        name={`Dub Video to ${l.name}`}
        description={`AI dubbing into ${l.name}`}
        path={`/languages/${l.slug}/dub-video-to-${l.slug}`}
        breadcrumbs={[
          { name: "Languages", path: "/languages" },
          { name: l.name, path: `/languages/${l.slug}/dub-video-to-${l.slug}` },
        ]}
      />
      <Breadcrumbs
        items={[{ name: "Languages", href: "/languages" }, { name: l.name }]}
      />
      <section className="hero tool-hero container">
        <span className="eyebrow">
          {l.flag} YOUR STORY, IN {l.native.toUpperCase()}
        </span>
        <h1>
          Dub video to <em>{l.name}.</em>
        </h1>
        <p className="hero-description">
          Make your next video speak {l.name}.<br />
          One upload, every speaker, a new audience.
        </p>
        <DubbingTool defaultTarget={l.code} />
      </section>
      <HowItWorks />
      <Faq
        items={[
          [
            `How do I translate a video into ${l.name}?`,
            `Upload a video or audio recording, choose its original language or auto-detect, and select ${l.name} as the target. Start the job and preview the translated recording here.`,
          ],
          [
            `Can I dub a ${l.name} video into another language?`,
            `Yes, when ${l.name} is available as a source language in the tool. Choose it as the original language and select a different target.`,
          ],
          ...commonFaqs.slice(1, 5),
        ]}
      />
      <ToolLinks />
    </>
  );
}
