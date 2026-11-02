# 专用跨语言配音 API 调研

> 历史记录：配置、价格与能力以当时日期为准。当前生产行为及待办见 [项目现状](../CURRENT_STATUS.md)。

调研日期：2026-10-19（北京时间）。对象是“输入视频/音频，保留原说话人的声音，翻译并输出同步配音”的服务；普通 TTS、数字人生成和仅做口型的 API 不当作同一种产品比较。

本次核对官方文档、API 价目表、帮助中心以及 Reddit / G2 用户反馈，没有调用这些新供应商的付费 API。因此能力是文档核验，效果是用户反馈和待验证判断，处理速度没有同素材实测排名。

## 纯音频口径补充与纠正

用户明确需求为：输入音频，跨语言翻译并保留原声，输出音频。前版把音频配音、视频翻译以及改口型候选放在同表中，比较口径不够清楚。采购与测试以本节为准。

- ElevenLabs Dubbing 按源音频分钟收费，支持纯音频输入；v1 无水印 $0.50/分钟，v2 $2.20/分钟，纯音频没有另外公布的更低费率。这些价格不含口型修改，官方明确 Dubbing 本身不提供 lip sync。v2 主要返回无损音频，视频只是预览。[API 定价](https://elevenlabs.io/pricing/api)、[不包含口型同步](https://elevenlabs.io/docs/help-center/product/dubbing/do-you-offer-lip-sync-in-dubbing)、[输入输出格式](https://elevenlabs.io/docs/help-center/product/dubbing/which-file-formats-are-supported-by-dubbing)。不把有水印档 $0.33 当作已确认的纯音频交付价。
- Vozo Translate & Dub 接口支持 `media_type=audio`，音频和视频均为 3 points/源素材分钟；口型是独立工具。Creator $29/月、150 points，折算 $0.58/分钟；Studio $99/月、600 points，折算 $0.495/分钟。API 与网页共用会员和点数；折算要求全部用完。[音频参数](https://www.vozo.ai/docs/api_reference/endpoints/translate_dub/overview)、[点数规则](https://www.vozo.ai/docs/common/tools-points-rules)、[套餐](https://www.vozo.ai/pricing/website)、[API 计费说明](https://www.vozo.ai/api)。
- HeyGen 的 Audio Only 位于 Video Translation 产品中，含义是视频翻译时不改口型，不能只看这个名字就认定为独立的音频输入 API。未核实纯音频输入，暂不放进纯音频方案表。另，本轮官方 API 帮助页更新为 Audio Only $0.57、Speed Lip Sync $0.81、Precision Lip Sync $1.50/分钟，已更正下文旧报价。[当前 API 价格](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained)。
- Rask、DittoDub、Azure 等前表价格仍是各自整套本地化产品口径，尚未逐一确认独立纯音频输入与是否另有音频费率；不能直接视为已确认的纯音频 API 报价。CAMB 独立 API 单价仍未核实。

更接近当前架构的另一种比较是保留 Google 识别翻译和我们自己的对齐，仅替换合成器。ElevenLabs TTS 可使用已有克隆 voice ID，Flash/Turbo 为 $0.04/千字符；v3/v4/Multilingual 为 $0.08/千字符。这是合成费，不是完整 Dubbing 费。[官方单价及自定义音色 FAQ](https://elevenlabs.io/pricing/api)。

按本地 17.086542 秒英译西样本（译文 309 字符，Google 识别翻译按付费价 $0.00342675）折算，单目标语言、$1≈¥7 的固定预算假设下：

| 纯音频方案 | 美元/源音频分钟 | 人民币粗算/分钟 | 口径 |
| --- | ---: | ---: | --- |
| 当前 Google + Fish，两家均按付费价 | $0.0284 | ¥0.20 | 已实测 Google 用量、按 Fish 译文字节估合成费 |
| Google + ElevenLabs Flash/Turbo 克隆 TTS | $0.0554 | ¥0.39 | 价格推算，未调用 ElevenLabs 样测 |
| Google + ElevenLabs v3/v4/Multilingual 克隆 TTS | $0.0988 | ¥0.69 | 价格推算，未调用 ElevenLabs 样测 |
| ElevenLabs Dubbing v1 无水印 | $0.50 | ¥3.50 | 完整音频翻译配音 API |
| ElevenLabs Dubbing v2 | $2.20 | ¥15.40 | 完整音频翻译配音 API |
| Vozo Translate & Dub | $0.495–0.58 | ¥3.47–4.06 | 订阅额度全用完折算，非独立按量价 |

上表前三项不含额外的克隆席位或订阅固定费；所有方案不含额外重试、服务器等费用，税费依厂家规则。两条 ElevenLabs TTS 组合仍由我们负责识别翻译、参考音选择和时间对齐，不能据此声称具有 Dubbing v2 的原表演保留效果。当前 Fish 免费时费用更低，详见 [现有链路成本](CURRENT_PIPELINE_COST_2026-10-19.md)。

## 结论与建议

1. ElevenLabs 确有专用 Dubbing API，适合直接替代目前 Google + Fish + 逐句对齐这一部分后台流程。新项目应核对 `/v1/dubbing/project` 与 `model_id`，不能把 legacy 接口或普通 TTS 当作新一代配音。
2. 当前公开价目表将 v1 和 v2 分开：v1 无水印 $0.50/分钟；v2 $2.20/分钟。v2 更适合作效果基准，成本约为前者 4.4 倍，不能拿旧版低价宣传新版能力。
3. Vozo 的完整配音 API 和公开套餐值得一起测试：付费计划共享 API / 网页点数，按套餐全用满折算约 $0.50–0.58/分钟。该折算不是无需订阅的按量报价。
4. HeyGen 能处理原视频翻译，音频配音与改口型分开收费；没有口型需求时应只比较 Audio Only。Rask 的逐句编辑和整套本地化功能有价值，但 API 权益、整分钟计费和重生成规则要看 API 页面。CAMB 有完整接口，但本次没有核实独立 API 的每分钟单价。
5. 先用自然人声素材对比 ElevenLabs v2、Vozo 与现有链路；需要改口型时再增加 HeyGen。没有证据表明专用接口必然比现有 17 秒视频约 18–20 秒的链路更快。

以上为针对本项目的选型判断，非音质排行榜。现有 Fish 音色和席位未改变。

## ElevenLabs：具体可用到什么程度

### 接口与接入方式

新接口可用文件或 URL 创建项目，指定 `model_id=dubbing_v1|dubbing_v2`，默认 v2；`target_language` 可以同时排队第一个目标语言。项目保存源素材和原文，语言目标生成各自结果。是异步任务，支持 webhook，也能查询状态；上传文件上限 3 GiB。来源：[创建项目](https://elevenlabs.io/docs/api-reference/dubbing/create-project)。

完成后的语言目标提供无损音频与字幕签名地址；现有应用可以继续在浏览器保留原画面、合并返回音轨。不要把低分辨率预览视频当作原片交付。来源：[结果接口](https://elevenlabs.io/docs/api-reference/dubbing/language-targets/get-language-target)。

按官方介绍，专用配音流程自动从素材提取声音特征，无需我们先建立可复用 `voice_id`。这与单独创建 PVC / IVC 再做 TTS 的接口不同；本次没有核实每种账户配置下的声音库槽位规则，不作“无限声音槽位”承诺。来源：[Dubbing API 产品说明](https://elevenlabs.io/dubbing-api)。

### 能力及限制

- v2 仍标为 Alpha；主打保留原始表演的情绪、节奏和音色。官方解释是直接以原音表演为条件，不仅依赖转写文本。来源：[Dubbing v2 介绍](https://elevenlabs.io/blog/introducing-dubbing-v2)。
- 支持多说话人并保留背景声；普通自助套餐最多 3 个并行配音任务，企业默认 10 个。没有实时 / live dubbing；不能把 TTS 的流式能力或毫秒级延迟宣传用于整段配音。来源：[能力说明](https://elevenlabs.io/docs/overview/capabilities/dubbing)。
- API 创建和下载对所有套餐开放；API 原文/译文编辑、导入自备稿件与重新生成受企业权益限制。网页编辑能力与 API 权益要分开确认。来源：[Dubbing 概览与 FAQ](https://elevenlabs.io/docs/eleven-creative/products/dubbing)、[自带转写](https://elevenlabs.io/docs/eleven-api/guides/how-to/dubbing/bring-your-own-transcript)。
- 如项目返回 `voices_not_permitted` 等 warning，可能已换成替代声音。我们要求保留原声时，应识别这种结果，而非把 HTTP 成功直接当作原声克隆成功。来源：[项目查询与警告示例](https://elevenlabs.io/docs/api-reference/dubbing/get-project)。

### 费用及容易误读的地方

[官方 API 价格表](https://elevenlabs.io/pricing/api) 的产品表和 Dubbing 分项列出：v1 有水印 $0.33/分钟、无水印 $0.50/分钟，v2 $2.20/分钟。页面 FAQ 仍有仅列旧版低价的内容；本报告以明确区分模型的分项为准，实际消费仍应核对控制台。

计价按源素材分钟 × 目标语言数量。创建项目即预付至少一个语言的费用，第一个语言使用预付额，新增语言另计；“至少一个语言”不等于“最少收一分钟”。源准备失败退款；首个目标语言失败时预付额保留供同项目重试，不宜删除后盲目新建。来源：[Dubbing 计费与失败规则](https://elevenlabs.io/docs/help-center/product/dubbing/how-much-does-dubbing-cost)。

## 同类 API 与成本

美元 / 单目标语言；未特意写明时不含改口型。套餐折算假设额度全用在配音且全部用完；未用额度、其他功能、重新生成、税费和最低充值可能改变实际成本。

| 服务          | 同类接口                        | 可核实费用                                                                                | 对我们最相关的区别                                                       |
| ------------- | ------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ElevenLabs v1 | 完整配音                        | $0.50/分钟，无水印                                                                        | 成本较低的专用接口对照组；与 v2 分开测试                                 |
| ElevenLabs v2 | 完整配音                        | $2.20/分钟                                                                                | 优先验证情绪和原始表演保留；Alpha / 企业编辑权益限制                     |
| HeyGen        | Video Translation API           | Audio Only $0.57/分钟；Speed Lip Sync $0.81；Precision Lip Sync $1.50                              | 视频产品不改口型档；独立纯音频输入未核实，暂不列纯音频对比                              |
| Vozo          | Translate & Dub API             | Creator $29/月≈50 分钟，约 $0.58/分钟；Studio $99/月≈200 分钟，约 $0.495/分钟             | 目前 API 页面称任意付费计划可用 API；高级能力需 Studio 或以上            |
| Rask          | Dubbing / Video Translation API | 月付 Creator Pro $99/100 分钟≈$0.99/分钟；Business $249/250≈$0.996；符合条件的额外分钟 $3 | API 权益从 Creator Pro 起分层；按整分钟向上取整，API 重生成有最低计费    |
| CAMB          | End to End Dubbing `/dub`       | API 独立分钟单价未核实；网页 Premier $75/月含约16分钟，折算约$4.69/分钟，仅作网页套餐参考 | 有多语言、背景声、外部 SRT/译文等完整 API，不能用单独 TTS 的便宜单价代替 |
| DittoDub      | 项目式 Dubbing API              | $48/月的167400 credits÷5580≈30分钟，约$1.60/分钟；加购5580 credits=$2.62                  | 偏 YouTube 发布、字幕、术语与审校流程，额外审校另耗额度                  |
| Azure Speech  | Video Translation REST API      | 本次公开页金额显示地区占位符，未核实统一单价                                              | 有标准声线和 PersonalVoice；复刻型 PersonalVoice 需要申请访问            |

价格来源：[ElevenLabs](https://elevenlabs.io/pricing/api)、[HeyGen API 专用计价说明](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained)、[Vozo 套餐](https://www.vozo.ai/pricing/website)、[Vozo API 权益](https://www.vozo.ai/api)、[Rask 当前价格卡](https://www.rask.ai/pricing)、[Rask API 计费](https://www.rask.ai/api)、[CAMB 套餐](https://www.camb.ai/pricing)、[DittoDub API 价格](https://dittodub.com/docs/pricing)、[Azure 价格](https://azure.microsoft.com/en-us/pricing/details/speech/)。

举例：一段 10 分钟素材翻成一个语言，按公开单位价格计算，ElevenLabs v1 无水印约 $5，v2 约 $22；HeyGen 视频翻译不改口型约 $5.70，带口型约 $8.10 / $15。这是任务用量折算，不包括可能的最低购买金额或订阅承诺；不能拿 Vozo 月费 $29 与单次生成 $22 直接比较。

### 同类接口核验

- HeyGen 的 Video Translation 是处理既有视频的接口，不是生成数字人。API 可按量购买，需把 Audio Only 和两个 Lip Sync 档分开。参考：[API 产品与购买方式](https://www.heygen.com/api-pricing)。
- Vozo 支持自动检测说话人，`voice_model=real` 偏向保留原来的情绪和口音，`native` 偏向目标语言自然口音；提供译文、术语与审核相关选项。若提供 `selected_voice_id`，会跳过自动复刻。`align_video=true` 会调整画面速度，不能默认为画面数据完全不变。参考：[API 参数](https://www.vozo.ai/docs/api_reference/endpoints/translate_dub/overview)。
- Rask 使用 OAuth client credentials，API 创建项目后查询状态，webhook 需核对企业权益。其 API 页明确写整分钟向上取整、编辑重生成按改变片段计费且每次至少一分钟；网页营销的“免费重配”不应自动套用到 API。参考：[API FAQ](https://www.rask.ai/api)。
- CAMB 现行文档是 `POST https://client.camb.ai/apis/dub`、`x-api-key`，不是较旧帮助文章里举的通用上传路径；支持自带源 SRT 和各语种译文。参考：[End to End Dubbing](https://docs.camb.ai/api-reference/endpoint/end-to-end-dubbing)。
- Azure 有提音、转写、翻译改写、合成、字幕与成片返回；标准声音匹配不是原声复刻，PersonalVoice 才是应核实的路径。参考：[概览](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/video-translation-overview)、[使用步骤与 PersonalVoice 申请](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/video-translation-get-started)。

## 网上反馈：可采信的信号与边界

这些是用户自述，不是我们复现的结果。优先记录使用内容和具体问题；大量导购榜单、折扣站、厂家互评与评论区自荐没有用来确定胜负。G2 部分条目标注卖家邀请或激励，不把总星级当作 API 质量排名。

部分 G2 课程类评价来自较早版本，尤其 Rask 页面包含 2023 年评价；仅作为翻译/编辑工作流问题的线索，不能当作 2026 年现行模型的音质结论。评论的网页使用体验也不能直接证明 API 的效果或延迟。

| 服务 / 评论时间                           | 用户报告的优点                                | 用户报告的问题                                       | 怎样用于本项目判断                                                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ElevenLabs，2025-08，开发者做视频配音工具 | 认为专用 API 的克隆、情绪和时间同步达到了需求 | 觉得当时接近 $1/分钟太贵；自行拼装后自然度和同步较差 | 与我们场景接近，但历史价格不能当当前报价。[原帖](https://www.reddit.com/r/LanguageTechnology/comments/1mq672o/trying_to_build_a_web_video_dubbing_tool_need/)                                                                            |
| ElevenLabs，2026-09，俄语课程/冥想本地化  | 发帖者称声音与情绪效果好                      | v2 改不了所需专业术语，影响交付                      | 测试应包含术语与译文可控性，而不只听短句。[原帖](https://www.reddit.com/r/ElevenLabs/comments/1wiozuy/best_al_dubbingvoiceover_tools_workflow_for/)                                                                                      |
| ElevenLabs，2026-08，Scale 用户           | 网站 v2 效果让其期待 API                      | 自述 API 没有同样提升，且某些语种返回原语言          | 必须明确新接口和 `model_id` 并检测输出语种；不能断言其失败原因。[原帖](https://www.reddit.com/r/ElevenLabs/comments/1vidbe6/elevenlabs_dubbing_api_v2_seems_identical_to/)                                                               |
| Vozo，G2 2026-05 至09                     | 有用户认可声音情绪和一体化工作流              | 也有串说话人、句尾语气不自然、长任务慢或卡住的反馈   | 正负反馈都有；部分评价带激励标记，仍需同素材 API 测试。[评论](https://www.g2.com/products/vozo-ai/reviews)                                                                                                                               |
| HeyGen，G2 / Reddit                       | 口型、声音复刻和使用便利性获肯定              | 额度/费用、重做成本与偶发语音或尾段同步异常          | 很多评价实际针对数字人，不能外推为 Video Translation API 的失败率。[G2](https://www.g2.com/products/heygen/reviews)、[配音体验讨论](https://www.reddit.com/r/SmallYoutube/comments/1oo411p/whats_the_best_ai_tool_to_translate_and_dub/) |
| Rask，G2 课程类用户                       | 认可翻译和编辑流程                            | 提到价格、个别语种情绪欠缺、结果需要调整             | 可作为编辑工作流候选，不因此断言音质胜过 ElevenLabs。[评论](https://www.g2.com/products/rask-ai/reviews)                                                                                                                                 |
| CAMB，Reddit 2025-09                      | 讨论中有人看重其直播/体育使用场景             | 一名试用者称不适合自己的素材；其余有自荐与间接推荐   | 样本少且缺同片对照，不给音质优劣排名。[原帖](https://www.reddit.com/r/TextToSpeech/comments/1ni9byl/help_me_choose_between_ai_dubbing_tools_anyone/)                                                                                     |

对评论的纠偏：有人说 ElevenLabs 不能导出字幕，但现行语言目标接口明确提供字幕 URL；有人将 TTS 的延迟或数字人生成体验混入配音比较。此类问题要通过当前 API 文档复核，而不是照搬抱怨。[当前结果字段](https://elevenlabs.io/docs/api-reference/dubbing/language-targets/get-language-target)。

## 对现有 web-vc 的实施判断

当前已经测过 Google + Fish 识别翻译、三路合成和浏览器合并。专用 API 接入应作为另一种后台提供者，沿用上传、任务状态、额度与下载，不需要先重写网页。

推荐样测顺序：

1. ElevenLabs v2：作为原始表演、情绪和时间同步的质量基准；同时测 v1，确认 4.4 倍单位价格是否换来可感知提升。
2. Vozo：确认 `real` 与 `native` 对音色/目标语发音的实际取舍，核对付费套餐里的 API 权益和扣点。
3. HeyGen Audio Only：同等“不改口型”条件做对照；有人脸口型需求时再开 Speed / Precision。
4. Rask 放在需要改稿和专业本地化流程时；CAMB / Azure 在 API 报价、访问权限核实后再进入付费测试。

测试素材应加入自然的人声、双人对话、带背景音乐、情绪变化和较长视频；不再只用 Samantha 合成旁白评价克隆音质。用同一源文件与同一目标语言，记录总耗时、排队、实际扣费、声音相似度、发音自然度、语义遗漏、说话人串线和同步误差。至少覆盖西语和一个跨语言差异更大的目标，质量评分交给能理解目标语言的人听评。

当前 Fish 免费开发档的样测成本不能直接用于推算商业成本，也没有证据证明这些专用 API 在同素材条件下更快。专用 API 值得测试的主要理由是统一处理声音、翻译节奏、说话人与背景混音，以及减少我们自建流程的维护负担。

## 本次文档冲突记录

- ElevenLabs 价格 FAQ 有旧版低价，模型价格表已有 v2 $2.20；v2 发布博客仍出现“API coming soon”，而现行 API / FAQ 已给出可用接口。
- ElevenLabs 不同概览对网页 v2 是否可编辑有不同表述；API 编辑需企业套餐的说明一致。本报告不据网页编辑状态作采购判断。
- Vozo 搜索缓存有“仅 Business / 需申请”，现行 API 页面改为任意付费计划；老套餐页仍可能没有同步标明，采购前需在账号内确认。
- Rask 价格卡、旧 FAQ 和较旧 API 帮助文章存在不同价格/权限描述；本报告展示当前月付价格卡并标注 API 页的独立计费规则，不用旧 FAQ 数字兜底。
- CAMB 未从公开材料核实独立 API 每分钟费率；Azure 抓取页为地区占位符。没有将第三方估算伪装成已确认报价。
