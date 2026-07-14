import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const period = readArg("period") ?? "monthly";
const periodConfig = {
  monthly: { label: "月报", lookbackDays: 31 },
  quarterly: { label: "季度报告", lookbackDays: 92 },
  annual: { label: "年度报告", lookbackDays: 366 },
}[period];
if (!periodConfig) throw new Error(`Unsupported report period: ${period}`);

const site = await readJson(path.join(projectRoot, "public", "data", "site.json"));
const generatedAt = new Date(site.metadata?.builtAt ?? Date.now());
const snapshotPath = path.join(projectRoot, "data", "generated", "intelligence-snapshots.json");
const snapshots = await readJson(snapshotPath, { schemaVersion: 1, snapshots: [] });
const current = buildSnapshot(site, generatedAt);
const baseline = findBaseline(snapshots.snapshots ?? [], generatedAt, periodConfig.lookbackDays);
const nextSnapshots = upsertSnapshot(snapshots.snapshots ?? [], current).slice(-400);
await writeJson(snapshotPath, { schemaVersion: 1, snapshots: nextSnapshots });

const reportPath = path.join(projectRoot, "data", "generated", `${period}-report.md`);
await fs.writeFile(reportPath, `${buildReport(site, current, baseline, periodConfig.label).join("\n")}\n`, "utf8");
console.log(`${periodConfig.label} written to ${path.relative(projectRoot, reportPath)}.`);

function buildSnapshot(site, date) {
  const profiles = site.academic?.profiles ?? [];
  const signals = profiles.flatMap((profile) => profile.recruitmentSignals ?? []);
  return {
    date: date.toISOString().slice(0, 10),
    jobs: site.metrics?.totalJobs ?? site.jobs?.length ?? 0,
    highMatchJobs: site.metrics?.highMatchJobs ?? 0,
    dueSoonJobs: site.metrics?.dueSoonJobs ?? 0,
    academicProfiles: site.academic?.overview?.totalProfiles ?? profiles.length,
    readyProfiles: site.academic?.qualityGate?.publishedProfiles ?? profiles.filter((profile) => profile.quality?.isPublicReady).length,
    mentors: countProfileType(profiles, "mentor_group"),
    youngScholars: countProfileType(profiles, "young_scholar"),
    officialOpenings: signals.filter((signal) => signal.type === "official_opening").length,
    acceptingApplications: signals.filter((signal) => signal.type === "accepts_applications").length,
    fellowshipHosts: signals.filter((signal) => signal.type === "fellowship_host").length,
    companies: site.industry?.companies?.length ?? 0,
    industryPeople: site.industry?.people?.length ?? 0,
    activeIndustryOpportunities: (site.industry?.opportunities ?? []).filter((item) => item.status === "active").length,
    healthySources: (site.sources ?? []).filter((source) => source.status === "ok").length,
    totalSources: site.sources?.length ?? 0,
  };
}

function buildReport(site, current, baseline, label) {
  const profiles = site.academic?.profiles ?? [];
  const topMethods = topValues(profiles.flatMap((profile) => profile.research?.methods ?? []));
  const topApplications = topValues(profiles.flatMap((profile) => profile.research?.applications ?? []));
  const openingProfiles = profiles
    .filter((profile) => (profile.recruitmentSignals ?? []).some((signal) => ["official_opening", "department_opening"].includes(signal.type)))
    .slice(0, 15);
  const topIndustry = [...(site.industry?.opportunities ?? [])]
    .filter((item) => item.status === "active")
    .sort((left, right) => Number(right.overallScore ?? 0) - Number(left.overallScore ?? 0))
    .slice(0, 10);
  const lines = [
    `# 职业雷达${label} · ${current.date}`,
    "",
    "## 核心变化",
    "",
    metricLine("当前机会", current.jobs, baseline?.jobs),
    metricLine("A/B 高匹配机会", current.highMatchJobs, baseline?.highMatchJobs),
    metricLine("学术人物档案", current.academicProfiles, baseline?.academicProfiles),
    metricLine("完整公开档案", current.readyProfiles, baseline?.readyProfiles),
    metricLine("官方招聘信号", current.officialOpenings, baseline?.officialOpenings),
    metricLine("活跃产业岗位", current.activeIndustryOpportunities, baseline?.activeIndustryOpportunities),
    "",
    baseline ? `对比基线：${baseline.date}` : "对比基线：首次生成，下一周期开始显示净变化。",
    "",
    "## 学术人物群体",
    "",
    `- 导师课题组：${current.mentors}`,
    `- 青年学者：${current.youngScholars}`,
    `- 长期接受申请：${current.acceptingApplications}`,
    `- Fellowship host：${current.fellowshipHosts}`,
    `- 高频方法：${formatTopValues(topMethods)}`,
    `- 高频应用：${formatTopValues(topApplications)}`,
    "",
    "## 有公开招聘证据的人物",
    "",
    ...openingProfiles.map((profile) => `- [${profile.nameZh ? `${profile.nameZh} / ` : ""}${profile.name}](https://postdoc-faculty-radar-public.vercel.app/#people/${profile.id}) · ${profile.institution || "机构待补充"}`),
  ];
  if (!openingProfiles.length) lines.push("- 当前未发现通过证据门槛的公开招聘人物。 ");
  lines.push("", "## 产业观察", "", `- 重点公司：${current.companies}`, `- 产业人物：${current.industryPeople}`);
  lines.push(...topIndustry.map((item) => `- [${item.titleZh || item.title}](${item.sourceUrl}) · ${item.company || "公司待补充"} · ${item.overallScore ?? "?"}/100`));
  lines.push("", "## 数据源健康", "", `- 正常来源：${current.healthySources}/${current.totalSources}`);
  for (const source of (site.sources ?? []).filter((item) => item.status === "error").slice(0, 10)) {
    lines.push(`- 待恢复：${source.name} · ${source.message || "未知错误"}`);
  }
  lines.push("", "> 本报告由公开来源自动汇总。岗位、论文、基金和人员状态应回到原始链接复核；软信号不等于公开招聘。", "");
  return lines;
}

function metricLine(label, value, baseline) {
  if (baseline === undefined) return `- ${label}：${value}`;
  const delta = Number(value) - Number(baseline);
  return `- ${label}：${value}（${delta > 0 ? "+" : ""}${delta}）`;
}

function findBaseline(snapshots, date, lookbackDays) {
  const threshold = new Date(date.getTime() - lookbackDays * 86400000).toISOString().slice(0, 10);
  return [...snapshots].filter((snapshot) => snapshot.date <= threshold).sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
}

function upsertSnapshot(snapshots, current) {
  const next = snapshots.filter((snapshot) => snapshot.date !== current.date);
  next.push(current);
  return next.sort((left, right) => left.date.localeCompare(right.date));
}

function topValues(values, limit = 8) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))).slice(0, limit);
}

function formatTopValues(values) {
  return values.map(([value, count]) => `${value} ${count}`).join("；") || "待补充";
}

function countProfileType(profiles, type) {
  return profiles.filter((profile) => profile.profileType === type).length;
}

function readArg(name) {
  const exact = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
