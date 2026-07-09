import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoPrivateFields } from "./lib/privacy.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const publicSite = await readJson("public/data/site.json");
const privateSite = await readJson("private/data/site.json");
const html = await readText("public/index.html");
const app = await readText("public/app.js");
const styles = await readText("public/styles.css");
const packageJson = await readJson("package.json");
const radarWorkflow = await readText(".github/workflows/radar.yml");
const weeklyWorkflow = await readText(".github/workflows/weekly-report.yml");
const deploymentDoc = await readText("docs/deployment.md");

const checks = [];

check("public build is public mode", publicSite.mode === "public");
check("private build is private mode", privateSite.mode === "private");
check("public build has no private fields", () => assertNoPrivateFields(publicSite));
check("default language is Chinese", html.includes('lang="zh-CN"'));
check("core pages are present", ["page-home", "page-radar", "page-routes", "page-cases", "page-calendar", "page-methods"].every((id) => html.includes(id)));
check("navigation matches PRD", ["首页", "机会雷达", "职业路线", "成功案例", "申请日历", "资源与方法"].every((label) => JSON.stringify(publicSite.copy.navigation).includes(label)));
check("home metrics are populated", ["totalJobs", "highMatchJobs", "dueSoonJobs", "activeSources", "totalSources"].every((key) => Number.isFinite(Number(publicSite.metrics[key]))));
check("opportunity radar permanent filters exist", ["search", "region", "roleType", "topic", "priority", "deadline", "stage"].every(hasFilter));
check("opportunity radar advanced filters exist", ["country", "sourceTrust", "timeline2029", "hostRequired", "funding", "visa", "teaching", "orientation"].every(hasFilter));
check("job detail has required sections", ["基本信息", "匹配分析", "研究方向", "申请信息", "行动记录", "关联人物和路径样本", "AI 分析", "原始文本和抓取记录"].every((text) => app.includes(text)));
check("case detail has background and route sections", ["职业路径摘要", "职业路线图", "背景表格", "可学习点", "风险提醒"].every((text) => app.includes(text)));
check("five career routes are present", Array.isArray(publicSite.routes) && publicSite.routes.length === 5);
check("career routes link jobs and cases in UI", ["代表机会", "相关案例", "route-linked", "linked-row"].every((text) => app.includes(text)));
check("calendar has fellowship and deadline data", Array.isArray(publicSite.calendar.fellowships) && publicSite.calendar.fellowships.length > 0 && Array.isArray(publicSite.calendar.deadlines));
check("private calendar has preparation plan", Boolean(privateSite.calendar?.preparationPlan));
check("people database has public evidence", (publicSite.people ?? []).every((person) => Array.isArray(person.evidence) && person.evidence.length > 0));
check("resource methodology is public", ["sourcePrinciple", "privacy", "aiNotice", "disclaimer"].every((key) => publicSite.copy.methodology?.[key]));
check("jobs have required public fields", (publicSite.jobs ?? []).every((job) => job.title && job.institution && job.region && job.roleType && job.sourceTrustLabelZh && (job.recordType === "watch_seed" || job.sourceUrl)));
check("A/B opportunities have reasons", (publicSite.jobs ?? []).filter((job) => ["A", "B"].includes(job.priority)).every((job) => job.simpleReason || job.ai?.summaryZh));
check("official and authoritative sources are represented", (publicSite.sources ?? []).some((source) => source.trust === "official") && (publicSite.sources ?? []).some((source) => source.trust === "academic_board"));
check("AI notices are present", JSON.stringify(publicSite).includes("AI 辅助生成，需核验"));
check("DeepSeek integration is wired", ["analyze", "analyze:private"].every((script) => packageJson.scripts?.[script]) && (await exists("scripts/analyze-deepseek.mjs")));
check("Feishu notification templates are wired", ["notify:daily", "notify:weekly", "notify:immediate"].every((script) => packageJson.scripts?.[script]));
check("GitHub Pages workflow is configured", radarWorkflow.includes("deploy-pages") && radarWorkflow.includes("npm run update"));
check("weekly report workflow is configured", weeklyWorkflow.includes("notify:weekly"));
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
