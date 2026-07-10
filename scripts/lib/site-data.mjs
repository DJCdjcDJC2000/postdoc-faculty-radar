import { compareByPriorityThenDate } from "./normalize.mjs";

export function labelForRole(roleType = "unknown") {
  const labels = {
    postdoc: "博后",
    research_fellow: "Research Fellow",
    fellowship: "Fellowship",
    faculty: "教职",
    industry_research: "大厂研究岗",
    research_engineer: "研究工程岗",
    teaching: "教学岗",
    unknown: "未知"
  };
  return labels[roleType] ?? roleType;
}

export function labelForTrust(trust = "unknown") {
  const labels = {
    official: "官方源",
    academic_board: "权威平台",
    aggregator: "聚合补漏",
    company: "官方源",
    manual: "手工确认",
    lead: "线索待核验",
    unknown: "待核验"
  };
  return labels[trust] ?? trust;
}

export function buildSimpleReason(job) {
  const pieces = [
    job.region,
    labelForRole(job.roleType),
    (job.matchedKeywords ?? job.keywords ?? []).slice(0, 2).join(" / ")
  ].filter(Boolean);
  return pieces.join(" · ") || "等待补充匹配理由";
}

export function enrichJobForSite(job, aiAnalysis = null, privateState = null) {
  const simpleReason = job.simpleReason || buildSimpleReason(job);
  return {
    ...job,
    roleLabelZh: labelForRole(job.roleType),
    sourceTrustLabelZh: labelForTrust(job.trust),
    simpleReason,
    ai: aiAnalysis ?? {
      status: "rule_fallback",
      notice: "AI 辅助生成，需核验",
      summaryZh: simpleReason,
      tagsZh: (job.matchedKeywords ?? job.keywords ?? []).slice(0, 3),
      positiveZh: [simpleReason],
      negativeZh: [],
      riskZh: "需打开官方原始链接核验岗位细节。",
      nextStepZh: "收藏后检查截止日期、host 要求和申请材料。"
    },
    ...(privateState ? { private: privateState } : {})
  };
}

export function buildAlerts(jobs, limit = 30) {
  return jobs
    .filter((job) => ["A", "B"].includes(job.priority)
      && job.recordType !== "watch_seed"
      && job.lifecycleStatus !== "expired")
    .sort(compareByPriorityThenDate)
    .slice(0, limit)
    .map((job) => ({
      id: job.id,
      title: job.title,
      institution: job.institution,
      region: job.region,
      roleType: job.roleType,
      roleLabelZh: job.roleLabelZh,
      priority: job.priority,
      matchScore: job.matchScore,
      sourceName: job.sourceName,
      sourceUrl: job.sourceUrl,
      reason: job.simpleReason,
      aiSummaryZh: job.ai?.summaryZh
    }));
}

export function buildCalendar(jobs, privateActions = [], preparationPlan = null) {
  const fellowships = jobs
    .filter((job) => job.lifecycleStatus !== "expired")
    .filter((job) => job.roleType === "fellowship" || job.track === "fellowship")
    .slice(0, 20);
  const deadlines = jobs
    .filter((job) => job.deadline && job.lifecycleStatus !== "expired")
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
    .slice(0, 80);
  return {
    fellowships,
    deadlines,
    privateActions,
    preparationPlan
  };
}
