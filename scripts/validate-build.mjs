import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoPrivateFields } from "./lib/privacy.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicSite = JSON.parse(await fs.readFile(path.join(projectRoot, "public", "data", "site.json"), "utf8"));

assertNoPrivateFields(publicSite);

if (publicSite.mode !== "public") {
  throw new Error("public/data/site.json must be built in public mode");
}

if (!Array.isArray(publicSite.jobs) || publicSite.jobs.length === 0) {
  throw new Error("public build must contain jobs");
}

for (const job of publicSite.jobs) {
  for (const key of ["title", "institution", "region", "roleType", "sourceTrustLabelZh"]) {
    if (!job[key]) {
      throw new Error(`Public job ${job.id ?? job.title} missing ${key}`);
    }
  }
  if (job.recordType !== "watch_seed" && !job.sourceUrl) {
    throw new Error(`Public job ${job.id ?? job.title} missing sourceUrl`);
  }
  if (["A", "B"].includes(job.priority) && !job.simpleReason && !job.ai?.summaryZh) {
    throw new Error(`High-priority job ${job.id ?? job.title} missing match reason`);
  }
}

if ((publicSite.industry?.companies ?? []).length < 30) {
  throw new Error("public build must contain the industry company radar");
}

if ((publicSite.industry?.people ?? []).length < 50) {
  throw new Error("public build must contain the industry people database");
}

if (publicSite.industry?.private) {
  throw new Error("public industry build must not include private planning data");
}

console.log("Build validation passed.");
