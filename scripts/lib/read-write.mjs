import fs from "node:fs/promises";
import path from "node:path";

export async function readJson(root, relativePath, fallback) {
  try {
    const filePath = path.join(root, relativePath);
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function copyFileEnsuringDir(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}
