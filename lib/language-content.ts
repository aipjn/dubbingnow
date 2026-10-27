export interface LanguageContent {
  title: string;
  description: string;
  intro: string;
  workflowTitle: string;
  workflowDescription: string;
  steps: readonly (readonly [string, string])[];
  sections: readonly { title: string; paragraphs: readonly string[] }[];
  faqs: readonly (readonly [string, string])[];
}

// Start with three editorial pages; the remaining languages retain their existing URLs.
export const languageContent: Record<string, LanguageContent | undefined> = {
  spanish: {
    title: "Spanish Dubbing — Dub Video to Spanish Online | DubbingNow",
    description:
      "Spanish dubbing for clear, single-speaker recordings. Translate video to Spanish, choose a cloned or preset voice, and review the translated audio online.",
    intro:
      "Translate video to Spanish for clear, single-speaker recordings: a product walkthrough, a narrated lesson, or a creator explaining an idea. Choose Spanish as the target, then listen to the new voice track before sharing it with your audience.",
    workflowTitle: "How to create a Spanish dub",
    workflowDescription:
      "Start with one narrator and review both the Spanish wording and the audio timing.",
    steps: [
      [
        "Choose a narrated clip",
        "Use one clear speaker. A product demonstration or short lesson is a better starting point than an interview or a scene with overlapping dialogue.",
      ],
      [
        "Select Spanish",
        "Choose the original language or auto-detect, then Spanish as the target. Pick a preset voice or try cloning with clear reference speech from your recording.",
      ],
      [
        "Review your Spanish audio",
        "Listen for names, instructions, and the tone of address. Preview the translated track against your visuals before downloading the result.",
      ],
    ],
    sections: [
      {
        title: "Spanish dubbing for tutorials and product walkthroughs",
        paragraphs: [
          "A useful first project is a short screen recording in which one person explains a task. Keep the cursor movement and each spoken instruction easy to follow. When you review the Spanish dub, check that the listener hears the relevant instruction while the corresponding screen is still visible.",
          "For a lesson or creator introduction, listen to the opening and closing sentences as carefully as the main explanation. A clear translation should preserve what you are asking the viewer to do; a convincing voice alone does not establish that the instruction is correct.",
        ],
      },
      {
        title: "Spain, Latin America, and the voice your audience expects",
        paragraphs: [
          "Decide who the recording is for before publishing. Ask a Spanish-speaking reviewer to check regional vocabulary, product names, and whether tú or usted fits your relationship with the listener. Those are editorial checks on the generated result, not settings that this tool currently exposes.",
          "The target selector offers Spanish without a country or accent selector. Voice cloning can use characteristics of the supplied speaker, but it does not guarantee a particular regional accent or a native-sounding performance. Try a short passage and judge the actual audio with your intended audience.",
        ],
      },
      {
        title: "Will Spanish speech stay in sync with the video?",
        paragraphs: [
          "A translated sentence can need a different amount of speaking time from the original. DubbingNow aligns generated speech to the source timeline, so pauses between instructions are useful. Check fast demonstrations, slide changes, and the ends of sentences for rushed delivery or awkward gaps.",
          "This is audio alignment, not lip sync. Mouth movements, captions, and words embedded in the picture are not translated. If a Spanish instruction refers to an English button label on screen, check that a viewer can still identify the right control.",
        ],
      },
    ],
    faqs: [
      [
        "Can I choose a Spanish accent from Spain or Latin America?",
        "There is no regional accent selector in the current tool. Spanish is one target language. Listen to a short preset or cloned result before deciding whether its pronunciation and style suit your audience.",
      ],
      [
        "Does Spanish dubbing translate text on screen?",
        "No. It translates spoken narration and creates a new audio track. Slides, existing subtitles, button labels, and lip movements stay unchanged. Review those visual references alongside the Spanish audio.",
      ],
      [
        "Can I use a multi-speaker Spanish interview?",
        "DubbingNow supports clear recordings with one speaker. A multi-person interview, even with speakers taking turns, is outside the supported workflow. Overlapping conversations are not supported.",
      ],
      [
        "Can I translate Spanish narration into English?",
        "Yes. Spanish is available as a source language as well as a target. Choose Spanish as the original language and English as the destination, then review names and meaning in the English result.",
      ],
    ],
  },
  portuguese: {
    title: "Portuguese Dubbing — Dub Video to Portuguese Online | DubbingNow",
    description:
      "Portuguese dubbing for single-speaker video and audio. Translate narration to Portuguese, review pronunciation and timing, and download the new voice track.",
    intro:
      "Create Portuguese dubbing for clear, single-speaker recordings, from a software tutorial to a narrated training clip. Translate the spoken explanation, choose a preset or cloned voice, and review the result for the Portuguese-speaking audience you want to reach.",
    workflowTitle: "Prepare, translate, and review your Portuguese dub",
    workflowDescription:
      "Choose a short explanation first, especially when local terminology matters.",
    steps: [
      [
        "Prepare one explanation",
        "Use a quiet recording with one narrator. For software training, keep a list of menu labels and product names to check against the Portuguese speech.",
      ],
      [
        "Choose Portuguese audio",
        "Select Portuguese as the destination language and choose your voice mode. Cloning uses clear reference speech from the uploaded recording.",
      ],
      [
        "Listen with your audience in mind",
        "Review the wording with a listener from your intended market. Check instructions, numbers, and pacing before downloading or combining the audio with your video.",
      ],
    ],
    sections: [
      {
        title: "Brazilian and European Portuguese: review for your listeners",
        paragraphs: [
          "A Portuguese dub should be reviewed for the people who will use it. For viewers in Brazil or Portugal, ask a local reviewer to check the vocabulary, forms of address, and pronunciation in the result. A software term that is familiar to one audience may be a poor choice for another.",
          "The current selector has one Portuguese target; it does not offer separate Brazilian and European Portuguese controls. A Brazilian flag in the language list is a navigation symbol, not a guarantee of a Brazilian accent. Test the generated voice before using it for a regional campaign.",
        ],
      },
      {
        title:
          "Translate training clips and software demonstrations to Portuguese",
        paragraphs: [
          "For a training clip, start with one practical task: setting up an account, finding a feature, or completing a short process. Clear narration with pauses between actions is easier to review than a continuous explanation over rapidly changing screens. Keep the original video available for the final comparison.",
          "During review, follow every instruction as a new viewer would. Check whether spoken references still identify the visible menu, whether numbers are read correctly, and whether brand names remain recognizable. Dubbing does not replace the English text inside a screenshot or interface.",
        ],
      },
      {
        title: "Portuguese voice-over timing and background audio",
        paragraphs: [
          "Portuguese voice-over may take a different amount of time from the source narration. The tool aligns the new voice track to the original timeline, but it does not edit the picture to create extra space. Listen around screen changes and trim unnecessary pauses in your source before starting a new job if needed.",
          "The result replaces the original sound with the generated voice track. Original music and sound effects are not preserved in the mix. If your final edit needs music, add a separately licensed track in your editor after downloading and reviewing the Portuguese narration.",
        ],
      },
    ],
    faqs: [
      [
        "Can I select Brazilian Portuguese or European Portuguese?",
        "The current tool exposes Portuguese as one target, without a regional voice control. Review a short result with a listener from Brazil or Portugal before relying on its vocabulary or accent for that audience.",
      ],
      [
        "Can I keep the original background music?",
        "The dubbing workflow produces a replacement voice track; it does not preserve music or sound effects from the source. Add music separately in your editor if your finished video needs it.",
      ],
      [
        "Is Portuguese dubbing suitable for a two-person podcast?",
        "The supported input is a clear recording with one speaker. Two-person podcasts and overlapping conversations are outside the supported workflow. A solo introduction or a separately prepared single-narrator episode is a suitable starting point.",
      ],
      [
        "Can I translate a Portuguese recording into Spanish?",
        "Yes. Select Portuguese as the original language and Spanish as the target. Review the translated meaning and pronunciation rather than assuming similar-looking words carry the same meaning.",
      ],
    ],
  },
  hindi: {
    title: "Hindi Dubbing — Dub Video to Hindi Online | DubbingNow",
    description:
      "Hindi dubbing for clear, single-speaker recordings. Translate video to Hindi, try a cloned or preset voice, and check names, English terms, and audio timing.",
    intro:
      "Use Hindi dubbing for clear, single-speaker recordings such as a narrated lesson, an app demonstration, or a short explainer. Translate video to Hindi, listen to the generated narration, and check that the explanation is useful to your intended viewers before publishing.",
    workflowTitle: "Make a Hindi dub your viewers can follow",
    workflowDescription:
      "A short lesson or demonstration makes it easier to check meaning, names, and pacing.",
    steps: [
      [
        "Choose one clear narrator",
        "Start with a short explanation recorded without competing voices. Keep a checklist of names, English product terms, and numbers that need to remain understandable.",
      ],
      [
        "Set Hindi as the target",
        "Choose the source language or auto-detect, then Hindi and a voice mode. For cloning, include a clean passage of the original speaker in the source recording.",
      ],
      [
        "Check the spoken lesson",
        "Ask a Hindi-speaking listener to follow the explanation with the video. Review mixed-language terms, instructions, and timing before downloading the finished track.",
      ],
    ],
    sections: [
      {
        title: "Hindi dubbing for lessons, explainers, and app guides",
        paragraphs: [
          "Choose one topic and one narrator for your first Hindi dub. A short lesson with a clear beginning, explanation, and recap gives a reviewer enough context to assess the translation. It also makes it easier to catch a missing instruction than a long recording covering several unrelated topics.",
          "For an app demonstration, compare the Hindi narration with the labels that remain on screen. A viewer should be able to connect the spoken instruction to the correct button, even when the interface itself is in English. The tool translates speech; it does not localize the app or rewrite the image.",
        ],
      },
      {
        title: "Check English terms, names, and numbers in Hindi audio",
        paragraphs: [
          "Software tutorials and educational clips often contain English product names or specialist terms. Listen to those words individually in the Hindi result. Ask a fluent reviewer whether they are recognizable and whether the surrounding sentence explains their role clearly; fluent delivery can still hide a mistaken term.",
          "Do the same check for measurements, dates, prices, and numbered steps. The current workflow does not provide a pronunciation dictionary, a Hinglish style switch, or a transcript editor. If an important term is wrong, revise the source explanation and test a new short recording before processing more material.",
        ],
      },
      {
        title: "Hindi narration is not Hindi subtitles or lip sync",
        paragraphs: [
          "The output is spoken Hindi audio aligned to the source timeline. Hindi subtitles in Devanagari, Romanized text, and translated slides are separate editing tasks; this workflow does not generate or replace them. Decide which visual text your audience also needs before you publish the finished video.",
          "Listen at the points where a diagram changes or an instruction ends. A Hindi sentence may need a different amount of time from the source sentence. Alignment helps place the new speech on the timeline, but it does not change a visible speaker’s mouth movements or guarantee natural delivery in every short time slot.",
        ],
      },
    ],
    faqs: [
      [
        "Does Hindi dubbing create Hindi subtitles?",
        "No. It generates spoken Hindi narration. Devanagari subtitles, Romanized captions, and translated text inside the video are not included. Add and review those separately if your audience needs them.",
      ],
      [
        "Can I choose a Hinglish style or control individual pronunciations?",
        "There is no Hinglish style switch or pronunciation dictionary in the current tool. Check English terms, names, and numbers in the actual audio with a Hindi-speaking reviewer before publishing.",
      ],
      [
        "Can I dub a Hindi conversation with several people?",
        "DubbingNow is for one clear speaker per recording. Group discussions, interviews with multiple speakers, and overlapping conversations are not supported. Use a single-narrator explanation instead.",
      ],
      [
        "Can Hindi be the original language?",
        "Yes. You can choose Hindi as the source and another supported language as the target. Review technical terms and the intended meaning after translation, especially when the original narration mixes Hindi and English.",
      ],
    ],
  },
};
