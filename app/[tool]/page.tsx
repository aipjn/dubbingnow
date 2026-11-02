import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DubbingTool } from "@/components/dubbing-tool";
import { VoiceDubbingGuide } from "@/components/voice-dubbing-guide";
import { Breadcrumbs } from "@/components/shell";
import {
  Faq,
  HowItWorks,
  JsonLd,
  ToolLinks,
  WhySection,
} from "@/components/content";
import { commonFaqs, tools } from "@/lib/catalog";

export function generateStaticParams() {
  return tools.map((tool) => ({ tool: tool.slug }));
}
export const dynamicParams = false;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = tools.find((t) => t.slug === slug);
  return tool
    ? {
        title: tool.title,
        description: tool.description,
        alternates: { canonical: `/${tool.slug}` },
      }
    : {};
}
export default async function ToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: slug } = await params;
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) notFound();
  return (
    <>
      <JsonLd
        name={tool.name}
        description={tool.description}
        path={`/${tool.slug}`}
        breadcrumbs={[{ name: tool.name, path: `/${tool.slug}` }]}
      />
      <Breadcrumbs items={[{ name: tool.name }]} />
      <section className="hero tool-hero container">
        <span className="eyebrow">{tool.eyebrow}</span>
        <h1>{tool.name}</h1>
        <p className="hero-description">{tool.description}</p>
        <DubbingTool kind={tool.accept} />
      </section>
      <div className="tool-intro container">
        <p>{tool.intro}</p>
      </div>
      <HowItWorks />
      {tool.slug === "voice-dubbing" && <VoiceDubbingGuide />}
      <WhySection />
      <Faq
        items={
          tool.slug === "voice-dubbing"
            ? [...tool.faqs, commonFaqs[3], commonFaqs[5]]
            : [...tool.faqs, ...commonFaqs.slice(2, 5)]
        }
      />
      <ToolLinks exclude={tool.slug} limit={3} />
    </>
  );
}
