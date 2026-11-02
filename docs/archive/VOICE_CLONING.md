# 声音克隆 preview：参考句筛选与耗时验证

> 历史记录：配置、价格与能力以当时日期为准。当前生产行为及待办见 [项目现状](../CURRENT_STATUS.md)。

> 2026-10-18 更新：默认克隆已切换 Fish Audio，并按单席位要求持久复用一个音色。下面 Google 授权录音流程与 10 月 14 日基准为前期实现记录；当前接入见 [FISH_TESTING.md](FISH_TESTING.md)。

本轮实现采用 Google Gemini Voices API 的 stateless replication；没有引入新供应商、GPU 或训练任务。克隆接入和候选筛选已通过测试替身验证。真实 Google 识别、翻译和预设 TTS 已实测；**真人克隆音色相似度、授权验证通过率和克隆额外耗时尚未实测**，需要原说话人测试素材及其本人录制的授权声明。

## 当前预设音色如何选择

`selectVoice` 将人声表现分为 male / female / neutral，从各组固定音色池按说话人编号取模分配。同一说话人在任务内保持一致。这只是粗分组，没有测量音色相似度，不能保证选到相近音色。后续可以用参考与候选试听样本的说话人 embedding 距离做候选排序，再由人听测确认；本轮先完成克隆路径。

## 克隆参考句怎样选

1. 每 120 秒音频识别一次，保留原文、起止时间、说话人编号和参考质量标记。克隆模式使用 24 kHz 单声道 PCM；同一解码结果用于识别和本地参考评分，不另为评分启动 FFmpeg。
2. 模型逐句标注清晰度、正常自然语气、是否重叠人声。任一质量标记缺失、不适合或不确定，均不作为参考。音乐、混响、喊叫、耳语、唱歌和笑声通过这些模型标记排除。
3. 枚举同一说话人的连续完整句子，句间停顿最多 0.35 秒，总长 10–30 秒。跨说话人、长间隔和跨 120 秒块的句子不拼接；不在句子中间机械裁出 10 秒。
4. 本地波形按 20 ms 帧分析：有声帧比例至少 65%，最长连续静音不超过 0.9 秒，整体 RMS 为 -35 至 -8 dBFS，满幅样本比例不超过 0.2%。过轻、过响、明显静音和削波片段被排除。
5. 评分由有效语音比例 55 分、接近 20 秒的时长 20 分、接近 -20 dBFS 的响度 10 分、文本字符多样性 10 分和完整句尾 5 分组成。每位说话人保留最多三个不重叠候选，最高分片段用于创建音色。字符多样性只是轻量启发式，不等同于音素覆盖率。
6. 每位说话人只创建一次音色，整段任务复用该 key。每位说话人都必须有适合参考和授权录音，缺少时失败并退款；不会暗中改用预设声音。

参考音频不做激进降噪，以免破坏音色。波形指标不能可靠识别背景音乐、混响或其他说话人；质量标记和跨块说话人编号仍依赖模型估计，尚未做声纹聚类。因此本轮是可测量的候选筛选初版，不是音色相似度保证。后续真人听测应比较候选 1/2/3 的清晰度、声音相似度、自然度、口音、语速和跨句稳定性，并覆盖噪声、多人轮流说话和超过 120 秒的输入。

## 授权录音与页面操作

真实模式新增 Voice 选择，选择 **Clone original voices (preview)** 后，按原说话人首次发声顺序上传各人的授权录音（最多八人）。Google 要求同一成年说话人的真实参考及授权录音，推荐 24 kHz mono 16-bit WAV，参考为 10–30 秒。授权录音需清晰念出官方声明，可用中文：

> 我是此声音的拥有者并授权谷歌使用此声音创建语音合成模型

或英文：

> I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model.

参考句从原素材选取，授权录音作为独立私有上传。每份授权限制 30 秒 / 2 MB。报价及创建任务均检查上传归属和完成状态；Google 验证同一说话人及声明。演示模式不提供克隆，不会把固定样例伪装成克隆结果。

`POST /v1beta/voices` 使用 `store:false`，返回的 `voicekey_...` 只保留在 worker 内存中，传给 TTS 的 `speech_config.voice`。不创建持久 Google voice，不将 key、原文或录音写入计时文件。原素材、授权及结果按现有私有存储保留期处理；未结算任务的授权上传不会被清理任务误删。

官方来源：[Google Voice replication](https://ai.google.dev/gemini-api/docs/voice-replication)、[Voices API](https://ai.google.dev/api/voices)、[Speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)。这项录音要求来自供应商接口，不是应用额外增加的确认流程。

## 耗时优化与计时范围

- 默认 `TEXT_PIPELINE=combined`：同一次 Google 请求返回原文和译文，参考评分使用原文，TTS 使用译文。`separate` 可恢复识别、翻译两个请求作对照。没有自动失败重试成另一套流程，避免不明的重复付费和语义变化。
- 默认 `SYNTHESIS_CONCURRENCY=3`：逐句合成及对齐受限并发，结果按原时间顺序写入。音色创建与独立翻译可并行；翻译最多两路，音色创建最多配置路数。各阶段限额分别计算，因此 separate 模式的准备阶段总并发可能为两者之和。
- 取消或失败会中止同组请求，并等待所有在途工作结束后再清理文件，避免清理目录时仍有任务写入。
- 每个任务在 `.data/metrics/<jobId>.json` 保存排队、解码、识别/翻译、候选筛选、参考提取、授权转换、音色创建、合成、对齐、写入和发布的计时。报告含候选时间范围和拒绝原因，不含音频或文本。失败也会记录已执行阶段；报表失败不改变任务状态或扣费。
- `wallMs` 为服务器实际总时间；`totalMs` 为某阶段所有调用的累计时间，`spanMs` 为该阶段首次开始到最后完成的跨度。并发的 `totalMs` 会大于其实际跨度，不能相加作为总耗时。
- `firstAudioMs` 指服务器首段合成完成，尚未向浏览器流式返回。浏览器在 `dubbingnow.client-timing.v1.<sessionId>` 的 sessionStorage 中单独记录文件准备/哈希、视频提取、上传（含授权）、任务创建、等待和本地视频合并；页面恢复后的片段不是一次完整端到端处理。
- CLI 报告不包含浏览器提取、上传、任务排队、轮询或视频合并。

## 2026-10-14 实测

测试机为当前开发机，真实接口使用现有 Google key。输入是仓库的原创系统 TTS 样例 `public/demo/english.wav`，8.866667 秒，输出西班牙语；不是声音克隆质量测试。CLI 使用 high_fidelity 模型。

| 流程                | 分句数 | 服务器总耗时 | 识别/翻译      | 合成            | 首段合成完成 |
| ------------------- | -----: | -----------: | -------------- | --------------- | -----------: |
| separate + 串行     |      3 |      23.56 s | 6.62 + 5.16 s  | 累计 11.33 s    |      15.10 s |
| separate + 三路并发 |      2 |      22.58 s | 10.85 + 5.68 s | 最长单句 5.89 s |      20.72 s |
| combined + 三路并发 |      3 |      15.26 s | 合并 9.83 s    | 实际跨度 5.18 s |      13.23 s |

最后一组相较串行样例约少 35% 时间，但三次调用均为单次观察，识别分句及网络耗时不同，不能据此声称稳定提速 35%，也不能用于推算克隆全链路耗时。

固定 18 秒、12 句、同一参考和分句的受控实验，使用真实 FFmpeg、合成波形和 200–220 ms 延迟的供应商测试替身：串行 **3.727 s**，三路并发 **1.328 s**，约 **2.81×**；最终 WAV 的 SHA-256 相同，每次任务只创建一个测试音色，所有句子复用它。该结果只验证并发收益和结果一致性，不能代表真实供应商延迟或真人音色质量。

原始报告（不提交私人运行目录）：

- `.runtime/benchmarks/google-preset-serial/report.json`
- `.runtime/benchmarks/google-preset-parallel/report.json`
- `.runtime/benchmarks/google-preset-combined/report.json`
- `.runtime/benchmarks/local-concurrency.json`

## 复现实验

```bash
# 无付费调用：固定分句、真实媒体处理、供应商测试替身
npm run benchmark:local

# 真实调用：仅分析原录音，导出候选 WAV 供听测，不创建克隆音色
npm run benchmark:dubbing -- --input /path/source.wav --analyze-only

# 真实克隆：零起始编号按首次发声顺序；多说话人可重复 --consent
npm run benchmark:dubbing -- --input /path/source.wav --target es \
  --consent 0=/path/speaker-1-consent.wav --concurrency 3

# 真实预设配音对照；此命令不测克隆质量
npm run benchmark:dubbing -- --input public/demo/english.wav --mode preset \
  --separate-text --concurrency 1
```

下一步的真人测试应先听候选 WAV，再测整段克隆输出。至少分别记录克隆创建耗时、翻译准确度、原音色相似度、时间对齐误差，以及不同句子的音色稳定性。当前缺少真实原说话人的测试素材和本人授权录音，不能用合成授权替代。

## 本轮验证记录

- `npm run typecheck`、`npm test`：通过，31 项测试。
- `npm run build`：通过。
- 浏览器原有 14 项回归：13 项首次通过；手机首屏尺寸检查因初始化重挂载过早取尺寸失败，补上会话初始化等待后单项复验通过。
- `npm run test:clone-ui`：通过，HTTP 为测试拦截，验证授权录音独立上传与 SHA-256、说话人编号、clone 模式报价/创建、结果及客户端计时，另检查手机端控件没有叠放。
- 真实 Google 预设配音输出经 ffprobe 确认为 8.866667 秒，与输入相同；真实克隆验证仍待真人素材及授权录音。
