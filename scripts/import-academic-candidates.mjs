import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAcademicCandidateDataset } from "./lib/academic-candidates.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const researchDir = path.join(projectRoot, "data", "research");
const outputPath = path.join(researchDir, "academic-candidates.json");

const names = (await fs.readdir(researchDir))
  .filter((name) => /^candidates-.*\.json$/i.test(name))
  .sort();
const documents = await Promise.all(names.map((name) => readJson(path.join(researchDir, name))));
const [labs, people] = await Promise.all([
  readJson(path.join(projectRoot, "data", "manual", "labs.json")),
  readJson(path.join(projectRoot, "data", "manual", "people.json"))
]);
const dataset = buildAcademicCandidateDataset(documents, { labs, people });
dataset.sourceFiles = names;
await writeJsonAtomically(outputPath, dataset);
console.log(`Wrote ${dataset.counts.labs} labs and ${dataset.counts.people} young scholars to ${path.relative(projectRoot, outputPath)}.`);
if (dataset.review.length) console.log(`${dataset.review.length} candidates require review.`);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}
