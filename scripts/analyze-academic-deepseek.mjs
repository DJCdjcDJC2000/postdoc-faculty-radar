import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./lib/env.mjs";
import { readJson, writeJson } from "./lib/read-write.mjs";
import { academicAnalysisFingerprint, normalizeAcademicAnalysis, shouldAnalyzeAcademicProfile } from "./lib/academic-deepseek-analysis.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadDotEnv(projectRoot);

const apiKey = process.env.DEEPSEEK_API_KEY;
const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
const maxProfiles = Number(process.env.DEEPSEEK_MAX_ACADEMIC_PROFILES ?? 6);
const generatedAt = new Date().toISOString();
const outputPath = "data/ai/academic-profile-analysis.json";
const [academic, existing] = await Promise.all([
  readJson(projectRoot, "public/data/academic.json", { profiles: [] }),
  readJson(projectRoot, outputPath, {}),
]);

if (!apiKey) {
  console.log("Skipped academic DeepSeek analysis because DEEPSEEK_API_KEY is not configured.");
  process.exit(0);
}

const candidates = (academic.profiles ?? [])
  .filter((profile) => shouldAnalyzeAcademicProfile(profile, existing))
  .sort((left, right) => Number(right.quality?.score ?? 0) - Number(left.quality?.score ?? 0) || String(right.lastVerifiedAt ?? "").localeCompare(String(left.lastVerifiedAt ?? "")))
  .slice(0, maxProfiles);
const next = { ...existing };

for (const profile of candidates) {
  try {
    next[profile.id] = await analyzeProfile(profile);
  } catch (error) {
    const previous = next[profile.id];
    next[profile.id] = previous?.status === "deepseek"
      ? {
          ...previous,
          lastAttemptAt: generatedAt,
          lastAttemptStatus: "error",
          lastError: String(error?.message || error).slice(0, 300),
        }
      : {
          status: "error",
          generatedAt,
          profileFingerprint: academicAnalysisFingerprint(profile),
          notice: "本轮 AI 归纳失败，保留公开事实。",
          error: String(error?.message || error).slice(0, 300),
        };
  }
}

await writeJson(projectRoot, outputPath, next);
console.log(`Analyzed ${candidates.length} academic profiles with DeepSeek.`);

async function analyzeProfile(profile) {
  const payload = {
    id: profile.id,
    name: profile.name,
    currentPosition: profile.currentPosition,
    institution: profile.institution,
    region: profile.region,
    research: profile.research,
    publicationMetrics: profile.publicationMetrics,
    representativeWorks: (profile.representativeWorks ?? []).slice(0, 10),
    timeline: profile.timeline,
    grantsAwards: profile.grantsAwards,
    recruitmentSignals: profile.recruitmentSignals,
    evidence: (profile.evidence ?? []).map((item) => ({ type: item.type, confidence: item.confidence, url: item.url })).slice(0, 20),
  };
  const prompt = [
    "你是学术人物公开情报编辑。只归纳输入中已经出现的事实，不联网、不补写未知履历、不推断录用概率。",
    "输出严格 JSON，不要 Markdown。字段：researchSummaryZh, methods, applications, careerPatternZh, caveatsZh。",
    "researchSummaryZh 用中文概括研究主线；methods/applications 为简短英文或中文数组；careerPatternZh 只总结公开教育、博后、任职变化；caveatsZh 列出计数、身份或招聘证据的限制。",
    "不得出现用户个人画像、匹配分数、申请建议、私人备注或任何 private 字段。",
  ].join("\n");
  const requestBody = {
    model,
    temperature: 0.1,
    thinking: { type: "disabled" },
    max_tokens: 1400,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: JSON.stringify(payload) },
    ],
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      if (attempt === 0 && ([408, 429].includes(response.status) || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      throw new Error(`DeepSeek HTTP ${response.status}`);
    }
    const content = (await response.json()).choices?.[0]?.message?.content;
    if (content) return normalizeAcademicAnalysis(JSON.parse(content), profile, generatedAt);
  }
  throw new Error("DeepSeek response missing message content");
}
