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
        DubbingNow is being built to help creators adapt complete recordings
        into other languages.
      </p>
      <h2>Start with your story</h2>
      <p>
        Our goal is to make the first step simple: upload a video or audio
        recording, choose a language, and keep every speaker in one workflow.
      </p>
      <h2>Choose the voices for your story</h2>
      <p>
        Choose preset voices or try cloning preview using reference speech from
        your recording. During testing, we reuse one saved voice with
        single-speaker recordings. Cloning quality is still being evaluated.
      </p>
      <h2>Where we are today</h2>
      <p>
        This site is a working frontend preview. The demonstration uses sample
        recordings. Live dubbing and payments become available when the backend
        service is connected and verified.
      </p>
    </article>
  );
}
