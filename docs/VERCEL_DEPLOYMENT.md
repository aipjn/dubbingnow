# dubbingnow.com 与 Vercel 部署

已确认的网站域名为 `dubbingnow.com`，GitHub 仓库为 `https://github.com/aipjn/dubbingnow`，目标托管平台为 Vercel。

当前代码可以提交 GitHub，但后端还不能直接作为普通 Vercel Functions 上线。通过网页构建不等于配音服务可以正常工作。

## 当前部署边界

| 部分                           | 当前实现                   | Vercel 上的处理                                  |
| ------------------------------ | -------------------------- | ------------------------------------------------ |
| 网页、SEO、浏览器音视频处理    | Next.js 与浏览器 worker    | 可以部署                                         |
| 用户、积分、任务队列、音色记录 | 本地 SQLite                | 必须迁移到可共享的持久数据库，或保留在持久服务器 |
| 源音频与配音结果               | 本地私有文件及签名下载     | 必须迁移到私有对象存储，或由持久后端直接传输     |
| 配音任务                       | 独立 Node worker 与 FFmpeg | 需要后台任务运行环境；不能只启动 Next 页面服务   |

Vercel Functions 的本地存储是临时的，实例之间不共享 SQLite 文件。普通函数的请求/响应体上限为 4.5 MB，与当前最高 100 MB 的签名上传路径不兼容，不能简单把上传地址改成本站函数。

Vercel 目前提供 Daemons 公测，可以运行后台容器，但其存储仍为临时存储，不能直接解决 API/worker 共享 SQLite 和媒体文件的问题。即使使用 Daemons，也需要改造数据库、对象存储及任务领取方式。

## 可选实现路径

1. 保留当前后端：Vercel 承载 `dubbingnow.com` 网页，另用持久服务器承载 API、SQLite、文件与 worker。前端设置 `NEXT_PUBLIC_API_BASE_URL=https://api.dubbingnow.com`；后端允许 `https://dubbingnow.com`，文件直接传输到后端。`api.dubbingnow.com` 是建议的地址，尚未创建或验证。现有 [单机部署文档](PRODUCTION_DEPLOYMENT.md) 适用于后端。
2. 适配 Vercel：将 SQLite 改成云数据库，媒体迁移至私有对象存储及浏览器直传，把 worker 接入可持久重试的任务运行方式，并打包 FFmpeg。必须保留积分原子结算、任务幂等、租约恢复、音色隔离和单席位测试保护；不能用临时 SQLite 或进程内定时器代替。

这两条路径都保留 Google + Fish。当前没有替用户购买或创建额外付费服务，也没有完成这两条路径的公网部署。

如先验证界面，可以在单独的 Vercel Preview 明确设置 `NEXT_PUBLIC_API_BASE_URL=` 使用演示模式；它只返回样例结果，不能作为真实配音上线验收。正式公开配置必须在构建前填写，Auth0/Turnstile 也需绑定实际域名。

Git 与本地 Vercel 上传均排除 `.env.local`、`.data`、`.runtime`、`.vercel`、依赖目录与测试结果。供应商私钥放在实际运行后端的环境配置中，不上传 GitHub。

## 官方依据（2026-10-24 核对）

- [Vercel 的 SQLite 与临时存储说明](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Vercel Functions 上传限制](https://vercel.com/docs/functions/limitations#request-body-size)
- [Vercel Daemons 与临时存储限制](https://vercel.com/docs/daemons#what-does-the-daemons-beta-support)
