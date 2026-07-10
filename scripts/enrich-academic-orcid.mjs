import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAcademicTargets } from "./enrich-academic-openalex.mjs";
import { nameSimilarity } from "./lib/openalex.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(projectRoot, args.output ?? "data/research/orcid-academic-enrichment.json");
const { targets } = await loadAcademicTargets(projectRoot);
const selected = targets.filter((target) => target.explicitOrcid).slice(0, args.limit ?? Number.POSITIVE_INFINITY);
const existingDocument = args.reuseExisting ? await readExistingDocument(outputPath) : null;
const existingById = new Map((existingDocument?.profiles ?? []).map((profile) => [profile.internalId, profile]));
const profiles = [];

for (const [index, target] of selected.entries()) {
  const existing = existingById.get(target.internalId);
  if (existing?.author?.orcid === target.explicitOrcid && existing.resolution?.status === "confirmed") {
    console.log(`[${index + 1}/${selected.length}] ORCID: ${target.name} (reused)`);
    profiles.push(existing);
    continue;
  }
  console.log(`[${index + 1}/${selected.length}] ORCID: ${target.name}`);
  profiles.push(await enrichTarget(target));
  await delay(250);
}

const now = new Date().toISOString();
await writeJsonAtomically(outputPath, {
  schemaVersion: "1.0.0",
  provider: "ORCID",
  generatedAt: now,
  fetchedAt: latestDate(profiles.map((profile) => profile.fetchedAt)) ?? now,
  scopeNoteZh: "成果由作者 ORCID 公开记录与 Crossref 中带同一 ORCID 的 DOI 元数据合并，通常仍是论文量下界，不等同于完整论文总数。",
  profiles
});
console.log(`Wrote ${profiles.length} ORCID profiles to ${path.relative(projectRoot, outputPath)}.`);

async function enrichTarget(target) {
  const url = `https://pub.orcid.org/v3.0/${target.explicitOrcid}/record`;
  const response = await fetchWithRetry(url);
  const fetchedAt = new Date().toISOString();
  const observedName = orcidName(response.person?.name);
  const similarity = nameSimilarity(target.name, observedName);
  if (similarity < 0.8) {
    return {
      internalId: target.internalId,
      name: target.name,
      fetchedAt,
      resolution: {
        method: "explicit_orcid",
        status: "needs_review",
        confidence: "rejected_name_mismatch",
        reason: `ORCID name '${observedName}' does not match '${target.name}' closely enough.`
      },
      author: { orcid: target.explicitOrcid, orcidUrl: `https://orcid.org/${target.explicitOrcid}`, displayName: observedName },
      metrics: null,
      works: [],
      conceptTrends: []
    };
  }
  const groups = response["activities-summary"]?.works?.group ?? [];
  const orcidWorks = groups.map(normalizeWorkGroup).filter((work) => work.title);
  const crossrefWorks = await fetchCrossrefWorks(target.explicitOrcid);
  const works = mergeWorks(orcidWorks, crossrefWorks);
  const recentWorks = works.filter((work) => Number(work.publicationYear) >= 2022 && Number(work.publicationYear) <= 2026);
  return {
    internalId: target.internalId,
    sourceKind: target.sourceKind,
    sourceKinds: target.sourceKinds,
    sourceRecordIds: target.sourceRecordIds,
    name: target.name,
    fetchedAt,
    resolution: {
      method: "explicit_orcid",
      status: "confirmed",
      confidence: "exact_orcid_and_name",
      reason: "The tracked record supplied an ORCID and the public ORCID name matches."
    },
    author: {
      orcid: target.explicitOrcid,
      orcidUrl: `https://orcid.org/${target.explicitOrcid}`,
      displayName: observedName
    },
    metrics: {
      worksCount: works.length,
      recentWorksCount: recentWorks.length,
      citedByCount: null,
      hIndex: null,
      recent5Years: {
        fromYear: 2022,
        toYear: 2026,
        worksCount: recentWorks.length,
        yearly: [2022, 2023, 2024, 2025, 2026].map((year) => ({
          year,
          worksCount: recentWorks.filter((work) => work.publicationYear === year).length
        }))
      },
      countLabelZh: "ORCID / Crossref 关联成果记录",
      countCaveatZh: "合并作者 ORCID 公开记录与 Crossref 中明确携带同一 ORCID 的 DOI 元数据；去重后的记录通常仍是论文量下界。",
      sourceCounts: {
        orcidRecordCount: orcidWorks.length,
        crossrefOrcidWorksCount: crossrefWorks.length,
        mergedRecordCount: works.length,
        checkedAt: fetchedAt
      }
    },
    works,
    conceptTrends: buildTitleTrends(works),
    timeline: buildTimeline(response["activities-summary"])
  };
}

function buildTimeline(activities = {}) {
  const education = (activities.educations?.["affiliation-group"] ?? []).flatMap((group) => (
    (group.summaries ?? []).map((item) => item["education-summary"]).filter(Boolean)
  )).map((item) => ({
    type: "phd",
    degree: item["role-title"] ?? "Education",
    institution: item.organization?.name ?? null,
    department: item["department-name"] ?? null,
    startYear: item["start-date"]?.year?.value ?? null,
    endYear: item["end-date"]?.year?.value ?? null
  }));
  const employment = (activities.employments?.["affiliation-group"] ?? []).flatMap((group) => (
    (group.summaries ?? []).map((item) => item["employment-summary"]).filter(Boolean)
  )).map((item) => ({
    type: "current_position",
    role: item["role-title"] ?? "Employment",
    institution: item.organization?.name ?? null,
    department: item["department-name"] ?? null,
    startYear: item["start-date"]?.year?.value ?? null,
    endYear: item["end-date"]?.year?.value ?? null
  }));
  return [...education, ...employment];
}

function normalizeWorkGroup(group) {
  const summary = group["work-summary"]?.[0] ?? {};
  const externalIds = summary["external-ids"]?.["external-id"] ?? group["external-ids"]?.["external-id"] ?? [];
  const doi = externalIds.find((item) => String(item["external-id-type"]).toLowerCase() === "doi")?.["external-id-value"] ?? null;
  const year = Number(summary["publication-date"]?.year?.value) || null;
  const publicationDate = year
    ? [year, summary["publication-date"]?.month?.value, summary["publication-date"]?.day?.value].filter(Boolean).join("-")
    : null;
  const recent = year >= 2022 && year <= 2026;
  return {
    orcidPutCode: summary["put-code"] ?? null,
    title: summary.title?.title?.value ?? null,
    publicationYear: year,
    publicationDate,
    type: summary.type ?? null,
    doi: doi ? `https://doi.org/${doi}` : null,
    url: summary.url?.value ?? (doi ? `https://doi.org/${doi}` : null),
    source: summary["journal-title"]?.value ? { displayName: summary["journal-title"].value } : null,
    citedByCount: null,
    selectionReason: recent ? "recent" : "career_record",
    selectionReasons: [recent ? "recent" : "career_record"],
    isRecent: recent
  };
}

async function fetchCrossrefWorks(orcid) {
  const params = new URLSearchParams({
    filter: `orcid:${orcid}`,
    rows: "1000",
    select: "DOI,title,author,published,published-print,published-online,container-title,type,URL"
  });
  try {
    const payload = await fetchCrossrefWithRetry(`https://api.crossref.org/works?${params}`);
    return (payload.message?.items ?? []).map(normalizeCrossrefWork).filter((work) => work.title);
  } catch (error) {
    console.warn(`Crossref ORCID lookup skipped for ${orcid}: ${error.message}`);
    return [];
  }
}

function normalizeCrossrefWork(item) {
  const dateParts = item.published?.["date-parts"]?.[0]
    ?? item["published-online"]?.["date-parts"]?.[0]
    ?? item["published-print"]?.["date-parts"]?.[0]
    ?? [];
  const year = Number(dateParts[0]) || null;
  const publicationDate = year ? dateParts.filter(Boolean).join("-") : null;
  const recent = year >= 2022 && year <= 2026;
  const doi = item.DOI ? `https://doi.org/${String(item.DOI).toLowerCase()}` : null;
  return {
    title: item.title?.[0] ?? null,
    publicationYear: year,
    publicationDate,
    type: item.type === "posted-content" ? "preprint" : item.type,
    doi,
    url: item.URL ?? doi,
    source: item["container-title"]?.[0] ? { displayName: item["container-title"][0] } : null,
    citedByCount: null,
    selectionReason: recent ? "recent_crossref_orcid" : "crossref_orcid_record",
    selectionReasons: [recent ? "recent_crossref_orcid" : "crossref_orcid_record"],
    isRecent: recent
  };
}

function mergeWorks(orcidWorks, crossrefWorks) {
  const merged = new Map();
  for (const work of crossrefWorks) merged.set(workKey(work), work);
  for (const work of orcidWorks) {
    const key = workKey(work);
    const existing = merged.get(key);
    merged.set(key, existing ? {
      ...existing,
      ...work,
      source: work.source ?? existing.source,
      selectionReasons: [...new Set([...(existing.selectionReasons ?? []), ...(work.selectionReasons ?? [])])]
    } : work);
  }
  return [...merged.values()].sort((a, b) => (
    Number(b.publicationYear ?? 0) - Number(a.publicationYear ?? 0)
    || String(a.title).localeCompare(String(b.title))
  ));
}

function workKey(work) {
  return String(work.doi ?? `${work.title ?? ""}|${work.publicationYear ?? ""}`)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase();
}

function buildTitleTrends(works) {
  const categories = [
    ["Complementarity and variational inequalities", /complementarity|variational inequalit|equilibrium/i],
    ["Stochastic and robust optimization", /stochastic|distributionally robust|uncertaint|risk/i],
    ["Nonsmooth and nonconvex optimization", /nonsmooth|non-smooth|nonconvex|non-convex|smoothing/i],
    ["Numerical analysis and scientific computing", /numerical|spectral|finite element|linear algebra|matrix|tensor|pde/i],
    ["Machine learning optimization", /machine learning|neural|learning|classification|generative|adversarial/i],
    ["Operations research and decision systems", /supply chain|inventory|routing|scheduling|decision|operations research/i],
    ["Variational methods, imaging, and inverse problems", /variational|imaging|image|inverse|denois|wasserstein|optimal transport|regulari[sz]|phase field|curvature|fracture|surface/i],
    ["Control, energy, and network systems", /control|energy|power|grid|network|distributed|multi-agent|circuit|voltage/i],
    ["Queueing, service, and stochastic systems", /queue|service system|heavy-traffic|stationary flow|sequential|bandit/i],
    ["Algorithms and complexity", /algorithm|complexity|first-order|gradient|proximal|newton|splitting|accelerat/i],
    ["Scientific machine learning and dynamics", /koopman|dynamical|physics-informed|operator learning|transport equation|boltzmann/i],
    ["Discrete and mixed-integer optimization", /mixed-integer|integer programming|combinatorial|branch-and|cutting plane/i]
  ];
  const recent = works.filter((work) => work.isRecent);
  return categories.map(([displayName, pattern]) => {
    const recentMatches = recent.filter((work) => pattern.test(work.title ?? ""));
    const allMatches = works.filter((work) => pattern.test(work.title ?? ""));
    return {
      displayName,
      worksCount: recentMatches.length,
      citedByCount: null,
      shareOfWorks: recent.length ? Number((recentMatches.length / recent.length).toFixed(3)) : 0,
      trend: recentMatches.length >= Math.max(2, Math.ceil(allMatches.length * 0.25)) ? "rising_or_active" : "stable_or_low",
      yearly: [2022, 2023, 2024, 2025, 2026].map((year) => ({
        year,
        worksCount: recentMatches.filter((work) => work.publicationYear === year).length
      }))
    };
  }).filter((item) => item.worksCount > 0);
}

function orcidName(name = {}) {
  return [name["given-names"]?.value, name["family-name"]?.value].filter(Boolean).join(" ");
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "postdoc-faculty-radar/0.1" },
      signal: AbortSignal.timeout(30_000)
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 3) throw new Error(`ORCID request failed with HTTP ${response.status}: ${url}`);
    await delay((attempt + 1) * 1_000);
  }
}

async function fetchCrossrefWithRetry(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "postdoc-faculty-radar/0.1 (+https://github.com/DJCdjcDJC2000/postdoc-faculty-radar)"
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 3) throw new Error(`HTTP ${response.status}`);
    await delay((attempt + 1) * 1_000);
  }
}

function parseArgs(values) {
  const parsed = { output: null, limit: null, reuseExisting: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--output") parsed.output = values[++index];
    else if (value.startsWith("--output=")) parsed.output = value.slice(9);
    else if (value === "--limit") parsed.limit = Number(values[++index]);
    else if (value.startsWith("--limit=")) parsed.limit = Number(value.slice(8));
    else if (value === "--reuse-existing") parsed.reuseExisting = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (parsed.limit !== null && (!Number.isInteger(parsed.limit) || parsed.limit < 1)) throw new Error("--limit requires a positive integer");
  return parsed;
}

async function readExistingDocument(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function latestDate(values) {
  return values.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}
