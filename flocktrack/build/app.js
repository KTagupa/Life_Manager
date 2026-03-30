// Generated bundle: build/app.js. Edit source files, then run npm run build.

/* FILE: src/core/runtime.js */
const {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef
} = React;

/* FILE: src/core/logic.shared.js */
(function(root, factory) {
  const api = factory();
  root.FlockTrackLogic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const DAY_MS = 86400000;
  const STAGE_SUGGESTION_DAYS = {
    chickMax: 42,
    juvenileMax: 140,
    broilerStart: 35,
    broilerMature: 63
  };
  const RETENTION_DAYS = {
    sold: 90,
    deceased: 30,
    culled: 30
  };
  const FINANCE_CATEGORY_DEFS = [{
    id: "bird_sale",
    type: "income",
    label: "Bird Sale",
    manual: false
  }, {
    id: "egg_sale",
    type: "income",
    label: "Egg Sale",
    manual: true
  }, {
    id: "chick_sale",
    type: "income",
    label: "Chick Sale",
    manual: true
  }, {
    id: "manure_sale",
    type: "income",
    label: "Manure Sale",
    manual: true
  }, {
    id: "other_income",
    type: "income",
    label: "Other Income",
    manual: true
  }, {
    id: "feed",
    type: "expense",
    label: "Feed",
    manual: true
  }, {
    id: "medicine",
    type: "expense",
    label: "Medicine",
    manual: true
  }, {
    id: "utilities",
    type: "expense",
    label: "Utilities",
    manual: true
  }, {
    id: "labor",
    type: "expense",
    label: "Labor",
    manual: true
  }, {
    id: "equipment",
    type: "expense",
    label: "Equipment",
    manual: true
  }, {
    id: "transport",
    type: "expense",
    label: "Transport",
    manual: true
  }, {
    id: "maintenance",
    type: "expense",
    label: "Maintenance",
    manual: true
  }, {
    id: "other_expense",
    type: "expense",
    label: "Other Expense",
    manual: true
  }];
  const FINANCE_CATEGORY_LABELS = Object.fromEntries(FINANCE_CATEGORY_DEFS.map(def => [def.id, def.label]));
  const FINANCE_CATEGORY_BY_ID = new Map(FINANCE_CATEGORY_DEFS.map(def => [def.id, def]));
  const FINANCE_MANUAL_CATEGORY_OPTIONS = {
    income: FINANCE_CATEGORY_DEFS.filter(def => def.type === "income" && def.manual).map(def => ({
      id: def.id,
      label: def.label
    })),
    expense: FINANCE_CATEGORY_DEFS.filter(def => def.type === "expense" && def.manual).map(def => ({
      id: def.id,
      label: def.label
    }))
  };
  const FINANCE_FEED_UNIT_OPTIONS = [{
    id: "kg",
    label: "kg"
  }, {
    id: "g",
    label: "g"
  }, {
    id: "lb",
    label: "lb"
  }, {
    id: "sack",
    label: "sack"
  }];
  const HATCH_INCUBATION_DAYS = 21;
  const HATCH_ALERT_WINDOW_DAYS = 2;
  const INCUBATION_REMINDER_WINDOW_DAYS = 1;
  const INCUBATION_SCHEDULE = [{
    id: "early_embryo",
    startDay: 1,
    endDay: 7,
    label: "Early embryo development",
    shortLabel: "Early embryo",
    humidity: "45-50% RH",
    purpose: "Allows gradual water loss from the egg and proper air cell formation.",
    action: "Keep humidity steady while the embryo begins forming."
  }, {
    id: "organ_development",
    startDay: 8,
    endDay: 14,
    label: "Organ development",
    shortLabel: "Organ development",
    humidity: "45-50% RH",
    purpose: "Maintains steady evaporation and embryo growth.",
    action: "Keep humidity steady and verify normal incubator conditions."
  }, {
    id: "late_development",
    startDay: 15,
    endDay: 17,
    label: "Late development",
    shortLabel: "Late development",
    humidity: "50-55% RH",
    purpose: "Slightly higher humidity helps prevent membranes drying as chicks grow.",
    action: "Raise humidity slightly as the chicks enter late development."
  }, {
    id: "lockdown",
    startDay: 18,
    endDay: 21,
    label: "Hatching stage (lockdown)",
    shortLabel: "Lockdown",
    humidity: "65-75% RH",
    purpose: "Higher humidity softens the shell and membranes for pipping and hatch.",
    action: "Increase humidity and stop turning eggs for lockdown."
  }];
  const STATUS_DATE_FIELDS = {
    sold: "soldDate",
    deceased: "deceasedDate",
    culled: "culledDate"
  };
  const normalizeTagId = tag => String(tag == null ? "" : tag).trim().toUpperCase();
  const ageDays = (dateValue, nowMs = Date.now()) => dateValue ? Math.floor((nowMs - new Date(dateValue).getTime()) / DAY_MS) : null;
  const pad3 = n => String(Math.max(1, Number(n) || 1)).padStart(3, "0");
  const nextCode = batches => {
    let max = 0;
    batches.forEach(batch => {
      const match = batch.code && batch.code.match(/(\d+)$/);
      if (match) max = Math.max(max, Number(match[1]) || 0);
    });
    return `B${String(max + 1).padStart(3, "0")}`;
  };
  const eggCode = (batchCode, index) => {
    const match = (batchCode || "").match(/(\d+)$/);
    return `C-B${match ? match[1].padStart(3, "0") : "000"}-${String(index + 1).padStart(3, "0")}`;
  };
  const outsiderTagCode = (batchNo, indivNo) => `OB${pad3(batchNo)}-${pad3(indivNo)}`;
  const parseOutsiderTagCode = tagId => {
    const match = normalizeTagId(tagId).match(/^OB(\d{3})-(\d{3})$/);
    if (!match) return null;
    return {
      batchNo: Number(match[1]) || 1,
      indivNo: Number(match[2]) || 1
    };
  };
  const normalizeDay = value => {
    if (!value) return "";
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) return "";
    return new Date(ms).toISOString().slice(0, 10);
  };
  const addDaysToDay = (dayValue, offsetDays) => {
    const day = normalizeDay(dayValue);
    if (!day) return "";
    const ms = new Date(`${day}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(ms)) return "";
    return new Date(ms + (Number(offsetDays) || 0) * DAY_MS).toISOString().slice(0, 10);
  };
  const dayToNoonIso = dayValue => {
    const day = normalizeDay(dayValue);
    return day ? new Date(`${day}T12:00:00.000Z`).toISOString() : "";
  };
  const incubationCheckpointTitle = stage => {
    if (!stage) return "Incubation checkpoint";
    if (stage.startDay === 1) return "Start incubation";
    if (stage.startDay === 8) return "Day 8 stage check";
    if (stage.startDay === 15) return "Day 15 humidity adjustment";
    if (stage.startDay === 18) return "Day 18 lockdown";
    return `${stage.label} checkpoint`;
  };
  const buildBatchEggStateCounts = eggStates => {
    const stateCounts = new Map();
    (Array.isArray(eggStates) ? eggStates : []).forEach(state => {
      if (!state?.batchId) return;
      const current = stateCounts.get(state.batchId) || {
        hatched: 0,
        failed: 0
      };
      if (state.status === "hatched") current.hatched += 1;
      if (state.status === "failed") current.failed += 1;
      stateCounts.set(state.batchId, current);
    });
    return stateCounts;
  };
  const batchPendingEggCount = (batch, stateCounts) => {
    const counts = stateCounts?.get(batch?.id) || {
      hatched: 0,
      failed: 0
    };
    const eggCount = Math.max(0, Number(batch?.eggCount) || 0);
    return Math.max(0, eggCount - counts.hatched - counts.failed);
  };
  const resolveBatchIncubationDates = batch => {
    const incubationStartDate = normalizeDay(batch?.incubationStartDate || batch?.setDate || batch?.collectedDate);
    const expectedHatchDate = normalizeDay(batch?.expectedHatchDate || batch?.hatchDate) || addDaysToDay(incubationStartDate, HATCH_INCUBATION_DAYS);
    return {
      incubationStartDate,
      expectedHatchDate
    };
  };
  const incubationStageForDay = dayNumber => {
    const day = Math.max(1, Number(dayNumber) || 1);
    return INCUBATION_SCHEDULE.find(stage => day >= stage.startDay && day <= stage.endDay) || INCUBATION_SCHEDULE[INCUBATION_SCHEDULE.length - 1] || null;
  };
  const buildBatchIncubationProfile = (batch, options = {}) => {
    const {
      incubationStartDate,
      expectedHatchDate
    } = resolveBatchIncubationDates(batch);
    if (!incubationStartDate) return null;
    const nowMs = Number.isFinite(options?.nowMs) ? options.nowMs : Date.now();
    const todayDay = normalizeDay(nowMs);
    const startMs = new Date(`${incubationStartDate}T00:00:00.000Z`).getTime();
    const todayStartMs = todayDay ? new Date(`${todayDay}T00:00:00.000Z`).getTime() : nowMs;
    const expectedStartMs = expectedHatchDate ? new Date(`${expectedHatchDate}T00:00:00.000Z`).getTime() : NaN;
    const isScheduled = Number.isFinite(startMs) && Number.isFinite(todayStartMs) ? todayStartMs < startMs : false;
    const rawDayNumber = Number.isFinite(startMs) && Number.isFinite(todayStartMs) ? Math.floor((todayStartMs - startMs) / DAY_MS) + 1 : 1;
    const dayNumber = Math.max(1, Math.min(HATCH_INCUBATION_DAYS, rawDayNumber || 1));
    const currentStage = incubationStageForDay(dayNumber);
    const nextStage = INCUBATION_SCHEDULE.find(stage => stage.startDay > dayNumber) || null;
    const nextCheckpointDay = nextStage ? addDaysToDay(incubationStartDate, nextStage.startDay - 1) : expectedHatchDate;
    const daysUntilStart = Number.isFinite(startMs) && Number.isFinite(todayStartMs) ? Math.ceil((startMs - todayStartMs) / DAY_MS) : null;
    const daysUntilHatch = Number.isFinite(expectedStartMs) && Number.isFinite(todayStartMs) ? Math.ceil((expectedStartMs - todayStartMs) / DAY_MS) : null;
    return {
      batchId: String(batch?.id || ""),
      batchCode: String(batch?.code || ""),
      incubationStartDate,
      expectedHatchDate,
      dayNumber,
      totalDays: HATCH_INCUBATION_DAYS,
      currentStage,
      nextStage,
      nextCheckpointDay,
      nextCheckpointTitle: nextStage ? incubationCheckpointTitle(nextStage) : "Hatch due",
      isScheduled,
      daysUntilStart,
      daysUntilHatch,
      schedule: INCUBATION_SCHEDULE
    };
  };
  const financeAmountValue = value => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  };
  const financeQuantityValue = value => {
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
  };
  const financeNormalizeUnit = value => {
    const unit = String(value || "").trim().toLowerCase();
    return FINANCE_FEED_UNIT_OPTIONS.some(option => option.id === unit) ? unit : "";
  };
  const financeQuantityToKg = (quantityValue, unitValue, sackKgValue) => {
    const quantity = financeQuantityValue(quantityValue);
    const unit = financeNormalizeUnit(unitValue);
    if (quantity == null || !unit) return null;
    if (unit === "kg") return quantity;
    if (unit === "g") return quantity / 1000;
    if (unit === "lb") return quantity * 0.45359237;
    if (unit === "sack") {
      const sackKg = financeAmountValue(sackKgValue);
      return sackKg != null && sackKg > 0 ? quantity * sackKg : null;
    }
    return null;
  };
  const buildFeedExpenseMetrics = entry => {
    const isFeedExpense = String(entry?.category || "").trim() === "feed" && entry?.type !== "income";
    if (!isFeedExpense) {
      return {
        feedTypeId: "",
        quantity: null,
        unit: "",
        sackKg: null,
        quantityKg: null,
        unitPrice: null,
        pricePerKg: null
      };
    }
    const quantity = financeQuantityValue(entry?.quantity);
    const unit = financeNormalizeUnit(entry?.unit);
    const sackKg = unit === "sack" ? financeAmountValue(entry?.sackKg) : null;
    const quantityKg = financeQuantityToKg(quantity, unit, sackKg);
    const amount = financeAmountValue(entry?.amount);
    return {
      feedTypeId: String(entry?.feedTypeId || "").trim(),
      quantity,
      unit,
      sackKg,
      quantityKg,
      unitPrice: quantity != null && amount != null ? amount / quantity : null,
      pricePerKg: quantityKg != null && quantityKg > 0 && amount != null ? amount / quantityKg : null
    };
  };
  const financeCategoryLabel = categoryId => FINANCE_CATEGORY_LABELS[categoryId] || String(categoryId == null ? "" : categoryId).replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase()) || "Uncategorized";
  const normalizeFinanceMonth = value => {
    const text = String(value == null ? "" : value).trim();
    if (/^\d{4}-\d{2}$/.test(text)) return text;
    const day = normalizeDay(text);
    return day ? day.slice(0, 7) : "";
  };
  const shiftFinanceMonth = (monthValue, deltaMonths) => {
    const month = normalizeFinanceMonth(monthValue);
    if (!month) return "";
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return "";
    const shifted = new Date(Date.UTC(year, monthIndex + (Number(deltaMonths) || 0), 1));
    return shifted.toISOString().slice(0, 7);
  };
  const financeMonthTitle = monthValue => {
    const month = normalizeFinanceMonth(monthValue);
    if (!month) return "";
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return month;
    return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    });
  };
  const financeDateScore = value => {
    const ms = new Date(value || 0).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };
  const financeSortScore = row => Math.max(financeDateScore(row?.date), financeDateScore(row?.updatedAt), financeDateScore(row?.createdAt));
  const financeBirdLabel = bird => {
    const nickname = String(bird?.nickname || "").trim();
    const tagId = String(bird?.tagId || "").trim();
    if (nickname && tagId) return `${nickname} (${tagId})`;
    return nickname || tagId || "Bird";
  };
  const buildBirdSaleFinanceRows = ({
    birds = []
  } = {}) => (Array.isArray(birds) ? birds : []).filter(bird => bird?.status === "sold").map(bird => {
    const amount = financeAmountValue(bird?.salePrice);
    if (amount == null) return null;
    const date = normalizeDay(bird?.soldDate) || normalizeDay(bird?.updatedAt) || normalizeDay(bird?.createdAt);
    if (!date) return null;
    const buyerName = String(bird?.buyerName || "").trim();
    return {
      id: `bird-sale-${bird.id}`,
      source: "bird_sale",
      sourceId: bird.id,
      date,
      type: "income",
      category: "bird_sale",
      amount,
      description: `${financeBirdLabel(bird)} sold`,
      notes: buyerName ? `Buyer: ${buyerName}` : "",
      locked: true,
      createdAt: bird?.createdAt || "",
      updatedAt: bird?.updatedAt || ""
    };
  }).filter(Boolean).sort((a, b) => financeSortScore(b) - financeSortScore(a) || String(b.id || "").localeCompare(String(a.id || "")));
  const buildFinanceLedger = ({
    birds = [],
    financeEntries = []
  } = {}) => {
    const manualRows = (Array.isArray(financeEntries) ? financeEntries : []).filter(entry => entry && typeof entry === "object").map(entry => {
      const amount = financeAmountValue(entry.amount);
      const date = normalizeDay(entry.date);
      if (amount == null || !date) return null;
      const type = entry.type === "income" ? "income" : "expense";
      const feedMetrics = buildFeedExpenseMetrics({
        ...entry,
        type
      });
      return {
        id: entry.id,
        source: "manual",
        sourceId: entry.id,
        date,
        type,
        category: String(entry.category || "").trim(),
        amount,
        description: String(entry.description || "").trim(),
        notes: String(entry.notes || "").trim(),
        locked: false,
        createdAt: entry.createdAt || "",
        updatedAt: entry.updatedAt || "",
        ...feedMetrics
      };
    }).filter(Boolean);
    return [...manualRows, ...buildBirdSaleFinanceRows({
      birds
    }).map(row => ({
      ...row,
      feedTypeId: "",
      quantity: null,
      unit: "",
      sackKg: null,
      quantityKg: null,
      unitPrice: null,
      pricePerKg: null
    }))].sort((a, b) => financeSortScore(b) - financeSortScore(a) || String(b.id || "").localeCompare(String(a.id || "")));
  };
  const filterFinanceRowsByMonth = (rows, monthValue) => {
    const month = normalizeFinanceMonth(monthValue);
    const source = Array.isArray(rows) ? rows : [];
    if (!month) return source;
    return source.filter(row => String(row?.date || "").slice(0, 7) === month);
  };
  const summarizeFinanceRows = rows => {
    const source = Array.isArray(rows) ? rows : [];
    return source.reduce((summary, row) => {
      const amount = financeAmountValue(row?.amount);
      if (amount == null) return summary;
      if (row?.type === "income") summary.income += amount;else summary.expenses += amount;
      summary.transactions += 1;
      summary.net = summary.income - summary.expenses;
      return summary;
    }, {
      income: 0,
      expenses: 0,
      net: 0,
      transactions: 0
    });
  };
  const rollupFinanceCategories = rows => {
    const source = Array.isArray(rows) ? rows : [];
    const grouped = {
      income: new Map(),
      expense: new Map()
    };
    source.forEach(row => {
      const amount = financeAmountValue(row?.amount);
      const type = row?.type === "income" ? "income" : "expense";
      const category = String(row?.category || "").trim() || "uncategorized";
      if (amount == null) return;
      const current = grouped[type].get(category) || {
        category,
        label: financeCategoryLabel(category),
        type,
        amount: 0,
        count: 0
      };
      current.amount += amount;
      current.count += 1;
      grouped[type].set(category, current);
    });
    return {
      income: [...grouped.income.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label)),
      expense: [...grouped.expense.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
    };
  };
  const getBirdInactiveDate = bird => {
    if (!bird) return "";
    if (bird.status === "sold") return normalizeDay(bird.soldDate);
    if (bird.status === "deceased") return normalizeDay(bird.deceasedDate);
    if (bird.status === "culled") return normalizeDay(bird.culledDate);
    return "";
  };
  const isBirdActiveOnDate = (bird, dateValue) => {
    if (!bird) return false;
    const targetDay = normalizeDay(dateValue);
    const inactiveDay = getBirdInactiveDate(bird);
    if (!targetDay) return bird.status === "active";
    if (!inactiveDay) return true;
    return targetDay < inactiveDay;
  };
  const getBirdPenAtDate = (bird, dateValue) => {
    if (!bird) return null;
    const targetDay = normalizeDay(dateValue);
    const history = Array.isArray(bird.penHistory) ? [...bird.penHistory] : [];
    if (!history.length) return isBirdActiveOnDate(bird, dateValue) ? bird.penId || null : null;
    history.sort((a, b) => {
      const diff = new Date(a.date || a.createdAt || 0).getTime() - new Date(b.date || b.createdAt || 0).getTime();
      return diff || String(a.id || "").localeCompare(String(b.id || ""));
    });
    let penId = null;
    history.forEach(entry => {
      const entryDay = normalizeDay(entry.date || entry.createdAt);
      if (!entryDay) return;
      if (targetDay && entryDay > targetDay) return;
      penId = entry.toPenId || null;
    });
    if (!targetDay) return penId;
    return isBirdActiveOnDate(bird, dateValue) ? penId : null;
  };
  const buildBirdPenUpdate = ({
    bird,
    nextPenId,
    nextStatus,
    changeDate,
    reason,
    makeId
  }) => {
    const prevPenId = bird?.penId || null;
    const resolvedPenId = nextStatus && nextStatus !== "active" ? null : nextPenId || null;
    const history = Array.isArray(bird?.penHistory) ? [...bird.penHistory] : [];
    if (prevPenId === resolvedPenId) {
      return {
        penId: resolvedPenId,
        penHistory: history
      };
    }
    const createId = typeof makeId === "function" ? makeId : defaultMakeId;
    history.push({
      id: createId(),
      date: normalizeDay(changeDate) || normalizeDay(new Date().toISOString()),
      fromPenId: prevPenId,
      toPenId: resolvedPenId,
      reason: reason || (resolvedPenId ? prevPenId ? "pen_transfer" : "pen_assignment" : nextStatus && nextStatus !== "active" ? `status_${nextStatus}` : "pen_cleared")
    });
    return {
      penId: resolvedPenId,
      penHistory: history
    };
  };
  const estimatePenFeedLog = ({
    log,
    birds = []
  }) => {
    const matchedBirds = birds.filter(bird => isBirdActiveOnDate(bird, log?.loggedAt) && getBirdPenAtDate(bird, log?.loggedAt) === (log?.penId || null));
    const amount = Number(log?.amount) || 0;
    return {
      birdIds: matchedBirds.map(bird => bird.id),
      birdCount: matchedBirds.length,
      perBirdAmount: matchedBirds.length ? amount / matchedBirds.length : 0
    };
  };
  const buildAutomaticHatchReminders = ({
    batches = [],
    eggStates = []
  } = {}) => {
    const stateCounts = buildBatchEggStateCounts(eggStates);
    return batches.map(batch => {
      const pendingEggCount = batchPendingEggCount(batch, stateCounts);
      if (!pendingEggCount) return null;
      const {
        incubationStartDate,
        expectedHatchDate
      } = resolveBatchIncubationDates(batch);
      if (!expectedHatchDate) return null;
      return {
        id: `auto-hatch-${batch.id}`,
        batchId: batch.id,
        batchCode: batch.code || "",
        pendingEggCount,
        kind: "hatch_due",
        dueAt: dayToNoonIso(expectedHatchDate),
        title: "Hatch due",
        note: `${pendingEggCount} pending eggs expected to hatch around ${expectedHatchDate}`,
        incubationStartDate,
        expectedHatchDate,
        source: "auto_hatch",
        auto: true,
        status: "pending"
      };
    }).filter(Boolean).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  };
  const buildAutomaticIncubationReminders = ({
    batches = [],
    eggStates = [],
    nowMs = Date.now()
  } = {}) => {
    const stateCounts = buildBatchEggStateCounts(eggStates);
    const todayDay = normalizeDay(nowMs);
    const todayStartMs = todayDay ? new Date(`${todayDay}T00:00:00.000Z`).getTime() : nowMs;
    return (Array.isArray(batches) ? batches : []).flatMap(batch => {
      const pendingEggCount = batchPendingEggCount(batch, stateCounts);
      if (!pendingEggCount) return [];
      const profile = buildBatchIncubationProfile(batch, {
        nowMs
      });
      if (!profile?.incubationStartDate) return [];
      return INCUBATION_SCHEDULE.map(stage => {
        const dueDay = addDaysToDay(profile.incubationStartDate, stage.startDay - 1);
        if (!dueDay) return null;
        const dueStartMs = new Date(`${dueDay}T00:00:00.000Z`).getTime();
        if (!Number.isFinite(dueStartMs) || dueStartMs < todayStartMs) return null;
        return {
          id: `auto-incubation-${batch.id}-${stage.id}`,
          batchId: batch.id,
          batchCode: batch.code || "",
          pendingEggCount,
          kind: "incubation_checkpoint",
          dueAt: dayToNoonIso(dueDay),
          title: incubationCheckpointTitle(stage),
          note: `${stage.humidity} · ${stage.shortLabel}`,
          incubationDay: stage.startDay,
          dayRangeLabel: `Day ${stage.startDay}-${stage.endDay}`,
          humidity: stage.humidity,
          stageId: stage.id,
          stageLabel: stage.label,
          purpose: stage.purpose,
          action: stage.action,
          incubationStartDate: profile.incubationStartDate,
          expectedHatchDate: profile.expectedHatchDate,
          source: "auto_incubation",
          auto: true,
          status: "pending"
        };
      }).filter(Boolean);
    }).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  };
  const retentionDaysForStatus = status => RETENTION_DAYS[status] || null;
  const stageSuggestion = bird => {
    if (!bird || !bird.hatchDate) return null;
    if (bird.status && bird.status !== "active") return null;
    if (bird.stage === "retired") return null;
    const daysOld = ageDays(bird.hatchDate);
    if (!Number.isFinite(daysOld) || daysOld < 0) return null;
    const sex = String(bird.sex == null ? "unknown" : bird.sex).toLowerCase();
    const breed = String(bird.breed == null ? "" : bird.breed).toLowerCase();
    const isBroiler = /\bbroiler\b/.test(breed);
    if (isBroiler) {
      if (daysOld < STAGE_SUGGESTION_DAYS.broilerStart) return {
        stage: "chick",
        ageDays: daysOld,
        reason: `Age ${daysOld} days is still in the chick window.`
      };
      if (daysOld < STAGE_SUGGESTION_DAYS.broilerMature) return {
        stage: "broiler",
        ageDays: daysOld,
        reason: `Age ${daysOld} days fits the broiler production window.`
      };
      if (sex === "male") return {
        stage: "rooster",
        ageDays: daysOld,
        reason: `Male broilers at ${daysOld} days are usually managed as roosters.`
      };
      return {
        stage: "broiler",
        ageDays: daysOld,
        reason: `Broiler profile remains appropriate at ${daysOld} days.`
      };
    }
    if (sex === "female") {
      if (daysOld < STAGE_SUGGESTION_DAYS.chickMax) return {
        stage: "chick",
        ageDays: daysOld,
        reason: `Female bird is ${daysOld} days old (< ${STAGE_SUGGESTION_DAYS.chickMax} days).`
      };
      if (daysOld < STAGE_SUGGESTION_DAYS.juvenileMax) return {
        stage: "pullet",
        ageDays: daysOld,
        reason: `Female bird at ${daysOld} days is usually in the pullet stage.`
      };
      return {
        stage: "layer",
        ageDays: daysOld,
        reason: `Female bird at ${daysOld} days is typically layer-age.`
      };
    }
    if (sex === "male") {
      if (daysOld < STAGE_SUGGESTION_DAYS.chickMax) return {
        stage: "chick",
        ageDays: daysOld,
        reason: `Male bird is ${daysOld} days old (< ${STAGE_SUGGESTION_DAYS.chickMax} days).`
      };
      if (daysOld < STAGE_SUGGESTION_DAYS.juvenileMax) return {
        stage: "grower",
        ageDays: daysOld,
        reason: `Male bird at ${daysOld} days is usually in grower stage.`
      };
      return {
        stage: "rooster",
        ageDays: daysOld,
        reason: `Male bird at ${daysOld} days is typically rooster-age.`
      };
    }
    if (daysOld < STAGE_SUGGESTION_DAYS.chickMax) return {
      stage: "chick",
      ageDays: daysOld,
      reason: `At ${daysOld} days, chick is the usual stage.`
    };
    if (daysOld < STAGE_SUGGESTION_DAYS.juvenileMax) return {
      stage: "grower",
      ageDays: daysOld,
      reason: `At ${daysOld} days, grower is a safe age-based stage for unknown sex.`
    };
    return null;
  };
  const buildRetentionSnapshot = ({
    birds = [],
    photos = [],
    nowMs = Date.now()
  }) => {
    const birdById = new Map(birds.map(bird => [bird.id, bird]));
    let archivedPhotos = 0;
    let archivedPhotosWithImage = 0;
    let archivedImageBytes = 0;
    const eligible = [];
    photos.forEach(photo => {
      const bird = birdById.get(photo.birdId);
      if (!bird || !bird.archivedAt) return;
      archivedPhotos += 1;
      if (photo.dataUrl) {
        archivedPhotosWithImage += 1;
        archivedImageBytes += Math.round(photo.dataUrl.length * 0.75);
      }
      const retentionDays = retentionDaysForStatus(bird.status);
      if (!retentionDays || !photo.dataUrl) return;
      const archivedAtMs = new Date(bird.archivedAt).getTime();
      if (!Number.isFinite(archivedAtMs)) return;
      const ageMs = nowMs - archivedAtMs;
      if (ageMs < retentionDays * DAY_MS) return;
      eligible.push({
        photo,
        bird,
        retentionDays,
        ageDays: Math.floor(ageMs / DAY_MS),
        purgeAfter: new Date(archivedAtMs + retentionDays * DAY_MS).toISOString()
      });
    });
    return {
      rows: photos,
      archivedPhotos,
      archivedPhotosWithImage,
      archivedImageBytes,
      eligible
    };
  };
  const normalizeBackupPayload = (parsed, storeNames) => {
    const source = parsed && typeof parsed === "object" ? parsed.stores && typeof parsed.stores === "object" ? parsed.stores : parsed : null;
    if (!source) throw new Error("Invalid backup JSON.");
    const names = Array.isArray(storeNames) ? storeNames : [];
    const hasKnownStore = names.some(name => Array.isArray(source[name]));
    if (!hasKnownStore) throw new Error("Backup JSON has no recognized store data.");
    const normalized = {};
    let total = 0;
    names.forEach(name => {
      normalized[name] = Array.isArray(source[name]) ? source[name] : [];
      total += normalized[name].length;
    });
    return {
      normalized,
      total
    };
  };
  const defaultMakeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const completeReminderAndScheduleNext = (inst, rule, options = {}) => {
    const nowIso = options.nowIso || new Date().toISOString();
    const makeId = typeof options.makeId === "function" ? options.makeId : defaultMakeId;
    const completed = {
      ...inst,
      status: "done",
      completedAt: nowIso
    };
    const cadenceDays = Number(rule?.cadenceDays);
    const nowMs = new Date(nowIso).getTime();
    const next = rule && Number.isFinite(cadenceDays) && cadenceDays > 0 && Number.isFinite(nowMs) ? {
      id: makeId(),
      birdId: inst.birdId,
      kind: inst.kind,
      dueAt: new Date(nowMs + cadenceDays * DAY_MS).toISOString(),
      status: "pending",
      ruleId: rule.id
    } : null;
    return {
      completed,
      next
    };
  };
  return {
    DAY_MS,
    HATCH_INCUBATION_DAYS,
    HATCH_ALERT_WINDOW_DAYS,
    INCUBATION_REMINDER_WINDOW_DAYS,
    INCUBATION_SCHEDULE,
    RETENTION_DAYS,
    FINANCE_CATEGORY_DEFS,
    FINANCE_CATEGORY_LABELS,
    FINANCE_MANUAL_CATEGORY_OPTIONS,
    FINANCE_FEED_UNIT_OPTIONS,
    STATUS_DATE_FIELDS,
    normalizeTagId,
    normalizeDay,
    addDaysToDay,
    resolveBatchIncubationDates,
    normalizeFinanceMonth,
    shiftFinanceMonth,
    financeMonthTitle,
    financeCategoryLabel,
    financeQuantityToKg,
    buildFeedExpenseMetrics,
    nextCode,
    eggCode,
    outsiderTagCode,
    parseOutsiderTagCode,
    getBirdPenAtDate,
    isBirdActiveOnDate,
    buildBirdPenUpdate,
    estimatePenFeedLog,
    buildBatchIncubationProfile,
    buildAutomaticHatchReminders,
    buildAutomaticIncubationReminders,
    stageSuggestion,
    retentionDaysForStatus,
    buildRetentionSnapshot,
    buildBirdSaleFinanceRows,
    buildFinanceLedger,
    filterFinanceRowsByMonth,
    summarizeFinanceRows,
    rollupFinanceCategories,
    normalizeBackupPayload,
    completeReminderAndScheduleNext
  };
});

/* FILE: src/core/db.js */
const DB_NAME = "FlockTrackDB";
const DB_VER = 7;
const STORES = ["eggBatches", "birds", "measurements", "healthEvents", "reminderRules", "reminderInstances", "eggStates", "birdPhotos", "eggProgressPhotos", "pens", "feedTypes", "penFeedLogs", "financeEntries"];
const CORE_STORES = STORES.filter(s => s !== "birdPhotos" && s !== "eggProgressPhotos");
const STATUS_COLORS = {
  active: "#15803d",
  sold: "#a16207",
  deceased: "#b91c1c",
  culled: "#c2410c"
};
let dbConnPromise = null;
const openDB = () => {
  if (dbConnPromise) return dbConnPromise;
  dbConnPromise = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      STORES.forEach(s => {
        let st;
        if (!db.objectStoreNames.contains(s)) st = db.createObjectStore(s, {
          keyPath: "id"
        });else st = e.target.transaction.objectStore(s);
        if (s === "birdPhotos") {
          if (!st.indexNames.contains("birdId")) st.createIndex("birdId", "birdId", {
            unique: false
          });
          if (!st.indexNames.contains("takenAt")) st.createIndex("takenAt", "takenAt", {
            unique: false
          });
        }
        if (s === "eggProgressPhotos") {
          if (!st.indexNames.contains("eggId")) st.createIndex("eggId", "eggId", {
            unique: false
          });
          if (!st.indexNames.contains("batchId")) st.createIndex("batchId", "batchId", {
            unique: false
          });
          if (!st.indexNames.contains("takenAt")) st.createIndex("takenAt", "takenAt", {
            unique: false
          });
        }
        if (s === "penFeedLogs") {
          if (!st.indexNames.contains("penId")) st.createIndex("penId", "penId", {
            unique: false
          });
          if (!st.indexNames.contains("loggedAt")) st.createIndex("loggedAt", "loggedAt", {
            unique: false
          });
        }
      });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => {
      dbConnPromise = null;
      rej(r.error);
    };
  });
  return dbConnPromise;
};
const reqResult = req => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});
const txDone = tx => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new Error("Transaction aborted"));
});
const withStore = async (s, mode, run) => {
  const db = await openDB();
  const tx = db.transaction(s, mode);
  return run(tx.objectStore(s), tx);
};
const dbAll = s => withStore(s, "readonly", st => reqResult(st.getAll()).then(r => r || []));
const dbPut = (s, item) => withStore(s, "readwrite", st => reqResult(st.put(item)).then(() => undefined));
const dbDel = (s, id) => withStore(s, "readwrite", st => reqResult(st.delete(id)).then(() => undefined));
const dbClear = s => withStore(s, "readwrite", st => reqResult(st.clear()).then(() => undefined));
const dbReplace = (s, items) => withStore(s, "readwrite", (st, tx) => {
  st.clear();
  items.forEach(it => st.put(it));
  return txDone(tx);
});
const dbByIndex = (s, idx, key) => withStore(s, "readonly", st => {
  if (!st.indexNames.contains(idx)) return [];
  return reqResult(st.index(idx).getAll(key)).then(r => r || []);
});
const dbDelByIndex = (s, idx, key) => withStore(s, "readwrite", (st, tx) => {
  if (!st.indexNames.contains(idx)) return undefined;
  const rq = st.index(idx).openCursor(IDBKeyRange.only(key));
  rq.onsuccess = e => {
    const c = e.target.result;
    if (c) {
      c.delete();
      c.continue();
    }
  };
  rq.onerror = () => {
    tx.abort();
  };
  return txDone(tx);
});

/* FILE: src/core/data-layer.js */
(function(root) {
  const OVERVIEW_STORES = ["eggBatches", "birds", "measurements", "reminderInstances", "eggStates", "pens", "feedTypes", "penFeedLogs", "financeEntries"];
  const DEFERRED_STORES = ["healthEvents", "reminderRules"];
  const sortEggProgressPhotos = rows => [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (Number(a?.dayNumber) || 0) - (Number(b?.dayNumber) || 0) || new Date(a?.takenAt || 0) - new Date(b?.takenAt || 0));
  const toPhotoExportRows = rows => rows.map(photo => ({
    id: photo.id,
    birdId: photo.birdId,
    takenAt: photo.takenAt,
    sizeKb: photo.sizeKb,
    hasImage: photo.hasImage != null ? !!photo.hasImage : !!photo.dataUrl
  }));
  const readStores = async stores => Object.fromEntries(await Promise.all(stores.map(async store => [store, await dbAll(store)])));
  const normalizeOverviewData = stores => ({
    eggBatches: stores.eggBatches || [],
    birds: stores.birds || [],
    measurements: stores.measurements || [],
    reminderInstances: stores.reminderInstances || [],
    eggStates: stores.eggStates || [],
    pens: stores.pens || [],
    feedTypes: stores.feedTypes || [],
    penFeedLogs: stores.penFeedLogs || [],
    financeEntries: stores.financeEntries || []
  });
  const normalizeDeferredData = stores => ({
    healthEvents: stores.healthEvents || [],
    reminderRules: stores.reminderRules || []
  });
  root.FlockTrackData = {
    loadOverviewData: async () => normalizeOverviewData(await readStores(OVERVIEW_STORES)),
    loadDeferredData: async () => normalizeDeferredData(await readStores(DEFERRED_STORES)),
    loadCoreData: async () => {
      const [overviewStores, deferredStores] = await Promise.all([readStores(OVERVIEW_STORES), readStores(DEFERRED_STORES)]);
      return {
        ...normalizeOverviewData(overviewStores),
        ...normalizeDeferredData(deferredStores)
      };
    },
    loadPhotoExportRows: async () => toPhotoExportRows(await dbAll("birdPhotos")),
    loadBirdPhotos: async birdId => {
      const rows = await dbByIndex("birdPhotos", "birdId", birdId);
      rows.sort((a, b) => new Date(a.takenAt || 0) - new Date(b.takenAt || 0));
      return rows;
    },
    loadEggProgressPhotos: async eggId => sortEggProgressPhotos(await dbByIndex("eggProgressPhotos", "eggId", eggId)),
    exportAllStores: async () => {
      const stores = {};
      let total = 0;
      for (const store of STORES) {
        const rows = await dbAll(store);
        stores[store] = rows;
        total += rows.length;
      }
      return {
        stores,
        total
      };
    },
    replaceStores: async normalized => {
      for (const store of STORES) await dbReplace(store, normalized[store] || []);
    },
    clearAllStores: async () => {
      for (const store of STORES) await dbClear(store);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* FILE: src/core/ui-core.js */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const {
  DAY_MS,
  INCUBATION_SCHEDULE,
  buildBatchIncubationProfile,
  normalizeTagId,
  nextCode,
  eggCode,
  outsiderTagCode,
  parseOutsiderTagCode,
  stageSuggestion,
  retentionDaysForStatus,
  STATUS_DATE_FIELDS
} = globalThis.FlockTrackLogic;
const mergeUniqueById = (items, extras, compareFn) => {
  const map = new Map();
  items.forEach(it => map.set(it.id, it));
  extras.forEach(it => map.set(it.id, it));
  const out = [...map.values()];
  if (compareFn) out.sort(compareFn);
  return out;
};
const ageDays = d => d ? Math.floor((Date.now() - new Date(d)) / 86400000) : null;
const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric"
}) : "—";
const fmtDateTime = d => d ? new Date(d).toLocaleString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
}) : "—";
const fmtNum = n => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }) : "—";
};
const MONEY_FMT_PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const fmtMoney = n => {
  const v = Number(n);
  return Number.isFinite(v) ? MONEY_FMT_PHP.format(v) : "—";
};
const fmtPct = (num, den) => den > 0 ? `${Math.round(num / den * 100)}%` : "—";
const dateMs = d => {
  const t = new Date(d || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};
const humanize = v => String(v == null ? "" : v).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const today = () => new Date().toISOString().slice(0, 10);
const sc = s => STATUS_COLORS[s] || "#475569";
const BOOKMARK_BUTTON_THEMES = {
  on: {
    icon: "\u2605",
    color: "#a16207",
    borderColor: "#eab308",
    background: "#fef3c7"
  },
  off: {
    icon: "\u2606",
    color: "#1d4ed8",
    borderColor: "#93c5fd",
    background: "#eff6ff"
  }
};
const bookmarkButtonTheme = isBookmarked => isBookmarked ? BOOKMARK_BUTTON_THEMES.on : BOOKMARK_BUTTON_THEMES.off;
const bookmarkButtonStyle = (isBookmarked, baseStyle = {}) => {
  const theme = bookmarkButtonTheme(isBookmarked);
  return {
    ...baseStyle,
    color: theme.color,
    borderColor: theme.borderColor,
    background: theme.background
  };
};
const pad3 = n => String(Math.max(1, Number(n) || 1)).padStart(3, "0");
const BATCH_THEME_COLORS = ["#D98A6C", "#ECA869", "#F2D388", "#C2D5A8", "#89A894", "#8FB8DE", "#A3B8CC", "#9A8C98", "#D4A373", "#BDB7B0"];
const hexToRgba = (hex, alpha = 1) => {
  const v = (hex || "").replace("#", "").trim();
  if (v.length !== 6) return hex;
  const n = Number.parseInt(v, 16);
  if (!Number.isFinite(n)) return hex;
  const r = n >> 16 & 255;
  const g = n >> 8 & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const FEED_TYPE_COLOR_SWATCHES = ["#15803d", "#1d4ed8", "#c2410c", "#7c3aed", "#0f766e", "#be123c", "#a16207", "#475569", "#0ea5e9", "#65a30d"];
const isHexColor = value => /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
const hashText = value => {
  const text = String(value || "");
  let hash = 7;
  for (let idx = 0; idx < text.length; idx += 1) {
    hash = (hash * 31 + text.charCodeAt(idx)) >>> 0;
  }
  return hash;
};
const feedTypeColor = (feedType, fallbackKey = "") => {
  const explicit = String(feedType?.color || "").trim();
  if (isHexColor(explicit)) return explicit;
  const key = String(feedType?.id || feedType?.name || fallbackKey || "feed");
  return FEED_TYPE_COLOR_SWATCHES[hashText(key) % FEED_TYPE_COLOR_SWATCHES.length];
};
const feedAmountToKg = (amountValue, unitValue, sackKgValue) => {
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(unitValue || "").trim().toLowerCase();
  if (unit === "kg") return amount;
  if (unit === "g") return amount / 1000;
  if (unit === "lb") return amount * 0.45359237;
  if (unit === "sack") {
    const sackKg = Number(sackKgValue);
    if (!Number.isFinite(sackKg) || sackKg <= 0) return null;
    return amount * sackKg;
  }
  return null;
};
const weightAmountToGrams = (valueValue, unitValue) => {
  const value = Number(valueValue);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(unitValue || "").trim().toLowerCase();
  if (unit === "g") return value;
  if (unit === "kg") return value * 1000;
  if (unit === "lb") return value * 453.59237;
  return null;
};
const weightAmountToKg = (valueValue, unitValue) => {
  const grams = weightAmountToGrams(valueValue, unitValue);
  if (!Number.isFinite(grams)) return null;
  return grams / 1000;
};
const fmtWeightGrams = (valueValue, unitValue) => {
  const grams = weightAmountToGrams(valueValue, unitValue);
  return Number.isFinite(grams) ? `${fmtNum(grams)} g` : "";
};
const batchNoFromBatchCode = code => {
  const m = (code || "").toUpperCase().match(/(\d+)$/);
  if (!m) return 1;
  return Math.max(1, Number.parseInt(m[1], 10) || 1);
};
const hatchTagBatchNo = tagId => {
  const m = (tagId || "").trim().toUpperCase().match(/^C-B(\d+)-\d+$/);
  if (!m) return null;
  return Math.max(1, Number.parseInt(m[1], 10) || 1);
};
const batchThemeColor = batchNo => {
  const idx = (Math.max(1, Number.parseInt(batchNo, 10) || 1) - 1) % BATCH_THEME_COLORS.length;
  return BATCH_THEME_COLORS[idx];
};
const batchTheme = batchNo => {
  const color = batchThemeColor(batchNo);
  return {
    color,
    soft: hexToRgba(color, .11),
    bg: hexToRgba(color, .2),
    border: hexToRgba(color, .6)
  };
};
const OUTSIDER_THEME = {
  color: "#475569",
  soft: "#ffffff",
  bg: "#ffffff",
  border: "#d9e3ef"
};
const isOutsiderBird = (bird, batchById) => {
  if (!bird) return false;
  const b = bird.originBatchId && batchById && batchById.get ? batchById.get(bird.originBatchId) : null;
  if (b?.code) return false;
  return !!parseOutsiderTagCode(bird.tagId);
};
const birdBatchNo = (bird, batchById) => {
  if (!bird) return 1;
  const b = bird.originBatchId && batchById && batchById.get ? batchById.get(bird.originBatchId) : null;
  if (b?.code) return batchNoFromBatchCode(b.code);
  const outsider = parseOutsiderTagCode(bird.tagId);
  if (outsider?.batchNo) return outsider.batchNo;
  const hatchNo = hatchTagBatchNo(bird.tagId);
  if (hatchNo) return hatchNo;
  return 1;
};
const birdBatchLabel = (bird, batchById) => {
  const b = bird?.originBatchId && batchById && batchById.get ? batchById.get(bird.originBatchId) : null;
  if (b?.code) return b.code;
  const outsider = parseOutsiderTagCode(bird?.tagId);
  if (outsider?.batchNo) return `OB${pad3(outsider.batchNo)}`;
  const hatchNo = hatchTagBatchNo(bird?.tagId);
  if (hatchNo) return `B${pad3(hatchNo)}`;
  return `B${pad3(birdBatchNo(bird, batchById))}`;
};
const birdBatchChipLabel = (bird, batchById) => {
  const b = bird?.originBatchId && batchById && batchById.get ? batchById.get(bird.originBatchId) : null;
  if (b?.code) return `Batch ${batchNoFromBatchCode(b.code)}`;
  const outsider = parseOutsiderTagCode(bird?.tagId);
  if (outsider?.batchNo) return `O-Batch ${outsider.batchNo}`;
  const hatchNo = hatchTagBatchNo(bird?.tagId);
  if (hatchNo) return `Batch ${hatchNo}`;
  return `Batch ${birdBatchNo(bird, batchById)}`;
};
const birdBatchTheme = (bird, batchById) => isOutsiderBird(bird, batchById) ? OUTSIDER_THEME : batchTheme(birdBatchNo(bird, batchById));
const nextOutsiderSeed = birds => {
  let maxBatch = 0;
  let maxIndiv = 0;
  birds.forEach(b => {
    const p = parseOutsiderTagCode(b.tagId);
    if (!p) return;
    if (p.batchNo > maxBatch) {
      maxBatch = p.batchNo;
      maxIndiv = p.indivNo;
      return;
    }
    if (p.batchNo === maxBatch && p.indivNo > maxIndiv) maxIndiv = p.indivNo;
  });
  if (!maxBatch) return {
    batchNo: 1,
    indivNo: 1
  };
  return {
    batchNo: maxBatch,
    indivNo: maxIndiv + 1
  };
};
const MAX_BIRD_PHOTOS = 6;
const compressImg = file => {
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onerror = rej;
    rd.onload = e => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const scale = img.width > 800 ? 800 / img.width : 1;
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.72));
      };
      img.src = e.target.result;
    };
    rd.readAsDataURL(file);
  });
};
const csvDown = (data, name) => {
  if (!data.length) return;
  const k = [];
  const seen = new Set();
  data.forEach(row => {
    Object.keys(row || {}).forEach(key => {
      if (seen.has(key)) return;
      seen.add(key);
      k.push(key);
    });
  });
  const rows = [k.join(","), ...data.map(r => k.map(x => JSON.stringify(r[x] ?? "")).join(","))];
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([rows.join("\n")], {
    type: "text/csv"
  }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const blobDown = (blob, name) => {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const escapeHtml = v => (v == null ? "" : String(v)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
const openPrintableReport = (title, sectionsHtml) => {
  const win = window.open("", "_blank");
  if (!win) {
    window.alert("Could not open a printable report window.");
    return;
  }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><meta name="viewport" content="width=device-width, initial-scale=1"/><style>body{font-family:Segoe UI,sans-serif;padding:24px;color:#0f172a}h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:24px 0 8px}p{color:#475569}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #d9e3ef;padding:8px 10px;text-align:left;font-size:13px;vertical-align:top}th{background:#f8fafc;font-weight:800}.muted{color:#64748b;font-size:12px;margin-bottom:14px}.kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.kpi{border:1px solid #d9e3ef;border-radius:12px;padding:12px}.kpi strong{display:block;font-size:24px;color:#b45309}@media print{body{padding:0}button{display:none}}</style></head><body><h1>${escapeHtml(title)}</h1><div class="muted">Generated ${escapeHtml(fmtDateTime(new Date().toISOString()))}</div>${sectionsHtml}</body></html>`);
  win.document.close();
  win.focus();
};
const fmtBytes = n => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v < 1024) return `${Math.round(v)} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i += 1;
  }
  const d = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  return `${x.toFixed(d)} ${u[i]}`;
};
const dataUrlToBytes = dataUrl => {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return null;
  try {
    const raw = atob(m[2]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return {
      mime: (m[1] || "application/octet-stream").toLowerCase(),
      bytes
    };
  } catch {
    return null;
  }
};
const safeFilePart = v => (v || "item").toString().trim().replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "item";
const extFromMime = mime => ({
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
}[mime] || "bin");
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) === 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = bytes => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ c >>> 8;
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const dosDateTime = d => {
  const dt = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const yr = Math.max(1980, dt.getFullYear());
  const date = (yr - 1980 << 9) | (dt.getMonth() + 1 << 5) | dt.getDate();
  const time = (dt.getHours() << 11) | (dt.getMinutes() << 5) | Math.floor(dt.getSeconds() / 2);
  return {
    date,
    time
  };
};
const zipBlob = files => {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  files.forEach(f => {
    const nm = enc.encode(f.name);
    const data = f.bytes;
    const crc = crc32(data);
    const dt = dosDateTime(f.date);
    const local = new Uint8Array(30 + nm.length + data.length);
    const ld = new DataView(local.buffer);
    ld.setUint32(0, 0x04034b50, true);
    ld.setUint16(4, 20, true);
    ld.setUint16(8, 0, true);
    ld.setUint16(10, dt.time, true);
    ld.setUint16(12, dt.date, true);
    ld.setUint32(14, crc, true);
    ld.setUint32(18, data.length, true);
    ld.setUint32(22, data.length, true);
    ld.setUint16(26, nm.length, true);
    local.set(nm, 30);
    local.set(data, 30 + nm.length);
    locals.push(local);
    const central = new Uint8Array(46 + nm.length);
    const cd = new DataView(central.buffer);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dt.time, true);
    cd.setUint16(14, dt.date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nm.length, true);
    cd.setUint32(42, offset, true);
    central.set(nm, 46);
    centrals.push(central);
    offset += local.length;
  });
  const centralSize = centrals.reduce((s, x) => s + x.length, 0);
  const end = new Uint8Array(22);
  const ed = new DataView(end.buffer);
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(8, files.length, true);
  ed.setUint16(10, files.length, true);
  ed.setUint32(12, centralSize, true);
  ed.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, end], {
    type: "application/zip"
  });
};
const OVERLAY_WRAP_STYLE = {
  position: "fixed",
  inset: 0,
  background: "#00000090",
  zIndex: 200,
  overflowY: "auto"
};
const OVERLAY_CARD_STYLE = {
  background: "#ffffff",
  border: "1px solid #d9e3ef",
  borderRadius: 18,
  margin: "20px 12px 100px",
  padding: 20
};
const OVERLAY_HEAD_STYLE = {
  display: "flex",
  alignItems: "center",
  marginBottom: 18
};
const OVERLAY_TITLE_STYLE = {
  fontSize: 22,
  fontWeight: 800,
  color: "#0f172a",
  flex: 1
};
const C = {
  page: {
    minHeight: "100dvh",
    background: "#eef3f9",
    paddingBottom: 92
  },
  bar: {
    background: "#ffffff",
    borderBottom: "1px solid #d9e3ef",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    position: "sticky",
    top: 0,
    zIndex: 50
  },
  nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: "#ffffff",
    borderTop: "1px solid #d9e3ef",
    display: "flex",
    alignItems: "stretch",
    zIndex: 50
  },
  card: {
    background: "#ffffff",
    border: "1px solid #d9e3ef",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    boxShadow: "0 14px 30px -28px #0f172a66"
  },
  inp: {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #b8c6d8",
    borderRadius: 10,
    padding: "13px 14px",
    color: "#0f172a",
    fontSize: 18,
    outline: "none"
  },
  sel: {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #b8c6d8",
    borderRadius: 10,
    padding: "13px 14px",
    color: "#0f172a",
    fontSize: 18,
    outline: "none"
  },
  ta: {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #b8c6d8",
    borderRadius: 10,
    padding: "13px 14px",
    color: "#0f172a",
    fontSize: 18,
    outline: "none",
    minHeight: 80,
    resize: "vertical"
  },
  btn: {
    background: "#b45309",
    color: "#eef3f9",
    border: "none",
    borderRadius: 12,
    padding: "15px 28px",
    fontSize: 18,
    fontWeight: 800,
    cursor: "pointer",
    width: "100%",
    marginTop: 18,
    minHeight: 52
  },
  sec: {
    background: "transparent",
    color: "#475569",
    border: "1px solid #c4d0df",
    borderRadius: 12,
    padding: "12px 18px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer"
  },
  sm: {
    background: "#d9e3ef",
    color: "#475569",
    border: "1px solid #c4d0df",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  },
  del: {
    background: "#dc262622",
    color: "#b91c1c",
    border: "1px solid #dc262644",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer"
  },
  body: {
    width: "min(100%, 1280px)",
    margin: "0 auto",
    padding: "20px clamp(16px, 2vw, 28px) 0"
  },
  lbl: {
    display: "block",
    fontSize: 15,
    color: "#475569",
    fontWeight: 700,
    marginBottom: 6,
    marginTop: 16
  },
  div: {
    borderTop: "1px solid #d9e3ef",
    margin: "14px 0"
  },
  badge: clr => ({
    display: "inline-block",
    background: `${clr}22`,
    color: clr,
    border: `1px solid ${clr}55`,
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: 13,
    fontWeight: 700
  }),
  navB: a => ({
    flex: 1,
    minWidth: 0,
    padding: "10px 2px 8px",
    border: "none",
    background: "none",
    color: a ? "#b45309" : "#475569",
    fontSize: 10,
    fontWeight: a ? 800 : 600,
    lineHeight: 1.1,
    letterSpacing: "-0.1px",
    textAlign: "center",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2
  })
};

/* FILE: src/components/primitives.js */
const FL = ({
  lbl,
  children
}) => React.createElement("div", null, React.createElement("label", {
  style: C.lbl
}, lbl), children);
class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      error
    };
  }
  componentDidCatch(error) {
    console.error(error);
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({
        error: null
      });
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (typeof this.props.renderFallback === "function") return this.props.renderFallback(this.state.error);
    return React.createElement("div", {
      style: C.card
    }, React.createElement("div", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: "#b91c1c"
      }
    }, "Screen Error"), React.createElement("div", {
      style: {
        marginTop: 8,
        color: "#475569",
        fontSize: 14,
        lineHeight: 1.45
      }
    }, this.state.error?.message || "This screen could not be rendered."));
  }
}
const Overlay = ({
  onClose,
  children
}) => {
  const [title, ...content] = React.Children.toArray(children);
  return React.createElement("div", {
    style: OVERLAY_WRAP_STYLE
  }, React.createElement("div", {
    style: OVERLAY_CARD_STYLE
  }, React.createElement("div", {
    style: OVERLAY_HEAD_STYLE
  }, React.createElement("span", {
    style: OVERLAY_TITLE_STYLE
  }, title), React.createElement("button", {
    onClick: onClose,
    style: C.sec
  }, "\u2715")), content));
};
const Modal = ({
  title,
  onClose,
  children
}) => {
  return React.createElement("div", {
    style: OVERLAY_WRAP_STYLE
  }, React.createElement("div", {
    style: OVERLAY_CARD_STYLE
  }, React.createElement("div", {
    style: OVERLAY_HEAD_STYLE
  }, React.createElement("span", {
    style: OVERLAY_TITLE_STYLE
  }, title), React.createElement("button", {
    onClick: onClose,
    style: C.sec
  }, "\u2715")), children));
};
const Empty = ({
  icon,
  msg
}) => React.createElement("div", {
  style: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#475569"
  }
}, React.createElement("div", {
  style: {
    fontSize: 48,
    marginBottom: 12
  }
}, icon), React.createElement("div", {
  style: {
    fontSize: 17,
    fontWeight: 600
  }
}, msg));
function MiniChart({
  data
}) {
  const W = 320;
  const H = 140;
  const P = 32;
  if (!data || data.length < 2) return React.createElement("div", {
    style: {
      height: H,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#475569"
    }
  }, "Need 2+ data points");
  const vs = data.map(d => d.v);
  const mn = Math.min(...vs);
  const mx = Math.max(...vs);
  const x = i => P + i / (data.length - 1) * (W - P * 2);
  const y = v => mx === mn ? H / 2 : P + (mx - v) / (mx - mn) * (H - P * 2);
  const pts = data.map((d, i) => `${x(i)},${y(d.v)}`).join(" ");
  return React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    style: {
      width: "100%",
      height: "auto",
      display: "block"
    }
  }, React.createElement("defs", null, React.createElement("linearGradient", {
    id: "cg",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, React.createElement("stop", {
    offset: "0%",
    stopColor: "#b45309",
    stopOpacity: ".25"
  }), React.createElement("stop", {
    offset: "100%",
    stopColor: "#b45309",
    stopOpacity: "0"
  }))), [.25, .5, .75].map((t, i) => React.createElement("line", {
    key: i,
    x1: P,
    x2: W - P,
    y1: P + t * (H - P * 2),
    y2: P + t * (H - P * 2),
    stroke: "#d9e3ef",
    strokeWidth: "1"
  })), React.createElement("polygon", {
    points: `${x(0)},${H - P} ${pts} ${x(data.length - 1)},${H - P}`,
    fill: "url(#cg)"
  }), React.createElement("polyline", {
    points: pts,
    fill: "none",
    stroke: "#b45309",
    strokeWidth: "2.5",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }), data.map((d, i) => React.createElement("circle", {
    key: i,
    cx: x(i),
    cy: y(d.v),
    r: "4.5",
    fill: "#b45309",
    stroke: "#ffffff",
    strokeWidth: "2"
  })), React.createElement("text", {
    x: P,
    y: H - 6,
    fontSize: "10",
    fill: "#475569"
  }, fmtDate(data[0].date)), React.createElement("text", {
    x: W - P,
    y: H - 6,
    fontSize: "10",
    fill: "#475569",
    textAnchor: "end"
  }, fmtDate(data[data.length - 1].date)));
}

/* FILE: src/components/bird-ui.js */
const STAGE_SPRITE_ASSET_PATHS = {
  egg: "assets/stages/egg.png",
  chick: "assets/stages/chick.png",
  pullet: "assets/stages/pullet.png",
  grower: "assets/stages/grower.png",
  layer: "assets/stages/layer.png",
  broiler: "assets/stages/broiler.png",
  rooster: "assets/stages/rooster.png",
  retired: "assets/stages/retired.png"
};
const STAGE_SPRITE_OVERRIDES = typeof globalThis !== "undefined" && globalThis.FLOCK_TRACK_STAGE_SPRITES ? globalThis.FLOCK_TRACK_STAGE_SPRITES : {};
const resolveStageSprite = stage => STAGE_SPRITE_OVERRIDES[stage] || STAGE_SPRITE_ASSET_PATHS[stage] || "";
const STAGE_META = [{
  id: "egg",
  name: "Egg",
  note: "Biological start",
  sprite: resolveStageSprite("egg")
}, {
  id: "chick",
  name: "Chick",
  note: "",
  sprite: resolveStageSprite("chick")
}, {
  id: "pullet",
  name: "Pullet",
  note: "",
  sprite: resolveStageSprite("pullet")
}, {
  id: "grower",
  name: "Grower",
  note: "",
  sprite: resolveStageSprite("grower")
}, {
  id: "layer",
  name: "Layer",
  note: "Egg production",
  sprite: resolveStageSprite("layer")
}, {
  id: "broiler",
  name: "Broiler",
  note: "Meat production",
  sprite: resolveStageSprite("broiler")
}, {
  id: "rooster",
  name: "Rooster",
  note: "Breeding",
  sprite: resolveStageSprite("rooster")
}, {
  id: "retired",
  name: "Retired",
  note: "Senior hen",
  sprite: resolveStageSprite("retired")
}];
const STAGES = STAGE_META.map(s => s.id);
const STAGES_BIRD_INFO = STAGES.filter(s => s !== "egg");
const STAGE_MAP = STAGE_META.reduce((acc, st) => {
  acc[st.id] = st;
  return acc;
}, {});
const getStageMeta = stage => STAGE_MAP[stage] || {
  id: stage || "unknown",
  name: humanize(stage || "unknown"),
  note: "",
  sprite: ""
};
const stageLabel = stage => getStageMeta(stage).name;
const STATUSES = ["active", "sold", "deceased", "culled"];
const METRICS = ["weight", "length", "egg_count", "feed_intake", "other"];
const HEALTHS = ["vaccination", "deworming", "treatment", "injury", "illness", "checkup", "other"];
const SETTINGS_SLIDES = [{
  id: "archivable",
  label: "Archivable",
  color: "#1d4ed8"
}, {
  id: "archives",
  label: "Archives",
  color: "#475569"
}, {
  id: "storage",
  label: "Storage",
  color: "#475569"
}];
const STATUS_SLIDES = [{
  id: "active",
  label: "Active",
  color: "#15803d"
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
const BIRD_TAB_SLIDES = [{
  id: "info",
  label: "Info",
  color: "#1d4ed8"
}, {
  id: "timeline",
  label: "Log",
  color: "#0f766e"
}, {
  id: "photos",
  label: "Photos",
  color: "#6d28d9"
}, {
  id: "measurements",
  label: "Meas.",
  color: "#c2410c"
}, {
  id: "health",
  label: "Health",
  color: "#b91c1c"
}, {
  id: "chart",
  label: "Chart",
  color: "#047857"
}];
function AnimatedSlider({
  options,
  value,
  onChange
}) {
  const idx = Math.max(0, options.findIndex(o => o.id === value));
  const active = options[idx] || options[0];
  const inset = 4;
  return React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      background: "#f5f8fc",
      border: "1px solid #c4d0df",
      borderRadius: 12,
      padding: inset
    }
  }, React.createElement("div", {
    style: {
      position: "absolute",
      top: inset,
      bottom: inset,
      left: `calc(${inset}px + ${idx} * (100% - ${inset * 2}px) / ${options.length})`,
      width: `calc((100% - ${inset * 2}px) / ${options.length})`,
      background: active.color,
      borderRadius: 9,
      boxShadow: "0 6px 14px #00000033",
      transition: "all .28s cubic-bezier(0.4,0,0.2,1)"
    }
  }), options.map(opt => {
    const on = value === opt.id;
    return React.createElement("button", {
      key: opt.id,
      onClick: () => onChange(opt.id),
      style: {
        flex: 1,
        border: "none",
        background: "transparent",
        color: on ? "#ffffff" : "#475569",
        fontSize: 13,
        fontWeight: on ? 800 : 600,
        padding: "9px 6px",
        cursor: "pointer",
        position: "relative",
        zIndex: 1,
        transition: "color .2s ease"
      }
    }, opt.label);
  }));
}
function StageSprite({
  stage,
  size = 110
}) {
  const meta = getStageMeta(stage);
  const [imgFail, setImgFail] = useState(false);
  useEffect(() => setImgFail(false), [meta.sprite]);
  if (!meta.sprite || imgFail) {
    return React.createElement("div", {
      style: {
        width: size,
        height: size,
        borderRadius: 12,
        border: "1px solid #d0dae7",
        background: "#f8fbff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 8
      }
    }, React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 800,
        color: "#475569",
        letterSpacing: ".02em",
        lineHeight: 1.2
      }
    }, meta.name.toUpperCase()));
  }
  return React.createElement("img", {
    src: meta.sprite,
    alt: meta.name,
    onError: () => setImgFail(true),
    style: {
      width: size,
      height: size,
      objectFit: "contain",
      imageRendering: "pixelated",
      filter: "drop-shadow(0 4px 8px #00000026)"
    }
  });
}
function StagePicker({
  value,
  onChange,
  accent = "#1d4ed8",
  options = STAGES
}) {
  const stages = Array.isArray(options) && options.length ? options : STAGES;
  const idx = Math.max(0, stages.indexOf(value));
  const currentStage = stages[idx] || stages[0];
  const current = getStageMeta(currentStage);
  const canPrev = idx > 0;
  const canNext = idx < stages.length - 1;
  const go = dir => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= stages.length) return;
    onChange(stages[nextIdx]);
  };
  const arrowBtn = enabled => ({
    border: "1px solid #c4d0df",
    background: enabled ? "#ffffff" : "#edf2f7",
    color: enabled ? accent : "#94a3b8",
    borderRadius: 10,
    width: 42,
    height: 42,
    fontSize: 20,
    fontWeight: 800,
    cursor: enabled ? "pointer" : "not-allowed"
  });
  return React.createElement("div", {
    style: {
      border: "1px solid #c4d0df",
      borderRadius: 12,
      background: "#f8fbff",
      padding: 10
    }
  }, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "42px 1fr 42px",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("button", {
    type: "button",
    style: arrowBtn(canPrev),
    onClick: () => go(-1),
    disabled: !canPrev
  }, "\u2190"), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      minHeight: 154
    }
  }, React.createElement(StageSprite, {
    stage: currentStage
  }), React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, current.name.toUpperCase()), !!current.note && React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#475569",
      fontWeight: 700,
      marginTop: 2,
      textTransform: "uppercase",
      letterSpacing: ".03em"
    }
  }, `(${current.note})`))), React.createElement("button", {
    type: "button",
    style: arrowBtn(canNext),
    onClick: () => go(1),
    disabled: !canNext
  }, "\u2192")));
}
function PhotosTab({
  birdId,
  photos,
  onAdd,
  onDel,
  accent = "#b45309"
}) {
  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({
    kind: "idle",
    msg: ""
  });
  const camRef = useRef(null);
  const galRef = useRef(null);
  const statusTimer = useRef(null);
  const mine = useMemo(() => [...photos].sort((a, b) => new Date(a.takenAt || 0) - new Date(b.takenAt || 0)), [photos]);
  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
  }, []);
  function photoDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  function photoDateTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function flash(kind, msg) {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus({
      kind,
      msg
    });
    statusTimer.current = setTimeout(() => setStatus({
      kind: "idle",
      msg: ""
    }), 2600);
  }
  async function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      e.target.value = "";
      return;
    }
    if (!f.type.startsWith("image/")) {
      flash("err", "Please select an image file.");
      e.target.value = "";
      return;
    }
    setLoading(true);
    flash("busy", "Processing photo...");
    try {
      if (mine.length >= MAX_BIRD_PHOTOS) await onDel(birdId, mine[0].id);
      const data = await compressImg(f);
      await onAdd({
        id: uid(),
        birdId,
        dataUrl: data,
        takenAt: new Date().toISOString(),
        sizeKb: Math.round(data.length * .75 / 1024)
      });
      flash("ok", "Photo captured and saved.");
    } catch (err) {
      console.error(err);
      flash("err", "Could not save photo. Please try again.");
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  }
  async function handleDelete(id) {
    if (!window.confirm("Delete photo?")) return;
    try {
      await onDel(birdId, id);
      if (box && box.id === id) setBox(null);
      flash("ok", "Photo removed.");
    } catch (err) {
      console.error(err);
      flash("err", "Could not remove photo. Please try again.");
    }
  }
  return React.createElement("div", null, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#475569",
      fontWeight: 700
    }
  }, mine.length, " / ", MAX_BIRD_PHOTOS, " photos")), !!mine.length && React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      marginBottom: 14
    }
  }, mine.map(ph => {
    const hasImg = !!ph.dataUrl;
    return React.createElement("div", {
      key: ph.id
    }, React.createElement("div", {
      style: {
        background: "#d9e3ef",
        border: "2px dashed #c4d0df",
        borderRadius: 14,
        aspectRatio: "1",
        overflow: "hidden",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 6
      }
    }, hasImg ? React.createElement("img", {
      src: ph.dataUrl,
      alt: "",
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        cursor: "pointer"
      },
      onClick: () => setBox(ph)
    }) : React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569",
        textAlign: "center",
        fontWeight: 700,
        padding: "0 10px"
      }
    }, "Image purged"), React.createElement("button", {
      style: {
        position: "absolute",
        bottom: 6,
        right: 6,
        background: "#ffffffd9",
        border: "none",
        borderRadius: 8,
        padding: "5px 9px",
        color: "#b91c1c",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer"
      },
      onClick: () => handleDelete(ph.id)
    }, "\u2715"), React.createElement("div", {
      style: {
        position: "absolute",
        bottom: 6,
        left: 6,
        background: "#ffffffd9",
        borderRadius: 6,
        padding: "2px 6px",
        fontSize: 11,
        color: "#475569"
      }
    }, hasImg ? `~${ph.sizeKb}KB` : "purged")), React.createElement("div", {
      style: {
        textAlign: "center",
        fontSize: 12,
        color: "#475569",
        marginTop: 6,
        minHeight: 16
      }
    }, photoDate(ph.takenAt)));
  })), !mine.length && React.createElement(Empty, {
    icon: "\uD83D\uDCF7",
    msg: "No photos yet"
  }), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      color: loading ? "#475569" : accent,
      borderColor: loading ? "#c4d0df" : accent + "55",
      padding: "14px 12px"
    },
    onClick: () => camRef.current && camRef.current.click(),
    disabled: loading
  }, loading ? "⏳ Saving..." : "📸 Capture"), React.createElement("button", {
    style: {
      ...C.sec,
      color: "#475569",
      padding: "14px 12px"
    },
    onClick: () => galRef.current && galRef.current.click(),
    disabled: loading
  }, loading ? "⏳ Saving..." : "🖼 Pick File"), React.createElement("input", {
    ref: camRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    style: {
      display: "none"
    },
    onChange: handleFile,
    disabled: loading
  }), React.createElement("input", {
    ref: galRef,
    type: "file",
    accept: "image/*",
    style: {
      display: "none"
    },
    onChange: handleFile,
    disabled: loading
  })), status.kind !== "idle" && React.createElement("div", {
    style: {
      textAlign: "center",
      fontSize: 14,
      padding: "10px 0",
      color: status.kind === "ok" ? "#15803d" : status.kind === "err" ? "#b91c1c" : "#475569"
    }
  }, status.msg), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      marginTop: 10,
      textAlign: "center"
    }
  }, "Compressed to ~800px \xB7 keeps the ", MAX_BIRD_PHOTOS, " newest photos"), box && box.dataUrl && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000000f0",
      zIndex: 500,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    },
    onClick: () => setBox(null)
  }, React.createElement("img", {
    src: box.dataUrl,
    alt: "",
    style: {
      maxWidth: "100%",
      maxHeight: "85dvh",
      objectFit: "contain",
      borderRadius: 8
    }
  }), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14,
      marginTop: 10
    }
  }, photoDateTime(box.takenAt), " \xB7 ~", box.sizeKb, "KB \xB7 tap to close")));
}

/* FILE: src/screens/dashboard.js */
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

/* FILE: src/core/pwa.js */
(function() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", {
      scope: "./"
    }).catch(err => {
      console.error("FlockTrack offline support could not be enabled.", err);
    });
  });
})();

/* FILE: src/app-shell.js */
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
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(DESKTOP_SHELL_MEDIA_QUERY).matches;
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
  const [isDesktopShell, setIsDesktopShell] = useState(() => desktopShellMatches());
  const photoCacheRef = useRef(photoCache);
  const eggPhotoCacheRef = useRef(eggPhotoCache);
  const gistSyncRef = useRef(gistSyncConfig);
  const deleteUndoTimer = useRef(null);
  const lazyScreenPromisesRef = useRef({});
  const deferredLoadPromiseRef = useRef(null);
  const idleDeferredTaskRef = useRef(null);
  const dataLoadVersionRef = useRef(0);
  const birdsLive = useMemo(() => birds.filter(b => !b.archivedAt), [birds]);
  const birdById = useMemo(() => new Map(birds.map(bird => [bird.id, bird])), [birds]);
  const hideableTabs = useMemo(() => HIDEABLE_TAB_ORDER.map(id => TABS.find(tabDef => tabDef.id === id)).filter(Boolean), []);
  const visibleNavTabs = useMemo(() => TABS.filter(tabDef => !HIDEABLE_TAB_IDS.has(tabDef.id) || tabVisibility[tabDef.id] !== false), [tabVisibility]);
  const shellStyles = useMemo(() => ({
    page: isDesktopShell ? {
      ...C.page,
      paddingBottom: 24,
      paddingLeft: 292,
      background: "linear-gradient(180deg, #eef4fb 0%, #f8fafc 100%)"
    } : C.page,
    bar: isDesktopShell ? {
      ...C.bar,
      padding: "18px 28px",
      background: "rgba(248, 250, 252, 0.9)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)"
    } : C.bar,
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
    }
  }), [isDesktopShell]);
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
    setBatches(core?.eggBatches || []);
    setBirds(core?.birds || []);
    setMeasurements(normalizedMeasurements.rows);
    setInstances(core?.reminderInstances || []);
    setEggStates(core?.eggStates || []);
    setPens(core?.pens || []);
    setFeedTypes(core?.feedTypes || []);
    setPenFeedLogs(core?.penFeedLogs || []);
    setFinanceEntries(core?.financeEntries || []);
    if (normalizedMeasurements.changed) {
      dbReplace("measurements", normalizedMeasurements.rows).catch(console.error);
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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(DESKTOP_SHELL_MEDIA_QUERY);
    const handleChange = event => setIsDesktopShell(!!event.matches);
    setIsDesktopShell(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
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
    } : C.navB(tab === t.id),
    onClick: () => setTab(t.id)
  }, React.createElement("span", {
    style: {
      fontSize: isDesktopShell ? 18 : 20,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: isDesktopShell ? 24 : 28,
      height: 24,
      overflow: "hidden",
      flexShrink: 0
    }
  }, t.iconSrc ? React.createElement("img", {
    src: t.iconSrc,
    alt: "",
    style: {
      width: isDesktopShell ? 24 : 28,
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
  }, React.createElement("span", {
    style: {
      fontSize: 26
    }
  }, "\uD83D\uDC14"), React.createElement("span", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      color: "#b45309",
      flex: 1,
      letterSpacing: "-0.5px"
    }
  }, "FlockTrack"), React.createElement("div", {
    style: {
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
      padding: "2px 10px",
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer",
      lineHeight: 1.4
    }
  }, headerDateLabel), React.createElement("span", {
    style: {
      fontSize: 13,
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
    ensureBirdPhotos: ensureBirdPhotos
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
    onAdd: addBatch,
    onUpdate: updBatch,
    onHatch: addBird,
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
      padding: "18px 12px 96px",
      overflowY: "auto"
    },
    onClick: closeCalendarModal
  }, React.createElement("div", {
    style: {
      width: "min(560px, 100%)",
      background: "#ffffff",
      border: "1px solid #cbd5e1",
      borderRadius: 16,
      padding: 14,
      boxShadow: "0 18px 42px #00000033"
    },
    onClick: event => event.stopPropagation()
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
        minHeight: 48,
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
      bottom: isDesktopShell ? 24 : 72,
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
    style: C.nav
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
