import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertNoPrivateFields } from "../scripts/lib/privacy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("faculty atlas is available through both portal entry points", async () => {
  const app = await fs.readFile(path.join(root, "src/site/app.js"), "utf8");
  assert.equal((app.match(/href="\.\/faculty-atlas\/index\.html"/g) ?? []).length, 2);
  const html = await fs.readFile(path.join(root, "src/site/faculty-atlas/index.html"), "utf8");
  assert.ok(html.includes('href="../#home"'));
  assert.ok(html.includes('src="./app.js"'));
});

test("faculty atlas preserves the public dataset and distinct identities", async () => {
  const data = JSON.parse(await fs.readFile(path.join(root, "src/site/faculty-atlas/data.json"), "utf8"));
  assertNoPrivateFields(data);
  assert.ok(data.people.length > 0);
  assert.equal(new Set(data.people.map(person => person.id)).size, data.people.length);
  const tang = data.people.filter(person => person.name === "Rong Tang");
  assert.deepEqual(tang.map(person => person.school).sort(), ["HKUST", "PolyU"]);
  for (const person of data.people) {
    assert.ok(person.sources.length > 0);
    assert.ok(person.sources.every(url => /^https?:\/\//.test(url)));
  }
});

test("faculty atlas analysis links to existing evidence and retains corrected dates", async () => {
  const data = JSON.parse(await fs.readFile(path.join(root, "src/site/faculty-atlas/data.json"), "utf8"));
  const ids = new Set(data.people.map(person => person.id));
  for (const route of data.analysis.routes) {
    for (const item of route.cases) assert.ok(ids.has(item.personId));
    assert.ok(route.questions.length > 0);
  }
  assert.ok(data.analysis.roadmap.length > 0);
  assert.match(data.people.find(person => person.id === "P071").joined, /2014-08-01/);
  assert.match(data.people.find(person => person.id === "P088").joined, /2021-11-01/);
  const html = await fs.readFile(path.join(root, "src/site/faculty-atlas/index.html"), "utf8");
  const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(htmlIds).size, htmlIds.length);
});
