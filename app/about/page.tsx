import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "About DubbingNow",
  description:
    "One recording, more audiences. Learn what DubbingNow is being built to do.",
  alternates: { canonical: "/about" },
};
export default function About() {
  return (
    <article className="article container">
      <span className="eyebrow">GOOD STORIES TRAVEL</span>
      <h1>
        A world of voices.
        <br />
        One simple workflow.
      </h1>
      <p className="article-lead">
        DubbingNow helps creators translate clear, single-speaker recordings
        into other languages.
      </p>
      <h2>Start with your story</h2>
      <p>
        Our goal is to make the first step simple: upload a video or audio
        recording with one narrator, choose a language, and review the
        translated audio in one workflow.
      </p>
      <h2>Choose the voices for your story</h2>
      <p>
        Choose preset voices or try cloning preview using reference speech from
        your recording. The default cloning workflow uses the narrator from each
        upload. Quality varies with the source and target language, so listen to
        the result before sharing it.
      </p>
      <h2>Where we are today</h2>
      <p>
        This release is for one clear speaker per recording. Multi-speaker
        conversations, lip-sync editing, and translated on-screen text are not
        supported. The tool displays current duration limits and credit costs
        before processing. Paid purchases are not currently available.
      </p>
    </article>
  );
}
