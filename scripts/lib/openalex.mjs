import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "https://api.openalex.org";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WORK_FIELDS = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "publication_date",
  "type",
  "cited_by_count",
  "authorships",
  "primary_location",
  "best_oa_location",
  "topics",
  "keywords",
  "open_access",
  "ids"
].join(",");

const INSTITUTION_ALIASES = [
  [/\b(eth( zurich)?|swiss federal institute of technology( zurich)?)\b/i, "eth zurich"],
  [/\b(epfl|ecole polytechnique federale de lausanne)\b/i, "epfl"],
  [/\b(national university of singapore|nus)\b/i, "national university singapore"],
  [/\b(chinese university of hong kong|cuhk)\b/i, "chinese university hong kong"],
  [/\b(hong kong university of science and technology|hkust)\b/i, "hong kong university science technology"],
  [/\b(the university of hong kong|university of hong kong|hku)\b/i, "university hong kong"],
  [/\b(hong kong polytechnic university|polyu)\b/i, "hong kong polytechnic university"],
  [/\b(massachusetts institute of technology|mit sloan school of management|mit)\b/i, "massachusetts institute technology"],
  [/\b(technical university of munich|tum)\b/i, "technical university munich"],
  [/\b(university of california,? berkeley|uc berkeley)\b/i, "university california berkeley"],
  [/\b(university of pennsylvania|upenn|wharton)\b/i, "university pennsylvania"],
  [/\b(imperial college london|imperial college)\b/i, "imperial college london"]
];

const INSTITUTION_STOP_WORDS = new Set([
  "and",
  "at",
  "college",
  "department",
  "faculty",
  "institute",
  "of",
  "school",
  "the",
  "university"
]);

export function normalizeOpenAlexId(value, entityPrefix = "A") {
  if (!value) return null;
  const normalized = String(value).trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const match = normalized.match(/(?:^|\/)([A-Z]\d+)$/i);
  if (!match) return null;
  const id = match[1].toUpperCase();
  return id.startsWith(String(entityPrefix).toUpperCase()) ? id : null;
}

export function buildAcademicTargets(labs = [], people = [], identityConfig = {}) {
  const sourceTargets = [
    ...labs.map((item) => buildTarget(item, "lab")),
    ...people.map((item) => buildTarget(item, "person"))
  ];
  const seen = new Set();
  for (const target of sourceTargets) {
    if (seen.has(target.internalId)) {
      throw new Error(`Duplicate academic internal ID: ${target.internalId}`);
    }
    seen.add(target.internalId);
  }

  const identityByAlias = buildIdentityAliasMap(identityConfig);
  const mergedTargets = new Map();
  for (const target of sourceTargets) {
    const identity = identityByAlias.get(`${target.sourceKind}:${target.internalId}`);
    const canonicalTarget = {
      ...target,
      internalId: identity?.id ?? target.internalId,
      name: identity?.name ?? target.name,
      sourceKinds: [target.sourceKind],
      sourceRecordIds: {
        labs: target.sourceKind === "lab" ? [target.internalId] : [],
        people: target.sourceKind === "person" ? [target.internalId] : []
      }
    };
    const existing = mergedTargets.get(canonicalTarget.internalId);
    mergedTargets.set(
      canonicalTarget.internalId,
      existing ? mergeAcademicTargets(existing, canonicalTarget) : canonicalTarget
    );
  }

  const targets = [...mergedTargets.values()].map((target) => ({
    ...target,
    sourceKind: target.sourceKinds.length > 1 ? "lab_and_person" : target.sourceKinds[0]
  }));
  const roster = targets.map((target) => target.name).filter(Boolean);
  return targets.map((target) => ({
    ...target,
    trackedPeerNames: roster.filter(
      (name) => normalizePersonName(name) !== normalizePersonName(target.name)
    )
  }));
}

export function normalizePersonName(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

export function nameSimilarity(left, right) {
  const leftTokens = personNameTokens(left);
  const rightTokens = personNameTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  if (leftTokens.join(" ") === rightTokens.join(" ")) return 1;
  if (sortedTokens(leftTokens) === sortedTokens(rightTokens)) return 0.98;

  const leftFirst = leftTokens[0];
  const rightFirst = rightTokens[0];
  const sameSurname = leftTokens.at(-1) === rightTokens.at(-1);
  const compatibleGivenName = tokenCompatible(leftFirst, rightFirst);
  if (sameSurname && compatibleGivenName) {
    return leftTokens.length === rightTokens.length ? 0.94 : 0.9;
  }

  const overlap = jaccard(leftTokens, rightTokens);
  return overlap >= 0.5 ? overlap * 0.8 : overlap * 0.5;
}

export function institutionSimilarity(left, right) {
  const normalizedLeft = canonicalInstitution(left);
  const normalizedRight = canonicalInstitution(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 0.92;
  }

  const leftTokens = meaningfulInstitutionTokens(normalizedLeft);
  const rightTokens = meaningfulInstitutionTokens(normalizedRight);
  const overlap = jaccard(leftTokens, rightTokens);
  const leftAcronym = institutionAcronym(normalizedLeft);
  const rightAcronym = institutionAcronym(normalizedRight);
  const acronymMatch = leftAcronym.length >= 2 && leftAcronym === rightAcronym;
  return Math.min(1, acronymMatch ? Math.max(overlap, 0.85) : overlap);
}

export function hydrateAuthorCandidate(author = {}, works = []) {
  const authorId = normalizeOpenAlexId(author.id);
  const institutions = uniqueByName([
    ...(author.last_known_institutions ?? []),
    author.last_known_institution,
    ...(author.affiliations ?? []).map((item) => item.institution),
    ...works.flatMap((work) => institutionsForAuthor(work, authorId))
  ].filter(Boolean));
  const topics = aggregateNamedValues([
    ...(author.topics ?? []),
    ...(author.x_concepts ?? []),
    ...works.flatMap((work) => work.topics ?? work.concepts ?? [])
  ]);
  const coauthors = aggregateCoauthors(works, authorId);

  return {
    ...author,
    evidenceInstitutions: institutions,
    evidenceTopics: topics,
    evidenceCoauthors: coauthors
  };
}

export function scoreAuthorCandidate(target, candidate = {}) {
  const displayName = candidate.display_name ?? candidate.displayName ?? "";
  const nameMatch = nameSimilarity(target.name, displayName);
  const institutions = extractInstitutionNames(candidate);
  const expectedInstitutions = target.officialInstitutions ?? [target.officialInstitution].filter(Boolean);
  const institutionMatch = bestInstitutionMatch(expectedInstitutions, institutions);
  const topics = extractNamedEvidence(candidate.evidenceTopics ?? candidate.topics ?? candidate.x_concepts);
  const topicMatch = matchTopics(target.topicHints ?? [], topics);
  const coauthors = extractNamedEvidence(candidate.evidenceCoauthors);
  const collaboratorMatch = matchCollaborators(
    target.collaboratorHints ?? [],
    target.trackedPeerNames ?? [],
    coauthors
  );

  const score = {
    name: Math.round(nameMatch * 40),
    institution: Math.round(institutionMatch.similarity * 30),
    collaborator: collaboratorMatch.score,
    topic: Math.round(topicMatch.similarity * 25)
  };
  score.total = Math.min(100, score.name + score.institution + score.collaborator + score.topic);

  const independentSignals = [];
  if (score.institution >= 12) independentSignals.push("official_institution");
  if (score.collaborator >= 6) independentSignals.push("collaborator");
  if (score.topic >= 10) independentSignals.push("topic");

  return {
    ...candidate,
    score,
    evidence: {
      name: {
        expected: target.name,
        observed: displayName,
        similarity: round(nameMatch),
        matched: nameMatch >= 0.8
      },
      officialInstitution: {
        expected: expectedInstitutions,
        observed: institutions,
        matchedExpected: institutionMatch.expected,
        bestMatch: institutionMatch.name,
        similarity: round(institutionMatch.similarity),
        matched: score.institution >= 12
      },
      collaborators: {
        explicitHints: target.collaboratorHints ?? [],
        trackedPeerMatches: collaboratorMatch.trackedPeerMatches,
        explicitMatches: collaboratorMatch.explicitMatches,
        observed: coauthors.slice(0, 20),
        matched: score.collaborator >= 6
      },
      topics: {
        expected: target.topicHints ?? [],
        observed: topics.slice(0, 20),
        matches: topicMatch.matches,
        similarity: round(topicMatch.similarity),
        matched: score.topic >= 10
      },
      independentSignals
    },
    autoConfirmEligible: score.name >= 32 && independentSignals.length > 0 && score.total >= 65
  };
}

export function rankAuthorCandidates(target, candidates = []) {
  return candidates
    .map((candidate) => scoreAuthorCandidate(target, candidate))
    .sort((left, right) => (
      right.score.total - left.score.total
      || right.score.institution - left.score.institution
      || right.score.topic - left.score.topic
      || Number(right.cited_by_count ?? 0) - Number(left.cited_by_count ?? 0)
      || String(left.id ?? "").localeCompare(String(right.id ?? ""))
    ));
}

export function chooseAuthorCandidate(scoredCandidates = [], options = {}) {
  const threshold = Number(options.threshold ?? 65);
  const minimumMargin = Number(options.minimumMargin ?? 8);
  const [top, runnerUp] = scoredCandidates;
  if (!top) {
    return {
      status: "no_candidates",
      selectedOpenAlexId: null,
      confidence: "none",
      margin: null
    };
  }

  const margin = runnerUp ? top.score.total - runnerUp.score.total : top.score.total;
  const confirmed = top.autoConfirmEligible
    && top.score.total >= threshold
    && margin >= minimumMargin;
  return {
    status: confirmed ? "auto_confirmed" : "needs_review",
    selectedOpenAlexId: confirmed ? normalizeOpenAlexId(top.id) : null,
    confidence: confirmed ? confidenceForScore(top.score.total) : "unconfirmed",
    margin,
    topCandidateOpenAlexId: normalizeOpenAlexId(top.id),
    reason: confirmed
      ? `score ${top.score.total}, margin ${margin}, evidence ${top.evidence.independentSignals.join(", ")}`
      : resolutionReviewReason(top, margin, threshold, minimumMargin)
  };
}

export function summarizeAuthorCandidate(candidate = {}) {
  const institutions = extractInstitutionNames(candidate);
  const topics = extractNamedEvidence(candidate.evidenceTopics ?? candidate.topics ?? candidate.x_concepts);
  const coauthors = extractNamedEvidence(candidate.evidenceCoauthors);
  return {
    openAlexId: normalizeOpenAlexId(candidate.id),
    openAlexUrl: openAlexEntityUrl(candidate.id),
    displayName: candidate.display_name ?? candidate.displayName ?? null,
    orcid: candidate.orcid ?? candidate.ids?.orcid ?? null,
    worksCount: Number(candidate.works_count ?? 0),
    citedByCount: Number(candidate.cited_by_count ?? 0),
    institutions,
    topics: topics.slice(0, 20),
    coauthors: coauthors.slice(0, 20),
    score: candidate.score ?? null,
    evidence: candidate.evidence ?? null,
    autoConfirmEligible: Boolean(candidate.autoConfirmEligible)
  };
}

export function buildAuthorMetrics(author = {}, works = [], referenceYear = new Date().getUTCFullYear()) {
  const summary = author.summary_stats ?? {};
  const recent5Years = calculateRecentFiveYearMetrics(author, works, referenceYear);
  const worksCount = Number(author.works_count ?? 0);
  const citedByCount = Number(author.cited_by_count ?? 0);
  const hIndex = nullableNumber(summary.h_index);
  return {
    worksCount,
    citedByCount,
    hIndex,
    recentWorksCount: recent5Years.worksCount,
    career: {
      worksCount,
      citedByCount,
      hIndex,
      i10Index: nullableNumber(summary.i10_index),
      twoYearMeanCitedness: nullableNumber(summary["2yr_mean_citedness"]),
      countsByYear: normalizeCountsByYear(author.counts_by_year)
    },
    recent5Years
  };
}

export function calculateRecentFiveYearMetrics(author = {}, works = [], referenceYear = new Date().getUTCFullYear()) {
  const toYear = Number(referenceYear);
  const fromYear = toYear - 4;
  const countsByYear = new Map(
    normalizeCountsByYear(author.counts_by_year).map((item) => [item.year, item])
  );
  const windowWorks = works.filter((work) => {
    const year = Number(work.publication_year ?? work.publicationYear);
    return year >= fromYear && year <= toYear;
  });
  const yearly = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    const source = countsByYear.get(year);
    yearly.push({
      year,
      worksCount: Number(source?.worksCount ?? windowWorks.filter((work) => Number(work.publication_year ?? work.publicationYear) === year).length),
      citationsReceived: Number(source?.citedByCount ?? 0)
    });
  }

  const authorId = normalizeOpenAlexId(author.id);
  const worksCount = yearly.reduce((total, item) => total + item.worksCount, 0);
  const citationsReceivedDuringWindow = yearly.reduce((total, item) => total + item.citationsReceived, 0);
  const currentCitationsToWindowWorks = windowWorks.reduce(
    (total, work) => total + Number(work.cited_by_count ?? work.citedByCount ?? 0),
    0
  );
  const roles = windowWorks.map((work) => authorshipRoleFor(work, authorId));

  return {
    fromYear,
    toYear,
    worksCount: worksCount || windowWorks.length,
    fetchedWorksCount: windowWorks.length,
    citationsReceivedDuringWindow,
    currentCitationsToWindowWorks,
    meanCurrentCitationsPerWork: windowWorks.length
      ? round(currentCitationsToWindowWorks / windowWorks.length, 2)
      : 0,
    hIndexForWindowWorks: calculateHIndex(windowWorks.map((work) => Number(work.cited_by_count ?? work.citedByCount ?? 0))),
    firstAuthorWorks: roles.filter((role) => role.position === "first").length,
    middleAuthorWorks: roles.filter((role) => role.position === "middle").length,
    lastAuthorWorks: roles.filter((role) => role.position === "last").length,
    correspondingAuthorWorks: roles.filter((role) => role.isCorresponding).length,
    unknownAuthorshipRoleWorks: roles.filter((role) => !role.position).length,
    yearly
  };
}

export function mergeWorkSelections(careerHighlights = [], recentWorks = []) {
  const selected = new Map();
  const addWorks = (works, reason) => {
    for (const work of works) {
      const key = normalizeOpenAlexId(work.id, "W") ?? work.doi ?? normalizeText(work.title ?? work.display_name);
      if (!key) continue;
      const existing = selected.get(key);
      if (existing) {
        if (!existing.selectionReasons.includes(reason)) existing.selectionReasons.push(reason);
        continue;
      }
      selected.set(key, {
        work,
        selectionReason: reason,
        selectionReasons: [reason]
      });
    }
  };
  addWorks(careerHighlights, "career_highlight");
  addWorks(recentWorks, "recent");
  return [...selected.values()];
}

export function normalizeOpenAlexWork(work = {}, authorId) {
  const role = authorshipRoleFor(work, normalizeOpenAlexId(authorId));
  const source = work.primary_location?.source ?? work.best_oa_location?.source;
  return {
    openAlexId: normalizeOpenAlexId(work.id, "W"),
    openAlexUrl: openAlexEntityUrl(work.id),
    doi: work.doi ?? work.ids?.doi ?? null,
    title: work.title ?? work.display_name ?? null,
    publicationYear: nullableNumber(work.publication_year),
    publicationDate: work.publication_date ?? null,
    type: work.type ?? null,
    citedByCount: Number(work.cited_by_count ?? 0),
    source: source ? {
      id: normalizeOpenAlexId(source.id, "S"),
      displayName: source.display_name ?? null,
      issnL: source.issn_l ?? null
    } : null,
    openAccess: work.open_access ?? null,
    authorship: role,
    coauthors: (work.authorships ?? [])
      .filter((item) => normalizeOpenAlexId(item.author?.id) !== normalizeOpenAlexId(authorId))
      .map((item) => ({
        openAlexId: normalizeOpenAlexId(item.author?.id),
        displayName: item.author?.display_name ?? item.raw_author_name ?? null
      }))
      .filter((item) => item.displayName),
    topics: (work.topics ?? work.concepts ?? []).slice(0, 10).map((topic) => ({
      id: normalizeOpenAlexId(topic.id, "T") ?? topic.id ?? null,
      displayName: topic.display_name ?? topic.name ?? null,
      score: nullableNumber(topic.score),
      domain: topic.domain?.display_name ?? null,
      field: topic.field?.display_name ?? null,
      subfield: topic.subfield?.display_name ?? null
    }))
  };
}

export function buildConceptTrends(works = [], options = {}) {
  const fromYear = Number(options.fromYear ?? new Date().getUTCFullYear() - 4);
  const toYear = Number(options.toYear ?? fromYear + 4);
  const limit = Number(options.limit ?? 20);
  const windowWorks = works.filter((work) => {
    const year = Number(work.publication_year ?? work.publicationYear);
    return year >= fromYear && year <= toYear;
  });
  const concepts = new Map();

  for (const work of windowWorks) {
    const year = Number(work.publication_year ?? work.publicationYear);
    const citedByCount = Number(work.cited_by_count ?? work.citedByCount ?? 0);
    const seenForWork = new Set();
    for (const topic of work.topics ?? work.concepts ?? []) {
      const displayName = topic.display_name ?? topic.displayName ?? topic.name;
      if (!displayName) continue;
      const id = topic.id ?? normalizeText(displayName);
      if (seenForWork.has(id)) continue;
      seenForWork.add(id);
      const current = concepts.get(id) ?? {
        topicId: normalizeOpenAlexId(id, "T") ?? id,
        displayName,
        domain: topic.domain?.display_name ?? topic.domain ?? null,
        field: topic.field?.display_name ?? topic.field ?? null,
        subfield: topic.subfield?.display_name ?? topic.subfield ?? null,
        worksCount: 0,
        citedByCount: 0,
        weightedScore: 0,
        yearCounts: new Map()
      };
      current.worksCount += 1;
      current.citedByCount += citedByCount;
      current.weightedScore += Number(topic.score ?? 1);
      current.yearCounts.set(year, (current.yearCounts.get(year) ?? 0) + 1);
      concepts.set(id, current);
    }
  }

  return [...concepts.values()]
    .sort((left, right) => (
      right.worksCount - left.worksCount
      || right.weightedScore - left.weightedScore
      || right.citedByCount - left.citedByCount
      || left.displayName.localeCompare(right.displayName)
    ))
    .slice(0, limit)
    .map((concept) => {
      const yearly = [];
      for (let year = fromYear; year <= toYear; year += 1) {
        yearly.push({ year, worksCount: concept.yearCounts.get(year) ?? 0 });
      }
      return {
        topicId: concept.topicId,
        displayName: concept.displayName,
        domain: concept.domain,
        field: concept.field,
        subfield: concept.subfield,
        worksCount: concept.worksCount,
        citedByCount: concept.citedByCount,
        weightedScore: round(concept.weightedScore, 3),
        shareOfWorks: windowWorks.length ? round(concept.worksCount / windowWorks.length, 4) : 0,
        trend: conceptTrend(yearly),
        yearly
      };
    });
}

export function calculateHIndex(citations = []) {
  const sorted = citations.map(Number).filter(Number.isFinite).sort((left, right) => right - left);
  let hIndex = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] < index + 1) break;
    hIndex = index + 1;
  }
  return hIndex;
}

export function createOpenAlexUrl(endpoint, params = {}, options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const url = new URL(endpoint.startsWith("/") ? endpoint : `/${endpoint}`, baseUrl);
  for (const [key, value] of Object.entries(params).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join("|") : String(value));
  }
  if (options.apiKey) url.searchParams.set("api_key", options.apiKey);
  if (options.mailto) url.searchParams.set("mailto", options.mailto);
  return url;
}

export function buildOpenAlexCacheKey(endpoint, params = {}) {
  const publicParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => !["api_key", "mailto"].includes(key))
  );
  const publicUrl = createOpenAlexUrl(endpoint, publicParams).toString();
  return createHash("sha256").update(publicUrl).digest("hex");
}

export function retryDelayMs(attempt, retryAfter, options = {}) {
  const baseDelayMs = Number(options.baseDelayMs ?? 750);
  const maximumDelayMs = Number(options.maximumDelayMs ?? 30_000);
  const randomValue = Number(options.randomValue ?? 0.5);
  const nowMs = Number(options.nowMs ?? Date.now());
  const retryAfterMs = parseRetryAfter(retryAfter, nowMs);
  if (retryAfterMs !== null) return Math.min(maximumDelayMs, Math.max(0, retryAfterMs));
  const exponential = baseDelayMs * (2 ** Math.max(0, Number(attempt)));
  const jitter = exponential * 0.2 * Math.max(0, Math.min(1, randomValue));
  return Math.min(maximumDelayMs, Math.round(exponential + jitter));
}

export function parseOpenAlexArguments(args = []) {
  const result = { output: null, dryRun: true, explicitOnly: false, limit: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") continue;
    if (argument === "--explicit-only") {
      result.explicitOnly = true;
      continue;
    }
    if (argument === "--limit") {
      const limit = Number(args[index + 1]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit requires a positive integer");
      result.limit = limit;
      index += 1;
      continue;
    }
    if (argument.startsWith("--limit=")) {
      const limit = Number(argument.slice("--limit=".length));
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit requires a positive integer");
      result.limit = limit;
      continue;
    }
    if (["--help", "-h"].includes(argument)) {
      result.help = true;
      continue;
    }
    if (argument === "--output") {
      const output = args[index + 1];
      if (!output || output.startsWith("--")) throw new Error("--output requires a file path");
      result.output = output;
      index += 1;
      continue;
    }
    if (argument.startsWith("--output=")) {
      const output = argument.slice("--output=".length);
      if (!output) throw new Error("--output requires a file path");
      result.output = output;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}. Use --help for supported options.`);
  }
  return result;
}

export function openAlexHelpText() {
  return [
    "Usage: npm run enrich:academic:openalex -- [--output <file>] [--explicit-only] [--limit <count>]",
    "",
    "Reads data/manual/labs.json and data/manual/people.json, then writes a dry-run OpenAlex research artifact.",
    "",
    "Options:",
    "  --output <file>  Write to another path (default: output/research/openalex-academic.json)",
    "  --dry-run        Explicitly select the default non-mutating mode",
    "  --explicit-only  Enrich only records with a pre-verified OpenAlex author ID",
    "  --limit <count>  Process only the first count selected records (useful for resumable batches)",
    "  --help, -h       Show this help",
    "",
    "Environment:",
    "  OPENALEX_API_KEY  Optional OpenAlex API key",
    "  OPENALEX_MAILTO   Optional contact email for polite API requests",
    "",
    "Manual data is never modified. Environment variable values are never printed."
  ].join("\n");
}

export async function writeJsonAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export class OpenAlexClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENALEX_API_KEY ?? "";
    this.mailto = options.mailto ?? process.env.OPENALEX_MAILTO ?? "";
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.cacheDir = options.cacheDir;
    this.cacheTtlMs = Number(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.minimumIntervalMs = Number(options.minimumIntervalMs ?? 150);
    this.maximumRetries = Number(options.maximumRetries ?? 5);
    this.timeoutMs = Number(options.timeoutMs ?? 30_000);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? delay;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.lastRequestAt = 0;
    this.userAgent = options.userAgent ?? politeUserAgent(this.mailto);
  }

  async searchAuthors(name, options = {}) {
    return this.request("/authors", {
      search: name,
      per_page: Number(options.perPage ?? 10)
    });
  }

  async getAuthor(authorId) {
    const normalized = normalizeOpenAlexId(authorId);
    if (!normalized) throw new Error(`Invalid OpenAlex author ID: ${authorId}`);
    return this.request(`/authors/${normalized}`);
  }

  async getAuthorWorkSample(authorId, options = {}) {
    return this.getAuthorCareerHighlights(authorId, {
      limit: Number(options.perPage ?? 20)
    });
  }

  async getAuthorCareerHighlights(authorId, options = {}) {
    const normalized = normalizeOpenAlexId(authorId);
    if (!normalized) throw new Error(`Invalid OpenAlex author ID: ${authorId}`);
    return this.request("/works", {
      filter: `authorships.author.id:${normalized}`,
      include_xpac: "true",
      per_page: Number(options.limit ?? 12),
      select: DEFAULT_WORK_FIELDS,
      sort: "cited_by_count:desc"
    });
  }

  async getWorksForAuthor(authorId, options = {}) {
    const normalized = normalizeOpenAlexId(authorId);
    if (!normalized) throw new Error(`Invalid OpenAlex author ID: ${authorId}`);
    const fromYear = Number(options.fromYear);
    const toYear = Number(options.toYear);
    if (!Number.isInteger(fromYear) || !Number.isInteger(toYear) || fromYear > toYear) {
      throw new Error("getWorksForAuthor requires a valid fromYear/toYear range");
    }

    const results = [];
    const fetchedAt = [];
    const cacheStatuses = [];
    let cursor = "*";
    const maximumPages = Number(options.maximumPages ?? 100);
    for (let page = 0; page < maximumPages && cursor; page += 1) {
      const response = await this.request("/works", {
        cursor,
        filter: `authorships.author.id:${normalized},publication_year:${fromYear}-${toYear}`,
        include_xpac: "true",
        per_page: 100,
        select: DEFAULT_WORK_FIELDS,
        sort: "publication_date:desc"
      });
      results.push(...(response.data.results ?? []));
      fetchedAt.push(response.fetchedAt);
      cacheStatuses.push(response.fromCache ? (response.stale ? "stale" : "fresh") : "network");
      cursor = response.data.meta?.next_cursor ?? null;
      if (!(response.data.results ?? []).length) break;
      if (page === maximumPages - 1 && cursor) {
        throw new Error(`OpenAlex work pagination exceeded ${maximumPages} pages for ${normalized}`);
      }
    }
    return {
      data: { results },
      fetchedAt: latestIsoDate(fetchedAt),
      cacheStatuses: [...new Set(cacheStatuses)]
    };
  }

  async request(endpoint, params = {}) {
    const cacheKey = buildOpenAlexCacheKey(endpoint, params);
    const cached = await this.readCache(cacheKey);
    const nowMs = this.now();
    if (cached && nowMs - Date.parse(cached.fetchedAt) <= this.cacheTtlMs) {
      return {
        data: cached.data,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        stale: false
      };
    }

    let lastError;
    for (let attempt = 0; attempt <= this.maximumRetries; attempt += 1) {
      try {
        await this.waitForRequestSlot();
        const url = createOpenAlexUrl(endpoint, params, {
          apiKey: this.apiKey,
          mailto: this.mailto,
          baseUrl: this.baseUrl
        });
        const response = await this.fetchImpl(url, {
          headers: {
            accept: "application/json",
            "user-agent": this.userAgent
          },
          signal: AbortSignal.timeout(this.timeoutMs)
        });

        if (!response.ok) {
          const error = new OpenAlexHttpError(response.status, endpoint);
          if (!isRetryableStatus(response.status)) throw error;
          lastError = error;
          if (attempt < this.maximumRetries) {
            await this.sleep(retryDelayMs(attempt, response.headers.get("retry-after"), {
              nowMs: this.now(),
              randomValue: this.random()
            }));
            continue;
          }
          break;
        }

        const data = await response.json();
        const fetchedAt = new Date(this.now()).toISOString();
        await this.writeCache(cacheKey, { fetchedAt, data });
        return { data, fetchedAt, fromCache: false, stale: false };
      } catch (error) {
        if (error instanceof OpenAlexHttpError && !isRetryableStatus(error.status)) throw error;
        lastError = error;
        if (attempt < this.maximumRetries) {
          await this.sleep(retryDelayMs(attempt, null, {
            nowMs: this.now(),
            randomValue: this.random()
          }));
          continue;
        }
      }
    }

    if (cached) {
      return {
        data: cached.data,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        stale: true
      };
    }
    throw lastError ?? new Error(`OpenAlex request failed: ${endpoint}`);
  }

  async waitForRequestSlot() {
    const elapsed = this.now() - this.lastRequestAt;
    if (this.lastRequestAt && elapsed < this.minimumIntervalMs) {
      await this.sleep(this.minimumIntervalMs - elapsed);
    }
    this.lastRequestAt = this.now();
  }

  async readCache(cacheKey) {
    if (!this.cacheDir) return null;
    try {
      const content = await fs.readFile(path.join(this.cacheDir, `${cacheKey}.json`), "utf8");
      const parsed = JSON.parse(content);
      return parsed?.version === 1 && parsed.fetchedAt && parsed.data ? parsed : null;
    } catch {
      return null;
    }
  }

  async writeCache(cacheKey, value) {
    if (!this.cacheDir) return;
    await writeJsonAtomically(path.join(this.cacheDir, `${cacheKey}.json`), {
      version: 1,
      fetchedAt: value.fetchedAt,
      data: value.data
    });
  }
}

class OpenAlexHttpError extends Error {
  constructor(status, endpoint) {
    super(`OpenAlex request failed with HTTP ${status}: ${endpoint}`);
    this.name = "OpenAlexHttpError";
    this.status = status;
  }
}

function buildIdentityAliasMap(identityConfig) {
  const aliases = new Map();
  const canonicalIds = new Set();
  for (const identity of identityConfig.canonicalPeople ?? []) {
    if (!identity.id || !identity.name) {
      throw new Error("Academic identity entries require id and name");
    }
    if (canonicalIds.has(identity.id)) {
      throw new Error(`Duplicate canonical academic ID: ${identity.id}`);
    }
    canonicalIds.add(identity.id);
    for (const [aliasGroup, sourceKind] of [["labs", "lab"], ["people", "person"]]) {
      for (const sourceRecordId of identity.aliases?.[aliasGroup] ?? []) {
        const key = `${sourceKind}:${sourceRecordId}`;
        if (aliases.has(key)) throw new Error(`Academic alias is mapped more than once: ${key}`);
        aliases.set(key, { id: identity.id, name: identity.name });
      }
    }
  }
  return aliases;
}

function mergeAcademicTargets(left, right) {
  const explicitIds = uniqueStrings([
    left.explicitOpenAlexId,
    right.explicitOpenAlexId
  ].filter(Boolean));
  if (explicitIds.length > 1) {
    throw new Error(`${left.internalId} has conflicting explicit OpenAlex author IDs`);
  }
  const explicitOrcids = uniqueStrings([
    left.explicitOrcid,
    right.explicitOrcid
  ].filter(Boolean));
  if (explicitOrcids.length > 1) {
    throw new Error(`${left.internalId} has conflicting explicit ORCID identifiers`);
  }
  const officialInstitutions = uniqueStrings([
    ...(left.officialInstitutions ?? []),
    ...(right.officialInstitutions ?? [])
  ]);
  return {
    ...left,
    officialInstitution: officialInstitutions[0] ?? null,
    officialInstitutions,
    explicitOpenAlexId: explicitIds[0] ?? null,
    explicitOrcid: explicitOrcids[0] ?? null,
    topicHints: uniqueStrings([...left.topicHints, ...right.topicHints]),
    collaboratorHints: uniqueStrings([...left.collaboratorHints, ...right.collaboratorHints]),
    sourceKinds: uniqueStrings([...left.sourceKinds, ...right.sourceKinds]),
    sourceRecordIds: {
      labs: uniqueStrings([...left.sourceRecordIds.labs, ...right.sourceRecordIds.labs]),
      people: uniqueStrings([...left.sourceRecordIds.people, ...right.sourceRecordIds.people])
    }
  };
}

function buildTarget(item, sourceKind) {
  const internalId = String(item.id ?? "").trim();
  if (!internalId) throw new Error(`${sourceKind} academic record is missing a stable id`);
  const name = sourceKind === "lab" ? item.leadName : item.name;
  if (!name) throw new Error(`${internalId} is missing an academic name`);
  const explicitOpenAlexId = normalizeOpenAlexId(item.openalex);
  if (item.openalex && !explicitOpenAlexId) {
    throw new Error(`${internalId} has an invalid explicit OpenAlex author ID`);
  }
  const explicitOrcid = String(item.orcid ?? "").match(/\d{4}-\d{4}-\d{4}-[\dX]{4}/i)?.[0] ?? null;
  const officialInstitution = sourceKind === "lab" ? item.institution : item.currentInstitution;
  return {
    internalId,
    sourceKind,
    name,
    officialInstitution,
    officialInstitutions: [officialInstitution].filter(Boolean),
    explicitOpenAlexId,
    explicitOrcid,
    topicHints: uniqueStrings(item.fieldTags ?? []),
    collaboratorHints: explicitCollaboratorHints(item),
    trackedPeerNames: []
  };
}

function explicitCollaboratorHints(item) {
  return uniqueStrings([
    item.advisor,
    ...(item.collaborators ?? []),
    ...(item.coauthors ?? []),
    ...(item.groupMembers ?? []),
    ...(item.group?.members ?? [])
  ].map(personNameFromValue).filter(Boolean));
}

function personNameFromValue(value) {
  if (typeof value === "string") return value;
  return value?.name ?? value?.displayName ?? value?.display_name ?? null;
}

function personNameTokens(value) {
  const normalized = normalizePersonName(value);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function sortedTokens(tokens) {
  return [...tokens].sort().join(" ");
}

function tokenCompatible(left, right) {
  return left === right
    || (left.length === 1 && right.startsWith(left))
    || (right.length === 1 && left.startsWith(right));
}

function canonicalInstitution(value) {
  const normalized = normalizeText(value);
  for (const [pattern, replacement] of INSTITUTION_ALIASES) {
    if (pattern.test(normalized)) return replacement;
  }
  return normalized;
}

function meaningfulInstitutionTokens(value) {
  return normalizeText(value).split(" ").filter((token) => token && !INSTITUTION_STOP_WORDS.has(token));
}

function institutionAcronym(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !INSTITUTION_STOP_WORDS.has(token))
    .map((token) => token[0])
    .join("");
}

function institutionsForAuthor(work, authorId) {
  if (!authorId) return [];
  return (work.authorships ?? [])
    .filter((authorship) => normalizeOpenAlexId(authorship.author?.id) === authorId)
    .flatMap((authorship) => authorship.institutions ?? []);
}

function uniqueByName(values) {
  const result = new Map();
  for (const value of values) {
    const name = value?.display_name ?? value?.displayName ?? value?.name;
    if (!name) continue;
    const key = normalizeText(name);
    if (!result.has(key)) {
      result.set(key, {
        id: normalizeOpenAlexId(value.id, "I") ?? value.id ?? null,
        displayName: name,
        countryCode: value.country_code ?? value.countryCode ?? null,
        type: value.type ?? null
      });
    }
  }
  return [...result.values()];
}

function aggregateNamedValues(values) {
  const aggregated = new Map();
  for (const value of values) {
    const name = value?.display_name ?? value?.displayName ?? value?.name;
    if (!name) continue;
    const key = normalizeText(name);
    const current = aggregated.get(key) ?? {
      id: value.id ?? null,
      displayName: name,
      score: 0,
      count: 0
    };
    current.score = Math.max(current.score, Number(value.score ?? 0));
    current.count += Number(value.count ?? value.works_count ?? 1);
    aggregated.set(key, current);
  }
  return [...aggregated.values()].sort((left, right) => right.count - left.count || right.score - left.score);
}

function aggregateCoauthors(works, authorId) {
  const aggregated = new Map();
  for (const work of works) {
    for (const authorship of work.authorships ?? []) {
      const coauthorId = normalizeOpenAlexId(authorship.author?.id);
      const name = authorship.author?.display_name ?? authorship.raw_author_name;
      if (!name || coauthorId === authorId) continue;
      const key = coauthorId ?? normalizeText(name);
      const current = aggregated.get(key) ?? {
        id: coauthorId,
        displayName: name,
        count: 0
      };
      current.count += 1;
      aggregated.set(key, current);
    }
  }
  return [...aggregated.values()].sort((left, right) => right.count - left.count || left.displayName.localeCompare(right.displayName));
}

function extractInstitutionNames(candidate) {
  return uniqueStrings([
    ...(candidate.evidenceInstitutions ?? []).map(personNameFromValue),
    ...(candidate.last_known_institutions ?? []).map(personNameFromValue),
    personNameFromValue(candidate.last_known_institution),
    ...(candidate.affiliations ?? []).map((item) => personNameFromValue(item.institution))
  ].filter(Boolean));
}

function bestInstitutionMatch(expectedValues, observed) {
  let best = { expected: null, name: null, similarity: 0 };
  for (const expected of expectedValues) {
    for (const name of observed) {
      const similarity = institutionSimilarity(expected, name);
      if (similarity > best.similarity) best = { expected, name, similarity };
    }
  }
  return best;
}

function extractNamedEvidence(values = []) {
  return uniqueStrings((values ?? []).map(personNameFromValue).filter(Boolean));
}

function matchTopics(expected, observed) {
  if (!expected.length || !observed.length) return { similarity: 0, matches: [] };
  const matches = expected.map((hint) => {
    let best = { observed: null, similarity: 0 };
    for (const topic of observed) {
      const similarity = phraseSimilarity(hint, topic);
      if (similarity > best.similarity) best = { observed: topic, similarity };
    }
    return { expected: hint, observed: best.observed, similarity: round(best.similarity) };
  }).filter((match) => match.similarity >= 0.35)
    .sort((left, right) => right.similarity - left.similarity);
  if (!matches.length) return { similarity: 0, matches: [] };
  const quality = matches.slice(0, 3).reduce((total, item) => total + item.similarity, 0) / Math.min(3, matches.length);
  const coverage = matches.length / expected.length;
  return {
    similarity: Math.min(1, quality * 0.65 + coverage * 0.35),
    matches: matches.slice(0, 8)
  };
}

function phraseSimilarity(left, right) {
  const leftNormalized = normalizeText(left);
  const rightNormalized = normalizeText(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (leftNormalized === rightNormalized) return 1;
  if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) return 0.88;
  return jaccard(leftNormalized.split(" "), rightNormalized.split(" "));
}

function matchCollaborators(explicitHints, trackedPeerNames, observed) {
  const explicitMatches = matchNames(explicitHints, observed);
  const trackedPeerMatches = matchNames(trackedPeerNames, observed);
  const explicitScore = Math.min(20, explicitMatches.length * 10);
  const trackedScore = Math.min(10, trackedPeerMatches.length * 5);
  return {
    explicitMatches,
    trackedPeerMatches,
    score: explicitMatches.length ? Math.max(explicitScore, trackedScore) : trackedScore
  };
}

function matchNames(expected, observed) {
  const matches = [];
  for (const expectedName of expected) {
    const match = observed.find((observedName) => nameSimilarity(expectedName, observedName) >= 0.9);
    if (match) matches.push({ expected: expectedName, observed: match });
  }
  return matches;
}

function normalizeCountsByYear(values = []) {
  return (values ?? [])
    .map((item) => ({
      year: Number(item.year),
      worksCount: Number(item.works_count ?? item.worksCount ?? 0),
      citedByCount: Number(item.cited_by_count ?? item.citedByCount ?? 0)
    }))
    .filter((item) => Number.isInteger(item.year))
    .sort((left, right) => right.year - left.year);
}

function authorshipRoleFor(work, authorId) {
  const authorship = (work.authorships ?? []).find(
    (item) => normalizeOpenAlexId(item.author?.id) === authorId
  );
  return {
    position: authorship?.author_position ?? null,
    isCorresponding: Boolean(authorship?.is_corresponding),
    rawAuthorName: authorship?.raw_author_name ?? null
  };
}

function conceptTrend(yearly) {
  const recent = yearly.slice(-2).reduce((total, item) => total + item.worksCount, 0) / 2;
  const previousValues = yearly.slice(0, -2);
  const previous = previousValues.length
    ? previousValues.reduce((total, item) => total + item.worksCount, 0) / previousValues.length
    : 0;
  if (previous === 0 && recent > 0) return "emerging";
  if (recent >= 1 && recent >= previous * 1.35) return "rising";
  if (previous > 0 && recent <= previous * 0.65) return "declining";
  return "steady";
}

function resolutionReviewReason(top, margin, threshold, minimumMargin) {
  if (top.score.name < 32) return "top candidate does not closely match the official name";
  if (!top.evidence.independentSignals.length) return "name match has no independent institution, collaborator, or topic evidence";
  if (top.score.total < threshold) return `top score ${top.score.total} is below ${threshold}`;
  if (margin < minimumMargin) return `top-candidate margin ${margin} is below ${minimumMargin}`;
  return "candidate requires manual review";
}

function confidenceForScore(score) {
  if (score >= 85) return "high";
  if (score >= 72) return "medium";
  return "guarded";
}

function openAlexEntityUrl(value) {
  const id = String(value ?? "").match(/(?:^|\/)([A-Z]\d+)$/i)?.[1]?.toUpperCase();
  return id ? `https://openalex.org/${id}` : null;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseRetryAfter(value, nowMs) {
  if (value === undefined || value === null || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date - nowMs : null;
}

function politeUserAgent(mailto) {
  return mailto
    ? `PostdocFacultyRadar/0.1 (mailto:${mailto})`
    : "PostdocFacultyRadar/0.1";
}

function latestIsoDate(values) {
  return values.filter(Boolean).sort((left, right) => String(right).localeCompare(String(left)))[0] ?? null;
}

function nullableNumber(value) {
  return value === undefined || value === null || value === "" ? null : Number(value);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  const result = new Map();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized && !result.has(normalized)) result.set(normalized, String(value).trim());
  }
  return [...result.values()];
}

function jaccard(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (!leftSet.size || !rightSet.size) return 0;
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  return intersection / (leftSet.size + rightSet.size - intersection);
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
