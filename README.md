# DubbingNow

按 `fangan1.0.txt` 的 SEO 页面方案搭建的 Next.js App Router / TypeScript / Tailwind 网站，现包含 Node API、Cloudflare D1 用户与积分数据库、私有 R2 音频存储和 Vercel Queues 配音消费者；独立 worker 和 SQLite 保留供本地开发使用。Google Gemini 负责识别、翻译和预设音色；声音克隆默认使用 Fish Audio inline 参考音，视频提取与合并留在浏览器内部执行。

正式站 [dubbingnow.com](https://dubbingnow.com/) 已部署到 Vercel，域名和 HTTPS 已通过检查。完整正式站业务链路仍待验收。平台分工、代码结构、密钥位置和复用、发布调试方法见 [项目交接手册](docs/PROJECT_HANDOVER.md)，具体执行方式见 [Vercel 部署说明](docs/VERCEL_DEPLOYMENT.md)。

## 本地运行

需要 Node.js 22.16+ 和 PATH 中的 FFmpeg / ffprobe。不需要 Python、PyTorch、GPU 或模型下载。

```bash
npm install
cp .env.example .env.local
# 本地开发：在 .env.local 设置 PERSISTENCE_DRIVER=local、BACKEND_LOCAL=true
# 并设置 BACKEND_PUBLIC_URL=http://127.0.0.1:3000
npm run dev
```

另开终端运行 `npm run worker`，打开 http://127.0.0.1:3000。`.env.example` 默认 `NEXT_PUBLIC_API_BASE_URL=/`，使用本站真实后台。示例文件中的 Google key、Auth0 和 Turnstile 配置默认留空：页面可以访问，真实登录/真人验证/配音按缺失项报错，配音 key 缺失时不会创建任务或扣积分。

配置和部署说明：[docs/BACKEND.md](./docs/BACKEND.md)。填写 `GEMINI_API_KEY` 后重启 API 与 worker；公共 Auth0 / Turnstile 变量改变后还需重新构建前端。

需要旧的浏览器演示时，显式设置 `NEXT_PUBLIC_API_BASE_URL=` 并重新启动/构建：不上传用户文件、不进行翻译、不收款；完成后展示固定西班牙语样例，页面明确标注 demo。

视频的音轨提取与结果合并在内部自动执行，产品页面只展示选文件、配音、预览和下载，不展示本地测试区或实现细节。原视频不上传；服务器返回对齐后的音轨。刷新后重选原文件即可恢复视频下载。

## 使用独立 API 域名

```env
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_SITE_URL=https://dubbingnow.com
```

本站同源时用 `/` 即可。独立域名时同时设置服务端 `BACKEND_PUBLIC_URL` 和 `API_ALLOWED_ORIGINS`，然后重启开发服务；生产环境需重新 build（NEXT_PUBLIC 变量在构建时注入）。API base URL 不包含 `/v1`。API 不可用时显示真实错误，不会静默切回演示。

- 接口解释和后端验收：[docs/API.md](./docs/API.md)
- OpenAPI 3.1：[docs/openapi.yaml](./docs/openapi.yaml)
- 前端 wire types：`lib/api/types.ts`
- HTTP 实现：`lib/api/http.ts`
- 演示实现：`lib/api/demo.ts`

## 登录与积分

登录采用 Auth0 Universal Login（官方 SPA SDK / PKCE），本站不收密码。按 `.env.example` 配置 domain、client ID 和自定义 API audience，回调为 `/auth/callback`。Auth0 tenant 配置和后端验证规则见 [docs/API.md](./docs/API.md)。

游客默认一次 30 秒试用，使用 Turnstile 真人验证；真实账户必须验证邮箱后使用；新账户赠额受策略与服务端上限共同约束（默认上限 50 积分），同邮箱的不同身份不重复赠送。演示模式仍为 500 积分。赠送额度、试用限制、每分钟费率、最低扣费和计费粒度可在 `/admin` 配置。当前 10/20 积分每分钟是可修改的初始规则，正式费率以后确定。任务先报价再预留积分，成功结算，失败或取消退回预留；`/account` 显示余额、流水和任务历史。首次管理员通过服务端白名单或 `npm run admin:grant -- "auth0|subject"` 授予，普通用户不能自选角色。

未配置 API URL 时，登录页面明确使用模拟身份，只填写样例姓名和邮箱，新身份可勾选预览管理员。数据存于当前浏览器，模拟验证不证明真人，也没有真实 Auth0 登录。接后台后自动使用 Auth0，不发送模拟身份或自选角色。

## 已实现

- 首页和四个工具页：Auto Dubbing、AI Video Dubbing、Voice Dubbing、Audio Dubbing。
- 语言总览、12 个目标语言落地页、定价、教程、博客与基础信息页。
- 首屏上传、拖拽/选文件/试用样例、格式和大小检查、语言选择、实时额度。
- 独立 media worker 本地提取视频音轨（AAC 直接复制或保留源采样率/声道的 WAV），只直传音频，本地合并 MP4。视频包直接复制，保留旋转方向，不重新编码画面。
- 后台调用 Google 完成清晰人声的识别、翻译与预设配音；克隆使用 Fish 当前任务参考音，按原时间线输出 24 kHz 单声道 WAV。当前限单人，不做音频分离或背景保留，新配音替换原音轨。
- worker 分块 SHA-256、签名直传、上传进度、任务创建/阶段轮询/取消。
- 当前页音视频预览和下载；网络中断后恢复，真实任务刷新后恢复，幂等创建避免重复扣额。
- 积分规则和管理接口已实现。支付客户端契约保留，价格和支付供应商未确定，后台充值接口明确不可用，不会收款或模拟到账。
- SSR/静态生成正文、逐页 metadata/canonical、sitemap、robots、SoftwareApplication 和面包屑结构化数据、移动布局。

`/languages/spanish/dub-video-to-spanish` 等是英文功能页，不是西班牙语界面。因此不添加互相错误的 hreflang。网站 UI 多语言版本尚未实现。FAQ 正文已实现，未添加已退役的 Google FAQ rich-result 标注。

## Cloudflare 持久存储

正式存储方案为 D1 保存用户、积分、任务、音色和计时，私有 R2 保存音频。原视频不上传，服务器只使用临时目录做处理。配置变量和初始化步骤见 [CLOUDFLARE_STORAGE.md](docs/CLOUDFLARE_STORAGE.md)。`.env.example` 默认使用 Cloudflare；纯本地开发需显式设置 `PERSISTENCE_DRIVER=local`、`BACKEND_LOCAL=true` 和本机 `BACKEND_PUBLIC_URL`。

## 验证

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

首次浏览器测试前运行 `npx playwright install chromium`。E2E 自动启动本地开发服务，验证演示流程、限制、取消、页面和移动首屏；这套演示测试需显式设置 `NEXT_PUBLIC_API_BASE_URL=`，并先停止真实模式服务。`npm test` 包含真实 SQLite、JWT 签名验证、上传探测、原子扣费/退款、Google 请求适配器和 FFmpeg 对齐测试，Google 响应使用测试替身，不调用付费 API。

保持 Google/Auth0/Turnstile 配置留空，在同源真实模式 `npm start` 后运行 `npm run test:backend-live`，可直接验证 Next API、SQLite 与浏览器的实际连接和缺失配置提示；业务 HTTP 不做模拟。

真实 HTTP 适配器还提供独立联调测试（HTTP 响应由浏览器拦截模拟，不包含后台）：

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.dubbingnow.test npm run build
npm start
# 另一个终端
npm run test:live
```

它验证只上传提取后的音频、timeline、结果本地合并及刷新重选、实际 worker 文件哈希、签名直传、创建响应丢失后的同键重试、会话复用、刷新恢复和结果链接。测试结束后停止服务，执行 `npm run build` 并重新 `npm start` 恢复 `.env.local` 中配置的模式。运行构建、类型检查和浏览器测试时不要同时改写 `.next` 或源文件。

Auth0 SDK 的跳转和错误回调测试使用测试域名，不需要真实租户。停止服务后用以下变量构建，再 `npm start`，运行 `npm run test:auth`；也可在同一构建运行 `npm run test:live`：

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.dubbingnow.test \
NEXT_PUBLIC_AUTH0_DOMAIN=login.dubbingnow.test \
NEXT_PUBLIC_AUTH0_CLIENT_ID=preview-auth0-client \
NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.dubbingnow.test npm run build
```

此测试验证 Universal Login、signup hint、PKCE、audience、回调 URL 和错误 state 拒绝，不代表已完成真实租户登录联调。

## 声音克隆与耗时基准

默认 `CLONE_PROVIDER=fish`、`FISH_VOICE_MODE=inline`、`FISH_ALLOW_VOICE_CREATION=false`：用户选择视频/音频和目标语言，后台从本次上传音频挑选干净、自然的 10–30 秒连续参考句，随 Fish 合成请求发送，不创建保存音色，不占新的保存席位。原视频不上传，参考句不合格时失败退款。

`FISH_API_KEY` 只保存在服务端私有配置。`FISH_REFERENCE_ID` 仅用于显式历史 `saved_test` 模式，未进入当前生产环境；该模式不能作为用户自己的声音克隆提供。`npm run fish:voice` 可只读检查账号；不要为普通联调运行创建、删除或替换保存模型。历史测试材料见 [Fish 测试说明](docs/FISH_TESTING.md)，当前生产行为以 [项目交接手册](docs/PROJECT_HANDOVER.md) 为准。

`TEXT_PIPELINE=combined` 默认合并识别与翻译请求，`SYNTHESIS_CONCURRENCY=3` 默认三路合成；对照组可设为 `separate` / `1`。`npm run benchmark:local` 运行固定分句、真实 FFmpeg、模拟供应商延迟的受控比较。

[Fish 单席位测试说明](./docs/FISH_TESTING.md)；[参考筛选算法与前期 Google 基准](./docs/VOICE_CLONING.md)。Cloudflare 模式的音色记录和任务计时保存在 D1；本地模式任务计时在 `.data/metrics/<jobId>.json`；浏览器阶段计时在当前会话的 `dubbingnow.client-timing.v1.*` sessionStorage 中。

`npm run test:full-chain` 提供真实配音联调：自动启动生产 Next 与 worker，在隔离数据库中准备已验证游客会话，从网页上传视频、调用真实 Google/Fish、下载并播放合并结果，再检查刷新恢复、手机布局、单次试用结算和音色席位数。没有 HTTP 拦截，不覆盖真实 Auth0/Turnstile 或支付。需先生产构建、保持 3000 端口空闲，并具备已保存 Fish 音色及本次参考 `.runtime/fish/test-reference.wav`。输出和计时见 `.runtime/full-chain/run-*/`。

`STREAM_TEXT_PIPELINE=true` 可让历史保存 Fish 测试音色的 clone 任务按完整译文分句提前合成；代码默认关闭，生产虽配置为 true，但 inline 路径不会进入该分支，仍先做完整分析和参考验证。并发上限为 `SYNTHESIS_CONCURRENCY`，最终校验通过后才发布结果；断流或取消会中止并等待在途任务。

`npm run test:compare-streaming` 自动按普通/流式/流式/普通跑四轮真实网页全链路，固定输入 SHA-256、模型、提示词和三路并发，逐轮保存点击到可下载时间、阶段计时、分句数和合成字数。识别翻译会有生成差异，报告保留这些差异，不能把小样本波动当作稳定性能保证。报告位于 `.runtime/full-chain/comparison-*/report.json`。

## 后续联调

真实 Google / Fish、D1/R2 和本地 Auth0 配音已有验收记录；正式域名上的真实注册、游客验证、队列、关页继续执行、积分与下载仍需完整验收。Auth0 的正式邮件发送服务、Google OAuth 自有凭据、真实支付及外部告警仍待接入。支持联系方式和服务条款已配置；具体证据与边界见 [项目交接手册](docs/PROJECT_HANDOVER.md)。

## 示例素材

`public/demo/english.wav` 和 `spanish.wav` 为本项目原创短文的系统预设 TTS 样例；`english.mp4` 为同一英文音轨配纯色文字画面。没有克隆任何人的声音。

英文：Every story begins with a voice. A voice that shares an idea, opens a door, and brings people together. Now imagine your story, in another language.

西班牙语：Cada historia comienza con una voz. Una voz que comparte una idea, abre una puerta y une a las personas. Ahora imagina tu historia, en otro idioma.

本地媒体浏览器测试还用 ffprobe 校验音视频流、每个视频编码包的 SHA-256、旋转矩阵和裁切时长。该测试需要 FFmpeg/ffprobe（当前路径 /Users/h0270/miniconda3/bin/），可用 FFMPEG_PATH、FFPROBE_PATH 指定其他路径。

## 上线准备实现（2026-10-19）

最新复核、修复和实际测试结果见 [2026-10-24 发布状态](docs/LAUNCH_STATUS_2026-10-24.md)。

生产部署流程与仍需外部资料的验收见 [PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md)。现有 Google + Fish 与本地单席位音色保留。

- 完成的音频刷新后可恢复，账户任务历史支持再次打开、签名刷新与过期结果提示。
- 正式克隆默认 `FISH_VOICE_MODE=inline`：从本次上传选取参考人声，通过 MessagePack 随合成请求发送，不使用固定音色 ID，不注册持久声音模型。`saved_test` 仅供显式复用原测试音色；旧的 `per_job` 注册模式仍须准备模型容量并开启创建。
- 默认限制 300 秒、100 MB、1 人；赠额上限 50。每日音频尝试量、上传量、队列上限、排队与运行超时均可配置。取消/失败退积分但不退每日尝试预算。
- `/v1/ready` 检查必要的 worker 心跳与磁盘；worker 离线时生产环境拒绝新任务。API 读取和维护也会结算过期任务，不依赖 worker 重启才退款。
- `npm run preflight` 检查生产配置；构建后用 `npm run preflight -- --require-build` 核对公开配置与前端产物，API 服务启动时也执行此检查，避免部署演示产物或旧登录配置。`npm run monitor` 输出健康/失败率检查，异常退出非零。
- `npm run backup -- create <backup-root>` 在线备份；`npm run backup -- restore <snapshot> <new-directory>` 校验并恢复到新目录，不覆盖已有数据。
- `deploy/` 提供 systemd API/worker/监控/每日备份与 nginx 模板；`.github/workflows/ci.yml` 提供自动验证。模板尚未安装到服务器。

正式 Auth0 登录配置、域名/TLS、支持邮箱/主体名称及真实设备/自然人声验收仍需补齐。支付继续禁用。当前功能进展见 [FUNCTIONAL_STATUS.md](docs/FUNCTIONAL_STATUS.md)，不能把存储接入通过当成登录注册或整站上线完成。
