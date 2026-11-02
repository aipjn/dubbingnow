# 当前 Google + Fish 链路成本（2026-10-19）

> 历史记录：配置、价格与能力以当时日期为准。当前生产行为及待办见 [项目现状](../CURRENT_STATUS.md)。

## 口径

使用现有 GoogleProvider 对同一个 17.086542 秒英文参考音频重新执行一次识别与西班牙语翻译，记录 Google API 实际 usage，再以译文实际 UTF-8 字节数计算 Fish 付费版合成价格。本次没有重新创建克隆，也没有为了算价再次调用 Fish 合成。此前全链路合成已通过。

这是单一样本、单一目标语言、成功请求的 API 成本估算，不是历史账单。Google 用非流式响应便于读取 usage，提示词、schema、模型均使用项目现有实现。长视频、语言、语速、分段、思考量和重试均会改变成本。

## 用量与计算

- Google 模型：gemini-3.8-flash
- 当前 Fish 模型：s2.1-pro-free
- Google 输入：724 tokens（音频 428，文本 296）；输出 515，思考 254。
- Google 输出与思考分别返回，都按输出单价计费；总量核验：724 + 515 + 254 = 1493。
- Fish 输入：309 个 JS 字符，311 UTF-8 字节。不能把中文字符数直接当字节数。
- Google 当前 Standard 单价：输入 $0.75/M tokens；输出（含思考）$3.75/M tokens，优惠至 2026-12-31。2027-01-01 起分别为 $1.50 和 $7.50。
- Fish 付费 s2.1-pro：$15/M UTF-8 bytes；当前 s2.1-pro-free 为 $0，官方免费期至 2026-11-30，受公平使用限制且无 SLA。
- 17 秒样本：Google $0.00342675；Fish 付费价 $0.00466500；合计 $0.00809175。
- 按样本等比例折算每源音频分钟：Google $0.01203；Fish 付费 $0.01638；合计 $0.02841。
- 为便于预算，人民币按固定假设 $1 = ¥7 粗算，非实时汇率：当前 Fish 免费、Google 按付费价约 ¥0.084/分钟；两者均付费约 ¥0.199/分钟。

Google 账户是否消耗免费额度或付费余额未查账；免费额度内实际费用可更低。不含服务器、带宽、存储、税费、失败重试、额外音色席位或订阅费用。当前复用已经创建的唯一测试音色。多个目标语言分别生成会增加费用。

## 官方来源

- [Google Gemini API 定价](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)
- [Google Interactions usage 字段](https://ai.google.dev/api/interactions-api)
- [Fish API 定价与计费单位](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits)
- [Fish 免费期与限制](https://fish.audio/blog/s2-1-pro-free-api/)

原始测量数据保存在项目本地 .runtime/cost-analysis/current-sample.json，不含 API 密钥或音频内容。
