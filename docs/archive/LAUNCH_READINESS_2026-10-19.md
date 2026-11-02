# 上线准备审查：Google + Fish 方案

> 历史记录：配置、价格与能力以当时日期为准。当前生产行为及待办见 [项目现状](../CURRENT_STATUS.md)。

最新修复与重新验证见 [2026-10-24 发布状态](LAUNCH_STATUS_2026-10-24.md)；本文保留 10 月 19 日的审查与当时实施记录。

审查日期：2026-10-19。保持现有供应商与模型方案。本次审查代码、当前本地配置、自动测试、生产构建及两个定向复现；没有部署、购买席位、创建声音或修改应用逻辑。

## 后续实施状态（同日更新）

以下原始审查保留问题发生时的证据。用户授权后，已完成可独立推进的代码与部署准备：

| 原问题 | 当前状态 |
| --- | --- |
| 测试音色与用户声音共用 | 已增加 per_job 正式路径，按用户/任务/说话人隔离，不采用全局测试声音；创建默认禁用，隔离/恢复用供应商替身验证。现有 saved_test 与唯一音色保留。正式容量与真实双用户验收待完成。 |
| 登录及赠额 | 已强制邮箱验证，同邮箱不重复赠送，服务端默认赠额上限 50。真实 Auth0 audience 与公网租户验收待提供。 |
| 防刷与费用控制 | 已增加原子日处理量/上传量预算、活动队列上限与暂停开关；失败/取消不返还尝试预算，但正常退积分。预算是用量限制，不是精确美元账单。 |
| 音频结果刷新丢失 | 已修复，新增本人任务历史、过期状态与结果重开。生产 UI + HTTP 替身回归确认刷新后查询同一任务，不重复创建；Chromium 演示用例覆盖任务历史重开。 |
| 运行保障 | 已有 worker 心跳、ready 接口、队列/运行超时、磁盘检查、监控脚本、在线备份/校验恢复、systemd/nginx 与 CI 模板。模板尚未部署，外部告警接收和异机备份待配置。 |
| 首发范围 | 默认 5 分钟、100 MB、单人，均可配置；主要公开文案同步收紧。长素材、真实移动设备与各目标语种质量仍需验收。 |
| 页面信息 | 隐私/条款已按实际处理、保留规则及积分行为更新，支持邮箱与主体从环境读取；具体运营资料待提供，preflight 缺失时拒绝生产启动。 |
| 收费 | 继续禁用，不创建支付或虚假到账；收费发布前仍需支付供应商与验收。 |

验证：50 个后端/单元测试通过、14 个 Chromium 浏览器用例通过、类型检查与生产构建通过；另完成音频刷新 HTTP 客户端回归和备份恢复演练。新增过期结果断言及恢复历史时间修正后，9 个定向上线测试再次通过。真实 Google + Fish 单席位回归成功：17.2 秒输入，点击到可下载 18.764 秒，刷新恢复 0.275 秒，音色数量前后均为 1。真实登录/Turnstile 未包含在该回归中。

部署步骤、默认限制、配置与待外部验收清单见 [PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)。本地 preflight 按预期拒绝当前测试环境，指出缺少正式 audience、签名密钥、正式 HTTPS origin、支持邮箱/主体及生产音色容量开关。

## 结论

短素材的识别、翻译、克隆合成、对齐和下载链路已经跑通。当前仍是单席位测试产品，不能直接按“每位用户克隆自己的声音”对公众开放。上线工作应集中在音色隔离、真实身份联调、防刷、结果恢复、部署运维与交付范围；无需为了上线更换 Google + Fish。

以下区分已经确认的缺口与尚未验收的项目；通过测试不等于真实 Auth0 / Turnstile / 付费套餐或生产环境已验收。

## 本轮验证结果

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 静态类型检查 |
| `npm test` | 41/41 通过 | SQLite、扣额/退款、供应商适配器、并发、对齐等；供应商响应含替身 |
| `npm run build` | 通过，38 个页面生成 | 当前本地配置；不是生产配置验收 |
| `NEXT_PUBLIC_API_BASE_URL= npm run test:e2e` | Chromium 14/14 通过 | 演示模式，含实际媒体处理；不是供应商/真实登录联调 |
| `npm audit --omit=dev --registry=https://registry.npmjs.org` | 生产依赖已知漏洞 0 | 默认 npm 镜像不支持审计，改用官方 registry；不代表不存在业务逻辑问题 |
| 未验证邮箱领取赠送积分 | 确认可领取 500 积分 | 有效 RS256 JWT + 模拟 UserInfo `email_verified=false`，真实运行身份适配器和隔离 SQLite；无真实租户注册 |
| 已完成音频刷新恢复 | 确认丢失结果入口 | 生产构建 UI + 模拟业务 HTTP；刷新后不查询原任务，无音频预览 |

已有真实 Google + Fish 网页测试只证明单一约 17 秒素材可以跑通；之前四轮同素材全链路约 17.7–23.9 秒，不能推断长音频、并发或不同语种的成功率与速度。本轮没有重复消耗供应商 API 做质量测试。

本轮日志和复现代码在 `.runtime/launch-*`、`.runtime/launch-review/`，均为本地忽略文件，无 API 密钥输出。

## 公开上线前必须处理

### 1. P0：把单测试音色与正式用户声音隔离

证据：

- [server/providers/fish.ts:31](/Users/h0270/Documents/ChatGPT/web-vc/server/providers/fish.ts:31)：每个 workspace 只保存一个 `fish-test-voice.json`，没有用户/任务归属。
- [server/providers/fish.ts:195](/Users/h0270/Documents/ChatGPT/web-vc/server/providers/fish.ts:195)：发现既有音色即复用。
- [server/dubbing-pipeline.ts:355](/Users/h0270/Documents/ChatGPT/web-vc/server/dubbing-pipeline.ts:355)：已有声音直接绑定任务中的说话人；不为新素材克隆声音。
- [server/providers/fish.ts:363](/Users/h0270/Documents/ChatGPT/web-vc/server/providers/fish.ts:363)：`singleVoiceTest=true`；多人 clone 会被拒绝。

后果：用户 B 上传自己的录音，也会用之前保存的测试音色输出。这符合此前“只有一个席位，创建一次一直用”的测试要求，属于尚未完成产品化，不应当作供应商故障。

待做：保留独立测试模式；正式路径按用户/任务保存和校验音色归属，做好创建幂等、复用边界、席位不足提示及声音生命周期。至少用两个不同账号、两段不同人声确认不串音色。当前测试音色继续保留，不在本次审查中创建、删除或替换。席位与正式使用权限在需要时另行落实。

### 2. P0：真实登录配置与公网真人验证验收

当前 `.env.local` 中 Auth0 domain/client ID 已填，但公共及服务端 audience 均未填；[lib/auth0.ts:33](/Users/h0270/Documents/ChatGPT/web-vc/lib/auth0.ts:33) 因而判定登录未配置，[server/auth.ts:13](/Users/h0270/Documents/ChatGPT/web-vc/server/auth.ts:13) 也会拒绝身份验证。已填写 Turnstile key/secret 只代表有配置值，不代表正式域名与验证链路已通过。

待做：配置 Auth0 自定义 API audience、正式回调/退出地址和 origin；重新构建；真实完成注册、登录、刷新续期、退出、再次登录、管理员权限及账号暂停测试。正式域名上完成 Turnstile 验证、过期 token 与复用拒绝测试。现有 `tests/live-auth.mjs` 明确使用模拟租户，完整供应商测试则预置 verified guest，不能替代这一步。

### 3. P1：注册赠额、防刷与费用上限

确认的风险：

- [server/auth.ts:73](/Users/h0270/Documents/ChatGPT/web-vc/server/auth.ts:73) 只检查 email 字段存在，没有检查 `email_verified`。本轮复现：未验证邮箱仍通过身份检查。
- [server/store.ts:200](/Users/h0270/Documents/ChatGPT/web-vc/server/store.ts:200) 首次 subject 建账即发赠额；[lib/billing/policy.ts:5](/Users/h0270/Documents/ChatGPT/web-vc/lib/billing/policy.ts:5) 默认 500 积分、标准 10 积分/分钟，即每个新身份约 50 分钟。
- 游客有人机验证、网络日限额，账号路径不沿用游客网络预算；尚无全站供应商消费上限。取消/失败可退积分，但已经发出的供应商请求仍可能产生费用。

待做：发赠额前要求可信的已验证身份；内测可用邀请准入配合小额度。加入用户日用量/上传字节限制、全站日预算、异常注册/调用告警，以及暂停新任务的开关。欢迎赠额与正式价格分开配置。邮件验证本身不能杜绝多账号滥用。

### 4. P1：修复完成音频的结果恢复

证据：[components/dubbing-tool.tsx:239](/Users/h0270/Documents/ChatGPT/web-vc/components/dubbing-tool.tsx:239) 在任务进入终态后移除 active job ID；[components/dubbing-tool.tsx:299](/Users/h0270/Documents/ChatGPT/web-vc/components/dubbing-tool.tsx:299) 只从 active/pending/video context 恢复。视频另存 `jobId`，纯音频没有对应记录。[server/backend.ts:374](/Users/h0270/Documents/ChatGPT/web-vc/server/backend.ts:374) 只有按 ID 读取任务，当前没有任务列表接口，账户页也只有积分流水。

复现：完成一次音频任务，预览可见；刷新后 sessionStorage 只剩计时，原任务查询次数为 0，音频预览消失。不是服务端文件立即删除，也不是扣费重复。

待做：保存可恢复的完成任务 ID；提供本人任务历史和重新签发下载链接的入口；明确结果 24 小时保留与过期状态。验收完成后刷新、离开工具页再返回、登录恢复、签名链接过期刷新及结果已删除场景。视频刷新后重选原片的既有行为要保留。

### 5. P1：生产部署、worker 健康及备份恢复

代码已有单机 SQLite WAL、签名私有上传、owner 校验、租约、取消与失败退款、媒体定期清理。这些基础无需推翻。

仍缺：

- 仓库没有可复用的部署/反向代理/进程守护/CI 配置。当前为 `BACKEND_LOCAL=true`、本地 origin、无显式 `STORAGE_SIGNING_SECRET`、`TRUST_PROXY=false`，不能原样当公网配置。
- [server/worker.ts:30](/Users/h0270/Documents/ChatGPT/web-vc/server/worker.ts:30) 每个 worker 进程一次处理一个 job；三路合成并发只是单个任务内部并发。没有全站排队上限或队列等待超时。
- [server/backend.ts:213](/Users/h0270/Documents/ChatGPT/web-vc/server/backend.ts:213) health 只表示 API 可响应及部分配置存在，不查 worker、Fish、磁盘容量或外部账户余额。worker 停止后网站仍返回 ok，queued 任务可一直等待；过期运行任务只有 worker 再次 claim 时才失败退款。
- [server/backend.ts:58](/Users/h0270/Documents/ChatGPT/web-vc/server/backend.ts:58) 未启用可信代理时所有请求使用同一个网络标识；公网若沿用会让不同用户共享限流/游客预算。启用前必须确保代理覆盖转发头且阻止绕过代理直连。

待做：先部署一台有持久磁盘的 Node 服务器，API 与 worker 共享持久数据目录；HTTPS、上传限制与超时、两个进程守护与发布重启、正式环境变量检查。加入 worker 独立心跳、队列超时/总量限制、磁盘/失败率/耗时/供应商费用告警。自动备份 SQLite 与必要配置，并实际恢复一次。暂不需要为了小流量上线引入多机或更换数据库。

不建议直接搬到没有共享持久磁盘的函数部署；当前 worker 和 SQLite/媒体目录的使用方式要求常驻进程与持久存储。

### 6. P1：收紧首发能力并验收真实素材

当前默认账户上限 2 小时、文件上限 500 MB，但真实端到端样测主要是 17 秒合成旁白。浏览器媒体提取与合并使用内存 buffer，Playwright 只覆盖 Chromium，不能据此承诺大文件、Safari 或真实手机兼容。

当前不保留音乐/环境声，输出新的人声替换原音轨；重叠人声不支持独立重建；Fish clone 暂限单人。跨 120 秒块的说话人一致性、600 段上限、较大变速对音质的影响都需真实素材验证。

待做：第一版明确“清晰、单人、短音频/视频”的范围，先限制到经过验收的时长/大小；用自然人声跑短素材和 1–5 分钟样本，覆盖首发目标语言，记录成功率、声音相似度、自然度、漏译、时长偏差、耗时与成本。补 5–10 个任务的排队/并发与取消/重启恢复测试；测试真实 iPhone/Safari、安卓/Chrome 和桌面，尤其选择文件到可播放/可下载的完整路径。

如首发承诺保留背景，需新增分离和混音能力；如首发明确为干净旁白配音，可后置。口型不是当前上线条件。

### 7. P1：对齐页面说明与实际服务

[app/privacy/page.tsx](/Users/h0270/Documents/ChatGPT/web-vc/app/privacy/page.tsx)、[app/terms/page.tsx](/Users/h0270/Documents/ChatGPT/web-vc/app/terms/page.tsx) 仍写 frontend preview、政策待上线完善；[app/contact/page.tsx:16](/Users/h0270/Documents/ChatGPT/web-vc/app/contact/page.tsx:16) 明确没有支持渠道。首页等页面仍有多人能力描述，需要区分 preset 与 clone 的真实范围。

待做：使用最终服务名称、联系渠道、实际发送给 Google/Fish 的数据、媒体/音色保留规则和删除流程、赠额/失败退款/结果有效期等信息替换占位。公开页面、定价、capabilities 与后台限制一致。只有发布者才能确定的运营信息需发布者提供，不能虚构邮箱或主体。

## 收费上线另需完成

[server/backend.ts:430](/Users/h0270/Documents/ChatGPT/web-vc/server/backend.ts:430) 创建 checkout 目前固定返回 503，Creator/Studio unavailable。这是明确禁用，未做真实收款。

免费受控内测可暂缓支付；收费发布前还需确定美元价格与积分兑换，接入支付订单、验签 webhook、重复/乱序通知、到账幂等、支付取消和退款/争议处理，并完成支付测试环境与小额正式验收。支付回跳页面不能直接授予积分。

克隆合成的 `high_fidelity` 与 `standard` 当前都调用同一 Fish 模型与参数（[server/providers/fish.ts:384](/Users/h0270/Documents/ChatGPT/web-vc/server/providers/fish.ts:384)），而积分规则允许两档价格。正式定价时要明确实际差异或合并该档，不能让两倍积分暗示未实现的音质提升。当前网页 quota 固定 standard，因此不是已确认的网页重复收费问题。

## 建议实施顺序

1. 完成音色归属与正式 clone 路径，继续保留单席位测试模式；修音频结果恢复及已验证身份赠额。
2. 完成 Auth0 / Turnstile 真联调，部署单机常驻 API + worker，配置预算、队列与健康告警、备份及支持渠道。
3. 按首发范围做自然人声、长短素材、手机及排队故障验收，通过后开放受控内测。
4. 需要收费时再完成支付闭环；多语言 UI、口型、多机扩容等不属于当前必须工作。

当前最需要补的是产品化与运行保障，不是更换供应商或重写前端。实现工期依赖音色使用方式、真实 Auth0 租户及部署/支付账号，不把小样本测试通过当成已准备好公开上线。
