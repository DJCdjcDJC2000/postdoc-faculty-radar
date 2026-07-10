import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isConfirmedOpenAlexProfile } from "./lib/academic-enrichment.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputArgument = process.argv[2] ?? "output/research/openalex-explicit-academic.json";
const inputPath = path.resolve(projectRoot, inputArgument);
const outputPath = path.join(projectRoot, "data", "research", "academic-enrichment.json");
const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
if (input.provider !== "OpenAlex" || !Array.isArray(input.profiles)) {
  throw new Error("Input is not a supported OpenAlex academic enrichment artifact");
}
const profiles = input.profiles.filter(isConfirmedOpenAlexProfile);
if (!profiles.length) throw new Error("Input contains no confirmed OpenAlex profiles");
const output = {
  schemaVersion: input.schemaVersion,
  provider: "OpenAlex",
  generatedAt: input.generatedAt,
  fetchedAt: input.fetchedAt,
  window: input.window,
  resolutionPolicy: input.resolutionPolicy,
  workSelectionPolicy: input.workSelectionPolicy,
  profiles
};
await writeJsonAtomically(outputPath, output);
console.log(`Materialized ${profiles.length} confirmed profiles to ${path.relative(projectRoot, outputPath)}.`);

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}
