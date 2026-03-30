function dashboardNormalizeDay(value) {
  const normalizeDay = globalThis.FlockTrackLogic?.normalizeDay;
  if (typeof normalizeDay === "function") return normalizeDay(value);
  if (!value) return "";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

function dashboardFeedDay(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return dashboardNormalizeDay(raw);
}

function dashboardLocalIso(dayValue, hour, minute = 0) {
  const day = dashboardFeedDay(dayValue);
  if (!day) return `${today()}T00:00:00`;
  const h = Math.max(0, Math.min(23, Number(hour) || 0));
  const m = Math.max(0, Math.min(59, Number(minute) || 0));
  return `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function dashboardRequiredFeedLogs(dayValue, now = new Date()) {
  const day = dashboardFeedDay(dayValue);
  if (!day) return 2;
  return day === today() && now.getHours() < 12 ? 1 : 2;
}

function dashboardBuildFeedLoggedAt(dayValue, existingLogCount, now = new Date()) {
  const day = dashboardFeedDay(dayValue) || today();
  if (existingLogCount <= 0) return dashboardLocalIso(day, 7, 0);
  if (existingLogCount === 1) return dashboardLocalIso(day, 17, 0);
  return dashboardLocalIso(day, now.getHours(), now.getMinutes());
}

function dashboardFmtFeedLoggedAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return /T\d{2}:\d{2}/.test(raw) ? fmtDateTime(raw) : fmtDate(raw);
}

function dashboardFeedTypeSackKgText(feedType) {
  const value = Number(feedType?.sackKg);
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

const DASHBOARD_FEED_UNIT_SLIDES = [{
  id: "kg",
  label: "kg",
  color: "#b45309"
}, {
  id: "g",
  label: "g",
  color: "#b45309"
}, {
  id: "lb",
  label: "lb",
  color: "#b45309"
}, {
  id: "sack",
  label: "sack",
  color: "#b45309"
}];

const DASHBOARD_CLOUD_NOTICE_KEY = "flocktrack-overview-cloud-save-notice-v1";
const DASHBOARD_DEFAULT_CLOUD_NOTICE = {
  level: "info",
  message: "No cloud save yet."
};

function dashboardReadCloudNotice() {
  try {
    const raw = window?.localStorage?.getItem(DASHBOARD_CLOUD_NOTICE_KEY);
    if (!raw) return DASHBOARD_DEFAULT_CLOUD_NOTICE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DASHBOARD_DEFAULT_CLOUD_NOTICE;
    const level = ["info", "success", "error"].includes(parsed.level) ? parsed.level : "info";
    const message = typeof parsed.message === "string" && parsed.message.trim() ? parsed.message : DASHBOARD_DEFAULT_CLOUD_NOTICE.message;
    return {
      level,
      message
    };
  } catch {
    return DASHBOARD_DEFAULT_CLOUD_NOTICE;
  }
}

function dashboardWriteCloudNotice(notice) {
  try {
    if (!window?.localStorage) return;
    window.localStorage.setItem(DASHBOARD_CLOUD_NOTICE_KEY, JSON.stringify(notice || DASHBOARD_DEFAULT_CLOUD_NOTICE));
  } catch {}
}

function dashboardPenThemeOptions() {
  const list = globalThis.FLOCK_TRACK_PEN_THEMES;
  if (Array.isArray(list) && list.length) return list;
  return [{
    id: "default",
    woodA: "#bc8a5f",
    woodB: "#b98253",
    woodC: "#c29167",
    latestBg: "#fff7ec",
    latestBorder: "#f5d7b0",
    latestKicker: "#9a3412",
    quickColor: "#c2410c"
  }];
}

function dashboardLatestPhotoWithImage(photos) {
  const list = Array.isArray(photos) ? photos : [];
  for (let idx = list.length - 1; idx >= 0; idx--) {
    const photo = list[idx];
    if (photo?.dataUrl) return photo;
  }
  return null;
}

function formatDashboardWeightDisplay(value, unit) {
  const inGrams = fmtWeightGrams(value, unit);
  if (inGrams) return inGrams;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const normalizedUnit = String(unit || "").trim();
  return `${fmtNum(numeric)} ${normalizedUnit}`.trim();
}

function Dashboard({
  birds,
  batches,
  measurements,
  reminders,
  pens,
  feedTypes,
  penFeedLogs,
  onOpenSection,
  onOpenBird,
  onOpenBatch,
  onOpenPen,
  onUpdateBird,
  onUpdateBatch,
  onUpdatePen,
  onAddMeasurement,
  onAddPenFeedLog,
  onPushToGist,
  photoCache,
  ensureBirdPhotos
}) {
  const HATCH_ALERT_WINDOW_DAYS = globalThis.FlockTrackLogic?.HATCH_ALERT_WINDOW_DAYS || 2;
  const INCUBATION_REMINDER_WINDOW_DAYS = globalThis.FlockTrackLogic?.INCUBATION_REMINDER_WINDOW_DAYS || 1;
  const now = new Date();
  const nowMs = now.getTime();
  const todayDay = today();
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const active = birds.filter(bird => bird.status === "active");
  photoCache = photoCache && typeof photoCache === "object" ? photoCache : {};

  const batchById = useMemo(() => new Map(batches.map(batch => [batch.id, batch])), [batches]);
  const feedTypeById = useMemo(() => new Map(feedTypes.map(feedType => [feedType.id, feedType])), [feedTypes]);
  const penThemes = useMemo(() => dashboardPenThemeOptions(), []);
  const penThemeById = useMemo(() => new Map(penThemes.map(theme => [theme.id, theme])), [penThemes]);
  const pensOrdered = useMemo(() => [...pens].sort((a, b) => {
    const createdDiff = dateMs(a.createdAt) - dateMs(b.createdAt);
    if (createdDiff) return createdDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  }), [pens]);
  const resolvedPenThemeIdByPen = useMemo(() => {
    const map = new Map();
    pensOrdered.forEach((pen, idx) => {
      if (pen.themeId && penThemeById.has(pen.themeId)) {
        map.set(pen.id, pen.themeId);
        return;
      }
      map.set(pen.id, penThemes[idx % penThemes.length].id);
    });
    return map;
  }, [penThemeById, penThemes, pensOrdered]);

  const activeBirdsByPen = useMemo(() => {
    const map = new Map();
    active.forEach(bird => {
      if (!bird.penId) return;
      const existing = map.get(bird.penId) || [];
      existing.push(bird);
      map.set(bird.penId, existing);
    });
    map.forEach(items => items.sort((a, b) => normalizeTagId(a.tagId).localeCompare(normalizeTagId(b.tagId), undefined, {
      numeric: true
    })));
    return map;
  }, [active]);

  const latestWeightByBird = useMemo(() => {
    const map = new Map();
    measurements.forEach(measurement => {
      if (measurement.metricType !== "weight") return;
      const existing = map.get(measurement.birdId);
      if (!existing || new Date(measurement.measuredAt) > new Date(existing.measuredAt)) map.set(measurement.birdId, measurement);
    });
    return map;
  }, [measurements]);

  const logsByPen = useMemo(() => {
    const map = new Map();
    penFeedLogs.forEach(log => {
      const existing = map.get(log.penId) || [];
      existing.push(log);
      map.set(log.penId, existing);
    });
    map.forEach(items => items.sort((a, b) => dateMs(b.loggedAt) - dateMs(a.loggedAt)));
    return map;
  }, [penFeedLogs]);

  const feedLogCountByPenDay = useMemo(() => {
    const map = new Map();
    penFeedLogs.forEach(log => {
      const day = dashboardFeedDay(log.loggedAt);
      if (!log.penId || !day) return;
      const key = `${log.penId}::${day}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [penFeedLogs]);

  const overdue = reminders.filter(reminder => reminder.status === "pending" && new Date(reminder.dueAt).getTime() < nowMs);
  const dueToday = reminders.filter(reminder => reminder.status === "pending" && new Date(reminder.dueAt).toDateString() === now.toDateString());
  const urgentReminders = reminders.filter(reminder => {
    if (reminder.status !== "pending") return false;
    const dueMs = new Date(reminder.dueAt).getTime();
    if (!Number.isFinite(dueMs)) return false;
    if (dueMs < nowMs) return true;
    if (new Date(reminder.dueAt).toDateString() === now.toDateString()) return true;
    const daysUntil = Math.floor((dueMs - todayStartMs) / DAY_MS);
    if (reminder.source === "auto_hatch") return daysUntil <= HATCH_ALERT_WINDOW_DAYS;
    if (reminder.source === "auto_incubation") return daysUntil <= INCUBATION_REMINDER_WINDOW_DAYS;
    return false;
  }).sort((a, b) => {
    const aDue = new Date(a.dueAt).getTime();
    const bDue = new Date(b.dueAt).getTime();
    const aOverdue = aDue < nowMs;
    const bOverdue = bDue < nowMs;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return aDue - bDue;
  });

  const staleWeightMs = DAY_MS * 14;
  const needsWeight = active.filter(bird => {
    const latest = latestWeightByBird.get(bird.id);
    if (!latest) return true;
    const measuredAt = new Date(latest.measuredAt).getTime();
    if (!Number.isFinite(measuredAt)) return true;
    return Date.now() - measuredAt > staleWeightMs;
  }).sort((a, b) => {
    const aLatest = latestWeightByBird.get(a.id);
    const bLatest = latestWeightByBird.get(b.id);
    const aMs = aLatest ? new Date(aLatest.measuredAt).getTime() : 0;
    const bMs = bLatest ? new Date(bLatest.measuredAt).getTime() : 0;
    if (aMs !== bMs) return aMs - bMs;
    return String(a.tagId || "").localeCompare(String(b.tagId || ""), undefined, {
      numeric: true
    });
  });

  const activePensWithBirds = useMemo(() => pens.filter(pen => (activeBirdsByPen.get(pen.id) || []).length > 0).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, {
    numeric: true
  })), [activeBirdsByPen, pens]);
  const expectedTodayFeedLogs = dashboardRequiredFeedLogs(todayDay, now);
  const needsFeedPens = useMemo(() => activePensWithBirds.filter(pen => (feedLogCountByPenDay.get(`${pen.id}::${todayDay}`) || 0) < expectedTodayFeedLogs), [activePensWithBirds, expectedTodayFeedLogs, feedLogCountByPenDay, todayDay]);

  const archivable = birds.filter(bird => bird.status === "sold" || bird.status === "deceased" || bird.status === "culled");
  const hatcheryEggCount = useMemo(() => batches.reduce((sum, batch) => sum + (Number(batch?.eggCount) || 0), 0), [batches]);
  const recent = [...measurements].sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt)).slice(0, 5);
  const bookmarkedItems = useMemo(() => {
    const items = [];
    birds.filter(bird => !!bird.bookmarked).forEach(bird => {
      const nickname = String(bird.nickname || "").trim();
      const displayName = nickname || bird.tagId || "Bird";
      const displayTag = nickname && bird.tagId ? bird.tagId : "";
      const latestPhoto = dashboardLatestPhotoWithImage(photoCache[bird.id]);
      const statusColor = sc(bird.status || "active");
      items.push({
        id: `bird:${bird.id}`,
        type: "bird",
        title: displayName,
        subtitle: [displayTag ? `Tag ${displayTag}` : "", bird.breed || "No breed", bird.status || "active"].filter(Boolean).join(" · "),
        photoUrl: latestPhoto?.dataUrl || "",
        tone: statusColor,
        bg: `${statusColor}1a`,
        border: `${statusColor}66`,
        bookmarkedAt: bird.bookmarkedAt || bird.updatedAt || bird.createdAt || "",
        onOpen: () => onOpenBird && onOpenBird(bird.id),
        onUnbookmark: () => onUpdateBird && onUpdateBird({
          ...bird,
          bookmarked: false,
          bookmarkedAt: ""
        })
      });
    });
    batches.filter(batch => !!batch.bookmarked).forEach(batch => {
      const bt = batchTheme(batchNoFromBatchCode(batch.code));
      items.push({
        id: `batch:${batch.id}`,
        type: "batch",
        title: batch.code || "Batch",
        subtitle: `${fmtNum(batch.eggCount || 0)} eggs`,
        tone: bt.color,
        bg: bt.soft,
        border: bt.border,
        bookmarkedAt: batch.bookmarkedAt || batch.updatedAt || batch.createdAt || "",
        onOpen: () => onOpenBatch ? onOpenBatch(batch.id) : onOpenSection && onOpenSection("batches"),
        onUnbookmark: () => onUpdateBatch && onUpdateBatch({
          ...batch,
          bookmarked: false,
          bookmarkedAt: ""
        })
      });
    });
    pens.filter(pen => !!pen.bookmarked).forEach(pen => {
      const themeId = resolvedPenThemeIdByPen.get(pen.id) || penThemes[0].id;
      const pt = penThemeById.get(themeId) || penThemes[0];
      items.push({
        id: `pen:${pen.id}`,
        type: "pen",
        title: pen.name || "Pen",
        subtitle: pen.location || "No location",
        tone: pt.quickColor || "#c2410c",
        bg: pt.latestBg || "#fff7ec",
        border: pt.latestBorder || "#f5d7b0",
        bookmarkedAt: pen.bookmarkedAt || pen.updatedAt || pen.createdAt || "",
        onOpen: () => onOpenPen ? onOpenPen(pen.id) : onOpenSection && onOpenSection("pens"),
        onUnbookmark: () => onUpdatePen && onUpdatePen({
          ...pen,
          bookmarked: false,
          bookmarkedAt: ""
        })
      });
    });
    return items.sort((a, b) => dateMs(b.bookmarkedAt) - dateMs(a.bookmarkedAt));
  }, [batches, birds, onOpenBatch, onOpenBird, onOpenPen, onOpenSection, onUpdateBatch, onUpdateBird, onUpdatePen, penThemeById, penThemes, pens, photoCache, resolvedPenThemeIdByPen]);
  const topBookmarkedItems = bookmarkedItems.slice(0, 3);
  const overflowBookmarkedItems = bookmarkedItems.slice(3);

  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const [bookmarkPhotoPreview, setBookmarkPhotoPreview] = useState(null);
  const [isWeightQueueOpen, setIsWeightQueueOpen] = useState(false);
  const [weightQueueBirdIds, setWeightQueueBirdIds] = useState([]);
  const [weightQueueIndex, setWeightQueueIndex] = useState(0);
  const [weightQueueForm, setWeightQueueForm] = useState({
    value: "",
    unit: "kg",
    measuredAt: todayDay
  });
  const [weightQueueSavedCount, setWeightQueueSavedCount] = useState(0);
  const [weightQueueSkippedIds, setWeightQueueSkippedIds] = useState([]);
  const [weightQueueSaving, setWeightQueueSaving] = useState(false);

  const weightQueueTotal = weightQueueBirdIds.length;
  const isWeightQueueDone = weightQueueIndex >= weightQueueTotal;
  const currentWeightQueueBirdId = !isWeightQueueDone ? weightQueueBirdIds[weightQueueIndex] : "";
  const currentWeightQueueBird = currentWeightQueueBirdId ? birds.find(bird => bird.id === currentWeightQueueBirdId) : null;
  const currentQueueBirdLatestWeight = currentWeightQueueBird ? latestWeightByBird.get(currentWeightQueueBird.id) : null;
  const currentWeightQueuePhotos = currentWeightQueueBirdId ? Array.isArray(photoCache[currentWeightQueueBirdId]) ? photoCache[currentWeightQueueBirdId] : [] : [];
  let currentWeightQueuePhoto = null;
  for (let i = currentWeightQueuePhotos.length - 1; i >= 0; i--) {
    const photo = currentWeightQueuePhotos[i];
    if (photo?.dataUrl) {
      currentWeightQueuePhoto = photo;
      break;
    }
  }
  const isCurrentWeightQueuePhotoLoaded = !currentWeightQueueBirdId || Object.prototype.hasOwnProperty.call(photoCache, currentWeightQueueBirdId);
  const weightQueueProgressLabel = weightQueueTotal ? `${Math.min(weightQueueIndex + 1, weightQueueTotal)} of ${weightQueueTotal}` : "0 of 0";
  const weightQueueSkippedTags = weightQueueSkippedIds.map(id => birds.find(bird => bird.id === id)?.tagId || id).join(", ");
  const weightQueueSaveLabel = weightQueueIndex >= weightQueueTotal - 1 ? "Save & Finish" : "Save & Next";

  const [isFeedQueueOpen, setIsFeedQueueOpen] = useState(false);
  const [feedQueuePenIds, setFeedQueuePenIds] = useState([]);
  const [feedQueueIndex, setFeedQueueIndex] = useState(0);
  const [feedQueueForm, setFeedQueueForm] = useState({
    feedTypeId: feedTypes[0]?.id || "",
    amount: "",
    unit: feedTypes[0]?.defaultUnit || "kg",
    sackKg: dashboardFeedTypeSackKgText(feedTypes[0]),
    loggedAt: todayDay
  });
  const [feedQueueCompletedPenIds, setFeedQueueCompletedPenIds] = useState([]);
  const [feedQueueSkippedPenIds, setFeedQueueSkippedPenIds] = useState([]);
  const [feedQueueSaving, setFeedQueueSaving] = useState(false);
  const [cloudSaveBusy, setCloudSaveBusy] = useState(false);
  const [cloudSaveNotice, setCloudSaveNotice] = useState(() => dashboardReadCloudNotice());
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine !== false);

  const feedQueueTotal = feedQueuePenIds.length;
  const isFeedQueueDone = feedQueueIndex >= feedQueueTotal;
  const currentFeedQueuePenId = !isFeedQueueDone ? feedQueuePenIds[feedQueueIndex] : "";
  const currentFeedQueuePen = currentFeedQueuePenId ? pens.find(pen => pen.id === currentFeedQueuePenId) : null;
  const currentFeedQueueBirds = currentFeedQueuePen ? activeBirdsByPen.get(currentFeedQueuePen.id) || [] : [];
  const currentFeedQueueLatestLog = currentFeedQueuePen ? (logsByPen.get(currentFeedQueuePen.id) || [])[0] || null : null;
  const currentFeedQueueDay = dashboardFeedDay(feedQueueForm.loggedAt) || todayDay;
  const currentFeedQueueLogsForDay = currentFeedQueuePen ? penFeedLogs.filter(log => log.penId === currentFeedQueuePen.id && dashboardFeedDay(log.loggedAt) === currentFeedQueueDay).sort((a, b) => dateMs(a.loggedAt) - dateMs(b.loggedAt)) : [];
  const currentFeedQueueLogCount = currentFeedQueueLogsForDay.length;
  const currentFeedQueueRequiredLogs = dashboardRequiredFeedLogs(currentFeedQueueDay, now);
  const currentFeedQueueRemainingLogs = Math.max(0, currentFeedQueueRequiredLogs - currentFeedQueueLogCount);
  const feedQueueProgressLabel = feedQueueTotal ? `${Math.min(feedQueueIndex + 1, feedQueueTotal)} of ${feedQueueTotal}` : "0 of 0";
  const feedQueueSkippedNames = feedQueueSkippedPenIds.map(id => pens.find(pen => pen.id === id)?.name || id).join(", ");
  const feedQueueWindowLabel = currentFeedQueueRequiredLogs === 1 ? "Morning window" : "Full-day target";
  const feedQueueSaveCompletesPen = currentFeedQueueLogCount + 1 >= currentFeedQueueRequiredLogs;
  const feedQueueSaveLabel = feedQueueSaveCompletesPen ? feedQueueIndex >= feedQueueTotal - 1 ? "Save & Finish" : "Save & Next Pen" : "Save & Keep Feeding";

  function resetWeightQueueState() {
    setWeightQueueBirdIds([]);
    setWeightQueueIndex(0);
    setWeightQueueForm({
      value: "",
      unit: "kg",
      measuredAt: todayDay
    });
    setWeightQueueSavedCount(0);
    setWeightQueueSkippedIds([]);
    setWeightQueueSaving(false);
  }

  function closeWeightQueue() {
    setIsWeightQueueOpen(false);
    resetWeightQueueState();
  }

  function openWeightQueue() {
    setWeightQueueBirdIds(needsWeight.map(bird => bird.id));
    setWeightQueueIndex(0);
    setWeightQueueForm({
      value: "",
      unit: "kg",
      measuredAt: todayDay
    });
    setWeightQueueSavedCount(0);
    setWeightQueueSkippedIds([]);
    setWeightQueueSaving(false);
    setIsWeightQueueOpen(true);
  }

  async function saveWeightAndAdvance() {
    if (weightQueueSaving || isWeightQueueDone) return;
    if (!currentWeightQueueBird) {
      setWeightQueueIndex(prev => prev + 1);
      return;
    }
    const numericValue = Number(weightQueueForm.value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      window.alert("Enter a valid weight value.");
      return;
    }
    const measuredAt = String(weightQueueForm.measuredAt || "").trim() || todayDay;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)) {
      window.alert("Enter a valid date.");
      return;
    }
    const unit = String(weightQueueForm.unit || "").trim() || "kg";
    if (typeof onAddMeasurement !== "function") {
      window.alert("Weight saving is currently unavailable.");
      return;
    }
    try {
      setWeightQueueSaving(true);
      await Promise.resolve(onAddMeasurement({
        id: uid(),
        birdId: currentWeightQueueBird.id,
        metricType: "weight",
        value: numericValue,
        unit,
        measuredAt,
        ageDays: ageDays(currentWeightQueueBird.hatchDate)
      }));
      setWeightQueueSavedCount(prev => prev + 1);
      setWeightQueueIndex(prev => prev + 1);
      setWeightQueueForm(prev => ({
        ...prev,
        value: "",
        unit,
        measuredAt
      }));
    } catch (err) {
      console.error(err);
      window.alert("Could not save weight. Please try again.");
    } finally {
      setWeightQueueSaving(false);
    }
  }

  function skipWeightQueueBird() {
    if (weightQueueSaving || isWeightQueueDone) return;
    const birdId = weightQueueBirdIds[weightQueueIndex];
    if (birdId && !weightQueueSkippedIds.includes(birdId)) {
      setWeightQueueSkippedIds(prev => [...prev, birdId]);
    }
    setWeightQueueIndex(prev => prev + 1);
    setWeightQueueForm(prev => ({
      ...prev,
      value: ""
    }));
  }

  function resetFeedQueueState() {
    setFeedQueuePenIds([]);
    setFeedQueueIndex(0);
    setFeedQueueForm({
      feedTypeId: feedTypes[0]?.id || "",
      amount: "",
      unit: feedTypes[0]?.defaultUnit || "kg",
      sackKg: dashboardFeedTypeSackKgText(feedTypes[0]),
      loggedAt: todayDay
    });
    setFeedQueueCompletedPenIds([]);
    setFeedQueueSkippedPenIds([]);
    setFeedQueueSaving(false);
  }

  function closeFeedQueue() {
    setIsFeedQueueOpen(false);
    resetFeedQueueState();
  }

  function openFeedQueue() {
    setFeedQueuePenIds(needsFeedPens.map(pen => pen.id));
    setFeedQueueIndex(0);
    setFeedQueueForm({
      feedTypeId: feedTypes[0]?.id || "",
      amount: "",
      unit: feedTypes[0]?.defaultUnit || "kg",
      sackKg: dashboardFeedTypeSackKgText(feedTypes[0]),
      loggedAt: todayDay
    });
    setFeedQueueCompletedPenIds([]);
    setFeedQueueSkippedPenIds([]);
    setFeedQueueSaving(false);
    setIsFeedQueueOpen(true);
  }

  async function saveFeedAndContinue() {
    if (feedQueueSaving || isFeedQueueDone) return;
    if (!currentFeedQueuePen) {
      setFeedQueueIndex(prev => prev + 1);
      return;
    }
    if (!currentFeedQueueBirds.length) {
      window.alert(`Cannot log feed for ${currentFeedQueuePen.name || "this pen"} because it has no active birds assigned. It will be skipped.`);
      setFeedQueueSkippedPenIds(prev => prev.includes(currentFeedQueuePen.id) ? prev : [...prev, currentFeedQueuePen.id]);
      setFeedQueueIndex(prev => prev + 1);
      return;
    }
    if (!feedQueueForm.feedTypeId) {
      window.alert("Select a feed type.");
      return;
    }
    const amount = Number(feedQueueForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Feed amount must be a valid number.");
      return;
    }
    const loggedDay = dashboardFeedDay(feedQueueForm.loggedAt) || todayDay;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(loggedDay)) {
      window.alert("Enter a valid date.");
      return;
    }
    const unit = String(feedQueueForm.unit || "").trim() || feedTypeById.get(feedQueueForm.feedTypeId)?.defaultUnit || "kg";
    const sackKgText = String(feedQueueForm.sackKg || "").trim();
    const sackKgValue = sackKgText === "" ? null : Number(sackKgText);
    if (unit === "sack" && (!Number.isFinite(sackKgValue) || sackKgValue <= 0)) {
      window.alert("Enter how many kilograms are in one sack.");
      return;
    }
    if (sackKgText && (!Number.isFinite(sackKgValue) || sackKgValue <= 0)) {
      window.alert("Kg per sack must be a valid number.");
      return;
    }
    if (typeof onAddPenFeedLog !== "function") {
      window.alert("Feed logging is currently unavailable.");
      return;
    }
    const existingCount = currentFeedQueueLogCount;
    const requiredCount = currentFeedQueueRequiredLogs;
    try {
      setFeedQueueSaving(true);
      await Promise.resolve(onAddPenFeedLog({
        id: uid(),
        penId: currentFeedQueuePen.id,
        feedTypeId: feedQueueForm.feedTypeId,
        amount,
        unit,
        sackKg: unit === "sack" ? sackKgValue : null,
        loggedAt: dashboardBuildFeedLoggedAt(loggedDay, existingCount, new Date()),
        notes: "",
        createdAt: new Date().toISOString()
      }));
      setFeedQueueForm(prev => ({
        ...prev,
        feedTypeId: feedQueueForm.feedTypeId,
        amount: String(amount),
        unit,
        sackKg: unit === "sack" ? String(sackKgValue) : "",
        loggedAt: loggedDay
      }));
      if (existingCount + 1 >= requiredCount) {
        setFeedQueueCompletedPenIds(prev => prev.includes(currentFeedQueuePen.id) ? prev : [...prev, currentFeedQueuePen.id]);
        setFeedQueueIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Could not save feed log. Please try again.");
    } finally {
      setFeedQueueSaving(false);
    }
  }

  function skipFeedQueuePen() {
    if (feedQueueSaving || isFeedQueueDone) return;
    const penId = feedQueuePenIds[feedQueueIndex];
    if (penId && !feedQueueSkippedPenIds.includes(penId)) {
      setFeedQueueSkippedPenIds(prev => [...prev, penId]);
    }
    setFeedQueueIndex(prev => prev + 1);
  }

  useEffect(() => {
    if (typeof ensureBirdPhotos !== "function") return;
    birds.forEach(bird => {
      if (!bird?.bookmarked || !bird?.id) return;
      if (Object.prototype.hasOwnProperty.call(photoCache, bird.id)) return;
      ensureBirdPhotos(bird.id).catch(console.error);
    });
  }, [birds, ensureBirdPhotos, photoCache]);
  useEffect(() => {
    const updateOnlineState = () => setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!isWeightQueueOpen) return;
    if (isWeightQueueDone) return;
    if (!currentWeightQueueBirdId) return;
    const exists = birds.some(bird => bird.id === currentWeightQueueBirdId);
    if (exists) return;
    setWeightQueueIndex(prev => prev + 1);
  }, [birds, currentWeightQueueBirdId, isWeightQueueDone, isWeightQueueOpen]);

  useEffect(() => {
    if (!isWeightQueueOpen) return;
    if (isWeightQueueDone) return;
    if (!currentWeightQueueBirdId) return;
    if (Object.prototype.hasOwnProperty.call(photoCache, currentWeightQueueBirdId)) return;
    if (typeof ensureBirdPhotos !== "function") return;
    ensureBirdPhotos(currentWeightQueueBirdId).catch(console.error);
  }, [currentWeightQueueBirdId, ensureBirdPhotos, isWeightQueueDone, isWeightQueueOpen, photoCache]);

  useEffect(() => {
    if (!isFeedQueueOpen) return;
    if (isFeedQueueDone) return;
    if (!currentFeedQueuePenId) return;
    const exists = pens.some(pen => pen.id === currentFeedQueuePenId);
    if (!exists) {
      setFeedQueueIndex(prev => prev + 1);
      return;
    }
    if (currentFeedQueueLogCount < currentFeedQueueRequiredLogs) return;
    if (!feedQueueCompletedPenIds.includes(currentFeedQueuePenId)) {
      setFeedQueueCompletedPenIds(prev => [...prev, currentFeedQueuePenId]);
    }
    setFeedQueueIndex(prev => prev + 1);
  }, [feedQueueCompletedPenIds, currentFeedQueueLogCount, currentFeedQueuePenId, currentFeedQueueRequiredLogs, isFeedQueueDone, isFeedQueueOpen, pens]);

  useEffect(() => {
    if (!isFeedQueueOpen) return;
    if (isFeedQueueDone) return;
    if (!currentFeedQueuePenId) return;
    const latestLog = currentFeedQueueLatestLog;
    const nextFeedTypeId = latestLog?.feedTypeId || feedTypes[0]?.id || "";
    const nextUnit = latestLog?.unit || feedTypeById.get(nextFeedTypeId)?.defaultUnit || feedTypes[0]?.defaultUnit || "kg";
    const nextAmount = latestLog?.amount != null && latestLog.amount !== "" ? String(latestLog.amount) : "";
    const nextSackKg = latestLog?.sackKg != null && latestLog?.sackKg !== "" ? String(latestLog.sackKg) : dashboardFeedTypeSackKgText(feedTypeById.get(nextFeedTypeId));
      setFeedQueueForm(prev => ({
        ...prev,
        feedTypeId: nextFeedTypeId,
        amount: nextAmount,
        unit: nextUnit,
        sackKg: nextSackKg,
        loggedAt: dashboardFeedDay(prev.loggedAt) || todayDay
      }));
  }, [currentFeedQueueLatestLog?.amount, currentFeedQueueLatestLog?.feedTypeId, currentFeedQueueLatestLog?.id, currentFeedQueueLatestLog?.sackKg, currentFeedQueueLatestLog?.unit, currentFeedQueuePenId, feedTypeById, feedTypes, isFeedQueueDone, isFeedQueueOpen, todayDay]);

  function updateCloudSaveNotice(next) {
    setCloudSaveNotice(next);
    dashboardWriteCloudNotice(next);
  }

  async function saveOverviewToCloud() {
    if (cloudSaveBusy) return;
    const nowIso = new Date().toISOString();
    if (!isOnline) {
      updateCloudSaveNotice({
        level: "error",
        message: `Cloud save failed (${fmtDateTime(nowIso)}): No internet connection.`
      });
      return;
    }
    if (typeof onPushToGist !== "function") {
      updateCloudSaveNotice({
        level: "error",
        message: `Cloud save failed (${fmtDateTime(nowIso)}): Sync service unavailable.`
      });
      return;
    }
    try {
      setCloudSaveBusy(true);
      const info = await Promise.resolve(onPushToGist({}));
      const syncedTotal = Number(info?.total) || 0;
      const gistId = String(info?.gistId || "").trim();
      updateCloudSaveNotice({
        level: "success",
        message: `Saved to cloud ${fmtDateTime(nowIso)} • ${fmtNum(syncedTotal)} records${gistId ? ` • gist ${gistId}` : ""}.`
      });
    } catch (err) {
      updateCloudSaveNotice({
        level: "error",
        message: `Cloud save failed (${fmtDateTime(nowIso)}): ${err?.message || "Unknown error."}`
      });
    } finally {
      setCloudSaveBusy(false);
    }
  }

  const cloudNoticeTone = cloudSaveNotice.level === "success" ? "#15803d" : cloudSaveNotice.level === "error" ? "#b91c1c" : "#475569";

  const stats = [{
    id: "birds",
    l: "Active Birds",
    v: active.length,
    ic: "🐓",
    c: "#15803d",
    go: "birds"
  }, {
    id: "batches",
    l: `Eggs · in ${fmtNum(batches.length)} batch/es`,
    v: fmtNum(hatcheryEggCount),
    ic: "🥚",
    c: "#1d4ed8",
    go: "batches"
  }, {
    id: "needsWeight",
    l: "Need Weight",
    v: needsWeight.length,
    ic: "📏",
    c: "#c2410c",
    go: "weight_queue"
  }, {
    id: "needsFeed",
    l: expectedTodayFeedLogs === 1 ? "Need AM Feed" : "Need Feed",
    v: needsFeedPens.length,
    ic: "🥣",
    c: "#b45309",
    go: "feed_queue"
  }, {
    id: "overdue",
    l: "Overdue",
    v: overdue.length,
    ic: "⚠️",
    c: "#b91c1c",
    go: "reminders_overdue"
  }, {
    id: "dueToday",
    l: "Due Today",
    v: dueToday.length,
    ic: "📅",
    c: "#a16207",
    go: "reminders_due_today"
  }, {
    id: "archivable",
    l: "Ready Archive",
    v: archivable.length,
    ic: "🗂️",
    c: "#475569",
    go: "settings_archivable"
  }];
  const bookmarkTypeIcon = item => item.type === "bird" ? "🐓" : item.type === "batch" ? "🥚" : "🪺";
  const confirmUnbookmark = item => {
    if (!item?.onUnbookmark) return;
    const label = String(item.title || item.type || "item");
    const confirmed = window.confirm(`Remove bookmark for "${label}"?`);
    if (!confirmed) return;
    item.onUnbookmark();
  };
  const renderBookmarkItem = (item, keyPrefix = "") => React.createElement("div", {
    key: `${keyPrefix}${item.id}`,
    role: "button",
    tabIndex: 0,
    onClick: item.onOpen,
    onKeyDown: event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      item.onOpen && item.onOpen();
    },
    style: {
      width: "100%",
      border: `1px solid ${item.border}`,
      background: item.bg,
      borderRadius: 12,
      padding: "10px 12px",
      textAlign: "left",
      display: "flex",
      alignItems: "center",
      gap: 10,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: item.type === "bird" && item.photoUrl ? 42 : 28,
      height: item.type === "bird" && item.photoUrl ? 42 : 28,
      borderRadius: item.type === "bird" && item.photoUrl ? 10 : "50%",
      background: item.type === "bird" && item.photoUrl ? "#ffffffbf" : `${item.tone}22`,
      border: item.type === "bird" && item.photoUrl ? `1px solid ${item.border}` : "none",
      color: item.tone,
      display: "grid",
      placeItems: "center",
      fontSize: 15,
      fontWeight: 800,
      flexShrink: 0,
      overflow: "hidden"
    }
  }, item.type === "bird" && item.photoUrl ? React.createElement("img", {
    src: item.photoUrl,
    alt: "",
    onClick: event => {
      event.stopPropagation();
      setBookmarkPhotoPreview({
        dataUrl: item.photoUrl,
        label: item.title || "Bird"
      });
    },
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      cursor: "zoom-in"
    }
  }) : bookmarkTypeIcon(item)), React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: "#0f172a",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, item.title), React.createElement("div", {
    style: {
      marginTop: 1,
      fontSize: 12,
      color: "#475569",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, item.subtitle)), React.createElement("button", {
    type: "button",
    title: "Unbookmark",
    onKeyDown: event => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    },
    onClick: event => {
      event.stopPropagation();
      confirmUnbookmark(item);
    },
    style: bookmarkButtonStyle(true, {
      borderRadius: 10,
      padding: "5px 8px",
      fontWeight: 900,
      fontSize: 16,
      lineHeight: 1,
      cursor: "pointer",
      flexShrink: 0
    })
  }, bookmarkButtonTheme(true).icon));

  return React.createElement("div", {
    style: C.body
  }, React.createElement("div", {
    style: {
      padding: "20px 0 12px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 26,
      fontWeight: 900,
      color: "#b45309"
    }
  }, "🐔 Flock Overview")), bookmarkedItems.length > 0 && React.createElement("div", {
    style: {
      ...C.card,
      borderColor: "#1d4ed855",
      background: "linear-gradient(180deg,#eaf2ff 0%,#f8fbff 100%)"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#1d4ed8"
    }
  }, "\u2B50 Bookmarks"), React.createElement("div", {
    style: C.badge("#1d4ed8")
  }, bookmarkedItems.length)), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, topBookmarkedItems.map(item => renderBookmarkItem(item, "top-"))), overflowBookmarkedItems.length > 0 && React.createElement("button", {
    type: "button",
    style: {
      ...C.sec,
      width: "100%",
      marginTop: 10,
      color: "#1d4ed8",
      borderColor: "#93c5fd",
      background: "#eff6ff"
    },
    onClick: () => setShowBookmarksModal(true)
  }, "More \u2014 ", overflowBookmarkedItems.length)), urgentReminders.length > 0 && React.createElement("div", {
    style: {
      ...C.card,
      borderColor: "#ea580c55",
      background: "linear-gradient(180deg,#fff7ed 0%,#ffffff 100%)"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#c2410c"
    }
  }, "🚨 Urgent Reminders"), React.createElement("div", {
    style: C.badge("#c2410c")
  }, urgentReminders.length)), urgentReminders.slice(0, 5).map(reminder => {
    const dueMs = new Date(reminder.dueAt).getTime();
    const isOverdue = dueMs < nowMs;
    const isToday = new Date(reminder.dueAt).toDateString() === now.toDateString();
    const isAutoHatch = reminder.source === "auto_hatch";
    const isAutoIncubation = reminder.source === "auto_incubation";
    const bird = reminder.birdId ? birds.find(item => item.id === reminder.birdId) : null;
    const batch = reminder.batchId ? batchById.get(reminder.batchId) : null;
    const targetLabel = isAutoHatch || isAutoIncubation ? reminder.batchCode || batch?.code || "Batch" : bird?.tagId || "?";
    const daysUntil = Math.floor((dueMs - todayStartMs) / DAY_MS);
    const tone = isOverdue ? "#b91c1c" : isAutoHatch ? "#b45309" : isAutoIncubation ? "#0f766e" : "#1d4ed8";
    const badgeText = isOverdue ? "Overdue" : isToday ? "Due today" : isAutoHatch ? daysUntil <= 0 ? "Hatching today" : `Hatching in ${daysUntil}d` : isAutoIncubation ? daysUntil <= 0 ? "Checkpoint today" : `Checkpoint in ${daysUntil}d` : "Urgent";
    const detail = isAutoHatch ? `${fmtNum(reminder.pendingEggCount)} pending eggs · expected hatch ${fmtDate(reminder.expectedHatchDate || reminder.dueAt)}` : isAutoIncubation ? `${reminder.dayRangeLabel || "Incubation"} · ${reminder.humidity || ""} · ${fmtNum(reminder.pendingEggCount)} pending eggs` : `${humanize(reminder.kind)} · due ${fmtDate(reminder.dueAt)}`;
    return React.createElement("button", {
      key: reminder.id,
      style: {
        width: "100%",
        border: "1px solid #fed7aa",
        background: "#ffffff",
        borderRadius: 12,
        padding: "12px 13px",
        textAlign: "left",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        cursor: "pointer",
        marginBottom: 10
      },
      onClick: () => isAutoHatch || isAutoIncubation ? onOpenBatch && onOpenBatch(reminder.batchId) : onOpenSection && onOpenSection("tasks")
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: tone
      }
    }, targetLabel, " — ", isAutoHatch || isAutoIncubation ? reminder.title || humanize(reminder.kind) : humanize(reminder.kind)), React.createElement("div", {
      style: {
        marginTop: 4,
        color: "#475569",
        fontSize: 14
      }
    }, detail)), React.createElement("div", {
      style: {
        ...C.badge(tone),
        whiteSpace: "nowrap",
        alignSelf: "flex-start"
      }
    }, badgeText));
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      marginBottom: 16
    }
  }, stats.map(stat => React.createElement("button", {
    key: stat.id,
    style: {
      ...C.card,
      marginBottom: 0,
      textAlign: "left",
      cursor: "pointer"
    },
    onClick: () => {
      if (stat.id === "needsWeight") {
        openWeightQueue();
        return;
      }
      if (stat.id === "needsFeed") {
        openFeedQueue();
        return;
      }
      onOpenSection && onOpenSection(stat.go);
    }
  }, React.createElement("div", {
    style: {
      fontSize: 26,
      marginBottom: 4
    }
  }, stat.ic), React.createElement("div", {
    style: {
      fontSize: 30,
      fontWeight: 900,
      color: stat.c
    }
  }, stat.v), React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#475569",
      fontWeight: 700,
      marginTop: 2
    }
  }, stat.l)))), needsWeight.length > 0 && React.createElement("div", {
    style: {
      ...C.card,
      borderColor: "#c2410c44",
      background: "#c2410c08",
      cursor: "pointer"
    },
    onClick: openWeightQueue
  }, React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: "#c2410c",
      marginBottom: 8
    }
  }, "📏 Need Fresh Weights (", needsWeight.length, ")"), needsWeight.slice(0, 4).map(bird => {
    const latest = latestWeightByBird.get(bird.id);
    return React.createElement("div", {
      key: bird.id,
      style: {
        padding: "5px 0",
        borderBottom: "1px solid #d9e3ef",
        fontSize: 15
      }
    }, React.createElement("span", {
      style: {
        color: "#c2410c",
        fontWeight: 700
      }
    }, bird.tagId || "?"), React.createElement("span", {
      style: {
        color: "#475569"
      }
    }, latest ? ` — last weighed ${fmtDate(latest.measuredAt)}` : " — no weight recorded"));
  })), activePensWithBirds.length > 0 && React.createElement("div", {
    style: {
      ...C.card,
      borderColor: "#b4530944",
      background: "#fff7ed",
      cursor: "pointer"
    },
    onClick: openFeedQueue
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: "#b45309"
    }
  }, "🥣 Pens Needing Feed (", needsFeedPens.length, ")"), React.createElement("div", {
    style: C.badge("#b45309")
  }, expectedTodayFeedLogs === 1 ? "Morning target" : "Two-log target")), !feedTypes.length && React.createElement("div", {
    style: {
      color: "#9a3412",
      fontSize: 14,
      marginBottom: 8
    }
  }, "Add a feed type first to use the feeding queue."), needsFeedPens.slice(0, 4).map(pen => {
    const birdCount = (activeBirdsByPen.get(pen.id) || []).length;
    const feedCount = feedLogCountByPenDay.get(`${pen.id}::${todayDay}`) || 0;
    return React.createElement("div", {
      key: pen.id,
      style: {
        padding: "6px 0",
        borderBottom: "1px solid #edd5bf",
        fontSize: 15
      }
    }, React.createElement("span", {
      style: {
        color: "#9a3412",
        fontWeight: 700
      }
    }, pen.name || "Pen"), React.createElement("span", {
      style: {
        color: "#7c2d12"
      }
    }, " — ", feedCount, " of ", expectedTodayFeedLogs, " logs today · ", birdCount, " birds"));
  }), !needsFeedPens.length && React.createElement("div", {
    style: {
      color: "#7c2d12",
      fontSize: 14
    }
  }, "All active pens are up to date for the current feed window.")), overdue.length > 0 && React.createElement("div", {
    style: {
      ...C.card,
      borderColor: "#dc262644",
      background: "#dc262608",
      cursor: "pointer"
    },
    onClick: () => onOpenSection && onOpenSection("reminders_overdue")
  }, React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: "#b91c1c",
      marginBottom: 8
    }
  }, "⚠️ Overdue (", overdue.length, ")"), overdue.slice(0, 4).map(reminder => {
    const bird = birds.find(item => item.id === reminder.birdId);
    return React.createElement("div", {
      key: reminder.id,
      style: {
        padding: "5px 0",
        borderBottom: "1px solid #d9e3ef",
        fontSize: 15
      }
    }, React.createElement("span", {
      style: {
        color: "#b91c1c",
        fontWeight: 700
      }
    }, bird?.tagId || "?"), React.createElement("span", {
      style: {
        color: "#475569"
      }
    }, " — ", reminder.kind, " — ", fmtDate(reminder.dueAt)));
  })), recent.length > 0 && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 8
    }
  }, "📊 Recent Measurements"), recent.map(measurement => {
    const bird = birds.find(item => item.id === measurement.birdId);
    return React.createElement("div", {
      key: measurement.id,
      style: {
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: "1px solid #d9e3ef",
        fontSize: 15
      }
    }, React.createElement("span", {
      style: {
        color: "#475569"
      }
    }, bird?.tagId || "?", " · ", measurement.metricType), React.createElement("span", {
      style: {
        color: "#b45309",
        fontWeight: 800
      }
    }, measurement.metricType === "weight" ? formatDashboardWeightDisplay(measurement.value, measurement.unit) : `${measurement.value} ${measurement.unit || ""}`.trim()));
  })), !birds.length && !batches.length && React.createElement(Empty, {
    icon: "🥚",
    msg: "Add an egg batch or bird to get started"
  }), React.createElement("div", {
    style: {
      ...C.card,
      background: "#f8fafc",
      borderColor: "#cbd5e1"
    }
  }, React.createElement("button", {
    type: "button",
    style: {
      ...C.btn,
      marginTop: 0,
      background: !isOnline ? "#94a3b8" : cloudSaveBusy ? "#a16207" : "#b45309",
      opacity: !isOnline ? .7 : cloudSaveBusy ? .85 : 1,
      cursor: !isOnline || cloudSaveBusy ? "not-allowed" : "pointer"
    },
    disabled: !isOnline || cloudSaveBusy,
    onClick: saveOverviewToCloud
  }, !isOnline ? "Save To Cloud (Offline)" : cloudSaveBusy ? "Saving To Cloud..." : "Save To Cloud"), React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 1.45,
      color: cloudNoticeTone,
      fontWeight: 700,
      whiteSpace: "pre-wrap"
    }
  }, cloudSaveNotice.message)), showBookmarksModal && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#0f172a99",
      zIndex: 190,
      overflowY: "auto"
    }
  }, React.createElement("div", {
    style: {
      background: "linear-gradient(180deg,#dbeafe 0%,#eff6ff 100%)",
      border: "1px solid #93c5fd",
      borderRadius: 18,
      margin: "18px 12px 90px",
      padding: 16
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 900,
      color: "#1d4ed8"
    }
  }, "\u2B50 Bookmarks"), React.createElement("button", {
    type: "button",
    onClick: () => setShowBookmarksModal(false),
    style: {
      ...C.sec,
      color: "#1d4ed8",
      borderColor: "#93c5fd",
      background: "#eff6ff"
    }
  }, "\u2715")), !overflowBookmarkedItems.length && React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 0,
      borderColor: "#93c5fd",
      background: "#ffffffcc",
      color: "#475569",
      fontSize: 14
    }
  }, "Only three bookmarks exist right now."), overflowBookmarkedItems.length > 0 && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, overflowBookmarkedItems.map(item => renderBookmarkItem(item, "more-"))))), bookmarkPhotoPreview?.dataUrl && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000000ea",
      zIndex: 240,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 14
    },
    onClick: () => setBookmarkPhotoPreview(null)
  }, React.createElement("div", {
    style: {
      maxWidth: "100%",
      maxHeight: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10
    },
    onClick: event => event.stopPropagation()
  }, React.createElement("button", {
    type: "button",
    onClick: () => setBookmarkPhotoPreview(null),
    style: {
      alignSelf: "flex-end",
      border: "1px solid #ffffff80",
      background: "#0f172acc",
      color: "#f8fafc",
      borderRadius: 999,
      padding: "8px 12px",
      fontSize: 13,
      fontWeight: 800
    }
  }, "\u2715 Close"), React.createElement("img", {
    src: bookmarkPhotoPreview.dataUrl,
    alt: bookmarkPhotoPreview.label || "",
    onClick: () => setBookmarkPhotoPreview(null),
    style: {
      maxWidth: "100%",
      maxHeight: "86dvh",
      objectFit: "contain",
      borderRadius: 10,
      cursor: "zoom-out"
    }
  }), React.createElement("div", {
    style: {
      color: "#e2e8f0",
      fontSize: 13,
      fontWeight: 700
    }
  }, "Tap photo, Close, or outside to close"))), isWeightQueueOpen && React.createElement(Modal, {
    title: "📏 Weighing Queue",
    onClose: closeWeightQueue
  }, weightQueueTotal === 0 && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, "All active chickens are up to date."), React.createElement("div", {
    style: {
      marginTop: 6,
      color: "#475569",
      fontSize: 14
    }
  }, "No birds currently need fresh weight entries."), React.createElement("button", {
    style: C.btn,
    onClick: closeWeightQueue
  }, "Close")), weightQueueTotal > 0 && isWeightQueueDone && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#15803d",
      marginBottom: 6
    }
  }, "All due weights completed"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14,
      lineHeight: 1.45
    }
  }, "Saved ", weightQueueSavedCount, " of ", weightQueueTotal, " birds.", weightQueueSkippedIds.length > 0 ? ` Skipped ${weightQueueSkippedIds.length}: ${weightQueueSkippedTags}.` : ""), React.createElement("button", {
    style: C.btn,
    onClick: closeWeightQueue
  }, "Done")), weightQueueTotal > 0 && !isWeightQueueDone && currentWeightQueueBird && React.createElement("div", null, React.createElement("div", {
    style: {
      ...C.card,
      borderColor: "#c2410c44",
      background: "#fff7ed"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 900,
      color: "#c2410c"
    }
  }, currentWeightQueueBird.tagId || "?"), React.createElement("div", {
    style: C.badge("#c2410c")
  }, weightQueueProgressLabel)), React.createElement("div", {
    style: {
      marginTop: 6,
      color: "#475569",
      fontSize: 14
    }
  }, currentQueueBirdLatestWeight ? `Last weighed ${fmtDate(currentQueueBirdLatestWeight.measuredAt)} (${formatDashboardWeightDisplay(currentQueueBirdLatestWeight.value, currentQueueBirdLatestWeight.unit)})` : "No previous weight record"), React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 260,
      height: 200,
      margin: "0 auto",
      borderRadius: 14,
      border: currentWeightQueuePhoto ? "1px solid #fed7aa" : "1px dashed #fdba74",
      background: "#ffffffb8",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: currentWeightQueuePhoto ? 10 : "18px 14px",
      boxSizing: "border-box"
    }
  }, currentWeightQueuePhoto ? React.createElement("img", {
    src: currentWeightQueuePhoto.dataUrl,
    alt: currentWeightQueueBird.tagId || "Bird photo",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      display: "block"
    }
  }) : React.createElement("div", {
    style: {
      color: "#9a3412",
      fontSize: 14,
      fontWeight: 700,
      textAlign: "center"
    }
  }, isCurrentWeightQueuePhotoLoaded ? "No bird photo available yet" : "Loading latest photo..."))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "2fr 1fr",
      gap: 10
    }
  }, React.createElement(FL, {
    lbl: "Weight"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "0",
    step: "0.01",
    value: weightQueueForm.value,
    autoFocus: true,
    onChange: e => setWeightQueueForm(prev => ({
      ...prev,
      value: e.target.value
    })),
    onKeyDown: e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      saveWeightAndAdvance();
    }
  })), React.createElement(FL, {
    lbl: "Unit"
  }, React.createElement("select", {
    style: C.sel,
    value: weightQueueForm.unit,
    onChange: e => setWeightQueueForm(prev => ({
      ...prev,
      unit: e.target.value
    }))
  }, React.createElement("option", {
    value: "kg"
  }, "kg"), React.createElement("option", {
    value: "g"
  }, "g"), React.createElement("option", {
    value: "lb"
  }, "lb")))), React.createElement(FL, {
    lbl: "Date"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: weightQueueForm.measuredAt,
    onChange: e => setWeightQueueForm(prev => ({
      ...prev,
      measuredAt: e.target.value
    }))
  })), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 18
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      flex: 1,
      opacity: weightQueueSaving ? .6 : 1
    },
    disabled: weightQueueSaving,
    onClick: skipWeightQueueBird
  }, "Skip"), React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 0,
      flex: 2,
      opacity: weightQueueSaving ? .7 : 1
    },
    disabled: weightQueueSaving,
    onClick: saveWeightAndAdvance
  }, weightQueueSaving ? "Saving..." : weightQueueSaveLabel)))), weightQueueTotal > 0 && !isWeightQueueDone && !currentWeightQueueBird && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14
    }
  }, "Finding next bird in queue..."))), isFeedQueueOpen && React.createElement(Modal, {
    title: "🥣 Pen Feeding Queue",
    onClose: closeFeedQueue
  }, !feedTypes.length && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, "Feed type required"), React.createElement("div", {
    style: {
      marginTop: 6,
      color: "#475569",
      fontSize: 14
    }
  }, "Add a feed type in Pens before using the feeding queue."), React.createElement("button", {
    style: C.btn,
    onClick: closeFeedQueue
  }, "Close")), feedTypes.length > 0 && feedQueueTotal === 0 && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, "All active pens are up to date."), React.createElement("div", {
    style: {
      marginTop: 6,
      color: "#475569",
      fontSize: 14
    }
  }, "No pens currently need more feed logs for this feed window."), React.createElement("button", {
    style: C.btn,
    onClick: closeFeedQueue
  }, "Close")), feedTypes.length > 0 && feedQueueTotal > 0 && isFeedQueueDone && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#15803d",
      marginBottom: 6
    }
  }, "Feeding queue completed"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14,
      lineHeight: 1.45
    }
  }, "Completed ", feedQueueCompletedPenIds.length, " of ", feedQueueTotal, " pens.", feedQueueSkippedPenIds.length > 0 ? ` Skipped ${feedQueueSkippedPenIds.length}: ${feedQueueSkippedNames}.` : ""), React.createElement("button", {
    style: C.btn,
    onClick: closeFeedQueue
  }, "Done")), feedTypes.length > 0 && feedQueueTotal > 0 && !isFeedQueueDone && currentFeedQueuePen && React.createElement("div", null, React.createElement("div", {
    style: {
      ...C.card,
      borderColor: "#b4530944",
      background: "#fff7ed"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 900,
      color: "#b45309"
    }
  }, currentFeedQueuePen.name || "Pen"), React.createElement("div", {
    style: C.badge("#b45309")
  }, feedQueueProgressLabel)), React.createElement("div", {
    style: {
      marginTop: 6,
      color: "#7c2d12",
      fontSize: 14,
      lineHeight: 1.45
    }
  }, currentFeedQueueBirds.length, " active birds · ", currentFeedQueueLogCount, " of ", currentFeedQueueRequiredLogs, " logs for ", fmtDate(currentFeedQueueDay), " · ", feedQueueWindowLabel), currentFeedQueueLatestLog && React.createElement("div", {
    style: {
      marginTop: 6,
      color: "#9a3412",
      fontSize: 14
    }
  }, "Latest feed: ", feedTypeById.get(currentFeedQueueLatestLog.feedTypeId)?.name || "Feed", " · ", fmtNum(currentFeedQueueLatestLog.amount), " ", currentFeedQueueLatestLog.unit, currentFeedQueueLatestLog.unit === "sack" && Number(currentFeedQueueLatestLog.sackKg) > 0 ? ` (${fmtNum(currentFeedQueueLatestLog.sackKg)} kg/sack)` : "", " on ", dashboardFmtFeedLoggedAt(currentFeedQueueLatestLog.loggedAt))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr",
      gap: 10
    }
  }, React.createElement(FL, {
    lbl: "Feed Type"
  }, React.createElement("select", {
    style: C.sel,
    value: feedQueueForm.feedTypeId,
    onChange: e => {
      const nextFeedTypeId = e.target.value;
      const feedType = feedTypeById.get(nextFeedTypeId);
      setFeedQueueForm(prev => ({
        ...prev,
        feedTypeId: nextFeedTypeId,
        unit: feedType?.defaultUnit || prev.unit,
        sackKg: dashboardFeedTypeSackKgText(feedType)
      }));
    }
  }, feedTypes.map(feedType => React.createElement("option", {
    key: feedType.id,
    value: feedType.id
  }, feedType.name)))), React.createElement(FL, {
    lbl: "Date"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: feedQueueForm.loggedAt,
    onChange: e => setFeedQueueForm(prev => ({
      ...prev,
      loggedAt: e.target.value
    }))
  })), React.createElement(FL, {
    lbl: "Quantity"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "0",
    step: "0.01",
    value: feedQueueForm.amount,
    autoFocus: true,
    onChange: e => setFeedQueueForm(prev => ({
      ...prev,
      amount: e.target.value
    })),
    onKeyDown: e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      saveFeedAndContinue();
    }
  })), React.createElement(FL, {
    lbl: "Unit"
  }, React.createElement(AnimatedSlider, {
    options: DASHBOARD_FEED_UNIT_SLIDES,
    value: DASHBOARD_FEED_UNIT_SLIDES.some(item => item.id === feedQueueForm.unit) ? feedQueueForm.unit : "kg",
    onChange: unit => setFeedQueueForm(prev => ({
      ...prev,
      unit,
      sackKg: unit === "sack" ? prev.sackKg || dashboardFeedTypeSackKgText(feedTypeById.get(prev.feedTypeId)) : prev.sackKg
    }))
  })), feedQueueForm.unit === "sack" && React.createElement(FL, {
    lbl: "Kg Per Sack"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "0",
    step: "0.01",
    value: feedQueueForm.sackKg,
    onChange: e => setFeedQueueForm(prev => ({
      ...prev,
      sackKg: e.target.value
    }))
  })), React.createElement("div", {
    style: {
      color: "#7c2d12",
      fontSize: 13,
      marginTop: 4,
      lineHeight: 1.45
    }
  }, currentFeedQueueRemainingLogs > 1 ? "This pen still needs two logs for the selected day. The first queued save will be stamped 7:00 AM, then the second 5:00 PM." : currentFeedQueueRemainingLogs === 1 && currentFeedQueueLogCount === 1 ? "One more log completes this pen for the selected day. It will be stamped as the afternoon feed." : currentFeedQueueRequiredLogs === 1 ? "Before noon the queue expects one log per pen, then advances to the next pen." : "This save completes the pen for the selected day and advances to the next pen."), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 18
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      flex: 1,
      opacity: feedQueueSaving ? .6 : 1
    },
    disabled: feedQueueSaving,
    onClick: skipFeedQueuePen
  }, "Skip"), React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 0,
      flex: 2,
      background: "#b45309",
      opacity: feedQueueSaving ? .7 : 1
    },
    disabled: feedQueueSaving,
    onClick: saveFeedAndContinue
  }, feedQueueSaving ? "Saving..." : feedQueueSaveLabel))))), feedTypes.length > 0 && feedQueueTotal > 0 && !isFeedQueueDone && !currentFeedQueuePen && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14
    }
  }, "Finding next pen in queue...")));
}
