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
  `- 学术候选池：${site.academic?.overview?.totalProfiles ?? 0}`,
  `- 完整公开档案：${site.academic?.qualityGate?.publishedProfiles ?? 0}`,
  `- 导师组 / 青年学者：${academicTypeCount(site, "mentor_group")} / ${academicTypeCount(site, "young_scholar")}`,
  "",
  "## 本周变化",
  ""
];

for (const item of (updates.items ?? []).slice(0, 30)) {
  const score = item.priority ? `${item.priority} ${item.score ?? ""}`.trim() : item.score;
  const details = [item.organization, item.region, score].filter((value) => value !== undefined && value !== null && value !== "").join(" · ");
  lines.push(`- **${item.labelZh}** [${item.title}](${item.sourceUrl || "https://postdoc-faculty-radar-public.vercel.app/"})${details ? ` · ${details}` : ""}`);
}

if (!(updates.items ?? []).length) lines.push("- 本周没有检测到可确认的变化。");

lines.push("", "## 学术人物建设", "");
lines.push(`- 官方明确招聘：${site.academic?.overview?.officialOpenings ?? 0}`);
lines.push(`- 基金或项目扩组信号：${site.academic?.overview?.expansionSignals ?? 0}（不等于招聘）`);
lines.push(`- 长期接受申请：${site.academic?.overview?.acceptingApplications ?? 0}`);
lines.push(`- Fellowship host：${site.academic?.overview?.fellowshipHosts ?? 0}`);
for (const profile of (site.academic?.profiles ?? []).slice(0, 12)) {
  lines.push(`- [${profile.nameZh ? `${profile.nameZh} / ` : ""}${profile.name}](https://postdoc-faculty-radar-public.vercel.app/#people/${profile.id}) · ${profile.institution ?? "机构待补充"} · ${profile.publicationMetrics?.provider ?? "书目待补充"}`);
}

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
  "[打开博后教职职业情报门户](https://postdoc-faculty-radar-public.vercel.app/)",
  "",
  "> 自动生成的情报摘要。岗位状态与申请要求以官方原文为准。"
);

const outputPath = path.join(projectRoot, "data/generated/weekly-report.md");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Weekly report written to ${path.relative(projectRoot, outputPath)}.`);

function academicTypeCount(site, type) {
  return site.academic?.overview?.byType?.find((item) => item.value === type)?.count ?? 0;
}
