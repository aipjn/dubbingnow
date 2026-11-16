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
      "Create Portuguese dubbing for a narrated lesson, a product walkthrough, or a solo audio explanation. Decide whether you are addressing listeners in Brazil or Portugal, prepare one clear speaker, and review the translated wording and voice against that audience’s expectations before publishing.",
    workflowTitle: "Prepare, translate, and review your Portuguese dub",
    workflowDescription:
      "Prepare a manageable single-speaker clip, then check regional wording, spoken instructions, and video timing.",
    steps: [
      [
        "Prepare one task",
        "Choose a short lesson or product task with one narrator. Remove competing voices and leave pauses around clicks, measurements, and changes of topic.",
      ],
      [
        "Choose Portuguese and a voice",
        "Select the original language or auto-detect, then Portuguese as the target. Choose a preset voice or provide clear reference speech from the narrator in the same upload for cloning.",
      ],
      [
        "Review for Brazil or Portugal",
        "Ask a listener from the intended market to check the vocabulary, tone, and pronunciation. Compare each instruction with the original picture, then download and label the approved result.",
      ],
    ],
    sections: [
      {
        title: "Portuguese dubbing for lessons and customer onboarding",
        paragraphs: [
          "Start with something a viewer can act on: a lesson explaining one concept, a software tour, or a narrated installation step. For a course aimed at Brazilian learners, keep each uploaded recording focused on one topic. Remove classroom interruptions and questions from other people; the supported workflow needs one clear narrator, even when the original conversation has neatly separated turns.",
          "For onboarding, write down the screen labels the learner must recognize. If your app still displays English menus, the Portuguese narration should help viewers identify those controls without making them guess. Ask the reviewer to follow the task from beginning to end. Check what happens when the narrator refers to a menu that disappears or a button that has moved in a newer product version.",
        ],
      },
      {
        title: "Brazilian and European Portuguese: choose your review brief",
        paragraphs: [
          "Specify the intended audience before you judge the result. A product team addressing customers in Brazil can ask its reviewer to check conversational phrasing, familiar technical terms, and the way the speaker addresses the listener. For customers in Portugal, prepare a separate vocabulary and pronunciation review. Reusing an approved recording across both markets should be an editorial decision supported by listening to the actual audio.",
          "Portuguese appears as one target in the tool. There is no separate Brazilian or European accent selector, and the flag beside a language name does not set a regional voice. Cloning uses reference speech from the uploaded narrator but does not guarantee a regional accent. Test a short passage and ask a local listener whether the generated delivery suits the setting, whether that is a formal training lesson or a conversational product explanation.",
        ],
      },
      {
        title: "An example brief for a Portuguese product walkthrough",
        paragraphs: [
          "Consider a source clip that says, “Open Settings, choose your workspace, and save the changes.” Before uploading, leave a pause while the Settings screen opens and another while the change is saved. Keep the cursor visible and use a clean spoken explanation. Give your reviewer the original instruction and the interface labels so they can check the generated Portuguese against a concrete task.",
          "During review, ask whether the wording for saving changes is familiar to the intended audience and whether the spoken workspace name remains recognizable. Repeat this check for subscription names, dates, prices, and quantities. Keep preferred terms in a separate checklist: the tool has no glossary upload or pronunciation editor. If an essential explanation is ambiguous, clarify the source recording and test another short clip before translating the rest of the series.",
        ],
      },
      {
        title: "Keep Portuguese narration aligned with the picture",
        paragraphs: [
          "Watch the dubbed result at normal speed, especially around a screen change, a safety warning, or the end of an instruction. Portuguese wording can occupy a different amount of time from the source. Alignment places the generated speech against the original timeline; it does not extend a shot or create extra room in a hurried demonstration. Prepare the source with natural pauses around important actions.",
          "The new track replaces the original soundtrack, including music and sound effects. For video input, keep the original MP4 or MOV available so the browser can assemble the translated video download; audio input produces audio. Add any separately licensed music in your editor after checking the narration. Captions, interface labels, slides, and visible mouth movements need their own review because the dubbing workflow does not translate or edit them.",
        ],
      },
      {
        title: "Review a Portuguese series before publishing it",
        paragraphs: [
          "Approve a representative clip before working through a course or product library. Record the audience, preferred forms of address, brand names, units, and wording for repeated instructions in your review checklist. Use that checklist for each new result instead of assuming that an earlier approval covers every recording. Choose a preset or cloned voice based on intelligibility and suitability for the lesson, as well as resemblance to the narrator.",
          "Check the duration and file-size allowance in the upload tool before submitting each lesson. Split material that exceeds those limits at a complete explanation or topic boundary. Download approved results while their links remain available, give each file a clear Portuguese and lesson label, and play the final export before uploading it to your course platform. A fluent Portuguese voice still needs a meaning check from someone who understands the language.",
        ],
      },
    ],
    faqs: [
      [
        "Can I choose a Brazilian or European Portuguese accent?",
        "The selector offers Portuguese without a separate regional accent control. Set a review brief for Brazil or Portugal, then have a listener from that market assess the actual pronunciation, vocabulary, and tone. A Brazilian flag or a cloned voice does not guarantee a Brazilian accent.",
      ],
      [
        "How should I prepare a Portuguese course for dubbing?",
        "Prepare one clear narrator per recording and keep each clip within the duration and file-size limits shown in the tool. Split longer lessons at natural topic boundaries. Test a representative clip and keep a checklist for recurring names, menu labels, and technical terms before processing more lessons.",
      ],
      [
        "Can I keep my video and background music?",
        "Video input retains the original picture and can be combined with the translated track in the browser. The generated narration replaces the original soundtrack, including its music and effects. Keep your source video available and add separately licensed background audio in your editor if needed.",
      ],
      [
        "Does Portuguese dubbing translate subtitles or menu labels?",
        "No. It translates spoken narration. Review captions, slides, product interfaces, and other text in the picture separately. During a walkthrough, make sure the Portuguese instruction still identifies the control that the viewer can see.",
      ],
      [
        "Can Portuguese be the source language?",
        "Yes. Choose Portuguese as the original language and another supported language as the target. Review names, regional expressions, and meaning in the new audio. Use a clear single-speaker recording; conversations with several people and overlapping speech are outside the supported workflow.",
      ],
    ],
  },
  hindi: {
    title: "Hindi Dubbing — Dub Video to Hindi Online | DubbingNow",
    description:
      "Hindi dubbing for clear, single-speaker recordings. Translate video to Hindi, try a cloned or preset voice, and check names, English terms, and audio timing.",
    intro:
      "Create Hindi dubbing for a narrated lesson, an app walkthrough, or a single-speaker explanation. Prepare clear speech and short instructions, keep a checklist of product names and English terms, and ask a Hindi-speaking reviewer to check the generated narration with the original visuals.",
    workflowTitle: "Make a Hindi dub your viewers can follow",
    workflowDescription:
      "Use a focused lesson, check mixed-language terminology, and review the spoken result before publishing.",
    steps: [
      [
        "Prepare a clear lesson",
        "Choose one narrator explaining one topic. Remove background conversations, leave pauses between instructions, and note any names, numbers, or English interface labels that the viewer must recognize.",
      ],
      [
        "Select Hindi and your voice mode",
        "Choose the source language or auto-detect, then Hindi as the target. For cloning, include a clean passage from the original narrator in the uploaded recording.",
      ],
      [
        "Check meaning and pacing",
        "Have a Hindi-speaking listener follow the lesson or task with the video. Review terminology, tone, and the timing of each instruction, then download the result once it is approved.",
      ],
    ],
    sections: [
      {
        title: "Hindi dubbing for courses, explainers, and app lessons",
        paragraphs: [
          "Choose a lesson in which one person explains a process with a clear start, demonstration, and recap. For an English course adapted for Hindi-speaking learners, use a short representative lesson to check whether the explanation is understandable without the original narration. Break complicated instructions into separate sentences in your source recording, and leave a pause before moving to the next step on screen.",
          "A classroom recording with questions from several people needs preparation before upload. Create a separate single-narrator explanation or record a focused summary; multiple speakers remain outside the supported workflow even when they take turns. For an app tour, keep the cursor and relevant controls visible while the narrator describes them. These practical choices give a reviewer a specific task to follow when checking the Hindi result.",
        ],
      },
      {
        title: "Review English terms and the level of formality",
        paragraphs: [
          "Decide how the narration should address its listener: a formal training audience, a customer using an app, or learners following an informal explanation. Ask a Hindi-speaking reviewer whether the forms of address and technical vocabulary fit that relationship. Avoid assuming that a fluent voice has chosen an appropriate register. Review a complete instruction and its context, especially when politeness or a qualification affects what the viewer is being asked to do.",
          "Keep English product names, interface labels, and specialist terms in a review checklist. Some lessons need the original label to remain recognizable alongside the Hindi explanation. Ask your reviewer to listen to these words individually and then in the full sentence. The tool has no Hinglish style switch, pronunciation dictionary, or transcript editor; write down issues for source preparation and result review rather than expecting a setting to enforce your preferred vocabulary.",
        ],
      },
      {
        title: "An example brief for a Hindi app demonstration",
        paragraphs: [
          "Imagine a recording explaining, “Choose Export, select PDF, and check the file before sharing it.” Prepare the clip so the Export control and PDF option remain visible while they are mentioned. Pause while the document opens. Give the reviewer the English labels and the intended action, then ask whether a Hindi-speaking viewer could complete the task by listening to the translated narration and looking at the screen.",
          "Listen for the product name and PDF, then check that the order of the actions has survived translation. Apply the same check to measurements, account names, dates, prices, and numbered steps. If a source instruction is vague, make it more explicit and test a new short recording. A generated voice can sound confident while an important term or condition has changed, so use the original explanation as the reference for your review.",
        ],
      },
      {
        title: "Make room for Hindi speech and review visual text separately",
        paragraphs: [
          "Keep source sentences short enough to explain one action comfortably, and avoid continuous narration across rapid slide changes. The Hindi wording may occupy a different amount of time from the original. Listen at normal speed for a rushed ending, an unnatural gap, or an instruction arriving after the relevant control disappears. Alignment follows the source timeline; it does not extend the picture or edit a visible speaker’s mouth movements.",
          "Hindi dubbing creates spoken narration. Devanagari subtitles, Romanized captions, translated slides, and labels inside the video are separate editorial tasks. Choose which written material your audience needs and review it alongside the audio. The new track also replaces the original soundtrack, including background music and effects. If your final lesson needs music, add an appropriately licensed track in your editor after you have approved the speech.",
        ],
      },
      {
        title: "Check a Hindi course consistently before you publish",
        paragraphs: [
          "For a series of lessons, approve a representative result and keep a checklist of recurring terminology, forms of address, names, and units. Revisit that checklist for every new recording. Compare a preset voice and a cloned result on a short passage when choosing a suitable delivery. For cloning, include clean reference speech from the intended narrator and make sure you have permission to use that voice.",
          "Check the upload tool’s duration and file-size allowance before submitting a lesson. Divide material that is too long at a complete topic boundary instead of cutting an instruction in half. For video, keep the original MP4 or MOV available so the browser can assemble the translated download; audio-only uploads produce audio. Label approved files by lesson and language, save the results before their links expire, and play the final export with a Hindi-speaking reviewer before sharing it.",
        ],
      },
    ],
    faqs: [
      [
        "Can I dub a Hindi video into English?",
        "Yes. Choose Hindi as the source and English as the target for a clear, single-speaker recording. This Hindi-to-English dubbing workflow works well for solo YouTube narration or a course lesson. Ask a fluent reviewer to check Hindi idioms, names, and English words already present in the source.",
      ],
      [
        "Does the tool handle regional Hindi accents?",
        "Hindi dubbing uses one Hindi language option. Use a clean sample of the speaker’s regional accent and check both the translation and the generated pronunciation with a Hindi-speaking reviewer. Try a preset voice if the cloned output is difficult for your audience to follow.",
      ],
      [
        "Can I dub a Bollywood clip without losing the original audio?",
        "Your original file stays intact. The exported Hindi dub uses a new soundtrack, including in place of the original music and effects. For a Bollywood clip you have permission to adapt, use one isolated narrator and add any separately licensed music or effects in your editor after downloading the dub.",
      ],
      [
        "Can I choose Hinglish or control individual pronunciations?",
        "There is no Hinglish style switch or pronunciation dictionary in the tool. Keep English names and interface labels in a checklist, then have a Hindi-speaking listener review how they sound inside the generated sentences. Clarify the original explanation and test a short new recording if an essential term is unclear.",
      ],
      [
        "Does Hindi dubbing create Devanagari subtitles?",
        "No. The result is spoken Hindi narration. Devanagari subtitles, Romanized captions, and translated text within a slide or app screen require separate preparation and review. Check that written labels and spoken instructions still identify the same action.",
      ],
      [
        "Can I use a long Hindi course or classroom discussion?",
        "Check the duration and file-size limit displayed before each upload, and divide longer lessons at natural topic boundaries. Use one clear narrator per recording. A classroom discussion with several speakers or overlapping dialogue needs a separately prepared single-speaker explanation before it fits this workflow.",
      ],
      [
        "Can I download a Hindi video with the original picture?",
        "Yes, when you start with a supported video. Keep the original file available: the browser combines its picture with the translated track for download. If you return to the job later, you may need to select that same video again. Audio-only input produces an audio download.",
      ],
      [
        "Can Hindi be the original language?",
        "Yes. Choose Hindi as the source and a different supported language as the target. Review mixed Hindi and English terminology, names, and the intended meaning in the translated audio. The workflow translates the narration and does not change interface labels or slides.",
      ],
    ],
  },
};
