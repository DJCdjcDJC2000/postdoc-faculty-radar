const PRIVATE_KEYS = new Set([
  "private",
  "_private",
  "myStage",
  "myPriority",
  "privateNotes",
  "contactRecords",
  "materialStatus",
  "applicationSystemStatus",
  "reminderAt",
  "archiveReason",
  "personalAnalysis",
  "personalAnalysisZh",
  "gapAnalysis",
  "gapAnalysisZh",
  "privateAi",
  "preparationPlan",
  "privateSummaryZh"
]);

export function stripPrivateFields(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripPrivateFields(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_KEYS.has(key)) continue;
    result[key] = stripPrivateFields(item);
  }
  return result;
}

export function assertNoPrivateFields(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_KEYS.has(key)) {
      throw new Error(`Private field leaked at ${path}.${key}`);
    }
    assertNoPrivateFields(item, `${path}.${key}`);
  }
}
