import type { Metadata } from "next";
import { operatorName, supportEmail } from "@/lib/service-info";
export const metadata: Metadata = {
  title: "Contact | DubbingNow",
  description:
    "Contact DubbingNow for help with recordings, credits or data removal.",
  alternates: { canonical: "/contact" },
};
export default function Contact() {
  return (
    <article className="article container">
      <span className="eyebrow">LET’S KEEP THE CONVERSATION GOING</span>
      <h1>Get in touch.</h1>
      <p className="article-lead">Support for {operatorName}.</p>
      {supportEmail ? (
        <p>
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        </p>
      ) : (
        <p>
          Public support has not been configured yet. If you are testing this
          service, contact the person who provided your testing link.
        </p>
      )}
      <p>
        For a processing issue, include the task identifier and what happened.
        Do not send passwords or API keys. For recording or voice removal,
        identify the relevant account and task.
      </p>
    </article>
  );
}
