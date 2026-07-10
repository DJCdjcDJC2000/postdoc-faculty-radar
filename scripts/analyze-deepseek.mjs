import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./lib/env.mjs";
import { readJson, writeJson } from "./lib/read-write.mjs";
import { analysisFingerprint, shouldAnalyzeJob } from "./lib/deepseek-analysis.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadDotEnv(projectRoot);

const mode = readArg("mode") ?? "public";
const maxItems = Number(process.env.DEEPSEEK_MAX_ITEMS ?? 12);
const apiKey = process.env.DEEPSEEK_API_KEY;
const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const generatedAt = new Date().toISOString();
const outputPath = mode === "private" ? "data/private/job-analysis.json" : "data/ai/job-analysis.json";

const [jobs, publicProfileConfig, privateProfileConfig, publicExisting, privateExisting] = await Promise.all([
  readJson(projectRoot, "data/generated/jobs.json", []),
  readJson(projectRoot, "config/profile.json", {}),
  mode === "private" ? readJson(projectRoot, "config/profile.private.json", null) : null,
  readJson(projectRoot, "data/ai/job-analysis.json", {}),
  mode === "private" ? readJson(projectRoot, "data/private/job-analysis.json", {}) : {}
]);

const profile = mergeProfile(publicProfileConfig, mode === "private" ? privateProfileConfig : null);
const existing = mode === "private" ? { ...publicExisting, ...privateExisting } : publicExisting;
const candidates = jobs
  .filter((job) => shouldAnalyzeJob(job, existing))
  .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
  .slice(0, maxItems);

const next = { ...existing };

for (const job of candidates) {
  if (!apiKey) {
    next[job.id] = fallbackAnalysis(job, "skipped_no_key");
    continue;
  }
  try {
    next[job.id] = await analyzeJob(job, profile, mode);
  } catch (error) {
    next[job.id] = {
      ...fallbackAnalysis(job, "error"),
      error: error.message
    };
  }
}

await writeJson(projectRoot, outputPath, next);
console.log(`Analyzed ${candidates.length} jobs with mode=${mode}, api=${apiKey ? "deepseek" : "fallback"}.`);

async function analyzeJob(job, profile, mode) {
  const publicPayload = {
    title: job.title,
    institution: job.institution,
    department: job.department,
    region: job.region,
    country: job.country,
    roleType: job.roleType,
    deadline: job.deadline,
    sourceName: job.sourceName,
    description: job.description,
    matchedKeywords: job.matchedKeywords,
    matchScore: job.matchScore,
    priority: job.priority
  };
  const privateProfile = mode === "private"
    ? {
        expectedGraduation: profile.degreeTimeline?.expectedGraduation,
        education: profile.degreeTimeline,
        researchProfile: profile.researchProfile,
        careerPlan: profile.careerPlan
      }
    : null;

  const prompt = [
    "你是一个冷静的学术职业情报分析员。请只基于给定公开岗位信息分析，不要编造没有出现的事实。",
    "输出严格 JSON，不要 Markdown。",
    "字段：summaryZh, tagsZh, positiveZh, negativeZh, riskZh, nextStepZh, depth, notice。",
    mode === "private"
      ? "private 模式还要输出 personalAnalysisZh 和 gapAnalysisZh；可以使用给定个人画像，但不要涉及私人备注。"
      : "public 模式不要输出个人画像、私人建议或 private 字段。",
    "notice 固定为：AI 辅助生成，需核验。"
  ].join("\n");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ job: publicPayload, profile: privateProfile }, null, 2) }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek response missing message content");
  }
  const parsed = JSON.parse(content);
  return normalizeAnalysis(parsed, job, "deepseek");
}

function normalizeAnalysis(value, job, status) {
  const fallback = fallbackAnalysis(job, status);
  return {
    status,
    generatedAt,
    jobFingerprint: analysisFingerprint(job),
    notice: "AI 辅助生成，需核验",
    summaryZh: stringOr(value.summaryZh, fallback.summaryZh),
    tagsZh: arrayOr(value.tagsZh, fallback.tagsZh).slice(0, 6),
    positiveZh: arrayOr(value.positiveZh, fallback.positiveZh).slice(0, 6),
    negativeZh: arrayOr(value.negativeZh, fallback.negativeZh).slice(0, 6),
    riskZh: stringOr(value.riskZh, fallback.riskZh),
    nextStepZh: stringOr(value.nextStepZh, fallback.nextStepZh),
    depth: value.depth ?? (["A", "B"].includes(job.priority) ? "deep" : "light"),
    personalAnalysisZh: value.personalAnalysisZh,
    gapAnalysisZh: value.gapAnalysisZh
  };
}

function fallbackAnalysis(job, status) {
  const tags = (job.matchedKeywords ?? job.keywords ?? []).slice(0, 4);
  const region = job.region ? `${job.region}地区` : "目标地区";
  const role = job.roleLabelZh || job.roleType || "岗位";
  return {
    status,
    generatedAt,
    jobFingerprint: analysisFingerprint(job),
    notice: "AI 辅助生成，需核验",
    summaryZh: `${region}的${role}机会，规则评分为 ${job.priority ?? "D"} ${job.matchScore ?? 0}。`,
    tagsZh: tags,
    positiveZh: [job.simpleReason ?? `${region} · ${role}`],
    negativeZh: [],
    riskZh: "尚未完成 DeepSeek 深度分析；申请前需要核验官方原文、截止日期和材料要求。",
    nextStepZh: ["A", "B"].includes(job.priority)
      ? "优先打开官方链接，确认 host、申请材料和时间线。"
      : "先入库观察，除非后续出现强方向匹配信号。",
    depth: ["A", "B"].includes(job.priority) ? "deep" : "light"
  };
}

function arrayOr(value, fallback) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : fallback;
}

function stringOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function readArg(name) {
  const eq = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}
