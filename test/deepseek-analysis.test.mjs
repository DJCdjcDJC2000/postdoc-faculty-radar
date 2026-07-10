import test from "node:test";
import assert from "node:assert/strict";
import { analysisFingerprint, shouldAnalyzeJob } from "../scripts/lib/deepseek-analysis.mjs";

const job = {
  id: "job-1",
  priority: "A",
  matchScore: 92,
  simpleReason: "Strong research match",
  relevance: "high",
  matchedKeywords: ["optimization", "machine learning"]
};

test("DeepSeek analysis selects unseen jobs", () => {
  assert.equal(shouldAnalyzeJob(job, {}), true);
});

test("DeepSeek analysis retries fallback and error results", () => {
  for (const status of ["skipped_no_key", "error"]) {
    assert.equal(shouldAnalyzeJob(job, {
      [job.id]: { status, jobFingerprint: analysisFingerprint(job) }
    }), true);
  }
});

test("DeepSeek analysis skips unchanged completed results", () => {
  assert.equal(shouldAnalyzeJob(job, {
    [job.id]: { status: "deepseek", jobFingerprint: analysisFingerprint(job) }
  }), false);
});

test("DeepSeek analysis reruns when the job fingerprint changes", () => {
  assert.equal(shouldAnalyzeJob({ ...job, matchScore: 95 }, {
    [job.id]: { status: "deepseek", jobFingerprint: analysisFingerprint(job) }
  }), true);
});
