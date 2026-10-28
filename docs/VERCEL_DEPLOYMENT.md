# dubbingnow.com 与 Vercel 部署

域名 `dubbingnow.com`，源码仓库 `aipjn/dubbingnow`。网页、API、后台队列消费者部署在同一个 Vercel 项目；用户、积分、任务仍保存到 Cloudflare D1，音频仍在私有 R2。

## 执行方式

- 生产设置 `JOB_EXECUTION=vercel-queue`、`PERSISTENCE_DRIVER=cloudflare`、`BACKEND_LOCAL=false`。Vercel 环境缺少队列配置时拒绝初始化，避免只上线页面却没有处理程序。
- API 在 D1 建任务和预扣积分后，发布仅包含任务 ID 的队列消息；成功发布后才返回 202。发布失败且任务尚未被消费者领取时取消任务并退款。请求重复发布使用任务 ID 去重，D1 也保留任务/扣款幂等性。
- Vercel Queues 私有消费者按指定任务 ID 领取 D1 租约，运行原 Google + Fish inline 管线。重复消息不会重新领取已处理任务；租约和结算继续由 D1 保证。
- 浏览器不参与后台执行。关闭页面后，消费者继续生成结果，用户重新登录后可由账户记录访问结果。
- 函数上限设置 300 秒，处理管线在 240 秒内主动中断并结算失败退款，预留退出和数据库结算时间。进程崩溃后，过期租约仍通过现有 D1 恢复逻辑退款；不声称进程中断后能从半句合成处恢复。
- 完成或失败后，队列另发延迟清理消息，按现有 24 小时保留策略删除音频。每日一次受 `CRON_SECRET` 保护的清理用于孤立上传、过期记录和异常回收；独立上传后弃用的音频可能保留至下一次每日清理。下载访问仍按原 24 小时失效。

本地开发和原独立服务器继续使用默认 `JOB_EXECUTION=worker` 与 `npm run worker`。两种模式都保留相同的持久存储和积分结算逻辑。生产队列模式不依赖常驻 worker 心跳。

## FFmpeg 与临时文件

`npm run build` 在 Vercel 构建机上从 FFmpeg 官方固定 8.0.3 源码、校验固定 SHA256 后构建。仅启用本项目需要的音频解码、编码、重采样、变速与对齐，关闭网络协议。构建缓存位于 `.next/cache`，发布文件位于生成的 `vendor/media/bin`，通过 Next 输出追踪打包到 API 和消费者函数。

可执行文件不进入 Git，也不上传本机生成的 macOS 二进制；远程部署重新构建匹配 Linux 平台的版本。构建阶段验证实际解码和对齐。函数仅将可丢弃音频工作文件放在 `/tmp`，D1/R2 不依赖本机磁盘。

浏览器直传 R2，下载由 API 验权后跳转至短期 R2 签名地址，避免将大音频穿过普通函数请求/响应体。

## 配置与发布

- 公开配置在构建前填写：网站 origin、同源 API `/`、Auth0 domain/client/audience、Turnstile site key、客服邮箱与运营名称。
- 后台私有配置：Cloudflare、Google、Fish、存储签名密钥和 `CRON_SECRET`。不得提交 Git；本机准备文件也位于忽略目录。
- 不将本机代理、临时目录、FFmpeg 路径或固定测试音色 ID 写入生产环境。
- 将根域名和 www 绑定实际 Vercel 项目，再根据该项目显示的目标更新 Cloudflare DNS。不得猜测项目专用记录。
- 发布验收必须检查真实 HTTPS、登录回调、Turnstile、上传、队列执行、积分与结果下载。源码构建通过不能替代云端队列与 Linux 函数的实测。

2026-10-25 首次生产部署已完成，临时访问地址 https://dubbingnow.vercel.app ，部署 ID `dpl_56K1DgH7WZRuht72oziUKEoPmMPp`。远程 Linux/x64 构建从官方源码编译 FFmpeg 8.0.3 并通过解码与对齐检查；Vercel 已保存两个私有队列触发器和每日清理计划。37 项生产环境变量已写入，公开客服邮箱为 1058134934@qq.com，运营名称 DubbingNow。

线上首页、就绪检查与能力接口返回 200；未授权账户和清理请求返回 401，公开访问队列消费者返回 404。使用已配置清理密钥请求生产清理接口返回 200，实际 D1/R2 清理执行成功。

2026-10-27 更新：`dubbingnow.com` 与 `www.dubbingnow.com` 的项目所有权验证和域名配置已通过；正式根域 HTTPS 可访问，www 跳转根域，26 个可索引页面返回 200。用户在另一个 Cloudflare 账号配置 DNS；D1/R2 保留在原账号，无需迁移。正式域名登录、真实上传、云端队列配音、关页继续执行、积分及下载仍需完整验收，不能用域名和部署成功替代。

当前由本机 CLI 发布，GitHub 尚未关联自动部署；生产工作分支为 `codex/cloudflare-storage`。平台、资源、私有密钥位置、发布与排查方法集中见 [项目交接手册](PROJECT_HANDOVER.md)。

## 官方依据（2026-10-25 核对）

- [Vercel Queues 快速接入及私有消费者](https://vercel.com/docs/queues/quickstart)
- [队列 SDK、消息去重与重投](https://vercel.com/docs/queues/sdk)
- [Vercel 函数限制](https://vercel.com/docs/functions/limitations)
- [队列价格与额度](https://vercel.com/docs/queues/pricing)
- [FFmpeg 官方源码下载](https://ffmpeg.org/download.html)
