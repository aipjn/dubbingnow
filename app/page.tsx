import type { Metadata } from "next";
import { ArrowDown, AudioLines, Globe2, UsersRound } from "lucide-react";
import { DubbingTool } from "@/components/dubbing-tool";
import {
  ClosingCta,
  Faq,
  HowItWorks,
  JsonLd,
  LanguageSection,
  SampleSection,
  ToolLinks,
  WhySection,
} from "@/components/content";

export const metadata: Metadata = { alternates: { canonical: "/" } };
export default function Home() {
  return (
    <>
      <JsonLd
        name="DubbingNow"
        description="AI dubbing for complete videos and audio recordings, using preset synthetic voices."
      />
      <section className="hero container">
        <div className="hero-eyebrow">
          <span className="eyebrow-dot" />
          YOUR STORY, WITHOUT BORDERS
        </div>
        <h1>
          AI Dubbing <em>Online.</em>
        </h1>
        <p className="hero-description">
          Dub any video into another language — in one upload.
          <br className="desktop-break" /> Your voice. Your whole story. A whole
          new audience.
        </p>
        <DubbingTool />
        <div className="hero-benefits">
          <span>
            <UsersRound size={16} />
            Clear narration, one file
          </span>
          <span>
            <Globe2 size={16} />
            Video & audio dubbing
          </span>
          <span>
            <AudioLines size={16} />
            Distinct preset voices
          </span>
        </div>
        <a className="see-how" href="#how-it-works">
          A little less editing. A lot more possibility. <ArrowDown size={14} />
        </a>
      </section>
      <HowItWorks />
      <SampleSection />
      <WhySection />
      <LanguageSection />
      <ToolLinks />
      <Faq />
      <ClosingCta />
    </>
  );
}
