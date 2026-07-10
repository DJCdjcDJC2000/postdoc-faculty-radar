import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAcademicTargets } from "./enrich-academic-openalex.mjs";
import { resolveOrcidSearch } from "./lib/identifier-discovery.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "data", "research", "academic-orcid-search-discoveries.json");
const { targets } = await loadAcademicTargets(projectRoot, { includeOrcidSearchDiscoveries: false });
const queue = targets.filter((target) => !target.explicitOrcid);
const checkedAt = new Date().toISOString();
const decisions = [];
const errors = [];
await Promise.all(Array.from({ length: 3 }, (_, index) => runWorker(index + 1)));

const profiles = decisions.filter((item) => item.status === "confirmed_candidate");
const review = decisions.filter((item) => item.status === "needs_review");
await writeJsonAtomically(outputPath, {
  schemaVersion: "1.0.0",
  generatedAt: checkedAt,
  methodNoteZh: "使用 ORCID 官方 expanded-search；只有姓名相似度不低于 0.94 且机构相似度不低于 0.6 的唯一记录进入二次校验。",
  thresholds: { nameSimilarity: 0.94, institutionSimilarity: 0.6 },
  counts: {
    checked: decisions.length,
    candidates: profiles.length,
    review: review.length,
    errors: errors.length
  },
  profiles,
  review,
  errors
});
console.log(`ORCID search checked ${decisions.length}: ${profiles.length} candidates, ${review.length} review, ${errors.length} errors.`);

async function runWorker(workerId) {
  while (queue.length) {
    const target = queue.shift();
    if (!target) return;
    try {
      const query = `given-and-family-names:\"${target.name}\"`;
      const url = `https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(query)}`;
      const payload = await fetchJsonWithRetry(url);
      const decision = resolveOrcidSearch(target, payload["expanded-result"] ?? [], checkedAt);
      decisions.push(decision);
      console.log(`[worker ${workerId}] ${decisions.length}/${targets.length} ${target.name}: ${decision.status}`);
    } catch (error) {
      errors.push({ id: target.internalId, name: target.name, error: error.message });
      console.warn(`[worker ${workerId}] ${target.name}: ${error.message}`);
    }
    await delay(300);
  }
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "postdoc-faculty-radar/0.1 (+https://github.com/DJCdjcDJC2000/postdoc-faculty-radar)"
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 3) throw new Error(`HTTP ${response.status}`);
    await delay((attempt + 1) * 1_000);
  }
}

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
