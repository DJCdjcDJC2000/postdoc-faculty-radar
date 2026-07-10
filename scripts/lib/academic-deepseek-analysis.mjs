import crypto from "node:crypto";

export function academicAnalysisFingerprint(profile) {
  const payload = {
    id: profile.id,
    position: profile.currentPosition,
    institution: profile.institution,
    research: {
      tags: profile.research?.tags,
      recentEvolution: profile.research?.recentEvolution,
    },
    publicationMetrics: {
      worksCount: profile.publicationMetrics?.worksCount,
      recentWorksCount: profile.publicationMetrics?.recentWorksCount,
      citedByCount: profile.publicationMetrics?.citedByCount ?? profile.publicationMetrics?.citationCount,
      hIndex: profile.publicationMetrics?.hIndex,
      provider: profile.publicationMetrics?.provider,
      topVenueCountsLowerBound: profile.publicationMetrics?.topVenueCountsLowerBound,
    },
    representativeWorks: (profile.representativeWorks ?? []).map((work) => ({ title: work.title, year: work.year, venue: work.venue })),
    timeline: profile.timeline,
    grantsAwards: profile.grantsAwards,
    recruitmentSignals: (profile.recruitmentSignals ?? []).map((signal) => ({
      type: signal.type,
      summaryZh: signal.summaryZh,
      sourceUrl: signal.sourceUrl,
      expiresAt: signal.expiresAt,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function shouldAnalyzeAcademicProfile(profile, existing = {}) {
  const previous = existing[profile.id];
  return !previous || previous.profileFingerprint !== academicAnalysisFingerprint(profile);
}

export function normalizeAcademicAnalysis(value, profile, generatedAt) {
  return {
    status: "deepseek",
    generatedAt,
    profileFingerprint: academicAnalysisFingerprint(profile),
    notice: "AI 辅助归纳，需回到公开证据核验",
    researchSummaryZh: text(value.researchSummaryZh, profile.research?.summaryZh || "公开研究概况待补充。"),
    methods: strings(value.methods, profile.research?.methods).slice(0, 10),
    applications: strings(value.applications, profile.research?.applications).slice(0, 10),
    careerPatternZh: text(value.careerPatternZh, fallbackCareerPattern(profile)),
    caveatsZh: strings(value.caveatsZh, ["论文计数与招聘状态需以原始来源为准。"]),
  };
}

function fallbackCareerPattern(profile) {
  const timeline = (profile.timeline ?? []).map((item) => [item.degree, item.role, item.position, item.institution].filter(Boolean).join(" · ")).filter(Boolean);
  return timeline.length ? `公开经历依次包括：${timeline.join("；")}。` : "公开经历尚不足以形成可靠的职业路径归纳。";
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strings(value, fallback = []) {
  return [...new Set((Array.isArray(value) ? value : fallback ?? []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}
