import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webhook = process.env.FEISHU_WEBHOOK_URL;

const alerts = await readJson("public/data/alerts.json", []);
const metadata = await readJson("public/data/metadata.json", {});
const lines = [
  `Postdoc Faculty Radar: ${alerts.length} high-priority items`,
  `Generated at: ${metadata.generatedAt ?? "unknown"}`,
  ""
];

for (const alert of alerts.slice(0, 10)) {
  lines.push(`[${alert.priority}/${alert.matchScore}] ${alert.title}`);
  lines.push(`${alert.institution} | ${alert.region} | ${alert.roleType}`);
  lines.push(alert.reason);
  lines.push(alert.sourceUrl);
  lines.push("");
}

const text = lines.join("\n").trim();

if (!webhook) {
  console.log("FEISHU_WEBHOOK_URL is not set. Preview:");
  console.log(text);
  process.exit(0);
}

const response = await fetch(webhook, {
  method: "POST",
  headers: {
    "content-type": "application/json"
  },
  body: JSON.stringify({
    msg_type: "text",
    content: {
      text
    }
  })
});

if (!response.ok) {
  throw new Error(`Feishu webhook failed: HTTP ${response.status} ${await response.text()}`);
}

console.log("Feishu notification sent.");

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}
