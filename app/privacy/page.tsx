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
        voice track. The sections below distinguish the connected service from
        its demonstration mode.
      </p>
      <h2>Demo recordings</h2>
      <p>
        When no live service is configured, selected recordings remain on your
        device. The demo does not upload them or submit them to AI providers.
        Result previews use a fixed sample.
      </p>
      <h2>Connected service</h2>
      <p>
        When a live service is configured, only audio is sent directly to
        private storage using time-limited upload authorization. Original videos
        remain on your device. Processing requests are sent to that service.
        Google receives audio for transcription and translation. Fish Audio
        receives selected reference speech and translated text for cloned speech
        generation. Voice identifiers are kept on the server. The separate
        single-voice test mode reuses an existing test voice; the production
        path isolates voices by task. If the operator enables Google cloning
        instead, its required consent recording is sent to Google for
        verification. Auth0 handles sign-in, and Cloudflare Turnstile handles
        guest verification.
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
        separately. Voice records and provider-hosted cloned voices are not
        removed automatically with the audio. Operational backups may retain
        account and voice records. Request removal through the contact below;
        the service currently handles these requests manually.
      </p>
      <h2>Browser storage</h2>
      <p>
        The connected frontend stores an anonymous session token in local
        storage and task recovery identifiers in session storage. These support
        your allowance, processing status, and checkout. Video recovery also
        stores file details without storing the video itself. After refreshing,
        select the same original video to restore your video download.
      </p>
      <h2>Contact</h2>
      <p>
        {supportEmail ? (
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        ) : (
          "Public support contact has not been configured. Public launch is pending this information."
        )}
      </p>
    </article>
  );
}
