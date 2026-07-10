import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndustryCandidateDataset } from "./lib/industry-candidates.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [people, research] = await Promise.all([
  readJson(path.join(projectRoot, "data", "manual", "industry-people.json")),
  readJson(path.join(projectRoot, "data", "research", "candidates-industry-2026-07-10.json"))
]);
const dataset = buildIndustryCandidateDataset(people, research);
const output = path.join(projectRoot, "data", "research", "industry-people-curated.json");
await writeJsonAtomically(output, dataset);
console.log(`Wrote ${dataset.counts.final} industry people (${dataset.counts.inserted} inserted, ${dataset.counts.removed} removed).`);
if (dataset.review.length) console.log(`${dataset.review.length} candidates require review.`);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}
