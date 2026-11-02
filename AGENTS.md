<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## SEO 页面修改规范

适用于网站已有页面的内容维护、界面调整和 SEO 优化。修改页面前，先确定涉及的分区；同一项修改涉及多个分区时，按限制更严格的分区处理。

关键词布局以仓库根目录的 [keywords-lock.md](keywords-lock.md) 为权威基线。修改页面前必须读取该文件；除非用户明确要求，否则不得改变关键词布局，也不得自行修改清单以迁就代码变更。等待新数据、准备 301 或提出 SEO 优化建议均不构成修改授权。用户明确要求变更后，只调整指定范围，并同步更新清单。

| 档位      | 包括什么                                                    | 处理规则                                                                                                  |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 🔴 锁定区 | URL、页面主词、Title 里的核心词片段、H1 的核心词、canonical | 未经用户明确要求不得修改。获明确要求后，仍须配套 301 重定向或等待下一轮数据支持，且一次只调整一个锁定项。 |
| 🟡 谨慎区 | Title 的措辞（核心词不换）、H1 的补充句、meta description   | 一次确定并完成修改，发布后至少等待 2 周再调整，避免逐周反复改版。                                         |
| 🟢 自由区 | 正文段落、FAQ、内链、图片 alt、示例音频／视频、表格         | 可以随时增加和完善，不受上述等待周期限制；约 90% 的页面优化工作应集中在此区。                             |

- 301 重定向用于 URL 迁移；不能用它替代 Title、H1 核心词等非 URL 项目的数据观察。
- 字号、间距、布局和交互调整应保留锁定区内容；不能因界面重构顺带改动 URL、页面主词、Title／H1 核心词或 canonical。
- 谨慎区的等待周期从修改正式发布之日计算，不以本地编辑日期计算。
