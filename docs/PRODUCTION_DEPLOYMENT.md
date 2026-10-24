# 单机生产部署与验收

适用当前 Google + Fish 方案：一台 Linux 主机，Node 22.16+、FFmpeg/ffprobe、nginx、systemd。API 与独立 worker 使用同一个本地持久目录。模板未安装到任何服务器，也未购买服务或修改现有测试音色。

## 先准备的外部信息

- 真实域名、DNS、TLS 证书及服务器。
- Auth0 自定义 API audience、正式回调 `/auth/callback`、退出地址、允许的网页 origin；domain/client ID 与前端 audience 配套，开启邮箱验证。
- 正式域名的 Turnstile site key 与 secret。
- 对外支持邮箱与运营主体名称（页面通过 `NEXT_PUBLIC_SUPPORT_EMAIL` / `NEXT_PUBLIC_OPERATOR_NAME` 使用）。
- Fish 合成账户余额与模型使用权限。正式默认 `inline` 直接发送当前任务的参考音，不需要创建声音模型；单音色注册席位不再是该路径的前置条件。显式 `saved_test` 仅供旧测试声音复用；旧 `per_job` 注册模式仍需要独立容量及 `FISH_ALLOW_VOICE_CREATION=true`。

`deploy/production.env.example` 是待填写模板，不是可以直接发布的配置。模板的 `s2.1-pro` 是付费生产档，不会修改本地正在使用的免费模型；正式费用/权限须另行验收。代码不自动切换或购买供应商套餐。

`BACKEND_PUBLIC_URL` 和 `NEXT_PUBLIC_SITE_URL` 只填写 HTTPS origin，不附加路径或查询参数；`NEXT_PUBLIC_API_BASE_URL` 使用 `/` 或与后端匹配的 HTTPS origin。前后端域名分开时，`API_ALLOWED_ORIGINS` 必须包含网站 origin。`NEXT_PUBLIC_AUTH0_DOMAIN` 只填写主机名，不含 `https://` 或路径。

## 安装约定

以下路径与模板一致，可按实际服务器调整：

- 代码：`/srv/web-vc/current`
- 持久数据：`/var/lib/web-vc`，仅 `web-vc` 用户访问
- 环境：`/etc/web-vc/environment`，权限 600，包含生产签名密钥与供应商密钥
- 备份：`/var/backups/web-vc`，权限 700，`web-vc` 可写
- Node：`/usr/bin/node`；FFmpeg：`/usr/bin/ffmpeg`、`/usr/bin/ffprobe`

管理员先创建 `web-vc` 系统用户与这些目录。配置文件和源码不得供普通网站用户写入。保持 Node 只监听 `127.0.0.1:3000`，通过防火墙阻止公网直接访问；nginx 覆盖转发头后才使用 `TRUST_PROXY=true`。如果前面还接 CDN，需要在 nginx 配置可信来源的真实 IP 解析，不能直接信任任意传入头。

把填写后的环境文件加载到构建进程，执行 `npm ci`、`npm run preflight`、`npm run typecheck`、`npm test`、`npm run build`，最后执行 `npm run preflight -- --require-build`。`NEXT_PUBLIC_*` 是构建时变量；修改后需要重新 build。构建 ID 包含应用使用的公开配置摘要，API 启动前会核对它，拒绝旧配置或演示模式的构建；供应商密钥不进入此摘要，轮换服务端密钥不要求重建前端。生产配置检查只验证配置、构建一致性与本地媒体工具，不代表外部账号、余额或真人验证可用。

安装 `deploy/web-vc-*.service` 和 `.timer` 到 `/etc/systemd/system/`，检查路径后执行 `systemctl daemon-reload`，启动 `web-vc-worker`、`web-vc-api`，再启用 monitor 与 backup timers。API / worker 的 `ExecStartPre` 都运行严格检查，未填真实资料或仍处于测试音色模式时会拒绝生产启动。

CI 的浏览器回归使用 `next start` 检验生产构建。可在独立测试目录执行 `NEXT_PUBLIC_API_BASE_URL= npm run build`，再执行 `NEXT_PUBLIC_API_BASE_URL= PLAYWRIGHT_PRODUCTION=true npm run test:e2e`；这些用例使用演示数据，不调用付费供应商。演示构建不能直接发布，验收后必须用正式环境重新构建并通过 `--require-build`。类型检查会先运行 `next typegen`，不依赖本地遗留的 `.next` 类型文件。

根据 `deploy/nginx.conf.example` 设置域名及证书路径，运行 `nginx -t` 后再 reload。模板允许 100 MB 级别的流式上传，不将签名文件 URL 的 query 写入 access log。API 本身仍校验签名、文件真实大小与哈希、格式与时长。

生产发布前排空或取消活动任务，再切换构建并重启。worker 最长处理时间默认 900 秒，systemd 模板预留 930 秒正常退出；修改上限时同步调整退出时间。不要在服务正在使用的 `.next` 上并行 build。

## 当前默认限制

| 设置                      | 默认值                                        |
| ------------------------- | --------------------------------------------- |
| 文件/源录音时长/说话人数  | 100 MB / 300 秒 / 1 人                        |
| 新用户赠额上限            | 50 积分（管理员策略可以更低，旧余额不被覆盖） |
| 全站活动任务上限          | 20                                            |
| 排队超时/运行超时         | 600 秒 / 900 秒                               |
| 每用户/全站每日音频尝试量 | 1800 秒 / 18000 秒                            |
| 每用户/全站每日上传签发量 | 500 MB / 5 GB                                 |
| 最低空闲磁盘              | 500 MB                                        |

每日预算使用 **UTC 日界线**，在签发上传授权或接受新任务时原子扣除；同一次任务的幂等重放不重扣。失败/取消会退回用户积分，但不退尝试量，防止反复失败或取消绕过供应商成本限制。它是处理量上限，不是精确美元账单；供应商实际费用还受译文字数、模型思考、语速与重试影响。

环境限制是服务器上限，管理员策略不能把它放大。`PAUSE_NEW_JOBS=true` 后重启 API 可暂停新任务，不影响既有任务结算和下载。上传预算限制不能替代磁盘告警；多人同时上传仍需要留出足够余量。

## 健康与故障恢复

- `GET /v1/health`：API 存活与 worker/磁盘/配置标志；不调用付费供应商。
- `GET /v1/ready`：磁盘/供应商配置/必要 worker 心跳/暂停开关决定 200 或 503；生产流量与监控应检查此接口。
- `npm run monitor`：检查 worker、磁盘、队列和最近一小时失败率，输出不含密钥的 JSON，异常退出非零。systemd timer 每分钟运行并写 journal；邮件/短信/外部告警接收端尚未配置，不能把日志当作已经送达的通知。
- worker 每 5 秒写心跳，超过 30 秒视为离线；新任务在生产模式拒绝预留积分。API 读取任务/健康状态及维护周期也会结算过期排队与失效租约，worker 停止不会永久冻结积分。
- 不自动重跑中断的付费调用，避免重复消费；用户可在确认退款后主动重试。

## 备份与恢复演练

`npm run backup -- create /var/backups/web-vc` 使用 SQLite 在线 backup API，包含数据库、音色注册/创建意图与本地签名文件（若存在），写 SHA-256 manifest。无需停止 API。备份包含私人账户记录，只保存在受限目录；生产环境密钥文件需单独加密备份，且备份应复制到另一台机器/存储。当前模板不会自动配置外部备份或删除历史备份，运营者应设置保留与加密策略。

每日 timer 在 UTC 03:00 运行。媒体文件不纳入持久备份，以免恢复已过期录音；任务/钱包与音色意图保留。

恢复示例：`npm run backup -- restore /var/backups/web-vc/<snapshot> /var/lib/web-vc-restored`。目标目录必须不存在，脚本拒绝覆盖已有安装，核验文件哈希与 SQLite 完整性，清除旧 worker 心跳。指向新目录启动后，未完成任务按正常恢复规则失败并退款，不再次调用供应商。原音色记录不会被自动重建；备份后才创建的新音色不在快照中，恢复前需核对供应商清单，不要盲目清空创建意图。结果文件不存在时，任务历史显示过期，不创建虚假的下载链接。

本地回归测试已实际完成带预留积分与音色创建意图的备份恢复，验证只退款一次、拒绝覆盖和损坏检测；正式主机仍需演练一次。

## 公网验收仍需完成

1. 真实 Auth0 注册（未验证邮箱应被拒绝）、验证后登录、退出、续期、管理员与暂停权限；真实 Turnstile 成功/过期/重放。
2. 正式 Fish 容量足够后再开启创建；两位不同用户上传不同自然人声，确认没有串音色。当前自动测试用替身，不会创建供应商声音。
3. 1–5 分钟自然录音、首发语种、5–10 个排队任务、取消/重启/超时/低磁盘场景，记录质量、成功率与费用。
4. 真实 iPhone/Safari、安卓/Chrome 文件选择到播放/下载；桌面 Chromium 自动测试不代表真机通过。
5. 检查运营资料与删除请求渠道；收费前另行完成支付/退款闭环。现在仍不收款。
