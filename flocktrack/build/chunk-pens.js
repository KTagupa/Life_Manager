// Generated bundle: build/chunk-pens.js. Edit source files, then run npm run build.

/* FILE: src/screens/pens.js */
const { estimatePenFeedLog, buildBirdPenUpdate } = globalThis.FlockTrackLogic;
const PENS_SCREEN_NEST_CHICKS_ICON = typeof globalThis !== "undefined" && globalThis.FLOCK_TRACK_PENS_NEST_CHICKS_ICON ? globalThis.FLOCK_TRACK_PENS_NEST_CHICKS_ICON : "assets/icons/pens-nest-chicks-icon.png";

const PEN_SCREEN_SLIDES = [{
  id: "pens",
  label: "Pens",
  color: "#1d4ed8"
}, {
  id: "feed",
  label: "Feed Logs",
  color: "#c2410c"
}, {
  id: "types",
  label: "Feed Types",
  color: "#047857"
}];

const PEN_SCREEN_ICONS = {
  feed: "\uD83E\uDD63",
  types: "\uD83C\uDF3E"
};

const PEN_FENCE_POSTS = [0, 1, 2, 3, 4, 5, 6];
const PEN_GRASS_POSITIONS = ["10%", "25%", "45%", "70%", "85%"];

const PEN_STAGE_BASE_SIZES = {
  chick: 28,
  grower: 35,
  pullet: 36,
  broiler: 38,
  layer: 40,
  rooster: 44
};

const PEN_STAGE_MEDIAN_KG = {
  chick: 0.35,
  grower: 1.4,
  pullet: 1.35,
  broiler: 2.2,
  layer: 1.8,
  rooster: 2.5
};

const FEED_UNIT_SLIDES = [{
  id: "kg",
  label: "kg",
  color: "#c2410c"
}, {
  id: "g",
  label: "g",
  color: "#c2410c"
}, {
  id: "lb",
  label: "lb",
  color: "#c2410c"
}, {
  id: "sack",
  label: "sack",
  color: "#c2410c"
}];

const PEN_THEME_OPTIONS = [{
  id: "cedar",
  name: "Cedar",
  woodA: "#bc8a5f",
  woodB: "#b98253",
  woodC: "#c29167",
  badgeBirds: "#ecfeff",
  badgeLogs: "#ffedd5",
  latestBg: "#fff7ec",
  latestBorder: "#f5d7b0",
  latestKicker: "#9a3412",
  quickColor: "#c2410c",
  quickBorder: "#fdba74",
  grass: "#7fb069",
  fenceLine: "#d0dae5"
}, {
  id: "terracotta",
  name: "Terracotta",
  woodA: "#b76a4d",
  woodB: "#a65d43",
  woodC: "#c47b5b",
  badgeBirds: "#fde68a",
  badgeLogs: "#ffedd5",
  latestBg: "#fff3e9",
  latestBorder: "#f8c9a4",
  latestKicker: "#9a3412",
  quickColor: "#b45309",
  quickBorder: "#f59e0b",
  grass: "#799b62",
  fenceLine: "#c7d1dd"
}, {
  id: "sandstone",
  name: "Sandstone",
  woodA: "#b19369",
  woodB: "#9d815b",
  woodC: "#c0a179",
  badgeBirds: "#ecfccb",
  badgeLogs: "#fef3c7",
  latestBg: "#fff9ee",
  latestBorder: "#eed8ad",
  latestKicker: "#854d0e",
  quickColor: "#a16207",
  quickBorder: "#eab308",
  grass: "#809d64",
  fenceLine: "#cfd7e0"
}, {
  id: "olive",
  name: "Olive",
  woodA: "#8c7b4b",
  woodB: "#7b6b41",
  woodC: "#998858",
  badgeBirds: "#d9f99d",
  badgeLogs: "#fde68a",
  latestBg: "#f8f8e8",
  latestBorder: "#d8d7a3",
  latestKicker: "#4d7c0f",
  quickColor: "#4d7c0f",
  quickBorder: "#a3e635",
  grass: "#6f8f53",
  fenceLine: "#bcc7d6"
}, {
  id: "moss",
  name: "Moss",
  woodA: "#6f7f57",
  woodB: "#62714c",
  woodC: "#7f8f63",
  badgeBirds: "#dcfce7",
  badgeLogs: "#fef9c3",
  latestBg: "#edf6e8",
  latestBorder: "#c1d8b5",
  latestKicker: "#166534",
  quickColor: "#166534",
  quickBorder: "#86efac",
  grass: "#6a9350",
  fenceLine: "#b8c4d3"
}, {
  id: "clay",
  name: "Clay",
  woodA: "#9f6f5a",
  woodB: "#8d6250",
  woodC: "#ad7c66",
  badgeBirds: "#fee2e2",
  badgeLogs: "#ffedd5",
  latestBg: "#fff1ef",
  latestBorder: "#efc5bd",
  latestKicker: "#9f1239",
  quickColor: "#be123c",
  quickBorder: "#fda4af",
  grass: "#7d9a60",
  fenceLine: "#c3cedb"
}, {
  id: "walnut",
  name: "Walnut",
  woodA: "#7e5a43",
  woodB: "#6f4f3b",
  woodC: "#8d674f",
  badgeBirds: "#ede9fe",
  badgeLogs: "#fde68a",
  latestBg: "#f8f1ed",
  latestBorder: "#dbc0b1",
  latestKicker: "#7c2d12",
  quickColor: "#7c2d12",
  quickBorder: "#fdba74",
  grass: "#708d58",
  fenceLine: "#b7c2d0"
}, {
  id: "slate",
  name: "Slate",
  woodA: "#667282",
  woodB: "#596572",
  woodC: "#738091",
  badgeBirds: "#dbeafe",
  badgeLogs: "#f1f5f9",
  latestBg: "#eef3f8",
  latestBorder: "#c7d4e1",
  latestKicker: "#1d4ed8",
  quickColor: "#1d4ed8",
  quickBorder: "#93c5fd",
  grass: "#6f8b5a",
  fenceLine: "#c0cad7"
}, {
  id: "ochre",
  name: "Ochre",
  woodA: "#b0864e",
  woodB: "#9b7645",
  woodC: "#c1975a",
  badgeBirds: "#fef9c3",
  badgeLogs: "#fde68a",
  latestBg: "#fff8e5",
  latestBorder: "#efd58e",
  latestKicker: "#a16207",
  quickColor: "#a16207",
  quickBorder: "#facc15",
  grass: "#7b975f",
  fenceLine: "#c8d2de"
}, {
  id: "umber",
  name: "Umber",
  woodA: "#6b4f3d",
  woodB: "#5f4637",
  woodC: "#7b5a46",
  badgeBirds: "#e2e8f0",
  badgeLogs: "#fed7aa",
  latestBg: "#f5efea",
  latestBorder: "#d4c0b2",
  latestKicker: "#7c2d12",
  quickColor: "#9a3412",
  quickBorder: "#fdba74",
  grass: "#6b8751",
  fenceLine: "#b9c4d2"
}];

const DEFAULT_PEN_THEME_ID = PEN_THEME_OPTIONS[0].id;
globalThis.FLOCK_TRACK_PEN_THEMES = PEN_THEME_OPTIONS;

function getPenTheme(themeId) {
  return PEN_THEME_OPTIONS.find(theme => theme.id === themeId) || PEN_THEME_OPTIONS[0];
}

function getFeedTypeTheme(feedType, fallbackKey = "") {
  const color = feedTypeColor(feedType, fallbackKey);
  return {
    color,
    soft: hexToRgba(color, .1),
    border: hexToRgba(color, .36),
    badge: hexToRgba(color, .16)
  };
}

function feedTypeSackKgText(feedType) {
  const value = Number(feedType?.sackKg);
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

function emptyFeedTypeForm() {
  return {
    name: "",
    defaultUnit: "kg",
    notes: "",
    color: FEED_TYPE_COLOR_SWATCHES[0],
    sackKg: ""
  };
}

function toWeightKg(value, unit) {
  return weightAmountToKg(value, unit);
}

function formatPenWeightDisplay(value, unit) {
  const inGrams = fmtWeightGrams(value, unit);
  if (inGrams) return inGrams;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const normalizedUnit = String(unit || "").trim();
  return `${fmtNum(numeric)} ${normalizedUnit}`.trim();
}

function getPenSpriteSize(weightMeasurement, stage) {
  const baseSize = PEN_STAGE_BASE_SIZES[stage] || 34;
  const medianKg = PEN_STAGE_MEDIAN_KG[stage] || 1.5;
  const weightKg = toWeightKg(weightMeasurement?.value, weightMeasurement?.unit);
  if (!weightKg) return baseSize;
  const ratio = Math.max(0.88, Math.min(1.18, weightKg / medianKg));
  return Math.max(26, Math.min(48, Math.round(baseSize * ratio)));
}

function sortBirdsByTag(items) {
  return [...items].sort((a, b) => normalizeTagId(a.tagId).localeCompare(normalizeTagId(b.tagId), undefined, {
    numeric: true
  }));
}

function fmtFeedLoggedAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return /T\d{2}:\d{2}/.test(raw) ? fmtDateTime(raw) : fmtDate(raw);
}

function penBirdDetailLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function latestPhotoWithImage(photos) {
  const list = Array.isArray(photos) ? photos : [];
  for (let idx = list.length - 1; idx >= 0; idx -= 1) {
    const photo = list[idx];
    if (photo?.dataUrl) return photo;
  }
  return null;
}

function Pens({
  pens,
  batches,
  birds,
  measurements,
  feedTypes,
  penFeedLogs,
  onAddPen,
  onAddFeedType,
  onUpdateFeedType,
  onDeleteFeedType,
  onAddPenFeedLog,
  onDeletePenFeedLog,
  onUpdatePen,
  onUpdateBird,
  onDeletePen,
  onOpenBird,
  openPenId = "",
  onOpenPenHandled,
  photoCache,
  ensureBirdPhotos
}) {
  const [screen, setScreen] = useState("pens");
  const [showPenForm, setShowPenForm] = useState(false);
  const [showFeedTypeForm, setShowFeedTypeForm] = useState(false);
  const [editingFeedTypeId, setEditingFeedTypeId] = useState("");
  const [showFeedLogForm, setShowFeedLogForm] = useState(false);
  const [showAssignBirdsForm, setShowAssignBirdsForm] = useState(false);
  const [showMoveBirdsForm, setShowMoveBirdsForm] = useState(false);
  const [assignTargetPenId, setAssignTargetPenId] = useState("");
  const [assignBirdIds, setAssignBirdIds] = useState([]);
  const [moveSourcePenId, setMoveSourcePenId] = useState("");
  const [moveTargetPenId, setMoveTargetPenId] = useState("");
  const [moveBatchFilter, setMoveBatchFilter] = useState("all");
  const [moveStageFilter, setMoveStageFilter] = useState("all");
  const [moveBirdIds, setMoveBirdIds] = useState([]);
  const [pensCarouselIndex, setPensCarouselIndex] = useState(0);
  const [expandedPenBirds, setExpandedPenBirds] = useState({});
  const [themePickerPenId, setThemePickerPenId] = useState("");
  const [penForm, setPenForm] = useState({
    name: "",
    location: "",
    notes: "",
    themeId: DEFAULT_PEN_THEME_ID
  });
  const [feedTypeForm, setFeedTypeForm] = useState(emptyFeedTypeForm);
  const [feedLogForm, setFeedLogForm] = useState({
    penId: "",
    feedTypeId: "",
    amount: "",
    unit: "kg",
    sackKg: "",
    loggedAt: today(),
    notes: ""
  });
  photoCache = photoCache && typeof photoCache === "object" ? photoCache : {};

  const penById = useMemo(() => {
    const map = new Map();
    pens.forEach(pen => map.set(pen.id, pen));
    return map;
  }, [pens]);
  const batchById = useMemo(() => {
    const map = new Map();
    (Array.isArray(batches) ? batches : []).forEach(batch => map.set(batch.id, batch));
    return map;
  }, [batches]);
  const pensOrdered = useMemo(() => [...pens].sort((a, b) => {
    const createdDiff = dateMs(a.createdAt) - dateMs(b.createdAt);
    if (createdDiff) return createdDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  }), [pens]);
  const resolvedThemeIdByPen = useMemo(() => {
    const map = new Map();
    pensOrdered.forEach((pen, idx) => {
      const storedTheme = getPenTheme(pen.themeId).id;
      if (pen.themeId && storedTheme === pen.themeId) {
        map.set(pen.id, pen.themeId);
        return;
      }
      map.set(pen.id, PEN_THEME_OPTIONS[idx % PEN_THEME_OPTIONS.length].id);
    });
    return map;
  }, [pensOrdered]);
  const nextPenThemeId = useMemo(() => {
    if (!pensOrdered.length) return DEFAULT_PEN_THEME_ID;
    const lastPen = pensOrdered[pensOrdered.length - 1];
    const lastThemeId = resolvedThemeIdByPen.get(lastPen.id) || DEFAULT_PEN_THEME_ID;
    const currentIdx = Math.max(0, PEN_THEME_OPTIONS.findIndex(theme => theme.id === lastThemeId));
    return PEN_THEME_OPTIONS[(currentIdx + 1) % PEN_THEME_OPTIONS.length].id;
  }, [pensOrdered, resolvedThemeIdByPen]);

  const feedTypeById = useMemo(() => {
    const map = new Map();
    feedTypes.forEach(feedType => map.set(feedType.id, feedType));
    return map;
  }, [feedTypes]);

  const latestWeightByBird = useMemo(() => {
    const map = new Map();
    measurements.forEach(measurement => {
      if (measurement.metricType !== "weight") return;
      const existing = map.get(measurement.birdId);
      if (!existing || dateMs(measurement.measuredAt) > dateMs(existing.measuredAt)) map.set(measurement.birdId, measurement);
    });
    return map;
  }, [measurements]);

  const activeBirds = useMemo(() => sortBirdsByTag(birds.filter(bird => bird.status === "active")), [birds]);
  const unassignedActiveBirds = useMemo(() => activeBirds.filter(bird => !bird.penId), [activeBirds]);

  const activeBirdsByPen = useMemo(() => {
    const map = new Map();
    activeBirds.forEach(bird => {
      if (!bird.penId) return;
      const existing = map.get(bird.penId) || [];
      existing.push(bird);
      map.set(bird.penId, existing);
    });
    map.forEach(items => items.sort((a, b) => normalizeTagId(a.tagId).localeCompare(normalizeTagId(b.tagId), undefined, {
      numeric: true
    })));
    return map;
  }, [activeBirds]);

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

  const sortedLogs = useMemo(() => [...penFeedLogs].sort((a, b) => dateMs(b.loggedAt) - dateMs(a.loggedAt)), [penFeedLogs]);

  const logAllocations = useMemo(() => {
    const map = new Map();
    penFeedLogs.forEach(log => map.set(log.id, estimatePenFeedLog({
      log,
      birds
    })));
    return map;
  }, [birds, penFeedLogs]);

  const pensWithActiveBirds = useMemo(() => pens.filter(pen => (activeBirdsByPen.get(pen.id) || []).length > 0), [activeBirdsByPen, pens]);
  const currentPensCarouselPen = pens[pensCarouselIndex] || null;
  const canMovePrevPen = pensCarouselIndex > 0;
  const canMoveNextPen = pensCarouselIndex < pens.length - 1;
  const getPenBirdVisualMode = pen => pen?.birdVisualMode === "photo" ? "photo" : "sprite";
  const moveSourceBirds = useMemo(() => sortBirdsByTag(activeBirdsByPen.get(moveSourcePenId) || []), [activeBirdsByPen, moveSourcePenId]);
  const moveTargetPens = useMemo(() => pens.filter(pen => pen.id !== moveSourcePenId), [moveSourcePenId, pens]);
  const moveBirdBatchFilterKey = bird => {
    const batch = bird?.originBatchId ? batchById.get(bird.originBatchId) : null;
    if (batch?.code) return `batch:${batch.id}`;
    const outsider = parseOutsiderTagCode(bird?.tagId);
    if (outsider?.batchNo) return `outsider:${outsider.batchNo}`;
    const hatchNo = hatchTagBatchNo(bird?.tagId);
    if (hatchNo) return `hatch:${hatchNo}`;
    return "batch:unknown";
  };
  const moveBatchOptions = useMemo(() => {
    const seen = new Map();
    moveSourceBirds.forEach(bird => {
      const key = moveBirdBatchFilterKey(bird);
      if (!seen.has(key)) seen.set(key, birdBatchChipLabel(bird, batchById));
    });
    return [...seen.entries()].map(([id, label]) => ({
      id,
      label
    })).sort((a, b) => a.label.localeCompare(b.label, undefined, {
      numeric: true
    }));
  }, [batchById, moveSourceBirds]);
  const moveStageOptions = useMemo(() => STAGES_BIRD_INFO.filter(stage => moveSourceBirds.some(bird => (bird.stage || "chick") === stage)).map(stage => ({
    id: stage,
    label: stageLabel(stage)
  })), [moveSourceBirds]);
  const filteredMoveSourceBirds = useMemo(() => moveSourceBirds.filter(bird => {
    if (moveBatchFilter !== "all" && moveBirdBatchFilterKey(bird) !== moveBatchFilter) return false;
    if (moveStageFilter !== "all" && (bird.stage || "chick") !== moveStageFilter) return false;
    return true;
  }), [moveBatchFilter, moveSourceBirds, moveStageFilter]);

  useEffect(() => {
    if (!pens.length) {
      if (pensCarouselIndex !== 0) setPensCarouselIndex(0);
      return;
    }
    if (pensCarouselIndex > pens.length - 1) setPensCarouselIndex(pens.length - 1);
  }, [pens.length, pensCarouselIndex]);
  useEffect(() => {
    if (!openPenId) return;
    const nextIndex = pens.findIndex(pen => pen?.id === openPenId);
    if (nextIndex >= 0) {
      if (screen !== "pens") setScreen("pens");
      if (pensCarouselIndex !== nextIndex) setPensCarouselIndex(nextIndex);
    }
    if (typeof onOpenPenHandled === "function") onOpenPenHandled();
  }, [onOpenPenHandled, openPenId, pens, pensCarouselIndex, screen]);
  useEffect(() => {
    if (!themePickerPenId) return;
    if (!penById.has(themePickerPenId)) setThemePickerPenId("");
  }, [penById, themePickerPenId]);
  useEffect(() => {
    if (screen !== "pens") return;
    if (typeof ensureBirdPhotos !== "function") return;
    const currentPen = pens[pensCarouselIndex];
    if (!currentPen || getPenBirdVisualMode(currentPen) !== "photo") return;
    const currentBirds = activeBirdsByPen.get(currentPen.id) || [];
    currentBirds.forEach(bird => {
      if (!bird?.id) return;
      if (Object.prototype.hasOwnProperty.call(photoCache, bird.id)) return;
      Promise.resolve(ensureBirdPhotos(bird.id)).catch(console.error);
    });
  }, [activeBirdsByPen, ensureBirdPhotos, pens, pensCarouselIndex, photoCache, screen]);
  useEffect(() => {
    if (!editingFeedTypeId) return;
    if (feedTypeById.has(editingFeedTypeId)) return;
    setEditingFeedTypeId("");
    setShowFeedTypeForm(false);
    setFeedTypeForm(emptyFeedTypeForm());
  }, [editingFeedTypeId, feedTypeById]);
  useEffect(() => {
    if (!showAssignBirdsForm) return;
    if (!pens.length) {
      if (assignTargetPenId) setAssignTargetPenId("");
      return;
    }
    if (pens.some(pen => pen.id === assignTargetPenId)) return;
    setAssignTargetPenId(currentPensCarouselPen?.id || pens[0]?.id || "");
  }, [assignTargetPenId, currentPensCarouselPen, pens, showAssignBirdsForm]);
  useEffect(() => {
    if (!showAssignBirdsForm) return;
    const assignableBirdIds = new Set(unassignedActiveBirds.map(bird => bird.id));
    setAssignBirdIds(prev => {
      const next = prev.filter(id => assignableBirdIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [showAssignBirdsForm, unassignedActiveBirds]);
  useEffect(() => {
    if (!showMoveBirdsForm) return;
    if (!pensWithActiveBirds.length) {
      if (moveSourcePenId) setMoveSourcePenId("");
      return;
    }
    if (pensWithActiveBirds.some(pen => pen.id === moveSourcePenId)) return;
    const preferredSourcePenId = currentPensCarouselPen && (activeBirdsByPen.get(currentPensCarouselPen.id) || []).length ? currentPensCarouselPen.id : pensWithActiveBirds[0]?.id || "";
    setMoveSourcePenId(preferredSourcePenId);
  }, [activeBirdsByPen, currentPensCarouselPen, moveSourcePenId, pensWithActiveBirds, showMoveBirdsForm]);
  useEffect(() => {
    if (!showMoveBirdsForm) return;
    if (!moveTargetPens.length) {
      if (moveTargetPenId) setMoveTargetPenId("");
      return;
    }
    if (moveTargetPens.some(pen => pen.id === moveTargetPenId)) return;
    const preferredTargetPenId = currentPensCarouselPen?.id && currentPensCarouselPen.id !== moveSourcePenId ? currentPensCarouselPen.id : moveTargetPens[0]?.id || "";
    setMoveTargetPenId(preferredTargetPenId);
  }, [currentPensCarouselPen, moveSourcePenId, moveTargetPenId, moveTargetPens, showMoveBirdsForm]);
  useEffect(() => {
    if (!showMoveBirdsForm) return;
    const movableBirdIds = new Set(filteredMoveSourceBirds.map(bird => bird.id));
    setMoveBirdIds(prev => {
      const next = prev.filter(id => movableBirdIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredMoveSourceBirds, showMoveBirdsForm]);
  useEffect(() => {
    if (!showMoveBirdsForm) return;
    if (moveBatchFilter === "all") return;
    if (moveBatchOptions.some(option => option.id === moveBatchFilter)) return;
    setMoveBatchFilter("all");
  }, [moveBatchFilter, moveBatchOptions, showMoveBirdsForm]);
  useEffect(() => {
    if (!showMoveBirdsForm) return;
    if (moveStageFilter === "all") return;
    if (moveStageOptions.some(option => option.id === moveStageFilter)) return;
    setMoveStageFilter("all");
  }, [moveStageFilter, moveStageOptions, showMoveBirdsForm]);

  function stepPensCarousel(offset) {
    if (!pens.length) return;
    setPensCarouselIndex(prev => {
      const next = prev + offset;
      if (next < 0) return 0;
      if (next > pens.length - 1) return pens.length - 1;
      return next;
    });
  }

  function hasActiveBirdsInPen(penId) {
    return !!penId && (activeBirdsByPen.get(penId) || []).length > 0;
  }

  function openFeedLogForm(defaultPenId) {
    if (!pensWithActiveBirds.length) {
      window.alert("Assign at least one active bird to a pen before logging feed.");
      return;
    }
    const preferredPenId = [defaultPenId, feedLogForm.penId].find(penId => hasActiveBirdsInPen(penId)) || pensWithActiveBirds[0].id;
    const nextFeedType = feedTypes[0] || null;
    setFeedLogForm({
      penId: preferredPenId,
      feedTypeId: nextFeedType?.id || "",
      amount: "",
      unit: nextFeedType?.defaultUnit || "kg",
      sackKg: feedTypeSackKgText(nextFeedType),
      loggedAt: today(),
      notes: ""
    });
    setShowFeedLogForm(true);
  }

  function openPenForm() {
    setPenForm({
      name: "",
      location: "",
      notes: "",
      themeId: nextPenThemeId
    });
    setShowPenForm(true);
  }

  function closeAssignBirdsForm() {
    setShowAssignBirdsForm(false);
    setAssignTargetPenId("");
    setAssignBirdIds([]);
  }

  function openAssignBirdsForm() {
    setAssignTargetPenId(currentPensCarouselPen?.id || pens[0]?.id || "");
    setAssignBirdIds([]);
    setShowAssignBirdsForm(true);
  }

  function closeMoveBirdsForm() {
    setShowMoveBirdsForm(false);
    setMoveSourcePenId("");
    setMoveTargetPenId("");
    setMoveBatchFilter("all");
    setMoveStageFilter("all");
    setMoveBirdIds([]);
  }

  function openMoveBirdsForm() {
    const preferredSourcePenId = currentPensCarouselPen && (activeBirdsByPen.get(currentPensCarouselPen.id) || []).length ? currentPensCarouselPen.id : pensWithActiveBirds[0]?.id || "";
    const preferredTargetPenId = pens.find(pen => pen.id !== preferredSourcePenId)?.id || "";
    setMoveSourcePenId(preferredSourcePenId);
    setMoveTargetPenId(preferredTargetPenId);
    setMoveBatchFilter("all");
    setMoveStageFilter("all");
    setMoveBirdIds([]);
    setShowMoveBirdsForm(true);
  }

  function openAddFeedTypeForm() {
    setEditingFeedTypeId("");
    setFeedTypeForm(emptyFeedTypeForm());
    setShowFeedTypeForm(true);
  }

  function openEditFeedTypeForm(feedType) {
    if (!feedType?.id) return;
    const resolvedColor = String(feedType.color || "").trim() || feedTypeColor(feedType, feedType.id);
    setEditingFeedTypeId(feedType.id);
    setFeedTypeForm({
      name: feedType.name || "",
      defaultUnit: feedType.defaultUnit || "kg",
      notes: feedType.notes || "",
      color: resolvedColor,
      sackKg: feedTypeSackKgText(feedType)
    });
    setShowFeedTypeForm(true);
  }

  function closeFeedTypeForm() {
    setShowFeedTypeForm(false);
    setEditingFeedTypeId("");
    setFeedTypeForm(emptyFeedTypeForm());
  }

  function savePen() {
    const name = (penForm.name || "").trim();
    if (!name) return;
    const chosenThemeId = getPenTheme(penForm.themeId).id;
    onAddPen({
      id: uid(),
      name,
      location: (penForm.location || "").trim(),
      notes: (penForm.notes || "").trim(),
      themeId: chosenThemeId,
      createdAt: new Date().toISOString()
    });
    setPenForm({
      name: "",
      location: "",
      notes: "",
      themeId: nextPenThemeId
    });
    setShowPenForm(false);
  }

  function updatePenTheme(pen, themeId) {
    if (!pen || typeof onUpdatePen !== "function") return;
    const nextThemeId = getPenTheme(themeId).id;
    if (resolvedThemeIdByPen.get(pen.id) === nextThemeId && pen.themeId === nextThemeId) return;
    onUpdatePen({
      ...pen,
      themeId: nextThemeId,
      updatedAt: new Date().toISOString()
    });
  }

  function togglePenBookmark(pen) {
    if (!pen || typeof onUpdatePen !== "function") return;
    const nextBookmarked = !pen.bookmarked;
    onUpdatePen({
      ...pen,
      bookmarked: nextBookmarked,
      bookmarkedAt: nextBookmarked ? new Date().toISOString() : "",
      updatedAt: new Date().toISOString()
    });
  }

  function renamePen(pen) {
    if (!pen || typeof onUpdatePen !== "function") return;
    const drafted = window.prompt("Edit pen name", pen.name || "");
    if (drafted == null) return;
    const name = String(drafted).trim();
    if (!name) {
      window.alert("Pen name cannot be empty.");
      return;
    }
    if (name === pen.name) return;
    onUpdatePen({
      ...pen,
      name,
      updatedAt: new Date().toISOString()
    });
  }

  function deletePen(pen) {
    if (!pen?.id) return;
    if (typeof onDeletePen !== "function") {
      window.alert("Pen deletion is currently unavailable.");
      return;
    }
    const activeCount = (activeBirdsByPen.get(pen.id) || []).length;
    const logCount = (logsByPen.get(pen.id) || []).length;
    const lines = [`Delete pen "${pen.name || "Untitled Pen"}"?`];
    if (activeCount) lines.push(`${activeCount} active chicken${activeCount === 1 ? "" : "s"} will be unassigned.`);
    if (logCount) lines.push(`${logCount} feed log${logCount === 1 ? "" : "s"} in this pen will be deleted.`);
    const ok = window.confirm(lines.join("\n"));
    if (!ok) return;
    Promise.resolve(onDeletePen(pen.id)).catch(err => {
      console.error(err);
      window.alert("Could not delete this pen. Please try again.");
    });
  }

  function togglePenBirdExpand(penId) {
    if (!penId) return;
    setExpandedPenBirds(prev => ({
      ...prev,
      [penId]: !prev[penId]
    }));
  }

  function toggleAssignBird(birdId) {
    if (!birdId) return;
    setAssignBirdIds(prev => prev.includes(birdId) ? prev.filter(id => id !== birdId) : [...prev, birdId]);
  }

  function toggleAssignBirdsCheckAll() {
    if (!unassignedActiveBirds.length) return;
    const nextIds = unassignedActiveBirds.map(bird => bird.id);
    setAssignBirdIds(prev => prev.length === nextIds.length ? [] : nextIds);
  }

  function saveAssignedBirds() {
    if (typeof onUpdateBird !== "function") {
      window.alert("Bird assignment is currently unavailable.");
      return;
    }
    if (!assignTargetPenId) {
      window.alert("Choose a pen first.");
      return;
    }
    if (!assignBirdIds.length) {
      window.alert("Select at least one bird to assign.");
      return;
    }
    const selectedBirdIds = new Set(assignBirdIds);
    const selectedBirds = unassignedActiveBirds.filter(bird => selectedBirdIds.has(bird.id));
    if (!selectedBirds.length) {
      window.alert("No unassigned active birds are available.");
      return;
    }
    const updatedAt = new Date().toISOString();
    const changeDate = today();
    try {
      selectedBirds.forEach(bird => {
        const penUpdate = buildBirdPenUpdate({
          bird,
          nextPenId: assignTargetPenId,
          nextStatus: bird.status || "active",
          changeDate,
          reason: "pen_assignment",
          makeId: uid
        });
        onUpdateBird({
          ...bird,
          penId: penUpdate.penId,
          penHistory: penUpdate.penHistory,
          updatedAt
        });
      });
      closeAssignBirdsForm();
    } catch (err) {
      console.error(err);
      window.alert("Could not assign the selected birds. Please try again.");
    }
  }

  function toggleMoveBird(birdId) {
    if (!birdId) return;
    setMoveBirdIds(prev => prev.includes(birdId) ? prev.filter(id => id !== birdId) : [...prev, birdId]);
  }

  function toggleMoveBirdsCheckAll() {
    if (!filteredMoveSourceBirds.length) return;
    const nextIds = filteredMoveSourceBirds.map(bird => bird.id);
    setMoveBirdIds(prev => prev.length === nextIds.length ? [] : nextIds);
  }

  function saveMovedBirds() {
    if (typeof onUpdateBird !== "function") {
      window.alert("Bird moving is currently unavailable.");
      return;
    }
    if (!moveSourcePenId) {
      window.alert("Choose the source pen first.");
      return;
    }
    if (!moveTargetPenId) {
      window.alert("Choose the destination pen first.");
      return;
    }
    if (moveTargetPenId === moveSourcePenId) {
      window.alert("Choose a different destination pen.");
      return;
    }
    if (!moveBirdIds.length) {
      window.alert("Select at least one bird to move.");
      return;
    }
    const selectedBirdIds = new Set(moveBirdIds);
    const selectedBirds = filteredMoveSourceBirds.filter(bird => selectedBirdIds.has(bird.id));
    if (!selectedBirds.length) {
      window.alert("No active birds are available in the selected source pen.");
      return;
    }
    const updatedAt = new Date().toISOString();
    const changeDate = today();
    try {
      selectedBirds.forEach(bird => {
        const penUpdate = buildBirdPenUpdate({
          bird,
          nextPenId: moveTargetPenId,
          nextStatus: bird.status || "active",
          changeDate,
          reason: "pen_transfer",
          makeId: uid
        });
        onUpdateBird({
          ...bird,
          penId: penUpdate.penId,
          penHistory: penUpdate.penHistory,
          updatedAt
        });
      });
      closeMoveBirdsForm();
    } catch (err) {
      console.error(err);
      window.alert("Could not move the selected birds. Please try again.");
    }
  }

  function togglePenBirdVisualMode(pen) {
    if (!pen || typeof onUpdatePen !== "function") return;
    const currentMode = getPenBirdVisualMode(pen);
    const nextMode = currentMode === "photo" ? "sprite" : "photo";
    onUpdatePen({
      ...pen,
      birdVisualMode: nextMode,
      updatedAt: new Date().toISOString()
    });
  }

  function openThemePicker(penId) {
    if (!penId) return;
    setThemePickerPenId(penId);
  }

  function closeThemePicker() {
    setThemePickerPenId("");
  }

  function isInteractivePenHeaderTarget(target) {
    return !!(target && target.closest && target.closest("button,input,select,textarea,label,a"));
  }

  function handlePenHeaderThemeTap(event, penId) {
    if (!penId) return;
    if (isInteractivePenHeaderTarget(event.target)) return;
    openThemePicker(penId);
  }

  function saveFeedType() {
    const name = (feedTypeForm.name || "").trim();
    const defaultUnit = (feedTypeForm.defaultUnit || "").trim();
    const explicitColor = String(feedTypeForm.color || "").trim();
    const color = feedTypeColor({
      color: explicitColor,
      id: name
    }, name);
    const sackKgText = String(feedTypeForm.sackKg || "").trim();
    const sackKgValue = sackKgText === "" ? null : Number(sackKgText);
    if (!name || !defaultUnit) return;
    if (defaultUnit === "sack" && (!Number.isFinite(sackKgValue) || sackKgValue <= 0)) {
      window.alert("Enter how many kilograms are in one sack for this feed type.");
      return;
    }
    if (sackKgText && (!Number.isFinite(sackKgValue) || sackKgValue <= 0)) {
      window.alert("Kg per sack must be a valid number.");
      return;
    }
    const normalizedSackKg = Number.isFinite(sackKgValue) && sackKgValue > 0 ? sackKgValue : null;
    if (editingFeedTypeId) {
      if (typeof onUpdateFeedType !== "function") {
        window.alert("Feed type editing is currently unavailable.");
        return;
      }
      const existing = feedTypeById.get(editingFeedTypeId);
      if (!existing) {
        window.alert("This feed type is no longer available.");
        closeFeedTypeForm();
        return;
      }
      onUpdateFeedType({
        ...existing,
        name,
        defaultUnit,
        notes: (feedTypeForm.notes || "").trim(),
        color,
        sackKg: normalizedSackKg,
        updatedAt: new Date().toISOString()
      });
      closeFeedTypeForm();
      return;
    }
    onAddFeedType({
      id: uid(),
      name,
      defaultUnit,
      notes: (feedTypeForm.notes || "").trim(),
      color,
      sackKg: normalizedSackKg,
      createdAt: new Date().toISOString()
    });
    closeFeedTypeForm();
  }

  function deleteFeedType() {
    if (!editingFeedTypeId) return;
    if (typeof onDeleteFeedType !== "function") {
      window.alert("Feed type deletion is currently unavailable.");
      return;
    }
    const target = feedTypeById.get(editingFeedTypeId);
    if (!target) {
      closeFeedTypeForm();
      return;
    }
    const usageCount = penFeedLogs.filter(log => log.feedTypeId === editingFeedTypeId).length;
    const lines = [`Delete feed type "${target.name || "Untitled Feed Type"}"?`];
    if (usageCount) lines.push(`${usageCount} feed log${usageCount === 1 ? "" : "s"} using this type will also be deleted.`);
    const ok = window.confirm(lines.join("\n"));
    if (!ok) return;
    Promise.resolve(onDeleteFeedType(editingFeedTypeId)).then(() => {
      closeFeedTypeForm();
    }).catch(err => {
      console.error(err);
      window.alert("Could not delete feed type. Please try again.");
    });
  }

  function saveFeedLog() {
    if (!feedLogForm.penId || !feedLogForm.feedTypeId || !feedLogForm.amount) return;
    if (!hasActiveBirdsInPen(feedLogForm.penId)) {
      window.alert("Cannot log feed for this pen because it has no active birds assigned.");
      return;
    }
    const amount = Number(feedLogForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Feed amount must be a valid number.");
      return;
    }
    const unit = (feedLogForm.unit || "").trim();
    const sackKgText = String(feedLogForm.sackKg || "").trim();
    const sackKgValue = sackKgText === "" ? null : Number(sackKgText);
    if (unit === "sack" && (!Number.isFinite(sackKgValue) || sackKgValue <= 0)) {
      window.alert("Enter how many kilograms are in one sack for this feed log.");
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
    try {
      onAddPenFeedLog({
        id: uid(),
        penId: feedLogForm.penId,
        feedTypeId: feedLogForm.feedTypeId,
        amount,
        unit,
        sackKg: unit === "sack" ? sackKgValue : null,
        loggedAt: feedLogForm.loggedAt || today(),
        notes: (feedLogForm.notes || "").trim(),
        createdAt: new Date().toISOString()
      });
      setShowFeedLogForm(false);
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Could not save feed log. Please try again.");
    }
  }

  function deleteFeedLog(log) {
    if (!log?.id) return;
    if (typeof onDeletePenFeedLog !== "function") {
      window.alert("Feed log deletion is currently unavailable.");
      return;
    }
    const penName = penById.get(log.penId)?.name || "this pen";
    const feedName = feedTypeById.get(log.feedTypeId)?.name || "feed";
    const ok = window.confirm(`Delete ${feedName} log for ${penName} on ${fmtFeedLoggedAt(log.loggedAt)}?`);
    if (!ok) return;
    Promise.resolve(onDeletePenFeedLog(log.id)).catch(err => {
      console.error(err);
      window.alert("Could not delete feed log. Please try again.");
    });
  }

  function renderFarmTabs() {
    return React.createElement("nav", {
      className: "pens-farm-tabs"
    }, PEN_SCREEN_SLIDES.map(slide => React.createElement("button", {
      key: slide.id,
      type: "button",
      className: `pens-farm-tab${screen === slide.id ? " is-active" : ""}`,
      onClick: () => setScreen(slide.id)
    }, React.createElement("span", {
      className: "pens-farm-tab-icon"
    }, slide.id === "pens" ? React.createElement("img", {
      className: "pens-farm-tab-icon-img",
      src: PENS_SCREEN_NEST_CHICKS_ICON,
      alt: ""
    }) : PEN_SCREEN_ICONS[slide.id] || "\uD83D\uDC14"), React.createElement("span", null, slide.label))));
  }

  function renderBirdSprite(bird, emphasized, clickable = true, visualMode = "sprite") {
    const latestWeight = latestWeightByBird.get(bird.id);
    const spriteSize = getPenSpriteSize(latestWeight, bird.stage);
    const latestPhoto = visualMode === "photo" ? latestPhotoWithImage(photoCache[bird.id]) : null;
    const hasPhoto = !!latestPhoto?.dataUrl;
    const nickname = String(bird.nickname || "").trim();
    const displayName = nickname || bird.tagId || "Bird";
    const showTag = !!(nickname && bird.tagId);
    const isBookmarked = !!bird.bookmarked;
    const wrapperTag = clickable ? "button" : "div";
    return React.createElement(wrapperTag, {
      key: bird.id,
      type: clickable ? "button" : undefined,
      className: `pens-farm-bird-stall${emphasized ? " is-emphasized" : ""}`,
      onClick: clickable ? () => onOpenBird?.(bird.id, {
        penId: bird.penId || null
      }) : undefined,
      style: {
        border: emphasized ? "1px solid #1d4ed866" : isBookmarked ? "1px solid #eab308" : "1px solid #d9e3ef",
        background: emphasized ? "#eff6ff" : isBookmarked ? "#fff8cc" : "#ffffff",
        borderRadius: 14,
        padding: "10px 6px 10px",
        minHeight: 122,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
        cursor: clickable ? "pointer" : "default",
        width: "100%"
      }
    }, React.createElement("div", {
      className: "pens-farm-bird-visual"
    }, hasPhoto ? React.createElement("img", {
      className: "pens-farm-bird-photo",
      src: latestPhoto.dataUrl,
      alt: `${displayName} latest photo`,
      loading: "lazy"
    }) : visualMode !== "photo" && React.createElement(StageSprite, {
      stage: bird.stage,
      size: spriteSize
    })), React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 800,
        color: "#0f172a",
        lineHeight: 1.15,
        textAlign: "center",
        wordBreak: "break-word"
      }
    }, displayName), showTag && React.createElement("div", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        color: "#1d4ed8",
        lineHeight: 1.1,
        textAlign: "center",
        wordBreak: "break-word"
      }
    }, "Tag ", bird.tagId), latestWeight && React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#c2410c",
        fontWeight: 700
      }
    }, formatPenWeightDisplay(latestWeight.value, latestWeight.unit)));
  }

  const feedLogModal = showFeedLogForm && React.createElement(Modal, {
    title: "Add Pen Feed Log",
    onClose: () => setShowFeedLogForm(false)
  }, React.createElement(FL, {
    lbl: "Pen"
  }, React.createElement("select", {
    style: C.sel,
    value: feedLogForm.penId,
    onChange: e => setFeedLogForm({
      ...feedLogForm,
      penId: e.target.value
    })
  }, pens.map(pen => {
    const activeCount = (activeBirdsByPen.get(pen.id) || []).length;
    return React.createElement("option", {
      key: pen.id,
      value: pen.id,
      disabled: activeCount === 0
    }, `${pen.name} (${activeCount} active)`);
  }))), React.createElement(FL, {
    lbl: "Feed Type"
  }, React.createElement("select", {
    style: C.sel,
    value: feedLogForm.feedTypeId,
    onChange: e => {
      const nextFeedTypeId = e.target.value;
      const feedType = feedTypeById.get(nextFeedTypeId);
      setFeedLogForm({
        ...feedLogForm,
        feedTypeId: nextFeedTypeId,
        unit: feedType?.defaultUnit || feedLogForm.unit,
        sackKg: feedTypeSackKgText(feedType)
      });
    }
  }, feedTypes.map(feedType => React.createElement("option", {
    key: feedType.id,
    value: feedType.id
  }, feedType.name)))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.2fr 1fr",
      gap: 10
    }
  }, React.createElement(FL, {
    lbl: "Amount"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    step: "0.01",
    value: feedLogForm.amount,
    onChange: e => setFeedLogForm({
      ...feedLogForm,
      amount: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Unit"
  }, React.createElement(AnimatedSlider, {
    options: FEED_UNIT_SLIDES,
    value: FEED_UNIT_SLIDES.some(item => item.id === feedLogForm.unit) ? feedLogForm.unit : "kg",
    onChange: unit => setFeedLogForm({
      ...feedLogForm,
      unit,
      sackKg: unit === "sack" ? feedLogForm.sackKg || feedTypeSackKgText(feedTypeById.get(feedLogForm.feedTypeId)) : feedLogForm.sackKg
    })
  }))), feedLogForm.unit === "sack" && React.createElement(FL, {
    lbl: "Kg Per Sack"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "0",
    step: "0.01",
    value: feedLogForm.sackKg,
    onChange: e => setFeedLogForm({
      ...feedLogForm,
      sackKg: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Date"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: feedLogForm.loggedAt,
    onChange: e => setFeedLogForm({
      ...feedLogForm,
      loggedAt: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: feedLogForm.notes,
    onChange: e => setFeedLogForm({
      ...feedLogForm,
      notes: e.target.value
    })
  })), React.createElement("button", {
    type: "button",
    style: C.btn,
    onClick: saveFeedLog
  }, "Save Feed Log"));

  const themePickerPen = themePickerPenId ? penById.get(themePickerPenId) || null : null;
  const selectedThemeId = themePickerPen ? resolvedThemeIdByPen.get(themePickerPen.id) || DEFAULT_PEN_THEME_ID : DEFAULT_PEN_THEME_ID;
  const themePickerModal = themePickerPen && React.createElement("div", {
    className: "pens-farm-theme-modal-wrap",
    onClick: closeThemePicker
  }, React.createElement("div", {
    className: "pens-farm-theme-modal-card",
    onClick: event => event.stopPropagation()
  }, React.createElement("div", {
    className: "pens-farm-theme-modal-head"
  }, React.createElement("div", {
    className: "pens-farm-theme-modal-title"
  }, "Pen Theme"), React.createElement("button", {
    type: "button",
    onClick: closeThemePicker,
    style: C.sec
  }, "\u2715")), React.createElement("div", {
    className: "pens-farm-theme-modal-copy"
  }, themePickerPen.name || "Untitled Pen"), React.createElement("div", {
    className: "pens-farm-theme-dots"
  }, PEN_THEME_OPTIONS.map(theme => React.createElement("button", {
    key: `${themePickerPen.id}-theme-modal-${theme.id}`,
    type: "button",
    title: theme.name,
    className: `pens-farm-theme-dot${selectedThemeId === theme.id ? " is-active" : ""}`,
    style: {
      background: `linear-gradient(135deg, ${theme.woodA}, ${theme.woodB})`
    },
    onClick: () => updatePenTheme(themePickerPen, theme.id)
  }))), React.createElement("div", {
    className: "pens-farm-theme-modal-copy"
  }, "Selected: ", getPenTheme(selectedThemeId).name)));

  const isAllAssignableBirdsChecked = !!unassignedActiveBirds.length && assignBirdIds.length === unassignedActiveBirds.length;
  const assignBirdsModal = showAssignBirdsForm && React.createElement(Modal, {
    title: "Assign Birds",
    onClose: closeAssignBirdsForm
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.45,
      marginBottom: 14
    }
  }, "Pick a pen, check the active birds that are still unassigned, then save them together."), React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#475569",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, "Pens"), !pens.length ? React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 14
    }
  }, "Add a pen first before assigning birds.") : React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
      gap: 8,
      marginBottom: 14
    }
  }, pens.map(pen => {
    const activeCount = (activeBirdsByPen.get(pen.id) || []).length;
    const isActive = assignTargetPenId === pen.id;
    return React.createElement("button", {
      key: `assign-pen-${pen.id}`,
      type: "button",
      onClick: () => setAssignTargetPenId(pen.id),
      style: {
        border: isActive ? "2px solid #4f772d" : "1px solid #cbd5e1",
        background: isActive ? "#f3f9eb" : "#ffffff",
        borderRadius: 14,
        padding: "10px 12px",
        textAlign: "left",
        cursor: "pointer",
        boxShadow: isActive ? "0 10px 18px -18px #4f772d" : "none"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, pen.name || "Pen"), React.createElement("div", {
      style: {
        marginTop: 3,
        fontSize: 12,
        color: "#64748b"
      }
    }, pen.location || "No location"), React.createElement("div", {
      style: {
        marginTop: 6,
        fontSize: 11,
        fontWeight: 800,
        color: isActive ? "#4f772d" : "#64748b",
        textTransform: "uppercase",
        letterSpacing: ".06em"
      }
    }, activeCount, " active"));
  })), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 8,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#475569",
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, "Unassigned Birds"), React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: 13,
      fontWeight: 700,
      color: unassignedActiveBirds.length ? "#334155" : "#94a3b8",
      cursor: unassignedActiveBirds.length ? "pointer" : "default"
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: isAllAssignableBirdsChecked,
    disabled: !unassignedActiveBirds.length,
    onChange: toggleAssignBirdsCheckAll
  }), isAllAssignableBirdsChecked ? "Uncheck all" : "Check all")), !unassignedActiveBirds.length ? React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 14
    }
  }, "All active birds already have a pen assigned.") : React.createElement("div", {
    style: {
      border: "1px solid #d9e3ef",
      borderRadius: 16,
      background: "#f8fafc",
      maxHeight: 320,
      overflowY: "auto",
      marginBottom: 14
    }
  }, unassignedActiveBirds.map((bird, index) => {
    const checked = assignBirdIds.includes(bird.id);
    const nickname = String(bird.nickname || "").trim();
    const birdName = nickname || bird.tagId || "Bird";
    const birdMeta = [nickname && bird.tagId ? `Tag ${bird.tagId}` : "", penBirdDetailLabel(bird.stage), penBirdDetailLabel(bird.sex)].filter(Boolean).join(" · ");
    return React.createElement("label", {
      key: `assign-bird-${bird.id}`,
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        cursor: "pointer",
        background: checked ? "#eef6e8" : "transparent",
        borderBottom: index === unassignedActiveBirds.length - 1 ? "none" : "1px solid #e2e8f0"
      }
    }, React.createElement("input", {
      type: "checkbox",
      checked,
      onChange: () => toggleAssignBird(bird.id),
      style: {
        marginTop: 2
      }
    }), React.createElement("div", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: "#0f172a",
        lineHeight: 1.25,
        wordBreak: "break-word"
      }
    }, birdName), React.createElement("div", {
      style: {
        marginTop: 4,
        fontSize: 13,
        color: "#64748b",
        lineHeight: 1.35,
        wordBreak: "break-word"
      }
    }, birdMeta || "Ready to assign")));
  })), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#64748b",
      fontWeight: 700
    }
  }, assignBirdIds.length ? `${fmtNum(assignBirdIds.length)} bird${assignBirdIds.length === 1 ? "" : "s"} selected` : "No birds selected yet"), React.createElement("button", {
    type: "button",
    style: {
      ...C.btn,
      minWidth: 168,
      opacity: assignTargetPenId && assignBirdIds.length ? 1 : .6,
      cursor: assignTargetPenId && assignBirdIds.length ? "pointer" : "not-allowed"
    },
    disabled: !assignTargetPenId || !assignBirdIds.length,
    onClick: saveAssignedBirds
  }, "Assign Birds")));
  const isAllMovableBirdsChecked = !!filteredMoveSourceBirds.length && moveBirdIds.length === filteredMoveSourceBirds.length;
  const moveBirdsModal = showMoveBirdsForm && React.createElement(Modal, {
    title: "Move Birds",
    onClose: closeMoveBirdsForm
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.45,
      marginBottom: 14
    }
  }, "Pick the source pen, check the chicks or birds you want to move, then choose the destination pen."), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
      gap: 12,
      marginBottom: 14
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#475569",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, "From Pen"), !pensWithActiveBirds.length ? React.createElement("div", {
    style: C.card
  }, "No pens with active birds are ready to move from.") : React.createElement("div", {
    style: {
      display: "grid",
      gap: 8
    }
  }, pensWithActiveBirds.map(pen => {
    const isActive = moveSourcePenId === pen.id;
    const activeCount = (activeBirdsByPen.get(pen.id) || []).length;
    return React.createElement("button", {
      key: `move-source-${pen.id}`,
      type: "button",
      onClick: () => setMoveSourcePenId(pen.id),
      style: {
        border: isActive ? "2px solid #1d4ed8" : "1px solid #cbd5e1",
        background: isActive ? "#eff6ff" : "#ffffff",
        borderRadius: 14,
        padding: "10px 12px",
        textAlign: "left",
        cursor: "pointer"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, pen.name || "Pen"), React.createElement("div", {
      style: {
        marginTop: 4,
        fontSize: 12,
        color: "#64748b"
      }
    }, activeCount, " active"));
  }))), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#475569",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, "To Pen"), !moveTargetPens.length ? React.createElement("div", {
    style: C.card
  }, "Add another pen first so birds have somewhere to move.") : React.createElement("div", {
    style: {
      display: "grid",
      gap: 8
    }
  }, moveTargetPens.map(pen => {
    const isActive = moveTargetPenId === pen.id;
    const activeCount = (activeBirdsByPen.get(pen.id) || []).length;
    return React.createElement("button", {
      key: `move-target-${pen.id}`,
      type: "button",
      onClick: () => setMoveTargetPenId(pen.id),
      style: {
        border: isActive ? "2px solid #4f772d" : "1px solid #cbd5e1",
        background: isActive ? "#f3f9eb" : "#ffffff",
        borderRadius: 14,
        padding: "10px 12px",
        textAlign: "left",
        cursor: "pointer"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: "#0f172a"
      }
    }, pen.name || "Pen"), React.createElement("div", {
      style: {
        marginTop: 4,
        fontSize: 12,
        color: "#64748b"
      }
    }, activeCount, " active"));
  })))), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 8,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#475569",
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, moveSourcePenId ? "Birds To Move" : "Birds"), React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: 13,
      fontWeight: 700,
      color: filteredMoveSourceBirds.length ? "#334155" : "#94a3b8",
      cursor: filteredMoveSourceBirds.length ? "pointer" : "default"
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: isAllMovableBirdsChecked,
    disabled: !filteredMoveSourceBirds.length,
    onChange: toggleMoveBirdsCheckAll
  }), isAllMovableBirdsChecked ? "Uncheck all" : "Check all")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 14
    }
  }, React.createElement(FL, {
    lbl: "Batch"
  }, React.createElement("select", {
    style: C.sel,
    value: moveBatchFilter,
    onChange: e => setMoveBatchFilter(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All batches"), moveBatchOptions.map(option => React.createElement("option", {
    key: `move-batch-${option.id}`,
    value: option.id
  }, option.label)))), React.createElement(FL, {
    lbl: "Stage"
  }, React.createElement("select", {
    style: C.sel,
    value: moveStageFilter,
    onChange: e => setMoveStageFilter(e.target.value)
  }, React.createElement("option", {
    value: "all"
  }, "All stages"), moveStageOptions.map(option => React.createElement("option", {
    key: `move-stage-${option.id}`,
    value: option.id
  }, option.label))))), !moveSourceBirds.length ? React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 14
    }
  }, moveSourcePenId ? "No active birds are currently in the selected source pen." : "Pick a source pen to list the birds you can move.") : !filteredMoveSourceBirds.length ? React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 14
    }
  }, "No birds match the selected batch and stage filters.") : React.createElement("div", {
    style: {
      border: "1px solid #d9e3ef",
      borderRadius: 16,
      background: "#f8fafc",
      maxHeight: 320,
      overflowY: "auto",
      marginBottom: 14
    }
  }, filteredMoveSourceBirds.map((bird, index) => {
    const checked = moveBirdIds.includes(bird.id);
    const nickname = String(bird.nickname || "").trim();
    const birdName = nickname || bird.tagId || "Bird";
    const birdMeta = [birdBatchChipLabel(bird, batchById), nickname && bird.tagId ? `Tag ${bird.tagId}` : "", penBirdDetailLabel(bird.stage), penBirdDetailLabel(bird.sex)].filter(Boolean).join(" · ");
    return React.createElement("label", {
      key: `move-bird-${bird.id}`,
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        cursor: "pointer",
        background: checked ? "#eff6ff" : "transparent",
        borderBottom: index === filteredMoveSourceBirds.length - 1 ? "none" : "1px solid #e2e8f0"
      }
    }, React.createElement("input", {
      type: "checkbox",
      checked,
      onChange: () => toggleMoveBird(bird.id),
      style: {
        marginTop: 2
      }
    }), React.createElement("div", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: "#0f172a",
        lineHeight: 1.25,
        wordBreak: "break-word"
      }
    }, birdName), React.createElement("div", {
      style: {
        marginTop: 4,
        fontSize: 13,
        color: "#64748b",
        lineHeight: 1.35,
        wordBreak: "break-word"
      }
    }, birdMeta || "Ready to move")));
  })), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#64748b",
      fontWeight: 700
    }
  }, moveBirdIds.length ? `${fmtNum(moveBirdIds.length)} bird${moveBirdIds.length === 1 ? "" : "s"} selected` : filteredMoveSourceBirds.length ? "No birds selected yet" : "No filtered birds selected"), React.createElement("button", {
    type: "button",
    style: {
      ...C.btn,
      minWidth: 168,
      opacity: moveSourcePenId && moveTargetPenId && moveBirdIds.length ? 1 : .6,
      cursor: moveSourcePenId && moveTargetPenId && moveBirdIds.length ? "pointer" : "not-allowed"
    },
    disabled: !moveSourcePenId || !moveTargetPenId || !moveBirdIds.length,
    onClick: saveMovedBirds
  }, "Move Birds")));

  const addCtaLabel = screen === "pens" ? "Add New Pen" : screen === "types" ? "Add Feed Type" : "Add Feed Log";
  const primaryCta = React.createElement("button", {
    type: "button",
    className: "pens-farm-add-btn pens-farm-primary-btn",
    onClick: () => {
      if (screen === "pens") openPenForm();
      if (screen === "types") openAddFeedTypeForm();
      if (screen === "feed") openFeedLogForm();
    }
  }, React.createElement("span", null, "+"), " ", addCtaLabel);
  const headerActions = screen === "pens" ? React.createElement("div", {
    className: "pens-farm-header-actions"
  }, primaryCta, React.createElement("button", {
    type: "button",
    className: "pens-farm-add-btn pens-farm-compact-btn",
    onClick: openAssignBirdsForm,
    title: "Assign birds to a pen",
    "aria-label": "Assign birds to a pen"
  }, React.createElement("span", {
    className: "pens-farm-assign-btn-icon"
  }, "\uD83D\uDC14"), React.createElement("span", null, "Assign")), React.createElement("button", {
    type: "button",
    className: "pens-farm-add-btn pens-farm-compact-btn",
    onClick: openMoveBirdsForm,
    title: "Move birds between pens",
    "aria-label": "Move birds between pens"
  }, React.createElement("span", {
    className: "pens-farm-assign-btn-icon"
  }, "\u21C4"), React.createElement("span", null, "Move"))) : primaryCta;

  return React.createElement("div", {
    style: C.body,
    className: "pens-farm-shell"
  }, React.createElement("header", {
    className: "pens-farm-header"
  }, React.createElement("div", {
    className: "pens-farm-header-title"
  }, React.createElement("div", {
    className: "pens-farm-header-icon"
  }, React.createElement("img", {
    className: "pens-farm-header-icon-img",
    src: PENS_SCREEN_NEST_CHICKS_ICON,
    alt: ""
  })), React.createElement("div", {
    className: "pens-farm-header-copy"
  }, React.createElement("h1", null, "My Farm ", React.createElement("span", null, "Pens")), React.createElement("div", null, "Manage birds, feed logs, and feed types"))), screen === "pens" ? headerActions : primaryCta), renderFarmTabs(), screen === "pens" && React.createElement("div", null, !pens.length && React.createElement("section", {
    className: "pens-farm-empty-pen-card"
  }, React.createElement("div", {
    className: "pens-farm-empty-title"
  }, "Example Pen"), React.createElement("div", {
    className: "pens-farm-empty-sub"
  }, "New Territory"), React.createElement("div", {
    className: "pens-farm-empty-body"
  }, React.createElement("div", {
    className: "pens-farm-empty-icon"
  }, "\uD83D\uDE9C"), React.createElement("p", null, "No pens yet. Start by adding your first pen."), React.createElement("button", {
    type: "button",
    onClick: openPenForm
  }, "Start setup \u2192"))), !!currentPensCarouselPen && (() => {
    const pen = currentPensCarouselPen;
    const currentBirds = activeBirdsByPen.get(pen.id) || [];
    const penLogs = logsByPen.get(pen.id) || [];
    const recentLogs = penLogs.slice(0, 3);
    const latestLog = recentLogs[0] || null;
    const latestAllocation = latestLog ? logAllocations.get(latestLog.id) : null;
    const canQuickLog = currentBirds.length > 0;
    const birdsPerRow = 3;
    const previewRows = 2;
    const previewCount = birdsPerRow * previewRows;
    const canExpandBirds = currentBirds.length > previewCount;
    const isBirdsExpanded = !!expandedPenBirds[pen.id];
    const shownBirds = canExpandBirds && !isBirdsExpanded ? currentBirds.slice(0, previewCount) : currentBirds;
    const birdVisualMode = getPenBirdVisualMode(pen);
    const penFeedLabel = latestLog ? feedTypeById.get(latestLog.feedTypeId)?.name || "Feed" : "No feed logs yet";
    const penThemeId = resolvedThemeIdByPen.get(pen.id) || DEFAULT_PEN_THEME_ID;
    const penTheme = getPenTheme(penThemeId);
    const penThemeVars = {
      "--pen-wood-a": penTheme.woodA,
      "--pen-wood-b": penTheme.woodB,
      "--pen-wood-c": penTheme.woodC,
      "--pen-badge-birds": penTheme.badgeBirds,
      "--pen-badge-logs": penTheme.badgeLogs,
      "--pen-latest-bg": penTheme.latestBg,
      "--pen-latest-border": penTheme.latestBorder,
      "--pen-latest-kicker": penTheme.latestKicker,
      "--pen-quick-color": penTheme.quickColor,
      "--pen-quick-border": penTheme.quickBorder,
      "--pen-grass": penTheme.grass,
      "--pen-fence-line": penTheme.fenceLine
    };
    return React.createElement(React.Fragment, null, React.createElement("div", {
      style: {
        marginBottom: 8,
        textAlign: "center",
        fontSize: 12,
        color: "#64748b",
        fontWeight: 800,
        letterSpacing: ".06em",
        textTransform: "uppercase"
      }
    }, "Pen ", pensCarouselIndex + 1, " of ", pens.length), React.createElement("section", {
      className: "pens-farm-pen-card",
      style: penThemeVars
    }, React.createElement("div", {
      className: "pens-farm-pen-header",
      title: "Tap or click header background to change pen theme",
      role: "button",
      tabIndex: 0,
      onClick: e => handlePenHeaderThemeTap(e, pen.id),
      onKeyDown: e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        handlePenHeaderThemeTap(e, pen.id);
      }
    }, React.createElement("div", {
      className: "pens-farm-pen-meta"
    }, React.createElement("button", {
      type: "button",
      className: "pens-farm-pen-name-btn",
      title: "Edit pen name",
      onClick: e => {
        e.stopPropagation();
        renamePen(pen);
      }
    }, pen.name), React.createElement("p", null, "\uD83D\uDCCD ", pen.location || "No location set")), React.createElement("div", {
      className: "pens-farm-pen-badges"
    }, React.createElement("button", {
      type: "button",
      className: "pens-farm-bookmark-btn",
      title: pen.bookmarked ? "Bookmarked" : "Bookmark pen",
      "aria-label": pen.bookmarked ? "Bookmarked" : "Bookmark pen",
      style: bookmarkButtonStyle(!!pen.bookmarked),
      onClick: e => {
        e.stopPropagation();
        togglePenBookmark(pen);
      }
    }, bookmarkButtonTheme(!!pen.bookmarked).icon), React.createElement("button", {
      type: "button",
      className: "pens-farm-visual-toggle",
      title: birdVisualMode === "photo" ? "Photo mode" : "Sprite mode",
      "aria-label": birdVisualMode === "photo" ? "Photo mode" : "Sprite mode",
      onClick: e => {
        e.stopPropagation();
        togglePenBirdVisualMode(pen);
      }
    }, birdVisualMode === "photo" ? "\uD83D\uDDBC" : "\uD83D\uDC25"), React.createElement("span", {
      className: "pens-farm-badge birds"
    }, currentBirds.length, " \uD83D\uDC14"))), React.createElement("div", {
      className: "pens-farm-pen-content"
    }, !!currentBirds.length && React.createElement("div", {
      className: "pens-farm-bird-grid"
    }, shownBirds.map(bird => renderBirdSprite(bird, false, true, birdVisualMode))), canExpandBirds && React.createElement("button", {
      type: "button",
      className: "pens-farm-birds-expand-btn",
      title: isBirdsExpanded ? "Collapse chickens" : "Show all chickens",
      onClick: e => {
        e.stopPropagation();
        togglePenBirdExpand(pen.id);
      }
    }, React.createElement("span", {
      className: "pens-farm-double-v"
    }, isBirdsExpanded ? "\u2303\u2303" : "\u2304\u2304"), React.createElement("span", {
      className: "pens-farm-birds-expand-copy"
    }, isBirdsExpanded ? "Show less" : `Show all ${currentBirds.length}`)), React.createElement("div", {
      className: "pens-farm-latest-feed"
    }, React.createElement("div", {
      className: "pens-farm-latest-kicker"
    }, "Latest Feed Supply"), React.createElement("div", {
      className: "pens-farm-latest-main"
    }, latestLog ? `${fmtNum(latestLog.amount)} ${latestLog.unit}` : "\u2014"), React.createElement("div", {
      className: "pens-farm-latest-sub"
    }, latestLog ? `\u2022 ${penFeedLabel}` : "\u2022 add your first feed log"), React.createElement("p", {
      className: "pens-farm-latest-meta"
    }, latestLog ? `\uD83D\uDCC5 ${fmtFeedLoggedAt(latestLog.loggedAt)}` : "\uD83D\uDCC5 no date yet", latestAllocation && latestAllocation.birdCount ? ` | est. ${fmtNum(latestAllocation.perBirdAmount)} ${latestLog.unit} per bird` : ""), React.createElement("button", {
      type: "button",
      className: "pens-farm-quick-add",
      disabled: !canQuickLog,
      onClick: e => {
        e.stopPropagation();
        if (!canQuickLog) return;
        openFeedLogForm(pen.id);
      }
    }, canQuickLog ? "+" : "\u2014")), React.createElement("button", {
      type: "button",
      className: "pens-farm-pen-delete-btn",
      title: "Delete pen",
      onClick: e => {
        e.stopPropagation();
        deletePen(pen);
      }
    }, "\uD83D\uDDD1")), React.createElement("div", {
      className: "pens-farm-fence-row"
    }, PEN_FENCE_POSTS.map(id => React.createElement("span", {
      key: `${pen.id}-fence-${id}`,
      className: "pens-farm-fence-post"
    })), React.createElement("span", {
      className: "pens-farm-fence-line"
    })), React.createElement("div", {
      className: "pens-farm-grass-footer"
    }, PEN_GRASS_POSITIONS.map((left, index) => React.createElement("span", {
      key: `${pen.id}-grass-${index}`,
      className: "pens-farm-grass-blade",
      style: {
        left
      }
    })))));
  })(), !!currentPensCarouselPen && pens.length > 1 && React.createElement(React.Fragment, null, React.createElement("button", {
    type: "button",
    onClick: () => stepPensCarousel(-1),
    disabled: !canMovePrevPen,
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
      zIndex: 84,
      opacity: canMovePrevPen ? 1 : .45,
      cursor: canMovePrevPen ? "pointer" : "default"
    }
  }, "\u2190"), React.createElement("button", {
    type: "button",
    onClick: () => stepPensCarousel(1),
    disabled: !canMoveNextPen,
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
      zIndex: 84,
      opacity: canMoveNextPen ? 1 : .45,
      cursor: canMoveNextPen ? "pointer" : "default"
    }
  }, "\u2192")), React.createElement("footer", {
    className: "pens-farm-footer"
  }, React.createElement("p", null, "\xA9 2026 Poultry Tracker Systems"))), screen === "feed" && React.createElement("div", null, !pens.length && React.createElement(Empty, {
    icon: "\uD83E\uDDC6",
    msg: "Add a pen before logging feed"
  }), !!pens.length && !feedTypes.length && React.createElement(Empty, {
    icon: "\uD83E\uDDC6",
    msg: "Add a feed type before logging feed"
  }), !!pens.length && !!feedTypes.length && React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 8
    }
  }, "Pen feed is logged once and estimated per bird from who was in the pen that day.")), !sortedLogs.length && React.createElement(Empty, {
    icon: "\uD83E\uDDC6",
    msg: "No pen feed logs yet"
  }), sortedLogs.map(log => {
    const pen = pens.find(item => item.id === log.penId);
    const feedType = feedTypeById.get(log.feedTypeId);
    const allocation = logAllocations.get(log.id);
    const birdsInSplit = (allocation?.birdIds || []).map(id => birds.find(bird => bird.id === id)?.tagId || id).filter(Boolean);
    const deleteButton = React.createElement("button", {
      type: "button",
      style: {
        ...C.del,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12
      },
      onClick: () => deleteFeedLog(log)
    }, "Delete");
    const rightMeta = React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        flexShrink: 0
      }
    }, React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 900,
        color: "#c2410c"
      }
    }, fmtNum(log.amount), " ", log.unit), deleteButton);
    return React.createElement("div", {
      key: log.id,
      style: C.card
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
    }, pen?.name || "Unknown pen"), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 13,
        marginTop: 3
      }
    }, fmtFeedLoggedAt(log.loggedAt), " \u00B7 ", feedType?.name || "Feed")), rightMeta), React.createElement("div", {
      style: {
        color: "#475569",
        marginTop: 8,
        fontSize: 14,
        lineHeight: 1.45
      }
    }, allocation?.birdCount ? `Estimated split: ${fmtNum(allocation.perBirdAmount)} ${log.unit} across ${allocation.birdCount} birds` : "Estimated split unavailable because no active birds were in the pen on that date."), !!birdsInSplit.length && React.createElement("div", {
      style: {
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginTop: 8
      }
    }, birdsInSplit.slice(0, 10).map(tagId => React.createElement("span", {
      key: tagId,
      style: {
        ...C.badge("#475569"),
        background: "#f5f8fc",
        color: "#0f172a"
      }
    }, tagId))), log.notes && React.createElement("div", {
      style: {
        marginTop: 8,
        color: "#475569",
        fontSize: 14
      }
    }, log.notes));
  })), screen === "types" && React.createElement("div", null, !feedTypes.length && React.createElement(Empty, {
    icon: "\uD83E\uDDC6",
    msg: "No feed types yet"
  }), feedTypes.map(feedType => {
    const feedTheme = getFeedTypeTheme(feedType, feedType.id);
    return React.createElement("div", {
      key: feedType.id,
      role: "button",
      tabIndex: 0,
      onClick: () => openEditFeedTypeForm(feedType),
      onKeyDown: e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openEditFeedTypeForm(feedType);
      },
      style: {
        ...C.card,
        background: feedTheme.soft,
        borderColor: feedTheme.border,
        cursor: "pointer"
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: 10
      }
    }, React.createElement("div", {
      style: {
        fontSize: 17,
        fontWeight: 800,
        color: feedTheme.color,
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, React.createElement("span", {
      style: {
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: feedTheme.color,
        boxShadow: `0 0 0 3px ${feedTheme.badge}`
      }
    }), feedType.name), React.createElement("div", {
      style: C.badge(feedTheme.color)
    }, feedType.defaultUnit)), Number(feedType.sackKg) > 0 && React.createElement("div", {
      style: {
        marginTop: 8,
        color: feedTheme.color,
        fontSize: 13,
        fontWeight: 700
      }
    }, "1 sack = ", fmtNum(feedType.sackKg), " kg"), feedType.notes && React.createElement("div", {
      style: {
        marginTop: 8,
        color: "#475569",
        fontSize: 14
      }
    }, feedType.notes));
  })), showPenForm && React.createElement(Modal, {
    title: "Add Pen",
    onClose: () => setShowPenForm(false)
  }, React.createElement(FL, {
    lbl: "Pen Name"
  }, React.createElement("input", {
    style: C.inp,
    value: penForm.name,
    onChange: e => setPenForm({
      ...penForm,
      name: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Location"
  }, React.createElement("input", {
    style: C.inp,
    value: penForm.location,
    onChange: e => setPenForm({
      ...penForm,
      location: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Theme"
  }, React.createElement("div", {
    className: "pens-farm-theme-dots"
  }, PEN_THEME_OPTIONS.map(theme => React.createElement("button", {
    key: `new-pen-theme-${theme.id}`,
    type: "button",
    title: theme.name,
    className: `pens-farm-theme-dot${getPenTheme(penForm.themeId).id === theme.id ? " is-active" : ""}`,
    style: {
      background: `linear-gradient(135deg, ${theme.woodA}, ${theme.woodB})`
    },
    onClick: () => setPenForm({
      ...penForm,
      themeId: theme.id
    })
  }))), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 13,
      color: "#475569",
      fontWeight: 700
    }
  }, "Selected: ", getPenTheme(penForm.themeId).name)), React.createElement(FL, {
    lbl: "Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: penForm.notes,
    onChange: e => setPenForm({
      ...penForm,
      notes: e.target.value
    })
  })), React.createElement("button", {
    type: "button",
    style: C.btn,
    onClick: savePen
  }, "Save Pen")), showFeedTypeForm && React.createElement(Modal, {
    title: editingFeedTypeId ? "Edit Feed Type" : "Add Feed Type",
    onClose: closeFeedTypeForm
  }, editingFeedTypeId && React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end"
    }
  }, React.createElement("button", {
    type: "button",
    style: {
      ...C.del,
      padding: "8px 10px",
      minWidth: 0
    },
    title: "Delete feed type",
    "aria-label": "Delete feed type",
    onClick: deleteFeedType
  }, "\uD83D\uDDD1")), React.createElement(FL, {
    lbl: "Feed Name"
  }, React.createElement("input", {
    style: C.inp,
    value: feedTypeForm.name,
    onChange: e => setFeedTypeForm({
      ...feedTypeForm,
      name: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Default Unit"
  }, React.createElement(AnimatedSlider, {
    options: FEED_UNIT_SLIDES,
    value: feedTypeForm.defaultUnit,
    onChange: defaultUnit => setFeedTypeForm({
      ...feedTypeForm,
      defaultUnit
    })
  })), React.createElement(FL, {
    lbl: "Color"
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10
    }
  }, FEED_TYPE_COLOR_SWATCHES.map(color => React.createElement("button", {
    key: color,
    type: "button",
    title: color,
    onClick: () => setFeedTypeForm({
      ...feedTypeForm,
      color
    }),
    style: {
      width: 28,
      height: 28,
      borderRadius: "50%",
      border: feedTypeForm.color === color ? "3px solid #0f172a" : "2px solid #ffffff",
      boxShadow: `0 0 0 1px ${hexToRgba(color, .35)}`,
      background: color,
      cursor: "pointer"
    }
  })))), feedTypeForm.defaultUnit === "sack" && React.createElement(FL, {
    lbl: "Kg Per Sack"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "0",
    step: "0.01",
    value: feedTypeForm.sackKg,
    onChange: e => setFeedTypeForm({
      ...feedTypeForm,
      sackKg: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: feedTypeForm.notes,
    onChange: e => setFeedTypeForm({
      ...feedTypeForm,
      notes: e.target.value
    })
  })), React.createElement("button", {
    type: "button",
    style: C.btn,
    onClick: saveFeedType
  }, editingFeedTypeId ? "Save Changes" : "Save Feed Type")), feedLogModal, assignBirdsModal, moveBirdsModal, themePickerModal);
}
