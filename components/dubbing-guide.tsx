import Link from "next/link";
import { CurrentLimits } from "./current-limits";

export function DubbingGuide() {
  return (
    <section
      className="section container dubbing-guide"
      aria-labelledby="dubbing-guide-heading"
    >
      <div className="section-heading align-left">
        <span className="eyebrow">BEFORE YOUR FIRST DUB</span>
        <h2 id="dubbing-guide-heading">
          AI dubbing for the recording you actually have.
        </h2>
        <p>
          Choose a suitable clip, understand the limits, and review the result
          before sharing it.
        </p>
      </div>
      <div className="guide-grid">
        <section>
          <h3>What AI dubbing changes</h3>
          <p>
            AI dubbing turns spoken narration into another language. DubbingNow
            transcribes your recording, translates the speech, generates a new
            voice track, and aligns that track to the original timeline. You can
            choose an available preset voice or try cloning the original
            narrator using clear reference speech from the upload.
          </p>
          <p>
            This release is for clear, single-speaker recordings. A solo lesson,
            a product explanation, or a narrated screen recording is a suitable
            starting point. Interviews with several speakers, group discussions,
            and overlapping conversations are outside the supported workflow.
            The tool does not edit mouth movements or translate text embedded in
            the picture.
          </p>
        </section>
        <section>
          <h3>Which languages can I use?</h3>
          <p>
            The service supports English, Spanish, French, German, Portuguese,
            Italian, Japanese, Korean, Chinese, Hindi, Arabic, and Dutch as
            source and target languages. Choose the original spoken language
            yourself, or use auto-detect, then select the language your
            listeners need. The language menu in the tool shows the current
            available options.
          </p>
          <p>
            For a first project, try{" "}
            <Link href="/languages/spanish/dub-video-to-spanish">
              Spanish dubbing
            </Link>
            ,{" "}
            <Link href="/languages/portuguese/dub-video-to-portuguese">
              Portuguese dubbing
            </Link>
            , or{" "}
            <Link href="/languages/hindi/dub-video-to-hindi">
              Hindi dubbing
            </Link>
            . Those guides cover audience choices, terminology, and timing
            checks. A target language does not guarantee a particular regional
            accent; listen to a short result before committing to a longer
            recording.
          </p>
        </section>
        <section>
          <h3>What files and recording lengths work?</h3>
          <p>
            Choose an MP4 or MOV video, or an MP3, WAV, or M4A audio recording.
            The service currently accepts audio uploads up to 100 MB; for a
            video, only the extracted audio is uploaded. Check the limit shown
            in the tool before starting. A video must contain an audio track.
            Clear speech matters more than image resolution: avoid clipping,
            strong echo, loud music over the narration, and other people talking
            in the background.
          </p>
          <p>
            Start with one complete thought rather than a long montage. A short
            demonstration lets you judge translation and voice quality before
            processing the rest. The upload tool checks duration against your
            current allowance, which can be shorter than the maximum account
            limit. If a file is too long, prepare a shorter single-speaker clip
            in your editor.
          </p>
        </section>
        <section>
          <h3>How do the free trial and credits work?</h3>
          <CurrentLimits />
          <p>
            A guest trial and account credits are separate allowances. An
            account’s welcome credits are granted once, not on every sign-in.
            Credits are reserved when a task is accepted, consumed when it
            completes, and returned if it fails or is cancelled. Check the{" "}
            <Link href="/pricing">pricing page</Link> and the quote for the
            current terms; starting a job does not require a paid subscription.
          </p>
        </section>
        <section>
          <h3>How should I prepare a voice for cloning?</h3>
          <p>
            Include a clean 10–30 second passage of the narrator speaking
            naturally. The reference is taken from your source recording, so you
            do not need a separate recording step for the default cloning
            workflow. Use a recording you have permission to translate and a
            voice you have permission to clone.
          </p>
          <p>
            Mechanical delivery, background music, distortion, and very little
            speech can limit the result. Cloning can resemble the source
            speaker, but it does not guarantee an identical voice or natural
            pronunciation in every language. Compare the output with the
            reference; if the character or pronunciation is unsuitable, try a
            clearer source or an available preset voice.
          </p>
        </section>
        <section>
          <h3>What do I preview and download?</h3>
          <p>
            Audio input produces a translated audio file. For video input, the
            browser extracts the audio for processing while the original video
            stays on your device. You can listen to the translated track,
            download the audio, and combine it with the original video locally
            through the video workflow. The generated voice replaces the
            original sound, including background music and sound effects.
          </p>
          <p>
            After the audio upload has finished and the task is accepted,
            processing continues in the background. When returning to a video
            project, you may need to select the same original video again to
            assemble its video download. Results remain available for 24 hours
            after completion, so save the finished audio before it expires. See
            the <Link href="/privacy">privacy notice</Link> for file handling
            and retention details.
          </p>
        </section>
        <section>
          <h3>What should I check before publishing?</h3>
          <p>
            Listen for names, numbers, technical terms, and any instruction that
            a viewer needs to act on. Check that the translated sentence ends
            naturally and still matches the relevant screen or slide. A
            fluent-sounding voice can contain a translation mistake, so ask
            someone who understands the target language to review the meaning
            whenever possible.
          </p>
          <p>
            Pay particular attention to jokes, local expressions, and words that
            are visible in the video but spoken differently in the translation.
            Dubbing does not update slides, captions, or product interfaces. The{" "}
            <Link href="/how-to-dub-a-video">video dubbing guide</Link> explains
            how to prepare a clip and review the result before sharing it with a
            new audience.
          </p>
        </section>
      </div>
    </section>
  );
}
