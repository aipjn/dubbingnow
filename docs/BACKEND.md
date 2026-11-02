> 正式存储方案已更新为 Cloudflare D1 + 私有 R2，接入、凭据、初始化和云端验证见 [CLOUDFLARE_STORAGE.md](CLOUDFLARE_STORAGE.md)。下文的本地磁盘/SQLite 操作为 `PERSISTENCE_DRIVER=local` 开发模式。独立 worker 的处理链路保持不变。

> 当前生产架构与配置以 [项目交接手册](PROJECT_HANDOVER.md) 为准：Vercel Queues + D1/R2，Fish 克隆默认使用本次任务的 inline 参考音。本文中的 SQLite / 独立 worker / 单席位音色章节适用于本地或显式测试模式。

# 后台运行与配置

当前实现是一个可持久运行的单机后台：Next.js Node 路由提供 `/v1` HTTP API，SQLite 保存用户、积分和任务，独立 worker 调用 Google / Fish 并处理音频。服务器只接收音频；原视频由浏览器保留，收到新音轨后自动合并。产品界面不展示提取、分段或合并等实现步骤。

## 本地启动

需要 Node.js 22.16+、FFmpeg 和 ffprobe。Node 的 `node:sqlite` 可能打印实验性警告。

```bash
npm install
cp .env.example .env.local
npm run dev
```

另一个终端，同一项目目录：

```bash
npm run worker
```

当前只处理清晰人声，识别和翻译调用 Google，预设配音使用 Google，默认克隆配音使用 Fish Audio。服务器不运行音频分离模型，不需要 Python、PyTorch 或 GPU；FFmpeg 仅用于音频格式转换和片段时间对齐。返回的新配音替换原音轨，不保留背景音乐和环境声。

前端与 API：`http://127.0.0.1:3000`；健康接口：`GET /v1/health`。worker 是独立进程，单独启动网站不会处理队列。首次启动自动创建 `.data/dubbing.sqlite` 和私有文件目录；在本地模式生成并持久保存文件签名密钥。`.data` 和 `.env.local` 均不提交版本库。

示例配置中的 Google key、Auth0、Turnstile 值默认留空，需要在本地 `.env.local` 填入。API 可以启动，缺失对应服务时返回明确的 `SERVICE_UNAVAILABLE`；缺少 Google key 时创建任务在积分预留前失败，不生成固定配音结果。没有配置真人验证时游客不能绕过验证上传。测试替身仅由测试代码显式注入，生产接口没有模拟身份或验证绕过开关。

## 配置项

| 变量                                            | 用途                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| NEXT_PUBLIC_API_BASE_URL                        | `/` 使用本站后台；独立 API origin 不带 `/v1`；空值显式使用浏览器 demo          |
| NEXT_PUBLIC_AUTH0_DOMAIN / CLIENT_ID / AUDIENCE | 公共 Auth0 SPA 配置；完整变量名见 `.env.example`                               |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY                  | 公共真人验证 site key                                                          |
| CLONE_PROVIDER                                  | `fish`（默认）或 `google`；只影响 clone 模式                                   |
| FISH_API_KEY                                    | 服务端 Fish key，默认留空                                                      |
| FISH_TTS_MODEL                                  | 默认 `s2.1-pro-free` 开发测试档；不会自动切换付费档                            |
| FISH_REFERENCE_ID                               | 可选，指定既有音色；未指定则持久保存首次音色                                   |
| GEMINI_API_KEY                                  | Google AI Studio Gemini API key，仅 API 与 worker 读取                         |
| GEMINI_TEXT_MODEL                               | 识别和翻译，默认 `gemini-3.8-flash`                                            |
| GEMINI_TTS_MODEL                                | standard，默认 `gemini-3.8-flash-lite-tts`                                     |
| GEMINI_HIGH_FIDELITY_TTS_MODEL                  | high_fidelity，默认 `gemini-3.8-flash-tts`；代表供应商模型档位，不代表声音克隆 |
| AUTH0_ISSUER / AUTH0_AUDIENCE                   | 服务端 JWT issuer/audience；空值从公共 Auth0 配置派生                          |
| AUTH0_ADMIN_SUBJECTS                            | 逗号分隔的可信 Auth0 subject；仅首次建用户时授予管理员                         |
| TURNSTILE_SECRET_KEY                            | 服务端 Siteverify secret，需与公共 site key 配对                               |
| BACKEND_PUBLIC_URL                              | 外部可访问的 API origin，用于生成上传与下载地址                                |
| BACKEND_DATA_DIR                                | 默认 `.data`；API、worker、管理 CLI 必须指向同一个持久目录                     |
| STORAGE_SIGNING_SECRET                          | 至少 32 字符，API 与 worker 共用；生产必须设置                                 |
| BACKEND_LOCAL                                   | 本地预览可为 true；生产为 false，禁止依赖自动生成密钥                          |
| TEXT_PIPELINE                                   | `combined`（默认）识别和翻译合并一次请求；`separate` 用于对照                  |
| SYNTHESIS_CONCURRENCY                           | 1–8，默认 3；分别限制翻译、音色创建和合成阶段的并发                            |
| FFMPEG_PATH / FFPROBE_PATH                      | 可执行文件路径；空值使用 PATH                                                  |
| API_ALLOWED_ORIGINS                             | 额外允许的完整网页 origins，逗号分隔；API origin 自动允许                      |
| TRUST_PROXY                                     | 仅可信代理覆盖 X-Forwarded-For 且禁止直连时启用；取最后一个地址                |
| GUEST_IP_TRIAL_USES                             | 同一网络每天允许的游客试用数，默认 3；失败或取消退还预算                       |

修改服务器 key 后重启 API 与 worker。`NEXT_PUBLIC_*` 在前端构建时注入，修改它们需重新构建。禁止将任何私钥加 `NEXT_PUBLIC_` 前缀。

本地电脑如果通过系统代理访问 Google，Node 不会自动沿用 macOS 系统代理。Node 22.21+ 可在 `.env.local` 设置 `NODE_OPTIONS=--use-env-proxy`、`HTTPS_PROXY` / `HTTP_PROXY` 为现有代理地址，`NO_PROXY=127.0.0.1,localhost` 保持本站请求直连。启动脚本会在 Node 启动前加载 `.env.local`。这些是本机网络配置，不要直接复制到正式服务器。

Google 适配器使用当前 [Interactions REST API](https://ai.google.dev/gemini-api/docs/interactions-overview) 与 [TTS 请求格式](https://ai.google.dev/gemini-api/docs/speech-generation)。模型可在环境变量中配置，但必须兼容该请求格式；旧版 generateContent-only TTS 模型不能只改名字直接接入。key 留空时未做实际供应商调用，提供 key 后需确认账户模型权限、配额、语言效果和费用。

## 登录、管理员与积分

Auth0 Universal Login / PKCE 的租户配置见 [API.md](API.md)。API 验证 RS256 JWKS、issuer、audience 和有效期，不接受 ID token、自选角色或浏览器传入的价格。`/userinfo` 获取账号联系资料，应用账户以 issuer + sub 唯一关联。已知身份的资料短暂缓存，但每个请求重新验证 JWT 和本地账户状态。

用户首次登录原子创建账户与钱包，赠额受策略与 SIGNUP_CREDITS_CAP 共同控制，默认上限 50 积分；真实登录必须通过邮箱验证，同一邮箱不重复赠送。管理员可以在 `/admin` 搜索用户、暂停/恢复、调整积分以及修改赠送和计费规则。初始 10/20 积分每分钟是待定的可配置规则，注册赠送和费率改变不会覆盖已有钱包或旧报价。

配置初始管理员的两种方式：首次登录前填 `AUTH0_ADMIN_SUBJECTS`；已有账户则运行以下服务器命令（subject 是 Auth0 真实 user ID，不是邮箱）：

```bash
npm run admin:grant -- 'auth0|your-user-id'
```

CLI 只授予已有账户角色并记录审计。API 不提供公开授予管理员接口。管理员调整积分必须填写理由和幂等 key；暂停账号会取消其未完成任务并返还预留积分。

游客 session 保存 opaque token 的哈希；真实 Siteverify 成功且 action=guest_trial、hostname 匹配才发 10 分钟授权。默认一次、最多 30 秒，同时检查原视频 timeline。除了单会话限额，还有持久的网络日预算和请求限流。未启用可信代理时所有请求使用同一保守网络预算；这适合本地，生产需正确配置代理，避免所有用户共用预算。

## 上传与任务

完整接口字段、状态和错误见 [API.md](API.md) 与 [openapi.yaml](openapi.yaml)。

1. 签名上传地址 15 分钟有效，流式 PUT 校验字节数与 SHA-256，完成时用 ffprobe 核对实际格式、音频轨道和时长。支持 AAC M4A、MP3、常见 PCM WAV，默认最多 100 MB（MAX_FILE_BYTES 可调整，硬上限 500 MB）。
2. 报价保存 owner、完整输入、费用与策略版本，15 分钟有效。创建任务时一次事务锁钱包、预留积分、绑定报价与幂等记录；相同 key 不重复创建，同一报价不能换 key 重扣。
3. SQLite 队列由 worker 独占领取一个任务。60 秒租约持续续期，过期任务在 worker 恢复后标为失败并退款；不自动再次调用付费供应商。部署中请用进程管理器保证 worker 常驻。
4. worker 直接读取上传音频，生成 16 kHz 单声道识别副本（克隆模式为 24 kHz，同时用于参考评分）送 Google；每 120 秒识别时间戳和说话人；默认同次请求返回翻译，合成预设或已授权的克隆音色，FFmpeg 对齐每段并补静音。输出只含新配音的 **24 kHz 单声道 PCM WAV**，按视频起始偏移对齐并覆盖完整原视频 timeline。当前最多 8 个说话人、600 个语音片段；跨块说话人一致性依赖模型估计。
5. 成功/失败/取消的终态与钱包结算原子提交，迟到的 worker 不能覆盖已取消任务。Google 失败、超时或过长语音无法对齐时返回失败并退款。取消会中止正在进行的请求，已经发生的供应商调用可能仍产生服务器成本。
6. 私有结果支持 GET/HEAD/Range，每次读任务重新签 15 分钟下载链接。源音频从上传起保留 24 小时，结果从完成起保留 24 小时，worker 每分钟清理过期文件；活动任务的源音频保留至任务结束。账户、积分流水与审计不随媒体清理删除。

当前不提供人声/背景分离或原背景保留。测试和使用范围先限定为清晰人声；有音乐、环境声的输入也只返回新配音，原背景不会加回。Google key 缺失时创建任务在预留积分前返回 SERVICE_UNAVAILABLE。产品界面不展示工程处理步骤。

声音克隆默认使用 Fish Audio inline 模式：只上传原素材，每次从当前任务选取参考音，不创建保存音色。单席位持久复用仅供显式 `saved_test` 历史测试，见 [FISH_TESTING.md](archive/FISH_TESTING.md)。Google 克隆可显式配置启用，其额外录音规则见前期 [VOICE_CLONING.md](archive/VOICE_CLONING.md)。不做口型重建；多人交叠语音不支持独立重建，对齐有模型估计与语速调整误差。没有结果缓存，`cacheHit=false`。

价格与支付供应商尚未确定，Creator/Studio unavailable；创建 checkout 返回 503，不收款、不模拟到账。真实支付 webhook 后续接入。

## 部署与验证

当前部署目标是单台服务器上的 Next Node 进程 + worker + 本地持久 SQLite/音频目录。不要部署到无持久磁盘的函数环境，不要让多台主机共享 SQLite 网络文件系统。多机扩容需要后续换队列、数据库和对象存储。

生产设置外部 HTTPS origin、`BACKEND_LOCAL=false` 和共享签名密钥。两个进程使用同样环境与文件权限；反向代理上传限制与 MAX_FILE_BYTES 保持一致（默认 100 MB），限制入口来源与超时。定期备份 SQLite（使用 SQLite 在线备份或停进程后备份，不能只拷贝活跃数据库而忽略 WAL）。签名密钥轮换会使已有文件地址失效，可刷新任务获取新链接。

```bash
npm run typecheck
npm test
npm run build
npm start
# 第二个终端（生产环境变量由进程管理器配置）
NODE_ENV=production npm run worker
```

`GET /v1/health` 返回 API 存活状态及配置、worker、磁盘标志；`GET /v1/ready` 在生产 worker 不健康、磁盘不足或暂停新任务时返回 503。二者不验证外部供应商权限或余额。自动测试用真实 SQLite、JWT 签名和 FFmpeg，Google/UserInfo/Siteverify 使用替身；真实 Google API 需要用清晰人声短录音单独测试。接入 key 后用短录音验证端到端任务、积分、失败退款，再扩大媒体测试范围。

保持凭证留空、以前端同源真实模式启动 `npm start` 后，可运行 `npm run test:backend-live`：它直接访问 Next API 与 SQLite，并打开浏览器验证会话持久化、游客权限、真实模式、缺失配置提示和充值禁用，不拦截或模拟业务 HTTP 响应。该脚本专用于所有凭证留空的配置；填入真实 key 后不运行这个空配置测试。

当前首发限制、按任务音色隔离、日预算、任务历史、生产检查、监控、备份恢复及 systemd/nginx 模板的最新说明见 [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)。旧的单席位测试说明只适用于 saved_test 模式；生产音色不会采用全局测试 ID。
