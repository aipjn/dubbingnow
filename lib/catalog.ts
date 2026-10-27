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
    title: "Auto Dubbing for Single-Speaker Recordings | DubbingNow",
    eyebrow: "LESS EDITING. MORE CREATING.",
    description:
      "Auto dubbing for clear, single-speaker recordings — translate and dub your narration in one workflow.",
    intro:
      "Auto dubbing is for clear, single-speaker recordings. It brings transcription, translation, and speech generation into one workflow, so you can adapt a narrated recording without exporting every line yourself. Multi-speaker interviews and overlapping conversations are not supported in this release.",
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
      "AI video dubbing for clear, single-speaker recordings. Translate the narration and bring your video to a new audience.",
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
    eyebrow: "ONE VOICE. MORE POSSIBILITIES.",
    description:
      "Voice dubbing for clear, single-speaker recordings, using a preset voice or a clone of your narrator.",
    intro:
      "Voice dubbing helps adapt narrated content. Choose a preset voice or clone the original voice using clean reference speech from the recording.",
    accept: "all" as const,
    icon: "mic",
    use: "Clear narration, tutorials and single-speaker recordings.",
    faqs: [
      [
        "What happens when there are several speakers?",
        "This release supports one clear speaker per recording. Multi-speaker recordings and overlapping conversations are not supported, even when speakers take turns.",
      ],
      [
        "Can I clone a voice?",
        "Choose cloning preview to use clear reference speech from the speaker in your uploaded recording. Include a clean 10–30 second passage. Quality varies with the recording and the target language; review the result before sharing it.",
      ],
      [
        "What about overlapping speech?",
        "Overlapping speech is not supported. Use one narrator per recording, without other voices or music competing with the narration.",
      ],
    ],
  },
  {
    slug: "audio-dubbing",
    name: "Audio Dubbing",
    title: "Audio Dubbing - Dub Audio Files Online | DubbingNow",
    eyebrow: "BIG IDEAS. NO LANGUAGE BARRIER.",
    description:
      "Audio dubbing for clear, single-speaker recordings: solo podcasts, lessons, and voice recordings.",
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
    "Choose a clear recording with one speaker, select the source and target languages, and start dubbing. The workflow transcribes and translates the narration, generates a preset or cloned voice, and aligns the new audio. Review the result on the same page before downloading it.",
  ],
  [
    "Do I need an account to get started?",
    "No. A guest can try a short recording after human verification. The tool shows the current trial duration and remaining uses before you start. Sign in to use account credits and see your account’s processing records; the guest allowance and account credits are separate.",
  ],
  [
    "Can I dub a video with multiple speakers?",
    "No. This release supports clear recordings with one speaker. Multi-speaker interviews, group conversations, and overlapping speech are not supported. Choose a solo narration or prepare a separate single-narrator recording before uploading.",
  ],
  [
    "What can I try for free?",
    "Guests can use a limited short-recording trial after human verification. Eligible new accounts receive a one-time credit gift. The tool displays your allowance and quotes the credit cost before processing. Failed or cancelled jobs return their reserved credits. See Pricing for current limits and rates.",
  ],
  [
    "Does DubbingNow preserve the original speaker’s voice?",
    "Choose cloning preview to use reference speech from the original narrator in your upload. Include a clear 10–30 second passage without other voices or loud music. Cloning quality varies by source and target language, so compare the result with your original. Preset voices are also available; lip-sync editing is not included.",
  ],
  [
    "What happens to my uploaded files?",
    "Original videos stay on your device; only the audio needed for dubbing is uploaded to private storage and sent for processing. Results are available for 24 hours after completion, with time-limited download links. Download the result before it expires. See the privacy notice for the full retention and provider details.",
  ],
];
