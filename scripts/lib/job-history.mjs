const DEFAULT_WINDOW_DAYS = 7;

export function reconcileJobHistory({
  currentJobs,
  previousJobs = [],
  sources = [],
  now = new Date(),
  offline = false,
  windowDays = DEFAULT_WINDOW_DAYS
}) {
  const nowDate = toDate(now) ?? new Date();
  const nowIso = nowDate.toISOString();
  const previousById = new Map(previousJobs.map((job) => [job.id, job]));
  const currentIds = new Set(currentJobs.map((job) => job.id));
  const next = currentJobs.map((job) => mergeCurrentJob(job, previousById.get(job.id), nowDate, nowIso, windowDays));

  for (const previous of previousJobs) {
    if (currentIds.has(previous.id)) continue;
    if (!isFetchedJob(previous)) continue;

    if (offline || !sourceWasSuccessfullyChecked(previous, sources)) {
      next.push(clearOldChange({ ...previous, stale: true }, nowDate, windowDays));
      continue;
    }

    if (previous.lifecycleStatus === "expired") {
      next.push(clearOldChange(previous, nowDate, windowDays));
      continue;
    }

    next.push({
      ...previous,
      status: "expired",
      lifecycleStatus: "expired",
      lifecycleLabelZh: "已失效/已截止",
      changeType: "expired",
      lastChangedAt: nowIso,
      archivedAt: nowIso,
      stale: false
    });
  }

  return next;
}

export function freshnessFor(record, now = new Date(), windowDays = DEFAULT_WINDOW_DAYS) {
  const nowDate = toDate(now) ?? new Date();
  const changedAt = toDate(record.lastChangedAt ?? record.firstSeenAt ?? record.sourceUpdatedAt);
  const withinWindow = changedAt && daysBetween(changedAt, nowDate) <= windowDays;
  const lifecycleStatus = record.lifecycleStatus ?? inferLifecycle(record, nowDate);

  if (lifecycleStatus === "expired") {
    return {
      type: "expired",
      labelZh: "已失效/已截止",
      highlighted: Boolean(withinWindow)
    };
  }

  if (!withinWindow) return null;
  if (record.changeType === "new") return { type: "new", labelZh: "本周新增", highlighted: true };
  if (record.changeType === "updated") return { type: "updated", labelZh: "本周更新", highlighted: true };
  if (record.firstSeenAt && daysBetween(toDate(record.firstSeenAt), nowDate) <= windowDays) {
    return { type: "new", labelZh: "本周新增", highlighted: true };
  }
  if (record.sourceUpdatedAt) return { type: "updated", labelZh: "本周更新", highlighted: true };
  return null;
}

export function jobFingerprint(job) {
  return JSON.stringify({
    title: job.title ?? "",
    institution: job.institution ?? "",
    department: job.department ?? "",
    description: job.description ?? "",
    deadline: job.deadline ?? "",
    sourceUrl: job.sourceUrl ?? "",
    roleType: job.roleType ?? "",
    priority: job.priority ?? "",
    matchScore: job.matchScore ?? 0,
    relevance: job.relevance ?? "",
    keywords: job.matchedKeywords ?? job.keywords ?? []
  });
}

function mergeCurrentJob(job, previous, nowDate, nowIso, windowDays) {
  const firstSeenAt = previous?.firstSeenAt
    ?? previous?.createdAt
    ?? previous?.fetchedAt
    ?? previous?.updatedAt
    ?? job.firstSeenAt
    ?? job.createdAt
    ?? job.fetchedAt
    ?? nowIso;
  const changed = Boolean(previous && jobFingerprint(previous) !== jobFingerprint(job));
  const expired = inferLifecycle(job, nowDate) === "expired";
  const wasExpired = previous?.lifecycleStatus === "expired";
  const lastChangedAt = expired && !wasExpired
    ? nowIso
    : changed
      ? nowIso
      : previous?.lastChangedAt ?? firstSeenAt;
  let changeType = !previous ? "new" : changed ? "updated" : previous.changeType;
  if (expired) changeType = wasExpired ? previous?.changeType : "expired";
  if (!isWithinWindow(lastChangedAt, nowDate, windowDays)) changeType = null;

  return {
    ...previous,
    ...job,
    status: expired ? "expired" : normalizeActiveStatus(job.status),
    lifecycleStatus: expired ? "expired" : job.evergreen || job.status === "watchlist" ? "watchlist" : "active",
    lifecycleLabelZh: expired ? "已失效/已截止" : job.evergreen || job.status === "watchlist" ? "长期关注" : "当前有效",
    firstSeenAt,
    lastSeenAt: nowIso,
    lastChangedAt,
    changeType,
    archivedAt: expired ? previous?.archivedAt ?? nowIso : null,
    stale: false
  };
}

function clearOldChange(job, nowDate, windowDays) {
  if (isWithinWindow(job.lastChangedAt ?? job.firstSeenAt, nowDate, windowDays)) return job;
  return { ...job, changeType: null };
}

function normalizeActiveStatus(status) {
  if (["watchlist", "watch"].includes(status)) return "watchlist";
  return "active";
}

function inferLifecycle(job, nowDate) {
  if (job.status === "expired" || job.status === "historical") return "expired";
  if (job.deadline && !job.evergreen) {
    const deadline = toDate(`${job.deadline}T23:59:59Z`);
    if (deadline && deadline < nowDate) return "expired";
  }
  if (job.evergreen || job.status === "watchlist" || job.status === "watch") return "watchlist";
  return "active";
}

function sourceWasSuccessfullyChecked(job, sources) {
  const source = sources.find((item) =>
    (job.sourceId && item.id === job.sourceId)
    || (job.sourceName && item.name === job.sourceName)
    || (job.originalSourceUrl && item.url === job.originalSourceUrl)
  );
  return Boolean(source && ["ok", "no_candidates"].includes(source.status));
}

function isFetchedJob(job) {
  return Boolean(job.sourceId || job.fetchedAt || job.originalSourceUrl);
}

function isWithinWindow(value, nowDate, windowDays) {
  const date = toDate(value);
  return Boolean(date && daysBetween(date, nowDate) <= windowDays);
}

function daysBetween(start, end) {
  if (!start || !end) return Number.POSITIVE_INFINITY;
  return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
