# DubbingNow 关键词布局锁定清单

## 适用范围与授权规则

本文件是网站关键词布局的权威基线。未经用户明确要求，不得改变页面与关键词的对应关系、URL、Title 核心词片段、H1 核心词或 canonical；不得自行拆分、合并、迁移页面或把既有主词转交其他页面承接。页面新增、改版、重构和 SEO 优化均受此规则约束。

等待下一轮数据、准备 301 重定向或发现优化机会，都不能替代用户的明确修改要求。用户要求调整时，只修改其指定范围，并同步维护本文件；涉及 URL 迁移时配置相应 301，涉及多个锁定项时逐项处理。

Title 措辞、H1 补充句和 meta description 的调整遵守 [AGENTS.md](AGENTS.md) 的谨慎区规则，必须保留本文件中的关键词布局；正式发布后至少等待 2 周再调整。正文、FAQ、内链、图片 alt、示例音频／视频、表格以及字号、间距、布局、交互可以在已授权的维护范围内完善，保持锁定项不变。

## 基线来源与核验范围

- 源码核验日期：2026-10-31；覆盖工作目录中由 `app/sitemap.ts` 枚举的全部 26 个公开页面及 6 个不索引的业务页面。
- 关键词承接关系依据现有 URL、Title、H1 和正文主题归纳；辅助表达／意图用于解释既有分工，不代表要求向页面补写该短语。
- Title、H1 和 canonical 逐页记录有效值。首页 Title 继承 `app/layout.tsx`；H1 中的样式标签和换行合并为可见文本，保留大小写和标点。
- canonical 以生产域名 `https://dubbingnow.com` 为基准；源码通过 `lib/catalog.ts` 的 `siteUrl` 和根布局的 `metadataBase` 解析相对路径。更换该域名同样属于锁定项变更。
- 该基线核验的是源码配置。页面上线日期、搜索引擎收录、排名、搜索量和谨慎区上次正式发布日期均未在此核验；核对发布间隔时应查对应部署记录。

## 首页、工具页与配套页面的关键词承接

| URL                                   | 页面主词                          | 辅助表达／意图                |
| ------------------------------------- | --------------------------------- | ----------------------------- |
| `/`                                   | AI Dubbing Online                 | Dub Videos in Any Language    |
| `/auto-dubbing`                       | Auto Dubbing                      | Single-Speaker Recordings     |
| `/ai-video-dubbing`                   | AI Video Dubbing                  | Dub Videos with AI            |
| `/voice-dubbing`                      | Voice Dubbing                     | Dub Voices in Any Language    |
| `/audio-dubbing`                      | Audio Dubbing                     | Dub Audio Files Online        |
| `/languages`                          | Dubbing Languages                 | Video Translation             |
| `/pricing`                            | AI Dubbing Pricing                | Start Free                    |
| `/how-to-dub-a-video`                 | How to Dub a Video                | into Another Language         |
| `/blog`                               | Dubbing Guides                    | DubbingNow Journal            |
| `/blog/preparing-a-video-for-dubbing` | Prepare Your Video for AI Dubbing | preparing a video for dubbing |
| `/about`                              | About DubbingNow                  | 品牌与产品说明                |
| `/contact`                            | Contact                           | DubbingNow 联系方式           |
| `/privacy`                            | Privacy Notice                    | 隐私说明                      |
| `/terms`                              | Service Terms                     | 服务条款                      |

首页承接通用在线 AI 配音意图；工具页分别承接自动配音、AI 视频配音、声音配音和音频配音。语言目录负责导航，定价页负责价格意图，教程和博客负责操作与内容准备，品牌、联系和法律页面保留各自用途。正文可以自然提及相关主词，但不得把页面改成另一个页面的主词落地页。

## 语言页的关键词承接

| URL                                             | 页面主词              | 辅助表达／意图                 |
| ----------------------------------------------- | --------------------- | ------------------------------ |
| `/languages/english/dub-video-to-english`       | Dub Video to English  | Translate video to English     |
| `/languages/spanish/dub-video-to-spanish`       | Spanish Dubbing       | Dub Video to Spanish Online    |
| `/languages/french/dub-video-to-french`         | Dub Video to French   | Translate video to French      |
| `/languages/german/dub-video-to-german`         | Dub Video to German   | Translate video to German      |
| `/languages/portuguese/dub-video-to-portuguese` | Portuguese Dubbing    | Dub Video to Portuguese Online |
| `/languages/italian/dub-video-to-italian`       | Dub Video to Italian  | Translate video to Italian     |
| `/languages/japanese/dub-video-to-japanese`     | Dub Video to Japanese | Translate video to Japanese    |
| `/languages/korean/dub-video-to-korean`         | Dub Video to Korean   | Translate video to Korean      |
| `/languages/chinese/dub-video-to-chinese`       | Dub Video to Chinese  | Translate video to Chinese     |
| `/languages/hindi/dub-video-to-hindi`           | Hindi Dubbing         | Dub Video to Hindi Online      |
| `/languages/arabic/dub-video-to-arabic`         | Dub Video to Arabic   | Translate video to Arabic      |
| `/languages/dutch/dub-video-to-dutch`           | Dub Video to Dutch    | Translate video to Dutch       |

西班牙语、葡萄牙语、印地语使用 `{Language} Dubbing` 的 H1 和专属 Title；其他 9 个语言页使用 `Dub video to {Language}.` 的 H1 和通用 Title 模板。保留这些差异，不因模板统一或样式整理而重写关键词布局。

## Title、H1 与 canonical 基线

### 首页、工具页与配套页面

| URL                                   | Title 原文                                                  | H1 可见文本                                      | canonical                                                   |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `/`                                   | DubbingNow - AI Dubbing Online, Dub Videos in Any Language  | AI Dubbing Online.                               | `https://dubbingnow.com/`                                   |
| `/auto-dubbing`                       | Auto Dubbing for Single-Speaker Recordings \| DubbingNow    | Auto Dubbing                                     | `https://dubbingnow.com/auto-dubbing`                       |
| `/ai-video-dubbing`                   | AI Video Dubbing - Dub Videos with AI \| DubbingNow         | AI Video Dubbing                                 | `https://dubbingnow.com/ai-video-dubbing`                   |
| `/voice-dubbing`                      | Voice Dubbing - Dub Voices in Any Language \| DubbingNow    | Voice Dubbing                                    | `https://dubbingnow.com/voice-dubbing`                      |
| `/audio-dubbing`                      | Audio Dubbing - Dub Audio Files Online \| DubbingNow        | Audio Dubbing                                    | `https://dubbingnow.com/audio-dubbing`                      |
| `/languages`                          | Dubbing Languages - Explore Video Translation \| DubbingNow | A world of languages.                            | `https://dubbingnow.com/languages`                          |
| `/pricing`                            | AI Dubbing Pricing - Start Free \| DubbingNow               | More stories. Fewer boundaries.                  | `https://dubbingnow.com/pricing`                            |
| `/how-to-dub-a-video`                 | How to Dub a Video into Another Language \| DubbingNow      | How to dub a video.                              | `https://dubbingnow.com/how-to-dub-a-video`                 |
| `/blog`                               | The DubbingNow Journal - Dubbing Guides                     | The journal.                                     | `https://dubbingnow.com/blog`                               |
| `/blog/preparing-a-video-for-dubbing` | Prepare Your Video for AI Dubbing \| DubbingNow             | Before you dub: give your words room to breathe. | `https://dubbingnow.com/blog/preparing-a-video-for-dubbing` |
| `/about`                              | About DubbingNow                                            | A world of voices. One simple workflow.          | `https://dubbingnow.com/about`                              |
| `/contact`                            | Contact \| DubbingNow                                       | Get in touch.                                    | `https://dubbingnow.com/contact`                            |
| `/privacy`                            | Privacy Notice \| DubbingNow                                | Privacy notice.                                  | `https://dubbingnow.com/privacy`                            |
| `/terms`                              | Service Terms \| DubbingNow                                 | Service terms.                                   | `https://dubbingnow.com/terms`                              |

### 语言落地页

| URL                                             | Title 原文                                                        | H1 可见文本            | canonical                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `/languages/english/dub-video-to-english`       | Dub Video to English Online \| DubbingNow                         | Dub video to English.  | `https://dubbingnow.com/languages/english/dub-video-to-english`       |
| `/languages/spanish/dub-video-to-spanish`       | Spanish Dubbing — Dub Video to Spanish Online \| DubbingNow       | Spanish Dubbing.       | `https://dubbingnow.com/languages/spanish/dub-video-to-spanish`       |
| `/languages/french/dub-video-to-french`         | Dub Video to French Online \| DubbingNow                          | Dub video to French.   | `https://dubbingnow.com/languages/french/dub-video-to-french`         |
| `/languages/german/dub-video-to-german`         | Dub Video to German Online \| DubbingNow                          | Dub video to German.   | `https://dubbingnow.com/languages/german/dub-video-to-german`         |
| `/languages/portuguese/dub-video-to-portuguese` | Portuguese Dubbing — Dub Video to Portuguese Online \| DubbingNow | Portuguese Dubbing.    | `https://dubbingnow.com/languages/portuguese/dub-video-to-portuguese` |
| `/languages/italian/dub-video-to-italian`       | Dub Video to Italian Online \| DubbingNow                         | Dub video to Italian.  | `https://dubbingnow.com/languages/italian/dub-video-to-italian`       |
| `/languages/japanese/dub-video-to-japanese`     | Dub Video to Japanese Online \| DubbingNow                        | Dub video to Japanese. | `https://dubbingnow.com/languages/japanese/dub-video-to-japanese`     |
| `/languages/korean/dub-video-to-korean`         | Dub Video to Korean Online \| DubbingNow                          | Dub video to Korean.   | `https://dubbingnow.com/languages/korean/dub-video-to-korean`         |
| `/languages/chinese/dub-video-to-chinese`       | Dub Video to Chinese Online \| DubbingNow                         | Dub video to Chinese.  | `https://dubbingnow.com/languages/chinese/dub-video-to-chinese`       |
| `/languages/hindi/dub-video-to-hindi`           | Hindi Dubbing — Dub Video to Hindi Online \| DubbingNow           | Hindi Dubbing.         | `https://dubbingnow.com/languages/hindi/dub-video-to-hindi`           |
| `/languages/arabic/dub-video-to-arabic`         | Dub Video to Arabic Online \| DubbingNow                          | Dub video to Arabic.   | `https://dubbingnow.com/languages/arabic/dub-video-to-arabic`         |
| `/languages/dutch/dub-video-to-dutch`           | Dub Video to Dutch Online \| DubbingNow                           | Dub video to Dutch.    | `https://dubbingnow.com/languages/dutch/dub-video-to-dutch`           |

完整 Title 和 H1 用于核对原文。核心词按上述页面主词及 Title／H1 中已有的关键词表达保留；没有显式 SEO 主词的品牌式 H1 也按原文保留，不自行补词或改写。

## Meta description 基线

meta description 属于谨慎区。以下内容记录 2026-10-31 源码值，便于识别后续修改及核对发布间隔。

| URL                                             | meta description 原文                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                             | AI dubbing for clear, single-speaker videos and audio. Translate into 12 languages, choose a cloned or preset voice, and preview your dub online.             |
| `/auto-dubbing`                                 | Auto dubbing for clear, single-speaker recordings — translate and dub your narration in one workflow.                                                         |
| `/ai-video-dubbing`                             | AI video dubbing for clear, single-speaker recordings. Translate the narration and bring your video to a new audience.                                        |
| `/voice-dubbing`                                | Voice dubbing for clear, single-speaker recordings, using a preset voice or a clone of your narrator.                                                         |
| `/audio-dubbing`                                | Audio dubbing for clear, single-speaker recordings: solo podcasts, lessons, and voice recordings.                                                             |
| `/languages`                                    | Explore target languages for AI video and audio dubbing, from Spanish and French to Japanese and Chinese.                                                     |
| `/pricing`                                      | Start with a free dubbing allowance, then choose a credit pack for more audio and video translation.                                                          |
| `/how-to-dub-a-video`                           | Learn how to prepare a video, choose a target language, review translated speech, and download an AI dub.                                                     |
| `/blog`                                         | Practical guides for translating your recordings and reaching audiences in another language.                                                                  |
| `/blog/preparing-a-video-for-dubbing`           | Prepare clear, single-speaker video for AI dubbing, with practical checks for narration, names, translation, and timing.                                      |
| `/about`                                        | Translate single-speaker videos and audio with DubbingNow. Learn about voice cloning, preset voices, and supported recording types.                           |
| `/contact`                                      | Contact DubbingNow for help with recordings, credits or data removal.                                                                                         |
| `/privacy`                                      | How DubbingNow handles recordings, processing providers and account data.                                                                                     |
| `/terms`                                        | Recording permissions, service limits and credit handling for DubbingNow.                                                                                     |
| `/languages/english/dub-video-to-english`       | Translate clear, single-speaker video or audio into English with AI dubbing. Choose a preset or cloned voice and review the translated audio online.          |
| `/languages/spanish/dub-video-to-spanish`       | Spanish dubbing for clear, single-speaker recordings. Translate video to Spanish, choose a cloned or preset voice, and review the translated audio online.    |
| `/languages/french/dub-video-to-french`         | Translate clear, single-speaker video or audio into French with AI dubbing. Choose a preset or cloned voice and review the translated audio online.           |
| `/languages/german/dub-video-to-german`         | Translate clear, single-speaker video or audio into German with AI dubbing. Choose a preset or cloned voice and review the translated audio online.           |
| `/languages/portuguese/dub-video-to-portuguese` | Portuguese dubbing for single-speaker video and audio. Translate narration to Portuguese, review pronunciation and timing, and download the new voice track.  |
| `/languages/italian/dub-video-to-italian`       | Translate clear, single-speaker video or audio into Italian with AI dubbing. Choose a preset or cloned voice and review the translated audio online.          |
| `/languages/japanese/dub-video-to-japanese`     | Translate clear, single-speaker video or audio into Japanese with AI dubbing. Choose a preset or cloned voice and review the translated audio online.         |
| `/languages/korean/dub-video-to-korean`         | Translate clear, single-speaker video or audio into Korean with AI dubbing. Choose a preset or cloned voice and review the translated audio online.           |
| `/languages/chinese/dub-video-to-chinese`       | Translate clear, single-speaker video or audio into Chinese with AI dubbing. Choose a preset or cloned voice and review the translated audio online.          |
| `/languages/hindi/dub-video-to-hindi`           | Hindi dubbing for clear, single-speaker recordings. Translate video to Hindi, try a cloned or preset voice, and check names, English terms, and audio timing. |
| `/languages/arabic/dub-video-to-arabic`         | Translate clear, single-speaker video or audio into Arabic with AI dubbing. Choose a preset or cloned voice and review the translated audio online.           |
| `/languages/dutch/dub-video-to-dutch`           | Translate clear, single-speaker video or audio into Dutch with AI dubbing. Choose a preset or cloned voice and review the translated audio online.            |

## 不承接搜索关键词的业务页面

以下页面均显式设置 `robots: { index: false, follow: false }`，不在 sitemap 中，也没有声明 canonical。保留其业务用途和不索引状态，不把它们扩展为关键词落地页。

| URL               | 用途       | Title 原文                                 | H1 可见文本                 |
| ----------------- | ---------- | ------------------------------------------ | --------------------------- |
| `/login`          | 登录       | Sign In \| DubbingNow                      | Continue your story.        |
| `/register`       | 注册       | Create an Account \| DubbingNow            | Your story, more languages. |
| `/account`        | 账户与积分 | My Account & Credits \| DubbingNow         | More room for your stories. |
| `/admin`          | 管理后台   | User & Credit Administration \| DubbingNow | Users & credits.            |
| `/auth/callback`  | 登录回调   | Completing Sign-in \| DubbingNow           | Welcome to DubbingNow.      |
| `/billing/return` | 账单返回   | Your Credits \| DubbingNow                 | Your dubbing credits.       |

源码入口：`app/layout.tsx`、`app/page.tsx`、`lib/catalog.ts`、`lib/language-content.ts`、`app/[tool]/page.tsx`、`app/languages/[lang]/[page]/page.tsx`、各静态页面的 `page.tsx`、`app/sitemap.ts` 与 `app/robots.ts`。
