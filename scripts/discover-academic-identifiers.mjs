import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAcademicIdentifiers, resolveHomepageIdentifiers } from "./lib/identifier-discovery.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "data", "research", "academic-identifier-discoveries.json");
const [labs, people, candidates] = await Promise.all([
  readJson("data/manual/labs.json"),
  readJson("data/manual/people.json"),
  readJson("data/research/academic-candidates.json")
]);
const records = [
  ...[...labs, ...(candidates.labs ?? [])].map((item) => ({
    id: item.id,
    name: item.leadName,
    homepage: item.homepage,
    existingOrcid: item.orcid,
    existingOpenAlex: item.openalex
  })),
  ...[...people, ...(candidates.people ?? [])].map((item) => ({
    id: item.id,
    name: item.name,
    homepage: item.homepage,
    existingOrcid: item.orcid,
    existingOpenAlex: item.openalex
  }))
].filter((item) => item.id && item.name && item.homepage && (!item.existingOrcid || !item.existingOpenAlex));

const checkedAt = new Date().toISOString();
const profiles = [];
const errors = [];
const queue = [...records];
const workers = Array.from({ length: 4 }, (_, index) => runWorker(index + 1));
await Promise.all(workers);

const candidatesFound = profiles.filter((item) => item.status === "homepage_candidate");
const review = profiles.filter((item) => item.status === "needs_review");
await writeJsonAtomically(outputPath, {
  schemaVersion: "1.0.0",
  generatedAt: checkedAt,
  methodNoteZh: "只提取已核验主页中显式链接的书目标识；唯一标识还需由对应书目服务的作者姓名再次确认。",
  counts: {
    checked: profiles.length,
    candidates: candidatesFound.length,
    review: review.length,
    errors: errors.length
  },
  profiles: candidatesFound,
  review,
  errors
});
console.log(`Checked ${profiles.length} homepages: ${candidatesFound.length} identifier candidates, ${review.length} review, ${errors.length} errors.`);

async function runWorker(workerId) {
  while (queue.length) {
    const item = queue.shift();
    if (!item) return;
    try {
      const response = await fetch(item.homepage, {
        headers: { "User-Agent": "postdoc-faculty-radar/0.1 (+https://github.com/DJCdjcDJC2000/postdoc-faculty-radar)" },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const decision = resolveHomepageIdentifiers(item, extractAcademicIdentifiers(html), checkedAt);
      decision.existingOrcid = item.existingOrcid ?? null;
      decision.existingOpenAlex = item.existingOpenAlex ?? null;
      profiles.push(decision);
      console.log(`[worker ${workerId}] ${profiles.length}/${records.length} ${item.name}: ${decision.status}`);
    } catch (error) {
      errors.push({ id: item.id, name: item.name, sourceUrl: item.homepage, error: error.message });
      console.warn(`[worker ${workerId}] ${item.name}: ${error.message}`);
    }
    await delay(250);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
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
