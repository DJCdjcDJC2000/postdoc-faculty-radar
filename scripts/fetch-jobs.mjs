import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { compareByPriorityThenDate, dedupeJobs, extractDate, normalizeUrl, normalizeWhitespace, stableId } from "./lib/normalize.mjs";
import { findKeywordHits, inferRoleType, scoreJob } from "./lib/score.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const offline = process.argv.includes("--offline");
const generatedAt = new Date().toISOString();

const keywords = await readJson("config/keywords.json", {});
const sources = await readJson("config/sources.json", []);
const manualJobs = await readJson("data/manual/jobs.json", []);
const manualPeople = await readJson("data/manual/people.json", []);

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
const scoredJobs = dedupeJobs([...manualNormalized, ...liveJobs])
  .map((job) => {
    const score = scoreJob(job, keywords);
    return {
      ...job,
      ...score,
      id: job.id || stableId([job.title, job.institution, job.sourceUrl]),
      updatedAt: generatedAt
    };
  })
  .sort(compareByPriorityThenDate);

const alerts = scoredJobs
  .filter((job) => ["A", "B"].includes(job.priority))
  .slice(0, 30)
  .map((job) => ({
    id: job.id,
    title: job.title,
    institution: job.institution,
    region: job.region,
    roleType: job.roleType,
    priority: job.priority,
    matchScore: job.matchScore,
    sourceName: job.sourceName,
    sourceUrl: job.sourceUrl,
    reason: buildReason(job)
  }));

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

await writeJson("public/data/jobs.json", scoredJobs);
await writeJson("public/data/people.json", manualPeople);
await writeJson("public/data/alerts.json", alerts);
await writeJson("public/data/sources.json", sourceOutput);
await writeJson("public/data/metadata.json", {
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
      sourceUrl,
      originalSourceUrl: source.url,
      description: context.slice(0, 500),
      keywords: [...new Set([...hits.strong, ...hits.medium])],
      deadline,
      fieldRelevantSource: Boolean(source.fieldRelevant),
      status: "new",
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
  const hasFieldHit = hits.strong.length + hits.medium.length > 0;
  const isJobPath = /job|career|position|opening|vacanc|recruit|employment|postdoc|faculty|fellow/i.test(text);
  const companySource = source.sourceType === "company";
  return (hasRole && isJobPath) || (hasFieldHit && (isJobPath || companySource));
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

function buildReason(job) {
  const parts = [
    job.region,
    job.roleType,
    job.matchedKeywords?.slice(0, 4).join(", ")
  ].filter(Boolean);
  return parts.join(" | ");
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

async function readJson(relativePath, fallback) {
  try {
    const filePath = path.join(projectRoot, relativePath);
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(relativePath, value) {
  const filePath = path.join(projectRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
