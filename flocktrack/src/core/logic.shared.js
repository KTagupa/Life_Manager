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
