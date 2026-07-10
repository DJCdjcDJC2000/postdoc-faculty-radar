# Postdoc Faculty Radar

一个默认中文、静态优先、可多链接部署的博后/教职/研究岗职业情报门户。项目面向应用数学、优化、数值分析和科学计算方向，先服务个人职业规划，未来可公开给同方向 PhD/Postdoc 作为只读情报站使用。

- 生产站：<https://public-omega-seven-25.vercel.app/>
- GitHub：<https://github.com/DJCdjcDJC2000/postdoc-faculty-radar>

## 产品形态

- 首页：公开社区门户，显示本周情报摘要、高匹配机会、职业路线、成功案例和数据源状态。
- 机会雷达：常驻筛选 + 高级筛选 + 高密度表格 + 岗位详情。
- 产业雷达：大陆大厂优先的岗位、公司/团队、薪资、产业人物、技能需求、对比与私有申请跟踪。
- 职业路线：欧洲博后/Fellowship、港新 Research Fellow、国内博士后/青年教职、大厂研究岗、数学/应用数学教职。
- 导师与学者：QS Top 50 目标导师、青年学者、代表作和公开招聘信号。
- 申请日历：Fellowship 周期、岗位截止、个人行动。
- 资源与方法：数据源、评分、隐私、AI 辅助和免责声明。

## 快速开始

```bash
npm install
npm run update:offline
npm run dev
```

公开版本地预览：

```text
http://localhost:5173
```

个人版本地预览：

```bash
npm run dev:private
```

## 常用命令

```bash
npm run fetch          # 抓取线上候选岗位
npm run fetch:offline  # 只使用手工种子和 source 状态
npm run analyze        # DeepSeek 分析；无 key 时生成 fallback 分析
npm run build:public   # 生成公开版 public/
npm run build:private  # 生成个人版 private/
npm run update         # fetch + analyze + build:public
npm run update:light   # 每日轻量检查，不调用 DeepSeek
npm run update:weekly  # 周更、增量分析、变化报告
npm run check          # 测试 + 离线更新 + public/private 构建
npm run verify:acceptance # PRD 验收检查
```

## 个人画像

- `config/profile.json`：可提交的公开画像，只放方向、地区偏好和公开说明。
- `config/profile.private.json`：本地私有画像，可放姓名、学历时间线、导师和当前论文关键词；已被 `.gitignore` 忽略。
- `config/profile.private.example.json`：私有画像模板。

私有版构建和 `analyze:private` 会自动合并公开画像与本地私有画像。公开版不会输出 `config/profile.private.json` 中的字段。

## DeepSeek

创建 `.env` 或在 GitHub/EdgeOne 中配置环境变量：

```bash
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

DeepSeek 用于：

- 所有新增岗位轻量分类。
- A/B 岗位深度摘要、加分/扣分、风险和下一步建议。
- 成功案例路径分析。
- 飞书每日/每周摘要。

AI 内容始终标注：`AI 辅助生成，需核验`。

产业雷达采用增量分析，`DEEPSEEK_MAX_ITEMS` 默认每次最多 12 项，以适配低成本周更。

公开分析写入 `data/ai/job-analysis.json`。私有分析写入已忽略的 `data/private/job-analysis.json`，避免个人差距分析进入公开仓库。

## 飞书提醒

```bash
FEISHU_WEBHOOK_URL=...
npm run notify:daily
npm run notify:weekly
npm run notify:immediate
```

`notify:immediate` 默认读 private 构建，可包含个人关注项，但不会写入公开网页。

自动任务每周一 09:07（北京时间）执行完整更新，其余日期 09:17 只检查变化、截止日期和数据源健康。新增/更新高亮 7 天，失效信息归档但不删除。

## public/private 边界

- `public/`：公开部署目录，不包含私人备注、联系记录、申请状态、个人差距分析。
- `private/`：本地/私有环境使用，可包含个人行动记录和长期准备计划。
- `data/private/*.json` 和 `config/profile.private.json` 都是本地私有文件，不要提交。

不要把 `private/` 部署到公开平台。

## 部署

详见 [docs/deployment.md](./docs/deployment.md)。
产业数据与证据边界见 [docs/industry-intelligence-research.md](./docs/industry-intelligence-research.md)。

验收状态详见 [docs/acceptance-audit.md](./docs/acceptance-audit.md)。

推荐公开链接：

- Vercel：当前生产主站。
- GitHub Pages：公开源码对应的备用链接。
- EdgeOne Pages：后续可选的大陆访问镜像。
