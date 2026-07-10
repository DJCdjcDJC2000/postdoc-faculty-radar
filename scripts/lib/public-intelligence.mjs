const LAB_PERSONAL_KEYS = new Set([
  "matchLevel",
  "matchScore",
  "fitZh",
  "whyTrackZh"
]);

const ACADEMIC_PERSONAL_KEYS = new Set([
  "priority",
  "learningsZh",
  "risksZh"
]);

const INDUSTRY_COMPANY_PERSONAL_KEYS = new Set([
  "priority",
  "fitScore",
  "feasibilityScore",
  "identityRisk",
  "overallScore",
  "whyTrackZh"
]);

const INDUSTRY_OPPORTUNITY_PERSONAL_KEYS = new Set([
  "priority",
  "availabilityZh",
  "summaryZh",
  "timingFit",
  "fitScore",
  "feasibilityScore",
  "identityRisk",
  "overallScore",
  "whyTrackZh"
]);

const INDUSTRY_PERSON_PERSONAL_KEYS = new Set([
  "priority",
  "replicabilityScore",
  "replicabilityZh",
  "learningsZh",
  "risksZh"
]);

const INDUSTRY_UPDATE_PERSONAL_KEYS = new Set(["score"]);

export function sanitizePublicLab(lab) {
  return omitKeys(lab, LAB_PERSONAL_KEYS);
}

export function sanitizePublicAcademicPerson(person) {
  const sanitized = omitKeys(person, ACADEMIC_PERSONAL_KEYS);
  if (!sanitized.ai || typeof sanitized.ai !== "object") {
    return sanitized;
  }
  return {
    ...sanitized,
    ai: omitKeys(sanitized.ai, ACADEMIC_PERSONAL_KEYS)
  };
}

export function sanitizePublicIndustryCompany(company) {
  return omitKeys(company, INDUSTRY_COMPANY_PERSONAL_KEYS);
}

export function sanitizePublicIndustryOpportunity(opportunity) {
  return omitKeys(opportunity, INDUSTRY_OPPORTUNITY_PERSONAL_KEYS);
}

export function sanitizePublicIndustryPerson(person) {
  return omitKeys(person, INDUSTRY_PERSON_PERSONAL_KEYS);
}

export function sanitizePublicIndustry(industry) {
  return {
    ...industry,
    companies: industry.companies.map(sanitizePublicIndustryCompany),
    opportunities: industry.opportunities.map(sanitizePublicIndustryOpportunity),
    people: industry.people.map(sanitizePublicIndustryPerson)
  };
}

export function sanitizePublicIntelligence(siteData) {
  return {
    ...siteData,
    people: siteData.people.map(sanitizePublicAcademicPerson),
    labs: siteData.labs.map(sanitizePublicLab),
    industry: sanitizePublicIndustry(siteData.industry),
    updates: sanitizePublicUpdates(siteData.updates)
  };
}

export function sanitizeIntelligenceForBuild(siteData, mode) {
  return mode === "public" ? sanitizePublicIntelligence(siteData) : siteData;
}

function sanitizePublicUpdates(updates) {
  if (!updates?.items) return updates;
  return {
    ...updates,
    items: updates.items.map((item) => (
      item.kind === "industry" ? omitKeys(item, INDUSTRY_UPDATE_PERSONAL_KEYS) : item
    ))
  };
}

function omitKeys(value, keys) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.has(key))
  );
}
