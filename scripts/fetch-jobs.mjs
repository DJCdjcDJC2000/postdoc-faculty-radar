import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { compareByPriorityThenDate, dedupeJobs, extractDate, normalizeUrl, normalizeWhitespace, stableId } from "./lib/normalize.mjs";
import { findKeywordHits, inferRoleType, scoreJob } from "./lib/score.mjs";
import { readJson, writeJson } from "./lib/read-write.mjs";
import { buildAlerts, buildSimpleReason, labelForRole, labelForTrust } from "./lib/site-data.mjs";
import { reconcileJobHistory } from "./lib/job-history.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const offline = process.argv.includes("--offline");
const generatedAt = new Date().toISOString();

const keywords = await readJson(projectRoot, "config/keywords.json", {});
const sources = await readJson(projectRoot, "config/sources.json", []);
const manualJobs = await readJson(projectRoot, "data/manual/jobs.json", []);
const previousJobs = await readJson(projectRoot, "data/generated/jobs.json", []);

const sourceStatuses = [];
const liveJobs = [];

for (const source of sources.filter((item) => item.enabled !== false)) {
  if (offline) {
    sourceStatuses.push(statusFor(source, "skipped", "Offline run"));
    continue;
  }
  const result = await scanSource(source);
  sourceStatuses.push(result.status);
  liveJobs.push(...result.jobs);
}

const manualNormalized = manualJobs.map((job) => normalizeManualJob(job));
const currentJobs = dedupeJobs([...manualNormalized, ...liveJobs])
  .map((job) => {
    const score = scoreJob(job, keywords);
    return {
      ...job,
      ...score,
      roleLabelZh: labelForRole(job.roleType),
      sourceTrustLabelZh: labelForTrust(job.trust),
      simpleReason: buildSimpleReason({ ...job, ...score }),
      id: job.id || stableId([job.title, job.institution, job.sourceUrl]),
      updatedAt: generatedAt
    };
  })
  .filter(shouldKeepJob)
  .sort(compareByPriorityThenDate);

const sourceOutput = sources.map((source) => {
  const status = sourceStatuses.find((item) => item.id === source.id) ?? statusFor(source, "not_run", "Not run");
  return {
    id: source.id,
    name: source.name,
    region: source.region,
    url: source.url,
    trust: source.trust,
    sourceType: source.sourceType,
    ...status
  };
});

const scoredJobs = reconcileJobHistory({
  currentJobs,
  previousJobs,
  sources: sourceOutput,
  now: new Date(generatedAt),
  offline
}).sort(compareByPriorityThenDate);
const alerts = buildAlerts(scoredJobs);

await writeJson(projectRoot, "data/generated/jobs.json", scoredJobs);
await writeJson(projectRoot, "data/generated/alerts.json", alerts);
await writeJson(projectRoot, "data/generated/sources.json", sourceOutput);
await writeJson(projectRoot, "data/generated/metadata.json", {
  generatedAt,
  offline,
  jobCount: scoredJobs.length,
  alertCount: alerts.length,
  sourceCount: sourceOutput.length
});

console.log(`Generated ${scoredJobs.length} jobs, ${alerts.length} alerts, ${sourceOutput.length} source statuses.`);

async function scanSource(source) {
  const startedAt = Date.now();
  try {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "PostdocFacultyRadar/0.1 (+https://djcdjcdjc2000.github.io/)"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      return { jobs: [], status: statusFor(source, "error", `HTTP ${response.status}`, startedAt) };
    }

    const html = await response.text();
    const jobs = extractCandidatesFromHtml(source, html).slice(0, source.maxItems ?? 40);
    return {
      jobs,
      status: statusFor(source, jobs.length > 0 ? "ok" : "no_candidates", `${jobs.length} candidates`, startedAt, jobs.length)
    };
  } catch (error) {
    return { jobs: [], status: statusFor(source, "error", error.message, startedAt) };
  }
}

function extractCandidatesFromHtml(source, html) {
  const $ = load(html);
  $("script, style, noscript, svg").remove();
  const candidates = [];

  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const title = normalizeWhitespace(anchor.text());
    const href = anchor.attr("href");
    const sourceUrl = normalizeUrl(href, source.url);
    if (!sourceUrl || !title || title.length < 8 || title.length > 180) return;
    if (isNavigationNoise(title, sourceUrl)) return;
    if (sourceUrl === normalizeUrl(source.url)) return;

    const linkSignal = normalizeWhitespace([title, sourceUrl].join(" "));
    if (!looksRelevant(linkSignal, source)) return;

    const context = normalizeWhitespace([
      title,
      nearestContextText(anchor),
      sourceUrl
    ].join(" "));

    const roleType = inferRoleType(linkSignal, source.defaultRoleTypes, keywords);
    const deadline = extractDate(context);
    const hits = findKeywordHits(context, keywords);
    const job = {
      title,
      institution: source.name,
      department: "",
      region: source.region,
      country: source.country ?? source.region,
      roleType,
      track: roleType === "industry_research" || roleType === "research_engineer" ? "industry" : "academia",
      sourceName: source.name,
      sourceId: source.id,
      sourceUrl,
      originalSourceUrl: source.url,
      description: context.slice(0, 500),
      keywords: [...new Set([...hits.strong, ...hits.medium])],
      deadline,
      fieldRelevantSource: Boolean(source.fieldRelevant),
      status: "active",
      trust: source.trust,
      fetchedAt: generatedAt
    };
    candidates.push({
      ...job,
      id: stableId([job.title, job.sourceUrl])
    });
  });

  return dedupeJobs(candidates);
}

function looksRelevant(text, source) {
  const haystack = text.toLowerCase();
  const roleHints = Object.values(keywords.roleHints ?? {}).flat().map((item) => String(item).toLowerCase());
  const hasRole = roleHints.some((term) => haystack.includes(term));
  const hits = findKeywordHits(text, keywords);
  const hasCoreFieldHit = hits.strong.length + hits.medium.length > 0;
  const isJobPath = /job|career|position|opening|vacanc|recruit|employment|postdoc|faculty|fellow/i.test(text);
  const companySource = source.sourceType === "company";
  if (source.fieldRelevant) return (hasRole && isJobPath) || hasCoreFieldHit;
  return (hasRole && hasCoreFieldHit && isJobPath) || (companySource && hasCoreFieldHit);
}

function shouldKeepJob(job) {
  if (job.recordType === "watch_seed") return true;
  if (job.priority === "D") return false;
  if (job.relevance === "core") return true;
  if (["A", "B"].includes(job.priority)) return true;
  if (job.roleType === "fellowship" || job.track === "fellowship") return true;
  return Boolean(job.fieldRelevantSource && titleHasSpecificMathSignal(job.title));
}

function titleHasSpecificMathSignal(title) {
  return /applied mathematics|mathematical|optimization|optimisation|numerical|scientific computing|stochastic|variational|complementarity|operations research|research assistant professor|assistant professor|associate professor/i.test(title);
}

function isNavigationNoise(title, url) {
  const haystack = `${title} ${url}`.toLowerCase();
  const blockedExact = new Set([
    "login",
    "sign in",
    "privacy policy",
    "terms of use",
    "cookie policy",
    "contact us",
    "subscribe",
    "skip to main content",
    "start main content",
    "skip to content",
    "date placed",
    "closing date",
    "faculty profiles",
    "more about",
    "view details",
    "read more",
    "learn more",
    "中文",
    "english"
  ]);
  if (blockedExact.has(title.toLowerCase())) return true;
  if (/^(skip|start)\s+(to\s+)?main\s+content$/i.test(title)) return true;
  if (/^send me jobs/i.test(title)) return true;
  return /\/(login|privacy|terms|cookies|contact|about-us|sitemap)(\/|$)/i.test(haystack);
}

function nearestContextText(anchor) {
  const selectors = ["article", "li", "tr", ".job", ".position", ".vacancy", ".search-result", "div"];
  for (const selector of selectors) {
    const text = normalizeWhitespace(anchor.closest(selector).text());
    if (text && text.length > anchor.text().length && text.length < 900) {
      return text;
    }
  }
  return "";
}

function normalizeManualJob(job) {
  const roleType = job.roleType || inferRoleType(`${job.title} ${job.description}`, [], keywords);
  const normalized = {
    ...job,
    roleType,
    sourceName: job.sourceName || "Manual",
    sourceUrl: normalizeUrl(job.sourceUrl) || job.sourceUrl,
    trust: job.trust || "manual",
    fieldRelevantSource: Boolean(job.fieldRelevantSource),
    status: job.status || "watchlist",
    createdAt: job.createdAt || generatedAt
  };
  return {
    ...normalized,
    id: job.id || stableId([normalized.title, normalized.institution, normalized.sourceUrl])
  };
}

function statusFor(source, status, message, startedAt, count = 0) {
  return {
    id: source.id,
    status,
    message,
    count,
    checkedAt: generatedAt,
    latencyMs: startedAt ? Date.now() - startedAt : 0
  };
}
