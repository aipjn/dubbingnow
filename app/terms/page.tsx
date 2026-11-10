import type { Metadata } from "next";
import Link from "next/link";
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
      <h2>How dubbing works</h2>
      <p>
        DubbingNow transcribes and translates spoken narration, generates a new
        voice track, and aligns it with the original recording. Choose a preset
        voice or use voice cloning with reference speech from your uploaded
        recording. Review the result before publishing it.
      </p>
      <h2>Recordings you provide</h2>
      <p>
        Only submit recordings you have permission to use and translate. This
        service supports clear, single-speaker recordings. Only clone a voice
        you have permission to use. Cloning quality varies with the reference
        recording and target language.
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
        attempts still count toward daily usage limits. The dubbing tool shows
        your allowance and credit quote before processing.
      </p>
      <p>
        Creator and Studio are monthly subscriptions that are opening soon. See
        the{" "}
        <Link className="underline" href="/pricing">
          pricing page
        </Link>{" "}
        for plan allowances and the{" "}
        <Link className="underline" href="/refund-policy">
          Refund Policy
        </Link>{" "}
        for the cancellation and refund terms that apply once checkout opens.
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
          "Support contact information is currently unavailable. Please try again later."
        )}
      </p>
    </article>
  );
}
