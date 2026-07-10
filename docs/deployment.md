# 部署说明

本项目采用静态站多链接策略：

- Vercel：当前生产主站。
- GitHub Pages：与公开源码绑定的备用链接。
- EdgeOne Pages：后续可选的中国大陆访问镜像。

当前生产地址：

```text
https://public-omega-seven-25.vercel.app/
```

## 构建输出

- `public/`：公开版，可部署到 GitHub Pages / EdgeOne Pages。
- `private/`：个人版，本地或私有环境使用，不应公开部署。

## GitHub Pages

公开仓库：

```text
https://github.com/DJCdjcDJC2000/postdoc-faculty-radar
```

GitHub Actions 运行 `.github/workflows/radar.yml`，构建并上传 `public/`。仓库需要：

1. Pages 的构建来源设为 GitHub Actions。
2. Actions 默认工作流权限设为 Read and write。
3. 设置 secrets：
   - `DEEPSEEK_API_KEY`
   - `FEISHU_WEBHOOK_URL`
4. 设置 variables：
   - `DEEPSEEK_MODEL=deepseek-chat`
   - `DEEPSEEK_MAX_ITEMS=12`

公开链接：

```text
https://djcdjcdjc2000.github.io/postdoc-faculty-radar/
```

## 自动更新计划

- 周一 09:07（北京时间）：完整抓取、DeepSeek 增量分析、7 天变化归档、飞书周报、GitHub Issue 和部署。
- 周二至周日 09:17（北京时间）：只检查岗位变化、截止日期、链接和数据源状态，不调用 DeepSeek。
- 新信息达到来源规则后直接公开；`本周新增`、`本周更新` 高亮 7 天，失效信息进入历史档案而不删除。
- 官方来源可直接入库；聚合站和社交平台只有在找到官方原文后才进入正式列表。

## Vercel

Vercel 项目名为 `public`，生产域名为 `public-omega-seven-25.vercel.app`。生产部署使用 `vercel-proxy/vercel.json` 将该域名反向代理到自动更新的 GitHub Pages，并缓存 5 分钟。这样无需在 GitHub 保存长期 Vercel 账号 Token；每次 `main` 更新并完成 Pages 部署后，Vercel 主链接会自动读取新版本。

重新发布代理配置时执行：

```bash
npx vercel link --cwd vercel-proxy --yes --scope djc-world --project public
npx vercel deploy --cwd vercel-proxy --prod --yes
```

## EdgeOne Pages（可选镜像）

1. 在 EdgeOne Pages 中导入同一个 GitHub 仓库。
2. 构建命令使用：

```bash
npm ci
npm run update:weekly
```

3. 输出目录设置为：

```text
public
```

4. 环境变量配置：
   - `DEEPSEEK_API_KEY`
   - `FEISHU_WEBHOOK_URL`
   - `DEEPSEEK_MODEL=deepseek-chat`

## 隐私边界

不要把 `private/` 配置为公开部署目录。公开目录只使用 `public/`。

个人画像分为两层：

- `config/profile.json`：公开画像，可以提交。
- `config/profile.private.json`：本地私有画像，已被 `.gitignore` 忽略，不应提交。

`public/data/site.json` 不应包含以下字段：

- `private`
- `myStage`
- `myPriority`
- `privateNotes`
- `contactRecords`
- `personalAnalysisZh`
- `gapAnalysisZh`
- `personalAnalysis`
- `gapAnalysis`
- `preparationPlan`

可以用以下命令验证：

```bash
npm run check
```
