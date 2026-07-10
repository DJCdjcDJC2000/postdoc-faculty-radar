import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(await fs.readFile(path.join(projectRoot, "public/data/site.json"), "utf8"));
const updates = site.updates ?? { items: [] };
const date = new Date(site.metadata?.builtAt ?? Date.now()).toISOString().slice(0, 10);
const lines = [
  `# 职业雷达周报 · ${date}`,
  "",
  `- 本周新增：${updates.newCount ?? 0}`,
  `- 本周更新：${updates.updatedCount ?? 0}`,
  `- 本周失效：${updates.expiredCount ?? 0}`,
  `- A/B 高匹配：${site.metrics?.highMatchJobs ?? 0}`,
  `- 30 天内截止：${site.metrics?.dueSoonJobs ?? 0}`,
  "",
  "## 本周变化",
  ""
];

for (const item of (updates.items ?? []).slice(0, 30)) {
  const score = item.priority ? `${item.priority} ${item.score ?? ""}` : item.score ?? "";
  lines.push(`- **${item.labelZh}** [${item.title}](${item.sourceUrl || "https://public-omega-seven-25.vercel.app/"}) · ${item.organization || ""} · ${item.region || ""} · ${score}`);
}

if (!(updates.items ?? []).length) lines.push("- 本周没有检测到可确认的变化。");

const failedSources = (site.sources ?? []).filter((source) => source.status === "error");
lines.push("", "## 数据源状态", "");
lines.push(`- 正常或有结果：${(site.sources ?? []).filter((source) => source.status === "ok").length}/${site.sources?.length ?? 0}`);
for (const source of failedSources.slice(0, 10)) {
  lines.push(`- 抓取失败：${source.name} · ${source.message || "未知错误"}`);
}

lines.push(
  "",
  "## 查看网站",
  "",
  "[打开博后教职职业情报门户](https://public-omega-seven-25.vercel.app/)",
  "",
  "> 自动生成的情报摘要。岗位状态与申请要求以官方原文为准。"
);

const outputPath = path.join(projectRoot, "data/generated/weekly-report.md");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Weekly report written to ${path.relative(projectRoot, outputPath)}.`);
