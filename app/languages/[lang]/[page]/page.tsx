import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DubbingTool } from "@/components/dubbing-tool";
import { Breadcrumbs } from "@/components/shell";
import { Faq, HowItWorks, JsonLd, ToolLinks } from "@/components/content";
import { commonFaqs, languages } from "@/lib/catalog";
import { languageContent } from "@/lib/language-content";
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
        title:
          languageContent[l.slug]?.title ||
          `Dub Video to ${l.name} Online | DubbingNow`,
        description:
          languageContent[l.slug]?.description ||
          `Translate clear, single-speaker video or audio into ${l.name} with AI dubbing. Choose a preset or cloned voice and review the translated audio online.`,
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
  const content = languageContent[l.slug];
  return (
    <>
      <JsonLd
        name={content ? `${l.name} Dubbing` : `Dub Video to ${l.name}`}
        description={
          content?.description ||
          `AI dubbing into ${l.name} for clear, single-speaker recordings.`
        }
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
          {content ? (
            <>
              {l.name} <em>Dubbing.</em>
            </>
          ) : (
            <>
              Dub video to <em>{l.name}.</em>
            </>
          )}
        </h1>
        <p className="hero-description">
          {content?.intro ||
            `Make your next video speak ${l.name}. AI dubbing for clear, single-speaker recordings, with a preset or cloned voice and an audio preview to review before downloading.`}
        </p>
        <DubbingTool defaultTarget={l.code} />
      </section>
      <HowItWorks
        title={content?.workflowTitle}
        description={content?.workflowDescription}
        steps={content?.steps}
      />
      {content && (
        <section
          className="article container language-editorial"
          aria-label={`${l.name} dubbing guide`}
        >
          {content.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </section>
      )}
      <Faq
        title={
          content ? `${l.name} dubbing: questions before you start` : undefined
        }
        items={[
          ...(content?.faqs || []),
          ...(!content
            ? [
                [
                  `How do I translate a video into ${l.name}?`,
                  `Upload a video or audio recording, choose its original language or auto-detect, and select ${l.name} as the target. Start the job and preview the translated recording here.`,
                ],
                [
                  `Can I dub a ${l.name} video into another language?`,
                  `Yes, when ${l.name} is available as a source language in the tool. Choose it as the original language and select a different target.`,
                ],
              ]
            : []),
          ...commonFaqs.slice(1, content ? 2 : 5),
          ...(content ? [commonFaqs[3], commonFaqs[5]] : []),
        ]}
      />
      <ToolLinks
        title={
          content ? `Choose a workflow for ${l.name} narration` : undefined
        }
      />
    </>
  );
}
