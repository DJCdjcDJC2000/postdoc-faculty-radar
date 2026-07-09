# Postdoc Faculty Radar

一个低成本、可静态部署的职业情报库 MVP，用于长期追踪与你方向相关的博后、Research Fellow、教职、fellowship、国内人才岗和大厂研究岗。

## 当前目标

- 个人优先使用，未来可公开给同方向 PhD/Postdoc。
- 尽量 0 成本运行。
- 数据源优先覆盖欧洲、香港、新加坡，同时保留国内、大厂、美国/加拿大高匹配机会。
- 只收录公开可验证信息。
- 用飞书 Webhook 推送高优先级机会。
- 静态页面可部署到 EdgeOne Pages、GitHub Pages 或 Cloudflare Pages。

## 快速开始

```bash
npm install
npm run fetch:offline
npm run dev
```

然后打开终端显示的本地地址。

如果要抓取线上数据：

```bash
npm run fetch
```

## 飞书提醒

本地测试时设置环境变量：

```powershell
$env:FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..."
npm run notify
```

GitHub Actions 中把同名变量放到 repository secret：`FEISHU_WEBHOOK_URL`。

## 项目结构

```text
config/
  keywords.json       关键词、地区、岗位类型和评分权重
  sources.json        官方/高价值数据源清单
data/manual/
  jobs.json           手工维护的长期机会和 fellowship
  people.json         成功入职者背景库的人工种子数据
public/
  index.html          静态看板
  app.js              前端筛选和渲染
  styles.css          看板样式
  data/               抓取脚本生成的数据
scripts/
  fetch-jobs.mjs      抓取、去重、评分、生成数据
  notify-feishu.mjs   飞书推送
  dev-server.mjs      零依赖本地静态服务器
  lib/                评分和归一化工具
test/
  score.test.mjs      核心评分/去重测试
```

## 部署建议

第一阶段建议双镜像：

- 主站：EdgeOne Pages，兼顾国内外访问。
- 备份：GitHub Pages，方便与你的 GitHub 主页生态联动。

页面不依赖外部 CDN、Google Fonts、GitHub raw 动态资源或登录态 API，核心数据全部由 GitHub Actions 生成到 `public/data/`。

## 下一步增强

- 为每个高价值网站补专用 selector。
- 加入 OpenAlex / ORCID / Semantic Scholar / DBLP 的人物背景补全。
- 为 Workday/Taleo 类动态页面增加 Playwright 抓取模式。
- 增加 private notes 与 public export 的字段隔离。
