const COMPANY_RULES = [
  [/\bjd\b|jd\.com/i, "jd"],
  [/meituan/i, "meituan"],
  [/alibaba|mindopt/i, "alibaba"],
  [/cardinal|copt/i, "cardinal-operations"],
  [/huawei/i, "huawei"],
  [/google/i, "google-research"],
  [/gurobi/i, "gurobi"],
  [/microsoft/i, "microsoft-research"],
  [/argonne/i, "argonne-national-laboratory"]
];

export const ADDITIONAL_INDUSTRY_ORGANIZATIONS = [
  {
    id: "cardinal-operations",
    name: "Cardinal Operations",
    nameZh: "杉数科技",
    category: "优化求解器公司",
    regions: ["Mainland China", "International"],
    locations: ["北京", "上海", "深圳"],
    teams: ["COPT Solver", "Supply Chain Optimization", "Decision Intelligence"],
    roleFamilies: ["Solver Developer", "Optimization Engineer", "Operations Research Scientist"],
    careerUrl: "https://www.shanshu.ai/",
    homepage: "https://www.shanshu.ai/",
    sourceConfidence: "A · 官方网站"
  },
  {
    id: "argonne-national-laboratory",
    name: "Argonne National Laboratory",
    nameZh: "阿贡国家实验室",
    category: "国家实验室研究岗",
    regions: ["United States"],
    locations: ["Lemont, Illinois"],
    teams: ["Mathematics and Computer Science"],
    roleFamilies: ["Computational Mathematician", "Postdoctoral Appointee", "Research Scientist"],
    careerUrl: "https://www.anl.gov/hr/careers",
    homepage: "https://www.anl.gov/mcs",
    sourceConfidence: "A · 官方网站"
  }
];

export function buildIndustryCandidateDataset(existingPeople = [], research = {}) {
  const excluded = new Set([...(research.replaceIds ?? []), ...(research.moveToAcademicIds ?? [])]);
  const retained = existingPeople.filter((person) => !excluded.has(person.id));
  const knownIds = new Set(retained.map((person) => person.id));
  const knownNames = new Set(retained.map((person) => normalizeName(person.name)));
  const inserted = [];
  const review = [];

  for (const candidate of research.candidates ?? []) {
    const id = candidate.idSuggestion;
    if (!id || !candidate.name || knownIds.has(id) || knownNames.has(normalizeName(candidate.name))) {
      review.push({ id, name: candidate.name, reason: "missing_or_duplicate_identity" });
      continue;
    }
    if (!hasIndependentCareerAndWorkEvidence(candidate)) {
      review.push({ id, name: candidate.name, reason: "insufficient_independent_evidence" });
      continue;
    }
    const person = normalizeIndustryCandidate(candidate);
    inserted.push(person);
    knownIds.add(person.id);
    knownNames.add(normalizeName(person.name));
  }

  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    audit: research.audit ?? null,
    counts: {
      original: existingPeople.length,
      removed: existingPeople.length - retained.length,
      retained: retained.length,
      inserted: inserted.length,
      final: retained.length + inserted.length,
      review: review.length
    },
    companies: ADDITIONAL_INDUSTRY_ORGANIZATIONS,
    people: [...retained, ...inserted],
    review
  };
}

export function hasIndependentCareerAndWorkEvidence(candidate = {}) {
  const evidence = candidate.evidence ?? [];
  const career = evidence.some((item) => /official_company|professional_society|institution|conference_bio/i.test(item.type));
  const work = evidence.some((item) => /publication|paper|patent|software|open_source|code/i.test(item.type))
    || (candidate.paperPatentProjectEntries ?? []).some((item) => item.url);
  return career && work;
}

export function inferCompanyId(companyTeam) {
  return COMPANY_RULES.find(([pattern]) => pattern.test(String(companyTeam ?? "")))?.[1] ?? null;
}

function normalizeIndustryCandidate(candidate) {
  const homepage = candidate.profiles?.officialProfile
    ?? candidate.profiles?.conferenceBio
    ?? candidate.profiles?.github
    ?? null;
  return {
    id: candidate.idSuggestion,
    name: candidate.name,
    nameZh: candidate.nameZh ?? null,
    companyId: inferCompanyId(candidate.companyTeam),
    currentPosition: candidate.position,
    team: candidate.companyTeam,
    region: candidate.region,
    category: "产业研究与工程样本",
    careerStage: candidate.careerStage,
    fieldTags: candidate.researchTags ?? [],
    educationSummaryZh: candidate.educationTransitionSummaryZh,
    pathSummaryZh: candidate.educationTransitionSummaryZh,
    representativeWorks: (candidate.paperPatentProjectEntries ?? []).map((item) => ({
      type: item.type,
      title: item.title,
      url: item.url
    })),
    homepage,
    profiles: candidate.profiles ?? {},
    relevanceZh: candidate.relevanceZh,
    confidence: "A/B · 个人职业证据与独立成果交叉核验",
    evidence: (candidate.evidence ?? []).map((item) => ({
      ...item,
      supportsClaims: item.supportsClaims ?? item.supports ?? [],
      checkedAt: candidate.verifiedAt
    })),
    uncertainties: candidate.uncertainties ?? [],
    lastVerifiedAt: candidate.verifiedAt,
    sourceKind: "researched_industry_candidate"
  };
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
