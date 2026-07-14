import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoPrivateFields } from "./lib/privacy.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const publicSite = await readJson("public/data/site.json");
const html = await readText("public/index.html");
const app = await readText("public/app.js");
const styles = await readText("public/styles.css");
const packageJson = await readJson("package.json");
const radarWorkflow = await readText(".github/workflows/radar.yml");
const deploymentDoc = await readText("docs/deployment.md");
const peopleSpec = await readText("docs/people-intelligence-spec.md");
const peopleConfig = await readJson("config/people-intelligence.json");

const checks = [];

check("public build is public mode", publicSite.mode === "public");
check("public build has no private fields", () => assertNoPrivateFields(publicSite));
check("default language is Chinese", html.includes('lang="zh-CN"'));
check("core pages are present", ["page-home", "page-radar", "page-industry", "page-routes", "page-cases", "page-calendar", "page-methods"].every((id) => html.includes(id)));
check("navigation matches PRD", ["首页", "机会雷达", "产业雷达", "职业路线", "学术人物", "成功案例", "申请日历", "资源与方法"].every((label) => JSON.stringify(publicSite.copy.navigation).includes(label)));
check("home metrics are populated", ["totalJobs", "highMatchJobs", "dueSoonJobs", "activeSources", "totalSources"].every((key) => Number.isFinite(Number(publicSite.metrics[key]))));
check("opportunity radar permanent filters exist", ["search", "region", "roleType", "topic", "priority", "freshness", "deadline", "stage"].every(hasFilter));
check("opportunity radar advanced filters exist", ["country", "sourceTrust", "timeline2029", "hostRequired", "funding", "visa", "teaching", "orientation"].every(hasFilter));
check("job detail has required sections", ["基本信息", "匹配分析", "研究方向", "申请信息", "行动记录", "关联人物和路径样本", "AI 分析", "原始文本和抓取记录"].every((text) => app.includes(text)));
check("case detail has background and route sections", ["职业路径摘要", "职业路线图", "背景表格", "可学习点", "风险提醒"].every((text) => app.includes(text)));
check("five career routes are present", Array.isArray(publicSite.routes) && publicSite.routes.length === 5);
check("career routes link jobs and cases in UI", ["代表机会", "相关案例", "route-linked", "linked-row"].every((text) => app.includes(text)));
check("calendar has fellowship and deadline data", Array.isArray(publicSite.calendar.fellowships) && publicSite.calendar.fellowships.length > 0 && Array.isArray(publicSite.calendar.deadlines));
check("people database has public evidence", (publicSite.people ?? []).every((person) => Array.isArray(person.evidence) && person.evidence.length > 0));
const mentorProfiles = (publicSite.academic?.profiles ?? []).filter((profile) => profile.profileTypes?.includes("mentor_group"));
const trackedMentorCount = publicSite.academic?.overview?.byType?.find((item) => item.value === "mentor_group")?.count ?? 0;
const trackedYoungScholarCount = publicSite.academic?.overview?.byType?.find((item) => item.value === "young_scholar")?.count ?? 0;
const trackedRecruitmentSignals = new Map((publicSite.academic?.overview?.recruitmentSignals ?? []).map((item) => [item.value, item.count]));
check("target labs have priority-school coverage and public evidence", trackedMentorCount >= 50
  && (publicSite.labs ?? []).filter((lab) => lab.schoolScope?.includes("QS")).length >= 20
  && mentorProfiles.every((profile) => profile.links?.homepage && Array.isArray(profile.evidence) && profile.evidence.length > 0));
check("young scholar candidate pool reaches the confirmed scope", trackedYoungScholarCount >= 80);
check("target labs track distinct recruitment signals", mentorProfiles.every((profile) => Array.isArray(profile.recruitmentSignals) && profile.recruitmentSignals.length > 0)
  && mentorProfiles.some((profile) => profile.recruitmentSignals.some((signal) => signal.type === "official_opening"))
  && ["funded_expansion_signal", "accepts_applications", "fellowship_host"].every((type) => Number(trackedRecruitmentSignals.get(type) ?? 0) > 0));
check("industry radar first-release scope is present", (publicSite.industry?.companies ?? []).length >= 30 && (publicSite.industry?.people ?? []).length >= 50 && (publicSite.industry?.opportunities ?? []).length >= 20);
check("industry radar is team-level and source-backed", (publicSite.industry?.companies ?? []).flatMap((company) => company.teams ?? []).length >= 50 && (publicSite.industry?.opportunities ?? []).every((item) => item.sourceUrl && item.confidence));
check("industry salary, skills, and path samples are present", (publicSite.industry?.salaryBenchmarks ?? []).length >= 10 && (publicSite.industry?.skillDemand ?? []).length >= 10 && (publicSite.industry?.anonymousPaths ?? []).length >= 20);
check("industry page has filters, comparisons, and five-dimension scores", ["data-industry-filter", "data-compare-company-id", "data-compare-opportunity-id", "研究匹配", "薪资吸引力", "入职可行性", "身份/语言风险"].every((text) => app.includes(text)));
check("public industry build excludes personal gap", !publicSite.industry?.private);
check("public academic intelligence contract is present", publicSite.academic?.schemaVersion === 2
  && publicSite.academic?.qualityGate?.enforced === true
  && Array.isArray(publicSite.academic?.profiles)
  && publicSite.academic.profiles.every((profile) => profile.quality?.isPublicReady === true)
  && Boolean(publicSite.academic?.qualityGate?.minimumProfile));
check("soft recruitment evidence is distinct from official openings", ["funded_expansion_signal", "accepts_applications", "fellowship_host"].every((id) => peopleConfig.recruitmentSignals?.some((item) => item.id === id && item.countsAsOpen === false)));
check("private analysis is assigned to a separate private repository", peopleSpec.includes("独立 GitHub 私有仓库") && peopleSpec.includes("公共构建和公共仓库不得包含私有字段"));
check("resource methodology is public", ["sourcePrinciple", "privacy", "aiNotice", "disclaimer"].every((key) => publicSite.copy.methodology?.[key]));
check("jobs have required public fields", (publicSite.jobs ?? []).every((job) => job.title && job.institution && job.region && job.roleType && job.sourceTrustLabelZh && (job.recordType === "watch_seed" || job.sourceUrl)));
check("A/B opportunities have reasons", (publicSite.jobs ?? []).filter((job) => ["A", "B"].includes(job.priority)).every((job) => job.simpleReason || job.ai?.summaryZh));
check("official and authoritative sources are represented", (publicSite.sources ?? []).some((source) => source.trust === "official") && (publicSite.sources ?? []).some((source) => source.trust === "academic_board"));
check("AI notices are present", JSON.stringify(publicSite).includes("AI 辅助生成，需核验"));
check("DeepSeek integration is wired", ["analyze", "analyze:private"].every((script) => packageJson.scripts?.[script]) && (await exists("scripts/analyze-deepseek.mjs")));
check("Feishu notification templates are wired", ["notify:daily", "notify:weekly", "notify:immediate"].every((script) => packageJson.scripts?.[script]));
check("weekly change feed is present", publicSite.updates?.windowDays === 7 && ["newCount", "updatedCount", "expiredCount"].every((key) => Number.isFinite(Number(publicSite.updates[key]))));
check("GitHub Pages workflow is configured", radarWorkflow.includes("deploy-pages") && radarWorkflow.includes("npm run update:light") && radarWorkflow.includes("npm run update:weekly"));
check(
  "main pushes deploy without recursive data updates",
  radarWorkflow.includes("push:") &&
    radarWorkflow.includes("branches:") &&
    radarWorkflow.includes("github.event_name != 'push'") &&
    radarWorkflow.includes("Build pushed revision")
);
check("weekly Feishu and GitHub reports are configured", radarWorkflow.includes("notify:weekly") && radarWorkflow.includes("actions/github-script"));
check("independent Vercel production deployment is documented", deploymentDoc.includes("postdoc-faculty-radar-public.vercel.app") && deploymentDoc.includes("postdoc-faculty-radar-public"));
check("EdgeOne deployment instructions exist", deploymentDoc.includes("EdgeOne Pages") && deploymentDoc.includes("public"));
check("core resources avoid external CDN/runtime dependencies", !externalRuntimePattern().test([html, app, styles].join("\n")));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.ok && item.error) console.log(`  ${item.error}`);
}

if (failed.length) {
  throw new Error(`Acceptance verification failed: ${failed.length} check(s).`);
}

console.log(`Acceptance verification passed: ${checks.length} checks.`);

function check(name, condition) {
  try {
    const result = typeof condition === "function" ? condition() : condition;
    checks.push({ name, ok: result === undefined ? true : Boolean(result) });
  } catch (error) {
    checks.push({ name, ok: false, error: error.message });
  }
}

async function readText(relativePath) {
  return fs.readFile(path.join(projectRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

function externalRuntimePattern() {
  return /https?:\/\/(cdn|unpkg|jsdelivr|fonts\.google|raw\.githubusercontent)|<script[^>]+src="https?:\/\/|<link[^>]+href="https?:\/\//i;
}

function hasFilter(name) {
  return app.includes(`data-filter="${name}"`)
    || app.includes(`filterInput("${name}"`)
    || app.includes(`filterSelect("${name}"`);
}
