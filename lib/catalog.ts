export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://dubbingnow.com"
).replace(/\/$/, "");

export const languages = [
  {
    code: "en",
    slug: "english",
    name: "English",
    native: "English",
    flag: "🇺🇸",
  },
  {
    code: "es",
    slug: "spanish",
    name: "Spanish",
    native: "Español",
    flag: "🇪🇸",
  },
  {
    code: "fr",
    slug: "french",
    name: "French",
    native: "Français",
    flag: "🇫🇷",
  },
  { code: "de", slug: "german", name: "German", native: "Deutsch", flag: "🇩🇪" },
  {
    code: "pt",
    slug: "portuguese",
    name: "Portuguese",
    native: "Português",
    flag: "🇧🇷",
  },
  {
    code: "it",
    slug: "italian",
    name: "Italian",
    native: "Italiano",
    flag: "🇮🇹",
  },
  {
    code: "ja",
    slug: "japanese",
    name: "Japanese",
    native: "日本語",
    flag: "🇯🇵",
  },
  { code: "ko", slug: "korean", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "zh", slug: "chinese", name: "Chinese", native: "中文", flag: "🇨🇳" },
  { code: "hi", slug: "hindi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", slug: "arabic", name: "Arabic", native: "العربية", flag: "🇸🇦" },
  {
    code: "nl",
    slug: "dutch",
    name: "Dutch",
    native: "Nederlands",
    flag: "🇳🇱",
  },
] as const;

export const tools = [
  {
    slug: "auto-dubbing",
    name: "Auto Dubbing",
    title: "Auto Dubbing - Dub Full Videos Automatically | DubbingNow",
    eyebrow: "LESS EDITING. MORE CREATING.",
    description:
      "Upload clear narration — translate and dub it in one workflow.",
    intro:
      "Auto dubbing brings transcription, translation, and speech generation into one workflow. With automatic dubbing, you can adapt a complete recording without exporting every line yourself.",
    accept: "all" as const,
    icon: "sparkles",
    use: "A complete recording, translated in one workflow.",
    faqs: [
      [
        "What is automatic dubbing?",
        "Automatic dubbing turns the speech in a recording into another language, then aligns the translated audio with the original timeline.",
      ],
      [
        "Do I need to split a video by speaker?",
        "For this release, use one clear speaker per recording. Cloning uses reference speech from that recording.",
      ],
      [
        "Does auto dubbing copy the original voice?",
        "Choose cloning preview to use the original speaker’s voice, using clean reference speech from the recording. Preset voices are also available.",
      ],
    ],
  },
  {
    slug: "ai-video-dubbing",
    name: "AI Video Dubbing",
    title: "AI Video Dubbing - Dub Videos with AI | DubbingNow",
    eyebrow: "YOUR NEXT AUDIENCE IS EVERYWHERE.",
    description:
      "Translate the voices. Keep the story. Bring your videos to a new audience.",
    intro:
      "AI video dubbing is designed for video creators, educators, and teams adapting visual content. Choose an MP4 or MOV and a target language, then preview and download your dubbed video on this page.",
    accept: "video" as const,
    icon: "video",
    use: "Tutorials, narrated videos, and single-speaker stories.",
    faqs: [
      [
        "Which video formats can I upload?",
        "Choose an MP4 or MOV. The upload tool shows your current file-size and duration limits.",
      ],
      [
        "Will the visuals change?",
        "The workflow replaces the speech audio and retains the original video. It does not translate text embedded in the image.",
      ],
      [
        "Does this include lip sync?",
        "No. Audio timing is aligned to the recording, but the mouths and facial movements are not edited.",
      ],
    ],
  },
  {
    slug: "voice-dubbing",
    name: "Voice Dubbing",
    title: "Voice Dubbing - Dub Voices in Any Language | DubbingNow",
    eyebrow: "EVERY SPEAKER HAS A VOICE.",
    description:
      "Bring your narration across languages with a consistent voice.",
    intro:
      "Voice dubbing helps adapt narrated content. Choose a preset voice or clone the original voice using clean reference speech from the recording.",
    accept: "all" as const,
    icon: "mic",
    use: "Clear narration, tutorials and single-speaker recordings.",
    faqs: [
      [
        "What happens when there are several speakers?",
        "The first release is intended for one speaker per recording. Overlapping conversations are not supported. A separate single-voice test mode reuses one saved voice.",
      ],
      [
        "Can I clone a voice?",
        "Cloning preview is available through the connected service. The source must contain enough clear, natural speech for the first voice. During testing, that saved voice is reused.",
      ],
      [
        "What about overlapping speech?",
        "People speaking over one another can reduce recognition quality. Clear turn-taking produces more reliable results.",
      ],
    ],
  },
  {
    slug: "audio-dubbing",
    name: "Audio Dubbing",
    title: "Audio Dubbing - Dub Audio Files Online | DubbingNow",
    eyebrow: "BIG IDEAS. NO LANGUAGE BARRIER.",
    description:
      "Give your podcast, lesson, or voice recording a new language.",
    intro:
      "Audio dubbing translates recordings without a video track. Upload MP3 or WAV audio, choose the language for your listeners, and preview or download the resulting audio here.",
    accept: "audio" as const,
    icon: "headphones",
    use: "Podcasts, audio lessons, and voice recordings.",
    faqs: [
      [
        "Which audio formats work?",
        "Upload an MP3 or WAV file. The upload tool shows your current file-size and duration limits.",
      ],
      [
        "Can I use this for a podcast?",
        "Yes, for clear single-speaker narration within the duration limit shown in the upload tool.",
      ],
      [
        "Do I get a video back?",
        "Audio uploads produce audio outputs. Use AI Video Dubbing if you want a translated video.",
      ],
    ],
  },
];

export const commonFaqs: [string, string][] = [
  [
    "How do I dub a video into another language?",
    "Upload your recording, select the source and target languages, and start dubbing. The workflow transcribes the speech, translates it, generates the selected voices, and aligns the new audio. Preview and download the result on the same page.",
  ],
  [
    "Do I need an account to get started?",
    "No. You can try a short recording after human verification. The tool shows the trial duration and your remaining uses. In demo mode, the result is a fixed sample.",
  ],
  [
    "Can I dub a video with multiple speakers?",
    "The first release is intended for clear recordings with one speaker. Overlapping conversations are not supported.",
  ],
  [
    "What can I try for free?",
    "Try a short recording without an account after human verification. New accounts receive free credits once. See the pricing page for current trial limits and credit rates. Preview mode has no paid transactions.",
  ],
  [
    "Does DubbingNow preserve the original speaker’s voice?",
    "Choose cloning preview with clean reference speech from your recording. During testing, one saved voice is reused. Cloning quality is still being evaluated; preset voices remain available. Lip-sync editing is not provided.",
  ],
  [
    "What happens to my uploaded files?",
    "In demo mode, files stay on your device. The connected service uploads audio privately and keeps results for 24 hours after completion. Download links are time-limited; see the privacy notice for source and voice retention.",
  ],
];
