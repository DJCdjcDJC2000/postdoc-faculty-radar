# 部署说明

本项目采用静态站多链接策略：

- CloudBase：国内固定镜像。
- Vercel：海外生产主站。
- GitHub Pages：与公开源码绑定的备用链接。
- EdgeOne Makers：临时预览备用；未绑定备案自定义域名时不作为永久入口。

当前生产地址：

```text
https://postdoc-faculty-radar-public.vercel.app/
```

国内固定镜像：

```text
https://postdoc-d0gag7854778e6b41-1315477303.tcloudbaseapp.com/
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
   - `DEEPSEEK_MODEL=deepseek-v4-flash`
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

独立 Vercel 项目名为 `postdoc-faculty-radar-public`，生产域名为 `postdoc-faculty-radar-public.vercel.app`。项目只连接当前公开仓库的 `main` 分支，不依赖其他 Vercel 项目；每次有效推送自动生成生产部署。

需要从本机显式复验或发布时，必须使用职业雷达的隔离配置：

```bash
npx vercel deploy --prod --yes -Q C:\Users\16523\.vercel-career-radar
```

## CloudBase（国内固定镜像）

CloudBase 环境 `postdoc` 使用免费体验版，当前没有启用按量付费或自动续费。首次部署已经验证主页、脚本、样式和核心 JSON 均返回 200。

本机完成公开构建、隐私扫描和验收后，使用已授权的 CloudBase CLI 同步 `public/`：

```bash
npm run deploy:cloudbase
```

该命令只上传公开构建，不上传 `private/`、`.env*`、API 密钥或本地配置。免费体验环境到期前需要在控制台确认续期政策；不得自动切换到付费套餐。

## EdgeOne Makers（临时预览备用）

1. 在 EdgeOne Pages 中导入同一个 GitHub 仓库。
2. 构建命令使用：

```bash
npm ci
npm run build:public
```

3. 输出目录设置为：

```text
public
```

4. 生产分支设为 `main`，由 Makers 监听推送并自动部署。
5. EdgeOne 只负责部署已经脱敏的公开构建，不配置 DeepSeek 或飞书密钥；周更仍由 GitHub Actions 完成。
6. 系统预览链接有时效；在中国大陆使用永久自定义域名通常需要备案，因此当前不把 EdgeOne 预览链接写入公开入口。

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
