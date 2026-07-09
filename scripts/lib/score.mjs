import { normalizeWhitespace } from "./normalize.mjs";

export function findKeywordHits(text, config) {
  const haystack = normalizeWhitespace(text);
  const terms = config.terms ?? {};
  const hitGroup = (groupName) => {
    const values = terms[groupName] ?? [];
    return values.filter((term) => termMatches(haystack, term));
  };
  return {
    strong: hitGroup("strong"),
    medium: hitGroup("medium"),
    negative: hitGroup("negative")
  };
}

function termMatches(text, term) {
  const value = String(term);
  if (!value) return false;
  const haystack = text.toLowerCase();
  const needle = value.toLowerCase();
  const asciiOnly = /^[\x00-\x7F]+$/.test(value);
  if (!asciiOnly) return haystack.includes(needle);
  if (needle.length <= 3 || /^[a-z0-9]+$/i.test(value)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  }
  return haystack.includes(needle);
}

export function inferRoleType(text, sourceDefaultRoleTypes = [], config = {}) {
  const haystack = normalizeWhitespace(text).toLowerCase();
  const hints = config.roleHints ?? {};
  for (const [role, values] of Object.entries(hints)) {
    if (values.some((term) => haystack.includes(String(term).toLowerCase()))) {
      return role;
    }
  }
  return sourceDefaultRoleTypes[0] ?? "unknown";
}

export function scoreJob(job, config, now = new Date()) {
  const text = [
    job.title,
    job.institution,
    job.department,
    job.description,
    job.sourceName,
    job.sourceUrl,
    ...(job.keywords ?? [])
  ].join(" ");
  const hits = findKeywordHits(text, config);
  const regionScore = config.regions?.[job.region] ?? 0;
  const roleScore = config.roleTypes?.[job.roleType] ?? 0;
  const trustScore = config.sourceTrust?.[job.trust] ?? config.sourceTrust?.[job.sourceTrust] ?? 0;
  const keywordScore = hits.strong.length * 8 + hits.medium.length * 4 - hits.negative.length * 8;
  const timingScore = getTimingScore(job, now);
  const evergreenScore = job.evergreen ? 5 : 0;
  const hasFieldSignal = hits.strong.length + hits.medium.length > 0 || job.fieldRelevantSource || job.evergreen;
  const genericPenalty = hasFieldSignal ? 0 : -25;
  const score = Math.max(0, regionScore + roleScore + trustScore + keywordScore + timingScore + evergreenScore + genericPenalty);
  return {
    matchScore: Math.min(100, score),
    priority: priorityFromScore(score),
    matchedKeywords: [...new Set([...hits.strong, ...hits.medium])],
    negativeKeywords: hits.negative
  };
}

export function priorityFromScore(score) {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function getTimingScore(job, now) {
  if (!job.deadline) return job.evergreen ? 4 : 0;
  const deadline = new Date(`${job.deadline}T23:59:59Z`);
  if (Number.isNaN(deadline.getTime())) return 0;
  const days = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  if (days < 0) return -100;
  if (days <= 30) return 12;
  if (days <= 120) return 10;
  return 6;
}
