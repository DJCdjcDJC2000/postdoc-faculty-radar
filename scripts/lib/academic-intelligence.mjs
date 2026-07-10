import { applyAcademicEnrichment } from "./academic-enrichment.mjs";
import { classifyWorks } from "./venue-classification.mjs";

const OFFICIAL_EVIDENCE_PATTERN = /official|homepage|profile|institution|department|university/i;
const BIBLIOGRAPHIC_EVIDENCE_PATTERN = /openalex|crossref|orcid|semantic|scholar|dblp|doi|publication/i;

export function buildAcademicProfiles(
  labs = [],
  people = [],
  config = {},
  identityMap = {},
  enrichments = [],
  taxonomy = {},
  supplements = {}
) {
  const rawProfiles = [
    ...labs.map(normalizeLabProfile),
    ...people.map(normalizePersonProfile)
  ];
  const profiles = applyAcademicProfileSupplements(applyAcademicEnrichment(
    mergeCanonicalProfiles(rawProfiles, identityMap),
    enrichments,
    taxonomy
  ), supplements, taxonomy);
  return profiles.map((rawProfile) => {
    const profile = attachTopVenueLowerBound(deriveResearchFeatures(rawProfile), taxonomy);
    return {
      ...profile,
      quality: assessProfileReadiness(profile, config)
    };
  });
}

function attachTopVenueLowerBound(profile, taxonomy) {
  const works = profile.representativeWorks ?? [];
  const analysis = classifyWorks(works, taxonomy);
  const counts = new Map();
  for (const classification of analysis.classifications ?? []) {
    if (!classification.counted || !(classification.matches ?? []).some((match) => match.tier === "top_core")) continue;
    const venue = classification.venueName;
    if (venue) counts.set(venue, (counts.get(venue) ?? 0) + 1);
  }
  const topVenueCountsLowerBound = [...counts.entries()]
    .map(([venue, count]) => ({ venue, count }))
    .sort((left, right) => right.count - left.count || left.venue.localeCompare(right.venue));
  return {
    ...profile,
    publicationMetrics: profile.publicationMetrics ? {
      ...profile.publicationMetrics,
      topVenueCountsLowerBound,
      topVenueCountBasisZh: "仅按已核验代表作中可识别的核心 venue 统计，是保守下限，不等同于完整履历总数。"
    } : profile.publicationMetrics
  };
}

export function deriveResearchFeatures(profile) {
  const research = profile.research ?? {};
  const tags = unique(research.tags ?? []);
  const text = [research.summaryZh, ...tags].filter(Boolean).join(" ");
  const suppliedMethods = unique(research.methods ?? []);
  const suppliedApplications = unique(research.applications ?? []);
  const derivedMethods = suppliedMethods.length ? [] : deriveFeatures(text, METHOD_FEATURE_RULES);
  const derivedApplications = suppliedApplications.length ? [] : deriveFeatures(text, APPLICATION_FEATURE_RULES);
  const methods = unique([...suppliedMethods, ...derivedMethods]);
  const applications = unique([...suppliedApplications, ...derivedApplications]);
  const featureProvenance = {
    summary: research.summaryZh ? "public_source_or_verified_summary" : tags.length ? "derived_from_public_tags" : "not_publicly_specified",
    methods: suppliedMethods.length ? "public_source_or_verified_supplement" : derivedMethods.length ? "derived_from_public_research_fields" : "not_publicly_specified",
    applications: suppliedApplications.length ? "public_source_or_verified_supplement" : derivedApplications.length ? "derived_from_public_research_fields" : "not_publicly_specified"
  };
  return {
    ...profile,
    publicAnalysis: {
      ...derivePublicCareerAnalysis(profile, featureProvenance),
      ...(profile.publicAnalysis ?? {})
    },
    research: {
      ...research,
      tags,
      summaryZh: research.summaryZh || (tags.length ? `公开资料将其研究方向概括为：${tags.join("、")}。` : "公开资料尚未提供可核验的研究概述。"),
      methods,
      applications,
      featureProvenance
    }
  };
}

function derivePublicCareerAnalysis(profile, featureProvenance) {
  const steps = unique((profile.timeline ?? []).map((item) => {
    if (typeof item === "string") return item;
    const period = item.years || item.period || item.year || [item.startYear, item.endYear].filter(Boolean).join("-");
    const role = item.role || item.title || item.degree || item.position;
    return [period, role, item.institution].filter(Boolean).join(" · ");
  })).slice(0, 8);
  const caveatsZh = [];
  if (!steps.length) caveatsZh.push("公开经历尚不足以形成可靠的职业路径归纳。");
  if (featureProvenance.methods === "derived_from_public_research_fields") caveatsZh.push("研究方法由公开研究标签与摘要归纳，不等同于作者自述的方法清单。");
  return {
    careerPatternZh: steps.length ? `公开教育与任职路径包括：${steps.join("；")}。` : "公开经历尚不足以形成可靠的职业路径归纳。",
    caveatsZh,
    notice: "公开事实归纳，需回到证据台账核验",
    source: "deterministic_public_fact_summary"
  };
}

const METHOD_FEATURE_RULES = [
  [/stochastic|uncertaint|random/i, "stochastic optimization and uncertainty methods"],
  [/distributionally robust|\bdro\b/i, "distributionally robust optimization"],
  [/robust optimization/i, "robust optimization"],
  [/variational inequalit|monotone inclusion/i, "variational-inequality and monotone-operator methods"],
  [/complementarity/i, "complementarity formulations and algorithms"],
  [/nonsmooth|variational analysis/i, "nonsmooth and variational analysis"],
  [/semismooth|newton/i, "Newton and semismooth Newton methods"],
  [/first[- ]order|gradient|accelerat/i, "first-order methods"],
  [/bilevel/i, "bilevel optimization"],
  [/minimax|saddle/i, "minimax and saddle-point methods"],
  [/distributed|federated/i, "distributed and federated optimization"],
  [/semidefinite|conic/i, "conic and semidefinite optimization"],
  [/integer|mixed-integer|combinatorial|discrete optimization|cutting plane/i, "discrete and mixed-integer optimization"],
  [/numerical linear algebra|matrix|tensor/i, "numerical linear algebra"],
  [/spectral/i, "spectral methods"],
  [/finite element|numerical pde|scientific computing|numerical analysis/i, "numerical analysis and scientific computing"],
  [/operator learning|physics-informed|scientific machine learning/i, "scientific machine learning"],
  [/manifold|riemannian/i, "Riemannian and manifold optimization"],
  [/optimal control|control/i, "optimal-control methods"],
  [/reinforcement learning/i, "reinforcement learning"],
  [/game theory|mechanism design/i, "game-theoretic methods"],
  [/global optimization|polynomial optimization/i, "global and polynomial optimization"],
  [/online optimization/i, "online optimization"],
  [/interior point/i, "interior-point methods"],
  [/decomposition/i, "decomposition methods"],
  [/optimization|operations research|mathematical programming/i, "mathematical optimization"],
];

const APPLICATION_FEATURE_RULES = [
  [/machine learning|statistical learning|data science|optimization for ml|ml optimization/i, "machine learning and data science"],
  [/signal processing|imaging|inverse problem/i, "signal processing, imaging, and inverse problems"],
  [/energy|power system|electric/i, "energy and power systems"],
  [/supply chain|logistics|transport|routing|revenue management/i, "logistics, transportation, and operations"],
  [/health|medical|biomedical/i, "healthcare and biomedical systems"],
  [/finance|risk analytics|portfolio/i, "finance and risk analytics"],
  [/control|robot|autonomous|dynamical system/i, "control and dynamical systems"],
  [/network|communication|federated/i, "networked and distributed systems"],
  [/pde|fluid|physics|scientific computing|uncertainty quantification/i, "physical simulation and scientific computing"],
  [/game theory|mechanism design|market/i, "markets and strategic decision-making"],
  [/decision making|operations research|applied probability/i, "decision-making and operations"],
];

function deriveFeatures(text, rules) {
  return rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

export function applyAcademicProfileSupplements(profiles = [], supplements = {}, taxonomy = {}) {
  const patches = new Map((supplements.profiles ?? []).map((item) => [item.id, item]));
  return profiles.map((profile) => {
    const supplement = patches.get(profile.canonicalId ?? profile.id) ?? patches.get(profile.id);
    if (!supplement) return profile;
    const representativeWorks = deduplicateWorks([
      ...(supplement.representativeWorks ?? []),
      ...(profile.representativeWorks ?? [])
    ]);
    const classifiedVenues = classifyWorks(representativeWorks, taxonomy).venueBreakdown;
    return {
      ...profile,
      research: {
        ...(profile.research ?? {}),
        tags: unique([
          ...(profile.research?.tags ?? []),
          ...(supplement.researchTags ?? [])
        ]),
        summaryZh: supplement.researchSummaryZh ?? profile.research?.summaryZh,
        recentEvolution: unique([
          ...(profile.research?.recentEvolution ?? []),
          ...(supplement.researchEvolution ?? [])
        ]),
        methods: unique([
          ...(profile.research?.methods ?? []),
          ...(supplement.methods ?? [])
        ]),
        applications: unique([
          ...(profile.research?.applications ?? []),
          ...(supplement.applications ?? [])
        ])
      },
      publicationMetrics: supplement.publicationMetrics ?? profile.publicationMetrics,
      venueBreakdown: mergeVenueBreakdown(
        supplement.venueBreakdown ?? [],
        classifiedVenues,
        profile.venueBreakdown ?? []
      ),
      representativeWorks,
      grantsAwards: uniqueObjects([
        ...(profile.grantsAwards ?? []),
        ...(supplement.grantsAwards ?? [])
      ]),
      timeline: uniqueObjects([
        ...(profile.timeline ?? []),
        ...(supplement.timeline ?? [])
      ]),
      group: supplement.group ? {
        ...(profile.group ?? {}),
        ...supplement.group
      } : profile.group,
      publicAnalysis: supplement.publicAnalysis ? {
        ...(profile.publicAnalysis ?? {}),
        ...supplement.publicAnalysis
      } : profile.publicAnalysis,
      links: {
        ...(profile.links ?? {}),
        ...(supplement.links ?? {})
      },
      recruitmentSignals: mergeRecruitmentSignals([
        ...(profile.recruitmentSignals ?? []),
        ...(supplement.recruitmentSignals ?? []).map((signal) => normalizeSignal(signal, supplement))
      ]),
      evidence: uniqueObjects([
        ...(profile.evidence ?? []),
        ...(supplement.evidence ?? [])
      ], (item) => `${item.type}|${item.url ?? ""}`),
      uncertainties: unique([
        ...(profile.uncertainties ?? []),
        ...(supplement.uncertainties ?? [])
      ]),
      lastVerifiedAt: latestDate([profile.lastVerifiedAt, supplement.lastVerifiedAt])
    };
  });
}

function mergeVenueBreakdown(...groups) {
  const merged = new Map();
  for (const item of groups.flat()) {
    const key = `${item.track ?? ""}|${item.tier ?? ""}`;
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
}

export function normalizeRecruitmentSignals(item = {}) {
  const explicit = Array.isArray(item.recruitmentSignals)
    ? item.recruitmentSignals.map((signal) => normalizeSignal(signal, item))
    : [];
  const legacy = legacyRecruitmentSignals(item);
  const deduplicated = new Map();
  for (const signal of [...explicit, ...legacy]) {
    if (!signal?.type) continue;
    const key = `${signal.type}|${signal.sourceUrl ?? ""}`;
    if (!deduplicated.has(key)) deduplicated.set(key, signal);
  }
  if (!deduplicated.size) {
    deduplicated.set("no_public_signal|", normalizeSignal({ type: "no_public_signal" }, item));
  }
  return [...deduplicated.values()];
}

export function assessProfileReadiness(profile, config = {}) {
  const minimum = config.minimumProfile ?? {};
  const isMentor = (profile.profileTypes ?? [profile.profileType]).includes("mentor_group");
  const minimumWorks = isMentor
    ? Number(minimum.mentorRepresentativeWorks ?? 8)
    : Number(minimum.youngScholarRepresentativeWorks ?? 5);
  const evidence = profile.evidence ?? [];
  const officialSources = evidence.filter((item) => OFFICIAL_EVIDENCE_PATTERN.test(item.type ?? ""));
  const bibliographicSources = evidence.filter((item) => BIBLIOGRAPHIC_EVIDENCE_PATTERN.test(item.type ?? ""));
  const metrics = profile.publicationMetrics ?? {};
  const checks = {
    officialIdentity: officialSources.length >= Number(minimum.officialIdentitySources ?? 1),
    bibliographicIdentity: bibliographicSources.length >= Number(minimum.bibliographicSources ?? 1),
    researchEvolution: !minimum.requiresResearchEvolution || hasResearchEvolution(profile),
    publicationMetrics: !minimum.requiresPublicationMetrics || hasPublicationMetrics(metrics),
    venueBreakdown: !minimum.requiresVenueBreakdown || hasVenueBreakdown(profile.venueBreakdown),
    representativeWorks: (profile.representativeWorks ?? []).length >= minimumWorks,
    careerOrGroup: isMentor ? Boolean(profile.group?.name || profile.group?.homepage) : (profile.timeline ?? []).length > 0,
    evidenceCoverage: !minimum.requiresEvidenceForKeyClaims || evidence.length >= 2,
    freshness: Boolean(profile.lastVerifiedAt || metrics.updatedAt)
  };
  const missing = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    status: missing.length ? "incomplete" : "ready",
    isPublicReady: missing.length === 0,
    score: Math.round(passed / Object.keys(checks).length * 100),
    missing
  };
}

export function buildAcademicOverview(profiles = []) {
  const readyProfiles = profiles.filter((profile) => profile.quality?.isPublicReady);
  const recruitmentSignals = profiles.flatMap((profile) => profile.recruitmentSignals ?? []);
  return {
    totalProfiles: profiles.length,
    readyProfiles: readyProfiles.length,
    incompleteProfiles: profiles.length - readyProfiles.length,
    byType: countValues(profiles.flatMap((profile) => profile.profileTypes ?? [profile.profileType])),
    byRegion: countValues(profiles.map((profile) => profile.region).filter(Boolean)),
    topResearchTags: countValues(
      profiles.flatMap((profile) => profile.research?.tags ?? []),
      20
    ),
    recruitmentSignals: countValues(recruitmentSignals.map((signal) => signal.type)),
    officialOpenings: recruitmentSignals.filter((signal) => signal.type === "official_opening").length,
    expansionSignals: recruitmentSignals.filter((signal) => signal.type === "funded_expansion_signal").length,
    acceptingApplications: recruitmentSignals.filter((signal) => signal.type === "accepts_applications").length,
    fellowshipHosts: recruitmentSignals.filter((signal) => signal.type === "fellowship_host").length,
    metricsUpdatedAt: latestDate(profiles.map((profile) => profile.publicationMetrics?.updatedAt))
  };
}

function normalizeLabProfile(lab) {
  const representativeWorks = lab.representativeWorks ?? lab.representativePapers ?? [];
  return {
    id: lab.id,
    canonicalId: lab.canonicalPersonId ?? lab.id,
    profileType: "mentor_group",
    profileTypes: ["mentor_group"],
    name: lab.leadName,
    nameZh: lab.leadNameZh,
    currentPosition: lab.currentPosition ?? lab.authorityLevel,
    institution: lab.institution,
    department: lab.department,
    country: lab.country,
    region: lab.region,
    qsRank: lab.qsRank2027,
    qsRankDisplay: lab.qsRankDisplay,
    schoolScope: lab.schoolScope,
    roleType: lab.roleType ?? "principal_investigator",
    group: {
      name: lab.groupName,
      homepage: lab.groupHomepage,
      members: lab.groupMembers ?? [],
      alumni: lab.alumni ?? [],
      collaborationStyleZh: lab.collaborationStyleZh
    },
    research: {
      tags: lab.fieldTags ?? [],
      summaryZh: lab.researchSummaryZh,
      recentEvolution: lab.researchEvolution ?? [],
      methods: lab.methods ?? [],
      applications: lab.applications ?? []
    },
    publicationMetrics: lab.publicationMetrics ?? null,
    venueBreakdown: lab.venueBreakdown ?? [],
    representativeWorks,
    timeline: lab.timeline ?? [],
    grantsAwards: lab.grantsAwards ?? [],
    recruitmentSignals: normalizeRecruitmentSignals(lab),
    links: {
      homepage: lab.homepage,
      groupHomepage: lab.groupHomepage,
      openings: lab.openingsUrl,
      googleScholar: lab.googleScholar,
      openalex: lab.openalex,
      orcid: lab.orcid
    },
    evidence: lab.evidence ?? [],
    lastVerifiedAt: lab.lastVerifiedAt ?? lab.updatedAt ?? lab.sourceUpdatedAt,
    sourceKind: "legacy_lab",
    sourceRecordIds: { labs: [lab.id], people: [] }
  };
}

function normalizePersonProfile(person) {
  const isYoung = String(person.kind ?? "").includes("young");
  const timeline = person.timeline ?? buildPersonTimeline(person);
  return {
    id: person.id,
    canonicalId: person.canonicalPersonId ?? person.id,
    profileType: isYoung ? "young_scholar" : "academic_reference",
    profileTypes: [isYoung ? "young_scholar" : "academic_reference"],
    name: person.name,
    nameZh: person.nameZh,
    currentPosition: person.currentPosition,
    institution: person.currentInstitution,
    department: person.department,
    country: person.country,
    region: person.region,
    qsRank: person.qsRank2027,
    qsRankDisplay: person.qsRankDisplay,
    schoolScope: person.schoolScope,
    roleType: person.currentRoleType,
    group: person.group ?? null,
    research: {
      tags: person.fieldTags ?? [],
      summaryZh: person.researchSummaryZh ?? person.currentStatusZh,
      recentEvolution: person.researchEvolution ?? [],
      methods: person.methods ?? [],
      applications: person.applications ?? []
    },
    publicationMetrics: person.publicationMetrics ?? null,
    venueBreakdown: person.venueBreakdown ?? [],
    representativeWorks: person.representativePapers ?? person.representativeWorks ?? [],
    timeline,
    grantsAwards: person.grantsAwards ?? [],
    recruitmentSignals: normalizeRecruitmentSignals(person),
    links: {
      homepage: person.homepage,
      googleScholar: person.googleScholar,
      openalex: person.openalex,
      orcid: person.orcid,
      semanticScholar: person.semanticScholar,
      dblp: person.dblp
    },
    evidence: person.evidence ?? [],
    lastVerifiedAt: person.lastVerifiedAt ?? person.updatedAt ?? person.sourceUpdatedAt,
    sourceKind: "legacy_person",
    sourceRecordIds: { labs: [], people: [person.id] }
  };
}

function mergeCanonicalProfiles(profiles, identityMap) {
  const aliases = new Map();
  const canonicalDefinitions = new Map();
  for (const definition of identityMap.canonicalPeople ?? []) {
    canonicalDefinitions.set(definition.id, definition);
    for (const id of definition.aliases?.labs ?? []) aliases.set(`legacy_lab:${id}`, definition.id);
    for (const id of definition.aliases?.people ?? []) aliases.set(`legacy_person:${id}`, definition.id);
  }
  const grouped = new Map();
  for (const profile of profiles) {
    const canonicalId = aliases.get(`${profile.sourceKind}:${profile.id}`) ?? profile.canonicalId ?? profile.id;
    const normalized = { ...profile, canonicalId };
    grouped.set(canonicalId, [...(grouped.get(canonicalId) ?? []), normalized]);
  }
  return [...grouped.entries()].map(([canonicalId, items]) => {
    const definition = canonicalDefinitions.get(canonicalId);
    return mergeProfileGroup(canonicalId, items, definition);
  });
}

function mergeProfileGroup(canonicalId, items, definition) {
  if (items.length === 1 && !definition) return items[0];
  const mentor = items.find((item) => item.profileType === "mentor_group");
  const primary = mentor ?? items[0];
  const types = unique(items.flatMap((item) => item.profileTypes ?? [item.profileType]));
  return {
    ...primary,
    id: canonicalId,
    canonicalId,
    profileType: mentor ? "mentor_group" : primary.profileType,
    profileTypes: types,
    name: definition?.name ?? firstValue(items, "name"),
    nameZh: firstValue(items, "nameZh"),
    currentPosition: firstValue(items, "currentPosition"),
    institution: firstValue(items, "institution"),
    department: firstValue(items, "department"),
    country: firstValue(items, "country"),
    region: firstValue(items, "region"),
    group: mentor?.group ?? firstValue(items, "group"),
    research: {
      tags: unique(items.flatMap((item) => item.research?.tags ?? [])),
      summaryZh: items.map((item) => item.research?.summaryZh).find(Boolean),
      recentEvolution: unique(items.flatMap((item) => item.research?.recentEvolution ?? [])),
      methods: unique(items.flatMap((item) => item.research?.methods ?? [])),
      applications: unique(items.flatMap((item) => item.research?.applications ?? []))
    },
    publicationMetrics: latestObject(items.map((item) => item.publicationMetrics)),
    venueBreakdown: uniqueObjects(items.flatMap((item) => item.venueBreakdown ?? [])),
    representativeWorks: deduplicateWorks(items.flatMap((item) => item.representativeWorks ?? [])),
    timeline: uniqueObjects(items.flatMap((item) => item.timeline ?? [])),
    grantsAwards: uniqueObjects(items.flatMap((item) => item.grantsAwards ?? [])),
    recruitmentSignals: mergeRecruitmentSignals(items.flatMap((item) => item.recruitmentSignals ?? [])),
    links: Object.assign({}, ...items.map((item) => item.links ?? {})),
    evidence: uniqueObjects([
      ...items.flatMap((item) => item.evidence ?? []),
      ...(definition?.evidence ?? [])
    ], (item) => `${item.type}|${item.url ?? ""}`),
    lastVerifiedAt: latestDate(items.map((item) => item.lastVerifiedAt)),
    sourceKind: "canonical_academic",
    sourceRecordIds: {
      labs: unique(items.flatMap((item) => item.sourceRecordIds?.labs ?? [])),
      people: unique(items.flatMap((item) => item.sourceRecordIds?.people ?? []))
    }
  };
}

function legacyRecruitmentSignals(item) {
  const status = String(item.recruitmentStatus ?? "").toLowerCase();
  const text = String(item.recruitmentSignalZh ?? "").toLowerCase();
  const signals = [];
  if (["active_openings", "active_group_openings"].includes(status)) {
    signals.push({ type: "official_opening" });
  }
  if (status === "active_department_postdoc") {
    signals.push({ type: "department_opening" });
  }
  if (status.includes("fellowship_host")) {
    signals.push({ type: "fellowship_host" });
  }
  if (status.includes("funded_expansion")) {
    signals.push({ type: "funded_expansion_signal" });
  }
  if (status.includes("accepts_applications") || /长期.*申请|接受.*申请|欢迎.*联系|accept/.test(text)) {
    signals.push({ type: "accepts_applications" });
  }
  if (status.includes("closed") || status.includes("expired")) {
    signals.push({ type: "closed_or_expired" });
  }
  return signals.map((signal) => normalizeSignal(signal, item));
}

function normalizeSignal(signal, item) {
  const value = typeof signal === "string" ? { type: signal } : signal;
  return {
    type: value.type,
    labelZh: value.labelZh,
    summaryZh: value.summaryZh ?? item.recruitmentSignalZh,
    sourceUrl: value.sourceUrl ?? item.openingsUrl,
    sourceType: value.sourceType,
    confidence: value.confidence ?? (value.sourceUrl ? "A" : "C"),
    observedAt: value.observedAt ?? item.lastVerifiedAt ?? item.sourceUpdatedAt,
    expiresAt: value.expiresAt
  };
}

function buildPersonTimeline(person) {
  const timeline = [];
  if (person.phdInstitution) {
    timeline.push({
      type: "phd",
      institution: person.phdInstitution,
      year: person.phdYear,
      advisor: person.advisor
    });
  }
  for (const item of person.postdocHistory ?? []) {
    timeline.push({ type: "postdoc", ...item });
  }
  if (person.currentPosition || person.currentInstitution) {
    timeline.push({
      type: "current_position",
      role: person.currentPosition,
      institution: person.currentInstitution
    });
  }
  return timeline;
}

function hasResearchEvolution(profile) {
  return (profile.research?.recentEvolution ?? []).length > 0;
}

function hasPublicationMetrics(metrics) {
  return Boolean(metrics)
    && Number.isFinite(Number(metrics.worksCount))
    && Number.isFinite(Number(metrics.recentWorksCount));
}

function hasVenueBreakdown(breakdown) {
  return Array.isArray(breakdown) && breakdown.some((item) => Number(item.count ?? 0) > 0);
}

function countValues(values, limit = Number.POSITIVE_INFINITY) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
    .slice(0, limit);
}

function latestDate(values) {
  return values.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
}

function firstValue(items, key) {
  return items.map((item) => item[key]).find((value) => value !== undefined && value !== null && value !== "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueObjects(values, keyFor = (item) => JSON.stringify(item)) {
  const seen = new Set();
  return values.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateWorks(works) {
  return uniqueObjects(works, (work) => String(
    work.title
      ? `title:${normalizeWorkTitle(work.title)}`
      : work.doi
        ?? work.openalexId
        ?? work.url
    ?? ""
  ).toLowerCase());
}

function normalizeWorkTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeRecruitmentSignals(signals) {
  const uniqueSignals = uniqueObjects(signals, (item) => `${item.type}|${item.sourceUrl ?? ""}`);
  const sourcedTypes = new Set(uniqueSignals.filter((item) => item.sourceUrl).map((item) => item.type));
  const hasExplicitOpening = uniqueSignals.some((item) => ["official_opening", "department_opening"].includes(item.type));
  return uniqueSignals.filter((item) => (
    (!hasExplicitOpening || item.type !== "no_public_signal")
    && (item.sourceUrl || !sourcedTypes.has(item.type))
  ));
}

function latestObject(values) {
  return values
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0] ?? null;
}
