# PRD 验收审计

日期：2026-07-10

本审计对应 `postdoc-faculty-radar-product-spec.md` 的 MVP 和验收标准。可执行检查在 `scripts/verify-acceptance.mjs`，并已接入 `npm run check`。

## 已验证

- 默认中文界面：`public/index.html` 使用 `lang="zh-CN"`，导航为 `首页 / 机会雷达 / 职业路线 / 成功案例 / 申请日历 / 资源与方法`。
- 首页门户形态：公开构建包含情报摘要、高匹配机会、职业路线、成功案例和数据源状态所需数据。
- 机会雷达：常驻 7 个筛选和高级 8 个筛选均存在。
- 岗位详情：包含基本信息、匹配分析、研究方向、申请信息、行动记录、关联人物、AI 分析、原始文本和抓取记录。
- 成功案例：包含人物卡片、背景表格、职业路径摘要、职业路线图、可学习点和风险提醒。
- 职业路线：5 条路线均存在，并联动代表机会和相关案例。
- 申请日历：包含 Fellowship 周期、岗位截止；private 构建包含长期准备计划。
- 数据质量：公开岗位包含标题、机构、地区、类型、来源可信度；非监控种子岗位包含来源链接；A/B 机会包含匹配理由。
- 数据源原则：官方源和权威平台均已进入 sources，资源与方法页包含数据源、评分、隐私、AI 与免责声明。
- AI 集成：DeepSeek 脚本、fallback、public/private 输出路径和 AI 核验标记已实现。
- 飞书提醒：每日、每周、即时提醒模板已实现。
- 增量更新：岗位保留首次发现、最近变化和生命周期状态；新增/更新高亮 7 天，失效岗位归档不删除。
- 自动调度：周一完整更新并生成飞书/GitHub 周报，其余日期执行不调用 DeepSeek 的轻量检查。
- public/private 边界：公开构建无 private 字段；真实 private 文件、私有画像、私有 AI 输出均被 `.gitignore` 忽略。
- 静态部署约束：核心 HTML/JS/CSS 不依赖外部 CDN、Google Fonts、GitHub raw 动态资源。
- GitHub Pages 配置：`.github/workflows/radar.yml` 包含更新、通知、提交生成数据和 Pages 部署步骤。
- EdgeOne 兼容：`docs/deployment.md` 写明 EdgeOne Pages 构建命令和输出目录。

## 公开部署状态

- Vercel 独立生产主站：`https://postdoc-faculty-radar-public.vercel.app/`。
- GitHub Pages：`https://djcdjcdjc2000.github.io/postdoc-faculty-radar/`。
- GitHub 公开仓库：`https://github.com/DJCdjcDJC2000/postdoc-faculty-radar`。
- 2026-07-10 完整联调运行 `29071321565` 成功：测试、完整更新、DeepSeek 分析、飞书周报、GitHub 周报、生成数据提交和 Pages 部署全部通过。
- DeepSeek 专用 Secret 已配置；本轮 8 条当前岗位均返回 `deepseek` 状态，旧的无密钥 fallback 会在后续周更中自动重试。
- 飞书机器人周报已成功发送，并在客户端确认收到 13:26 的最新消息。
- GitHub Pages 与 Vercel 的首页、`data/site.json`、`data/jobs.json` 均返回 200，且响应内容逐字节一致。
- 已跟踪文件密钥扫描通过；`.env.local`、`vercel-proxy/.env.local` 和 `private/` 均被 Git 忽略。

## 验证命令

```bash
npm run check
npm run verify:acceptance
```
