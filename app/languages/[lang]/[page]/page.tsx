import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DubbingTool } from "@/components/dubbing-tool";
import { Breadcrumbs } from "@/components/shell";
import { Faq, HowItWorks, JsonLd, ToolLinks } from "@/components/content";
import { commonFaqs, languages } from "@/lib/catalog";
import { languageContent } from "@/lib/language-content";
const relatedLanguageGroups = [
  {
    codes: ["en", "es", "pt"],
    context: "For a release across the Americas, you can also plan",
  },
  {
    codes: ["fr", "de", "nl"],
    context: "For a rollout across neighboring European markets, consider",
  },
  {
    codes: ["ja", "ko", "zh"],
    context: "For separate releases across East Asia, you can also prepare",
  },
  {
    codes: ["hi", "ar", "it"],
    context: "If your course needs additional language editions, consider",
  },
];

const hindiCourseExample = [
  [
    "Pick a test lesson.",
    "Export a clear three-minute clip of one instructor explaining how to read a chart. Keep the labels on screen while the instructor points to them.",
  ],
  [
    "Set up the Hindi dub.",
    "Upload the clip, set English as the source and Hindi as the target, and try a preset voice. If the instructor has given permission, compare it with a clone from a clean passage in the same clip.",
  ],
  [
    "Ask a learner to follow the chart.",
    "Play the preview for a Hindi-speaking reviewer and ask them to identify both axes and explain what the trend means. Check dates, units, and where the narration lands as the chart changes.",
  ],
  [
    "Publish the Hindi edition.",
    "Download the approved dub and add translated chart labels or Devanagari captions in your editor if the course needs them. Save the English and Hindi exports as separate versions of the same lesson.",
  ],
] as const;

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
  const relatedGroup = relatedLanguageGroups.find(({ codes }) =>
    codes.includes(l.code),
  );
  const relatedLanguages = languages.filter(
    (language) =>
      language.code !== l.code && relatedGroup?.codes.includes(language.code),
  );
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
      {l.code === "hi" && (
        <section className="tool-intro container">
          <h2>Hindi dubbing for creators in India</h2>
          <p>
            If you make videos in India, the language you record in may depend
            on who is watching each cut. A Bollywood creator can adapt a
            licensed, single-narrator behind-the-scenes clip from Hindi to
            English for viewers overseas. A YouTube creator can give an English
            tutorial a Hindi edition while keeping both versions available. For
            a course sold across India, a Hindi voice track can let learners
            follow the instructor in Hindi while English menu labels remain
            recognizable on screen.
          </p>
        </section>
      )}
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
      {l.code === "hi" && (
        <section className="article container language-editorial">
          <h2>Example: Dub an English chart-reading lesson into Hindi</h2>
          <ol className="list-decimal pl-6">
            {hindiCourseExample.map(([step, detail]) => (
              <li key={step}>
                <p>
                  <strong>{step}</strong> {detail}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {relatedGroup && (
        <div className="tool-intro container">
          <p>
            {relatedGroup.context}{" "}
            {relatedLanguages.map((language, index) => (
              <span key={language.code}>
                {index > 0 && " and "}
                <Link
                  className="underline"
                  href={`/languages/${language.slug}/dub-video-to-${language.slug}`}
                >
                  {language.name} dubbing
                </Link>
              </span>
            ))}
            . Use a short sample for each edition and have a fluent reviewer
            check the terminology and timing.
          </p>
        </div>
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
