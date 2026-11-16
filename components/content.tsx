import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Globe2,
  Headphones,
  Layers3,
  Mic2,
  Play,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { commonFaqs, languages, siteUrl, tools } from "@/lib/catalog";

const icons = {
  sparkles: Sparkles,
  video: Video,
  mic: Mic2,
  headphones: Headphones,
};
export function HowItWorks({
  title = "Three steps. A world of possibilities.",
  description = "A simple workflow for clear, single-speaker recordings.",
  steps = [
    [
      "One recording in.",
      "Choose a video or audio file with one clear speaker and little background noise.",
    ],
    [
      "Choose your language.",
      "Select the target language and a preset or cloned voice. We translate the narration and generate a new voice track.",
    ],
    [
      "A new audience out.",
      "Listen to the translated audio, check the timing, and download your result.",
    ],
  ],
}: {
  title?: string;
  description?: string;
  steps?: readonly (readonly [string, string])[];
} = {}) {
  return (
    <section className="section container" id="how-it-works">
      <div className="section-heading">
        <span className="eyebrow">FROM UPLOAD TO A NEW AUDIENCE</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="steps-grid">
        {steps.map(([heading, text], index) => {
          const Icon = [Upload, Globe2, Headphones][index % 3];
          return (
            <div className="step" key={heading}>
              <div className="step-top">
                <span className="step-icon">
                  <Icon size={24} />
                </span>
                <span className="step-number">0{index + 1}</span>
              </div>
              <h3>{heading}</h3>
              <p>{text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function SampleSection() {
  return (
    <section className="sample-section">
      <div className="container sample-grid">
        <div className="sample-copy">
          <span className="eyebrow">SAME STORY. NEW LANGUAGE.</span>
          <h2>
            See it. Hear it.
            <br />
            <em>Feel the connection.</em>
          </h2>
          <p>
            A short English story, reimagined in Spanish. Listen to the original
            and the translated version as video or audio.
          </p>
          <span className="sample-note">
            Illustrative title-card video and audio · preset synthetic voices
          </span>
        </div>
        <div className="sample-card">
          <h3 className="sample-media-heading">Watch the video demo</h3>
          <div className="sample-videos">
            <div>
              <p>Original · English</p>
              <video
                controls
                playsInline
                preload="metadata"
                src="/demo/english.mp4"
                aria-label="English original video sample"
              />
            </div>
            <div>
              <p>Dubbed · Spanish</p>
              <video
                controls
                playsInline
                preload="metadata"
                src="/demo/spanish.mp4"
                aria-label="Spanish dubbed video sample"
              />
            </div>
          </div>
          <h3 className="sample-media-heading">Listen to the audio demo</h3>
          <div className="sample-players">
            <div>
              <span>
                <span className="player-dot original-dot" />
                Original<span className="player-lang">English</span>
              </span>
              <audio
                controls
                preload="none"
                src="/demo/english.wav"
                aria-label="English original sample"
              />
            </div>
            <div>
              <span>
                <span className="player-dot dubbed-dot" />
                Dubbed<span className="player-lang">Spanish</span>
              </span>
              <audio
                controls
                preload="none"
                src="/demo/spanish.wav"
                aria-label="Spanish dubbed sample"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
export function WhySection() {
  return (
    <section className="section container">
      <div className="section-heading">
        <span className="eyebrow">WHY DUBBINGNOW</span>
        <h2>One voice, done right.</h2>
        <p>
          For clear, single-speaker recordings, from upload to translated audio.
        </p>
      </div>
      <div className="feature-grid">
        {[
          {
            icon: Layers3,
            title: "Your voice, one upload",
            description:
              "Start with clear narration from one speaker. Upload the complete recording and choose a preset or cloned voice.",
          },
          {
            icon: AudioLines,
            title: "A voice for your story",
            description:
              "Translated speech aligned with your recording’s timeline, so the new audio follows the story you already told.",
          },
          {
            icon: Play,
            title: "From upload to preview",
            description:
              "Get started without an account. Follow the progress, listen to the result, and download it on the same page.",
          },
        ].map((feature) => (
          <div className="feature" key={feature.title}>
            <feature.icon size={25} strokeWidth={1.5} />
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
export function LanguageSection() {
  return (
    <section className="language-section">
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">MAKE YOURSELF UNDERSTOOD</span>
          <h2>
            Your next audience speaks
            <br />a different language.
          </h2>
          <p>
            Explore 12 languages for single-speaker video and audio dubbing.
          </p>
        </div>
        <div className="language-chips">
          {languages.map((lang) => (
            <Link
              key={lang.code}
              href={`/languages/${lang.slug}/dub-video-to-${lang.slug}`}
            >
              <span aria-hidden="true">{lang.flag}</span>
              {lang.name} dubbing
              <ArrowUpRight size={13} />
            </Link>
          ))}
        </div>
        <Link className="text-link" href="/languages">
          Explore all languages <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
export function ToolLinks({
  exclude,
  limit = 4,
  title = "A little less work. A little more reach.",
}: {
  exclude?: string;
  limit?: number;
  title?: string;
}) {
  return (
    <section className="section container tools-section">
      <div className="section-heading align-left">
        <span className="eyebrow">FIND YOUR WORKFLOW</span>
        <h2>{title}</h2>
      </div>
      <div className={`tools-grid ${limit === 3 ? "three-tools" : ""}`}>
        {tools
          .filter((tool) => tool.slug !== exclude)
          .slice(0, limit)
          .map((tool) => {
            const Icon = icons[tool.icon as keyof typeof icons];
            return (
              <Link
                className="tool-link-card"
                href={`/${tool.slug}`}
                key={tool.slug}
              >
                <Icon size={23} strokeWidth={1.5} />
                <h3>{tool.name}</h3>
                <p>{tool.use}</p>
                <span>
                  Explore tool <ArrowUpRight size={15} />
                </span>
              </Link>
            );
          })}
      </div>
    </section>
  );
}
export function Faq({
  items = commonFaqs,
  title,
}: {
  items?: readonly (readonly string[] | readonly [string, ReactNode])[];
  title?: string;
}) {
  return (
    <section className="section container faq-section">
      <div>
        <span className="eyebrow">A FEW THINGS TO KNOW</span>
        <h2>
          {title || (
            <>
              Good questions.
              <br />
              Simple answers.
            </>
          )}
        </h2>
      </div>
      <div className="faq-list">
        {items.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <span>+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
export function ClosingCta() {
  return (
    <section className="closing-cta container">
      <div>
        <span className="eyebrow">LET YOUR STORY TRAVEL</span>
        <h2>
          One upload.
          <br />
          <em>A whole new audience.</em>
        </h2>
      </div>
      <Link className="button button-dark" href="/#dubbing-tool">
        Start dubbing for free <ArrowUpRight size={17} />
      </Link>
    </section>
  );
}
export function JsonLd({
  name,
  description,
  path = "/",
  breadcrumbs,
}: {
  name: string;
  description: string;
  path?: string;
  breadcrumbs?: { name: string; path: string }[];
}) {
  const objects: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name,
      description,
      url: `${siteUrl}${path}`,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web browser",
    },
  ];
  if (breadcrumbs)
    objects.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "DubbingNow", item: siteUrl },
        ...breadcrumbs.map((item, index) => ({
          "@type": "ListItem",
          position: index + 2,
          name: item.name,
          item: `${siteUrl}${item.path}`,
        })),
      ],
    });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(objects).replace(/</g, "\\u003c"),
      }}
    />
  );
}
