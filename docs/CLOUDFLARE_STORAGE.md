# Cloudflare 持久存储

正式环境使用 `PERSISTENCE_DRIVER=cloudflare`。API 与 worker 可以运行在不同机器，服务器只需要可丢弃的临时工作目录。Google + Fish、浏览器提取音频和本地合并视频的流程不变；原视频始终留在用户设备上。

| 数据                                                         | 保存位置                                         |
| ------------------------------------------------------------ | ------------------------------------------------ |
| 用户、钱包、积分流水、游客试用、验证凭据指纹、限流、每日预算 | D1 `dubbingnow-db`                               |
| 上传票据、报价、任务、幂等键、租约、worker 心跳、管理审计    | D1                                               |
| Fish 音色创建意图和模型 ID、任务计时                         | D1 `voice_records` / `pipeline_metrics`          |
| 用户上传的音频                                               | 私有 R2 `dubbingnow-audio`，`uploads/<uploadId>` |
| 合成 WAV                                                     | 同一私有桶，`results/<jobId>/<leaseId>.wav`      |
| FFmpeg 输入副本、分句文件、格式转换和合成工作文件            | OS 临时目录，任务结束删除，不是持久状态          |
| API 密钥与共享签名密钥                                       | 后端环境变量，不进入 Git 或客户端包              |

已创建资源的 ID 在 `.env.example`。密钥留空，需要配置服务凭据：D1 token 只授予当前账户的 D1 读写；R2 S3 密钥只授予 `dubbingnow-audio` 的对象读写。不要使用 Global API Key 或全账户 R2 管理权限。

## 初始化

填写 `.env.local` 中的 Cloudflare 服务端变量和共享 `STORAGE_SIGNING_SECRET` 后：

```bash
npm run cloudflare:setup
npm run build
npm start
# 在具备 FFmpeg/ffprobe 的后台运行环境中，使用相同的 D1/R2/签名密钥：
npm run worker
```

初始化脚本执行 `migrations/0001_cloudflare.sql` 并写入默认积分规则；所有建表使用 `IF NOT EXISTS`，不会清空已有用户或余额，也不会创建 Fish 音色。脚本只检查 R2 可达性，不配置公开访问。

R2 CORS 允许项目域名及本机调试地址，方法 `GET, HEAD, PUT`，请求头 `Content-Type, Content-Length, If-None-Match, Range`，暴露 `ETag, Content-Length, Content-Range`。实际控制台已保存这一规则。临时 Preview 域名需逐个加入允许列表，不使用 `*`。

`BACKEND_TEMP_DIR` 可覆盖临时目录。Cloudflare 模式下忽略 `BACKEND_DATA_DIR`，不会自动创建或读取 `dubbing.sqlite`、本地音色记录或持久结果文件。测试所用唯一 Fish 模型仍通过 `FISH_REFERENCE_ID` 复用；没有设置时会查询并复用账号唯一已有声音，再把记录保存到 D1。生产仍需独立音色容量和 `per_job` 模式，禁止把测试声音共享给正式用户。

## 上传、处理与下载

1. API 先在 D1 校验用户、预算并创建上传记录，返回短时 R2 PUT 签名。浏览器必须照单发送 `ticket.headers`，包括 `If-None-Match: *`。签名约束内容类型与长度；同一 URL 不能覆盖已上传的对象。
2. 浏览器只把提取后的音频传到 R2，不经过 Next/Vercel 请求体。
3. `/uploads/:id/complete` 从 R2 检查真实字节数、SHA-256、音频编码和时长；工作副本立即删除。媒体验证通过前不能创建配音任务。
4. worker 从 D1 原子领取任务，再从 R2 下载源音频，在临时目录调用 FFmpeg/Google/Fish。结果以租约 ID 分开命名，过期 worker 不会覆盖有效结果。
5. 结果写入 R2 成功后才在 D1 结算积分。取消、超时、失败只退款一次；失去租约的 worker 无法结算。
6. 结果接口验证用户和有效期后，307 跳转至短时 R2 签名 GET/HEAD。大音频响应不经过 Vercel 函数。清空任意实例的临时目录不会丢失用户、积分、音色或结果。

D1 不支持跨 HTTP 请求的交互式事务。本实现先读取业务条件，再通过 D1 原子 batch 中的版本约束提交所有积分/任务变更；版本冲突会整批回滚并重新检查，不会出现“条件更新 0 行但仍然扣款”。限流、心跳和非终态进度使用单条条件 SQL，避免轮询使业务事务持续冲突。不要绕过该层直接修改生产钱包/任务表。

当前复用原有 24 小时音频结果有效期和 worker 维护策略，未引入新的保留产品流程。D1 业务账目不会因音频到期被删除。云端备份使用 D1 Time Travel/export；原有 `npm run backup` 只适用于本地开发模式。

## 验证边界

`npm test` 包含真实 SQLite SQL 模拟 D1 REST 原子 batch 的竞争测试，以及真实 S3 SDK / HTTP / FFmpeg 的 R2 读写链路测试；测试不调用付费配音 API。它们不能替代真实 Cloudflare 权限、CORS 和网络联调。初始化和真实云端验收必须在凭据配置后执行。`npm run test:cloudflare-live` 使用真实 D1/R2 与 FFmpeg，校验 REST batch 整批回滚、并发幂等、R2 防覆盖，以及清空本地目录后下载结果；仅配音供应商为测试替身，不调用 Google/Fish，不创建音色，结束后清理本次唯一标识的合成测试数据。

2026-10-24 已完成服务凭据配置、真实 D1 初始化和 R2 连通检查。真实云端存储验收通过：D1 REST batch 失败时整批回滚、重复并发请求只预扣一次、签名上传不能覆盖源文件，以及删除本地临时目录后通过新实例下载结果。R2 的实际 OPTIONS 预检中，项目域名、www 域名及两个本机来源均返回 204，未授权来源返回 403。该轮存储测试耗时 27.849 秒，使用合成音频和供应商测试替身，不能作为真实配音耗时；Google/Fish 请求和新建音色均为 0。验收报告位于本机私有 `.runtime/cloudflare/live-smoke.json` 和 `cors-smoke.json`。

`npm run test:full-chain` 仍明确使用隔离的本地 SQLite 测试数据，避免继承云端驱动后将测试游客写入错误的存储；真实云端存储测试使用上面的独立命令。

本次改动解决持久数据共享。独立 worker 仍需要能运行 Node/FFmpeg 的后台执行环境；仅将 Next 应用部署为普通 Vercel Functions 不会自动启动 worker。Vercel 后台执行方式和公网部署仍需单独完成，不能把编译成功视为上线完成。

官方依据：[D1 REST query/batch](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)、[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[R2 签名 URL](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)、[R2 条件写入](https://developers.cloudflare.com/r2/api/s3/api/)、[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)。
