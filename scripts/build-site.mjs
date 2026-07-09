import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson, copyFileEnsuringDir } from "./lib/read-write.mjs";
import { assertNoPrivateFields, stripPrivateFields } from "./lib/privacy.mjs";
import { buildAlerts, buildCalendar, enrichJobForSite } from "./lib/site-data.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = readArg("mode") ?? "public";
if (!["public", "private"].includes(mode)) {
  throw new Error(`Unsupported build mode: ${mode}`);
}

const outputDir = path.join(projectRoot, mode === "public" ? "public" : "private");
const siteSource = path.join(projectRoot, "src", "site");

const [
  jobsRaw,
  generatedAlerts,
  sourceStatuses,
  generatedMetadata,
  manualPeople,
  manualLabs,
  routes,
  publicProfileConfig,
  privateProfileConfig,
  siteCopy,
  publicAiIndex,
  privateAiIndex,
  privateStates,
  preparationPlan
] = await Promise.all([
  readJson(projectRoot, "data/generated/jobs.json", []),
  readJson(projectRoot, "data/generated/alerts.json", []),
  readJson(projectRoot, "data/generated/sources.json", []),
  readJson(projectRoot, "data/generated/metadata.json", {}),
  readJson(projectRoot, "data/manual/people.json", []),
  readJson(projectRoot, "data/manual/labs.json", []),
  readJson(projectRoot, "config/career-routes.json", []),
  readJson(projectRoot, "config/profile.json", {}),
  mode === "private" ? readJson(projectRoot, "config/profile.private.json", null) : null,
  readJson(projectRoot, "config/site-copy.json", {}),
  readJson(projectRoot, "data/ai/job-analysis.json", {}),
  mode === "private" ? readJson(projectRoot, "data/private/job-analysis.json", {}) : {},
  readPrivateJson("data/private/job-state.json", "data/private/job-state.example.json", []),
  readPrivateJson("data/private/preparation-plan.json", "data/private/preparation-plan.example.json", null)
]);

const profile = mergeProfile(publicProfileConfig, mode === "private" ? privateProfileConfig : null);
const aiIndex = mode === "private" ? { ...publicAiIndex, ...privateAiIndex } : publicAiIndex;
const privateByJobId = new Map(privateStates.map((item) => [item.jobId, item]));
const jobs = jobsRaw.map((job) => enrichJobForSite(
  job,
  aiIndex[job.id] ?? null,
  mode === "private" ? privateByJobId.get(job.id) ?? null : null
));

const people = manualPeople.map((person) => ({
  ...person,
  ai: person.ai ?? {
    status: "manual",
    notice: "AI 辅助生成，需核验",
    careerPathZh: person.pathSummaryZh ?? "等待补充公开职业路径。",
    learningsZh: person.learningsZh ?? [],
    risksZh: person.risksZh ?? []
  }
}));

const labs = manualLabs.map((lab) => ({
  ...lab,
  evidence: lab.evidence ?? [],
  fieldTags: lab.fieldTags ?? [],
  potentialRoutes: lab.potentialRoutes ?? [],
  representativeWorks: lab.representativeWorks ?? []
}));

const metadata = {
  ...generatedMetadata,
  builtAt: new Date().toISOString(),
  mode,
  title: siteCopy.title,
  publicBuild: mode === "public"
};

const siteData = {
  mode,
  copy: siteCopy,
  metadata,
  profile: mode === "public" ? publicProfile(profile) : profile,
  metrics: buildMetrics(jobs, sourceStatuses, people, labs),
  jobs,
  alerts: jobs.length ? buildAlerts(jobs) : generatedAlerts,
  people,
  labs,
  routes: routes.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
  sources: sourceStatuses,
  calendar: buildCalendar(
    jobs,
    mode === "private" ? privateStates : [],
    mode === "private" ? preparationPlan : null
  )
};

const outputData = mode === "public" ? stripPrivateFields(siteData) : siteData;
if (mode === "public") {
  assertNoPrivateFields(outputData);
}

await fs.mkdir(outputDir, { recursive: true });
for (const fileName of ["index.html", "app.js", "styles.css"]) {
  await copyFileEnsuringDir(path.join(siteSource, fileName), path.join(outputDir, fileName));
}

await writeJson(outputDir, "data/site.json", outputData);
await writeJson(outputDir, "data/jobs.json", outputData.jobs);
await writeJson(outputDir, "data/alerts.json", outputData.alerts);
await writeJson(outputDir, "data/people.json", outputData.people);
await writeJson(outputDir, "data/labs.json", outputData.labs);
await writeJson(outputDir, "data/routes.json", outputData.routes);
await writeJson(outputDir, "data/sources.json", outputData.sources);
await writeJson(outputDir, "data/metadata.json", outputData.metadata);
await fs.writeFile(path.join(outputDir, ".nojekyll"), "", "utf8");

console.log(`Built ${mode} site at ${outputDir}`);
console.log(`${outputData.jobs.length} jobs, ${outputData.alerts.length} alerts, ${outputData.people.length} people, ${outputData.labs.length} labs.`);

function readArg(name) {
  const eq = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function buildMetrics(jobs, sources, people, labs) {
  const abJobs = jobs.filter((job) => ["A", "B"].includes(job.priority) && job.recordType !== "watch_seed");
  const dueSoon = jobs.filter((job) => {
    const days = daysUntil(job.deadline);
    return days <= 30 && days >= 0;
  });
  const activeSources = sources.filter((source) => source.status === "ok");
  return {
    totalJobs: jobs.length,
    highMatchJobs: abJobs.length,
    dueSoonJobs: dueSoon.length,
    activeSources: activeSources.length,
    totalSources: sources.length,
    peopleCount: people.length,
    targetLabs: labs.length,
    activeLabSignals: labs.filter((lab) => String(lab.recruitmentStatus ?? "").includes("active")).length
  };
}

function publicProfile(profile) {
  return {
    publicAudience: profile.publicAudience,
    publicSummaryZh: profile.publicSummaryZh,
    researchFields: profile.researchProfile?.coreFields ?? [],
    careerPlanSummaryZh: "重点覆盖欧洲、香港、新加坡、内地和大厂研究岗，适用于应用数学、优化与科学计算方向的 PhD/Postdoc。"
  };
}

async function readPrivateJson(realPath, examplePath, fallback) {
  const realValue = await readJson(projectRoot, realPath, null);
  if (realValue !== null) return realValue;
  return readJson(projectRoot, examplePath, fallback);
}

function mergeProfile(publicProfileConfig, privateProfileConfig) {
  return {
    ...(publicProfileConfig ?? {}),
    ...(privateProfileConfig ?? {}),
    careerPlan: {
      ...(publicProfileConfig?.careerPlan ?? {}),
      ...(privateProfileConfig?.careerPlan ?? {})
    },
    researchProfile: {
      ...(publicProfileConfig?.researchProfile ?? {}),
      ...(privateProfileConfig?.researchProfile ?? {})
    }
  };
}

function daysUntil(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateValue}T23:59:59Z`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}
