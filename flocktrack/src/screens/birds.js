const buildBirdPenUpdateBirds = globalThis.FlockTrackLogic.buildBirdPenUpdate;
const estimateBirdPenFeed = globalThis.FlockTrackLogic.estimatePenFeedLog;
const FLOCK_STAGE_FILTER_COLORS = {
  all: "#15803d",
  chick: "#f4b740",
  pullet: "#c98a56",
  grower: "#5b9e50",
  layer: "#d8ab3a",
  broiler: "#b8895c",
  rooster: "#b91c1c",
  retired: "#6b7280"
};
const FLOCK_SEX_FILTER_SLIDES = [{
  id: "all",
  label: "All sexes",
  color: "#15803d"
}, {
  id: "unknown",
  label: "Unknown",
  color: "#6b7280"
}, {
  id: "male",
  label: "Male",
  color: "#1d4ed8"
}, {
  id: "female",
  label: "Female",
  color: "#b91c1c"
}];
const FLOCK_SORT_FILTER_SLIDES = [{
  id: "recent_activity",
  label: "Recent",
  color: "#b45309"
}, {
  id: "tag_asc",
  label: "Tag ID",
  color: "#1d4ed8"
}, {
  id: "age_oldest",
  label: "Oldest",
  color: "#0f766e"
}, {
  id: "age_youngest",
  label: "Youngest",
  color: "#15803d"
}, {
  id: "weight_desc",
  label: "Heaviest",
  color: "#c2410c"
}];
const FLOCK_STATUS_FILTER_SLIDES = [{
  id: "active",
  label: "Active",
  color: "#15803d"
}, {
  id: "all",
  label: "All",
  color: "#64748b"
}, {
  id: "sold",
  label: "Sold",
  color: "#a16207"
}, {
  id: "deceased",
  label: "Deceased",
  color: "#b91c1c"
}, {
  id: "culled",
  label: "Culled",
  color: "#c2410c"
}];
const FLOCK_LAYOUT_SLIDES = [{
  id: "cards",
  label: "Cards",
  color: "#1d4ed8"
}, {
  id: "table",
  label: "Table",
  color: "#0f766e"
}];
const BIRD_TABLE_MODE_SLIDES = [{
  id: "view",
  label: "View",
  color: "#475569"
}, {
  id: "edit",
  label: "Edit",
  color: "#b45309"
}];
const BIRD_TABLE_PRESET_SLIDES = [{
  id: "basic",
  label: "Basic",
  color: "#1d4ed8"
}, {
  id: "health",
  label: "Health",
  color: "#0f766e"
}, {
  id: "sales",
  label: "Sales",
  color: "#a16207"
}, {
  id: "custom",
  label: "Custom",
  color: "#6b7280"
}];
const BIRD_TABLE_PRESET_COLUMNS = {
  basic: ["nickname", "status", "stage", "breed", "sex", "hatchDate"],
  health: ["status", "stage", "hatchDate", "ageDays", "weight", "weightDate", "addWeight", "deceasedDate", "causeOfDeath", "culledDate", "cullReason"],
  sales: ["status", "breed", "sex", "weight", "weightDate", "soldDate", "buyerName", "salePrice"],
  custom: ["nickname", "status", "stage", "breed", "sex", "hatchDate"]
};
const BIRD_TABLE_COLUMNS = [{
  id: "nickname",
  label: "Nickname",
  editable: true,
  type: "text"
}, {
  id: "tagId",
  label: "Tag ID",
  editable: true,
  type: "text"
}, {
  id: "status",
  label: "Status",
  editable: false
}, {
  id: "stage",
  label: "Stage",
  editable: true,
  type: "stage"
}, {
  id: "breed",
  label: "Breed",
  editable: true,
  type: "text"
}, {
  id: "sex",
  label: "Sex",
  editable: true,
  type: "sex"
}, {
  id: "hatchDate",
  label: "Hatch Date",
  editable: true,
  type: "date"
}, {
  id: "ageDays",
  label: "Age (days)",
  editable: false
}, {
  id: "penName",
  label: "Pen",
  editable: false
}, {
  id: "batchLabel",
  label: "Batch",
  editable: false
}, {
  id: "weight",
  label: "Prev Day Weight (g)",
  editable: false
}, {
  id: "weightDate",
  label: "Weight Date",
  editable: false
}, {
  id: "addWeight",
  label: "Add Weight (g)",
  editable: true,
  type: "number"
}, {
  id: "bookmarked",
  label: "Bookmarked",
  editable: true,
  type: "toggle"
}, {
  id: "soldDate",
  label: "Sold Date",
  editable: true,
  type: "date"
}, {
  id: "buyerName",
  label: "Buyer",
  editable: true,
  type: "text"
}, {
  id: "salePrice",
  label: "Sale Price",
  editable: true,
  type: "number"
}, {
  id: "deceasedDate",
  label: "Death Date",
  editable: true,
  type: "date"
}, {
  id: "causeOfDeath",
  label: "Cause Of Death",
  editable: true,
  type: "text"
}, {
  id: "culledDate",
  label: "Cull Date",
  editable: true,
  type: "date"
}, {
  id: "cullReason",
  label: "Cull Reason",
  editable: true,
  type: "text"
}];
const BIRD_TABLE_CUSTOM_COLUMNS_STORAGE_KEY = "flocktrack-bird-table-custom-columns-v1";
const BIRD_TABLE_COLUMN_ID_SET = new Set(BIRD_TABLE_COLUMNS.map(col => col.id));
const normalizeBirdTableColumns = raw => {
  const list = Array.isArray(raw) ? raw : [];
  const picked = new Set();
  list.forEach(id => {
    const key = String(id || "").trim();
    if (!BIRD_TABLE_COLUMN_ID_SET.has(key)) return;
    picked.add(key);
  });
  const ordered = BIRD_TABLE_COLUMNS.map(col => col.id).filter(id => picked.has(id));
  return ordered.length ? ordered : [...BIRD_TABLE_PRESET_COLUMNS.custom];
};
const loadCustomBirdTableColumns = () => {
  try {
    if (!window?.localStorage) return [...BIRD_TABLE_PRESET_COLUMNS.custom];
    const raw = window.localStorage.getItem(BIRD_TABLE_CUSTOM_COLUMNS_STORAGE_KEY);
    if (!raw) return [...BIRD_TABLE_PRESET_COLUMNS.custom];
    return normalizeBirdTableColumns(JSON.parse(raw));
  } catch {
    return [...BIRD_TABLE_PRESET_COLUMNS.custom];
  }
};
const saveCustomBirdTableColumns = columns => {
  try {
    if (!window?.localStorage) return;
    const normalized = normalizeBirdTableColumns(columns);
    window.localStorage.setItem(BIRD_TABLE_CUSTOM_COLUMNS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
};
const birdMeasurementDayKey = value => {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ms = dateMs(raw);
  if (!Number.isFinite(ms) || ms <= 0) return raw.slice(0, 10);
  const dt = new Date(ms);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const birdMeasurementRevisionScore = row => Math.max(dateMs(row?.modifiedAt), dateMs(row?.measuredAt), dateMs(row?.createdAt), dateMs(row?.updatedAt));
const birdShiftDay = (dayValue, delta) => {
  const base = birdMeasurementDayKey(dayValue) || today();
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base);
  if (!parsed) return base;
  const dt = new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]));
  dt.setDate(dt.getDate() + (Number(delta) || 0));
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function latestPhotoWithImage(photos) {
  const list = Array.isArray(photos) ? photos : [];
  let best = null;
  let bestTime = -Infinity;
  let bestIdx = -1;
  for (let idx = 0; idx < list.length; idx += 1) {
    const photo = list[idx];
    if (!photo?.dataUrl) continue;
    const stamp = new Date(photo.takenAt || photo.createdAt || 0).getTime();
    const score = Number.isFinite(stamp) ? stamp : -Infinity;
    if (!best || score > bestTime || score === bestTime && idx > bestIdx) {
      best = photo;
      bestTime = score;
      bestIdx = idx;
    }
  }
  return best;
}

function stageSliderIconLabel(stage) {
  const meta = getStageMeta(stage);
  if (meta?.sprite) {
    return React.createElement("img", {
      src: meta.sprite,
      alt: meta.name,
      style: {
        width: 20,
        height: 20,
        objectFit: "contain",
        imageRendering: "pixelated",
        display: "block",
        margin: "0 auto"
      }
    });
  }
  return meta?.name ? meta.name.charAt(0).toUpperCase() : "?";
}
function birdDisplayName(bird) {
  const nickname = String(bird?.nickname || "").trim();
  if (nickname) return nickname;
  const tagId = String(bird?.tagId || "").trim();
  return tagId || "Bird";
}
function birdDisplayTag(bird) {
  const nickname = String(bird?.nickname || "").trim();
  const tagId = String(bird?.tagId || "").trim();
  return nickname && tagId ? tagId : "";
}
function formatBirdWeightDisplay(value, unit) {
  const inGrams = fmtWeightGrams(value, unit);
  if (inGrams) return inGrams;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const normalizedUnit = String(unit || "").trim();
  return `${fmtNum(numeric)} ${normalizedUnit}`.trim();
}

function birdFeedRecentDays(count, endDay = today()) {
  const addDaysToDay = globalThis.FlockTrackLogic?.addDaysToDay;
  const total = Math.max(1, Number(count) || 1);
  const end = String(endDay || today()).slice(0, 10);
  if (typeof addDaysToDay === "function") {
    return Array.from({
      length: total
    }, (_, idx) => addDaysToDay(end, idx - total + 1));
  }
  const endMs = dateMs(`${end}T00:00:00`);
  return Array.from({
    length: total
  }, (_, idx) => new Date(endMs + (idx - total + 1) * DAY_MS).toISOString().slice(0, 10));
}

function birdFeedAxisLabel(dayValue, idx, total) {
  if (idx !== 0 && idx !== total - 1 && idx % 5 !== 4) return "";
  return new Date(`${dayValue}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function getBirdFeedTypeTheme(feedType, fallbackKey = "") {
  const color = feedTypeColor(feedType, fallbackKey);
  return {
    color,
    soft: hexToRgba(color, .12),
    border: hexToRgba(color, .35)
  };
}

function BirdsScreen({
  birds,
  batches,
  pens,
  feedTypes,
  penFeedLogs,
  measurements,
  healthEvents,
  eggStates,
  reminders,
  photoCache,
  ensureBirdPhotos,
  onAdd,
  onUpdate,
  onDelete,
  onAddM,
  onAddH,
  onAddPhoto,
  onDelPhoto,
  openBirdId = "",
  openBirdPenId = "",
  onRequestClose
}) {
  birds = Array.isArray(birds) ? birds.filter(item => item && typeof item === "object") : [];
  batches = Array.isArray(batches) ? batches.filter(item => item && typeof item === "object") : [];
  pens = Array.isArray(pens) ? pens.filter(item => item && typeof item === "object") : [];
  feedTypes = Array.isArray(feedTypes) ? feedTypes.filter(item => item && typeof item === "object") : [];
  penFeedLogs = Array.isArray(penFeedLogs) ? penFeedLogs.filter(item => item && typeof item === "object") : [];
  measurements = Array.isArray(measurements) ? measurements.filter(item => item && typeof item === "object") : [];
  healthEvents = Array.isArray(healthEvents) ? healthEvents.filter(item => item && typeof item === "object") : [];
  eggStates = Array.isArray(eggStates) ? eggStates.filter(item => item && typeof item === "object") : [];
  reminders = Array.isArray(reminders) ? reminders.filter(item => item && typeof item === "object") : [];
  photoCache = photoCache && typeof photoCache === "object" ? photoCache : {};
  const detailOnly = !!openBirdId;
  const [sel, setSel] = useState(() => openBirdId ? birds.find(bird => bird.id === openBirdId) || null : null);
  const [tab, setTab] = useState("info");
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");
  const [stageFilter, setStageFilter] = useState("all");
  const [sexFilter, setSexFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [sortBy, setSortBy] = useState("tag_asc");
  const [activeFilterPanel, setActiveFilterPanel] = useState("status");
  const [navPenScopeId, setNavPenScopeId] = useState("");
  const outsiderSeed = useMemo(() => nextOutsiderSeed(birds), [birds]);
  const [obBatch, setObBatch] = useState(outsiderSeed.batchNo);
  const [obIndiv, setObIndiv] = useState(outsiderSeed.indivNo);
  const [obCount, setObCount] = useState(1);
  const [obBatchDraft, setObBatchDraft] = useState(() => String(outsiderSeed.batchNo));
  const [obIndivDraft, setObIndivDraft] = useState(() => String(outsiderSeed.indivNo));
  const [obCountDraft, setObCountDraft] = useState("1");
  const [tagAuto, setTagAuto] = useState(true);
  const [listPhotoPreview, setListPhotoPreview] = useState(null);
  const [recentPhotoCollapsed, setRecentPhotoCollapsed] = useState(false);
  const [flockLayout, setFlockLayout] = useState("cards");
  const [tableMode, setTableMode] = useState("view");
  const [tablePreset, setTablePreset] = useState("basic");
  const [tableColumns, setTableColumns] = useState(() => [...BIRD_TABLE_PRESET_COLUMNS.basic]);
  const [showTableColumns, setShowTableColumns] = useState(false);
  const [tableDraftById, setTableDraftById] = useState({});
  const [tableError, setTableError] = useState("");
  const [tableSaveBusy, setTableSaveBusy] = useState(false);
  const lastHandledOpenRequestRef = useRef({
    key: "",
    found: false
  });
  function makeBirdForm(tagId = outsiderTagCode(obBatch, obIndiv)) {
    return {
      tagId,
      nickname: "",
      hatchDate: "",
      stage: "chick",
      breed: "",
      sex: "unknown",
      penId: "",
      status: "active",
      notes: ""
    };
  }
  function makeInfoForm(bird) {
    return {
      tagId: bird?.tagId || "",
      nickname: bird?.nickname || "",
      hatchDate: bird?.hatchDate || "",
      status: bird?.status || "active",
      stage: bird?.stage || "chick",
      breed: bird?.breed || "",
      sex: bird?.sex || "unknown",
      originBatchId: bird?.originBatchId || "",
      penId: bird?.penId || "",
      notes: bird?.notes || "",
      soldDate: bird?.soldDate || "",
      buyerName: bird?.buyerName || "",
      salePrice: bird?.salePrice != null && bird?.salePrice !== "" ? String(bird.salePrice) : "",
      deceasedDate: bird?.deceasedDate || "",
      causeOfDeath: bird?.causeOfDeath || "",
      culledDate: bird?.culledDate || "",
      cullReason: bird?.cullReason || ""
    };
  }
  const [bf, setBf] = useState(() => makeBirdForm(outsiderTagCode(outsiderSeed.batchNo, outsiderSeed.indivNo)));
  const [infoForm, setInfoForm] = useState(null);
  const freshMf = () => ({
    metricType: "weight",
    value: "",
    unit: "g",
    measuredAt: today(),
    notes: ""
  });
  const freshHf = () => ({
    eventType: "checkup",
    eventDate: today(),
    details: "",
    medication: "",
    dose: "",
    outcome: ""
  });
  const [mf, setMf] = useState(freshMf);
  const [hf, setHf] = useState(freshHf);
  const measurementAccent = BIRD_TAB_SLIDES.find(slide => slide.id === "measurements")?.color || "#c2410c";
  const measurementMetricSlides = useMemo(() => METRICS.map(metric => ({
    id: metric,
    label: metric === "egg_count" ? "Egg Count" : humanize(metric),
    color: measurementAccent
  })), [measurementAccent]);
  const measurementUnitSlides = useMemo(() => {
    const unitsByMetric = {
      weight: [{
        id: "g",
        label: "g"
      }, {
        id: "kg",
        label: "kg"
      }, {
        id: "lb",
        label: "lb"
      }],
      length: [{
        id: "cm",
        label: "cm"
      }, {
        id: "mm",
        label: "mm"
      }, {
        id: "in",
        label: "in"
      }],
      egg_count: [{
        id: "eggs",
        label: "eggs"
      }, {
        id: "pcs",
        label: "pcs"
      }],
      feed_intake: [{
        id: "kg",
        label: "kg"
      }, {
        id: "g",
        label: "g"
      }, {
        id: "lb",
        label: "lb"
      }],
      other: []
    };
    return (unitsByMetric[mf.metricType] || []).map(unit => ({
      ...unit,
      color: measurementAccent
    }));
  }, [measurementAccent, mf.metricType]);
  const swipeRef = useRef({
    tracking: false,
    x: 0,
    y: 0
  });
  const summaryRef = useRef(null);
  const headerNavRef = useRef(null);
  const [showFloatingNav, setShowFloatingNav] = useState(false);
  const [showFloatingSummary, setShowFloatingSummary] = useState(false);
  const selId = sel && sel.id;
  function openPhotoPreview(photo, label) {
    if (!photo?.dataUrl) return;
    const detail = [photo.takenAt ? fmtDateTime(photo.takenAt) : "", photo.sizeKb ? `~${photo.sizeKb}KB` : ""].filter(Boolean).join(" · ");
    setListPhotoPreview({
      dataUrl: photo.dataUrl,
      label: label || "",
      detail
    });
  }
  function resolveFloatingUiScrollHost() {
    const anchorEl = headerNavRef.current || summaryRef.current;
    if (!anchorEl || !anchorEl.parentElement || typeof window.getComputedStyle !== "function") return window;
    let current = anchorEl.parentElement;
    while (current) {
      if (current === document.body || current === document.documentElement) return window;
      const style = window.getComputedStyle(current);
      const overflowY = style?.overflowY || "";
      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return current;
      current = current.parentElement;
    }
    return window;
  }
  function scrollPageTop() {
    const scrollHost = resolveFloatingUiScrollHost();
    if (scrollHost !== window && typeof scrollHost.scrollTo === "function") {
      try {
        scrollHost.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      } catch {
        scrollHost.scrollTop = 0;
      }
      return;
    }
    try {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } catch {
      window.scrollTo(0, 0);
    }
  }
  function selectBird(nextBird) {
    setSel(nextBird);
  }
  useEffect(() => {
    if (!sel) return;
    const u = birds.find(b => b.id === sel.id);
    if (u && u !== sel) {
      setSel(u);
      return;
    }
    if (!u) {
      if (typeof onRequestClose === "function") onRequestClose();else setSel(null);
    }
  }, [birds, onRequestClose, sel]);
  useEffect(() => {
    const pendingBirdId = openBirdId || window.__flockTrackOpenBirdId;
    const pendingPenId = openBirdId ? openBirdPenId : window.__flockTrackOpenBirdPenId;
    if (!pendingBirdId) {
      lastHandledOpenRequestRef.current = {
        key: "",
        found: false
      };
      return;
    }
    const targetBird = birds.find(b => b.id === pendingBirdId);
    const requestKey = `${openBirdId ? "prop" : "window"}:${pendingBirdId}:${pendingPenId || ""}`;
    const lastHandledRequest = lastHandledOpenRequestRef.current;
    if (lastHandledRequest.key === requestKey && (lastHandledRequest.found || !targetBird)) return;
    lastHandledOpenRequestRef.current = {
      key: requestKey,
      found: !!targetBird
    };
    if (!targetBird) {
      setSel(null);
      setNavPenScopeId(pendingPenId || "");
      if (!openBirdId) {
        window.__flockTrackOpenBirdId = null;
        window.__flockTrackOpenBirdPenId = null;
      }
      return;
    }
    setSel(targetBird);
    setNavPenScopeId(pendingPenId || "");
    setTab("info");
    if (!openBirdId) {
      window.__flockTrackOpenBirdId = null;
      window.__flockTrackOpenBirdPenId = null;
    }
    scrollPageTop();
  });
  const closeSelectedBird = useCallback(() => {
    setNavPenScopeId("");
    if (typeof onRequestClose === "function") {
      onRequestClose();
      return;
    }
    selectBird(null);
  }, [onRequestClose]);
  useEffect(() => {
    if (!sel) {
      setInfoForm(null);
      return;
    }
    setInfoForm(makeInfoForm(sel));
  }, [sel?.id, sel?.tagId, sel?.nickname, sel?.hatchDate, sel?.status, sel?.stage, sel?.breed, sel?.sex, sel?.originBatchId, sel?.penId, sel?.notes, sel?.soldDate, sel?.buyerName, sel?.salePrice, sel?.deceasedDate, sel?.causeOfDeath, sel?.culledDate, sel?.cullReason]);
  useEffect(() => {
    if (!selId || typeof ensureBirdPhotos !== "function") return;
    ensureBirdPhotos(selId).catch(console.error);
  }, [ensureBirdPhotos, selId]);
  useEffect(() => {
    if (!measurementUnitSlides.length) return;
    if (measurementUnitSlides.some(unit => unit.id === mf.unit)) return;
    setMf(prev => ({
      ...prev,
      unit: measurementUnitSlides[0].id
    }));
  }, [measurementUnitSlides, mf.unit]);
  useEffect(() => {
    if (!selId) {
      setShowFloatingNav(false);
      setShowFloatingSummary(false);
      return;
    }
    const scrollHost = resolveFloatingUiScrollHost();
    const updateFloatingUi = () => {
      const hostTop = scrollHost === window ? 0 : scrollHost.getBoundingClientRect().top;
      const hostBottom = scrollHost === window ? window.innerHeight || document.documentElement.clientHeight || 0 : scrollHost.getBoundingClientRect().bottom;
      const navEl = headerNavRef.current;
      if (navEl) {
        const navRect = navEl.getBoundingClientRect();
        setShowFloatingNav(navRect.bottom < hostTop + 72 || navRect.top > hostBottom - 72);
      } else {
        setShowFloatingNav(false);
      }
      const summaryEl = summaryRef.current;
      if (summaryEl) {
        const summaryRect = summaryEl.getBoundingClientRect();
        setShowFloatingSummary(summaryRect.bottom < hostTop + 72);
      } else {
        setShowFloatingSummary(false);
      }
    };
    updateFloatingUi();
    const scrollTarget = scrollHost === window ? window : scrollHost;
    scrollTarget.addEventListener("scroll", updateFloatingUi, {
      passive: true
    });
    window.addEventListener("resize", updateFloatingUi);
    return () => {
      scrollTarget.removeEventListener("scroll", updateFloatingUi);
      window.removeEventListener("resize", updateFloatingUi);
    };
  }, [selId]);
  const batchById = useMemo(() => {
    const m = new Map();
    batches.forEach(b => m.set(b.id, b));
    return m;
  }, [batches]);
  const penById = useMemo(() => {
    const m = new Map();
    pens.forEach(pen => m.set(pen.id, pen));
    return m;
  }, [pens]);
  const batchFilterKey = bird => {
    const batch = bird?.originBatchId ? batchById.get(bird.originBatchId) : null;
    if (batch?.code) return `batch:${batch.id}`;
    const outsider = parseOutsiderTagCode(bird?.tagId);
    if (outsider?.batchNo) return `outsider:${outsider.batchNo}`;
    const hatchNo = hatchTagBatchNo(bird?.tagId);
    if (hatchNo) return `hatch:${hatchNo}`;
    return "batch:unknown";
  };
  const todayWeightDay = birdMeasurementDayKey(today());
  const previousWeightDay = birdShiftDay(todayWeightDay, -1);
  const latestWeightByBird = useMemo(() => {
    const m = new Map();
    measurements.forEach(ms => {
      if (ms.metricType !== "weight") return;
      const ex = m.get(ms.birdId);
      if (!ex || birdMeasurementRevisionScore(ms) > birdMeasurementRevisionScore(ex)) m.set(ms.birdId, ms);
    });
    return m;
  }, [measurements]);
  const weightByBirdDay = useMemo(() => {
    const map = new Map();
    measurements.forEach(ms => {
      if (ms?.metricType !== "weight" || !ms?.birdId) return;
      const day = birdMeasurementDayKey(ms.measuredAt);
      if (!day) return;
      const key = `${ms.birdId}::${day}`;
      const existing = map.get(key);
      if (!existing || birdMeasurementRevisionScore(ms) > birdMeasurementRevisionScore(existing)) map.set(key, ms);
    });
    return map;
  }, [measurements]);
  const todayWeightByBird = useMemo(() => {
    const map = new Map();
    birds.forEach(bird => {
      if (!bird?.id) return;
      const row = weightByBirdDay.get(`${bird.id}::${todayWeightDay}`);
      if (row) map.set(bird.id, row);
    });
    return map;
  }, [birds, todayWeightDay, weightByBirdDay]);
  const previousDayWeightByBird = useMemo(() => {
    const map = new Map();
    birds.forEach(bird => {
      if (!bird?.id) return;
      const row = weightByBirdDay.get(`${bird.id}::${previousWeightDay}`);
      if (row) map.set(bird.id, row);
    });
    return map;
  }, [birds, previousWeightDay, weightByBirdDay]);
  const activityByBird = useMemo(() => {
    const m = new Map();
    birds.forEach(b => {
      const t = new Date(b.createdAt || 0).getTime();
      m.set(b.id, Number.isFinite(t) ? t : 0);
    });
    measurements.forEach(ms => {
      const t = new Date(ms.measuredAt || 0).getTime();
      if (!Number.isFinite(t)) return;
      m.set(ms.birdId, Math.max(m.get(ms.birdId) || 0, t));
    });
    healthEvents.forEach(h => {
      const t = new Date(h.eventDate || 0).getTime();
      if (!Number.isFinite(t)) return;
      m.set(h.birdId, Math.max(m.get(h.birdId) || 0, t));
    });
    return m;
  }, [birds, healthEvents, measurements]);
  const batchOptions = useMemo(() => {
    const seen = new Map();
    birds.forEach(b => {
      const key = batchFilterKey(b);
      if (!seen.has(key)) seen.set(key, birdBatchChipLabel(b, batchById));
    });
    return [...seen.entries()].map(([id, label]) => ({
      id,
      label
    })).sort((a, b) => a.label.localeCompare(b.label, undefined, {
      numeric: true
    }));
  }, [batchById, birds]);
  const stageFilterSlides = useMemo(() => [{
    id: "all",
    label: "All",
    fullLabel: "All stages",
    color: FLOCK_STAGE_FILTER_COLORS.all
  }, ...STAGES_BIRD_INFO.map(stage => ({
    id: stage,
    label: stageSliderIconLabel(stage),
    fullLabel: stageLabel(stage),
    color: FLOCK_STAGE_FILTER_COLORS[stage] || "#475569"
  }))], []);
  const statusFilterSlide = FLOCK_STATUS_FILTER_SLIDES.find(slide => slide.id === statusFilter) || FLOCK_STATUS_FILTER_SLIDES[0];
  const stageFilterSlide = stageFilterSlides.find(slide => slide.id === stageFilter) || stageFilterSlides[0];
  const sexFilterSlide = FLOCK_SEX_FILTER_SLIDES.find(slide => slide.id === sexFilter) || FLOCK_SEX_FILTER_SLIDES[0];
  const sortBySlide = FLOCK_SORT_FILTER_SLIDES.find(slide => slide.id === sortBy) || FLOCK_SORT_FILTER_SLIDES[0];
  const filterButtons = [{
    id: "status",
    label: "Status",
    value: statusFilterSlide.label,
    color: statusFilterSlide.color
  }, {
    id: "stage",
    label: "Stage",
    value: stageFilterSlide.fullLabel || "All stages",
    color: stageFilterSlide.color
  }, {
    id: "sex",
    label: "Sex",
    value: sexFilterSlide.label,
    color: sexFilterSlide.color
  }, {
    id: "sort",
    label: "Sort",
    value: sortBySlide.label,
    color: sortBySlide.color
  }];
  const visible = useMemo(() => {
    let list = statusFilter === "all" ? birds : birds.filter(b => b.status === statusFilter);
    if (stageFilter !== "all") list = list.filter(b => b.stage === stageFilter);
    if (sexFilter !== "all") list = list.filter(b => (b.sex || "unknown") === sexFilter);
    if (batchFilter !== "all") list = list.filter(b => batchFilterKey(b) === batchFilter);
    const cmpTag = (a, b) => normalizeTagId(a.tagId).localeCompare(normalizeTagId(b.tagId), undefined, {
      numeric: true
    });
    return [...list].sort((a, b) => {
      if (sortBy === "tag_asc") return cmpTag(a, b);
      if (sortBy === "age_oldest") {
        const av = ageDays(a.hatchDate);
        const bv = ageDays(b.hatchDate);
        const diff = (Number.isFinite(bv) ? bv : -1) - (Number.isFinite(av) ? av : -1);
        return diff || cmpTag(a, b);
      }
      if (sortBy === "age_youngest") {
        const av = ageDays(a.hatchDate);
        const bv = ageDays(b.hatchDate);
        const diff = (Number.isFinite(av) ? av : 1e9) - (Number.isFinite(bv) ? bv : 1e9);
        return diff || cmpTag(a, b);
      }
      if (sortBy === "weight_desc") {
        const av = Number(weightAmountToGrams(latestWeightByBird.get(a.id)?.value, latestWeightByBird.get(a.id)?.unit) ?? -Infinity);
        const bv = Number(weightAmountToGrams(latestWeightByBird.get(b.id)?.value, latestWeightByBird.get(b.id)?.unit) ?? -Infinity);
        const diff = bv - av;
        return diff || cmpTag(a, b);
      }
      const diff = (activityByBird.get(b.id) || 0) - (activityByBird.get(a.id) || 0);
      return diff || cmpTag(a, b);
    });
  }, [activityByBird, batchById, batchFilter, birds, latestWeightByBird, sexFilter, sortBy, stageFilter, statusFilter]);
  const tableVisible = useMemo(() => [...visible].sort((a, b) => normalizeTagId(a.tagId).localeCompare(normalizeTagId(b.tagId), undefined, {
    numeric: true
  })), [visible]);
  useEffect(() => {
    if (typeof ensureBirdPhotos !== "function") return;
    visible.forEach(bird => {
      if (!bird?.id) return;
      if (Object.prototype.hasOwnProperty.call(photoCache, bird.id)) return;
      ensureBirdPhotos(bird.id).catch(console.error);
    });
  }, [ensureBirdPhotos, photoCache, visible]);
  const navVisible = useMemo(() => {
    if (!navPenScopeId) return visible;
    return birds.filter(bird => bird.penId === navPenScopeId && (bird.status || "active") === "active").sort((a, b) => normalizeTagId(a.tagId).localeCompare(normalizeTagId(b.tagId), undefined, {
      numeric: true
    }));
  }, [birds, navPenScopeId, visible]);
  const bms = useMemo(() => {
    if (!selId) return [];
    return measurements.filter(m => m.birdId === selId).sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
  }, [measurements, selId]);
  const bmsDesc = useMemo(() => [...bms].reverse(), [bms]);
  const bhs = useMemo(() => {
    if (!selId) return [];
    return healthEvents.filter(h => h.birdId === selId).sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  }, [healthEvents, selId]);
  const selEggState = useMemo(() => {
    if (!selId || !sel) return null;
    return eggStates.find(es => es.birdId === selId || es.status === "hatched" && es.id === sel.tagId) || null;
  }, [eggStates, sel?.tagId, selId]);
  const birdReminderItems = useMemo(() => {
    if (!selId) return [];
    return reminders.filter(r => r.birdId === selId).sort((a, b) => dateMs(b.completedAt || b.dueAt) - dateMs(a.completedAt || a.dueAt));
  }, [reminders, selId]);
  const wt = useMemo(() => bms.filter(m => m.metricType === "weight").map(m => ({
    v: m.value,
    date: m.measuredAt
  })), [bms]);
  const feedTypeById = useMemo(() => new Map(feedTypes.map(feedType => [feedType.id, feedType])), [feedTypes]);
  const feed30 = useMemo(() => {
    if (!selId || typeof estimateBirdPenFeed !== "function") {
      return {
        days: [],
        legend: [],
        totalKg: 0,
        avgKgPerDay: 0,
        skippedSackLogs: 0,
        skippedUnknownLogs: 0
      };
    }
    const days = birdFeedRecentDays(30, today());
    const dayMap = new Map(days.map(day => [day, {
      day,
      totalKg: 0,
      byType: new Map()
    }]));
    const legendMap = new Map();
    let totalKg = 0;
    let skippedSackLogs = 0;
    let skippedUnknownLogs = 0;
    penFeedLogs.forEach(log => {
      const day = String(log?.loggedAt || "").slice(0, 10);
      if (!dayMap.has(day)) return;
      const allocation = estimateBirdPenFeed({
        log,
        birds
      });
      if (!allocation?.birdIds?.includes(selId) || !allocation?.birdCount) return;
      const feedType = feedTypeById.get(log.feedTypeId) || null;
      const sackKg = log?.sackKg != null && log?.sackKg !== "" ? log.sackKg : feedType?.sackKg;
      const kg = feedAmountToKg(log.amount, log.unit, sackKg);
      if (!Number.isFinite(kg) || kg <= 0) {
        if (String(log?.unit || "").trim().toLowerCase() === "sack") skippedSackLogs += 1;else skippedUnknownLogs += 1;
        return;
      }
      const perBirdKg = kg / allocation.birdCount;
      const typeKey = log.feedTypeId || "__feed__";
      const dayRow = dayMap.get(day);
      dayRow.totalKg += perBirdKg;
      dayRow.byType.set(typeKey, (dayRow.byType.get(typeKey) || 0) + perBirdKg);
      const legend = legendMap.get(typeKey) || {
        id: typeKey,
        label: feedType?.name || "Feed",
        totalKg: 0,
        theme: getBirdFeedTypeTheme(feedType, typeKey)
      };
      legend.totalKg += perBirdKg;
      legendMap.set(typeKey, legend);
      totalKg += perBirdKg;
    });
    const legend = [...legendMap.values()].sort((a, b) => b.totalKg - a.totalKg);
    return {
      days: days.map((day, idx) => {
        const current = dayMap.get(day) || {
          totalKg: 0,
          byType: new Map()
        };
        return {
          id: day,
          day,
          axisLabel: birdFeedAxisLabel(day, idx, days.length),
          totalKg: current.totalKg,
          stacks: [...current.byType.entries()].map(([typeId, value]) => {
            const legendRow = legendMap.get(typeId);
            return {
              id: typeId,
              value,
              color: legendRow?.theme?.color || "#94a3b8",
              label: legendRow?.label || "Feed"
            };
          }).sort((a, b) => b.value - a.value)
        };
      }),
      legend,
      totalKg,
      avgKgPerDay: totalKg / days.length,
      skippedSackLogs,
      skippedUnknownLogs
    };
  }, [birds, feedTypeById, feedTypes, penFeedLogs, selId]);
  const feed30MaxKg = useMemo(() => feed30.days.reduce((best, day) => Math.max(best, day.totalKg || 0), 0), [feed30.days]);
  const selPhotos = useMemo(() => selId ? photoCache[selId] || [] : [], [photoCache, selId]);
  const latestSelPhoto = useMemo(() => latestPhotoWithImage(selPhotos), [selPhotos]);
  const infoSuggestion = useMemo(() => sel && infoForm ? stageSuggestion({
    ...sel,
    ...infoForm,
    status: infoForm.status || sel.status
  }) : stageSuggestion(sel), [infoForm?.breed, infoForm?.hatchDate, infoForm?.sex, infoForm?.stage, infoForm?.status, sel?.id, sel?.status]);
  const addSuggestion = useMemo(() => stageSuggestion(bf), [bf.hatchDate, bf.sex, bf.breed, bf.stage, bf.status]);
  const parseCodeNum = v => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const parseOptionalCodeNum = v => {
    const text = String(v ?? "").trim();
    if (!text) return null;
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const findTagConflict = (tagId, excludeId = "") => {
    const key = normalizeTagId(tagId);
    if (!key) return null;
    return birds.find(b => b.id !== excludeId && normalizeTagId(b.tagId) === key) || null;
  };
  const addGeneratedTags = useMemo(() => {
    if (!tagAuto) return [(bf.tagId || "").trim()].filter(Boolean);
    return Array.from({
      length: Math.max(1, obCount)
    }, (_, idx) => outsiderTagCode(obBatch, obIndiv + idx));
  }, [bf.tagId, obBatch, obCount, obIndiv, tagAuto]);
  const addTagConflict = useMemo(() => {
    for (const tagId of addGeneratedTags) {
      const conflict = findTagConflict(tagId);
      if (conflict) return conflict;
    }
    return null;
  }, [addGeneratedTags, birds]);
  const addBulkNeedsAutoTag = !tagAuto && obCount > 1;
  const addCanSave = !!(bf.tagId || "").trim() && !addTagConflict && !addBulkNeedsAutoTag;
  const infoTagConflict = useMemo(() => sel ? findTagConflict(infoForm?.tagId, sel.id) : null, [birds, infoForm?.tagId, sel?.id]);
  const infoDirty = !!(sel && infoForm) && [sel.tagId || "", sel.nickname || "", sel.hatchDate || "", sel.status || "active", sel.stage || "", sel.breed || "", sel.sex || "unknown", sel.originBatchId || "", sel.penId || "", sel.notes || "", sel.soldDate || "", sel.buyerName || "", sel.salePrice != null && sel.salePrice !== "" ? String(sel.salePrice) : "", sel.deceasedDate || "", sel.causeOfDeath || "", sel.culledDate || "", sel.cullReason || ""].join("\u0000") !== [infoForm?.tagId || "", infoForm?.nickname || "", infoForm?.hatchDate || "", infoForm?.status || "active", infoForm?.stage || "", infoForm?.breed || "", infoForm?.sex || "unknown", infoForm?.originBatchId || "", infoForm?.penId || "", infoForm?.notes || "", infoForm?.soldDate || "", infoForm?.buyerName || "", infoForm?.salePrice || "", infoForm?.deceasedDate || "", infoForm?.causeOfDeath || "", infoForm?.culledDate || "", infoForm?.cullReason || ""].join("\u0000");
  const lifecycleDetails = useMemo(() => {
    if (!infoForm) return [];
    if (infoForm.status === "sold") return [{
      key: "soldDate",
      label: "Sold Date",
      value: infoForm.soldDate || "—"
    }, {
      key: "buyerName",
      label: "Buyer",
      value: infoForm.buyerName || "—"
    }, {
      key: "salePrice",
      label: "Sale Price",
      value: infoForm.salePrice ? fmtNum(infoForm.salePrice) : "—"
    }];
    if (infoForm.status === "deceased") return [{
      key: "deceasedDate",
      label: "Death Date",
      value: infoForm.deceasedDate || "—"
    }, {
      key: "causeOfDeath",
      label: "Cause",
      value: infoForm.causeOfDeath || "—"
    }];
    if (infoForm.status === "culled") return [{
      key: "culledDate",
      label: "Cull Date",
      value: infoForm.culledDate || "—"
    }, {
      key: "cullReason",
      label: "Cull Reason",
      value: infoForm.cullReason || "—"
    }];
    return [];
  }, [infoForm]);
  const timelineItems = useMemo(() => {
    if (!sel) return [];
    const items = [];
    const push = entry => {
      if (!entry || !entry.when) return;
      items.push({
        ...entry,
        sortAt: dateMs(entry.when)
      });
    };
    const statusHistory = Array.isArray(sel.statusHistory) ? sel.statusHistory : [];
    const hasStatusMarker = (status, when) => statusHistory.some(ev => ev?.status === status && (ev?.date || "") === (when || ""));
    push({
      id: "record-created",
      kind: "record",
      icon: "🪪",
      color: "#475569",
      when: sel.createdAt || sel.hatchDate,
      title: "Bird record created",
      detail: sel.createdAt ? `Added ${fmtDateTime(sel.createdAt)}` : "Initial bird entry"
    });
    if (sel.hatchDate) {
      push({
        id: "hatch-date",
        kind: "hatch",
        icon: "🐣",
        color: "#15803d",
        when: sel.hatchDate,
        title: "Hatched",
        detail: sel.originBatchId ? `From ${birdBatchLabel(sel, batchById)}` : "Manual or outsider bird"
      });
    }
    if (selEggState?.status === "hatched") {
      push({
        id: `egg-${selEggState.id}`,
        kind: "hatch",
        icon: "🥚",
        color: "#0f766e",
        when: selEggState.date || sel.hatchDate,
        title: "Batch hatch logged",
        detail: `${selEggState.id}${selEggState.batchId ? ` · ${batchById.get(selEggState.batchId)?.code || "Batch"}` : ""}`
      });
    }
    statusHistory.forEach((ev, idx) => {
      push({
        id: ev?.id || `status-${idx}`,
        kind: "status",
        icon: "🏷️",
        color: sc(ev?.status),
        when: ev?.date,
        title: `Status changed to ${humanize(ev?.status)}`,
        detail: [ev?.previousStatus ? `From ${humanize(ev.previousStatus)}` : "", ev?.note || ""].filter(Boolean).join(" · ")
      });
    });
    const penHistory = Array.isArray(sel.penHistory) ? sel.penHistory : [];
    penHistory.forEach((ev, idx) => {
      const fromPen = ev?.fromPenId ? penById.get(ev.fromPenId)?.name || "Unknown pen" : "No pen";
      const toPen = ev?.toPenId ? penById.get(ev.toPenId)?.name || "Unknown pen" : "No pen";
      push({
        id: ev?.id || `pen-${idx}`,
        kind: "pen",
        icon: "🪺",
        color: "#1d4ed8",
        when: ev?.date,
        title: ev?.toPenId ? `Moved to ${toPen}` : "Removed from pen",
        detail: [fromPen !== toPen ? `From ${fromPen}` : "", ev?.reason ? humanize(ev.reason) : ""].filter(Boolean).join(" · ")
      });
    });
    if (sel.status === "sold" && sel.soldDate && !hasStatusMarker("sold", sel.soldDate)) {
      push({
        id: "sold-date",
        kind: "status",
        icon: "💸",
        color: sc("sold"),
        when: sel.soldDate,
        title: "Marked sold",
        detail: [sel.buyerName || "", sel.salePrice != null && sel.salePrice !== "" ? `Price ${fmtNum(sel.salePrice)}` : ""].filter(Boolean).join(" · ")
      });
    }
    if (sel.status === "deceased" && sel.deceasedDate && !hasStatusMarker("deceased", sel.deceasedDate)) {
      push({
        id: "deceased-date",
        kind: "status",
        icon: "⚰️",
        color: sc("deceased"),
        when: sel.deceasedDate,
        title: "Marked deceased",
        detail: sel.causeOfDeath || ""
      });
    }
    if (sel.status === "culled" && sel.culledDate && !hasStatusMarker("culled", sel.culledDate)) {
      push({
        id: "culled-date",
        kind: "status",
        icon: "✂️",
        color: sc("culled"),
        when: sel.culledDate,
        title: "Marked culled",
        detail: sel.cullReason || ""
      });
    }
    bmsDesc.forEach(m => push({
      id: `measurement-${m.id}`,
      kind: "measurement",
      icon: "📏",
      color: "#c2410c",
      when: m.measuredAt,
      title: `${humanize(m.metricType)} recorded`,
      detail: m.metricType === "weight" ? formatBirdWeightDisplay(m.value, m.unit) : `${fmtNum(m.value)} ${m.unit || ""}`.trim()
    }));
    bhs.forEach(h => push({
      id: `health-${h.id}`,
      kind: "health",
      icon: "🩺",
      color: "#b91c1c",
      when: h.eventDate,
      title: humanize(h.eventType),
      detail: [h.details, h.medication ? `Med ${h.medication}` : "", h.outcome ? `Outcome ${h.outcome}` : ""].filter(Boolean).join(" · ")
    }));
    selPhotos.forEach(ph => push({
      id: `photo-${ph.id}`,
      kind: "photo",
      icon: "📷",
      color: "#6d28d9",
      when: ph.takenAt,
      title: "Photo added",
      detail: `${fmtNum(ph.sizeKb)} KB`,
      thumb: ph.dataUrl || ""
    }));
    birdReminderItems.forEach(reminder => push({
      id: `reminder-${reminder.id}`,
      kind: "reminder",
      icon: reminder.status === "done" ? "✅" : "🔔",
      color: reminder.status === "done" ? "#15803d" : "#1d4ed8",
      when: reminder.completedAt || reminder.dueAt,
      title: `${reminder.status === "done" ? "Reminder done" : "Reminder due"}: ${humanize(reminder.kind)}`,
      detail: reminder.status === "done" ? `Completed ${fmtDateTime(reminder.completedAt || reminder.dueAt)}` : `Due ${fmtDateTime(reminder.dueAt)}`
    }));
    if (sel.archivedAt) {
      push({
        id: "archived",
        kind: "archive",
        icon: "🗂️",
        color: "#475569",
        when: sel.archivedAt,
        title: "Archived",
        detail: fmtDateTime(sel.archivedAt)
      });
    }
    return items.filter(item => item.sortAt > 0).sort((a, b) => b.sortAt - a.sortAt || a.title.localeCompare(b.title));
  }, [batchById, bhs, birdReminderItems, bmsDesc, penById, sel, selEggState, selPhotos]);
  function confirmApplyStageSuggestion(bird, suggestion) {
    if (!bird || !infoForm || !suggestion || !suggestion.stage) return;
    if (suggestion.stage === infoForm.stage) return;
    const ok = window.confirm(`Apply stage suggestion for ${bird.tagId || "this bird"}?\n\n${stageLabel(infoForm.stage)} -> ${stageLabel(suggestion.stage)}\n${suggestion.reason}`);
    if (!ok) return;
    setInfoForm({
      ...infoForm,
      stage: suggestion.stage
    });
  }
  function confirmApplyAddSuggestion() {
    if (!addSuggestion || addSuggestion.stage === bf.stage) return;
    const ok = window.confirm(`Use suggested stage for this new bird?\n\n${stageLabel(bf.stage)} -> ${stageLabel(addSuggestion.stage)}\n${addSuggestion.reason}`);
    if (!ok) return;
    setBf({
      ...bf,
      stage: addSuggestion.stage
    });
  }
  function openAddBirdForm() {
    const seed = nextOutsiderSeed(birds);
    setObBatch(seed.batchNo);
    setObIndiv(seed.indivNo);
    setObCount(1);
    setObBatchDraft(String(seed.batchNo));
    setObIndivDraft(String(seed.indivNo));
    setObCountDraft("1");
    setTagAuto(true);
    setBf(makeBirdForm(outsiderTagCode(seed.batchNo, seed.indivNo)));
    setShowForm(true);
  }
  function updateOutsiderBatch(v) {
    setObBatchDraft(v);
    const n = parseOptionalCodeNum(v);
    if (n == null) return;
    setObBatch(n);
    if (tagAuto) setBf(p => ({
      ...p,
      tagId: outsiderTagCode(n, obIndiv)
    }));
  }
  function updateOutsiderIndiv(v) {
    setObIndivDraft(v);
    const n = parseOptionalCodeNum(v);
    if (n == null) return;
    setObIndiv(n);
    if (tagAuto) setBf(p => ({
      ...p,
      tagId: outsiderTagCode(obBatch, n)
    }));
  }
  function updateOutsiderCount(v) {
    setObCountDraft(v);
    const n = parseOptionalCodeNum(v);
    if (n == null) return;
    setObCount(n);
  }
  function commitOutsiderBatchDraft() {
    setObBatchDraft(String(obBatch));
  }
  function commitOutsiderIndivDraft() {
    setObIndivDraft(String(obIndiv));
  }
  function commitOutsiderCountDraft() {
    setObCountDraft(String(obCount));
  }
  function enableAutoTag() {
    setTagAuto(true);
    setBf(p => ({
      ...p,
      tagId: outsiderTagCode(obBatch, obIndiv)
    }));
  }
  function resetBirdForms() {
    setMf(freshMf());
    setHf(freshHf());
  }
  function saveBirdInfo() {
    if (!sel || !infoForm) return;
    const tagId = (infoForm.tagId || "").trim();
    if (!tagId) {
      window.alert("Tag ID is required.");
      return;
    }
    if (infoTagConflict) {
      window.alert(`Tag ID ${tagId} already exists.`);
      return;
    }
    const salePriceText = (infoForm.salePrice || "").trim();
    const salePriceValue = salePriceText === "" ? null : Number(salePriceText);
    if (salePriceText && !Number.isFinite(salePriceValue)) {
      window.alert("Sale price must be a valid number.");
      return;
    }
    const nextStatus = infoForm.status || sel.status || "active";
    const statusDateField = STATUS_DATE_FIELDS[nextStatus] || "";
    const statusHistory = Array.isArray(sel.statusHistory) ? [...sel.statusHistory] : [];
    const updated = {
      ...sel,
      ...infoForm,
      tagId,
      nickname: (infoForm.nickname || "").trim(),
      status: nextStatus,
      originBatchId: infoForm.originBatchId || null,
      buyerName: (infoForm.buyerName || "").trim(),
      salePrice: salePriceValue,
      causeOfDeath: (infoForm.causeOfDeath || "").trim(),
      cullReason: (infoForm.cullReason || "").trim()
    };
    const penUpdate = buildBirdPenUpdateBirds({
      bird: sel,
      nextPenId: infoForm.penId || null,
      nextStatus,
      changeDate: updated[statusDateField] || today(),
      reason: nextStatus !== "active" ? `status_${nextStatus}` : infoForm.penId ? sel.penId ? "pen_transfer" : "pen_assignment" : "pen_cleared",
      makeId: uid
    });
    updated.penId = penUpdate.penId;
    updated.penHistory = penUpdate.penHistory;
    if (statusDateField && !updated[statusDateField]) updated[statusDateField] = today();
    if (nextStatus !== sel.status) {
      const detailNote = nextStatus === "sold" ? [updated.buyerName, updated.salePrice != null ? `Price ${fmtNum(updated.salePrice)}` : ""].filter(Boolean).join(" · ") : nextStatus === "deceased" ? updated.causeOfDeath : nextStatus === "culled" ? updated.cullReason : "";
      statusHistory.push({
        id: uid(),
        previousStatus: sel.status || "active",
        status: nextStatus,
        date: updated[statusDateField] || today(),
        note: detailNote
      });
    }
    onUpdate({
      ...updated,
      statusHistory
    });
  }
  function toggleBirdBookmark(bird) {
    if (!bird) return;
    const nextBookmarked = !bird.bookmarked;
    onUpdate({
      ...bird,
      bookmarked: nextBookmarked,
      bookmarkedAt: nextBookmarked ? new Date().toISOString() : ""
    });
  }
  const tableColumnById = useMemo(() => new Map(BIRD_TABLE_COLUMNS.map(col => [col.id, col])), []);
  const activeTableColumns = useMemo(() => {
    const seen = new Set();
    const normalized = [];
    tableColumns.forEach(colId => {
      if (!tableColumnById.has(colId) || seen.has(colId)) return;
      seen.add(colId);
      normalized.push(colId);
    });
    if (!normalized.length) normalized.push(...BIRD_TABLE_PRESET_COLUMNS.basic);
    return normalized.map(colId => tableColumnById.get(colId)).filter(Boolean);
  }, [tableColumnById, tableColumns]);
  const tableDraftCount = useMemo(() => Object.keys(tableDraftById).length, [tableDraftById]);
  const tableHasDraftEdits = tableDraftCount > 0;
  const tableEditDateFields = ["hatchDate", "soldDate", "deceasedDate", "culledDate"];
  const tableDisplayDateFields = [...tableEditDateFields, "weightDate"];
  const isDayLike = value => {
    const text = String(value == null ? "" : value).trim();
    if (!text) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(text);
  };
  const tableFieldValue = (bird, fieldId, includeDraft = true) => {
    const draft = includeDraft ? tableDraftById[bird.id] : null;
    if (draft && Object.prototype.hasOwnProperty.call(draft, fieldId)) return draft[fieldId];
    if (fieldId === "nickname") return bird.nickname || "";
    if (fieldId === "tagId") return bird.tagId || "";
    if (fieldId === "status") return bird.status || "active";
    if (fieldId === "stage") return bird.stage || "chick";
    if (fieldId === "breed") return bird.breed || "";
    if (fieldId === "sex") return bird.sex || "unknown";
    if (fieldId === "hatchDate") return bird.hatchDate || "";
    if (fieldId === "ageDays") return ageDays(includeDraft ? tableFieldValue(bird, "hatchDate", includeDraft) : bird.hatchDate);
    if (fieldId === "penName") return bird.penId ? penById.get(bird.penId)?.name || "Unknown pen" : "";
    if (fieldId === "batchLabel") return birdBatchChipLabel(bird, batchById);
    if (fieldId === "weight") {
      const w = previousDayWeightByBird.get(bird.id);
      return w ? formatBirdWeightDisplay(w.value, w.unit) : "";
    }
    if (fieldId === "weightDate") return previousDayWeightByBird.get(bird.id)?.measuredAt || "";
    if (fieldId === "addWeight") {
      const w = todayWeightByBird.get(bird.id);
      const grams = weightAmountToGrams(w?.value, w?.unit);
      return Number.isFinite(grams) ? String(grams) : "";
    }
    if (fieldId === "bookmarked") return !!bird.bookmarked;
    if (fieldId === "soldDate") return bird.soldDate || "";
    if (fieldId === "buyerName") return bird.buyerName || "";
    if (fieldId === "salePrice") return bird.salePrice != null && bird.salePrice !== "" ? String(bird.salePrice) : "";
    if (fieldId === "deceasedDate") return bird.deceasedDate || "";
    if (fieldId === "causeOfDeath") return bird.causeOfDeath || "";
    if (fieldId === "culledDate") return bird.culledDate || "";
    if (fieldId === "cullReason") return bird.cullReason || "";
    return bird[fieldId] ?? "";
  };
  const tableDisplayValue = (bird, fieldId) => {
    const value = tableFieldValue(bird, fieldId, true);
    if (fieldId === "status") return humanize(value || "active");
    if (fieldId === "stage") return stageLabel(value || "chick");
    if (fieldId === "sex") return humanize(value || "unknown");
    if (fieldId === "bookmarked") return value ? "Yes" : "No";
    if (tableDisplayDateFields.includes(fieldId)) return value ? fmtDate(value) : "—";
    if (fieldId === "ageDays") return Number.isFinite(value) ? String(value) : "—";
    if (fieldId === "addWeight") return value === "" ? "—" : fmtNum(value);
    if (fieldId === "salePrice") return value === "" ? "—" : fmtNum(value);
    return String(value == null ? "" : value).trim() || "—";
  };
  const setTableFieldValue = (bird, fieldId, rawValue) => {
    if (!bird?.id) return;
    setTableError("");
    setTableDraftById(prev => {
      const current = prev[bird.id] && typeof prev[bird.id] === "object" ? {
        ...prev[bird.id]
      } : {};
      const baseValue = tableFieldValue(bird, fieldId, false);
      const normalized = fieldId === "bookmarked" ? !!rawValue : rawValue == null ? "" : String(rawValue);
      const same = fieldId === "bookmarked" ? normalized === !!baseValue : String(normalized) === String(baseValue == null ? "" : baseValue);
      if (same) {
        delete current[fieldId];
      } else {
        current[fieldId] = normalized;
      }
      const next = {
        ...prev
      };
      if (!Object.keys(current).length) delete next[bird.id];else next[bird.id] = current;
      return next;
    });
  };
  const applyTablePreset = presetId => {
    const nextPreset = BIRD_TABLE_PRESET_COLUMNS[presetId] ? presetId : "basic";
    setTablePreset(nextPreset);
    if (nextPreset === "custom") {
      setTableColumns(loadCustomBirdTableColumns());
      return;
    }
    setTableColumns([...(BIRD_TABLE_PRESET_COLUMNS[nextPreset] || BIRD_TABLE_PRESET_COLUMNS.basic)]);
  };
  const toggleTableColumn = columnId => {
    if (!tableColumnById.has(columnId)) return;
    setTablePreset("custom");
    setTableColumns(prev => {
      const hasColumn = prev.includes(columnId);
      if (hasColumn && prev.length === 1) return prev;
      const nextSet = new Set(hasColumn ? prev.filter(id => id !== columnId) : [...prev, columnId]);
      const nextColumns = normalizeBirdTableColumns(BIRD_TABLE_COLUMNS.map(col => col.id).filter(id => nextSet.has(id)));
      saveCustomBirdTableColumns(nextColumns);
      return nextColumns;
    });
  };
  const discardTableEdits = (confirmDiscard = true) => {
    if (confirmDiscard && tableHasDraftEdits && !window.confirm("Discard unsaved table edits?")) return false;
    setTableDraftById({});
    setTableError("");
    return true;
  };
  const ensureSafeTableExit = message => {
    if (tableMode !== "edit" || !tableHasDraftEdits) return true;
    if (!window.confirm(message || "Discard unsaved table edits?")) return false;
    setTableDraftById({});
    setTableError("");
    setTableMode("view");
    return true;
  };
  const handleLayoutChange = nextLayout => {
    if (nextLayout === flockLayout) return;
    if (!ensureSafeTableExit("You have unsaved table edits. Discard and switch layout?")) return;
    setFlockLayout(nextLayout);
  };
  const handleTableModeChange = nextMode => {
    if (nextMode === tableMode) return;
    if (nextMode === "view" && tableHasDraftEdits && !discardTableEdits(true)) return;
    setTableMode(nextMode === "edit" ? "edit" : "view");
  };
  const openBirdFromTable = bird => {
    if (!bird) return;
    if (!ensureSafeTableExit("You have unsaved table edits. Discard and open bird record?")) return;
    setNavPenScopeId("");
    selectBird(bird);
    setTab("info");
  };
  const saveTableEdits = async () => {
    if (tableSaveBusy || !tableHasDraftEdits) return;
    setTableSaveBusy(true);
    setTableError("");
    try {
      const birdById = new Map(birds.map(bird => [bird.id, bird]));
      const changedIds = Object.keys(tableDraftById);
      const updatedById = new Map();
      const weightAdds = [];
      for (const birdId of changedIds) {
        const sourceBird = birdById.get(birdId);
        const draft = tableDraftById[birdId];
        if (!sourceBird || !draft || typeof draft !== "object") continue;
        const nextBird = {
          ...sourceBird
        };
        let hasBirdFieldEdits = false;
        Object.keys(draft).forEach(fieldId => {
          const raw = draft[fieldId];
          if (fieldId === "nickname") {
            hasBirdFieldEdits = true;
            nextBird.nickname = String(raw || "").trim();
          }
          if (fieldId === "tagId") {
            hasBirdFieldEdits = true;
            nextBird.tagId = String(raw || "").trim();
          }
          if (fieldId === "stage") {
            hasBirdFieldEdits = true;
            nextBird.stage = STAGES_BIRD_INFO.includes(raw) ? raw : sourceBird.stage || "chick";
          }
          if (fieldId === "breed") {
            hasBirdFieldEdits = true;
            nextBird.breed = String(raw || "").trim();
          }
          if (fieldId === "sex") {
            hasBirdFieldEdits = true;
            nextBird.sex = ["unknown", "female", "male"].includes(raw) ? raw : sourceBird.sex || "unknown";
          }
          if (fieldId === "hatchDate") {
            hasBirdFieldEdits = true;
            nextBird.hatchDate = String(raw || "").trim();
          }
          if (fieldId === "bookmarked") {
            hasBirdFieldEdits = true;
            const isOn = !!raw;
            nextBird.bookmarked = isOn;
            nextBird.bookmarkedAt = isOn ? sourceBird.bookmarkedAt || new Date().toISOString() : "";
          }
          if (fieldId === "soldDate") {
            hasBirdFieldEdits = true;
            nextBird.soldDate = String(raw || "").trim();
          }
          if (fieldId === "buyerName") {
            hasBirdFieldEdits = true;
            nextBird.buyerName = String(raw || "").trim();
          }
          if (fieldId === "salePrice") {
            hasBirdFieldEdits = true;
            const text = String(raw == null ? "" : raw).trim();
            if (!text) nextBird.salePrice = null;else {
              const num = Number(text);
              if (!Number.isFinite(num)) throw new Error(`Sale Price is invalid for ${birdDisplayName(sourceBird)}.`);
              nextBird.salePrice = num;
            }
          }
          if (fieldId === "deceasedDate") {
            hasBirdFieldEdits = true;
            nextBird.deceasedDate = String(raw || "").trim();
          }
          if (fieldId === "causeOfDeath") {
            hasBirdFieldEdits = true;
            nextBird.causeOfDeath = String(raw || "").trim();
          }
          if (fieldId === "culledDate") {
            hasBirdFieldEdits = true;
            nextBird.culledDate = String(raw || "").trim();
          }
          if (fieldId === "cullReason") {
            hasBirdFieldEdits = true;
            nextBird.cullReason = String(raw || "").trim();
          }
          if (fieldId === "addWeight") {
            const text = String(raw == null ? "" : raw).trim();
            if (!text) return;
            const value = Number(text);
            if (!Number.isFinite(value) || value <= 0) throw new Error(`Add Weight is invalid for ${birdDisplayName(sourceBird)}.`);
            const existingTodayWeight = todayWeightByBird.get(sourceBird.id);
            const nowIso = new Date().toISOString();
            weightAdds.push({
              id: existingTodayWeight?.id || uid(),
              birdId: sourceBird.id,
              metricType: "weight",
              value,
              unit: "g",
              measuredAt: todayWeightDay,
              ageDays: ageDays(nextBird.hatchDate || sourceBird.hatchDate),
              notes: existingTodayWeight?.notes || "",
              createdAt: existingTodayWeight?.createdAt || nowIso,
              modifiedAt: nowIso
            });
          }
        });
        if (hasBirdFieldEdits) {
          if (!nextBird.tagId) throw new Error(`Tag ID is required for ${birdDisplayName(sourceBird)}.`);
          tableEditDateFields.forEach(fieldId => {
            if (!isDayLike(nextBird[fieldId])) throw new Error(`${fieldId} is invalid for ${birdDisplayName(sourceBird)}.`);
          });
          updatedById.set(birdId, nextBird);
        }
      }
      if (updatedById.size) {
        const plannedById = new Map(birds.map(bird => [bird.id, updatedById.get(bird.id) || bird]));
        const seenTags = new Map();
        plannedById.forEach((bird, birdId) => {
          const normalized = normalizeTagId(bird.tagId);
          if (!normalized) throw new Error(`Tag ID is required for ${birdDisplayName(bird)}.`);
          const existing = seenTags.get(normalized);
          if (existing && existing !== birdId) throw new Error(`Duplicate Tag ID found: ${bird.tagId}`);
          seenTags.set(normalized, birdId);
        });
      }
      if (!updatedById.size && !weightAdds.length) {
        setTableDraftById({});
        setTableMode("view");
        return;
      }
      updatedById.forEach(nextBird => onUpdate(nextBird));
      if (typeof onAddM === "function") {
        weightAdds.forEach(ms => onAddM(ms));
      }
      setTableDraftById({});
      setTableMode("view");
      const birdLabel = `${updatedById.size} bird record${updatedById.size === 1 ? "" : "s"}`;
      const weightLabel = `${weightAdds.length} weight entr${weightAdds.length === 1 ? "y" : "ies"}`;
      if (updatedById.size && weightAdds.length) {
        window.alert(`Saved ${birdLabel} and saved ${weightLabel} from table edits.`);
      } else if (updatedById.size) {
        window.alert(`Saved ${birdLabel} from table edits.`);
      } else {
        window.alert(`Saved ${weightLabel} from table edits.`);
      }
    } catch (err) {
      console.error(err);
      const msg = err?.message || "Could not save table edits.";
      setTableError(msg);
      window.alert(msg);
    } finally {
      setTableSaveBusy(false);
    }
  };
  function stepSel(offset) {
    if (!sel) return;
    const idx = navVisible.findIndex(v => v.id === sel.id);
    if (idx < 0) return;
    const nx = idx + offset;
    if (nx < 0 || nx >= navVisible.length) return;
    selectBird(navVisible[nx]);
    resetBirdForms();
    scrollPageTop();
  }
  function handleSwipeStart(e) {
    const t = e.target;
    if (t && t.closest && t.closest("input,select,textarea,button,label")) {
      swipeRef.current = {
        tracking: false,
        x: 0,
        y: 0
      };
      return;
    }
    const touch = e.touches && e.touches[0];
    if (!touch) {
      swipeRef.current = {
        tracking: false,
        x: 0,
        y: 0
      };
      return;
    }
    swipeRef.current = {
      tracking: true,
      x: touch.clientX,
      y: touch.clientY
    };
  }
  function handleSwipeMove(e) {
    const st = swipeRef.current;
    if (!st || !st.tracking) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - st.x;
    const dy = touch.clientY - st.y;
    if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) {
      swipeRef.current = {
        tracking: false,
        x: 0,
        y: 0
      };
    }
  }
  function handleSwipeEnd(e) {
    const st = swipeRef.current;
    swipeRef.current = {
      tracking: false,
      x: 0,
      y: 0
    };
    if (!st || !st.tracking) return;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - st.x;
    const dy = touch.clientY - st.y;
    if (Math.abs(dx) < 96) return;
    if (Math.abs(dy) > 42) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx < 0) stepSel(1);else stepSel(-1);
  }
  if (sel) {
    const sb = batchById.get(sel.originBatchId);
    const selBatchTheme = birdBatchTheme(sel, batchById);
    const selBatchLabel = birdBatchLabel(sel, batchById);
    const selBatchChip = birdBatchChipLabel(sel, batchById);
    const navScopePenName = navPenScopeId ? penById.get(navPenScopeId)?.name || "this pen" : "";
    const navIndex = navVisible.findIndex(v => v.id === sel.id);
    const hasPrev = navIndex > 0;
    const hasNext = navIndex >= 0 && navIndex < navVisible.length - 1;
    const activeTab = BIRD_TAB_SLIDES.find(t => t.id === tab) || BIRD_TAB_SLIDES[0];
    const theme = activeTab.color;
    const themeInp = {
      ...C.inp,
      background: "#f5f8fc",
      borderColor: theme + "66"
    };
    const themeSel = {
      ...C.sel,
      background: "#f5f8fc",
      borderColor: theme + "66"
    };
    const themeTa = {
      ...C.ta,
      background: "#f5f8fc",
      borderColor: theme + "66"
    };
    const themeBtn = {
      ...C.btn,
      marginTop: 14,
      background: theme,
      color: "#ffffff"
    };
    const canApplyInfoSuggestion = !!(infoSuggestion && infoForm && infoSuggestion.stage !== infoForm.stage);
    const showFloatingInfoSave = tab === "info" && infoDirty;
    const floatingInfoSaveBottom = showFloatingSummary ? 164 : 84;
    const recentPhotoFloatingTop = 16;
    const showRecentPhotoDock = !!latestSelPhoto;
    return React.createElement("div", {
      style: C.body
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "20px 0 14px"
      }
    }, React.createElement("button", {
      onClick: closeSelectedBird,
      style: {
        ...C.sec,
        padding: "10px 14px"
      }
    }, "\u2190 Back"), React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "#64748b"
      }
    }, "Bird Record")), React.createElement("div", {
      style: {
        background: "#ffffff",
        border: "1px solid #d9e3ef",
        borderRadius: 20,
        boxShadow: "0 18px 44px #0000001f",
        marginBottom: showFloatingInfoSave ? 258 : 184,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        touchAction: "pan-y"
      }
    }, React.createElement("div", {
      ref: summaryRef,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 18px",
        borderBottom: "1px solid #d9e3ef"
      }
    }, React.createElement("div", {
      style: {
        width: 44,
        height: 44,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: 22,
        background: selBatchTheme.bg,
        border: `1px solid ${selBatchTheme.border}`
      }
    }, "\uD83D\uDC14"), React.createElement("div", {
      style: {
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 900,
        color: "#0f172a"
      }
    }, birdDisplayName(sel)), birdDisplayTag(sel) && React.createElement("div", {
      style: {
        marginTop: 1,
        fontSize: 12,
        color: "#1d4ed8",
        fontWeight: 700
      }
    }, "Tag ", birdDisplayTag(sel)), React.createElement("div", {
      style: {
        fontSize: 14,
        color: "#475569"
      }
    }, sel.breed || "No breed", " \xB7 ", sel.sex)), React.createElement("div", {
      style: C.badge(sc(infoForm?.status || sel.status))
    }, infoForm?.status || sel.status), React.createElement("div", {
      style: {
        ...C.badge(selBatchTheme.color),
        background: selBatchTheme.bg,
        border: `1px solid ${selBatchTheme.border}`,
        color: "#0f172a"
      }
    }, selBatchChip), React.createElement("div", {
      ref: headerNavRef,
      style: {
        display: "flex",
        gap: 8,
        marginLeft: "auto"
      }
    }, React.createElement("button", {
      onClick: () => stepSel(-1),
      disabled: !hasPrev,
      style: {
        ...C.sec,
        padding: "10px 12px",
        opacity: hasPrev ? 1 : .45,
        cursor: hasPrev ? "pointer" : "default"
      }
    }, "\u2190"), React.createElement("button", {
      onClick: () => stepSel(1),
      disabled: !hasNext,
      style: {
        ...C.sec,
        padding: "10px 12px",
        opacity: hasNext ? 1 : .45,
        cursor: hasNext ? "pointer" : "default"
      }
    }, "\u2192"))), React.createElement("div", {
      style: {
        padding: 14
      },
      onTouchStart: handleSwipeStart,
      onTouchMove: handleSwipeMove,
      onTouchEnd: handleSwipeEnd
    }, React.createElement("div", {
      style: {
        textAlign: "center",
        fontSize: 12,
        color: "#475569",
        marginBottom: 12
      }
    }, navIndex >= 0 ? navPenScopeId ? `Bird ${navIndex + 1} of ${navVisible.length} in ${navScopePenName} · swipe left/right to switch` : `Bird ${navIndex + 1} of ${navVisible.length} · swipe left/right to switch` : navPenScopeId ? `This bird is outside ${navScopePenName}.` : "This bird is outside the current filter"), React.createElement("div", {
      style: {
        marginBottom: 12
      }
    }, React.createElement(AnimatedSlider, {
      options: STATUS_SLIDES,
      value: infoForm?.status || sel.status,
      onChange: st => setInfoForm(p => {
        const next = {
          ...(p || makeInfoForm(sel)),
          status: st
        };
        const dateField = STATUS_DATE_FIELDS[st];
        if (dateField && !next[dateField]) next[dateField] = today();
        return next;
      })
    })), infoForm && infoForm.status !== sel.status && React.createElement("div", {
      style: {
        marginTop: -4,
        marginBottom: 10,
        color: theme,
        fontSize: 13,
        fontWeight: 700
      }
    }, "Save Details to apply this status change."), React.createElement("div", {
      style: {
        marginBottom: 14
      }
    }, React.createElement(AnimatedSlider, {
      options: BIRD_TAB_SLIDES,
      value: tab,
      onChange: setTab
    })), React.createElement("div", {
      style: {
        background: theme + "14",
        border: `1px solid ${theme}66`,
        borderRadius: 15,
        padding: 14,
        transition: "all .25s ease"
      }
    }, tab === "info" && React.createElement("div", null, React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12
      }
    }, [{
      key: "stage",
      label: "Stage",
      value: stageLabel(infoForm?.stage || sel.stage)
    }, {
      key: "age",
      label: "Age",
      value: (infoForm?.hatchDate || sel.hatchDate) ? ageDays(infoForm?.hatchDate || sel.hatchDate) + "d" : "—"
    }, {
      key: "hatched",
      label: "Hatched",
      value: fmtDate(infoForm?.hatchDate || sel.hatchDate)
    }, {
      key: "nickname",
      label: "Nickname",
      value: (infoForm?.nickname || sel.nickname || "").trim() || "—"
    }, {
      key: "batch",
      label: "Batch",
      value: birdBatchLabel({
        ...sel,
        originBatchId: infoForm?.originBatchId || null,
        tagId: infoForm?.tagId || sel.tagId
      }, batchById) || "—"
    }, {
      key: "pen",
      label: "Pen",
      value: penById.get(infoForm?.penId || sel.penId)?.name || "—"
    }, ...lifecycleDetails].map(card => React.createElement("div", {
      key: card.key,
      style: {
        background: "#f5f8fc",
        border: "1px solid #d0dae7",
        borderRadius: 10,
        padding: "10px 11px"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#475569",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".05em"
      }
    }, card.label), React.createElement("div", {
      style: {
        fontSize: 17,
        color: "#1f2937",
        marginTop: 3,
        fontWeight: 700
      }
    }, card.value)))), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }
    }, React.createElement(FL, {
      lbl: "Tag ID *"
    }, React.createElement("input", {
      style: themeInp,
      value: infoForm?.tagId || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        tagId: e.target.value
      }))
    })), React.createElement(FL, {
      lbl: "Nickname"
    }, React.createElement("input", {
      style: themeInp,
      value: infoForm?.nickname || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        nickname: e.target.value
      })),
      placeholder: "Optional nickname"
    })), React.createElement(FL, {
      lbl: "Hatch Date"
    }, React.createElement("input", {
      style: themeInp,
      type: "date",
      value: infoForm?.hatchDate || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        hatchDate: e.target.value
      }))
    }))), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }
    }, React.createElement(FL, {
      lbl: "Breed"
    }, React.createElement("input", {
      style: themeInp,
      value: infoForm?.breed || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        breed: e.target.value
      }))
    })), React.createElement(FL, {
      lbl: "Sex"
    }, React.createElement("select", {
      style: themeSel,
      value: infoForm?.sex || "unknown",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        sex: e.target.value
      }))
    }, React.createElement("option", {
      value: "unknown"
    }, "unknown"), React.createElement("option", {
      value: "female"
    }, "female"), React.createElement("option", {
      value: "male"
    }, "male")))), React.createElement(FL, {
      lbl: "Linked Batch"
    }, React.createElement("select", {
      style: themeSel,
      value: infoForm?.originBatchId || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        originBatchId: e.target.value
      }))
    }, React.createElement("option", {
      value: ""
    }, "Manual / outsider"), batches.map(b => React.createElement("option", {
      key: b.id,
      value: b.id
    }, b.code, " · ", fmtDate(b.collectedDate)))), React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569",
        marginTop: 6
      }
    }, "Changing the batch link does not auto-rename the tag.")), React.createElement(FL, {
      lbl: "Current Pen"
    }, React.createElement("select", {
      style: themeSel,
      value: infoForm?.penId || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        penId: e.target.value
      }))
    }, React.createElement("option", {
      value: ""
    }, "No pen"), pens.map(pen => React.createElement("option", {
      key: pen.id,
      value: pen.id
    }, pen.name)))), React.createElement(FL, {
      lbl: "Update Stage"
    }, React.createElement("div", {
      style: {
        position: "relative"
      }
    }, canApplyInfoSuggestion && React.createElement("button", {
      type: "button",
      style: {
        ...C.sm,
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 1,
        color: theme,
        borderColor: theme + "55",
        background: "#ffffff"
      },
      onClick: () => confirmApplyStageSuggestion(sel, infoSuggestion)
    }, "Apply Suggestion"), canApplyInfoSuggestion && React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569",
        fontWeight: 700,
        marginBottom: 6,
        paddingRight: 148
      }
    }, "Suggested: ", stageLabel(infoSuggestion.stage)), React.createElement(StagePicker, {
      value: infoForm?.stage || sel.stage,
      accent: theme,
      options: STAGES_BIRD_INFO,
      onChange: stage => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        stage
      }))
    }), canApplyInfoSuggestion && React.createElement("div", {
      style: {
        marginTop: 6,
        fontSize: 12,
        color: "#64748b",
        lineHeight: 1.35
      }
    }, infoSuggestion.reason))), (infoForm?.status || sel.status) === "sold" && React.createElement("div", {
      style: {
        marginTop: 4,
        marginBottom: 2,
        border: `1px solid ${theme}33`,
        background: "#ffffff",
        borderRadius: 12,
        padding: 12
      }
    }, React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        marginBottom: 10
      }
    }, "Sale Details"), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }
    }, React.createElement(FL, {
      lbl: "Sold Date"
    }, React.createElement("input", {
      style: themeInp,
      type: "date",
      value: infoForm?.soldDate || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        soldDate: e.target.value
      }))
    })), React.createElement(FL, {
      lbl: "Buyer"
    }, React.createElement("input", {
      style: themeInp,
      value: infoForm?.buyerName || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        buyerName: e.target.value
      })),
      placeholder: "Buyer name"
    }))), React.createElement(FL, {
      lbl: "Sale Price"
    }, React.createElement("input", {
      style: themeInp,
      type: "number",
      inputMode: "decimal",
      step: "0.01",
      value: infoForm?.salePrice || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        salePrice: e.target.value
      })),
      placeholder: "0.00"
    }))), (infoForm?.status || sel.status) === "deceased" && React.createElement("div", {
      style: {
        marginTop: 4,
        marginBottom: 2,
        border: `1px solid ${theme}33`,
        background: "#ffffff",
        borderRadius: 12,
        padding: 12
      }
    }, React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        marginBottom: 10
      }
    }, "Mortality Details"), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }
    }, React.createElement(FL, {
      lbl: "Death Date"
    }, React.createElement("input", {
      style: themeInp,
      type: "date",
      value: infoForm?.deceasedDate || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        deceasedDate: e.target.value
      }))
    })), React.createElement(FL, {
      lbl: "Cause"
    }, React.createElement("input", {
      style: themeInp,
      value: infoForm?.causeOfDeath || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        causeOfDeath: e.target.value
      })),
      placeholder: "Cause of death"
    })))), (infoForm?.status || sel.status) === "culled" && React.createElement("div", {
      style: {
        marginTop: 4,
        marginBottom: 2,
        border: `1px solid ${theme}33`,
        background: "#ffffff",
        borderRadius: 12,
        padding: 12
      }
    }, React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        marginBottom: 10
      }
    }, "Cull Details"), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }
    }, React.createElement(FL, {
      lbl: "Cull Date"
    }, React.createElement("input", {
      style: themeInp,
      type: "date",
      value: infoForm?.culledDate || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        culledDate: e.target.value
      }))
    })), React.createElement(FL, {
      lbl: "Reason"
    }, React.createElement("input", {
      style: themeInp,
      value: infoForm?.cullReason || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        cullReason: e.target.value
      })),
      placeholder: "Cull reason"
    })))), React.createElement(FL, {
      lbl: "Notes"
    }, React.createElement("textarea", {
      style: themeTa,
      value: infoForm?.notes || "",
      onChange: e => setInfoForm(p => ({
        ...(p || makeInfoForm(sel)),
        notes: e.target.value
      })),
      placeholder: "Bird notes..."
    })), infoTagConflict && React.createElement("div", {
      style: {
        marginTop: 10,
        color: "#b91c1c",
        fontSize: 13,
        fontWeight: 700
      }
    }, "Tag ID already exists on another bird."), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginTop: 14
      }
    }, React.createElement("button", {
      style: {
        ...C.sec,
        padding: "12px 14px",
        opacity: infoDirty ? 1 : .55
      },
      onClick: () => setInfoForm(makeInfoForm(sel)),
      disabled: !infoDirty
    }, "Reset"), React.createElement("button", {
      style: {
        ...themeBtn,
        marginTop: 0,
        padding: "12px 16px",
        opacity: infoDirty && !infoTagConflict ? 1 : .65,
        cursor: infoDirty && !infoTagConflict ? "pointer" : "default"
      },
      onClick: saveBirdInfo,
      disabled: !infoDirty || !!infoTagConflict
    }, "Save Details"))), tab === "timeline" && React.createElement("div", null, !timelineItems.length && React.createElement(Empty, {
      icon: "\uD83D\uDCDC",
      msg: "No bird history yet"
    }), timelineItems.map(item => React.createElement("div", {
      key: item.id,
      style: {
        ...C.card,
        borderColor: item.color + "44",
        background: item.color + "10",
        marginBottom: 10
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        gap: 12,
        alignItems: "flex-start"
      }
    }, React.createElement("div", {
      style: {
        width: 34,
        textAlign: "center",
        fontSize: 22,
        lineHeight: 1.2,
        flexShrink: 0
      }
    }, item.icon), React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, item.title), React.createElement("div", {
      style: {
        color: item.color,
        fontSize: 13,
        fontWeight: 700,
        marginTop: 3
      }
    }, String(item.when || "").length <= 10 ? fmtDate(item.when) : fmtDateTime(item.when)), item.detail && React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 14,
        marginTop: 4,
        lineHeight: 1.45
      }
    }, item.detail)), item.thumb && React.createElement("img", {
      src: item.thumb,
      alt: "",
      style: {
        width: 52,
        height: 52,
        borderRadius: 10,
        objectFit: "cover",
        flexShrink: 0
      }
    }))))), tab === "photos" && React.createElement(PhotosTab, {
      birdId: sel.id,
      photos: selPhotos,
      onAdd: onAddPhoto,
      onDel: onDelPhoto,
      accent: theme
    }), tab === "measurements" && React.createElement("div", null, React.createElement("div", {
      style: C.card
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: "#0f172a",
        marginBottom: 6
      }
    }, "Add Measurement"), React.createElement(FL, {
      lbl: "Metric"
    }, React.createElement(AnimatedSlider, {
      options: measurementMetricSlides,
      value: mf.metricType,
      onChange: metricType => setMf(prev => ({
        ...prev,
        metricType
      }))
    })), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 10
      }
    }, React.createElement(FL, {
      lbl: "Value"
    }, React.createElement("input", {
      style: themeInp,
      type: "number",
      value: mf.value,
      onChange: e => setMf({
        ...mf,
        value: e.target.value
      }),
      step: "0.01"
    })), React.createElement(FL, {
      lbl: "Unit"
    }, measurementUnitSlides.length ? React.createElement(AnimatedSlider, {
      options: measurementUnitSlides,
      value: measurementUnitSlides.some(unit => unit.id === mf.unit) ? mf.unit : measurementUnitSlides[0].id,
      onChange: unit => setMf(prev => ({
        ...prev,
        unit
      }))
    }) : React.createElement("input", {
      style: themeInp,
      value: mf.unit,
      placeholder: "custom",
      onChange: e => setMf({
        ...mf,
        unit: e.target.value
      })
    }))), React.createElement(FL, {
      lbl: "Date"
    }, React.createElement("input", {
      style: themeInp,
      type: "date",
      value: mf.measuredAt,
      onChange: e => setMf({
        ...mf,
        measuredAt: e.target.value
      })
    })), React.createElement("button", {
      style: themeBtn,
      onClick: () => {
        if (!mf.value) return;
        const nowIso = new Date().toISOString();
        if (mf.metricType === "weight") {
          const day = birdMeasurementDayKey(mf.measuredAt || todayWeightDay) || todayWeightDay;
          const existingWeight = weightByBirdDay.get(`${sel.id}::${day}`) || null;
          if (existingWeight && !window.confirm(`Weight already exists for ${fmtDate(day)}. Saving will edit that weight entry.`)) return;
          onAddM({
            id: existingWeight?.id || uid(),
            birdId: sel.id,
            ...mf,
            metricType: "weight",
            measuredAt: day,
            value: +mf.value,
            ageDays: ageDays(sel.hatchDate),
            notes: (mf.notes || "").trim() || existingWeight?.notes || "",
            createdAt: existingWeight?.createdAt || nowIso,
            modifiedAt: nowIso
          });
          setMf(freshMf());
          return;
        }
        onAddM({
          id: uid(),
          birdId: sel.id,
          ...mf,
          value: +mf.value,
          ageDays: ageDays(sel.hatchDate),
          createdAt: nowIso,
          modifiedAt: nowIso
        });
        setMf(freshMf());
      }
    }, "Save")), !bms.length && React.createElement(Empty, {
      icon: "\uD83D\uDCCF",
      msg: "No measurements yet"
    }), bmsDesc.map(m => React.createElement("div", {
      key: m.id,
      style: C.card
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between"
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: "#0f172a"
      }
    }, m.metricType), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 13
      }
    }, fmtDate(m.measuredAt), m.ageDays != null ? ` · ${m.ageDays}d` : "")), React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 900,
        color: theme
      }
    }, m.metricType === "weight" ? fmtNum(weightAmountToGrams(m.value, m.unit) ?? Number(m.value)) : m.value, " ", React.createElement("span", {
      style: {
        fontSize: 13,
        color: "#475569"
      }
    }, m.metricType === "weight" ? "g" : m.unit)))))), tab === "health" && React.createElement("div", null, React.createElement("div", {
      style: C.card
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: "#0f172a",
        marginBottom: 6
      }
    }, "Log Event"), React.createElement(FL, {
      lbl: "Type"
    }, React.createElement("select", {
      style: themeSel,
      value: hf.eventType,
      onChange: e => setHf({
        ...hf,
        eventType: e.target.value
      })
    }, HEALTHS.map(h => React.createElement("option", {
      key: h,
      value: h
    }, h)))), React.createElement(FL, {
      lbl: "Date"
    }, React.createElement("input", {
      style: themeInp,
      type: "date",
      value: hf.eventDate,
      onChange: e => setHf({
        ...hf,
        eventDate: e.target.value
      })
    })), React.createElement(FL, {
      lbl: "Details *"
    }, React.createElement("textarea", {
      style: themeTa,
      value: hf.details,
      onChange: e => setHf({
        ...hf,
        details: e.target.value
      }),
      placeholder: "Describe the event..."
    })), React.createElement(FL, {
      lbl: "Medication"
    }, React.createElement("input", {
      style: themeInp,
      value: hf.medication,
      onChange: e => setHf({
        ...hf,
        medication: e.target.value
      })
    })), React.createElement(FL, {
      lbl: "Outcome"
    }, React.createElement("input", {
      style: themeInp,
      value: hf.outcome,
      onChange: e => setHf({
        ...hf,
        outcome: e.target.value
      })
    })), React.createElement("button", {
      style: themeBtn,
      onClick: () => {
        if (!hf.details) return;
        onAddH({
          id: uid(),
          birdId: sel.id,
          ...hf
        });
        setHf(freshHf());
      }
    }, "Save")), !bhs.length && React.createElement(Empty, {
      icon: "\uD83E\uDE7A",
      msg: "No health events yet"
    }), bhs.map(h => React.createElement("div", {
      key: h.id,
      style: C.card
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: "#0f172a"
      }
    }, h.eventType), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 13
      }
    }, fmtDate(h.eventDate))), React.createElement("div", {
      style: {
        color: "#475569",
        marginTop: 5,
        fontSize: 14
      }
    }, h.details), h.medication && React.createElement("div", {
      style: {
        marginTop: 5,
        fontSize: 13
      }
    }, React.createElement("span", {
      style: {
        color: "#475569"
      }
    }, "Med: "), React.createElement("span", {
      style: {
        color: "#1f2937"
      }
    }, h.medication)), h.outcome && React.createElement("div", {
      style: {
        marginTop: 4,
        fontSize: 13
      }
    }, React.createElement("span", {
      style: {
        color: "#475569"
      }
    }, "Outcome: "), React.createElement("span", {
      style: {
        color: theme
      }
    }, h.outcome))))), tab === "chart" && React.createElement("div", null, React.createElement("div", {
      style: C.card
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: "#0f172a",
        marginBottom: 12
      }
    }, "\uD83D\uDCC8 Weight Growth"), React.createElement(MiniChart, {
      data: wt
    })), React.createElement("div", {
      style: {
        ...C.card,
        marginTop: 0
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 10
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, "\uD83E\uDD63 30-Day Feed Intake"), React.createElement("div", {
      style: {
        marginTop: 4,
        color: "#475569",
        fontSize: 13,
        lineHeight: 1.4
      }
    }, "Estimated from pen feed logs while this bird was assigned to each pen.")), React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 900,
        color: theme
      }
    }, feed30.totalKg ? `${fmtNum(feed30.totalKg)} kg` : "\u2014"), React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#64748b",
        marginTop: 2
      }
    }, feed30.totalKg ? `${fmtNum(feed30.avgKgPerDay)} kg/day average` : "No feed yet"))), !feed30.totalKg && React.createElement(Empty, {
      icon: "\uD83E\uDD63",
      msg: "No 30-day feed data for this bird yet"
    }), !!feed30.totalKg && React.createElement(React.Fragment, null, React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 12
      }
    }, feed30.legend.map(item => React.createElement("div", {
      key: item.id,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        background: item.theme.soft,
        border: `1px solid ${item.theme.border}`,
        color: item.theme.color,
        fontSize: 12,
        fontWeight: 800
      }
    }, React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: item.theme.color
      }
    }), item.label, " ", React.createElement("span", {
      style: {
        color: "#475569",
        fontWeight: 700
      }
    }, fmtNum(item.totalKg), " kg")))), React.createElement("div", {
      style: {
        overflowX: "auto",
        paddingBottom: 6
      }
    }, React.createElement("div", {
      style: {
        minWidth: 660,
        display: "grid",
        gridTemplateColumns: `repeat(${feed30.days.length || 30}, minmax(0,1fr))`,
        gap: 6,
        alignItems: "end"
      }
    }, feed30.days.map(day => React.createElement("div", {
      key: day.id,
      style: {
        minWidth: 0
      }
    }, React.createElement("div", {
      style: {
        height: 134,
        display: "flex",
        alignItems: "flex-end"
      }
    }, React.createElement("div", {
      title: `${fmtDate(day.day)} \u00b7 ${fmtNum(day.totalKg)} kg`,
      style: {
        width: "100%",
        minHeight: day.totalKg > 0 ? 8 : 4,
        height: day.totalKg > 0 && feed30MaxKg > 0 ? `${Math.max(8, day.totalKg / feed30MaxKg * 100)}%` : "4px",
        borderRadius: "10px 10px 4px 4px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: day.totalKg > 0 ? "#e2e8f0" : "#f1f5f9",
        border: "1px solid #d9e3ef"
      }
    }, day.stacks.map(stack => React.createElement("div", {
      key: `${day.id}-${stack.id}`,
      style: {
        flex: stack.value,
        background: stack.color
      }
    })))), React.createElement("div", {
      style: {
        marginTop: 6,
        minHeight: 28,
        fontSize: 10,
        color: "#64748b",
        textAlign: "center",
        lineHeight: 1.2
      }
    }, day.axisLabel || "\u00a0"))))), (feed30.skippedSackLogs > 0 || feed30.skippedUnknownLogs > 0) && React.createElement("div", {
      style: {
        marginTop: 12,
        color: "#7c2d12",
        fontSize: 13,
        lineHeight: 1.4
      }
    }, feed30.skippedSackLogs > 0 ? `${feed30.skippedSackLogs} sack logs were skipped because kg per sack was missing.` : "", feed30.skippedSackLogs > 0 && feed30.skippedUnknownLogs > 0 ? " " : "", feed30.skippedUnknownLogs > 0 ? `${feed30.skippedUnknownLogs} feed logs used units that could not be converted to kg.` : ""))))), React.createElement("div", {
      style: {
        padding: 14,
        borderTop: "1px solid #d9e3ef",
        display: "grid",
        gridTemplateColumns: "1fr 1.4fr",
        gap: 10
      }
    }, React.createElement("button", {
      style: C.del,
      onClick: () => {
        Promise.resolve(onDelete(sel.id)).catch(err => {
          console.error(err);
          window.alert("Could not delete this bird. Please try again.");
        });
        closeSelectedBird();
      }
    }, "Delete Bird"), React.createElement("button", {
      style: {
        ...C.btn,
        marginTop: 0,
        background: theme,
        color: "#ffffff",
        padding: "12px 16px"
      },
      onClick: closeSelectedBird
    }, "Done")))), showFloatingSummary && React.createElement("div", {
      style: {
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 84,
        background: "#fffffff2",
        backdropFilter: "blur(10px)",
        border: "1px solid #d9e3ef",
        borderRadius: 18,
        boxShadow: "0 16px 40px #00000024",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 82
      }
    }, React.createElement("div", {
      style: {
        width: 42,
        height: 42,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: 21,
        background: selBatchTheme.bg,
        border: `1px solid ${selBatchTheme.border}`,
        flexShrink: 0
      }
    }, "\uD83D\uDC14"), React.createElement("div", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 900,
        color: "#0f172a",
        lineHeight: 1.1
      }
    }, birdDisplayName(sel)), birdDisplayTag(sel) && React.createElement("div", {
      style: {
        marginTop: 1,
        fontSize: 11,
        color: "#1d4ed8",
        fontWeight: 700
      }
    }, "Tag ", birdDisplayTag(sel)), React.createElement("div", {
      style: {
        fontSize: 13,
        color: "#475569",
        marginTop: 3,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, sel.breed || "No breed", " \xB7 ", sel.sex)), React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        flexShrink: 0
      }
    }, React.createElement("div", {
      style: C.badge(sc(infoForm?.status || sel.status))
    }, infoForm?.status || sel.status), React.createElement("div", {
      style: {
        ...C.badge(selBatchTheme.color),
        background: selBatchTheme.bg,
        border: `1px solid ${selBatchTheme.border}`,
        color: "#0f172a"
      }
    }, selBatchChip))), showFloatingInfoSave && React.createElement("div", {
      style: {
        position: "fixed",
        left: 12,
        right: 12,
        bottom: floatingInfoSaveBottom,
        background: "#fffffff2",
        backdropFilter: "blur(10px)",
        border: "1px solid #d9e3ef",
        borderRadius: 18,
        boxShadow: "0 14px 34px #00000020",
        padding: 10,
        zIndex: 83
      }
    }, React.createElement("button", {
      type: "button",
      style: {
        ...themeBtn,
        marginTop: 0,
        width: "100%",
        padding: "12px 16px",
        opacity: infoTagConflict ? .65 : 1,
        cursor: infoTagConflict ? "default" : "pointer"
      },
      onClick: saveBirdInfo,
      disabled: !!infoTagConflict
    }, infoTagConflict ? "Fix Tag ID to Save" : "Save Details")), showRecentPhotoDock && recentPhotoCollapsed && React.createElement("button", {
      type: "button",
      onClick: () => setRecentPhotoCollapsed(false),
      title: "Show latest photo",
      "aria-label": "Show latest photo",
      style: {
        ...C.sec,
        position: "fixed",
        top: recentPhotoFloatingTop,
        right: 12,
        width: 48,
        minHeight: 0,
        padding: "10px 8px",
        borderRadius: 18,
        background: "#fffffff2",
        backdropFilter: "blur(10px)",
        boxShadow: "0 12px 30px #00000020",
        zIndex: 84,
        display: "grid",
        gap: 4,
        justifyItems: "center"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 18,
        lineHeight: 1
      }
    }, "\uD83D\uDCF8"), React.createElement("div", {
      style: {
        fontSize: 12,
        lineHeight: 1,
        fontWeight: 900,
        color: "#475569"
      }
    }, "\u2039")), showRecentPhotoDock && !recentPhotoCollapsed && React.createElement("div", {
      style: {
        position: "fixed",
        top: recentPhotoFloatingTop,
        right: 12,
        width: 126,
        borderRadius: 20,
        background: "#fffffff2",
        backdropFilter: "blur(12px)",
        border: "1px solid #d9e3ef",
        boxShadow: "0 16px 36px #00000022",
        padding: 8,
        zIndex: 84
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 8
      }
    }, React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#64748b",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: ".06em"
      }
    }, "Latest photo"), React.createElement("button", {
      type: "button",
      onClick: () => setRecentPhotoCollapsed(true),
      title: "Collapse latest photo",
      "aria-label": "Collapse latest photo",
      style: {
        border: "1px solid #d9e3ef",
        background: "#ffffff",
        color: "#475569",
        width: 28,
        height: 28,
        borderRadius: 999,
        padding: 0,
        display: "grid",
        placeItems: "center",
        cursor: "pointer"
      }
    }, "\u203A")), React.createElement("button", {
      type: "button",
      onClick: () => openPhotoPreview(latestSelPhoto, `${birdDisplayName(sel)} latest photo`),
      title: "Open latest photo",
      "aria-label": "Open latest photo",
      style: {
        display: "block",
        width: "100%",
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "zoom-in"
      }
    }, React.createElement("img", {
      src: latestSelPhoto.dataUrl,
      alt: `${birdDisplayName(sel)} latest photo`,
      style: {
        width: "100%",
        aspectRatio: "1 / 1",
        objectFit: "cover",
        borderRadius: 16,
        display: "block",
        boxShadow: "0 8px 24px #0f172a1c"
      }
    })), React.createElement("div", {
      style: {
        marginTop: 8,
        fontSize: 11,
        color: "#475569",
        lineHeight: 1.35
      }
    }, latestSelPhoto.takenAt ? fmtDateTime(latestSelPhoto.takenAt) : "Tap to enlarge")), showFloatingNav && hasPrev && React.createElement("button", {
      onClick: () => stepSel(-1),
      style: {
        ...C.sec,
        position: "fixed",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        width: 50,
        height: 50,
        borderRadius: "50%",
        padding: 0,
        display: "grid",
        placeItems: "center",
        background: "#fffffff2",
        backdropFilter: "blur(8px)",
        boxShadow: "0 12px 28px #0000002a",
        zIndex: 85
      }
    }, "\u2190"), showFloatingNav && hasNext && React.createElement("button", {
      onClick: () => stepSel(1),
      style: {
        ...C.sec,
        position: "fixed",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
        width: 50,
        height: 50,
        borderRadius: "50%",
        padding: 0,
        display: "grid",
        placeItems: "center",
        background: "#fffffff2",
        backdropFilter: "blur(8px)",
        boxShadow: "0 12px 28px #0000002a",
        zIndex: 85
      }
    }, "\u2192"));
  }
  if (detailOnly) {
    return React.createElement("div", {
      style: C.body
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "20px 0 14px"
      }
    }, React.createElement("button", {
      onClick: closeSelectedBird,
      style: {
        ...C.sec,
        padding: "10px 14px"
      }
    }, "\u2190 Back"), React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "#64748b"
      }
    }, "Bird Record")), React.createElement("div", {
      style: {
        ...C.card,
        borderColor: "#dbeafe",
        background: "#eff6ff"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, openBirdId ? "Bird record unavailable" : "Opening bird record..."), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 14,
        lineHeight: 1.45,
        marginTop: 6
      }
    }, openBirdId ? "This bird could not be found. It may have been deleted or archived." : "Loading the selected bird.")));
  }
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
  }, "\uD83D\uDC13 Flock"), React.createElement("button", {
    style: {
      ...C.btn,
      width: "auto",
      marginTop: 0,
      padding: "12px 20px"
    },
    onClick: openAddBirdForm
  }, "+ Add")), React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, React.createElement(AnimatedSlider, {
    options: FLOCK_LAYOUT_SLIDES,
    value: flockLayout,
    onChange: handleLayoutChange
  })), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      marginBottom: 12,
      background: "#ffffff",
      border: "1px solid #d9e3ef",
      borderRadius: 14,
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      overflowX: "visible"
    }
  }, filterButtons.map(filterButton => {
    const isActivePanel = activeFilterPanel === filterButton.id;
    return React.createElement("button", {
      key: filterButton.id,
      type: "button",
      onClick: () => setActiveFilterPanel(filterButton.id),
      style: {
        border: isActivePanel ? "2px solid #ffffff" : "1px solid #ffffffaa",
        background: filterButton.color,
        color: "#ffffff",
        borderRadius: 11,
        padding: "8px 10px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: isActivePanel ? "0 6px 14px #00000033" : "0 2px 6px #0000001f",
        textAlign: "left"
      }
    }, `${filterButton.label}: ${filterButton.value}`);
  })), React.createElement("div", null, activeFilterPanel === "status" && React.createElement(FL, {
    lbl: "Status"
  }, React.createElement(AnimatedSlider, {
    options: FLOCK_STATUS_FILTER_SLIDES,
    value: statusFilter,
    onChange: setStatusFilter
  })), activeFilterPanel === "stage" && React.createElement(FL, {
    lbl: "Stage"
  }, React.createElement(AnimatedSlider, {
    options: stageFilterSlides,
    value: stageFilter,
    onChange: setStageFilter
  })), activeFilterPanel === "sex" && React.createElement(FL, {
    lbl: "Sex"
  }, React.createElement(AnimatedSlider, {
    options: FLOCK_SEX_FILTER_SLIDES,
    value: sexFilter,
    onChange: setSexFilter
  })), activeFilterPanel === "sort" && React.createElement(FL, {
    lbl: "Sort"
  }, React.createElement(AnimatedSlider, {
    options: FLOCK_SORT_FILTER_SLIDES,
    value: sortBy,
    onChange: setSortBy
  }))), React.createElement(FL, {
    lbl: "Batch"
  }, React.createElement("select", {
    style: C.sel,
    value: batchFilter,
    onChange: e => setBatchFilter(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "all batches"), batchOptions.map(opt => React.createElement("option", {
    key: opt.id,
    value: opt.id
  }, opt.label)))), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      fontWeight: 700
    }
  }, "Showing ", visible.length, " of ", birds.length, " birds")), !visible.length && React.createElement(Empty, {
    icon: "\uD83D\uDC23",
    msg: "No birds match the current filters"
  }), flockLayout === "cards" && visible.map(b => {
    const lw = latestWeightByBird.get(b.id);
    const sb = batchById.get(b.originBatchId);
    const bBatchTheme = birdBatchTheme(b, batchById);
    const bBatchLabel = birdBatchChipLabel(b, batchById);
    const penName = b.penId ? penById.get(b.penId)?.name || "Unknown pen" : "";
    const thumb = latestPhotoWithImage(photoCache[b.id]);
    const statusColor = sc(b.status || "active");
    const isBookmarked = !!b.bookmarked;
    const statusCardBg = `${statusColor}1a`;
    const statusCardBorder = `${statusColor}66`;
    const displayName = birdDisplayName(b);
    const displayTag = birdDisplayTag(b);
    return React.createElement("div", {
      key: b.id,
      style: {
        ...C.card,
        background: statusCardBg,
        borderColor: statusCardBorder,
        cursor: "pointer"
      },
      onClick: () => {
        setNavPenScopeId("");
        selectBird(b);
        setTab("info");
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        alignItems: "flex-start"
      }
    }, thumb && React.createElement("img", {
      src: thumb.dataUrl,
      alt: "",
      onClick: event => {
        event.stopPropagation();
        openPhotoPreview(thumb, birdDisplayName(b));
      },
      style: {
        width: 52,
        height: 52,
        borderRadius: 10,
        objectFit: "cover",
        flexShrink: 0,
        cursor: "zoom-in"
      }
    }), React.createElement("div", {
      style: {
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 7
      }
    }, React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, displayName), displayTag && React.createElement("span", {
      style: {
        ...C.badge("#1d4ed8"),
        background: "#eff6ff",
        color: "#1d4ed8",
        border: "1px solid #bfdbfe"
      }
    }, "Tag ", displayTag), React.createElement("div", {
      style: C.badge(statusColor)
    }, b.status || "active"), isBookmarked && React.createElement("span", {
      style: {
        ...C.badge("#a16207"),
        background: "#fef3c7",
        color: "#713f12",
        border: "1px solid #eab308"
      }
    }, "Bookmarked")), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 14,
        marginTop: 2
      }
    }, b.breed || "No breed", " \xB7 ", b.sex), React.createElement("div", {
      style: {
        marginTop: 5,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6
      }
    }, React.createElement("span", {
      style: {
        ...C.badge(bBatchTheme.color),
        color: "#0f172a",
        background: bBatchTheme.bg,
        border: `1px solid ${bBatchTheme.border}`
      }
    }, bBatchLabel), sb && React.createElement("span", {
      style: {
        color: "#475569",
        fontSize: 13
      }
    }, "from eggs"), penName && React.createElement("span", {
      style: {
        ...C.badge("#1d4ed8"),
        background: "#e8f0ff",
        color: "#0f172a"
      }
    }, penName))), React.createElement("div", {
      style: {
        textAlign: "right",
        flexShrink: 0
      }
    }, React.createElement("button", {
      type: "button",
      style: bookmarkButtonStyle(isBookmarked, {
        ...C.sm,
        padding: "6px 9px",
        marginBottom: 4
      }),
      onClick: e => {
        e.stopPropagation();
        toggleBirdBookmark(b);
      }
    }, bookmarkButtonTheme(isBookmarked).icon), React.createElement(StageSprite, {
      stage: b.stage,
      size: 52
    }), b.hatchDate && React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569",
        marginTop: 4
      }
    }, ageDays(b.hatchDate), "d"), lw && React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: "#b45309",
        marginTop: 4
      }
    }, formatBirdWeightDisplay(lw.value, lw.unit)))));
  }), flockLayout === "table" && !!visible.length && React.createElement("div", {
    style: {
      ...C.card,
      padding: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "Birds Table"), React.createElement("button", {
    type: "button",
    style: {
      ...C.sec,
      marginTop: 0,
      width: "auto",
      padding: "8px 10px",
      fontSize: 12
    },
    onClick: () => setShowTableColumns(true)
  }, "Columns")), React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, React.createElement(AnimatedSlider, {
    options: BIRD_TABLE_MODE_SLIDES,
    value: tableMode,
    onChange: handleTableModeChange
  })), React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, React.createElement(AnimatedSlider, {
    options: BIRD_TABLE_PRESET_SLIDES,
    value: tablePreset,
    onChange: applyTablePreset
  })), tableMode === "edit" && React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginTop: 10
    }
  }, React.createElement("button", {
    type: "button",
    style: {
      ...C.sec,
      marginTop: 0,
      padding: "10px 10px"
    },
    onClick: () => discardTableEdits(true),
    disabled: !tableHasDraftEdits || tableSaveBusy
  }, "Discard"), React.createElement("button", {
    type: "button",
    style: {
      ...C.btn,
      marginTop: 0,
      padding: "10px 10px",
      opacity: tableHasDraftEdits && !tableSaveBusy ? 1 : .65,
      cursor: tableHasDraftEdits && !tableSaveBusy ? "pointer" : "default"
    },
    onClick: saveTableEdits,
    disabled: !tableHasDraftEdits || tableSaveBusy
  }, tableSaveBusy ? "Saving..." : `Save ${tableDraftCount}`)), tableError && React.createElement("div", {
    style: {
      marginTop: 8,
      color: "#b91c1c",
      fontSize: 12,
      lineHeight: 1.4
    }
  }, tableError), React.createElement("div", {
    style: {
      marginTop: 10,
      border: "1px solid #d9e3ef",
      borderRadius: 12,
      overflowX: "auto",
      WebkitOverflowScrolling: "touch"
    }
  }, React.createElement("table", {
    style: {
      borderCollapse: "separate",
      borderSpacing: 0,
      minWidth: 220 + activeTableColumns.length * 132
    }
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    style: {
      position: "sticky",
      left: 0,
      zIndex: 3,
      background: "#f8fafc",
      borderBottom: "1px solid #d9e3ef",
      borderRight: "1px solid #e2e8f0",
      padding: "9px 10px",
      textAlign: "left",
      fontSize: 12,
      color: "#334155",
      minWidth: 220
    }
  }, "Bird"), activeTableColumns.map(col => React.createElement("th", {
    key: `table-head-${col.id}`,
    style: {
      background: "#f8fafc",
      borderBottom: "1px solid #d9e3ef",
      borderRight: "1px solid #f1f5f9",
      padding: "9px 10px",
      textAlign: "left",
      fontSize: 12,
      color: "#334155",
      minWidth: 132
    }
  }, col.label)))), React.createElement("tbody", null, tableVisible.map((bird, rowIdx) => {
    const bookmarked = !!bird.bookmarked;
    const thumb = latestPhotoWithImage(photoCache[bird.id]);
    const birdName = birdDisplayName(bird);
    const birdTag = birdDisplayTag(bird);
    const rowBg = bookmarked ? "#fffdf0" : rowIdx % 2 ? "#ffffff" : "#fcfdff";
    const birdCell = React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 10
      }
    }, thumb && React.createElement("button", {
      type: "button",
      onClick: () => openPhotoPreview(thumb, birdName),
      title: `Open latest photo for ${birdName}`,
      "aria-label": `Open latest photo for ${birdName}`,
      style: {
        padding: 0,
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        background: "#ffffff",
        width: 58,
        minWidth: 58,
        height: 58,
        overflow: "hidden",
        cursor: "zoom-in",
        flexShrink: 0,
        boxShadow: "0 4px 10px #0f172a14"
      }
    }, React.createElement("img", {
      src: thumb.dataUrl,
      alt: `${birdName} latest photo`,
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block"
      }
    })), React.createElement("div", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, birdName), birdTag && React.createElement("div", {
      style: {
        marginTop: 2,
        fontSize: 11,
        fontWeight: 700,
        color: "#1d4ed8"
      }
    }, "Tag ", birdTag), thumb && React.createElement("div", {
      style: {
        marginTop: 3,
        fontSize: 10,
        fontWeight: 700,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: ".04em"
      }
    }, "Latest photo"), React.createElement("div", {
      style: {
        marginTop: 6
      }
    }, React.createElement("button", {
      type: "button",
      style: {
        ...C.sm,
        marginTop: 0,
        padding: "6px 8px",
        fontSize: 11
      },
      onClick: () => openBirdFromTable(bird)
    }, "Open"))));
    return React.createElement("tr", {
      key: `table-row-${bird.id}`,
      style: {
        background: rowBg
      }
    }, React.createElement("td", {
      style: {
        position: "sticky",
        left: 0,
        zIndex: 2,
        background: rowBg,
        borderBottom: "1px solid #eef2f7",
        borderRight: "1px solid #e2e8f0",
        padding: "8px 10px",
        verticalAlign: "top",
        minWidth: 220
      }
    }, birdCell), activeTableColumns.map(col => {
      const rawValue = tableFieldValue(bird, col.id, true);
      const editable = tableMode === "edit" && col.editable;
      return React.createElement("td", {
        key: `table-cell-${bird.id}-${col.id}`,
        style: {
          borderBottom: "1px solid #eef2f7",
          borderRight: "1px solid #f8fafc",
          padding: "7px 8px",
          verticalAlign: "top",
          minWidth: 132
        }
      }, editable && col.type === "stage" && React.createElement("select", {
        style: {
          ...C.sel,
          margin: 0,
          fontSize: 12,
          padding: "6px 7px",
          minHeight: 34
        },
        value: rawValue || "chick",
        onChange: e => setTableFieldValue(bird, col.id, e.target.value)
      }, STAGES_BIRD_INFO.map(stage => React.createElement("option", {
        key: `stage-opt-${stage}`,
        value: stage
      }, stageLabel(stage)))), editable && col.type === "sex" && React.createElement("select", {
        style: {
          ...C.sel,
          margin: 0,
          fontSize: 12,
          padding: "6px 7px",
          minHeight: 34
        },
        value: rawValue || "unknown",
        onChange: e => setTableFieldValue(bird, col.id, e.target.value)
      }, ["unknown", "female", "male"].map(sex => React.createElement("option", {
        key: `sex-opt-${sex}`,
        value: sex
      }, sex))), editable && col.type === "date" && React.createElement("input", {
        type: "date",
        style: {
          ...C.inp,
          margin: 0,
          fontSize: 12,
          padding: "6px 7px",
          minHeight: 34
        },
        value: rawValue || "",
        onChange: e => setTableFieldValue(bird, col.id, e.target.value)
      }), editable && col.type === "number" && React.createElement("input", {
        type: "number",
        inputMode: "decimal",
        step: "0.01",
        style: {
          ...C.inp,
          margin: 0,
          fontSize: 12,
          padding: "6px 7px",
          minHeight: 34
        },
        value: rawValue || "",
        onChange: e => setTableFieldValue(bird, col.id, e.target.value)
      }), editable && col.type === "toggle" && React.createElement("label", {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "#334155",
          fontWeight: 700
        }
      }, React.createElement("input", {
        type: "checkbox",
        checked: !!rawValue,
        onChange: e => setTableFieldValue(bird, col.id, e.target.checked)
      }), "On"), editable && (!col.type || col.type === "text") && React.createElement("input", {
        style: {
          ...C.inp,
          margin: 0,
          fontSize: 12,
          padding: "6px 7px",
          minHeight: 34
        },
        value: rawValue || "",
        onChange: e => setTableFieldValue(bird, col.id, e.target.value)
      }), !editable && React.createElement("div", {
        style: {
          color: "#334155",
          fontSize: 12,
          lineHeight: 1.35
        }
      }, tableDisplayValue(bird, col.id)));
    }));
  })))), React.createElement("div", {
    style: {
      marginTop: 8,
      color: "#64748b",
      fontSize: 12,
      lineHeight: 1.35
    }
  }, tableMode === "view" ? "View mode is locked. Switch to Edit to change cells." : "Edit mode is active. Changes are staged until Save.")),
  showTableColumns && React.createElement(Modal, {
    title: "Table Columns",
    onClose: () => setShowTableColumns(false)
  }, React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      lineHeight: 1.45,
      marginBottom: 10
    }
  }, "Pick focused fields for the mobile table. At least one column must remain visible."), React.createElement("div", {
    style: {
      display: "grid",
      gap: 8
    }
  }, BIRD_TABLE_COLUMNS.map(col => {
    const checked = activeTableColumns.some(active => active.id === col.id);
    const disableUncheck = checked && activeTableColumns.length === 1;
    return React.createElement("label", {
      key: `table-col-${col.id}`,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 9px",
        borderRadius: 10,
        border: checked ? "1px solid #93c5fd" : "1px solid #d9e3ef",
        background: checked ? "#eff6ff" : "#ffffff",
        cursor: disableUncheck ? "not-allowed" : "pointer"
      }
    }, React.createElement("input", {
      type: "checkbox",
      checked: checked,
      disabled: disableUncheck,
      onChange: () => toggleTableColumn(col.id)
    }), React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: "#0f172a"
      }
    }, col.label), React.createElement("span", {
      style: {
        marginLeft: "auto",
        fontSize: 11,
        color: col.editable ? "#0f766e" : "#64748b",
        fontWeight: 700
      }
    }, col.editable ? "Editable" : "Read-only"));
  })), React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 12
    },
    onClick: () => setShowTableColumns(false)
  }, "Done")),
  showForm && React.createElement(Modal, {
    title: "Add Bird",
    onClose: () => setShowForm(false)
  }, React.createElement(FL, {
    lbl: "Tag ID *"
  }, React.createElement("input", {
    style: C.inp,
    value: bf.tagId,
    onChange: e => {
      setTagAuto(false);
      setBf({
        ...bf,
        tagId: e.target.value
      });
    },
    placeholder: "e.g. OB001-001"
  })), React.createElement(FL, {
    lbl: "Nickname"
  }, React.createElement("input", {
    style: C.inp,
    value: bf.nickname || "",
    onChange: e => setBf({
      ...bf,
      nickname: e.target.value
    }),
    placeholder: "Optional nickname"
  })), addTagConflict && React.createElement("div", {
    style: {
      color: "#b91c1c",
      fontSize: 13,
      fontWeight: 700,
      marginTop: 6
    }
  }, "One or more generated Tag IDs already exist on another bird."), addBulkNeedsAutoTag && React.createElement("div", {
    style: {
      color: "#b45309",
      fontSize: 13,
      fontWeight: 700,
      marginTop: 6
    }
  }, "Bulk add requires auto outsider codes."), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10
    }
  }, React.createElement(FL, {
    lbl: "Outsider Batch #"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "1",
    value: obBatchDraft,
    onChange: e => updateOutsiderBatch(e.target.value),
    onBlur: commitOutsiderBatchDraft
  })), React.createElement(FL, {
    lbl: "Start Bird #"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "1",
    value: obIndivDraft,
    onChange: e => updateOutsiderIndiv(e.target.value),
    onBlur: commitOutsiderIndivDraft
  })), React.createElement(FL, {
    lbl: "How Many Birds"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "1",
    value: obCountDraft,
    onChange: e => updateOutsiderCount(e.target.value),
    onBlur: commitOutsiderCountDraft
  }))), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 4
    }
  }, React.createElement("button", {
    style: {
      ...C.sm,
      color: tagAuto ? "#475569" : "#1d4ed8",
      borderColor: tagAuto ? "#c4d0df" : "#1d4ed844"
    },
    disabled: tagAuto,
    onClick: enableAutoTag
  }, tagAuto ? "Auto code on" : "Use auto code"), React.createElement("span", {
    style: {
      color: "#475569",
      fontSize: 13
    }
  }, "Preview: ", tagAuto && obCount > 1 ? `${outsiderTagCode(obBatch, obIndiv)} to ${outsiderTagCode(obBatch, obIndiv + obCount - 1)}` : outsiderTagCode(obBatch, obIndiv))), React.createElement(FL, {
    lbl: "Source"
  }, React.createElement("div", {
    style: {
      ...C.sel,
      fontSize: 14,
      color: "#475569"
    }
  }, "Outsider/manual add (hatch flow keeps C-Bxxx-xxx tags).")), React.createElement(FL, {
    lbl: "Hatch Date"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: bf.hatchDate,
    onChange: e => setBf({
      ...bf,
      hatchDate: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Breed"
  }, React.createElement("input", {
    style: C.inp,
    value: bf.breed,
    onChange: e => setBf({
      ...bf,
      breed: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Pen"
  }, React.createElement("select", {
    style: C.sel,
    value: bf.penId || "",
    onChange: e => setBf({
      ...bf,
      penId: e.target.value
    })
  }, React.createElement("option", {
    value: ""
  }, "No pen"), pens.map(pen => React.createElement("option", {
    key: pen.id,
    value: pen.id
  }, pen.name)))), React.createElement(FL, {
    lbl: "Stage"
  }, React.createElement(StagePicker, {
    value: bf.stage,
    accent: "#b45309",
    onChange: stage => setBf({
      ...bf,
      stage
    })
  })), addSuggestion && addSuggestion.stage !== bf.stage && React.createElement("div", {
    style: {
      border: "1px solid #b4530955",
      background: "#b4530912",
      borderRadius: 10,
      padding: "10px 11px",
      marginTop: 4
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#475569",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: ".04em"
    }
  }, "Suggested Stage"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, stageLabel(addSuggestion.stage)), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 13,
      color: "#475569"
    }
  }, addSuggestion.reason), React.createElement("button", {
    style: {
      ...C.sm,
      marginTop: 8,
      color: "#b45309",
      borderColor: "#b4530955",
      background: "#ffffff"
    },
    onClick: confirmApplyAddSuggestion
  }, "Use Suggestion")), React.createElement(FL, {
    lbl: "Sex"
  }, React.createElement("select", {
    style: C.sel,
    value: bf.sex,
    onChange: e => setBf({
      ...bf,
      sex: e.target.value
    })
  }, React.createElement("option", {
    value: "unknown"
  }, "unknown"), React.createElement("option", {
    value: "female"
  }, "female"), React.createElement("option", {
    value: "male"
  }, "male"))), React.createElement(FL, {
    lbl: "Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: bf.notes,
    onChange: e => setBf({
      ...bf,
      notes: e.target.value
    })
  })), React.createElement("button", {
    style: {
      ...C.btn,
      opacity: addCanSave ? 1 : .65,
      cursor: addCanSave ? "pointer" : "default"
    },
    disabled: !addCanSave,
    onClick: () => {
      const tagId = (bf.tagId || "").trim();
      if (!tagId || addTagConflict || addBulkNeedsAutoTag) return;
      const saveCount = tagAuto ? Math.max(1, obCount) : 1;
      const nickname = (bf.nickname || "").trim();
      for (let idx = 0; idx < saveCount; idx += 1) {
        const createdAt = new Date().toISOString();
        const nextTagId = tagAuto ? outsiderTagCode(obBatch, obIndiv + idx) : tagId;
        const newBird = {
          id: uid(),
          createdAt,
          ...bf,
          nickname,
          tagId: nextTagId
        };
        const penUpdate = buildBirdPenUpdateBirds({
          bird: {
            penId: null,
            penHistory: []
          },
          nextPenId: bf.penId || null,
          nextStatus: bf.status || "active",
          changeDate: bf.hatchDate || createdAt,
          reason: bf.penId ? "pen_assignment" : "pen_cleared",
          makeId: uid
        });
        onAdd({
          ...newBird,
          penId: penUpdate.penId,
          penHistory: penUpdate.penHistory
        });
      }
      const nextIndiv = obIndiv + saveCount;
      setObIndiv(nextIndiv);
      setObCount(1);
      setObIndivDraft(String(nextIndiv));
      setObCountDraft("1");
      setTagAuto(true);
      setBf(makeBirdForm(outsiderTagCode(obBatch, nextIndiv)));
      setShowForm(false);
    }
  }, tagAuto && obCount > 1 ? `Save ${obCount} Birds` : "Save Bird")), listPhotoPreview?.dataUrl && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000000ea",
      zIndex: 260,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 14
    },
    onClick: () => setListPhotoPreview(null)
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
    onClick: () => setListPhotoPreview(null),
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
    src: listPhotoPreview.dataUrl,
    alt: listPhotoPreview.label || "",
    onClick: () => setListPhotoPreview(null),
    style: {
      maxWidth: "100%",
      maxHeight: "86dvh",
      objectFit: "contain",
      borderRadius: 10,
      cursor: "zoom-out"
    }
  }), !!(listPhotoPreview.label || listPhotoPreview.detail) && React.createElement("div", {
    style: {
      textAlign: "center",
      color: "#f8fafc"
    }
  }, !!listPhotoPreview.label && React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800
    }
  }, listPhotoPreview.label), !!listPhotoPreview.detail && React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#cbd5e1",
      fontWeight: 700
    }
  }, listPhotoPreview.detail)), React.createElement("div", {
    style: {
      color: "#e2e8f0",
      fontSize: 13,
      fontWeight: 700
    }
  }, "Tap photo, Close, or outside to close"))));
}
function Birds(props) {
  try {
    return BirdsScreen(props);
  } catch (error) {
    console.error(error);
    const birds = Array.isArray(props.birds) ? props.birds.filter(item => item && typeof item === "object") : [];
    const pens = Array.isArray(props.pens) ? props.pens.filter(item => item && typeof item === "object") : [];
    const pendingBirdId = window.__flockTrackOpenBirdId;
    const selectedBird = birds.find(bird => bird.id === pendingBirdId) || null;
    if (pendingBirdId) window.__flockTrackOpenBirdId = null;
    if (window.__flockTrackOpenBirdPenId) window.__flockTrackOpenBirdPenId = null;
    const penById = new Map(pens.map(pen => [pen.id, pen.name || "Pen"]));
    return React.createElement("div", {
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
    }, "Flock Safe Mode"), React.createElement("div", {
      style: {
        marginTop: 8,
        color: "#475569",
        fontSize: 14,
        lineHeight: 1.45
      }
    }, error?.message || "The full flock view could not be rendered on this device.")), selectedBird && React.createElement("div", {
      style: {
        ...C.card,
        borderColor: "#93c5fd",
        background: "#eff6ff"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 17,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, birdDisplayName(selectedBird)), birdDisplayTag(selectedBird) && React.createElement("div", {
      style: {
        marginTop: 2,
        fontSize: 12,
        color: "#1d4ed8",
        fontWeight: 700
      }
    }, "Tag ", birdDisplayTag(selectedBird)), React.createElement("div", {
      style: {
        marginTop: 6,
        color: "#475569",
        fontSize: 14,
        lineHeight: 1.45
      }
    }, [selectedBird.breed || "No breed", selectedBird.stage ? stageLabel(selectedBird.stage) : "", selectedBird.sex || "unknown", selectedBird.penId ? penById.get(selectedBird.penId) || "Assigned pen" : ""].filter(Boolean).join(" · ")), React.createElement("div", {
      style: {
        marginTop: 8,
        color: "#64748b",
        fontSize: 13,
        lineHeight: 1.45
      }
    }, selectedBird.notes || "No notes")), React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: "#0f172a",
        marginBottom: 8
      }
    }, "Birds"), !birds.length && React.createElement(Empty, {
      icon: "\uD83D\uDC23",
      msg: "No birds available"
    }), birds.map(bird => React.createElement("div", {
      key: bird.id || bird.tagId || Math.random().toString(36),
      style: {
        ...C.card,
        padding: 14,
        background: selectedBird && selectedBird.id === bird.id ? "#eff6ff" : "#ffffff",
        borderColor: selectedBird && selectedBird.id === bird.id ? "#93c5fd" : "#d9e3ef"
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: 10
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, birdDisplayName(bird)), birdDisplayTag(bird) && React.createElement("div", {
      style: {
        marginTop: 2,
        color: "#1d4ed8",
        fontSize: 12,
        fontWeight: 700
      }
    }, "Tag ", birdDisplayTag(bird)), React.createElement("div", {
      style: {
        marginTop: 3,
        color: "#475569",
        fontSize: 13
      }
    }, [bird.breed || "No breed", bird.stage ? stageLabel(bird.stage) : "", bird.sex || "unknown", bird.penId ? penById.get(bird.penId) || "Assigned pen" : ""].filter(Boolean).join(" · "))), React.createElement("div", {
      style: C.badge(sc(bird.status || "active"))
    }, bird.status || "active")))));
  }
}
