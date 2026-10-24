# DubbingNow API v2 契约（路径仍为 /v1）

本仓库已实现网页、Auth0 客户端和服务端验证、Turnstile 服务端验证、SQLite 用户与积分、私有上传、持久任务队列和 Google 配音 worker。支付价格/供应商尚未确定，充值接口保留契约并明确返回不可用。部署与当前能力范围见 [BACKEND.md](./BACKEND.md)。`docs/openapi.yaml` 是结构化契约；`lib/api/types.ts` 是前端类型。未配置 API URL 时使用本地演示，明确标注身份模拟、固定配音样例和模拟验证；它没有真正鉴别人类，也不能作为正式积分服务。

## 登录：Auth0 Universal Login

使用官方 `@auth0/auth0-spa-js`，Authorization Code + PKCE。浏览器只保存公共配置，Auth0 管理凭证、密码找回及启用的 Google 等社交连接；本 API 不接收或存储密码。不实现自建 `/auth/login`、`/auth/register` 或密码重置接口。

配置 `.env.local` 的 `NEXT_PUBLIC_API_BASE_URL`、`NEXT_PUBLIC_AUTH0_DOMAIN`、`NEXT_PUBLIC_AUTH0_CLIENT_ID` 和 `NEXT_PUBLIC_AUTH0_AUDIENCE`。Domain 是域名，不带协议。Audience 必须是 Auth0 中创建的自定义 API Identifier。变量在 build 时注入，修改后重新构建。

在 Auth0 创建 **Single Page Application**，并创建自定义 API（RS256）：

- Allowed Callback URLs：`http://127.0.0.1:3000/auth/callback`，正式域名的 `/auth/callback`；使用 localhost 时也单独添加。
- Allowed Logout URLs / Allowed Web Origins：对应完整网站 origin，不带路径；正式环境使用 HTTPS。
- 启用 Refresh Token Rotation、对应应用 Refresh Token grant，以及 API 的 Allow Offline Access。SDK 请求 `openid profile email offline_access`，凭据通过 SDK 自定义 cache 保存在当前标签页的 sessionStorage，刷新后保留，退出由 SDK 清除；不把凭据写入 localStorage。SDK 继续管理过期与刷新令牌轮换。关闭标签页后仅保留非凭据的登录提示，再通过 Auth0 顶层页面验证已有会话；恢复失败不自动循环跳转。
- 本地回调可能被 Auth0 强制要求重新确认授权，因此本地的跨标签页/关页恢复不等于正式 HTTPS 域名验收。sessionStorage 可被同源脚本读取，本站应避免不可信脚本并按正式部署要求管理脚本来源。
- 配置 Universal Login 品牌、邮件/密码或社交 connections、邮件发送。本站 `/register` 只是 `screen_hint=signup` 的入口。
- 不向前端放 Client Secret、Auth0 Management API token、Turnstile secret 或支付密钥。返回路径只允许本站相对路径。

每个受保护请求：`Authorization: Bearer <API access token>`。后台根据 Auth0 JWKS 验证签名、固定允许的算法、issuer、audience、exp/nbf，拒绝 ID token；不能信任前端 SDK user、email、role 或请求体指定的用户 ID。用 `(issuer, sub)` 唯一关联应用用户，email 只是联系资料。Auth0 自定义 claim 或后台授权表决定 admin，普通用户无权选择角色。所有账户请求重新检查数据库 `status`；暂停账户返回 403 `ACCOUNT_SUSPENDED`，读任务、签上传地址、扣费及管理接口也必须执行。

`GET /v1/users/me`：只接受 Auth0 access token。返回 User `{id,email,displayName,role,status,createdAt}`。首次已验证身份访问时在一个数据库事务中创建应用用户、钱包和一次注册赠送记录；真实后端默认上限 **50 积分**（演示默认 500），唯一约束防止并发请求、刷新、重复登录和退出再登录重复领积分。是否改邮件不产生新账户。`PATCH /users/me` 只接收 `{displayName}`，不能写 role/status/balance。Auth0 凭证管理留在托管登录服务。

参考：[Auth0 SPA SDK](https://auth0.com/docs/libraries/auth0-single-page-app-sdk)、[Access token 验证](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens)、[Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)。

## 游客：不用登录的 30 秒试用

默认 **一次试用、单个完整文件最多 30 秒**。不自动截掉长视频；超过限额提示缩短录音或注册。试用次数和秒数均可配置。游客不领取注册积分。

1. `POST /sessions {}`：创建随机 guest ID 和 30 天 opaque token，返回 Session `{id,token,expiresAt,user:null}`。限流并保留服务端持久试用账本；浏览器保存 guest token 不代表授权。不能只靠 localStorage 判断是否用过，重新创建匿名会话、清浏览器或不同 IP 不应无限领取；结合 IP/设备风控、频率和成本上限。正常过期不自动再发免费额度。
2. 前端 Turnstile widget `action=guest_trial` 生成 token；`NEXT_PUBLIC_TURNSTILE_SITE_KEY` 缺失或组件失败则不可开启试用。
3. `POST /guest/verify {token}`：必须持有效 guest bearer。服务器用私密 `TURNSTILE_SECRET_KEY` 调 Siteverify，核验 success、hostname、action、会话风控及剩余次数。Turnstile token 最多 5 分钟有效且只能使用一次；无 token、过期、重放或错误 action 都拒绝。验证成功发 **10 分钟有效、绑定 guest ID** 的试用授权并返回 Quota；`verifiedUntil` 是显示信息，客户端不能提交此字段授权。
4. 签上传票据、报价和实际创建任务时都再次验证授权与剩余试用。必须服务端探测音频时长并约束 timeline，不能信任浏览器时长、文件头、SHA 或 quota。一次授权允许完成一个任务流程；在最终事务中消耗次数，避免多标签并发超用。失败/确认取消退回次数一次，但需重新做人验证。

真人验证并不能证明同一人只来一次；正式后台必须一起实现持久额度、限流和防滥用。演示中的 checkbox 仅测试界面，不调用 Siteverify。

参考：[Turnstile 客户端](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)、[服务端验证](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)。

## 可配置积分规则

`GET /billing/policy` 是公开的当前版本配置：

```json
{
  "version": "policy-version",
  "signupCredits": 500,
  "guestTrialSeconds": 30,
  "guestTrialUses": 1,
  "creditsPerMinute": { "standard": 10, "high_fidelity": 20 },
  "rounding": "per_second",
  "minimumCredits": 1,
  "maxDurationSeconds": 7200
}
```

**10 / 20 是可配置的初始费率，正式数值等待供应商成本确认**，不表示承诺的售价。每分钟费率、注册积分、试用限制、最小扣费和计费粒度由后台维护。所有积分类数值必须是安全整数；费率、最小扣费、试用次数与时长大于 0，注册赠送可为 0。时长最大 7200 秒，guestTrialSeconds ≤ maxDurationSeconds。服务器内部用整数/定点数计算，禁止浮点误差或溢出产生额外扣费。

令 `D = ceil(max(服务端音频时长 + audioOffsetSeconds, timeline.durationSeconds))`；无 timeline 时用音频时长。按秒计费 `max(minimumCredits, ceil(D × rate / 60))`；按分钟计费 `max(minimumCredits, ceil(D / 60) × rate)`。例：标准费率 10，61 秒按秒 11 积分，按开始的分钟 20 积分。每个目标语言都是独立任务；重复下载、刷新结果链接或恢复原视频不扣费。

`GET /quota` 返回 guest/user、availableCredits、reservedCredits、trial|null、maxDurationSeconds、maxFileBytes、voiceTier。游客两个积分余额为 0；登录用户 trial=null，不使用游客次数。积分为一次性赠送/充值余额，没有旧版的每天 15 分钟、每日 3 个任务或 free/paid 分钟额度。

## 上传、报价、任务与原子结算

1. `GET /capabilities` 返回实际支持的语言、音频类型、说话人数与最大文件大小；不得宣称后台不存在的能力。前端接收 MP4/MOV/MP3/WAV，视频在浏览器 worker 中优先无损提取 AAC M4A；备用 PCM WAV 保留源采样率（最高 48 kHz）与声道（最多双声道）。**原视频保留本地，只上传音频**。接口接受 audio/mp4、audio/mpeg、audio/wav，默认 100 MB，可配置至 500 MB 硬上限；原片与提取后的音频均须符合当前上限。
2. `POST /uploads`：`{filename,contentType,sizeBytes,sha256}`，返回 `{id,url,method:"PUT",headers,expiresAt}`。私有存储直传票据 15 分钟，大小、hash、owner、允许的 MIME 服务端绑定；签名 URL 只允许写该对象。PUT 存储请求不带 API bearer，CORS 允许网站 origin 和票据所需 headers。
3. `POST /uploads/{id}/complete {}`：幂等验证文件存在、实际大小/hash、可解码性、合法 MIME、音频轨道和真实时长，返回 `{id,mediaType:"audio",durationSeconds}`。音频时长向上取整；上传尚未完整或过期返回相应错误。
4. `POST /jobs/quote`：`{uploadId,sourceLanguage,targetLanguage,voiceTier,timeline?}`；返回 `{id,kind:"trial"|"credits",durationSeconds,credits,policyVersion,expiresAt}`。报价保存 owner、规范化完整输入、实际计费时长和费率/规则快照，15 分钟有效；不扣钱、不预留积分。游客验证/时长超限或用户余额不足立即拒绝。source 可为 auto，但显式 source 不能等于 target；语言/voiceTier 必须实际支持。
5. `POST /jobs`：同样输入加 `quoteId`，必须带 `Idempotency-Key` UUID。先按 owner+operation+key 查历史，命中相同规范化输入返回同一个任务（即使报价已过期）；不同输入返回 409 `IDEMPOTENCY_CONFLICT`。然后验证报价未过期、未被其他逻辑任务消费、owner 和全部输入匹配，再在一个事务内锁钱包/试用账本、检查未预留余额、创建任务、写 reserve 流水、扣 available / 增 reserved 或消耗游客次数。不能信任请求中的价格；该请求不存在客户端 credits/role 参数。同一个 quote 只能绑定一个任务，避免换 key 重复消费。
6. `GET /jobs/{id}` 轮询，`POST /jobs/{id}/cancel {}` 确认取消。所有读写/下载签名只允许资源 owner。任务状态包括 queued/transcribing/translating/synthesizing/aligning/rendering/completed/failed/cancelled；无结果时 result=null。`pollAfterMs` 建议 500–10000 ms；429 返回 Retry-After。后台收到取消后原子争抢终态，不能先退款再继续成功；完成先到则取消返回 409 JOB_NOT_CANCELLABLE。
7. 成功时 reserved 减少，available 保持已扣状态，写 consume；失败/已确认取消时 reserved 减少、available 加回，写 release。终态、钱包和流水同一事务；用 jobId+settlement 唯一约束确保重复 worker/webhook/取消请求只结算一次。reserve delta 为负，consume delta=0，release 为正；`balanceAfter` 是当次 available 的快照。游客成功消耗一次、失败/取消恢复一次。

请求幂等记录至少保留 7 天。并发重试只创建一个资源；响应丢失不能引导用户生成新 key 重扣。前端把待确认请求、任务 ID 和视频 SHA/timeline 存到按 owner ID 分隔的 sessionStorage；API token 不存进这些记录。恢复后用相同 key 查询状态，再次下载不计费。

修改配置只影响**新的注册赠送、新建游客和新的报价**。已有余额不变，已有报价按保存的 policyVersion/费率执行；如果新的时长风控禁止运行，应明确拒绝并要求新报价，不能悄悄用新价格扣费。游客当前最大时长以服务端 quota 为准。后台不允许重新使用同一 quote 创建多个任务。当前不启用结果缓存，`cacheHit=false`。如果后续加入缓存，仍需按正常规则计费且不能跨 owner 泄露私有结果地址。

## 音频返回与视频合并

Job.result 固定 mediaType=audio，包含 preview/download（HTTPS签名URL、filename、contentType、expiresAt）、durationSeconds、sourceLanguage、targetLanguage、speakerCount、isDemo=false。前端本地合并原视频和新音频，视频编码包直接复制且保留旋转信息；必要时音频转 AAC，不重编码画面。

传 timeline 时 backend 必须返回从视频 t=0 开始且长度与 durationSeconds 差≤0.25秒的音频，audioOffsetSeconds 前填静音，多语言 TTS 过长时做分段时间对齐。超差时前端不强行掩盖；刷新链接/重新合并不新建任务、不扣积分。浏览器刷新后原 File 丢失，提示重选原视频，以 SHA、大小、名称确认匹配再合并。签名链接默认 15 分钟，可 GET job 重新签名；当前结果保留 24 小时，最终保留时长需正式发布前与隐私政策一致。已删对象返回 RESULT_EXPIRED，不伪装成功。

## 用户、积分与管理接口

| 接口                               | 权限       | 内容                                                                                             |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| GET /users/me                      | Auth0 用户 | 创建/读取应用账户，赠送一次积分                                                                  |
| PATCH /users/me                    | Auth0 用户 | 仅改 displayName                                                                                 |
| GET /credits/transactions?cursor=… | Auth0 用户 | 自己的流水，items + nextCursor；按服务端流水序号倒序，20 条/页                                   |
| GET /admin/users?query=…&cursor=…  | admin      | 邮箱/名字搜索，items + nextCursor，余额和账户状态                                                |
| PATCH /admin/users/{id}            | admin      | `{status:"active"或"suspended"}`；禁止暂停自己，不更改 Auth0 凭证                                |
| POST /admin/users/{id}/credits     | admin      | `{deltaCredits,reason}`，必须 Idempotency-Key，整数非零、不低于零余额，记录操作者/理由/前后余额  |
| PUT /admin/billing/policy          | admin      | 提交完整 BillingPolicy，包括读取时 version；CAS 成功返回新 version，过时返回 409 POLICY_CONFLICT |

管理权限必须后台检查；隐藏按钮不是授权。管理员不能通过普通 profile API 修改 role，积分不能 PATCH 任意余额。流水不可覆盖、删除或由用户直接写入。当前 SQLite 表结构见 `server/store.ts`：accounts(issuer,subject唯一)、wallets、credits、settings、guests、trial_budgets、limits、human_tokens、uploads、quotes、jobs、idempotency、audit。checkouts/webhook_events 留给后续支付实现。User status 改动和 policy 改动也写审计，管理调整同一事务写钱包与流水。

## 充值契约（尚未启用）

当前服务返回未定价套餐（available=false），创建 checkout 返回 503 SERVICE_UNAVAILABLE，读取未知 checkout 返回 410 CHECKOUT_EXPIRED。下面是后续支付接入的目标契约，不表示已经实现收款。

`GET /billing/plans` 返回 `{id,name,amountMinor,currency,includedCredits,available}[]`。free 是一次注册赠送；amountMinor=null 且 available=false 表示价格未确定，按钮禁用。当前 Creator1000/Studio5000 是示意包，不能作为正式销售参数。

`POST /billing/checkout {planId}` 只允许登录用户，必须幂等 key。服务端从计划目录读取金额/积分，不能接受浏览器金额、credits或任意 return URL；返回 `{id,url,expiresAt}`，url 是可信 HTTPS 托管支付。返回页面固定配置 `/billing/return?checkout_id=<id>`。`GET /billing/checkouts/{id}` 只许 owner，返回 `{id,status,creditsGranted}`。返回 URL /前端 success 参数不能确认收款；必须验证支付 webhook 签名、金额、币种、plan和owner并原子写 purchase/余额，以支付事件唯一 ID 防重。paid 只表示积分已经成功入账，pending 不能显示已到账。过期支付票据返回 CHECKOUT_EXPIRED。

## 错误与跨域

JSON 格式：`{error:{code,message,retryable,requestId?,details?}}`。400 INVALID_REQUEST；401 UNAUTHORIZED；403 HUMAN_VERIFICATION_REQUIRED / HUMAN_VERIFICATION_FAILED / TRIAL_LIMIT_EXCEEDED / FORBIDDEN / ACCOUNT_SUSPENDED；402 INSUFFICIENT_CREDITS 或 QUOTA_EXCEEDED；409 IDEMPOTENCY_CONFLICT / JOB_NOT_CANCELLABLE / POLICY_CONFLICT；410 UPLOAD_EXPIRED / RESULT_EXPIRED / QUOTE_EXPIRED / CHECKOUT_EXPIRED；413 FILE_TOO_LARGE；415 UNSUPPORTED_MEDIA；429 RATE_LIMITED；5xx PROCESSING_FAILED / SERVICE_UNAVAILABLE。NETWORK_ERROR 是客户端本地错误，不是服务器错误代码。

API全部 no-store，TLS，CORS 仅允许本站 origins、Authorization/Content-Type/Idempotency-Key；浏览器 API请求 credentials=omit。Auth0 SDK管理其会话，业务 API 不用第三方 cookie登录；guest opaque token和Auth0 JWT采用不同验证器，不能只decodeJWT。错误返回不泄露别人的用户/任务存在性。

## 验证状态与后端验收

`npm test` 已覆盖真实 SQLite 结算、真实 RS256 签名验证和 FFmpeg 音频对齐；身份资料、Siteverify 和 Google HTTP 响应由测试替身提供。真实 Auth0 租户、Turnstile 与 Google key 尚未配置，以下外部服务验收需配置后完成，支付验收待后续实现。

- 真实 Auth0 tenant 完成 signup/login/logout、社交连接、callback state/PKCE和刷新；无效签名/issuer/audience、过期token、IDtoken和浏览器伪造role全部拒绝。
- 并发首次 /users/me只赠送一次500；退出再登录/更换邮箱不重复；暂停账号即时禁止所有敏感操作。
- Siteverify 成功才发绑定授权；错误action/hostname、超时、重复token都失败；清浏览器/多标签不能无限试用。
- 超过30秒的游客音频、原视频timeline或伪造probe时长不能创建；授权过期后重验；失败/取消只恢复一次。
- 同一个幂等key并发返回同job；同quote换key不建第二个job；输入不同key冲突；响应丢失后的重试只扣一次。
- 500余额预留/成功结算/失败退款、余额不足、并发竞争、重复取消及worker终态竞争满足原子不负数；流水完整。
- 按秒与按分钟边界、档位和最小扣费正确；修改费率不改变旧quote或现有余额；CAS拒绝旧version。
- 管理员可搜索/暂停/恢复/调整，普通用户及guest拒绝管理访问；每次调整、状态和配置变化都有审计。
- 跨owner查询quote、upload、job、下载、流水和checkout均拒绝；上传hash/字节、真实duration、格式和私有地址校验完整。
- 配音实际返回对齐音频，前端本地输出保留视频包/旋转；refresh重选原文件不创建新job；结果过期真实报错。
- 支付只能由真实签名webhook入账，重复webhook无重复积分，pending返回页不假报到账。

## 声音克隆 preview

`QuoteRequest` / `CreateJobRequest` 新增可选 `voiceMode: "preset" | "clone"` 和 `consentUploads: [{speaker, uploadId}]`。省略 mode 的旧请求使用 preset。clone 模式须先走普通私有上传流程上传每位说话人的真实授权录音，speaker 为首次发声顺序的零起始编号（0–7），上传须属于当前 actor，完成且不超过 30 秒 / 2 MB。speaker 和上传 ID 不能重复，不能复用原素材上传。preset 模式不得附带授权上传。报价与创建均验证所有权和上传状态，worker 按识别结果检查每位说话人的参考与授权是否齐全；Google 验证授权声明及说话人一致性。克隆失败不切换预设声音，按已有失败流程退款。JobResult 新增可选 `voiceMode`。演示实现拒绝克隆请求。

授权上传和源上传一样，在未结算任务运行期间保留；随后按同一保留期清理。克隆 key 仅在任务内存中，不写入公开 API、数据库结果或计时文件。详细参考句筛选和耗时报告见 [VOICE_CLONING.md](./VOICE_CLONING.md)。

## Fish 单席位模式（2026-10-18）

2026-10-24 起默认 `CLONE_PROVIDER=fish`、`FISH_VOICE_MODE=inline`，`GET /capabilities` 返回 `voiceCloning: {provider: "fish", requiresConsentRecording: false, singleVoiceTest: false}`。clone 请求只需源音频与 `voiceMode: "clone"`；每次从该源音频选取参考人声，随 Fish 合成请求传入，忽略全局测试模型 ID，不注册新模型。任务内参考标识不能用于其他任务，不对客户端公开。省略 `consentUploads`，不能附带 Google 授权上传；用户仍须具备原音频使用授权。Google 的额外录音规则仅在 `CLONE_PROVIDER=google` 时生效。

以下固定声音行为仅适用于显式 `FISH_VOICE_MODE=saved_test`，其 capabilities 的 `singleVoiceTest` 为 `true`：

首个单人素材选取参考并注册唯一 Fish 音色，后续 clone 任务固定复用保存的 ID，包括换素材、刷新、取消及失败重试。已有保存音色时无需新素材具备 10 秒参考；多说话人任务在测试模式下明确失败退款。所有 Fish 克隆创建只能经过 `.data/fish-test-voice.json` 的持久创建记录和文件锁，不提供自动删除、换音色或重复创建路径。创建请求响应丢失时以唯一标题核对远端，不盲目重试。详见 [FISH_TESTING.md](./FISH_TESTING.md)。

## Cloudflare 传输

Cloudflare 模式下上传票据的 URL 指向私有 R2，必须原样发送所有 `headers`，包含 `If-None-Match: *`。签名绑定内容类型和长度，已上传对象不能覆盖。完成接口仍负责 SHA-256、格式与时长校验。结果文件接口可能返回 307 至短时 R2 签名地址；客户端应正常跟随跳转。业务 API 路径和 JSON 契约保持兼容。
