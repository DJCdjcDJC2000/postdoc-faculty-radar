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
const profiles = [];

for (const [index, target] of selected.entries()) {
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
  scopeNoteZh: "ORCID 成果来自作者自关联或第三方同步记录，通常是论文量下界，不等同于完整论文总数。",
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
  const works = groups.map(normalizeWorkGroup).filter((work) => work.title);
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

function buildTitleTrends(works) {
  const categories = [
    ["Complementarity and variational inequalities", /complementarity|variational inequalit|equilibrium/i],
    ["Stochastic and robust optimization", /stochastic|distributionally robust|uncertaint|risk/i],
    ["Nonsmooth and nonconvex optimization", /nonsmooth|non-smooth|nonconvex|non-convex|smoothing/i],
    ["Numerical analysis and scientific computing", /numerical|spectral|finite element|linear algebra|matrix|tensor|pde/i],
    ["Machine learning optimization", /machine learning|neural|learning|classification|generative|adversarial/i],
    ["Operations research and decision systems", /supply chain|inventory|routing|scheduling|decision|operations research/i]
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

function parseArgs(values) {
  const parsed = { output: null, limit: null };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--output") parsed.output = values[++index];
    else if (value.startsWith("--output=")) parsed.output = value.slice(9);
    else if (value === "--limit") parsed.limit = Number(values[++index]);
    else if (value.startsWith("--limit=")) parsed.limit = Number(value.slice(8));
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (parsed.limit !== null && (!Number.isInteger(parsed.limit) || parsed.limit < 1)) throw new Error("--limit requires a positive integer");
  return parsed;
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
