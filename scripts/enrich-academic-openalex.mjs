import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./lib/env.mjs";
import {
  OpenAlexClient,
  buildAcademicTargets,
  buildAuthorMetrics,
  buildConceptTrends,
  chooseAuthorCandidate,
  hydrateAuthorCandidate,
  mergeWorkSelections,
  normalizeOpenAlexId,
  normalizeOpenAlexWork,
  openAlexHelpText,
  parseOpenAlexArguments,
  rankAuthorCandidates,
  scoreAuthorCandidate,
  summarizeAuthorCandidate,
  writeJsonAtomically
} from "./lib/openalex.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultOutputPath = path.join(projectRoot, "output", "research", "openalex-academic.json");
const manualDirectory = path.join(projectRoot, "data", "manual");

export async function main(argv = process.argv.slice(2)) {
  const args = parseOpenAlexArguments(argv);
  if (args.help) {
    console.log(openAlexHelpText());
    return null;
  }
  const outputPath = args.output ? path.resolve(projectRoot, args.output) : defaultOutputPath;
  assertOutsideManualDirectory(outputPath);
  await loadDotEnv(projectRoot);

  const { labs, people, identityConfig, targets } = await loadAcademicTargets(projectRoot);
  const filteredTargets = args.explicitOnly
    ? targets.filter((target) => target.explicitOpenAlexId)
    : targets;
  const selectedTargets = args.limit ? filteredTargets.slice(0, args.limit) : filteredTargets;
  const generatedAt = new Date().toISOString();
  const referenceYear = new Date(generatedAt).getUTCFullYear();
  const fromYear = referenceYear - 4;
  const client = new OpenAlexClient({
    apiKey: process.env.OPENALEX_API_KEY,
    mailto: process.env.OPENALEX_MAILTO,
    cacheDir: path.join(projectRoot, ".radar-cache", "openalex")
  });

  const profiles = [];
  for (const [index, target] of selectedTargets.entries()) {
    console.log(`[${index + 1}/${selectedTargets.length}] OpenAlex: ${target.name}`);
    profiles.push(await enrichTarget(target, client, { fromYear, referenceYear }));
  }

  const output = {
    schemaVersion: "1.0.0",
    provider: "OpenAlex",
    generatedAt,
    fetchedAt: latestDate(profiles.map((profile) => profile.fetchedAt)) ?? generatedAt,
    dryRun: true,
    manualDataModified: false,
    input: {
      labs: "data/manual/labs.json",
      people: "data/manual/people.json",
      canonicalIdentities: "config/academic-identities.json",
      labCount: labs.length,
      peopleCount: people.length,
      canonicalIdentityCount: identityConfig.canonicalPeople?.length ?? 0,
      enrichmentTargetCount: selectedTargets.length,
      explicitOnly: args.explicitOnly
    },
    window: {
      fromYear,
      toYear: referenceYear,
      label: "recent_5_calendar_years_including_current_year"
    },
    requestPolicy: {
      apiKeyUsed: Boolean(process.env.OPENALEX_API_KEY),
      politeMailtoUsed: Boolean(process.env.OPENALEX_MAILTO),
      cacheDirectory: ".radar-cache/openalex",
      failedRunOverwritesPreviousOutput: false
    },
    resolutionPolicy: {
      explicitOpenAlexId: "trusted_and_used_directly",
      searchedCandidateThreshold: 65,
      minimumTopCandidateMargin: 8,
      nameOnlyCanAutoConfirm: false,
      independentEvidence: ["official_institution", "collaborator", "topic"]
    },
    workSelectionPolicy: {
      mentorCareerHighlightLimit: 12,
      personCareerHighlightLimit: 8,
      careerHighlightsSort: "cited_by_count:desc",
      recentWorksWindow: "all works in the configured recent-five-year window",
      deduplication: "OpenAlex work ID, then DOI, then normalized title",
      recentMetricsUseRecentWorksOnly: true
    },
    summary: buildSummary(profiles),
    profiles
  };

  await writeJsonAtomically(outputPath, output);
  console.log(`Wrote ${profiles.length} dry-run profiles to ${path.relative(projectRoot, outputPath)}. Manual data was not changed.`);
  return output;
}

export async function loadAcademicTargets(root = projectRoot) {
  const inputManualDirectory = path.join(root, "data", "manual");
  const [manualLabs, manualPeople, candidates, identityConfig] = await Promise.all([
    readRequiredJsonArray(path.join(inputManualDirectory, "labs.json")),
    readRequiredJsonArray(path.join(inputManualDirectory, "people.json")),
    readOptionalJsonObject(
      path.join(root, "data", "research", "academic-candidates.json"),
      { labs: [], people: [] }
    ),
    readOptionalJsonObject(
      path.join(root, "config", "academic-identities.json"),
      { canonicalPeople: [] }
    )
  ]);
  const labs = [...manualLabs, ...(candidates.labs ?? [])];
  const people = [...manualPeople, ...(candidates.people ?? [])];
  return {
    labs,
    people,
    identityConfig,
    targets: buildAcademicTargets(labs, people, identityConfig)
  };
}

async function enrichTarget(target, client, window) {
  const resolution = target.explicitOpenAlexId
    ? await resolveExplicitAuthor(target, client)
    : await resolveSearchedAuthor(target, client);

  if (!resolution.author) {
    return {
      internalId: target.internalId,
      sourceKind: target.sourceKind,
      sourceKinds: target.sourceKinds,
      sourceRecordIds: target.sourceRecordIds,
      name: target.name,
      officialInstitution: target.officialInstitution,
      resolution: resolution.output,
      author: null,
      metrics: null,
      works: [],
      conceptTrends: [],
      fetchedAt: latestDate(resolution.fetchedAt)
    };
  }

  const authorId = normalizeOpenAlexId(resolution.author.id);
  const worksResponse = await client.getWorksForAuthor(authorId, {
    fromYear: window.fromYear,
    toYear: window.referenceYear
  });
  const rawRecentWorks = deduplicateWorks(worksResponse.data.results ?? []);
  const metrics = buildAuthorMetrics(resolution.author, rawRecentWorks, window.referenceYear);
  const selectedWorks = mergeWorkSelections(resolution.careerHighlights, rawRecentWorks);
  const works = selectedWorks.map((selection) => ({
    ...normalizeOpenAlexWork(selection.work, authorId),
    selectionReason: selection.selectionReason,
    selectionReasons: selection.selectionReasons,
    isRecent: selection.selectionReasons.includes("recent")
  }));
  const conceptTrends = buildConceptTrends(rawRecentWorks, {
    fromYear: window.fromYear,
    toYear: window.referenceYear,
    limit: 25
  });
  const fetchedAt = latestDate([
    ...resolution.fetchedAt,
    worksResponse.fetchedAt
  ]);

  return {
    internalId: target.internalId,
    sourceKind: target.sourceKind,
    sourceKinds: target.sourceKinds,
    sourceRecordIds: target.sourceRecordIds,
    name: target.name,
    officialInstitution: target.officialInstitution,
    resolution: resolution.output,
    author: summarizeResolvedAuthor(resolution.author),
    metrics,
    works,
    workSelection: {
      careerHighlightLimit: careerHighlightLimitForTarget(target),
      careerHighlightCount: selectedWorks.filter((item) => item.selectionReasons.includes("career_highlight")).length,
      recentWorksCount: rawRecentWorks.length,
      mergedWorksCount: selectedWorks.length
    },
    conceptTrends,
    fetchedAt,
    fetchDetails: {
      identityFetchedAt: latestDate(resolution.fetchedAt),
      worksFetchedAt: worksResponse.fetchedAt,
      worksCacheStatuses: worksResponse.cacheStatuses
    }
  };
}

async function resolveExplicitAuthor(target, client) {
  const authorResponse = await client.getAuthor(target.explicitOpenAlexId);
  const preliminary = scoreAuthorCandidate(target, authorResponse.data);
  if (preliminary.score.name < 35) {
    return {
      author: null,
      careerHighlights: [],
      fetchedAt: [authorResponse.fetchedAt],
      output: {
        method: "explicit_openalex_id",
        status: "needs_review",
        confidence: "rejected_name_mismatch",
        selectedOpenAlexId: null,
        reason: "The supplied OpenAlex ID does not match the tracked person's name closely enough.",
        candidates: [summarizeAuthorCandidate(preliminary)]
      }
    };
  }
  const sampleResponse = await client.getAuthorCareerHighlights(target.explicitOpenAlexId, {
    limit: careerHighlightLimitForTarget(target)
  });
  const author = hydrateAuthorCandidate(authorResponse.data, sampleResponse.data.results ?? []);
  const scored = scoreAuthorCandidate(target, author);
  return {
    author,
    careerHighlights: sampleResponse.data.results ?? [],
    fetchedAt: [authorResponse.fetchedAt, sampleResponse.fetchedAt],
    output: {
      method: "explicit_openalex_id",
      status: "confirmed",
      confidence: "explicit",
      selectedOpenAlexId: target.explicitOpenAlexId,
      reason: "The manual record supplied an explicit OpenAlex author ID.",
      candidates: [summarizeAuthorCandidate(scored)]
    }
  };
}

async function resolveSearchedAuthor(target, client) {
  const searchResponse = await client.searchAuthors(target.name, { perPage: 25 });
  const searchCandidates = searchResponse.data.results ?? [];
  const preliminary = rankAuthorCandidates(target, searchCandidates);
  const evidenceCandidates = preliminary
    .filter((candidate) => candidate.score.name >= 20)
    .slice(0, 3);
  const hydratedById = new Map();
  const careerHighlightsById = new Map();
  const fetchedAt = [searchResponse.fetchedAt];

  for (const candidate of evidenceCandidates) {
    const authorId = normalizeOpenAlexId(candidate.id);
    if (!authorId) continue;
    const authorResponse = await client.getAuthor(authorId);
    const sampleResponse = await client.getAuthorCareerHighlights(authorId, {
      limit: careerHighlightLimitForTarget(target)
    });
    hydratedById.set(authorId, hydrateAuthorCandidate(
      authorResponse.data,
      sampleResponse.data.results ?? []
    ));
    careerHighlightsById.set(authorId, sampleResponse.data.results ?? []);
    fetchedAt.push(authorResponse.fetchedAt, sampleResponse.fetchedAt);
  }

  const hydratedCandidates = searchCandidates.map((candidate) => (
    hydratedById.get(normalizeOpenAlexId(candidate.id)) ?? candidate
  ));
  const scored = rankAuthorCandidates(target, hydratedCandidates);
  const decision = chooseAuthorCandidate(scored);
  const selectedAuthor = decision.selectedOpenAlexId
    ? hydratedById.get(decision.selectedOpenAlexId) ?? null
    : null;

  if (decision.selectedOpenAlexId && !selectedAuthor) {
    throw new Error(`Confirmed candidate ${decision.selectedOpenAlexId} was not hydrated`);
  }

  return {
    author: selectedAuthor,
    careerHighlights: decision.selectedOpenAlexId
      ? careerHighlightsById.get(decision.selectedOpenAlexId) ?? []
      : [],
    fetchedAt,
    output: {
      method: "name_search_with_disambiguation",
      status: decision.status === "auto_confirmed" ? "confirmed" : decision.status,
      confidence: decision.confidence,
      selectedOpenAlexId: decision.selectedOpenAlexId,
      topCandidateOpenAlexId: decision.topCandidateOpenAlexId ?? null,
      scoreMargin: decision.margin,
      reason: decision.reason ?? "No OpenAlex author candidates were returned.",
      candidates: scored.map(summarizeAuthorCandidate)
    }
  };
}

function summarizeResolvedAuthor(author) {
  const summary = summarizeAuthorCandidate(author);
  return {
    openAlexId: summary.openAlexId,
    openAlexUrl: summary.openAlexUrl,
    displayName: summary.displayName,
    displayNameAlternatives: author.display_name_alternatives ?? [],
    orcid: summary.orcid,
    worksCount: summary.worksCount,
    citedByCount: summary.citedByCount,
    institutions: summary.institutions,
    topics: summary.topics,
    coauthors: summary.coauthors,
    lastUpdatedDate: author.updated_date ?? null
  };
}

function careerHighlightLimitForTarget(target) {
  return target.sourceKinds.includes("lab") ? 12 : 8;
}

function deduplicateWorks(works) {
  const byId = new Map();
  for (const work of works) {
    const id = normalizeOpenAlexId(work.id, "W") ?? work.doi ?? work.title;
    if (id && !byId.has(id)) byId.set(id, work);
  }
  return [...byId.values()].sort((left, right) => (
    String(right.publication_date ?? "").localeCompare(String(left.publication_date ?? ""))
    || Number(right.cited_by_count ?? 0) - Number(left.cited_by_count ?? 0)
    || String(left.id ?? "").localeCompare(String(right.id ?? ""))
  ));
}

function buildSummary(profiles) {
  const confirmed = profiles.filter((profile) => profile.resolution.status === "confirmed");
  return {
    total: profiles.length,
    confirmed: confirmed.length,
    explicitIdConfirmed: profiles.filter((profile) => profile.resolution.method === "explicit_openalex_id").length,
    searchConfirmed: confirmed.filter((profile) => profile.resolution.method === "name_search_with_disambiguation").length,
    needsReview: profiles.filter((profile) => profile.resolution.status === "needs_review").length,
    noCandidates: profiles.filter((profile) => profile.resolution.status === "no_candidates").length,
    works: confirmed.reduce((total, profile) => total + profile.works.length, 0)
  };
}

async function readRequiredJsonArray(filePath) {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${filePath} must contain a JSON array`);
  return parsed;
}

async function readOptionalJsonObject(filePath, fallback) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(`${filePath} must contain a JSON object`);
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function assertOutsideManualDirectory(outputPath) {
  const relative = path.relative(manualDirectory, outputPath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("OpenAlex dry-run output cannot be written inside data/manual");
  }
}

function latestDate(values) {
  return values.filter(Boolean).sort((left, right) => String(right).localeCompare(String(left)))[0] ?? null;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMainModule) {
  main().catch((error) => {
    console.error(`OpenAlex enrichment failed; the previous output was not replaced: ${error.message}`);
    process.exitCode = 1;
  });
}
