const SIGNAL_ALIASES = {
  official_opening: ["official_opening"],
  official_postdoc_opening: ["official_opening"],
  official_research_staff_opening: ["official_opening"],
  funding_expansion: ["funded_expansion_signal"],
  funded_may_expand: ["funded_expansion_signal"],
  long_term_accepting_postdocs: ["accepts_applications"],
  department_fellowship_host: ["department_opening", "fellowship_host"],
  rolling_application_or_fellowship_host: ["accepts_applications", "fellowship_host"],
  expired: ["closed_or_expired"],
  phd_only: ["no_public_signal"],
  none_public: ["no_public_signal"],
  no_public_signal: ["no_public_signal"]
};

export function buildAcademicCandidateDataset(documents = [], existing = {}) {
  const labs = [];
  const people = [];
  const review = [];
  const seenIds = new Set([
    ...(existing.labs ?? []).map((item) => item.id),
    ...(existing.people ?? []).map((item) => item.id)
  ]);
  const seenNames = new Set([
    ...(existing.labs ?? []).map((item) => normalizeName(item.leadName)),
    ...(existing.people ?? []).map((item) => normalizeName(item.name))
  ]);

  for (const document of documents.filter(Boolean)) {
    for (const candidate of [...(document.labs ?? []), ...(document.mentorLabs ?? [])]) {
      const result = candidateDecision(candidate, seenIds, seenNames);
      if (!result.accepted) {
        review.push({ kind: "lab", id: candidate.id, name: candidate.name, reason: result.reason });
        continue;
      }
      labs.push(normalizeLabCandidate(candidate));
      registerCandidate(candidate, seenIds, seenNames);
    }
    for (const candidate of document.youngScholars ?? []) {
      const phdYear = parsePhdYear(candidate);
      const result = candidateDecision(candidate, seenIds, seenNames, { phdYearRequired: true, phdYear });
      if (!result.accepted) {
        review.push({ kind: "young_scholar", id: candidate.id, name: candidate.name, reason: result.reason });
        continue;
      }
      people.push(normalizeYoungScholarCandidate(candidate, phdYear));
      registerCandidate(candidate, seenIds, seenNames);
    }
  }

  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    sourceKind: "researched_candidates",
    counts: { labs: labs.length, people: people.length, review: review.length },
    labs,
    people,
    review
  };
}

export function normalizeRecruitmentCandidateSignal(signal = {}, verifiedAt) {
  const aliases = SIGNAL_ALIASES[signal.type] ?? ["no_public_signal"];
  return aliases.map((type) => ({
    type,
    summaryZh: signal.note ?? signal.scope ?? null,
    sourceUrl: signal.evidenceUrl ?? signal.evidence ?? null,
    sourceType: type === "official_opening" ? "official_opening_page" : "public_signal",
    confidence: signal.evidenceUrl || signal.evidence ? "A" : "C",
    observedAt: verifiedAt
  }));
}

export function parsePhdYear(candidate = {}) {
  const explicit = Number(candidate.phdYear);
  if (Number.isInteger(explicit) && explicit > 1900) return explicit;
  const match = String(candidate.positionStage ?? "").match(/\bPhD\s*(?:in\s*)?(20\d{2})\b/i);
  return match ? Number(match[1]) : null;
}

function normalizeLabCandidate(candidate) {
  const verifiedAt = candidate.verifiedAt ?? null;
  return {
    id: candidate.id,
    leadName: candidate.name,
    institution: candidate.institution,
    country: candidate.country ?? null,
    region: candidate.region,
    currentPosition: candidate.positionStage,
    groupName: `${candidate.name} research group`,
    homepage: candidate.homepage,
    groupHomepage: candidate.groupOrOpeningsUrl ?? candidate.groupOrOpenings ?? candidate.homepage,
    openingsUrl: recruitmentEvidenceUrl(candidate.recruitmentSignal),
    fieldTags: candidate.researchTags ?? [],
    researchSummaryZh: candidate.selectionEvidence,
    grantsAwards: (candidate.fundingProjects ?? []).map((item) => ({ summary: item })),
    recruitmentSignals: normalizeRecruitmentCandidateSignal(candidate.recruitmentSignal, verifiedAt),
    openalex: normalizeOpenAlexUrl(candidate.ids?.openAlex ?? candidate.ids?.openalex),
    orcid: normalizeOrcidUrl(candidate.ids?.orcid),
    googleScholar: candidate.ids?.googleScholar ?? null,
    evidence: buildCandidateEvidence(candidate),
    uncertainties: candidate.uncertainties ?? [],
    lastVerifiedAt: verifiedAt,
    sourceKind: "researched_candidate"
  };
}

function normalizeYoungScholarCandidate(candidate, phdYear) {
  const verifiedAt = candidate.verifiedAt ?? null;
  return {
    id: candidate.id,
    kind: "young_scholar_case",
    name: candidate.name,
    currentPosition: candidate.positionStage,
    currentInstitution: candidate.institution,
    currentRoleType: inferRoleType(candidate.positionStage),
    country: candidate.country ?? null,
    region: candidate.region,
    phdYear,
    fieldTags: candidate.researchTags ?? [],
    researchSummaryZh: candidate.selectionEvidence,
    currentStatusZh: candidate.selectionEvidence,
    grantsAwards: (candidate.fundingProjects ?? []).map((item) => ({ summary: item })),
    recruitmentSignals: normalizeRecruitmentCandidateSignal(candidate.recruitmentSignal, verifiedAt),
    homepage: candidate.homepage,
    openalex: normalizeOpenAlexUrl(candidate.ids?.openAlex ?? candidate.ids?.openalex),
    orcid: normalizeOrcidUrl(candidate.ids?.orcid),
    googleScholar: candidate.ids?.googleScholar ?? null,
    evidence: buildCandidateEvidence(candidate),
    uncertainties: candidate.uncertainties ?? [],
    lastVerifiedAt: verifiedAt,
    sourceKind: "researched_candidate"
  };
}

function buildCandidateEvidence(candidate) {
  const checkedAt = candidate.verifiedAt ?? null;
  const evidence = [];
  if (candidate.homepage) {
    evidence.push({
      type: "profile_homepage",
      url: candidate.homepage,
      confidence: "A",
      checkedAt,
      supportsClaims: ["identity", "position", "research"]
    });
  }
  for (const url of candidate.sources ?? []) {
    evidence.push({
      type: "research_source",
      url,
      confidence: "A",
      checkedAt,
      supportsClaims: ["identity", "position", "research", "career_stage"]
    });
  }
  const signalUrl = recruitmentEvidenceUrl(candidate.recruitmentSignal);
  if (signalUrl) {
    evidence.push({
      type: candidate.recruitmentSignal?.type?.startsWith("official") ? "official_opening" : "recruitment_signal",
      url: signalUrl,
      confidence: "A",
      checkedAt,
      supportsClaims: ["recruitment_signal"]
    });
  }
  const openAlex = candidate.ids?.openAlex ?? candidate.ids?.openalex;
  if (openAlex) {
    evidence.push({
      type: "openalex_identity_hint",
      url: normalizeOpenAlexUrl(openAlex),
      confidence: "B",
      checkedAt,
      supportsClaims: ["bibliographic_identity_hint"]
    });
  }
  return uniqueObjects(evidence, (item) => `${item.type}|${item.url}`);
}

function candidateDecision(candidate, seenIds, seenNames, options = {}) {
  if (!candidate?.id || !candidate?.name || !candidate?.homepage) {
    return { accepted: false, reason: "missing_stable_identity" };
  }
  if (seenIds.has(candidate.id)) return { accepted: false, reason: "duplicate_id" };
  if (seenNames.has(normalizeName(candidate.name))) return { accepted: false, reason: "duplicate_name" };
  if (options.phdYearRequired && !options.phdYear) return { accepted: false, reason: "missing_verified_phd_year" };
  return { accepted: true };
}

function registerCandidate(candidate, seenIds, seenNames) {
  seenIds.add(candidate.id);
  seenNames.add(normalizeName(candidate.name));
}

function recruitmentEvidenceUrl(signal = {}) {
  return signal.evidenceUrl ?? signal.evidence ?? null;
}

function normalizeOpenAlexUrl(value) {
  if (!value) return null;
  const id = String(value).match(/A\d+/i)?.[0]?.toUpperCase();
  return id ? `https://openalex.org/${id}` : null;
}

function normalizeOrcidUrl(value) {
  if (!value) return null;
  const id = String(value).match(/\d{4}-\d{4}-\d{4}-[\dX]{4}/i)?.[0];
  return id ? `https://orcid.org/${id}` : null;
}

function inferRoleType(value) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("postdoc")) return "postdoctoral researcher";
  if (text.includes("assistant professor") || text.includes("lecturer")) return "assistant professor";
  if (text.includes("associate professor")) return "associate professor";
  if (text.includes("professor")) return "professor";
  if (text.includes("research scientist") || text.includes("researcher")) return "researcher";
  return "young scholar";
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function uniqueObjects(values, keyFor) {
  const seen = new Set();
  return values.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
