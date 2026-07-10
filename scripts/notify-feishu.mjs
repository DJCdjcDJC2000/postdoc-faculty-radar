import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./lib/env.mjs";
import { sendFeishuNotification } from "./lib/feishu-notification.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadDotEnv(projectRoot);

const kind = readArg("kind") ?? "daily";
const mode = readArg("mode") ?? "public";
const siteDir = mode === "private" ? "private" : "public";

const site = await readJson(`${siteDir}/data/site.json`, null);
if (!site) {
  throw new Error(`Missing built site data: ${siteDir}/data/site.json. Run npm run build:${mode} first.`);
}

const text = buildMessage(site, kind);


const delivery = await sendFeishuNotification({ text });
if (delivery === "preview") {
  console.log("Feishu delivery is not configured. Preview:");
  console.log(text);
  process.exit(0);
}
console.log(`Feishu notification sent via ${delivery}.`);

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

function buildMessage(site, kind) {
  if (kind === "weekly") return weeklyMessage(site);
  if (["monthly", "quarterly", "annual"].includes(kind)) return periodicMessage(site, kind);
  if (kind === "immediate") return immediateMessage(site);
  return dailyMessage(site);
}

function periodicMessage(site, kind) {
  const label = ({ monthly: "月报", quarterly: "季度报告", annual: "年度报告" })[kind];
  const profiles = site.academic?.profiles ?? [];
  const official = profiles.filter((profile) => (profile.recruitmentSignals ?? []).some((signal) => ["official_opening", "department_opening"].includes(signal.type))).length;
  const activeIndustry = (site.industry?.opportunities ?? []).filter((item) => item.status === "active").length;
  return [
    `Postdoc Faculty Radar ${label}`,
    `构建时间：${site.metadata?.builtAt ?? site.metadata?.generatedAt ?? "unknown"}`,
    `当前机会：${site.metrics?.totalJobs ?? 0}；A/B 高匹配：${site.metrics?.highMatchJobs ?? 0}；30 天内截止：${site.metrics?.dueSoonJobs ?? 0}`,
    `学术人物：${site.academic?.overview?.totalProfiles ?? profiles.length}；完整档案：${site.academic?.qualityGate?.publishedProfiles ?? 0}；官方招聘证据：${official}`,
    `重点公司：${site.industry?.companies?.length ?? 0}；产业人物：${site.industry?.people?.length ?? 0}；活跃产业岗位：${activeIndustry}`,
    `来源健康：${(site.sources ?? []).filter((source) => source.status === "ok").length}/${site.sources?.length ?? 0}`,
    "",
    "完整报告：https://github.com/DJCdjcDJC2000/postdoc-faculty-radar/issues",
    "网站：https://public-omega-seven-25.vercel.app/",
    "岗位与人员状态请以原始官方来源为准。"
  ].join("\n");
}

function dailyMessage(site) {
  const lines = [
    "Postdoc Faculty Radar 每日短报",
    `构建时间：${site.metadata?.builtAt ?? site.metadata?.generatedAt ?? "unknown"}`,
    `本周新增：${site.updates?.newCount ?? 0}；更新：${site.updates?.updatedCount ?? 0}；失效：${site.updates?.expiredCount ?? 0}`,
    `学术候选池：${site.academic?.overview?.totalProfiles ?? 0}；完整档案：${site.academic?.qualityGate?.publishedProfiles ?? 0}`,
    `当前机会：${site.metrics?.totalJobs ?? 0}；A/B 高匹配：${site.metrics?.highMatchJobs ?? 0}；30 天内截止：${site.metrics?.dueSoonJobs ?? 0}`,
    ""
  ];
  lines.push(...alertLines(site.alerts ?? [], 8));
  const failed = (site.sources ?? []).filter((source) => source.status === "error").slice(0, 5);
  if (failed.length) {
    lines.push("抓取失败源：");
    for (const source of failed) {
      lines.push(`- ${source.name}: ${source.message}`);
    }
  }
  return lines.join("\n").trim();
}

function weeklyMessage(site) {
  const byRegion = countBy(site.jobs ?? [], "region");
  const byRole = countBy(site.jobs ?? [], "roleLabelZh");
  const lines = [
    "Postdoc Faculty Radar 每周周报",
    `A/B 高匹配：${site.metrics?.highMatchJobs ?? 0}；活跃数据源：${site.metrics?.activeSources ?? 0}/${site.metrics?.totalSources ?? 0}`,
    `本周新增：${site.updates?.newCount ?? 0}；更新：${site.updates?.updatedCount ?? 0}；失效：${site.updates?.expiredCount ?? 0}`,
    `学术候选池：${site.academic?.overview?.totalProfiles ?? 0}；导师组：${academicTypeCount(site, "mentor_group")}；青年学者：${academicTypeCount(site, "young_scholar")}；完整档案：${site.academic?.qualityGate?.publishedProfiles ?? 0}`,
    `招聘信号：官方 ${site.academic?.overview?.officialOpenings ?? 0}；基金扩组 ${site.academic?.overview?.expansionSignals ?? 0}；长期申请 ${site.academic?.overview?.acceptingApplications ?? 0}；Fellowship host ${site.academic?.overview?.fellowshipHosts ?? 0}`,
    "",
    `地区分布：${formatCounts(byRegion)}`,
    `岗位类型：${formatCounts(byRole)}`,
    "",
    "重点机会（学术 6 + 产业 4）："
  ];
  lines.push(...alertLines(site.alerts ?? [], 6));
  lines.push(...industryAlertLines(site.industry?.opportunities ?? [], 4));
  if ((site.people ?? []).length || (site.industry?.people ?? []).length) {
    lines.push("");
    lines.push("本周可读路径样本：");
    for (const person of (site.industry?.people ?? []).slice(0, 3)) {
      lines.push(`- ${person.name}｜${person.currentPosition ?? ""}｜可复制性 ${person.replicabilityScore ?? "?"}`);
    }
    for (const person of (site.people ?? []).slice(0, 2)) {
      lines.push(`- ${person.name}｜${person.currentPosition ?? ""}｜${person.currentInstitution ?? ""}`);
    }
  }
  return lines.join("\n").trim();
}

function immediateMessage(site) {
  const urgent = (site.jobs ?? [])
    .filter((job) => job.recordType !== "watch_seed")
    .filter((job) => job.lifecycleStatus !== "expired")
    .filter((job) => {
      const days = daysUntil(job.deadline);
      return job.priority === "A" || (days >= 0 && days <= 30) || ["P0", "P1"].includes(job.private?.myPriority);
    })
    .slice(0, 10);
  const lines = [
    "Postdoc Faculty Radar 即时提醒",
    `触发项：${urgent.length}`,
    ""
  ];
  lines.push(...alertLines(urgent, 10));
  return lines.join("\n").trim();
}

function alertLines(items, limit) {
  if (!items.length) return ["暂无高优先级提醒。"];
  const lines = [];
  for (const item of items.slice(0, limit)) {
    lines.push(`[${item.priority ?? "?"}/${item.matchScore ?? "?"}] ${item.title}`);
    lines.push(`${item.institution ?? item.sourceName ?? ""} | ${item.region ?? ""} | ${item.roleLabelZh ?? item.roleType ?? ""}`);
    if (item.aiSummaryZh || item.ai?.summaryZh || item.reason || item.simpleReason) {
      lines.push(item.aiSummaryZh || item.ai?.summaryZh || item.reason || item.simpleReason);
    }
    if (item.sourceUrl) lines.push(item.sourceUrl);
    lines.push("");
  }
  return lines;
}

function industryAlertLines(items, limit) {
  const selected = [...items]
    .filter((item) => item.status === "active")
    .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
    .slice(0, limit);
  if (!selected.length) return [];
  const lines = ["产业机会："];
  for (const item of selected) {
    lines.push(`[产业 ${item.overallScore ?? "?"}] ${item.titleZh ?? item.title}`);
    lines.push(`${item.company ?? ""} | ${item.city ?? item.region ?? ""} | ${item.availabilityZh ?? ""}`);
    if (item.sourceUrl) lines.push(item.sourceUrl);
    lines.push("");
  }
  return lines;
}

function countBy(items, key) {
  const result = new Map();
  for (const item of items) {
    const value = item[key] || "未知";
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return [...result.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function formatCounts(entries) {
  return entries.map(([key, count]) => `${key} ${count}`).join("；") || "暂无";
}

function academicTypeCount(site, type) {
  return site.academic?.overview?.byType?.find((item) => item.value === type)?.count ?? 0;
}

function daysUntil(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateValue}T23:59:59Z`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function readArg(name) {
  const eq = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}
