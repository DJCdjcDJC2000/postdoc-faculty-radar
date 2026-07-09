# 部署说明

本项目采用静态站双链接策略：

- GitHub Pages：基础公开链接，适合与 GitHub 仓库绑定。
- EdgeOne Pages：主链接或国内外更稳的镜像。

## 构建输出

- `public/`：公开版，可部署到 GitHub Pages / EdgeOne Pages。
- `private/`：个人版，本地或私有环境使用，不应公开部署。

## GitHub Pages

1. 创建 GitHub 仓库，例如 `djcdjcdjc2000/postdoc-faculty-radar`。
2. 推送本项目。
3. 在 repository settings 中开启 GitHub Pages。
4. GitHub Actions 会运行 `.github/workflows/radar.yml`，上传 `public/`。
5. 设置 secrets：
   - `DEEPSEEK_API_KEY`
   - `FEISHU_WEBHOOK_URL`

公开链接示例：

```text
https://djcdjcdjc2000.github.io/postdoc-faculty-radar/
```

## EdgeOne Pages

1. 在 EdgeOne Pages 中导入同一个 GitHub 仓库。
2. 构建命令使用：

```bash
npm ci
npm run update
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
