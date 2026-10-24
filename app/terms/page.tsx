import type { Metadata } from "next";
import { operatorName, supportEmail } from "@/lib/service-info";
export const metadata: Metadata = {
  title: "Service Terms | DubbingNow",
  description:
    "Recording permissions, service limits and credit handling for DubbingNow.",
  alternates: { canonical: "/terms" },
};
export default function Terms() {
  return (
    <article className="article container">
      <span className="eyebrow">A FEW CLEAR EXPECTATIONS</span>
      <h1>Service terms.</h1>
      <p className="article-lead">
        {operatorName} provides automated audio translation and voice
        generation. Availability and limits are shown before you submit a
        recording.
      </p>
      <h2>What the demo does</h2>
      <p>
        The demonstration shows the upload, language selection, processing, and
        result flow. It does not translate your selected recording, and
        purchases are disabled.
      </p>
      <h2>Recordings you provide</h2>
      <p>
        Only submit recordings you have permission to use and translate. This
        service is initially intended for clear, single-speaker recordings. The
        separate single-voice test mode uses one saved test voice. Cloning
        quality varies with the reference recording and target language.
      </p>
      <h2>Review translated content</h2>
      <p>
        AI transcription and translation can contain mistakes. Review the output
        before sharing it. Do not rely on an unreviewed dub for important
        instructions.
      </p>
      <h2>Pricing and availability</h2>
      <p>
        Credits are reserved when a task is accepted, consumed on completion,
        and returned if the task fails or is cancelled. Processing and upload
        attempts still count toward daily usage limits. Purchases remain
        disabled until payment services and final commercial terms are enabled.
      </p>
      <h2>Outputs and support</h2>
      <p>
        The new voice track replaces the original audio, including background
        music. The service does not edit mouths or lip movements. Results remain
        available for 24 hours after completion; download them before they
        expire.
      </p>
      <p>
        {supportEmail ? (
          <>
            Contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a> for
            help.
          </>
        ) : (
          "Public support details are still required before launch."
        )}
      </p>
    </article>
  );
}
