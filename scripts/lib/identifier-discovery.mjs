import { institutionSimilarity, nameSimilarity } from "./openalex.mjs";

export function extractAcademicIdentifiers(html = "") {
  const text = String(html);
  return {
    orcids: uniqueMatches(text, /(?:https?:\/\/)?(?:www\.)?orcid\.org\/(\d{4}-\d{4}-\d{4}-[\dX]{4})/gi),
    openAlexIds: uniqueMatches(text, /(?:https?:\/\/)?(?:www\.)?openalex\.org\/(A\d+)/gi).map((id) => id.toUpperCase()),
    googleScholarUsers: uniqueMatches(text, /scholar\.google\.[^/"']+\/citations\?[^"']*?user=([A-Za-z0-9_-]+)/gi),
    semanticScholarAuthorIds: uniqueMatches(text, /semanticscholar\.org\/author\/(?:[^/"']+\/)?(\d+)/gi)
  };
}

export function resolveHomepageIdentifiers(item, identifiers, checkedAt) {
  const decisions = {
    orcid: singleValueDecision(identifiers.orcids),
    openalex: singleValueDecision(identifiers.openAlexIds)
  };
  const found = Object.values(identifiers).some((values) => values.length > 0);
  const needsReview = Object.values(decisions).some((decision) => decision.status === "needs_review");
  return {
    id: item.id,
    name: item.name,
    sourceUrl: item.homepage,
    checkedAt,
    status: needsReview ? "needs_review" : found ? "homepage_candidate" : "not_found",
    orcid: decisions.orcid.value,
    openalex: decisions.openalex.value,
    identifiers,
    noteZh: needsReview
      ? "主页出现多个同类书目标识，需人工确认。"
      : found
        ? "标识来自已核验主页，仍需书目记录姓名二次匹配。"
        : "主页未发现可直接提取的书目标识。"
  };
}

export function resolveOrcidSearch(target, results = [], checkedAt) {
  const scored = results.map((item) => {
    const observedName = [item["given-names"], item["family-names"]].filter(Boolean).join(" ");
    const institutionNames = item["institution-name"] ?? [];
    return {
      orcid: item["orcid-id"],
      observedName,
      institutionNames,
      nameScore: nameSimilarity(target.name, observedName),
      institutionScore: Math.max(0, ...institutionNames.map((name) => (
        institutionSimilarity(target.officialInstitution, name)
      )))
    };
  }).sort((a, b) => b.nameScore + b.institutionScore - a.nameScore - a.institutionScore);
  const eligible = scored.filter((item) => item.nameScore >= 0.94 && item.institutionScore >= 0.6);
  return {
    id: target.internalId,
    name: target.name,
    officialInstitution: target.officialInstitution,
    checkedAt,
    status: eligible.length === 1 ? "confirmed_candidate" : scored.length ? "needs_review" : "not_found",
    orcid: eligible.length === 1 ? eligible[0].orcid : null,
    selected: eligible.length === 1 ? eligible[0] : null,
    candidates: scored.slice(0, 5),
    noteZh: eligible.length === 1
      ? "ORCID 官方搜索中的姓名和机构均达到自动确认门槛；仍由 ORCID 记录姓名做最终复核。"
      : scored.length
        ? "姓名或机构证据不足，保留人工审核。"
        : "ORCID 官方搜索未返回记录。"
  };
}

export function mergeIdentifierDiscoveries(...groups) {
  const merged = new Map();
  for (const discovery of groups.flat().filter(Boolean)) {
    const existing = merged.get(discovery.id) ?? {};
    merged.set(discovery.id, {
      ...existing,
      ...discovery,
      orcid: discovery.orcid ?? existing.orcid ?? null,
      openalex: discovery.openalex ?? existing.openalex ?? null
    });
  }
  return merged;
}

export function countPublicationTitleOverlaps(pageText, titles = []) {
  const corpus = normalizePublicationTitle(pageText);
  const matches = [];
  for (const title of titles) {
    const normalized = normalizePublicationTitle(title);
    if (normalized.length >= 28 && corpus.includes(normalized)) matches.push(title);
  }
  return [...new Set(matches)];
}

export function selectCrosscheckedOrcid(candidates = []) {
  const ranked = [...candidates].sort((a, b) => (
    (b.titleMatches?.length ?? 0) - (a.titleMatches?.length ?? 0)
  ));
  const best = ranked[0];
  const secondCount = ranked[1]?.titleMatches?.length ?? 0;
  const bestCount = best?.titleMatches?.length ?? 0;
  return best && bestCount >= 2 && bestCount > secondCount
    ? { status: "confirmed_candidate", orcid: best.orcid, selected: best }
    : { status: ranked.length ? "needs_review" : "not_found", orcid: null, selected: null };
}

function normalizePublicationTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&(?:amp|quot|apos|lt|gt);/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singleValueDecision(values = []) {
  if (values.length === 1) return { status: "candidate", value: values[0] };
  if (values.length > 1) return { status: "needs_review", value: null };
  return { status: "not_found", value: null };
}

function uniqueMatches(text, pattern) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1]).filter(Boolean))];
}
