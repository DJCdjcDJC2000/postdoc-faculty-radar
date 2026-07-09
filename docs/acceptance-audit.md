# PRD 验收审计

日期：2026-07-09

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
- public/private 边界：公开构建无 private 字段；真实 private 文件、私有画像、私有 AI 输出均被 `.gitignore` 忽略。
- 静态部署约束：核心 HTML/JS/CSS 不依赖外部 CDN、Google Fonts、GitHub raw 动态资源。
- GitHub Pages 配置：`.github/workflows/radar.yml` 包含更新、通知、提交生成数据和 Pages 部署步骤。
- EdgeOne 兼容：`docs/deployment.md` 写明 EdgeOne Pages 构建命令和输出目录。

## 当前外部边界

以下项目需要用户确认后才能继续，因为它们会把代码或网站发布到公共服务：

- 创建或绑定 GitHub 远程仓库。
- `git push` 到 GitHub。
- 开启/验证 GitHub Pages 公开链接。
- 配置 EdgeOne Pages 并验证公开镜像链接。
- 配置真实 `DEEPSEEK_API_KEY` 或 `FEISHU_WEBHOOK_URL` 到 GitHub/EdgeOne Secrets。

在这些外部动作完成前，本项目是“本地开发与部署准备完成”，但不能声明 PRD 的公开链接验收已经完成。

## 验证命令

```bash
npm run check
npm run verify:acceptance
```
