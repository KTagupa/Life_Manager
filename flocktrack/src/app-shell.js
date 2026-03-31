const {
  buildRetentionSnapshot,
  normalizeBackupPayload,
  completeReminderAndScheduleNext,
  buildAutomaticHatchReminders,
  buildAutomaticIncubationReminders,
  financeCategoryLabel
} = globalThis.FlockTrackLogic;
const dataApi = globalThis.FlockTrackData || {};
const emptyOverviewData = () => ({
  eggBatches: [],
  birds: [],
  measurements: [],
  reminderInstances: [],
  eggStates: [],
  pens: [],
  feedTypes: [],
  penFeedLogs: [],
  financeEntries: []
});
const emptyDeferredData = () => ({
  healthEvents: [],
  reminderRules: []
});
const appSortEggProgressPhotos = rows => [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (Number(a?.dayNumber) || 0) - (Number(b?.dayNumber) || 0) || new Date(a?.takenAt || 0) - new Date(b?.takenAt || 0));
const readOverviewData = dataApi.loadOverviewData || dataApi.loadCoreData || (async () => emptyOverviewData());
const readDeferredData = dataApi.loadDeferredData || (async () => emptyDeferredData());
const loadPhotoExportRows = dataApi.loadPhotoExportRows || (async () => []);
const loadBirdPhotos = dataApi.loadBirdPhotos || (async () => []);
const loadEggProgressPhotos = dataApi.loadEggProgressPhotos || (async () => []);
const exportAllStores = dataApi.exportAllStores || (async () => ({
  stores: {},
  total: 0
}));
const replaceStores = dataApi.replaceStores || (async () => {});
const clearAllStores = dataApi.clearAllStores || (async () => {});
const APP_PENS_NEST_CHICKS_ICON = typeof globalThis !== "undefined" && globalThis.FLOCK_TRACK_PENS_NEST_CHICKS_ICON ? globalThis.FLOCK_TRACK_PENS_NEST_CHICKS_ICON : "assets/icons/pens-nest-chicks-icon.png";
const TABS = [{
  id: "overview",
  lbl: "Overview",
  ic: "🏠"
}, {
  id: "workspace",
  lbl: "Workspace",
  ic: "🧰"
}, {
  id: "hatchery",
  lbl: "Hatchery",
  ic: "🥚"
}, {
  id: "pens",
  lbl: "Pens",
  ic: "🪺",
  iconSrc: APP_PENS_NEST_CHICKS_ICON,
  iconScale: 1.45
}, {
  id: "flock",
  lbl: "Flock",
  ic: "🐓"
}, {
  id: "search",
  lbl: "Search",
  ic: "🔎"
}, {
  id: "stats",
  lbl: "Stats",
  ic: "📊"
}, {
  id: "finance",
  lbl: "Finance",
  ic: "💸"
}, {
  id: "settings",
  lbl: "Settings",
  ic: "⚙️"
}];
const HIDEABLE_TAB_ORDER = ["search", "flock", "pens", "hatchery", "workspace", "stats", "finance"];
const HIDEABLE_TAB_IDS = new Set(HIDEABLE_TAB_ORDER);
const LAZY_SCREEN_DEFS = {
  workspace: {
    component: "WorkspacesTab",
    src: "build/chunk-hatchery.js",
    title: "Workspace"
  },
  hatchery: {
    component: "Batches",
    src: "build/chunk-hatchery.js",
    title: "Hatchery"
  },
  pens: {
    component: "Pens",
    src: "build/chunk-pens.js",
    title: "Pens"
  },
  flock: {
    component: "Birds",
    src: "build/chunk-flock.js",
    title: "Flock"
  },
  settings: {
    component: "SettingsTab",
    src: "build/chunk-settings.js",
    title: "Settings"
  },
  stats: {
    component: "StatsTab",
    src: "build/chunk-stats.js",
    title: "Stats"
  },
  finance: {
    component: "FinanceTab",
    src: "build/chunk-finance.js",
    title: "Finance"
  }
};
const DEFERRED_DATA_TABS = new Set(["flock", "search", "stats"]);
const DEFERRED_SETTINGS_SECTIONS = new Set(["tasks", "reports"]);
const DESKTOP_SHELL_MEDIA_QUERY = "(min-width: 1100px)";
const PHONE_SHELL_MEDIA_QUERY = "(max-width: 767px)";
const TAB_VISIBILITY_STORAGE_KEY = "flocktrack-tab-visibility-v1";
const GIST_SYNC_STORAGE_KEY = "flocktrack-gist-sync-v1";
const GIST_DEVICE_ID_STORAGE_KEY = "flocktrack-gist-device-id-v1";
const GIST_DEFAULT_FILE_NAME = "flocktrack-sync.json";
const GIST_DEFAULT_SYNC_CONFIG = {
  syncEnabled: true,
  token: "",
  gistId: "",
  fileName: GIST_DEFAULT_FILE_NAME,
  lastRemoteUpdatedAt: "",
  lastSyncAt: "",
  lastSyncDirection: ""
};
const GIST_ROW_TIME_KEYS = ["updatedAt", "modifiedAt", "archivedAt", "purgedAt", "completedAt", "createdAt", "takenAt", "measuredAt", "loggedAt", "dueAt", "collectedDate", "soldDate", "deceasedDate", "culledDate", "date", "hatchDate"];
const safeStorageGet = key => {
  try {
    return window?.localStorage?.getItem(key) || "";
  } catch {
    return "";
  }
};
const safeStorageSet = (key, value) => {
  try {
    if (window?.localStorage) window.localStorage.setItem(key, value);
  } catch {}
};
const defaultTabVisibility = () => Object.fromEntries(HIDEABLE_TAB_ORDER.map(id => [id, true]));
const loadSavedTabVisibility = () => {
  const defaults = defaultTabVisibility();
  const raw = safeStorageGet(TAB_VISIBILITY_STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    HIDEABLE_TAB_ORDER.forEach(id => {
      if (typeof parsed[id] === "boolean") defaults[id] = parsed[id];
    });
    return defaults;
  } catch {
    return defaults;
  }
};
const lazyScreenInitialStatus = () => Object.fromEntries(Object.entries(LAZY_SCREEN_DEFS).map(([key, cfg]) => [key, typeof globalThis !== "undefined" && typeof globalThis[cfg.component] === "function" ? "ready" : "idle"]));
const lazyScreenComponent = key => {
  const cfg = LAZY_SCREEN_DEFS[key];
  if (!cfg || typeof globalThis === "undefined") return null;
  return globalThis[cfg.component] || null;
};
const tabNeedsDeferredData = (tabId, settingsSection, overlayKind) => DEFERRED_DATA_TABS.has(tabId) || tabId === "settings" && DEFERRED_SETTINGS_SECTIONS.has(settingsSection) || overlayKind === "bird";
const scheduleIdleTask = callback => {
  if (typeof window === "undefined") return null;
  if (typeof window.requestIdleCallback === "function") return {
    type: "idle",
    handle: window.requestIdleCallback(callback, {
      timeout: 1200
    })
  };
  return {
    type: "timeout",
    handle: window.setTimeout(callback, 220)
  };
};
const cancelIdleTask = task => {
  if (!task || typeof window === "undefined") return;
  if (task.type === "idle" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(task.handle);
    return;
  }
  window.clearTimeout(task.handle);
};
function appStatusView(title, message, errorMessage = "") {
  const isError = !!errorMessage;
  return React.createElement("div", {
    style: C.body
  }, React.createElement("div", {
    style: {
      ...C.card,
      borderColor: isError ? "#fecaca" : "#d9e3ef",
      background: isError ? "#fff5f5" : "#ffffff"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: isError ? "#b91c1c" : "#0f172a"
    }
  }, title), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 14,
      color: "#475569",
      lineHeight: 1.45
    }
  }, message || (isError ? errorMessage : "Loading...")), isError && React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 13,
      color: "#64748b"
    }
  }, "Reload the app if this keeps happening.")));
}
const parseDateMs = value => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};
const appNormalizeStoredDay = value => {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ms = parseDateMs(raw);
  if (!Number.isFinite(ms) || ms <= 0) return raw.slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
};
const appMeasurementDayKey = value => {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ms = parseDateMs(raw);
  if (!Number.isFinite(ms) || ms <= 0) return raw.slice(0, 10);
  const dt = new Date(ms);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const appHatchDateRevisionScore = row => Math.max(parseDateMs(row?.updatedAt), parseDateMs(row?.modifiedAt), parseDateMs(row?.createdAt), parseDateMs(row?.date), parseDateMs(row?.hatchDate));
const reconcileLinkedHatchDates = core => {
  const birds = Array.isArray(core?.birds) ? core.birds.filter(row => row && typeof row === "object") : [];
  const eggStates = Array.isArray(core?.eggStates) ? core.eggStates.filter(row => row && typeof row === "object") : [];
  if (!birds.length || !eggStates.length) return {
    birds,
    eggStates,
    birdsChanged: false,
    eggStatesChanged: false
  };
  const nowIso = new Date().toISOString();
  const birdById = new Map(birds.map(bird => [bird.id, bird]));
  let birdsChanged = false;
  let eggStatesChanged = false;
  const nextEggStates = eggStates.map(state => {
    if (state?.status !== "hatched" || !state?.birdId) return state;
    const linkedBird = birdById.get(state.birdId);
    if (!linkedBird) return state;
    const eggDay = appNormalizeStoredDay(state.date);
    const birdDay = appNormalizeStoredDay(linkedBird.hatchDate);
    if (!eggDay && !birdDay) return state;
    const eggScore = appHatchDateRevisionScore(state);
    const birdScore = appHatchDateRevisionScore(linkedBird);
    const preferredDay = birdDay && (!eggDay || birdScore >= eggScore) ? birdDay : eggDay || birdDay;
    let nextState = state;
    if (preferredDay && preferredDay !== eggDay) {
      eggStatesChanged = true;
      nextState = {
        ...state,
        date: preferredDay,
        updatedAt: nowIso
      };
    }
    if (preferredDay && preferredDay !== birdDay) {
      birdsChanged = true;
      birdById.set(linkedBird.id, {
        ...linkedBird,
        hatchDate: preferredDay,
        updatedAt: nowIso
      });
    }
    return nextState;
  });
  return {
    birds: birdsChanged ? birds.map(bird => birdById.get(bird.id) || bird) : birds,
    eggStates: eggStatesChanged ? nextEggStates : eggStates,
    birdsChanged,
    eggStatesChanged
  };
};
const appMeasurementRowScore = row => Math.max(parseDateMs(row?.modifiedAt), parseDateMs(row?.measuredAt), parseDateMs(row?.createdAt), parseDateMs(row?.updatedAt));
const appNormalizeMeasurements = rows => {
  const source = Array.isArray(rows) ? rows.filter(row => row && typeof row === "object") : [];
  const nonWeightRows = [];
  const bestWeightByBirdDay = new Map();
  let normalizedDates = false;
  source.forEach(row => {
    const metricType = String(row?.metricType || "").trim().toLowerCase();
    if (metricType !== "weight" || !row?.birdId) {
      nonWeightRows.push(row);
      return;
    }
    const day = appMeasurementDayKey(row.measuredAt);
    if (!day) {
      nonWeightRows.push(row);
      return;
    }
    const normalizedRow = row.measuredAt === day ? row : {
      ...row,
      measuredAt: day
    };
    if (normalizedRow !== row) normalizedDates = true;
    const key = `${row.birdId}::${day}`;
    const existing = bestWeightByBirdDay.get(key);
    if (!existing || appMeasurementRowScore(normalizedRow) > appMeasurementRowScore(existing) || appMeasurementRowScore(normalizedRow) === appMeasurementRowScore(existing) && String(normalizedRow.id || "").localeCompare(String(existing.id || "")) > 0) {
      bestWeightByBirdDay.set(key, normalizedRow);
    }
  });
  const weightRows = [...bestWeightByBirdDay.values()].sort((a, b) => appMeasurementRowScore(a) - appMeasurementRowScore(b) || String(a.id || "").localeCompare(String(b.id || "")));
  const normalized = [...nonWeightRows, ...weightRows];
  return {
    rows: normalized,
    changed: normalizedDates || normalized.length !== source.length
  };
};
const stableJson = value => {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
};
const rowConflictTime = row => {
  if (!row || typeof row !== "object") return 0;
  let best = 0;
  GIST_ROW_TIME_KEYS.forEach(key => {
    const ms = parseDateMs(row[key]);
    if (ms > best) best = ms;
  });
  Object.keys(row).forEach(key => {
    if (GIST_ROW_TIME_KEYS.includes(key)) return;
    if (!/(At|Date)$/.test(key)) return;
    const ms = parseDateMs(row[key]);
    if (ms > best) best = ms;
  });
  return best;
};
const isBlankSyncValue = value => value == null || typeof value === "string" && value.trim() === "" || Array.isArray(value) && value.length === 0;
const pickSyncField = (localValue, remoteValue, localScore, remoteScore, preferSide) => {
  if (stableJson(localValue) === stableJson(remoteValue)) return remoteValue;
  const localBlank = isBlankSyncValue(localValue);
  const remoteBlank = isBlankSyncValue(remoteValue);
  if (localBlank && !remoteBlank) return remoteValue;
  if (remoteBlank && !localBlank) return localValue;
  if (localScore > remoteScore) return localValue;
  if (remoteScore > localScore) return remoteValue;
  return preferSide === "local" ? localValue : remoteValue;
};
const syncEventTime = event => parseDateMs(event?.date || event?.eventDate || event?.measuredAt || event?.updatedAt || event?.modifiedAt || event?.createdAt);
const mergeSyncArrayById = (localArray, remoteArray, preferSide, getScore = syncEventTime) => {
  const local = Array.isArray(localArray) ? localArray : [];
  const remote = Array.isArray(remoteArray) ? remoteArray : [];
  const map = new Map();
  const keyOf = (item, idx, side) => item?.id != null ? `id:${item.id}` : `${side}:${idx}:${stableJson(item)}`;
  local.forEach((item, idx) => {
    const key = keyOf(item, idx, "local");
    map.set(key, {
      local: item,
      remote: null
    });
  });
  remote.forEach((item, idx) => {
    const key = keyOf(item, idx, "remote");
    if (map.has(key)) {
      map.get(key).remote = item;
      return;
    }
    map.set(key, {
      local: null,
      remote: item
    });
  });
  const merged = [];
  map.forEach(pair => {
    if (pair.local && !pair.remote) {
      merged.push(pair.local);
      return;
    }
    if (!pair.local && pair.remote) {
      merged.push(pair.remote);
      return;
    }
    const localScore = getScore(pair.local);
    const remoteScore = getScore(pair.remote);
    const winner = localScore > remoteScore ? pair.local : remoteScore > localScore ? pair.remote : preferSide === "local" ? pair.local : pair.remote;
    const other = winner === pair.local ? pair.remote : pair.local;
    const out = {
      ...winner
    };
    Object.keys(other || {}).forEach(key => {
      if (isBlankSyncValue(out[key]) && !isBlankSyncValue(other[key])) out[key] = other[key];
    });
    merged.push(out);
  });
  merged.sort((a, b) => {
    const diff = getScore(a) - getScore(b);
    if (diff) return diff;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  return merged;
};
const latestSyncEvent = (items, getScore = syncEventTime) => {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return null;
  let best = arr[0];
  let bestScore = getScore(best);
  for (let i = 1; i < arr.length; i++) {
    const score = getScore(arr[i]);
    if (score > bestScore) {
      best = arr[i];
      bestScore = score;
    }
  }
  return best;
};
const BIRD_PROFILE_FIELDS = new Set(["tagId", "nickname", "hatchDate", "stage", "breed", "sex", "originBatchId", "notes", "createdAt"]);
const BIRD_STATUS_FIELDS = new Set(["status", "soldDate", "buyerName", "salePrice", "deceasedDate", "causeOfDeath", "culledDate", "cullReason", "archivedAt"]);
const birdStatusScore = bird => {
  const history = Array.isArray(bird?.statusHistory) ? bird.statusHistory : [];
  let best = Math.max(parseDateMs(bird?.soldDate), parseDateMs(bird?.deceasedDate), parseDateMs(bird?.culledDate), parseDateMs(bird?.archivedAt));
  history.forEach(event => {
    const ms = syncEventTime(event);
    if (ms > best) best = ms;
  });
  return best;
};
const birdPenScore = bird => {
  const history = Array.isArray(bird?.penHistory) ? bird.penHistory : [];
  let best = 0;
  history.forEach(event => {
    const ms = syncEventTime(event);
    if (ms > best) best = ms;
  });
  return best;
};
const mergeBirdConflictRow = (localRow, remoteRow, preferSide) => {
  const local = localRow && typeof localRow === "object" ? localRow : {};
  const remote = remoteRow && typeof remoteRow === "object" ? remoteRow : {};
  const localRowScore = rowConflictTime(local);
  const remoteRowScore = rowConflictTime(remote);
  const localProfileScore = Math.max(parseDateMs(local.updatedAt), parseDateMs(local.modifiedAt), parseDateMs(local.createdAt), parseDateMs(local.hatchDate));
  const remoteProfileScore = Math.max(parseDateMs(remote.updatedAt), parseDateMs(remote.modifiedAt), parseDateMs(remote.createdAt), parseDateMs(remote.hatchDate));
  const localStatusScore = birdStatusScore(local);
  const remoteStatusScore = birdStatusScore(remote);
  const localPenScore = birdPenScore(local);
  const remotePenScore = birdPenScore(remote);
  const statusHistory = mergeSyncArrayById(local.statusHistory, remote.statusHistory, preferSide, syncEventTime);
  const penHistory = mergeSyncArrayById(local.penHistory, remote.penHistory, preferSide, syncEventTime);
  const out = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach(key => {
    if (key === "id") {
      out.id = local.id != null ? local.id : remote.id;
      return;
    }
    if (key === "statusHistory" || key === "penHistory" || key === "penId") return;
    if (BIRD_STATUS_FIELDS.has(key)) {
      out[key] = pickSyncField(local[key], remote[key], localStatusScore, remoteStatusScore, preferSide);
      return;
    }
    if (BIRD_PROFILE_FIELDS.has(key)) {
      out[key] = pickSyncField(local[key], remote[key], localProfileScore, remoteProfileScore, preferSide);
      return;
    }
    out[key] = pickSyncField(local[key], remote[key], localRowScore, remoteRowScore, preferSide);
  });
  out.statusHistory = statusHistory;
  out.penHistory = penHistory;
  const latestStatus = latestSyncEvent(statusHistory, syncEventTime);
  if (latestStatus?.status) out.status = latestStatus.status;
  const latestPen = latestSyncEvent(penHistory, syncEventTime);
  if (latestPen && Object.prototype.hasOwnProperty.call(latestPen, "toPenId")) out.penId = latestPen.toPenId || null;else out.penId = pickSyncField(local.penId, remote.penId, localPenScore, remotePenScore, preferSide);
  return out;
};
const mergeMeasurementConflictRow = (localRow, remoteRow, preferSide) => {
  const local = localRow && typeof localRow === "object" ? localRow : {};
  const remote = remoteRow && typeof remoteRow === "object" ? remoteRow : {};
  const localRowScore = rowConflictTime(local);
  const remoteRowScore = rowConflictTime(remote);
  const localMeasuredScore = parseDateMs(local.measuredAt);
  const remoteMeasuredScore = parseDateMs(remote.measuredAt);
  const out = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach(key => {
    if (key === "id") {
      out.id = local.id != null ? local.id : remote.id;
      return;
    }
    if (key === "measuredAt") {
      out[key] = pickSyncField(local[key], remote[key], localMeasuredScore, remoteMeasuredScore, preferSide);
      return;
    }
    if (key === "metricType" || key === "value" || key === "unit" || key === "ageDays" || key === "notes" || key === "birdId") {
      out[key] = pickSyncField(local[key], remote[key], localMeasuredScore, remoteMeasuredScore, preferSide);
      return;
    }
    out[key] = pickSyncField(local[key], remote[key], localRowScore, remoteRowScore, preferSide);
  });
  return out;
};
const mergeHealthConflictRow = (localRow, remoteRow, preferSide) => {
  const local = localRow && typeof localRow === "object" ? localRow : {};
  const remote = remoteRow && typeof remoteRow === "object" ? remoteRow : {};
  const localRowScore = rowConflictTime(local);
  const remoteRowScore = rowConflictTime(remote);
  const localEventScore = parseDateMs(local.eventDate);
  const remoteEventScore = parseDateMs(remote.eventDate);
  const out = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach(key => {
    if (key === "id") {
      out.id = local.id != null ? local.id : remote.id;
      return;
    }
    if (key === "eventDate") {
      out[key] = pickSyncField(local[key], remote[key], localEventScore, remoteEventScore, preferSide);
      return;
    }
    if (key === "eventType" || key === "details" || key === "medication" || key === "dose" || key === "outcome" || key === "birdId") {
      out[key] = pickSyncField(local[key], remote[key], localEventScore, remoteEventScore, preferSide);
      return;
    }
    out[key] = pickSyncField(local[key], remote[key], localRowScore, remoteRowScore, preferSide);
  });
  return out;
};
const mergeFinanceConflictRow = (localRow, remoteRow, preferSide) => {
  const local = localRow && typeof localRow === "object" ? localRow : {};
  const remote = remoteRow && typeof remoteRow === "object" ? remoteRow : {};
  const localRowScore = rowConflictTime(local);
  const remoteRowScore = rowConflictTime(remote);
  const localFinanceScore = Math.max(parseDateMs(local.updatedAt), parseDateMs(local.modifiedAt), parseDateMs(local.createdAt), parseDateMs(local.date));
  const remoteFinanceScore = Math.max(parseDateMs(remote.updatedAt), parseDateMs(remote.modifiedAt), parseDateMs(remote.createdAt), parseDateMs(remote.date));
  const out = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach(key => {
    if (key === "id") {
      out.id = local.id != null ? local.id : remote.id;
      return;
    }
    if (key === "date" || key === "type" || key === "category" || key === "amount" || key === "description" || key === "notes" || key === "feedTypeId" || key === "quantity" || key === "unit" || key === "sackKg") {
      out[key] = pickSyncField(local[key], remote[key], localFinanceScore, remoteFinanceScore, preferSide);
      return;
    }
    out[key] = pickSyncField(local[key], remote[key], localRowScore, remoteRowScore, preferSide);
  });
  return out;
};
const resolveStoreConflictRow = (storeName, localRow, remoteRow, preferSide) => {
  if (storeName === "birds") return mergeBirdConflictRow(localRow, remoteRow, preferSide);
  if (storeName === "measurements") return mergeMeasurementConflictRow(localRow, remoteRow, preferSide);
  if (storeName === "healthEvents") return mergeHealthConflictRow(localRow, remoteRow, preferSide);
  if (storeName === "financeEntries") return mergeFinanceConflictRow(localRow, remoteRow, preferSide);
  const localScore = rowConflictTime(localRow);
  const remoteScore = rowConflictTime(remoteRow);
  if (localScore > remoteScore) return localRow;
  if (remoteScore > localScore) return remoteRow;
  return preferSide === "local" ? localRow : remoteRow;
};
const sanitizeGistSyncConfig = raw => {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    syncEnabled: source.syncEnabled !== false,
    token: String(source.token || "").trim(),
    gistId: String(source.gistId || "").trim(),
    fileName: String(source.fileName || GIST_DEFAULT_FILE_NAME).trim() || GIST_DEFAULT_FILE_NAME,
    lastRemoteUpdatedAt: String(source.lastRemoteUpdatedAt || "").trim(),
    lastSyncAt: String(source.lastSyncAt || "").trim(),
    lastSyncDirection: String(source.lastSyncDirection || "").trim()
  };
};
const loadSavedGistSyncConfig = () => {
  const raw = safeStorageGet(GIST_SYNC_STORAGE_KEY);
  if (!raw) return GIST_DEFAULT_SYNC_CONFIG;
  try {
    return sanitizeGistSyncConfig({
      ...GIST_DEFAULT_SYNC_CONFIG,
      ...JSON.parse(raw)
    });
  } catch {
    return GIST_DEFAULT_SYNC_CONFIG;
  }
};
const saveGistSyncConfig = cfg => {
  const normalized = sanitizeGistSyncConfig(cfg);
  safeStorageSet(GIST_SYNC_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};
const ensureGistDeviceId = () => {
  const existing = safeStorageGet(GIST_DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const id = `ft-${uid()}`;
  safeStorageSet(GIST_DEVICE_ID_STORAGE_KEY, id);
  return id;
};
const mergeStoreRows = (storeName, localRows, remoteRows, preferSide) => {
  const local = Array.isArray(localRows) ? localRows : [];
  const remote = Array.isArray(remoteRows) ? remoteRows : [];
  const map = new Map();
  const order = [];
  const localKey = (row, idx) => row?.id != null ? String(row.id) : `__local_${idx}_${stableJson(row)}`;
  const remoteKey = (row, idx) => row?.id != null ? String(row.id) : `__remote_${idx}_${stableJson(row)}`;
  local.forEach((row, idx) => {
    const key = localKey(row, idx);
    map.set(key, {
      local: row,
      remote: null
    });
    order.push(key);
  });
  remote.forEach((row, idx) => {
    const key = remoteKey(row, idx);
    if (map.has(key)) {
      map.get(key).remote = row;
      return;
    }
    map.set(key, {
      local: null,
      remote: row
    });
    order.push(key);
  });
  let conflicts = 0;
  let keptLocal = 0;
  let keptRemote = 0;
  let addedFromLocal = 0;
  let addedFromRemote = 0;
  const rows = order.map(key => {
    const entry = map.get(key);
    if (entry.local && !entry.remote) {
      addedFromLocal += 1;
      return entry.local;
    }
    if (!entry.local && entry.remote) {
      addedFromRemote += 1;
      return entry.remote;
    }
    const same = stableJson(entry.local) === stableJson(entry.remote);
    if (same) return entry.remote;
    conflicts += 1;
    const resolved = resolveStoreConflictRow(storeName, entry.local, entry.remote, preferSide);
    const resolvedJson = stableJson(resolved);
    const localJson = stableJson(entry.local);
    const remoteJson = stableJson(entry.remote);
    if (resolvedJson === localJson) {
      keptLocal += 1;
      return entry.local;
    }
    if (resolvedJson === remoteJson) {
      keptRemote += 1;
      return entry.remote;
    }
    keptLocal += 1;
    keptRemote += 1;
    return resolved;
  });
  return {
    rows,
    conflicts,
    keptLocal,
    keptRemote,
    addedFromLocal,
    addedFromRemote
  };
};
const mergeStoreSets = (localStores, remoteStores, preferSide) => {
  const stores = {};
  const conflictsByStore = {};
  let total = 0;
  let conflicts = 0;
  let keptLocal = 0;
  let keptRemote = 0;
  let addedFromLocal = 0;
  let addedFromRemote = 0;
  STORES.forEach(store => {
    const merged = mergeStoreRows(store, localStores?.[store], remoteStores?.[store], preferSide);
    stores[store] = merged.rows;
    total += merged.rows.length;
    conflicts += merged.conflicts;
    keptLocal += merged.keptLocal;
    keptRemote += merged.keptRemote;
    addedFromLocal += merged.addedFromLocal;
    addedFromRemote += merged.addedFromRemote;
    if (merged.conflicts > 0) conflictsByStore[store] = merged.conflicts;
  });
  return {
    stores,
    total,
    conflicts,
    conflictsByStore,
    keptLocal,
    keptRemote,
    addedFromLocal,
    addedFromRemote
  };
};
const gistErrorMessage = async res => {
  try {
    const json = await res.json();
    if (json?.message) return `GitHub API ${res.status}: ${json.message}`;
  } catch {}
  return `GitHub API ${res.status}`;
};
const githubJson = async (url, {
  method = "GET",
  token = "",
  body
} = {}) => {
  const headers = {
    Accept: "application/vnd.github+json"
  };
  if (token) headers.Authorization = `token ${token}`;
  if (body != null) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await gistErrorMessage(res));
  return res.json();
};
const githubText = async (url, token) => {
  const headers = {};
  if (token) headers.Authorization = `token ${token}`;
  const res = await fetch(url, {
    method: "GET",
    headers
  });
  if (!res.ok) throw new Error(`Could not read gist file content (${res.status}).`);
  return res.text();
};
const buildGistPayload = ({
  stores,
  total,
  sourceDeviceId,
  mergeMeta
}) => ({
  format: "flocktrack-sync-v1",
  createdAt: new Date().toISOString(),
  dbName: DB_NAME,
  dbVersion: DB_VER,
  sourceDeviceId: sourceDeviceId || "",
  mergeMeta: mergeMeta || null,
  stores,
  total
});
const resolveGistFile = (gist, preferredName) => {
  const files = gist?.files && typeof gist.files === "object" ? gist.files : {};
  if (preferredName && files[preferredName]) return files[preferredName];
  const list = Object.values(files);
  if (list.length === 1) return list[0];
  return null;
};
const PASTED_JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/i;
const extractJsonCandidate = rawText => {
  const text = String(rawText == null ? "" : rawText).trim();
  if (!text) throw new Error("Paste JSON cannot be empty.");
  const fenced = text.match(PASTED_JSON_FENCE_RE);
  if (fenced && fenced[1]) return fenced[1].trim();
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) return text.slice(objectStart, objectEnd + 1).trim();
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1).trim();
  return text;
};
const parseBackupPayloadFromText = rawText => {
  const jsonCandidate = extractJsonCandidate(rawText);
  let parsed;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    throw new Error("Could not parse pasted JSON. Make sure the JSON is valid.");
  }
  const {
    normalized,
    total
  } = normalizeBackupPayload(parsed, STORES);
  const storeCounts = {};
  STORES.forEach(store => {
    storeCounts[store] = Array.isArray(normalized[store]) ? normalized[store].length : 0;
  });
  return {
    normalized,
    total,
    storeCounts
  };
};
function SearchTab({
  birds,
  batches,
  pens,
  feedTypes,
  penFeedLogs,
  financeEntries,
  measurements,
  healthEvents,
  reminders,
  onOpenBird,
  onOpenTab
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const batchById = useMemo(() => new Map((batches || []).map(batch => [batch.id, batch])), [batches]);
  const birdById = useMemo(() => new Map((birds || []).map(bird => [bird.id, bird])), [birds]);
  const penById = useMemo(() => new Map((pens || []).map(pen => [pen.id, pen])), [pens]);
  const feedTypeById = useMemo(() => new Map((feedTypes || []).map(type => [type.id, type])), [feedTypes]);
  const matchAny = (values, queryText) => values.some(value => String(value || "").toLowerCase().includes(queryText));
  const birdLabel = bird => {
    const nickname = String(bird?.nickname || "").trim();
    const tagId = String(bird?.tagId || "").trim();
    if (nickname && tagId) return `${nickname} (${tagId})`;
    return nickname || tagId || "Bird";
  };
  const groups = useMemo(() => {
    if (!q) return [];
    const out = [];
    const addGroup = (id, label, items) => {
      if (!items.length) return;
      out.push({
        id,
        label,
        items
      });
    };
    const birdItems = (birds || []).filter(bird => matchAny([bird.tagId, bird.nickname, bird.breed, bird.sex, bird.status, bird.notes, stageLabel(bird.stage), bird.penId ? penById.get(bird.penId)?.name : "", bird.originBatchId ? batchById.get(bird.originBatchId)?.code : ""], q)).map(bird => ({
      id: bird.id,
      title: String(bird.nickname || "").trim() || bird.tagId || "Bird",
      subtitle: [String(bird.nickname || "").trim() ? `Tag ${bird.tagId || "—"}` : "", bird.breed || "No breed", stageLabel(bird.stage), bird.status || "active", bird.penId ? penById.get(bird.penId)?.name || "Assigned pen" : ""].filter(Boolean).join(" · "),
      detail: bird.notes || "",
      onOpen: () => onOpenBird?.(bird.id)
    })).slice(0, 24);
    addGroup("birds", "Birds", birdItems);
    const batchItems = (batches || []).filter(batch => matchAny([batch.code, batch.source, batch.notes, batch.createdAt], q)).map(batch => ({
      id: batch.id,
      title: batch.code || "Batch",
      subtitle: [batch.source || "Unknown source", `${fmtNum(batch.totalEggs || 0)} eggs`].filter(Boolean).join(" · "),
      detail: batch.notes || "",
      onOpen: () => onOpenTab?.("hatchery")
    })).slice(0, 24);
    addGroup("batches", "Batches", batchItems);
    const penItems = (pens || []).filter(pen => matchAny([pen.name, pen.location, pen.notes], q)).map(pen => ({
      id: pen.id,
      title: pen.name || "Pen",
      subtitle: pen.location || "No location",
      detail: pen.notes || "",
      onOpen: () => onOpenTab?.("pens")
    })).slice(0, 24);
    addGroup("pens", "Pens", penItems);
    const feedTypeItems = (feedTypes || []).filter(feedType => matchAny([feedType.name, feedType.defaultUnit, feedType.notes], q)).map(feedType => ({
      id: feedType.id,
      title: feedType.name || "Feed Type",
      subtitle: `Default unit: ${feedType.defaultUnit || "—"}`,
      detail: feedType.notes || "",
      onOpen: () => onOpenTab?.("pens")
    })).slice(0, 24);
    addGroup("feed_types", "Feed Types", feedTypeItems);
    const feedLogItems = (penFeedLogs || []).filter(log => {
      const penName = penById.get(log.penId)?.name || "";
      const feedName = feedTypeById.get(log.feedTypeId)?.name || "";
      return matchAny([penName, feedName, log.amount, log.unit, log.loggedAt, log.notes], q);
    }).sort((a, b) => dateMs(b.loggedAt) - dateMs(a.loggedAt)).map(log => {
      const penName = penById.get(log.penId)?.name || "Unknown pen";
      const feedName = feedTypeById.get(log.feedTypeId)?.name || "Feed";
      return {
        id: log.id,
        title: `${penName} · ${feedName}`,
        subtitle: `${fmtNum(log.amount)} ${log.unit || ""} · ${fmtDateTime(log.loggedAt)}`,
        detail: log.notes || "",
        onOpen: () => onOpenTab?.("pens")
      };
    }).slice(0, 24);
    addGroup("feed_logs", "Feed Logs", feedLogItems);
    const measurementItems = (measurements || []).filter(measurement => {
      const bird = birdById.get(measurement.birdId);
      return matchAny([bird?.tagId, bird?.nickname, measurement.metricType, measurement.value, measurement.unit, measurement.measuredAt, measurement.notes], q);
    }).sort((a, b) => dateMs(b.measuredAt) - dateMs(a.measuredAt)).map(measurement => {
      const bird = birdById.get(measurement.birdId);
      return {
        id: measurement.id,
        title: `${birdLabel(bird)} · ${humanize(measurement.metricType)}`,
        subtitle: `${fmtNum(measurement.value)} ${measurement.unit || ""} · ${fmtDateTime(measurement.measuredAt)}`,
        detail: measurement.notes || "",
        onOpen: () => bird?.id ? onOpenBird?.(bird.id) : onOpenTab?.("flock")
      };
    }).slice(0, 24);
    addGroup("measurements", "Measurements", measurementItems);
    const healthItems = (healthEvents || []).filter(event => {
      const bird = birdById.get(event.birdId);
      return matchAny([bird?.tagId, bird?.nickname, event.eventType, event.eventDate, event.details, event.medication, event.outcome], q);
    }).sort((a, b) => dateMs(b.eventDate) - dateMs(a.eventDate)).map(event => {
      const bird = birdById.get(event.birdId);
      return {
        id: event.id,
        title: `${birdLabel(bird)} · ${humanize(event.eventType)}`,
        subtitle: fmtDate(event.eventDate),
        detail: [event.details, event.medication ? `Medication: ${event.medication}` : "", event.outcome].filter(Boolean).join(" · "),
        onOpen: () => bird?.id ? onOpenBird?.(bird.id) : onOpenTab?.("flock")
      };
    }).slice(0, 24);
    addGroup("health", "Health Events", healthItems);
    const financeItems = (financeEntries || []).filter(entry => {
      const feedName = entry.feedTypeId ? feedTypeById.get(entry.feedTypeId)?.name || "" : "";
      return matchAny([entry.type, financeCategoryLabel ? financeCategoryLabel(entry.category) : humanize(entry.category || ""), entry.category, entry.amount, entry.date, entry.description, entry.notes, feedName, entry.quantity, entry.unit], q);
    }).sort((a, b) => dateMs(b.updatedAt || b.date) - dateMs(a.updatedAt || a.date)).map(entry => {
      const feedName = entry.feedTypeId ? feedTypeById.get(entry.feedTypeId)?.name || "" : "";
      return {
      id: entry.id,
      title: entry.description || (financeCategoryLabel ? financeCategoryLabel(entry.category) : humanize(entry.category || "finance")),
      subtitle: [humanize(entry.type || "expense"), financeCategoryLabel ? financeCategoryLabel(entry.category) : humanize(entry.category || ""), fmtMoney(entry.amount), fmtDate(entry.date)].filter(Boolean).join(" · "),
      detail: [feedName, entry.quantity != null && entry.unit ? `${fmtNum(entry.quantity)} ${entry.unit}` : "", entry.notes || ""].filter(Boolean).join(" · "),
      onOpen: () => onOpenTab?.("finance")
      };
    }).slice(0, 24);
    addGroup("finance", "Finance Entries", financeItems);
    const reminderItems = (reminders || []).filter(reminder => {
      const bird = birdById.get(reminder.birdId);
      return matchAny([reminder.title, reminder.note, reminder.dueAt, reminder.completedAt, reminder.status, bird?.tagId, bird?.nickname], q);
    }).sort((a, b) => dateMs(b.completedAt || b.dueAt) - dateMs(a.completedAt || a.dueAt)).map(reminder => {
      const bird = birdById.get(reminder.birdId);
      return {
        id: reminder.id,
        title: reminder.title || "Reminder",
        subtitle: [birdLabel(bird), reminder.completedAt ? `Completed ${fmtDate(reminder.completedAt)}` : `Due ${fmtDate(reminder.dueAt)}`].filter(Boolean).join(" · "),
        detail: reminder.note || "",
        onOpen: () => onOpenTab?.("tasks")
      };
    }).slice(0, 24);
    addGroup("reminders", "Reminders", reminderItems);
    return out;
  }, [batchById, batches, birdById, birds, feedTypeById, feedTypes, financeEntries, healthEvents, measurements, onOpenBird, onOpenTab, penById, penFeedLogs, pens, q, reminders]);
  const totalMatches = groups.reduce((sum, group) => sum + group.items.length, 0);
  return React.createElement("div", {
    style: C.body
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "20px 0 14px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "\uD83D\uDD0E Search")), React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 12
    }
  }, React.createElement("input", {
    style: C.inp,
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: "Search birds, pens, batches, logs, finance, reminders..."
  }), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 13,
      color: "#475569",
      fontWeight: 700
    }
  }, q ? `Found ${fmtNum(totalMatches)} matches across ${groups.length} sections` : "Type to search all records")), !q && React.createElement(Empty, {
    icon: "\uD83D\uDD0E",
    msg: "Search across all flock data"
  }), q && !groups.length && React.createElement(Empty, {
    icon: "\uD83D\uDD0D",
    msg: "No matches found"
  }), groups.map(group => React.createElement("div", {
    key: group.id,
    style: {
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 900,
      color: "#475569",
      letterSpacing: ".05em",
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, group.label, " (", group.items.length, ")"), group.items.map(item => React.createElement("button", {
    key: `${group.id}-${item.id}`,
    type: "button",
    onClick: item.onOpen,
    style: {
      ...C.card,
      width: "100%",
      marginBottom: 8,
      padding: 12,
      textAlign: "left",
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, item.title), item.subtitle && React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 13,
      color: "#475569"
    }
  }, item.subtitle), item.detail && React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#64748b",
      lineHeight: 1.4
    }
  }, item.detail))))));
}
const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function calendarDayKey(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function calendarMonthStart(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function calendarShiftMonth(monthDate, delta) {
  const base = calendarMonthStart(monthDate);
  return new Date(base.getFullYear(), base.getMonth() + delta, 1);
}
function calendarMonthGrid(monthDate) {
  const month = calendarMonthStart(monthDate);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    let dayNum = 0;
    let cellDate = null;
    let monthOffset = 0;
    if (i < firstWeekday) {
      dayNum = daysInPrevMonth - firstWeekday + i + 1;
      cellDate = new Date(year, monthIndex - 1, dayNum);
      monthOffset = -1;
    } else if (i - firstWeekday + 1 <= daysInMonth) {
      dayNum = i - firstWeekday + 1;
      cellDate = new Date(year, monthIndex, dayNum);
      monthOffset = 0;
    } else {
      dayNum = i - firstWeekday - daysInMonth + 1;
      cellDate = new Date(year, monthIndex + 1, dayNum);
      monthOffset = 1;
    }
    cells.push({
      dayKey: calendarDayKey(cellDate),
      dayNumber: cellDate.getDate(),
      inMonth: monthOffset === 0,
      monthOffset,
      date: cellDate
    });
  }
  return cells;
}
function desktopShellMatches() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") return window.matchMedia(DESKTOP_SHELL_MEDIA_QUERY).matches;
  return readShellProfile().isDesktop;
}
function mobileBrowserLikely() {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.userAgentData?.mobile === "boolean") return navigator.userAgentData.mobile;
  const ua = String(navigator.userAgent || "");
  return /Android.+Mobile|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}
function shellViewportWidth() {
  if (typeof window === "undefined") return 1440;
  const visualWidth = Number(window.visualViewport?.width);
  if (Number.isFinite(visualWidth) && visualWidth > 0) return visualWidth;
  const innerWidth = Number(window.innerWidth);
  if (Number.isFinite(innerWidth) && innerWidth > 0) return innerWidth;
  const screenWidth = Number(window.screen?.width);
  if (Number.isFinite(screenWidth) && screenWidth > 0) return screenWidth;
  return 1440;
}
function readShellProfile() {
  const width = shellViewportWidth();
  const canMatch = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const isDesktop = canMatch ? window.matchMedia(DESKTOP_SHELL_MEDIA_QUERY).matches : width >= 1100;
  const phoneViewport = canMatch ? window.matchMedia(PHONE_SHELL_MEDIA_QUERY).matches : width <= 767;
  const coarsePointer = canMatch && (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(any-pointer: coarse)").matches);
  const touchCapable = typeof navigator !== "undefined" && Number(navigator.maxTouchPoints || 0) > 0;
  const mobileBrowser = mobileBrowserLikely();
  const isPhone = !isDesktop && (phoneViewport || mobileBrowser && width <= 900 || mobileBrowser && coarsePointer || touchCapable && width <= 640);
  return {
    width,
    isDesktop,
    isPhone,
    isTablet: !isDesktop && !isPhone,
    isTouch: coarsePointer || touchCapable,
    isMobileBrowser: mobileBrowser,
    mode: isDesktop ? "desktop" : isPhone ? "phone" : "tablet"
  };
}
function App() {
  const [tab, setTab] = useState("overview");
  const [settingsSection, setSettingsSection] = useState("general");
  const [settingsGeneralTab, setSettingsGeneralTab] = useState("archivable");
  const [tabVisibility, setTabVisibility] = useState(() => loadSavedTabVisibility());
  const [batches, setBatches] = useState([]);
  const [birds, setBirds] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [healthEvents, setHealthEvents] = useState([]);
  const [rules, setRules] = useState([]);
  const [instances, setInstances] = useState([]);
  const [eggStates, setEggStates] = useState([]);
  const [pens, setPens] = useState([]);
  const [feedTypes, setFeedTypes] = useState([]);
  const [penFeedLogs, setPenFeedLogs] = useState([]);
  const [financeEntries, setFinanceEntries] = useState([]);
  const [photoCache, setPhotoCache] = useState({});
  const [eggPhotoCache, setEggPhotoCache] = useState({});
  const [photoExportRows, setPhotoExportRows] = useState([]);
  const [photoExportLoaded, setPhotoExportLoaded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deferredLoaded, setDeferredLoaded] = useState(false);
  const [deferredLoading, setDeferredLoading] = useState(false);
  const [deferredDataError, setDeferredDataError] = useState("");
  const [lazyScreenStatus, setLazyScreenStatus] = useState(() => lazyScreenInitialStatus());
  const [lazyScreenErrors, setLazyScreenErrors] = useState({});
  const [storageInfo, setStorageInfo] = useState({
    loading: false,
    supported: true,
    usage: 0,
    quota: 0,
    error: ""
  });
  const [retentionInfo, setRetentionInfo] = useState({
    loading: false,
    archivedPhotos: 0,
    archivedPhotosWithImage: 0,
    archivedImageBytes: 0,
    eligibleCount: 0,
    eligibleSold: 0,
    eligibleDeceased: 0,
    eligibleCulled: 0,
    error: ""
  });
  const [gistSyncConfig, setGistSyncConfig] = useState(() => loadSavedGistSyncConfig());
  const [deleteUndo, setDeleteUndo] = useState(null);
  const [pendingBatchOpenId, setPendingBatchOpenId] = useState("");
  const [pendingPenOpenId, setPendingPenOpenId] = useState("");
  const [pendingWorkspaceLaunch, setPendingWorkspaceLaunch] = useState(null);
  const [recordOverlay, setRecordOverlay] = useState(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => calendarMonthStart(new Date()));
  const [calendarSelectedDay, setCalendarSelectedDay] = useState(() => today());
  const [shellProfile, setShellProfile] = useState(() => readShellProfile());
  const photoCacheRef = useRef(photoCache);
  const eggPhotoCacheRef = useRef(eggPhotoCache);
  const gistSyncRef = useRef(gistSyncConfig);
  const deleteUndoTimer = useRef(null);
  const lazyScreenPromisesRef = useRef({});
  const deferredLoadPromiseRef = useRef(null);
  const idleDeferredTaskRef = useRef(null);
  const dataLoadVersionRef = useRef(0);
  const birdsLive = useMemo(() => birds.filter(b => !b.archivedAt), [birds]);
  const isDesktopShell = shellProfile.isDesktop;
  const isPhoneShell = shellProfile.isPhone;
  const birdById = useMemo(() => new Map(birds.map(bird => [bird.id, bird])), [birds]);
  const hideableTabs = useMemo(() => HIDEABLE_TAB_ORDER.map(id => TABS.find(tabDef => tabDef.id === id)).filter(Boolean), []);
  const visibleNavTabs = useMemo(() => TABS.filter(tabDef => !HIDEABLE_TAB_IDS.has(tabDef.id) || tabVisibility[tabDef.id] !== false), [tabVisibility]);
  const shellStyles = useMemo(() => ({
    page: isDesktopShell ? {
      ...C.page,
      paddingBottom: 24,
      paddingLeft: 292,
      background: "linear-gradient(180deg, #eef4fb 0%, #f8fafc 100%)"
    } : {
      ...C.page,
      paddingBottom: isPhoneShell ? "calc(104px + env(safe-area-inset-bottom, 0px))" : C.page.paddingBottom
    },
    bar: isDesktopShell ? {
      ...C.bar,
      padding: "calc(18px + env(safe-area-inset-top, 0px)) 28px 18px",
      background: "rgba(248, 250, 252, 0.9)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)"
    } : {
      ...C.bar,
      padding: isPhoneShell ? "calc(12px + env(safe-area-inset-top, 0px)) 14px 12px" : C.bar.padding,
      gap: isPhoneShell ? 10 : C.bar.gap,
      flexWrap: isPhoneShell ? "wrap" : "nowrap",
      alignItems: isPhoneShell ? "flex-start" : C.bar.alignItems
    },
    sidebar: {
      position: "fixed",
      top: 0,
      left: 0,
      bottom: 0,
      width: 280,
      padding: "22px 18px 24px 22px",
      borderRight: "1px solid #d9e3ef",
      background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 55%, #eef2ff 100%)",
      display: "flex",
      flexDirection: "column",
      gap: 18,
      overflowY: "auto",
      boxShadow: "0 18px 42px -36px #0f172a80",
      zIndex: 55
    },
    sidebarBrand: {
      padding: "18px 18px 16px",
      borderRadius: 22,
      border: "1px solid #e2e8f0",
      background: "linear-gradient(160deg, #fff7ed 0%, #ffffff 100%)",
      boxShadow: "0 16px 28px -26px #0f172a80"
    },
    sidebarNav: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: 6,
      borderRadius: 22,
      border: "1px solid #d9e3ef",
      background: "rgba(255, 255, 255, 0.82)",
      boxShadow: "0 16px 32px -30px #0f172a70"
    },
    sidebarNote: {
      marginTop: "auto",
      padding: "16px 18px",
      borderRadius: 20,
      border: "1px solid #d9e3ef",
      background: "#ffffffcc",
      boxShadow: "0 14px 28px -26px #0f172a55"
    },
    mobileNav: {
      ...C.nav,
      boxShadow: "0 -12px 28px -24px #0f172a55"
    }
  }), [isDesktopShell, isPhoneShell]);
  const autoIncubationReminders = useMemo(() => buildAutomaticIncubationReminders({
    batches,
    eggStates
  }), [batches, eggStates]);
  const autoHatchReminders = useMemo(() => buildAutomaticHatchReminders({
    batches,
    eggStates
  }), [batches, eggStates]);
  const allReminders = useMemo(() => [...instances, ...autoIncubationReminders, ...autoHatchReminders], [autoHatchReminders, autoIncubationReminders, instances]);
  const calendarEventsByDay = useMemo(() => {
    const map = new Map();
    allReminders.forEach((reminder, idx) => {
      if (reminder?.status && reminder.status !== "pending") return;
      const isAutoBatchReminder = reminder.source === "auto_hatch" || reminder.source === "auto_incubation";
      const eventDate = isAutoBatchReminder ? reminder.source === "auto_hatch" ? reminder.expectedHatchDate || reminder.dueAt : reminder.dueAt : reminder.dueAt;
      const dayKey = calendarDayKey(eventDate);
      if (!dayKey) return;
      const dueMsRaw = new Date(eventDate || 0).getTime();
      const dueMs = Number.isFinite(dueMsRaw) ? dueMsRaw : 0;
      const birdTag = reminder.birdId ? birdById.get(reminder.birdId)?.tagId || "" : "";
      const title = isAutoBatchReminder ? `${reminder.batchCode || "Batch"} — ${reminder.title || humanize(reminder.kind || "task")}` : `${humanize(reminder.kind || "task")} due`;
      const detail = isAutoBatchReminder ? reminder.note || `${fmtNum(reminder.pendingEggCount)} pending eggs` : [birdTag, `Due ${fmtDate(eventDate)}`].filter(Boolean).join(" · ");
      const event = {
        id: reminder.id ? String(reminder.id) : `${isAutoBatchReminder ? "batch-reminder" : "reminder"}-${idx}-${dayKey}`,
        title,
        detail,
        tone: reminder.source === "auto_hatch" ? "#b45309" : reminder.source === "auto_incubation" ? "#0f766e" : "#1d4ed8",
        kind: isAutoBatchReminder ? "Hatchery" : "Reminder",
        target: isAutoBatchReminder ? "hatchery" : "tasks",
        batchId: reminder.batchId || "",
        dueMs
      };
      const existing = map.get(dayKey) || [];
      existing.push(event);
      map.set(dayKey, existing);
    });
    map.forEach(events => events.sort((a, b) => a.dueMs - b.dueMs || a.title.localeCompare(b.title)));
    return map;
  }, [allReminders, birdById]);
  const calendarCells = useMemo(() => calendarMonthGrid(calendarMonth), [calendarMonth]);
  const calendarTodayKey = today();
  const calendarSelectedEvents = calendarEventsByDay.get(calendarSelectedDay) || [];
  const calendarMonthTitle = calendarMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  const activeBirdCount = useMemo(() => birdsLive.filter(b => b.status === "active").length, [birdsLive]);
  const pendingEggCount = useMemo(() => {
    const stateCounts = new Map();
    eggStates.forEach(state => {
      if (!state?.batchId) return;
      const current = stateCounts.get(state.batchId) || {
        hatched: 0,
        failed: 0
      };
      if (state.status === "hatched") current.hatched += 1;
      if (state.status === "failed") current.failed += 1;
      stateCounts.set(state.batchId, current);
    });
    return batches.reduce((sum, batch) => {
      const counts = stateCounts.get(batch.id) || {
        hatched: 0,
        failed: 0
      };
      const eggCount = Math.max(0, Number(batch?.eggCount) || 0);
      return sum + Math.max(0, eggCount - counts.hatched - counts.failed);
    }, 0);
  }, [batches, eggStates]);
  const activeNeedsDeferredData = tabNeedsDeferredData(tab, settingsSection, recordOverlay?.kind);
  const scrollViewportTop = useCallback(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      if (document?.documentElement) document.documentElement.scrollTop = 0;
      if (document?.body) document.body.scrollTop = 0;
    }
  }, []);
  const applyOverviewData = useCallback(core => {
    const normalizedMeasurements = appNormalizeMeasurements(core?.measurements);
    const reconciledHatchDates = reconcileLinkedHatchDates(core);
    setBatches(core?.eggBatches || []);
    setBirds(reconciledHatchDates.birds);
    setMeasurements(normalizedMeasurements.rows);
    setInstances(core?.reminderInstances || []);
    setEggStates(reconciledHatchDates.eggStates);
    setPens(core?.pens || []);
    setFeedTypes(core?.feedTypes || []);
    setPenFeedLogs(core?.penFeedLogs || []);
    setFinanceEntries(core?.financeEntries || []);
    if (normalizedMeasurements.changed) {
      dbReplace("measurements", normalizedMeasurements.rows).catch(console.error);
    }
    if (reconciledHatchDates.birdsChanged) {
      dbReplace("birds", reconciledHatchDates.birds).catch(console.error);
    }
    if (reconciledHatchDates.eggStatesChanged) {
      dbReplace("eggStates", reconciledHatchDates.eggStates).catch(console.error);
    }
  }, []);
  const applyDeferredData = useCallback(data => {
    setHealthEvents(data?.healthEvents || []);
    setRules(data?.reminderRules || []);
  }, []);
  const ensureLazyScreenLoaded = useCallback(screenKey => {
    const cfg = LAZY_SCREEN_DEFS[screenKey];
    if (!cfg) return Promise.resolve(null);
    if (typeof lazyScreenComponent(screenKey) === "function") {
      setLazyScreenStatus(prev => prev[screenKey] === "ready" ? prev : {
        ...prev,
        [screenKey]: "ready"
      });
      setLazyScreenErrors(prev => {
        if (!prev[screenKey]) return prev;
        const next = {
          ...prev
        };
        delete next[screenKey];
        return next;
      });
      return Promise.resolve(lazyScreenComponent(screenKey));
    }
    if (lazyScreenPromisesRef.current[screenKey]) return lazyScreenPromisesRef.current[screenKey];
    if (typeof document === "undefined") return Promise.reject(new Error(`Cannot load ${cfg.title} in this environment.`));
    setLazyScreenStatus(prev => ({
      ...prev,
      [screenKey]: "loading"
    }));
    setLazyScreenErrors(prev => {
      if (!prev[screenKey]) return prev;
      const next = {
        ...prev
      };
      delete next[screenKey];
      return next;
    });
    lazyScreenPromisesRef.current[screenKey] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = cfg.src;
      script.async = true;
      script.dataset.flocktrackChunk = screenKey;
      script.onload = () => {
        lazyScreenPromisesRef.current[screenKey] = null;
        if (typeof lazyScreenComponent(screenKey) === "function") {
          setLazyScreenStatus(prev => ({
            ...prev,
            [screenKey]: "ready"
          }));
          resolve(lazyScreenComponent(screenKey));
          return;
        }
        const err = new Error(`${cfg.title} finished loading but the screen is still unavailable.`);
        setLazyScreenStatus(prev => ({
          ...prev,
          [screenKey]: "error"
        }));
        setLazyScreenErrors(prev => ({
          ...prev,
          [screenKey]: err.message
        }));
        reject(err);
      };
      script.onerror = () => {
        lazyScreenPromisesRef.current[screenKey] = null;
        const err = new Error(`Could not load the ${cfg.title.toLowerCase()} screen.`);
        setLazyScreenStatus(prev => ({
          ...prev,
          [screenKey]: "error"
        }));
        setLazyScreenErrors(prev => ({
          ...prev,
          [screenKey]: err.message
        }));
        reject(err);
      };
      document.head.appendChild(script);
    });
    return lazyScreenPromisesRef.current[screenKey];
  }, []);
  const loadStartupData = useCallback(async () => {
    const version = dataLoadVersionRef.current + 1;
    dataLoadVersionRef.current = version;
    deferredLoadPromiseRef.current = null;
    setLoaded(false);
    setDeferredLoaded(false);
    setDeferredLoading(false);
    setDeferredDataError("");
    try {
      setHealthEvents([]);
      setRules([]);
      const overviewData = await readOverviewData();
      if (dataLoadVersionRef.current !== version) return;
      applyOverviewData(overviewData);
    } catch (e) {
      console.error(e);
    } finally {
      if (dataLoadVersionRef.current === version) setLoaded(true);
    }
  }, [applyOverviewData]);
  const loadDeferredData = useCallback(async () => {
    if (deferredLoaded) return emptyDeferredData();
    if (deferredLoadPromiseRef.current) return deferredLoadPromiseRef.current;
    const version = dataLoadVersionRef.current;
    setDeferredLoading(true);
    setDeferredDataError("");
    deferredLoadPromiseRef.current = Promise.resolve(readDeferredData()).then(data => {
      if (dataLoadVersionRef.current !== version) return data;
      applyDeferredData(data);
      setDeferredLoaded(true);
      return data;
    }).catch(err => {
      if (dataLoadVersionRef.current === version) {
        console.error(err);
        setDeferredDataError(err?.message || "Could not load the rest of the app data.");
      }
      throw err;
    }).finally(() => {
      if (dataLoadVersionRef.current === version) setDeferredLoading(false);
      deferredLoadPromiseRef.current = null;
    });
    return deferredLoadPromiseRef.current;
  }, [applyDeferredData, deferredLoaded]);
  useEffect(() => {
    photoCacheRef.current = photoCache;
  }, [photoCache]);
  useEffect(() => {
    eggPhotoCacheRef.current = eggPhotoCache;
  }, [eggPhotoCache]);
  useEffect(() => {
    gistSyncRef.current = gistSyncConfig;
  }, [gistSyncConfig]);
  useEffect(() => () => {
    if (deleteUndoTimer.current) clearTimeout(deleteUndoTimer.current);
    cancelIdleTask(idleDeferredTaskRef.current);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncShellProfile = () => setShellProfile(readShellProfile());
    const visualViewport = window.visualViewport;
    syncShellProfile();
    window.addEventListener("resize", syncShellProfile);
    window.addEventListener("orientationchange", syncShellProfile);
    if (visualViewport?.addEventListener) visualViewport.addEventListener("resize", syncShellProfile);
    return () => {
      window.removeEventListener("resize", syncShellProfile);
      window.removeEventListener("orientationchange", syncShellProfile);
      if (visualViewport?.removeEventListener) visualViewport.removeEventListener("resize", syncShellProfile);
    };
  }, []);
  useEffect(() => {
    scrollViewportTop();
  }, [scrollViewportTop, tab]);
  useEffect(() => {
    loadStartupData().catch(console.error);
  }, [loadStartupData]);
  useEffect(() => {
    if (!loaded || deferredLoaded || deferredLoading) return;
    const task = scheduleIdleTask(() => {
      loadDeferredData().catch(() => {});
    });
    idleDeferredTaskRef.current = task;
    return () => cancelIdleTask(task);
  }, [deferredLoaded, deferredLoading, loadDeferredData, loaded]);
  useEffect(() => {
    if (!loaded || deferredLoaded || !activeNeedsDeferredData) return;
    loadDeferredData().catch(() => {});
  }, [activeNeedsDeferredData, deferredLoaded, loadDeferredData, loaded]);
  useEffect(() => {
    const neededScreens = [];
    if (tab === "workspace") neededScreens.push("workspace");
    if (tab === "hatchery") neededScreens.push("hatchery");
    if (tab === "pens") neededScreens.push("pens");
    if (tab === "flock") neededScreens.push("flock");
    if (tab === "settings") neededScreens.push("settings");
    if (tab === "stats") neededScreens.push("stats");
    if (tab === "finance") neededScreens.push("finance");
    if (recordOverlay?.kind === "bird") neededScreens.push("flock");
    neededScreens.forEach(screenKey => {
      ensureLazyScreenLoaded(screenKey).catch(() => {});
    });
  }, [ensureLazyScreenLoaded, recordOverlay?.kind, tab]);
  useEffect(() => {
    if (tab !== "settings" || settingsSection !== "reports" || photoExportLoaded) return;
    loadPhotoExportRows().then(rows => {
      setPhotoExportRows(rows);
      setPhotoExportLoaded(true);
    }).catch(console.error);
  }, [photoExportLoaded, settingsSection, tab]);
  const ensureBirdPhotos = useCallback(async birdId => {
    if (!birdId) return [];
    if (Object.prototype.hasOwnProperty.call(photoCacheRef.current, birdId)) return photoCacheRef.current[birdId];
    const rows = await loadBirdPhotos(birdId);
    setPhotoCache(p => Object.prototype.hasOwnProperty.call(p, birdId) ? p : {
      ...p,
      [birdId]: rows
    });
    return rows;
  }, []);
  const ensureEggProgressPhotos = useCallback(async eggId => {
    if (!eggId) return [];
    if (Object.prototype.hasOwnProperty.call(eggPhotoCacheRef.current, eggId)) return eggPhotoCacheRef.current[eggId];
    const rows = appSortEggProgressPhotos(await loadEggProgressPhotos(eggId));
    setEggPhotoCache(p => Object.prototype.hasOwnProperty.call(p, eggId) ? p : {
      ...p,
      [eggId]: rows
    });
    return rows;
  }, []);
  const readRetentionSnapshot = useCallback(async () => {
    const rows = await dbAll("birdPhotos");
    return buildRetentionSnapshot({
      birds,
      photos: rows
    });
  }, [birds]);
  const refreshStorageInfo = useCallback(async () => {
    if (!navigator?.storage?.estimate) {
      setStorageInfo({
        loading: false,
        supported: false,
        usage: 0,
        quota: 0,
        error: ""
      });
      return null;
    }
    setStorageInfo(p => ({
      ...p,
      loading: true,
      supported: true,
      error: ""
    }));
    try {
      const est = await navigator.storage.estimate();
      setStorageInfo({
        loading: false,
        supported: true,
        usage: est.usage || 0,
        quota: est.quota || 0,
        error: ""
      });
      return est;
    } catch (err) {
      console.error(err);
      setStorageInfo({
        loading: false,
        supported: true,
        usage: 0,
        quota: 0,
        error: "Could not estimate storage."
      });
      return null;
    }
  }, []);
  const refreshRetentionInfo = useCallback(async () => {
    setRetentionInfo(p => ({
      ...p,
      loading: true,
      error: ""
    }));
    try {
      const snap = await readRetentionSnapshot();
      const eligibleSold = snap.eligible.filter(x => x.bird.status === "sold").length;
      const eligibleDeceased = snap.eligible.filter(x => x.bird.status === "deceased").length;
      const eligibleCulled = snap.eligible.filter(x => x.bird.status === "culled").length;
      setRetentionInfo({
        loading: false,
        archivedPhotos: snap.archivedPhotos,
        archivedPhotosWithImage: snap.archivedPhotosWithImage,
        archivedImageBytes: snap.archivedImageBytes,
        eligibleCount: snap.eligible.length,
        eligibleSold,
        eligibleDeceased,
        eligibleCulled,
        error: ""
      });
      return snap;
    } catch (err) {
      console.error(err);
      setRetentionInfo(p => ({
        ...p,
        loading: false,
        error: "Could not read retention stats."
      }));
      return null;
    }
  }, [readRetentionSnapshot]);
  const loadStoragePanel = useCallback(async () => {
    await Promise.all([refreshStorageInfo(), refreshRetentionInfo()]);
  }, [refreshRetentionInfo, refreshStorageInfo]);
  const applyReplacedStores = useCallback(async () => {
    setPhotoCache({});
    setEggPhotoCache({});
    setPhotoExportRows([]);
    setPhotoExportLoaded(false);
    setDeleteUndo(null);
    setTab("overview");
    await loadStartupData();
    await loadDeferredData().catch(() => {});
    await Promise.all([refreshRetentionInfo(), refreshStorageInfo()]);
  }, [loadDeferredData, loadStartupData, refreshRetentionInfo, refreshStorageInfo]);
  const persistGistConfig = useCallback(patch => {
    const next = saveGistSyncConfig({
      ...gistSyncRef.current,
      ...(patch && typeof patch === "object" ? patch : {})
    });
    gistSyncRef.current = next;
    setGistSyncConfig(next);
    return next;
  }, []);
  if (!loaded) return React.createElement("div", {
    style: {
      ...C.page,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 16,
      minHeight: "100dvh"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 64
    }
  }, "\uD83D\uDC14"), React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      color: "#b45309"
    }
  }, "Loading FlockTrack..."));
  function addBatch(b) {
    setBatches(p => [...p, b]);
    dbPut("eggBatches", b);
  }
  function updBatch(b) {
    setBatches(p => p.map(x => x.id === b.id ? b : x));
    dbPut("eggBatches", b);
  }
  function delBatch(id) {
    setBatches(p => p.filter(b => b.id !== id));
    dbDel("eggBatches", id);
  }
  function addPen(pen) {
    setPens(prev => [...prev, pen]);
    dbPut("pens", pen);
  }
  function updPen(pen) {
    setPens(prev => prev.map(item => item.id === pen.id ? pen : item));
    dbPut("pens", pen);
  }
  function delPen(id) {
    if (!id) return;
    const nowIso = new Date().toISOString();
    const birdsToUnassign = birds.filter(bird => bird.penId === id).map(bird => ({
      ...bird,
      penId: "",
      updatedAt: nowIso
    }));
    const birdUpdateById = new Map(birdsToUnassign.map(bird => [bird.id, bird]));
    const logsToRemove = penFeedLogs.filter(log => log.penId === id);
    setPens(prev => prev.filter(item => item.id !== id));
    if (birdUpdateById.size) {
      setBirds(prev => prev.map(bird => birdUpdateById.get(bird.id) || bird));
      birdsToUnassign.forEach(bird => dbPut("birds", bird));
    }
    if (logsToRemove.length) {
      setPenFeedLogs(prev => prev.filter(log => log.penId !== id));
      logsToRemove.forEach(log => dbDel("penFeedLogs", log.id));
    }
    dbDel("pens", id);
  }
  function addFeedType(feedType) {
    setFeedTypes(prev => [...prev, feedType]);
    dbPut("feedTypes", feedType);
  }
  function updFeedType(feedType) {
    if (!feedType?.id) return;
    setFeedTypes(prev => prev.map(item => item.id === feedType.id ? feedType : item));
    dbPut("feedTypes", feedType);
  }
  function delFeedType(id) {
    if (!id) return;
    const logsToRemove = penFeedLogs.filter(log => log.feedTypeId === id);
    setFeedTypes(prev => prev.filter(item => item.id !== id));
    if (logsToRemove.length) {
      setPenFeedLogs(prev => prev.filter(log => log.feedTypeId !== id));
      logsToRemove.forEach(log => dbDel("penFeedLogs", log.id));
    }
    dbDel("feedTypes", id);
  }
  function addPenFeedLog(log) {
    const hasActiveBirdInPen = birds.some(bird => bird.status === "active" && bird.penId === log?.penId);
    if (!hasActiveBirdInPen) {
      throw new Error("Cannot log feed for a pen with no active birds assigned.");
    }
    setPenFeedLogs(prev => [...prev, log]);
    dbPut("penFeedLogs", log);
  }
  function delPenFeedLog(id) {
    setPenFeedLogs(prev => prev.filter(log => log.id !== id));
    dbDel("penFeedLogs", id);
  }
  function addFinanceEntry(entry) {
    setFinanceEntries(prev => [...prev, entry]);
    dbPut("financeEntries", entry);
  }
  function updFinanceEntry(entry) {
    if (!entry?.id) return;
    setFinanceEntries(prev => prev.map(item => item.id === entry.id ? entry : item));
    dbPut("financeEntries", entry);
  }
  function delFinanceEntry(id) {
    setFinanceEntries(prev => prev.filter(entry => entry.id !== id));
    dbDel("financeEntries", id);
  }
  function addBird(b) {
    setBirds(p => [...p, b]);
    dbPut("birds", b);
  }
  function updBird(b) {
    setBirds(p => p.map(x => x.id === b.id ? b : x));
    dbPut("birds", b);
  }
  async function delBird(id) {
    const current = birds.find(b => b.id === id);
    if (!current) return;
    const nextBirds = birds.filter(b => b.id !== id);
    const removedMeasurements = measurements.filter(m => m.birdId === id);
    const nextMeasurements = measurements.filter(m => m.birdId !== id);
    const removedHealthEvents = healthEvents.filter(h => h.birdId === id);
    const nextHealthEvents = healthEvents.filter(h => h.birdId !== id);
    const removedRules = rules.filter(r => r.birdId === id);
    const nextRules = rules.filter(r => r.birdId !== id);
    const removedInstances = instances.filter(inst => inst.birdId === id);
    const nextInstances = instances.filter(inst => inst.birdId !== id);
    const cachedPhotos = Object.prototype.hasOwnProperty.call(photoCacheRef.current, id) ? photoCacheRef.current[id] || [] : await dbByIndex("birdPhotos", "birdId", id);
    const removedPhotoExportRows = photoExportRows.filter(ph => ph.birdId === id);
    const nextPhotoExportRows = photoExportRows.filter(ph => ph.birdId !== id);
    const undoPayload = {
      bird: current,
      measurements: removedMeasurements,
      healthEvents: removedHealthEvents,
      rules: removedRules,
      instances: removedInstances,
      photos: cachedPhotos,
      photoExportRows: removedPhotoExportRows.length ? removedPhotoExportRows : cachedPhotos.map(ph => ({
        id: ph.id,
        birdId: ph.birdId,
        takenAt: ph.takenAt,
        sizeKb: ph.sizeKb,
        hasImage: ph.hasImage != null ? !!ph.hasImage : !!ph.dataUrl
      }))
    };
    if (deleteUndoTimer.current) clearTimeout(deleteUndoTimer.current);
    setBirds(nextBirds);
    setMeasurements(nextMeasurements);
    setHealthEvents(nextHealthEvents);
    setRules(nextRules);
    setInstances(nextInstances);
    setPhotoCache(p => {
      if (!Object.prototype.hasOwnProperty.call(p, id)) return p;
      const nx = {
        ...p
      };
      delete nx[id];
      return nx;
    });
    setPhotoExportRows(nextPhotoExportRows);
    try {
      await Promise.all([dbReplace("birds", nextBirds), dbReplace("measurements", nextMeasurements), dbReplace("healthEvents", nextHealthEvents), dbReplace("reminderRules", nextRules), dbReplace("reminderInstances", nextInstances), dbDelByIndex("birdPhotos", "birdId", id)]);
      setDeleteUndo(undoPayload);
      deleteUndoTimer.current = setTimeout(() => {
        setDeleteUndo(p => p && p.bird.id === id ? null : p);
      }, 5000);
    } catch (err) {
      setBirds(birds);
      setMeasurements(measurements);
      setHealthEvents(healthEvents);
      setRules(rules);
      setInstances(instances);
      setPhotoExportRows(photoExportRows);
      setPhotoCache(p => ({
        ...p,
        [id]: cachedPhotos
      }));
      setDeleteUndo(null);
      throw err;
    }
  }
  async function undoDeleteBird() {
    if (!deleteUndo) return;
    const payload = deleteUndo;
    if (deleteUndoTimer.current) clearTimeout(deleteUndoTimer.current);
    setDeleteUndo(null);
    const nextBirds = mergeUniqueById(birds, [payload.bird], (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const nextMeasurements = appNormalizeMeasurements(mergeUniqueById(measurements, payload.measurements)).rows;
    const nextHealthEvents = mergeUniqueById(healthEvents, payload.healthEvents);
    const nextRules = mergeUniqueById(rules, payload.rules);
    const nextInstances = mergeUniqueById(instances, payload.instances);
    const nextPhotoExportRows = mergeUniqueById(photoExportRows, payload.photoExportRows, (a, b) => new Date(a.takenAt || 0) - new Date(b.takenAt || 0));
    setBirds(nextBirds);
    setMeasurements(nextMeasurements);
    setHealthEvents(nextHealthEvents);
    setRules(nextRules);
    setInstances(nextInstances);
    setPhotoCache(p => ({
      ...p,
      [payload.bird.id]: [...payload.photos].sort((a, b) => new Date(a.takenAt || 0) - new Date(b.takenAt || 0))
    }));
    setPhotoExportRows(nextPhotoExportRows);
    try {
      await Promise.all([dbPut("birds", payload.bird), dbReplace("measurements", nextMeasurements), ...payload.healthEvents.map(h => dbPut("healthEvents", h)), ...payload.rules.map(r => dbPut("reminderRules", r)), ...payload.instances.map(inst => dbPut("reminderInstances", inst)), ...payload.photos.map(ph => dbPut("birdPhotos", ph))]);
    } catch (err) {
      console.error(err);
      window.alert("Could not restore the deleted bird. Please try again.");
    }
  }
  function addM(m) {
    if (!m || typeof m !== "object") return;
    const metricType = String(m.metricType || "").trim().toLowerCase();
    const nowIso = new Date().toISOString();
    if (metricType === "weight") {
      if (!m.birdId) return;
      const day = appMeasurementDayKey(m.measuredAt || nowIso) || appMeasurementDayKey(nowIso);
      const existing = measurements.filter(row => row?.metricType === "weight" && row?.birdId === m.birdId && appMeasurementDayKey(row?.measuredAt) === day).sort((a, b) => appMeasurementRowScore(b) - appMeasurementRowScore(a))[0] || null;
      const nextWeight = {
        ...(existing || {}),
        ...m,
        id: existing?.id || m.id || uid(),
        metricType: "weight",
        measuredAt: day,
        createdAt: existing?.createdAt || m.createdAt || nowIso,
        modifiedAt: nowIso
      };
      const withoutSameDay = measurements.filter(row => !(row?.metricType === "weight" && row?.birdId === m.birdId && appMeasurementDayKey(row?.measuredAt) === day));
      const normalized = appNormalizeMeasurements([...withoutSameDay, nextWeight]).rows;
      setMeasurements(normalized);
      dbReplace("measurements", normalized);
      return;
    }
    const nextMeasurement = {
      ...m,
      createdAt: m.createdAt || nowIso,
      modifiedAt: nowIso
    };
    setMeasurements(p => [...p, nextMeasurement]);
    dbPut("measurements", nextMeasurement);
  }
  function addH(h) {
    setHealthEvents(p => [...p, h]);
    dbPut("healthEvents", h);
  }
  function addRule(r) {
    setRules(p => [...p, r]);
    dbPut("reminderRules", r);
  }
  function delRule(id) {
    setRules(p => p.filter(r => r.id !== id));
    dbDel("reminderRules", id);
  }
  function saveEgg(es) {
    setEggStates(p => {
      const ex = p.find(x => x.id === es.id);
      return ex ? p.map(x => x.id === es.id ? es : x) : [...p, es];
    });
    dbPut("eggStates", es);
  }
  async function addEggProgressPhoto(photo) {
    if (!photo?.eggId) return;
    setEggPhotoCache(p => ({
      ...p,
      [photo.eggId]: appSortEggProgressPhotos([...(p[photo.eggId] || []), photo])
    }));
    try {
      await dbPut("eggProgressPhotos", photo);
    } catch (err) {
      setEggPhotoCache(p => ({
        ...p,
        [photo.eggId]: (p[photo.eggId] || []).filter(item => item.id !== photo.id)
      }));
      throw err;
    }
  }
  async function updateEggProgressPhoto(photo) {
    if (!photo?.eggId || !photo?.id) return;
    const previous = eggPhotoCacheRef.current[photo.eggId] || [];
    const existed = previous.find(item => item.id === photo.id) || null;
    setEggPhotoCache(p => ({
      ...p,
      [photo.eggId]: appSortEggProgressPhotos((p[photo.eggId] || []).some(item => item.id === photo.id) ? (p[photo.eggId] || []).map(item => item.id === photo.id ? photo : item) : [...(p[photo.eggId] || []), photo])
    }));
    try {
      await dbPut("eggProgressPhotos", photo);
    } catch (err) {
      setEggPhotoCache(p => ({
        ...p,
        [photo.eggId]: existed ? appSortEggProgressPhotos((p[photo.eggId] || []).map(item => item.id === photo.id ? existed : item)) : appSortEggProgressPhotos(previous)
      }));
      throw err;
    }
  }
  async function delEggProgressPhoto(eggId, id) {
    if (!eggId || !id) return;
    const removed = (eggPhotoCacheRef.current[eggId] || []).find(photo => photo.id === id) || null;
    setEggPhotoCache(p => ({
      ...p,
      [eggId]: (p[eggId] || []).filter(photo => photo.id !== id)
    }));
    try {
      await dbDel("eggProgressPhotos", id);
    } catch (err) {
      if (removed) {
        setEggPhotoCache(p => ({
          ...p,
          [eggId]: appSortEggProgressPhotos([...(p[eggId] || []), removed])
        }));
      }
      throw err;
    }
  }
  async function addPhoto(ph) {
    const hadCache = Object.prototype.hasOwnProperty.call(photoCacheRef.current, ph.birdId);
    if (hadCache) {
      setPhotoCache(p => ({
        ...p,
        [ph.birdId]: [...(p[ph.birdId] || []), ph].sort((a, b) => new Date(a.takenAt || 0) - new Date(b.takenAt || 0))
      }));
    }
    setPhotoExportRows(p => [...p, {
      id: ph.id,
      birdId: ph.birdId,
      takenAt: ph.takenAt,
      sizeKb: ph.sizeKb,
      hasImage: !!ph.dataUrl
    }]);
    try {
      await dbPut("birdPhotos", ph);
    } catch (err) {
      if (hadCache) {
        setPhotoCache(p => ({
          ...p,
          [ph.birdId]: (p[ph.birdId] || []).filter(x => x.id !== ph.id)
        }));
      }
      setPhotoExportRows(p => p.filter(x => x.id !== ph.id));
      throw err;
    }
  }
  async function delPhoto(birdId, id) {
    const hadCache = Object.prototype.hasOwnProperty.call(photoCacheRef.current, birdId);
    const removed = hadCache ? (photoCacheRef.current[birdId] || []).find(ph => ph.id === id) || null : null;
    if (hadCache) {
      setPhotoCache(p => ({
        ...p,
        [birdId]: (p[birdId] || []).filter(ph => ph.id !== id)
      }));
    }
    try {
      await dbDel("birdPhotos", id);
      setPhotoExportRows(p => p.filter(ph => ph.id !== id));
    } catch (err) {
      if (hadCache && removed) {
        setPhotoCache(p => ({
          ...p,
          [birdId]: [...(p[birdId] || []), removed].sort((a, b) => new Date(a.takenAt || 0) - new Date(b.takenAt || 0))
        }));
      }
      throw err;
    }
  }
  async function archiveBird(id) {
    const current = birds.find(b => b.id === id);
    if (!current || current.archivedAt) return;
    const updated = {
      ...current,
      archivedAt: new Date().toISOString()
    };
    setBirds(p => p.map(b => b.id === id ? updated : b));
    try {
      await dbPut("birds", updated);
    } catch (err) {
      setBirds(p => p.map(b => b.id === id ? current : b));
      throw err;
    }
  }
  async function exportRetentionSet(includeZip) {
    const snap = await readRetentionSnapshot();
    const due = snap.eligible || [];
    if (!due.length) return 0;
    const csvRows = due.map(x => ({
      id: x.photo.id,
      birdId: x.photo.birdId,
      tagId: x.bird.tagId || "",
      status: x.bird.status,
      archivedAt: x.bird.archivedAt || "",
      takenAt: x.photo.takenAt || "",
      originalSizeKb: x.photo.sizeKb || 0,
      retentionDays: x.retentionDays,
      ageDays: x.ageDays,
      purgeAfter: x.purgeAfter
    }));
    csvDown(csvRows, `retention-due-${today()}.csv`);
    if (includeZip) {
      const files = [];
      due.forEach((x, i) => {
        const parsed = dataUrlToBytes(x.photo.dataUrl);
        if (!parsed) return;
        const tag = safeFilePart(x.bird.tagId || x.photo.birdId || "bird");
        const stamp = safeFilePart((x.photo.takenAt || "").replace(/[:.]/g, "-") || `photo_${i + 1}`);
        files.push({
          name: `${String(i + 1).padStart(3, "0")}_${tag}_${stamp}.${extFromMime(parsed.mime)}`,
          bytes: parsed.bytes,
          date: new Date(x.photo.takenAt || Date.now())
        });
      });
      if (files.length) blobDown(zipBlob(files), `retention-due-photos-${today()}.zip`);
    }
    return due.length;
  }
  async function cleanupRetentionNow() {
    const snap = await readRetentionSnapshot();
    const due = snap.eligible || [];
    if (!due.length) return 0;
    const nowIso = new Date().toISOString();
    const updates = due.map(x => ({
      ...x.photo,
      hasImage: false,
      dataUrl: "",
      purgedAt: nowIso,
      purgedReason: `retention_${x.bird.status}`,
      originalSizeKb: x.photo.originalSizeKb != null ? x.photo.originalSizeKb : x.photo.sizeKb || 0,
      sizeKb: 0
    }));
    for (const up of updates) await dbPut("birdPhotos", up);
    const byId = new Map(updates.map(x => [x.id, x]));
    setPhotoCache(prev => {
      let touched = false;
      const nx = {};
      Object.entries(prev).forEach(([birdId, arr]) => {
        let localTouched = false;
        const mapped = arr.map(ph => {
          const up = byId.get(ph.id);
          if (!up) return ph;
          localTouched = true;
          return up;
        });
        if (localTouched) touched = true;
        nx[birdId] = localTouched ? mapped : arr;
      });
      return touched ? nx : prev;
    });
    setPhotoExportRows(prev => prev.map(ph => {
      const up = byId.get(ph.id);
      return up ? {
        ...ph,
        hasImage: false,
        sizeKb: 0
      } : ph;
    }));
    await Promise.all([refreshRetentionInfo(), refreshStorageInfo()]);
    return updates.length;
  }
  async function backupJson() {
    const {
      stores,
      total
    } = await exportAllStores();
    const payload = {
      format: "flocktrack-backup-v1",
      createdAt: new Date().toISOString(),
      dbName: DB_NAME,
      dbVersion: DB_VER,
      stores
    };
    blobDown(new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    }), `flocktrack-backup-${today()}.json`);
    return {
      total
    };
  }
  async function previewBackupFromText(rawText) {
    const {
      total,
      storeCounts
    } = parseBackupPayloadFromText(rawText);
    return {
      total,
      storeCounts
    };
  }
  async function importBackupFromText(rawText, options = {}) {
    const mode = options?.mode === "merge" ? "merge" : "replace";
    const {
      normalized,
      total: importedTotal,
      storeCounts
    } = parseBackupPayloadFromText(rawText);
    if (mode === "merge") {
      const localExport = await exportAllStores();
      const mergeSummary = mergeStoreSets(localExport.stores, normalized, "local");
      await replaceStores(mergeSummary.stores);
      await applyReplacedStores();
      return {
        mode,
        total: mergeSummary.total,
        importedTotal,
        importedByStore: storeCounts,
        conflicts: mergeSummary.conflicts,
        conflictsByStore: mergeSummary.conflictsByStore,
        addedFromImport: mergeSummary.addedFromRemote,
        keptLocal: mergeSummary.keptLocal,
        keptImported: mergeSummary.keptRemote
      };
    }
    await replaceStores(normalized);
    await applyReplacedStores();
    return {
      mode,
      total: importedTotal,
      importedTotal,
      importedByStore: storeCounts,
      conflicts: 0,
      conflictsByStore: {},
      addedFromImport: importedTotal,
      keptLocal: 0,
      keptImported: 0
    };
  }
  async function readRemoteGistSnapshot(config, options = {}) {
    const cfg = sanitizeGistSyncConfig(config);
    if (!cfg.gistId) throw new Error("Gist ID is required.");
    const gist = await githubJson(`https://api.github.com/gists/${cfg.gistId}`, {
      method: "GET",
      token: cfg.token
    });
    const file = resolveGistFile(gist, cfg.fileName);
    if (!file) {
      if (options.allowMissingFile) {
        return {
          gist,
          fileName: cfg.fileName,
          normalized: null,
          total: 0,
          parsed: null
        };
      }
      throw new Error(`Could not find gist file "${cfg.fileName}".`);
    }
    let content = typeof file.content === "string" && !file.truncated ? file.content : "";
    if (!content) {
      if (!file.raw_url) throw new Error(`Could not read gist file "${file.filename || cfg.fileName}".`);
      content = await githubText(file.raw_url, cfg.token);
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Gist file "${file.filename || cfg.fileName}" is not valid JSON.`);
    }
    const {
      normalized,
      total
    } = normalizeBackupPayload(parsed, STORES);
    return {
      gist,
      fileName: file.filename || cfg.fileName,
      normalized,
      total,
      parsed
    };
  }
  async function pushToGist(configPatch) {
    const cfg = persistGistConfig(configPatch || {});
    if (cfg.syncEnabled === false) throw new Error("Gist sync is turned off on this device.");
    if (!cfg.token) throw new Error("GitHub token is required.");
    if (!cfg.fileName) throw new Error("Gist file name is required.");
    const deviceId = ensureGistDeviceId();
    const localExport = await exportAllStores();
    let storesToPush = localExport.stores;
    let mergeSummary = {
      conflicts: 0,
      conflictsByStore: {},
      keptLocal: 0,
      keptRemote: 0,
      addedFromLocal: 0,
      addedFromRemote: 0,
      total: localExport.total
    };
    let remoteInfo = null;
    if (cfg.gistId) {
      remoteInfo = await readRemoteGistSnapshot(cfg, {
        allowMissingFile: true
      });
      if (remoteInfo.normalized) {
        mergeSummary = mergeStoreSets(localExport.stores, remoteInfo.normalized, "local");
        storesToPush = mergeSummary.stores;
        if (mergeSummary.addedFromRemote > 0 || mergeSummary.keptRemote > 0) {
          await replaceStores(storesToPush);
          await applyReplacedStores();
        }
      }
    }
    const totalToPush = STORES.reduce((sum, store) => sum + (storesToPush[store] || []).length, 0);
    const payload = buildGistPayload({
      stores: storesToPush,
      total: totalToPush,
      sourceDeviceId: deviceId,
      mergeMeta: remoteInfo?.gist?.updated_at ? {
        sourceRemoteUpdatedAt: remoteInfo.gist.updated_at,
        conflicts: mergeSummary.conflicts
      } : null
    });
    const body = {
      description: "FlockTrack sync backup",
      public: false,
      files: {
        [cfg.fileName]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    };
    const gist = await githubJson(cfg.gistId ? `https://api.github.com/gists/${cfg.gistId}` : "https://api.github.com/gists", {
      method: cfg.gistId ? "PATCH" : "POST",
      token: cfg.token,
      body
    });
    const saved = persistGistConfig({
      gistId: gist.id || cfg.gistId,
      fileName: cfg.fileName,
      lastRemoteUpdatedAt: gist.updated_at || "",
      lastSyncAt: new Date().toISOString(),
      lastSyncDirection: "push"
    });
    return {
      gistId: saved.gistId,
      fileName: saved.fileName,
      total: payload.total,
      mergedWithRemote: !!remoteInfo?.normalized,
      conflicts: mergeSummary.conflicts,
      conflictsByStore: mergeSummary.conflictsByStore,
      addedFromRemote: mergeSummary.addedFromRemote,
      keptRemote: mergeSummary.keptRemote
    };
  }
  async function pullFromGist(configPatch) {
    const cfg = persistGistConfig(configPatch || {});
    if (cfg.syncEnabled === false) throw new Error("Gist sync is turned off on this device.");
    if (!cfg.token) throw new Error("GitHub token is required.");
    if (!cfg.gistId) throw new Error("Gist ID is required.");
    const remoteInfo = await readRemoteGistSnapshot(cfg);
    const localExport = await exportAllStores();
    const mergeSummary = mergeStoreSets(localExport.stores, remoteInfo.normalized, "remote");
    await replaceStores(mergeSummary.stores);
    await applyReplacedStores();
    const saved = persistGistConfig({
      fileName: remoteInfo.fileName || cfg.fileName,
      lastRemoteUpdatedAt: remoteInfo.gist.updated_at || "",
      lastSyncAt: new Date().toISOString(),
      lastSyncDirection: "pull"
    });
    return {
      gistId: saved.gistId,
      fileName: saved.fileName,
      total: mergeSummary.total,
      conflicts: mergeSummary.conflicts,
      conflictsByStore: mergeSummary.conflictsByStore,
      addedFromRemote: mergeSummary.addedFromRemote,
      keptRemote: mergeSummary.keptRemote,
      addedFromLocal: mergeSummary.addedFromLocal,
      keptLocal: mergeSummary.keptLocal
    };
  }
  async function restoreFromBackup(file) {
    if (!file) throw new Error("No backup file selected.");
    const txt = await file.text();
    const info = await importBackupFromText(txt, {
      mode: "replace"
    });
    return {
      total: info.total
    };
  }
  async function resetAppData() {
    await clearAllStores();
    await applyReplacedStores();
  }
  function handleInst(inst, markDone) {
    if (markDone) {
      const rule = rules.find(r => r.id === inst.ruleId);
      const {
        completed,
        next
      } = completeReminderAndScheduleNext(inst, rule, {
        makeId: uid
      });
      setInstances(p => {
        const updated = p.map(r => r.id === inst.id ? completed : r);
        return next ? [...updated, next] : updated;
      });
      const writes = [dbPut("reminderInstances", completed)];
      if (next) writes.push(dbPut("reminderInstances", next));
      Promise.all(writes).catch(console.error);
    } else {
      setInstances(p => [...p, inst]);
      dbPut("reminderInstances", inst);
    }
  }
  function openSettingsTab(section = "general", generalTab = "archivable") {
    setSettingsSection(section);
    if (section === "general") setSettingsGeneralTab(generalTab || "archivable");
    setTab("settings");
  }
  function openTabFromSearch(nextTab) {
    if (nextTab === "tasks") {
      openSettingsTab("tasks");
      return;
    }
    if (nextTab === "reports") {
      openSettingsTab("reports");
      return;
    }
    if (nextTab === "settings_archivable") {
      openSettingsTab("general", "archivable");
      return;
    }
    setTab(nextTab);
  }
  function openDashboardSection(section) {
    if (section === "birds") {
      window.__flockTrackOpenBirdId = null;
      window.__flockTrackOpenBirdPenId = null;
      setTab("flock");
      return;
    }
    if (section === "pens") {
      setTab("pens");
      return;
    }
    if (section === "batches") {
      setTab("hatchery");
      return;
    }
    if (section === "workspace") {
      setTab("workspace");
      return;
    }
    if (section === "tasks") {
      openSettingsTab("tasks");
      return;
    }
    if (section === "reminders_overdue" || section === "reminders_due_today") {
      openSettingsTab("tasks");
      return;
    }
    if (section === "reports") {
      openSettingsTab("reports");
      return;
    }
    if (section === "settings_archivable") {
      openSettingsTab("general", "archivable");
      return;
    }
  }
  function openBirdRecord(birdId, options) {
    if (!birdId) return;
    setRecordOverlay({
      kind: "bird",
      birdId,
      penId: options?.penId || null
    });
  }
  function openWorkspaceLaunch(kind = "", options = {}) {
    setPendingWorkspaceLaunch({
      id: uid(),
      kind: kind || "",
      batchId: options?.batchId || ""
    });
    setTab("workspace");
  }
  function openBatchRecord(batchId) {
    if (!batchId) return;
    setPendingBatchOpenId(batchId);
    setTab("hatchery");
  }
  function openPenRecord(penId) {
    if (!penId) return;
    setPendingPenOpenId(penId);
    setTab("pens");
  }
  function closeRecordOverlay() {
    setRecordOverlay(null);
  }
  function updateTabVisibility(tabId, isVisible) {
    if (!HIDEABLE_TAB_IDS.has(tabId)) return;
    setTabVisibility(prev => {
      const next = {
        ...prev,
        [tabId]: !!isVisible
      };
      safeStorageSet(TAB_VISIBILITY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  function openCalendarModal() {
    const now = new Date();
    setCalendarMonth(calendarMonthStart(now));
    setCalendarSelectedDay(today());
    setShowCalendarModal(true);
  }
  function closeCalendarModal() {
    setShowCalendarModal(false);
  }
  function goCalendarMonth(delta) {
    setCalendarMonth(prev => calendarShiftMonth(prev, delta));
  }
  function jumpCalendarToday() {
    const now = new Date();
    setCalendarMonth(calendarMonthStart(now));
    setCalendarSelectedDay(today());
  }
  function selectCalendarDay(cell) {
    if (!cell?.dayKey) return;
    setCalendarSelectedDay(cell.dayKey);
    if (!cell.inMonth) setCalendarMonth(calendarMonthStart(cell.date));
  }
  function openCalendarEvent(eventItem) {
    if (!eventItem) return;
    if (eventItem.target === "hatchery") {
      if (eventItem.batchId) openBatchRecord(eventItem.batchId);else setTab("hatchery");
    } else {
      openSettingsTab("tasks");
    }
    closeCalendarModal();
  }
  function renderDeferredDataView(title, pendingMessage) {
    return appStatusView(title, deferredDataError || pendingMessage, deferredDataError);
  }
  const navButtons = visibleNavTabs.map(t => React.createElement("button", {
    key: t.id,
    type: "button",
    style: isDesktopShell ? {
      width: "100%",
      border: "1px solid",
      borderColor: tab === t.id ? "#fdba74" : "transparent",
      background: tab === t.id ? "#fff7ed" : "transparent",
      color: tab === t.id ? "#9a3412" : "#334155",
      borderRadius: 16,
      padding: "12px 14px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 12,
      boxShadow: tab === t.id ? "0 12px 24px -20px #b4530980" : "none",
      fontSize: 14,
      fontWeight: tab === t.id ? 800 : 700,
      textAlign: "left"
    } : {
      ...C.navB(tab === t.id),
      padding: isPhoneShell ? "8px 2px 7px" : C.navB(tab === t.id).padding,
      fontSize: isPhoneShell ? 9 : C.navB(tab === t.id).fontSize
    },
    onClick: () => setTab(t.id)
  }, React.createElement("span", {
    style: {
      fontSize: isDesktopShell ? 18 : isPhoneShell ? 18 : 20,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: isDesktopShell ? 24 : isPhoneShell ? 24 : 28,
      height: 24,
      overflow: "hidden",
      flexShrink: 0
    }
  }, t.iconSrc ? React.createElement("img", {
    src: t.iconSrc,
    alt: "",
    style: {
      width: isDesktopShell ? 24 : isPhoneShell ? 24 : 28,
      height: 24,
      objectFit: "cover",
      imageRendering: "pixelated",
      transform: `scale(${t.iconScale || 1})`,
      transformOrigin: "center center"
    }
  }) : t.ic), React.createElement("span", {
    style: isDesktopShell ? {
      fontSize: 14,
      lineHeight: 1.2
    } : null
  }, t.lbl)));
  function renderLazyScreenView(screenKey, props, options = {}) {
    const cfg = LAZY_SCREEN_DEFS[screenKey];
    const ScreenComponent = lazyScreenComponent(screenKey);
    if (typeof ScreenComponent !== "function") {
      const chunkError = lazyScreenErrors[screenKey] || "";
      const pendingMessage = lazyScreenStatus[screenKey] === "loading" ? `Loading ${cfg.title.toLowerCase()}...` : `Preparing ${cfg.title.toLowerCase()}...`;
      return appStatusView(cfg.title, chunkError || pendingMessage, chunkError);
    }
    if (options.requireDeferredData && !deferredLoaded) {
      return renderDeferredDataView(cfg.title, deferredLoading ? "Loading the rest of the flock records..." : `Preparing ${cfg.title.toLowerCase()} data...`);
    }
    return React.createElement(ScreenComponent, props);
  }
  const headerDateLabel = fmtDate(new Date());
  return React.createElement("div", {
    style: shellStyles.page
  }, isDesktopShell && React.createElement("aside", {
    style: shellStyles.sidebar
  }, React.createElement("div", {
    style: shellStyles.sidebarBrand
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 16,
      background: "linear-gradient(135deg, #b45309, #f59e0b)",
      color: "#ffffff",
      fontSize: 28,
      display: "grid",
      placeItems: "center",
      boxShadow: "0 14px 28px -18px #b4530988"
    }
  }, "🐓"), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 900,
      color: "#7c2d12",
      letterSpacing: "-0.04em"
    }
  }, "FlockTrack"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#78716c"
    }
  }, "Desktop workspace"))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 10,
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      borderRadius: 16,
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      padding: "12px 12px 10px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#94a3b8"
    }
  }, "Active birds"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, fmtNum(activeBirdCount))), React.createElement("div", {
    style: {
      borderRadius: 16,
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      padding: "12px 12px 10px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#94a3b8"
    }
  }, "Pending eggs"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, fmtNum(pendingEggCount))))), React.createElement("nav", {
    style: shellStyles.sidebarNav
  }, navButtons), React.createElement("div", {
    style: shellStyles.sidebarNote
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#94a3b8"
    }
  }, "Today"), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 18,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, headerDateLabel), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.45
    }
  }, "Desktop-first shell on wide screens, with mobile navigation preserved below tablet widths."))), React.createElement("div", {
    style: shellStyles.bar
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: isPhoneShell ? 10 : 12,
      minWidth: 0,
      flex: isPhoneShell ? "1 1 auto" : 1
    }
  }, React.createElement("span", {
    style: {
      fontSize: isPhoneShell ? 22 : 26
    }
  }, "\uD83D\uDC14"), React.createElement("span", {
    style: {
      fontSize: isPhoneShell ? 19 : 22,
      fontWeight: 800,
      color: "#b45309",
      letterSpacing: "-0.5px",
      minWidth: 0
    }
  }, "FlockTrack")), React.createElement("div", {
    style: isPhoneShell ? {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 14,
      border: "1px solid #d9e3ef",
      background: "#f8fafc"
    } : {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 4
    }
  }, React.createElement("button", {
    type: "button",
    onClick: openCalendarModal,
    style: {
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      color: "#1d4ed8",
      borderRadius: 999,
      padding: isPhoneShell ? "4px 10px" : "2px 10px",
      fontSize: isPhoneShell ? 11 : 12,
      fontWeight: 800,
      cursor: "pointer",
      lineHeight: 1.4
    }
  }, headerDateLabel), React.createElement("span", {
    style: {
      fontSize: isPhoneShell ? 12 : 13,
      color: "#475569"
    }
  }, activeBirdCount, " \uD83D\uDC14 \xB7 ", pendingEggCount, " \uD83E\uDD5A"))), tab === "overview" && React.createElement(Dashboard, {
    birds: birdsLive,
    batches: batches,
    measurements: measurements,
    reminders: allReminders,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    onOpenSection: openDashboardSection,
    onOpenBird: openBirdRecord,
    onOpenBatch: openBatchRecord,
    onOpenPen: openPenRecord,
    onUpdateBird: updBird,
    onUpdateBatch: updBatch,
    onUpdatePen: updPen,
    onAddMeasurement: addM,
    onAddPenFeedLog: addPenFeedLog,
    onPushToGist: pushToGist,
    photoCache: photoCache,
    ensureBirdPhotos: ensureBirdPhotos,
    isPhoneUi: isPhoneShell
  }), tab === "workspace" && renderLazyScreenView("workspace", {
    batches: batches,
    eggStates: eggStates,
    eggPhotoCache: eggPhotoCache,
    ensureEggPhotos: ensureEggProgressPhotos,
    onAddEggPhoto: addEggProgressPhoto,
    onUpdateEggPhoto: updateEggProgressPhoto,
    launchRequest: pendingWorkspaceLaunch,
    onLaunchHandled: () => setPendingWorkspaceLaunch(null),
    onOpenBatch: openBatchRecord
  }), tab === "hatchery" && renderLazyScreenView("hatchery", {
    batches: batches,
    eggStates: eggStates,
    eggPhotoCache: eggPhotoCache,
    birds: birds,
    onAdd: addBatch,
    onUpdate: updBatch,
    onHatch: addBird,
    onUpdateBird: updBird,
    onDelete: delBatch,
    onSaveEgg: saveEgg,
    ensureEggPhotos: ensureEggProgressPhotos,
    onAddEggPhoto: addEggProgressPhoto,
    onUpdateEggPhoto: updateEggProgressPhoto,
    onDeleteEggPhoto: delEggProgressPhoto,
    onOpenCandlingWorkspace: batchId => openWorkspaceLaunch("candling_capture", {
      batchId
    }),
    openBatchId: pendingBatchOpenId,
    onOpenBatchHandled: () => setPendingBatchOpenId("")
  }), tab === "pens" && renderLazyScreenView("pens", {
    pens: pens,
    batches: batches,
    birds: birds,
    measurements: measurements,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    onAddPen: addPen,
    onDeletePen: delPen,
    onAddFeedType: addFeedType,
    onUpdateFeedType: updFeedType,
    onDeleteFeedType: delFeedType,
    onAddPenFeedLog: addPenFeedLog,
    onDeletePenFeedLog: delPenFeedLog,
    onUpdatePen: updPen,
    onUpdateBird: updBird,
    onOpenBird: openBirdRecord,
    openPenId: pendingPenOpenId,
    onOpenPenHandled: () => setPendingPenOpenId(""),
    photoCache: photoCache,
    ensureBirdPhotos: ensureBirdPhotos
  }), tab === "flock" && (typeof lazyScreenComponent("flock") === "function" && deferredLoaded ? React.createElement(ScreenErrorBoundary, {
    resetKey: `${tab}:${birdsLive.length}`,
    renderFallback: error => React.createElement("div", {
      style: C.body
    }, React.createElement("div", {
      style: {
        ...C.card,
        borderColor: "#fecaca",
        background: "#fff5f5"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: "#b91c1c"
      }
    }, "Flock Screen Error"), React.createElement("div", {
      style: {
        marginTop: 8,
        fontSize: 14,
        color: "#475569",
        lineHeight: 1.45
      }
    }, error?.message || "The flock screen could not be rendered."), React.createElement("div", {
      style: {
        marginTop: 8,
        fontSize: 13,
        color: "#64748b"
      }
    }, "If this appears on your phone, tell me the exact message shown here.")))
  }, renderLazyScreenView("flock", {
    birds: birdsLive,
    batches: batches,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    measurements: measurements,
    healthEvents: healthEvents,
    eggStates: eggStates,
    reminders: allReminders,
    photoCache: photoCache,
    ensureBirdPhotos: ensureBirdPhotos,
    onAdd: addBird,
    onUpdate: updBird,
    onDelete: delBird,
    onAddM: addM,
    onAddH: addH,
    onAddPhoto: addPhoto,
    onDelPhoto: delPhoto
  }, {
    requireDeferredData: true
  })) : renderLazyScreenView("flock", {
    birds: birdsLive,
    batches: batches,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    measurements: measurements,
    healthEvents: healthEvents,
    eggStates: eggStates,
    reminders: allReminders,
    photoCache: photoCache,
    ensureBirdPhotos: ensureBirdPhotos,
    onAdd: addBird,
    onUpdate: updBird,
    onDelete: delBird,
    onAddM: addM,
    onAddH: addH,
    onAddPhoto: addPhoto,
    onDelPhoto: delPhoto
  }, {
    requireDeferredData: true
  })), tab === "search" && (!deferredLoaded ? renderDeferredDataView("Search", deferredLoading ? "Loading the rest of the flock records..." : "Preparing search across all records...") : React.createElement(SearchTab, {
    birds: birds,
    batches: batches,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    financeEntries: financeEntries,
    measurements: measurements,
    healthEvents: healthEvents,
    reminders: allReminders,
    onOpenBird: openBirdRecord,
    onOpenTab: openTabFromSearch
  })), tab === "stats" && (typeof lazyScreenComponent("stats") === "function" && deferredLoaded ? React.createElement(ScreenErrorBoundary, {
    resetKey: `${tab}:${birds.length}:${penFeedLogs.length}:${measurements.length}`,
    renderFallback: error => React.createElement("div", {
      style: C.body
    }, React.createElement("div", {
      style: {
        ...C.card,
        borderColor: "#fecaca",
        background: "#fff5f5"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: "#b91c1c"
      }
    }, "Stats Screen Error"), React.createElement("div", {
      style: {
        marginTop: 8,
        fontSize: 14,
        color: "#475569",
        lineHeight: 1.45
      }
    }, error?.message || "The stats screen could not be rendered.")))
  }, renderLazyScreenView("stats", {
    birds: birds,
    batches: batches,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    measurements: measurements,
    healthEvents: healthEvents,
    reminders: allReminders,
    eggStates: eggStates
  }, {
    requireDeferredData: true
  })) : renderLazyScreenView("stats", {
    birds: birds,
    batches: batches,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    measurements: measurements,
    healthEvents: healthEvents,
    reminders: allReminders,
    eggStates: eggStates
  }, {
    requireDeferredData: true
  })), tab === "finance" && renderLazyScreenView("finance", {
    birds: birds,
    feedTypes: feedTypes,
    financeEntries: financeEntries,
    onAddFinanceEntry: addFinanceEntry,
    onUpdateFinanceEntry: updFinanceEntry,
    onDeleteFinanceEntry: delFinanceEntry
  }), tab === "settings" && renderLazyScreenView("settings", {
    section: settingsSection,
    generalTab: settingsGeneralTab,
    onSectionChange: setSettingsSection,
    onGeneralTabChange: setSettingsGeneralTab,
    birds: birds,
    batches: batches,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    financeEntries: financeEntries,
    measurements: measurements,
    healthEvents: healthEvents,
    reminders: allReminders,
    eggStates: eggStates,
    photos: photoExportRows,
    rules: rules,
    onArchiveBird: archiveBird,
    onAddRule: addRule,
    onComplete: handleInst,
    onDeleteRule: delRule,
    onOpenBatch: openBatchRecord,
    storageInfo: storageInfo,
    retentionInfo: retentionInfo,
    onLoadStorage: loadStoragePanel,
    onExportRetention: exportRetentionSet,
    onCleanupRetention: cleanupRetentionNow,
    onBackupJson: backupJson,
    onRestoreBackup: restoreFromBackup,
    onPreviewPasteImport: previewBackupFromText,
    onImportPastedJson: importBackupFromText,
    onResetAppData: resetAppData,
    gistSyncConfig: gistSyncConfig,
    onSaveGistSyncConfig: persistGistConfig,
    onPushToGist: pushToGist,
    onPullFromGist: pullFromGist,
    hideableTabs: hideableTabs,
    tabVisibility: tabVisibility,
    onUpdateTabVisibility: updateTabVisibility
  }, {
    requireDeferredData: settingsSection !== "general"
  }), recordOverlay?.kind === "bird" && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 170,
      background: "#0f172ad6",
      display: "flex",
      flexDirection: "column"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      background: "#f8fafc"
    }
  }, renderLazyScreenView("flock", {
    birds: birdsLive,
    batches: batches,
    pens: pens,
    feedTypes: feedTypes,
    penFeedLogs: penFeedLogs,
    measurements: measurements,
    healthEvents: healthEvents,
    eggStates: eggStates,
    reminders: allReminders,
    photoCache: photoCache,
    ensureBirdPhotos: ensureBirdPhotos,
    onAdd: addBird,
    onUpdate: updBird,
    onDelete: delBird,
    onAddM: addM,
    onAddH: addH,
    onAddPhoto: addPhoto,
    onDelPhoto: delPhoto,
    openBirdId: recordOverlay.birdId,
    openBirdPenId: recordOverlay.penId || "",
    onRequestClose: closeRecordOverlay
  }, {
    requireDeferredData: true
  }))), showCalendarModal && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#0f172a99",
      zIndex: 160,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: isPhoneShell ? "12px 10px calc(110px + env(safe-area-inset-bottom, 0px))" : "18px 12px 96px",
      overflowY: "auto"
    },
    onClick: closeCalendarModal
  }, React.createElement("div", {
    style: {
      width: isPhoneShell ? "100%" : "min(560px, 100%)",
      background: "#ffffff",
      border: "1px solid #cbd5e1",
      borderRadius: isPhoneShell ? 18 : 16,
      padding: isPhoneShell ? 12 : 14,
      boxShadow: "0 18px 42px #00000033"
    },
    onClick: event => event.stopPropagation()
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      flexWrap: isPhoneShell ? "wrap" : "nowrap",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "Calendar"), React.createElement("button", {
    type: "button",
    onClick: closeCalendarModal,
    style: {
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      color: "#475569",
      borderRadius: 10,
      width: 34,
      height: 34,
      fontSize: 18,
      fontWeight: 800,
      cursor: "pointer"
    }
  }, "\u2715")), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: isPhoneShell ? "wrap" : "nowrap",
      marginBottom: 10
    }
  }, React.createElement("button", {
    type: "button",
    onClick: () => goCalendarMonth(-1),
    style: {
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      color: "#1d4ed8",
      borderRadius: 10,
      padding: "6px 10px",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer"
    }
  }, "\u2190"), React.createElement("div", {
    style: {
      flex: 1,
      textAlign: "center",
      fontSize: 16,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, calendarMonthTitle), React.createElement("button", {
    type: "button",
    onClick: () => goCalendarMonth(1),
    style: {
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      color: "#1d4ed8",
      borderRadius: 10,
      padding: "6px 10px",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer"
    }
  }, "\u2192"), React.createElement("button", {
    type: "button",
    onClick: jumpCalendarToday,
    style: {
      border: "1px solid #93c5fd",
      background: "#eff6ff",
      color: "#1d4ed8",
      borderRadius: 10,
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer"
    }
  }, "Today")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7,minmax(0,1fr))",
      gap: 6,
      marginBottom: 6
    }
  }, CALENDAR_WEEKDAYS.map(dayLabel => React.createElement("div", {
    key: dayLabel,
    style: {
      textAlign: "center",
      fontSize: 11,
      fontWeight: 900,
      color: "#64748b",
      textTransform: "uppercase"
    }
  }, dayLabel))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7,minmax(0,1fr))",
      gap: 6
    }
  }, calendarCells.map(cell => {
    const dayEvents = calendarEventsByDay.get(cell.dayKey) || [];
    const isSelected = calendarSelectedDay === cell.dayKey;
    const isTodayCell = calendarTodayKey === cell.dayKey;
    return React.createElement("button", {
      key: cell.dayKey,
      type: "button",
      onClick: () => selectCalendarDay(cell),
      style: {
        border: isSelected ? "2px solid #1d4ed8" : "1px solid #dbe4ef",
        background: isSelected ? "#eff6ff" : cell.inMonth ? "#ffffff" : "#f8fafc",
        borderRadius: 10,
        minHeight: isPhoneShell ? 42 : 48,
        padding: "4px 4px",
        textAlign: "left",
        cursor: "pointer",
        opacity: cell.inMonth ? 1 : .72
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline"
      }
    }, React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: isSelected || isTodayCell ? 900 : 700,
        color: isTodayCell ? "#b45309" : cell.inMonth ? "#0f172a" : "#94a3b8"
      }
    }, cell.dayNumber), dayEvents.length > 0 && React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 800,
        color: "#64748b"
      }
    }, dayEvents.length)), dayEvents.length > 0 && React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginTop: 4,
        flexWrap: "wrap"
      }
    }, dayEvents.slice(0, 3).map((dotEvent, idx) => React.createElement("span", {
      key: `${cell.dayKey}-dot-${idx}`,
      style: {
        width: 7,
        height: 7,
        borderRadius: 999,
        background: dotEvent.tone,
        display: "inline-block"
      }
    })), dayEvents.length > 3 && React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 800,
        color: "#64748b"
      }
    }, `+${dayEvents.length - 3}`)));
  })), React.createElement("div", {
    style: {
      marginTop: 12,
      borderTop: "1px solid #e2e8f0",
      paddingTop: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, fmtDate(calendarSelectedDay)), React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: "#64748b"
    }
  }, calendarSelectedEvents.length, " event", calendarSelectedEvents.length === 1 ? "" : "s")), calendarSelectedEvents.length ? calendarSelectedEvents.map(eventItem => React.createElement("button", {
    key: `${eventItem.id}-${eventItem.dueMs}`,
    type: "button",
    onClick: () => openCalendarEvent(eventItem),
    style: {
      width: "100%",
      border: `1px solid ${eventItem.tone}44`,
      background: `${eventItem.tone}11`,
      borderRadius: 10,
      padding: "10px 11px",
      textAlign: "left",
      marginBottom: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, eventItem.title), React.createElement("div", {
    style: {
      marginTop: 2,
      fontSize: 12,
      color: "#475569"
    }
  }, eventItem.detail)), React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 900,
      color: eventItem.tone,
      whiteSpace: "nowrap"
    }
  }, eventItem.kind)))) : React.createElement("div", {
    style: {
      border: "1px dashed #cbd5e1",
      borderRadius: 10,
      padding: "12px 10px",
      fontSize: 13,
      color: "#64748b"
    }
  }, "No reminders or hatch events on this date.")))), deleteUndo && React.createElement("div", {
    style: {
      position: "fixed",
      left: isDesktopShell ? 312 : 12,
      right: 12,
      bottom: isDesktopShell ? 24 : isPhoneShell ? "calc(76px + env(safe-area-inset-bottom, 0px))" : 72,
      background: "#0f172a",
      color: "#eef3f9",
      borderRadius: 14,
      padding: "14px 16px",
      boxShadow: "0 12px 28px #00000040",
      display: "flex",
      alignItems: "center",
      gap: 12,
      zIndex: 70
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 14,
      lineHeight: 1.4
    }
  }, React.createElement("div", {
    style: {
      fontWeight: 800
    }
  }, deleteUndo.bird.tagId || "Bird deleted"), React.createElement("div", {
    style: {
      color: "#cbd5e1",
      marginTop: 2
    }
  }, "Bird and related records removed. Undo available for 5 seconds.")), React.createElement("button", {
    style: {
      background: "#ffffff",
      color: "#0f172a",
      border: "none",
      borderRadius: 10,
      padding: "10px 14px",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer"
    },
    onClick: undoDeleteBird
  }, "Undo")), !isDesktopShell && React.createElement("nav", {
    style: shellStyles.mobileNav
  }, navButtons));
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    __syncMergeTest: {
      mergeBirdConflictRow,
      mergeMeasurementConflictRow,
      mergeHealthConflictRow,
      mergeFinanceConflictRow,
      resolveStoreConflictRow,
      mergeStoreRows
    }
  };
}
if (typeof document !== "undefined" && typeof ReactDOM !== "undefined" && typeof ReactDOM.createRoot === "function" && document.getElementById("root")) ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
