const retryableStatuses = new Set(["error", "skipped_no_key"]);

export function shouldAnalyzeJob(job, existing) {
  const previous = existing[job.id];
  return !previous
    || retryableStatuses.has(previous.status)
    || previous.jobFingerprint !== analysisFingerprint(job);
}

export function analysisFingerprint(job) {
  return [
    job.priority,
    job.matchScore,
    job.simpleReason,
    job.relevance,
    ...(job.matchedKeywords ?? [])
  ].join("|");
}
