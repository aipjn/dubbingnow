import type { Metadata } from "next";
import { operatorName, supportEmail } from "@/lib/service-info";
export const metadata: Metadata = {
  title: "Privacy Notice | DubbingNow",
  description:
    "How DubbingNow handles recordings, processing providers and account data.",
  alternates: { canonical: "/privacy" },
};
export default function Privacy() {
  return (
    <article className="article container">
      <span className="eyebrow">YOUR RECORDINGS, YOUR STORY</span>
      <h1>Privacy notice.</h1>
      <p className="article-lead">
        {operatorName} processes recordings to translate and generate a new
        voice track. This notice explains how recordings, account information,
        and processing requests are handled.
      </p>
      <h2>Recordings and processing</h2>
      <p>
        Only the audio needed for dubbing is uploaded to private storage using
        time-limited upload authorization. Original videos remain on your
        device. The translated audio can be combined with the original video
        locally in your browser.
      </p>
      <h2>Processing providers and voice cloning</h2>
      <p>
        Google receives audio for transcription and translation. Fish Audio
        receives selected reference speech and translated text for cloned speech
        generation. When you choose voice cloning, reference speech comes from
        the narrator in your upload. This workflow sends the reference with
        speech-generation requests and does not register a saved voice model.
        Google generates speech when you choose a preset voice. Auth0 handles
        sign-in, and Cloudflare Turnstile handles guest verification.
      </p>
      <h2>Storage and removal</h2>
      <p>
        Source audio is normally removed after 24 hours; audio needed by an
        active task is kept until that task ends. Results are kept for 24 hours
        after completion. Download links expire sooner and can be refreshed
        while the result remains available. Removal depends on the background
        service running.
      </p>
      <p>
        Account information, task records and credit transactions are stored
        separately from audio files. Operational backups may retain account and
        transaction records. Request data removal through the contact below; the
        service currently handles these requests manually. Provider handling of
        submitted data is also subject to each provider's policies.
      </p>
      <h2>Browser storage</h2>
      <p>
        Your browser stores session and task recovery information to support
        sign-in, your allowance, and processing status. Video recovery also
        stores file details without storing the video itself. After refreshing,
        select the same original video to restore your video download.
      </p>
      <h2>Contact</h2>
      <p>
        {supportEmail ? (
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        ) : (
          "Support contact information is currently unavailable. Please try again later."
        )}
      </p>
    </article>
  );
}
