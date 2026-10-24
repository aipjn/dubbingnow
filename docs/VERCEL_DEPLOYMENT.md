# dubbingnow.com 与 Vercel 部署

已确认的网站域名为 `dubbingnow.com`，GitHub 仓库为 `https://github.com/aipjn/dubbingnow`，目标托管平台为 Vercel。

持久存储已实现 Cloudflare D1 + 私有 R2，详见 [Cloudflare 接入说明](CLOUDFLARE_STORAGE.md)。后台任务仍需要 Node/FFmpeg 执行环境，通过网页构建不等于配音服务已经上线。

## 当前部署边界

| 部分                           | 当前实现                   | Vercel 上的处理                                |
| ------------------------------ | -------------------------- | ---------------------------------------------- |
| 网页、SEO、浏览器音视频处理    | Next.js 与浏览器 worker    | 可以部署                                       |
| 用户、积分、任务队列、音色记录 | Cloudflare D1（已实现）    | 配置服务凭据并初始化数据库                     |
| 源音频与配音结果               | 私有 R2（已实现）          | 配置对象读写凭据、CORS，浏览器直传             |
| 配音任务                       | 独立 Node worker 与 FFmpeg | 需要后台任务运行环境；不能只启动 Next 页面服务 |

Vercel Functions 的本地存储是临时的。本次 Cloudflare 模式只把 FFmpeg 的可丢弃工作文件放在临时目录，数据库、音色记录和结果均不依赖它。音频上传直接到 R2，结果下载从 API 验权后跳转到 R2，避开普通函数 4.5 MB 请求/响应体限制。

## 剩余部署工作

当前选定 D1 + R2 路径，保留 Google + Fish。资源已创建，R2 按用户确认的按量计费订阅开通。代码适配与 R2 CORS 已完成；还需要配置服务凭据、初始化 D1，并进行真实云端验收。

网页/API 可以部署到 Vercel；配音仍由独立 Node worker 执行。需要选择并配置能运行 Node/FFmpeg 的后台环境，使用相同的 Cloudflare 与供应商环境变量。Vercel Daemons、Container Functions 或 Sandbox 等能力须在实际账号与项目中单独验证，当前没有部署或声称已跑通本项目。不能只启动 Next 服务并假设 worker 会自动运行，也不能依赖浏览器页面维持任务。

如先验证界面，可以在单独的 Vercel Preview 明确设置 `NEXT_PUBLIC_API_BASE_URL=` 使用演示模式；它只返回样例结果，不能作为真实配音上线验收。正式公开配置必须在构建前填写，Auth0/Turnstile 也需绑定实际域名。

Git 与本地 Vercel 上传均排除 `.env.local`、`.data`、`.runtime`、`.vercel`、依赖目录与测试结果。供应商私钥放在实际运行后端的环境配置中，不上传 GitHub。

## 官方依据（2026-10-24 核对）

- [Vercel 的 SQLite 与临时存储说明](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Vercel Functions 上传限制](https://vercel.com/docs/functions/limitations#request-body-size)
- [Vercel Daemons 与临时存储限制](https://vercel.com/docs/daemons#what-does-the-daemons-beta-support)
