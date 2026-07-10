import { classifyWorks } from "./venue-classification.mjs";

const CONFIRMED_RESOLUTION_STATUSES = new Set(["confirmed"]);
const PROVIDER_PRIORITY = { ORCID: 1, OpenAlex: 2 };

export function applyAcademicEnrichment(profiles = [], documents = [], taxonomy = {}) {
  const enrichmentById = indexConfirmedEnrichments(documents);
  return profiles.map((profile) => {
    const enrichment = enrichmentById.get(profile.canonicalId ?? profile.id);
    return enrichment ? mergeOpenAlexEnrichment(profile, enrichment, taxonomy) : profile;
  });
}

export function indexConfirmedEnrichments(documents = []) {
  const indexed = new Map();
  for (const document of asArray(documents)) {
    if (!document || !PROVIDER_PRIORITY[document.provider]) continue;
    for (const profile of document.profiles ?? []) {
      if (!isConfirmedBibliographicProfile(profile, document.provider)) continue;
      const candidate = { ...profile, provider: document.provider };
      const existing = indexed.get(profile.internalId);
      if (!existing
        || PROVIDER_PRIORITY[candidate.provider] > PROVIDER_PRIORITY[existing.provider]
        || (candidate.provider === existing.provider && String(candidate.fetchedAt ?? "") > String(existing.fetchedAt ?? ""))) {
        indexed.set(profile.internalId, candidate);
      }
    }
  }
  return indexed;
}

export function isConfirmedBibliographicProfile(profile = {}, provider) {
  if (!profile.internalId || !CONFIRMED_RESOLUTION_STATUSES.has(profile.resolution?.status)) return false;
  if (provider === "OpenAlex") return Boolean(profile.author?.openAlexId);
  if (provider === "ORCID") return Boolean(profile.author?.orcid);
  return false;
}

export function isConfirmedOpenAlexProfile(profile = {}) {
  return Boolean(
    profile.internalId
    && profile.author?.openAlexId
    && CONFIRMED_RESOLUTION_STATUSES.has(profile.resolution?.status)
  );
}

export function mergeOpenAlexEnrichment(profile, enrichment, taxonomy = {}) {
  const provider = enrichment.provider ?? "OpenAlex";
  const isOpenAlex = provider === "OpenAlex";
  const representativeWorkLimit = (profile.profileTypes ?? [profile.profileType]).includes("mentor_group") ? 12 : 8;
  const works = enrichment.works ?? [];
  const venueAnalysis = classifyWorks(works, taxonomy);
  const venueBreakdown = venueAnalysis.venueBreakdown.map((item) => ({
    ...item,
    trackLabelZh: taxonomy.tracks?.find((track) => track.id === item.track)?.nameZh ?? item.track,
    trackLabel: taxonomy.tracks?.find((track) => track.id === item.track)?.name ?? item.track
  }));
  const fetchedAt = enrichment.fetchedAt ?? null;
  const verification = enrichment.authorVerification ?? null;
  const bibliographicEvidence = {
    type: isOpenAlex ? "openalex_author" : "orcid_record",
    url: isOpenAlex ? enrichment.author.openAlexUrl : enrichment.author.orcidUrl,
    checkedAt: fetchedAt,
    confidence: enrichment.resolution?.confidence ?? "B",
    supportsClaims: [
      "bibliographic_identity",
      "publication_metrics",
      "representative_works",
      "research_evolution"
    ]
  };

  return {
    ...profile,
    research: {
      ...(profile.research ?? {}),
      recentEvolution: mergeResearchEvolution(
        profile.research?.recentEvolution,
        enrichment.conceptTrends
      )
    },
    publicationMetrics: enrichment.metrics ? {
      ...enrichment.metrics,
      provider,
      authorId: enrichment.author.openAlexId ?? enrichment.author.orcid,
      countLabelZh: enrichment.metrics.countLabelZh ?? (isOpenAlex ? "OpenAlex 收录成果（近似）" : "ORCID 自关联成果记录"),
      countCaveatZh: enrichment.metrics.countCaveatZh ?? (isOpenAlex
        ? "包含 OpenAlex 归入该作者的多类学术成果，可能受同名合并与文献类型影响；请结合 ORCID、Crossref 与个人主页理解。"
        : "来自作者 ORCID 公开记录，通常只覆盖作者主动关联或第三方同步的成果，不等同于完整论文总数。"),
      crossSourceCounts: verification ? {
        orcidRecordCount: verification.orcid?.recordCount ?? null,
        crossrefOrcidWorksCount: verification.crossref?.worksCount ?? null,
        checkedAt: verification.checkedAt ?? null
      } : enrichment.metrics.sourceCounts ?? null,
      updatedAt: fetchedAt
    } : profile.publicationMetrics,
    publicationAnalysis: {
      provider,
      updatedAt: fetchedAt,
      inputWorks: works.length,
      countedWorks: venueAnalysis.globalCount,
      excludedWorks: venueAnalysis.excludedCount,
      unclassifiedWorks: venueAnalysis.unclassifiedCount,
      deduplicatedWorks: venueAnalysis.deduplicatedCount
    },
    venueBreakdown,
    representativeWorks: mergeRepresentativeWorks(profile.representativeWorks, works, representativeWorkLimit),
    timeline: mergeTimeline(profile.timeline, enrichment.timeline),
    links: {
      ...(profile.links ?? {}),
      openalex: enrichment.author.openAlexUrl ?? profile.links?.openalex ?? null,
      orcid: profile.links?.orcid || enrichment.author.orcidUrl || enrichment.author.orcid || null
    },
    evidence: mergeEvidence(
      mergeEvidence(profile.evidence, bibliographicEvidence),
      verification?.orcid?.url ? {
        type: "orcid_record",
        url: verification.orcid.url,
        checkedAt: verification.checkedAt,
        confidence: "A",
        supportsClaims: ["bibliographic_identity", "self_linked_work_count"]
      } : null
    ),
    lastVerifiedAt: latestDate([profile.lastVerifiedAt, fetchedAt]),
    enrichmentStatus: {
      provider,
      identityStatus: enrichment.resolution.status,
      confidence: enrichment.resolution.confidence,
      updatedAt: fetchedAt,
      crossSourceStatus: verification?.status ?? (isOpenAlex ? "openalex_only" : "orcid_self_linked"),
      warnings: verification?.warnings ?? [isOpenAlex
        ? "OpenAlex 收录量是数据库估计值，不等同于严格的同行评审论文数。"
        : "ORCID 记录通常是论文量下界，不等同于完整论文总数。"]
    }
  };
}

function mergeResearchEvolution(existing = [], trends = []) {
  const normalized = (trends ?? []).slice(0, 12).map((trend) => ({
    topic: trend.displayName,
    trend: trend.trend,
    worksCount: trend.worksCount,
    citedByCount: trend.citedByCount,
    shareOfWorks: trend.shareOfWorks,
    yearly: trend.yearly ?? []
  }));
  return uniqueObjects([...(existing ?? []), ...normalized], (item) => (
    typeof item === "string" ? item : String(item.topic ?? item.displayName ?? JSON.stringify(item))
  ));
}

function mergeRepresentativeWorks(existing = [], works = [], limit = 12) {
  const normalized = works.map((work) => ({
    title: work.title,
    year: work.publicationYear,
    publicationDate: work.publicationDate,
    venue: work.source?.displayName ?? null,
    doi: work.doi,
    url: work.doi || work.openAlexUrl,
    openAlexId: work.openAlexId,
    citedByCount: work.citedByCount,
    selectionReason: work.selectionReason,
    selectionReasons: work.selectionReasons,
    isRecent: work.isRecent,
    type: work.type,
    source: work.source
  })).filter((work) => work.title);
  return uniqueObjects([...(existing ?? []), ...normalized], workKey).slice(0, limit);
}

function mergeEvidence(existing = [], addition) {
  return uniqueObjects([...(existing ?? []), addition].filter(Boolean), (item) => `${item.type}|${item.url ?? ""}`);
}

function mergeTimeline(existing = [], addition = []) {
  return uniqueObjects([...(existing ?? []), ...(addition ?? [])], (item) => JSON.stringify({
    type: item.type,
    institution: item.institution,
    role: item.role,
    degree: item.degree,
    startYear: item.startYear,
    endYear: item.endYear
  }));
}

function workKey(work) {
  return String(
    work.doi
    ?? work.openAlexId
    ?? (work.title ? `${work.title}|${work.year ?? work.publicationYear ?? ""}` : work.url)
    ?? ""
  ).toLowerCase();
}

function latestDate(values) {
  return values.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
}

function uniqueObjects(values, keyFor) {
  const seen = new Set();
  return values.filter((item) => {
    if (!item) return false;
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
