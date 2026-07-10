import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson, copyFileEnsuringDir } from "./lib/read-write.mjs";
import { assertNoPrivateFields, stripPrivateFields } from "./lib/privacy.mjs";
import { sanitizeIntelligenceForBuild } from "./lib/public-intelligence.mjs";
import { buildAlerts, buildCalendar, enrichJobForSite } from "./lib/site-data.mjs";
import { freshnessFor } from "./lib/job-history.mjs";
import { buildAcademicOverview, buildAcademicProfiles } from "./lib/academic-intelligence.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = readArg("mode") ?? "public";
if (!["public", "private"].includes(mode)) {
  throw new Error(`Unsupported build mode: ${mode}`);
}

const outputDir = path.join(projectRoot, mode === "public" ? "public" : "private");
const siteSource = path.join(projectRoot, "src", "site");
const buildDate = new Date();

const [
  jobsRaw,
  generatedAlerts,
  sourceStatuses,
  generatedMetadata,
  manualPeople,
  manualLabs,
  routes,
  publicProfileConfig,
  privateProfileConfig,
  siteCopy,
  publicAiIndex,
  privateAiIndex,
  privateStates,
  preparationPlan,
  peopleIntelligenceConfig,
  academicIdentityMap,
  venueTaxonomy,
  academicEnrichment,
  orcidAcademicEnrichment,
  academicCandidates,
  industryCompaniesRaw,
  industryOpportunitiesRaw,
  industryPeopleRaw,
  industryPeopleCurated,
  industryInsights,
  industryPrivatePlan
] = await Promise.all([
  readJson(projectRoot, "data/generated/jobs.json", []),
  readJson(projectRoot, "data/generated/alerts.json", []),
  readJson(projectRoot, "data/generated/sources.json", []),
  readJson(projectRoot, "data/generated/metadata.json", {}),
  readJson(projectRoot, "data/manual/people.json", []),
  readJson(projectRoot, "data/manual/labs.json", []),
  readJson(projectRoot, "config/career-routes.json", []),
  readJson(projectRoot, "config/profile.json", {}),
  mode === "private" ? readJson(projectRoot, "config/profile.private.json", null) : null,
  readJson(projectRoot, "config/site-copy.json", {}),
  readJson(projectRoot, "data/ai/job-analysis.json", {}),
  mode === "private" ? readJson(projectRoot, "data/private/job-analysis.json", {}) : {},
  readPrivateJson("data/private/job-state.json", "data/private/job-state.example.json", []),
  readPrivateJson("data/private/preparation-plan.json", "data/private/preparation-plan.example.json", null),
  readJson(projectRoot, "config/people-intelligence.json", {}),
  readJson(projectRoot, "config/academic-identities.json", {}),
  readJson(projectRoot, "config/venue-taxonomy.json", {}),
  readJson(projectRoot, "data/research/academic-enrichment.json", { provider: "OpenAlex", profiles: [] }),
  readJson(projectRoot, "data/research/orcid-academic-enrichment.json", { provider: "ORCID", profiles: [] }),
  readJson(projectRoot, "data/research/academic-candidates.json", { labs: [], people: [] }),
  readJson(projectRoot, "data/manual/industry-companies.json", []),
  readJson(projectRoot, "data/manual/industry-opportunities.json", []),
  readJson(projectRoot, "data/manual/industry-people.json", []),
  readJson(projectRoot, "data/research/industry-people-curated.json", null),
  readJson(projectRoot, "data/manual/industry-insights.json", {}),
  mode === "private"
    ? readPrivateJson("data/private/industry-plan.json", "data/private/industry-plan.example.json", null)
    : null
]);

const profile = mergeProfile(publicProfileConfig, mode === "private" ? privateProfileConfig : null);
const aiIndex = mode === "private" ? { ...publicAiIndex, ...privateAiIndex } : publicAiIndex;
const privateByJobId = new Map(privateStates.map((item) => [item.jobId, item]));
const jobs = jobsRaw.map((job) => ({
  ...enrichJobForSite(
    job,
    aiIndex[job.id] ?? null,
    mode === "private" ? privateByJobId.get(job.id) ?? null : null
  ),
  freshness: freshnessFor(job, buildDate)
}));

const people = manualPeople.map((person) => ({
  ...person,
  ai: person.ai ?? {
    status: "manual",
    notice: "AI 辅助生成，需核验",
    careerPathZh: person.pathSummaryZh ?? "等待补充公开职业路径。",
    learningsZh: person.learningsZh ?? [],
    risksZh: person.risksZh ?? []
  }
}));

const labs = manualLabs.map((lab) => ({
  ...lab,
  evidence: lab.evidence ?? [],
  fieldTags: lab.fieldTags ?? [],
  potentialRoutes: lab.potentialRoutes ?? [],
  representativeWorks: lab.representativeWorks ?? []
}));

const academicPeople = [...people, ...(academicCandidates.people ?? [])];
const academicLabs = [...labs, ...(academicCandidates.labs ?? [])];
const allAcademicProfiles = buildAcademicProfiles(
  academicLabs,
  academicPeople,
  peopleIntelligenceConfig,
  academicIdentityMap,
  [academicEnrichment, orcidAcademicEnrichment],
  venueTaxonomy
);
const publishIncompleteProfiles = mode !== "public"
  || peopleIntelligenceConfig.minimumProfile?.incompleteProfilesArePublic === true;
const academicProfiles = publishIncompleteProfiles
  ? allAcademicProfiles
  : allAcademicProfiles.filter((profile) => profile.quality?.isPublicReady);
const academicOverview = buildAcademicOverview(allAcademicProfiles);
const academic = {
  schemaVersion: 2,
  target: peopleIntelligenceConfig.scope ?? {},
  qualityGate: {
    enforced: true,
    migrationMode: false,
    publishedProfiles: academicProfiles.length,
    trackedProfiles: allAcademicProfiles.length,
    minimumProfile: peopleIntelligenceConfig.minimumProfile ?? {}
  },
  recruitmentSignalTypes: peopleIntelligenceConfig.recruitmentSignals ?? [],
  publicationPolicy: peopleIntelligenceConfig.publicationPolicy ?? {},
  venueTaxonomy,
  profiles: academicProfiles,
  overview: academicOverview
};

const industryCompanies = [
  ...industryCompaniesRaw,
  ...(industryPeopleCurated?.companies ?? [])
]
  .filter((company, index, values) => values.findIndex((item) => item.id === company.id) === index)
  .map((company) => ({
    ...company,
    overallScore: industryCompanyScore(company)
  }))
  .sort((a, b) => b.overallScore - a.overallScore);
const industryCompanyById = new Map(industryCompanies.map((company) => [company.id, company]));
const industryOpportunities = industryOpportunitiesRaw
  .map((opportunity) => ({
    ...opportunity,
    companyProfile: publicCompanyReference(industryCompanyById.get(opportunity.companyId)),
    overallScore: industryOpportunityScore(opportunity),
    lifecycleStatus: opportunity.status === "historical" ? "expired" : opportunity.status === "active" ? "active" : "watchlist",
    freshness: freshnessFor({
      ...opportunity,
      lifecycleStatus: opportunity.status === "historical" ? "expired" : opportunity.status === "active" ? "active" : "watchlist",
      changeType: opportunity.firstSeenAt ? "new" : opportunity.sourceUpdatedAt ? "updated" : null,
      lastChangedAt: opportunity.lastChangedAt ?? opportunity.sourceUpdatedAt
    }, buildDate)
  }))
  .sort((a, b) => b.overallScore - a.overallScore);
const industryPeople = (industryPeopleCurated?.people?.length ? industryPeopleCurated.people : industryPeopleRaw)
  .map((person) => ({
    ...person,
    companyNameZh: industryCompanyById.get(person.companyId)?.nameZh ?? person.companyId,
    representativeWorks: person.representativeWorks ?? [],
    evidence: person.evidence ?? []
  }))
  .sort((a, b) => (b.replicabilityScore ?? 0) - (a.replicabilityScore ?? 0));
const industry = {
  updatedAt: industryInsights.updatedAt,
  sourcePolicyZh: industryInsights.sourcePolicyZh,
  rankingWeights: industryInsights.rankingWeights,
  companies: industryCompanies,
  opportunities: industryOpportunities,
  people: industryPeople,
  salaryBenchmarks: industryInsights.salaryBenchmarks ?? [],
  skillDemand: industryInsights.skillDemand ?? [],
  anonymousPaths: industryInsights.anonymousPaths ?? [],
  ...(mode === "private" && industryPrivatePlan ? { private: industryPrivatePlan } : {})
};

const metadata = {
  ...generatedMetadata,
  builtAt: buildDate.toISOString(),
  mode,
  title: siteCopy.title,
  publicBuild: mode === "public"
};

const siteData = {
  mode,
  copy: siteCopy,
  metadata,
  profile: mode === "public" ? publicProfile(profile) : profile,
  metrics: buildMetrics(jobs, sourceStatuses, people, labs, industry),
  jobs,
  alerts: jobs.length ? buildAlerts(jobs) : generatedAlerts,
  people,
  labs,
  academic,
  industry,
  routes: routes.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
  sources: sourceStatuses,
  updates: buildUpdates(jobs, industryOpportunities, buildDate),
  calendar: buildCalendar(
    jobs,
    mode === "private" ? privateStates : [],
    mode === "private" ? preparationPlan : null
  )
};

const intelligenceSafeData = sanitizeIntelligenceForBuild(siteData, mode);
const outputData = mode === "public" ? stripPrivateFields(intelligenceSafeData) : intelligenceSafeData;
if (mode === "public") {
  assertNoPrivateFields(outputData);
}

await fs.mkdir(outputDir, { recursive: true });
for (const fileName of ["index.html", "app.js", "styles.css"]) {
  await copyFileEnsuringDir(path.join(siteSource, fileName), path.join(outputDir, fileName));
}

await writeJson(outputDir, "data/site.json", outputData);
await writeJson(outputDir, "data/jobs.json", outputData.jobs);
await writeJson(outputDir, "data/alerts.json", outputData.alerts);
await writeJson(outputDir, "data/people.json", outputData.people);
await writeJson(outputDir, "data/labs.json", outputData.labs);
await writeJson(outputDir, "data/academic.json", outputData.academic);
await writeJson(outputDir, "data/industry.json", outputData.industry);
await writeJson(outputDir, "data/routes.json", outputData.routes);
await writeJson(outputDir, "data/sources.json", outputData.sources);
await writeJson(outputDir, "data/metadata.json", outputData.metadata);
await fs.writeFile(path.join(outputDir, ".nojekyll"), "", "utf8");

console.log(`Built ${mode} site at ${outputDir}`);
console.log(
  `${outputData.jobs.length} jobs, ${outputData.alerts.length} alerts, ` +
    `${outputData.academic.overview.totalProfiles} tracked academic profiles, ` +
    `${outputData.academic.qualityGate.publishedProfiles} public-ready academic profiles, ` +
    `${outputData.industry.companies.length} companies, ${outputData.industry.people.length} industry people.`
);

function readArg(name) {
  const eq = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function buildMetrics(jobs, sources, people, labs, industry) {
  const currentJobs = jobs.filter((job) => job.lifecycleStatus !== "expired");
  const abJobs = currentJobs.filter((job) => ["A", "B"].includes(job.priority) && job.recordType !== "watch_seed");
  const dueSoon = jobs.filter((job) => {
    const days = daysUntil(job.deadline);
    return days <= 30 && days >= 0;
  });
  const activeSources = sources.filter((source) => source.status === "ok");
  return {
    totalJobs: currentJobs.length,
    archivedJobs: jobs.length - currentJobs.length,
    newJobs: jobs.filter((job) => job.freshness?.type === "new").length,
    updatedJobs: jobs.filter((job) => job.freshness?.type === "updated").length,
    expiredJobs: jobs.filter((job) => job.freshness?.type === "expired" && job.freshness?.highlighted).length,
    highMatchJobs: abJobs.length,
    dueSoonJobs: dueSoon.length,
    activeSources: activeSources.length,
    totalSources: sources.length,
    peopleCount: people.length,
    targetLabs: labs.length,
    activeLabSignals: labs.filter((lab) => String(lab.recruitmentStatus ?? "").includes("active")).length,
    industryCompanies: industry.companies.length,
    industryPeople: industry.people.length,
    industryOpportunities: industry.opportunities.length,
    activeIndustryOpportunities: industry.opportunities.filter((item) => item.status === "active").length,
    industryInternships: industry.opportunities.filter((item) => String(item.track).includes("internship")).length
  };
}

function buildUpdates(jobs, industryOpportunities, now) {
  const academic = jobs
    .filter((job) => job.freshness?.highlighted)
    .filter((job) => job.recordType !== "watch_seed")
    .map((job) => ({
      id: job.id,
      kind: "job",
      type: job.freshness.type,
      labelZh: job.freshness.labelZh,
      title: job.title,
      organization: job.institution || job.sourceName,
      region: job.region,
      priority: job.priority,
      score: job.matchScore,
      sourceUrl: job.sourceUrl,
      changedAt: job.lastChangedAt || job.firstSeenAt
    }));
  const industry = industryOpportunities
    .filter((item) => item.freshness?.highlighted)
    .map((item) => ({
      id: item.id,
      kind: "industry",
      type: item.freshness.type,
      labelZh: item.freshness.labelZh,
      title: item.titleZh || item.title,
      organization: item.company,
      region: item.region,
      score: item.overallScore,
      sourceUrl: item.sourceUrl,
      changedAt: item.lastChangedAt || item.sourceUpdatedAt
    }));
  const items = [...academic, ...industry]
    .sort((a, b) => String(b.changedAt ?? "").localeCompare(String(a.changedAt ?? "")));
  return {
    windowDays: 7,
    generatedAt: now.toISOString(),
    newCount: items.filter((item) => item.type === "new").length,
    updatedCount: items.filter((item) => item.type === "updated").length,
    expiredCount: items.filter((item) => item.type === "expired").length,
    items
  };
}

function industryCompanyScore(company) {
  return Math.round(
    Number(company.supplyScore ?? 0) * 0.25
    + Number(company.salaryScore ?? 0) * 0.25
    + Number(company.feasibilityScore ?? 0) * 0.2
    + Number(company.fitScore ?? 0) * 0.15
    + Number(company.growthScore ?? 0) * 0.1
    + (100 - Number(company.identityRisk ?? 100)) * 0.05
  );
}

function industryOpportunityScore(opportunity) {
  return Math.round(
    Number(opportunity.supplyScore ?? 0) * 0.25
    + Number(opportunity.salaryScore ?? 0) * 0.25
    + Number(opportunity.feasibilityScore ?? 0) * 0.2
    + Number(opportunity.fitScore ?? 0) * 0.2
    + (100 - Number(opportunity.identityRisk ?? 100)) * 0.1
  );
}

function publicCompanyReference(company) {
  if (!company) return null;
  return {
    id: company.id,
    name: company.name,
    nameZh: company.nameZh,
    category: company.category,
    careerUrl: company.careerUrl
  };
}

function publicProfile(profile) {
  return {
    publicAudience: profile.publicAudience,
    publicSummaryZh: profile.publicSummaryZh,
    researchFields: profile.researchProfile?.coreFields ?? [],
    careerPlanSummaryZh: "重点覆盖欧洲、香港、新加坡、内地和大厂研究岗，适用于应用数学、优化与科学计算方向的 PhD/Postdoc。"
  };
}

async function readPrivateJson(realPath, examplePath, fallback) {
  const realValue = await readJson(projectRoot, realPath, null);
  if (realValue !== null) return realValue;
  return readJson(projectRoot, examplePath, fallback);
}

function mergeProfile(publicProfileConfig, privateProfileConfig) {
  return {
    ...(publicProfileConfig ?? {}),
    ...(privateProfileConfig ?? {}),
    careerPlan: {
      ...(publicProfileConfig?.careerPlan ?? {}),
      ...(privateProfileConfig?.careerPlan ?? {})
    },
    researchProfile: {
      ...(publicProfileConfig?.researchProfile ?? {}),
      ...(privateProfileConfig?.researchProfile ?? {})
    }
  };
}

function daysUntil(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateValue}T23:59:59Z`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}
