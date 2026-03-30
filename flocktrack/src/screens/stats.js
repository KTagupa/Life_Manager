const STATS_HATCH_ALERT_WINDOW_DAYS = globalThis.FlockTrackLogic?.HATCH_ALERT_WINDOW_DAYS || 2;
const statsAddDaysToDay = globalThis.FlockTrackLogic?.addDaysToDay;
const statsEstimatePenFeedLog = globalThis.FlockTrackLogic?.estimatePenFeedLog;

function statsNormalizeDay(value) {
  const normalizeDay = globalThis.FlockTrackLogic?.normalizeDay;
  if (typeof normalizeDay === "function") return normalizeDay(value);
  if (!value) return "";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

function statsRecentDays(count, endDay = today()) {
  const total = Math.max(1, Number(count) || 1);
  const end = statsNormalizeDay(endDay) || today();
  if (typeof statsAddDaysToDay === "function") {
    return Array.from({
      length: total
    }, (_, idx) => statsAddDaysToDay(end, idx - total + 1));
  }
  const endMs = dateMs(`${end}T00:00:00`);
  return Array.from({
    length: total
  }, (_, idx) => new Date(endMs + (idx - total + 1) * DAY_MS).toISOString().slice(0, 10));
}

function statsShortDayLabel(value) {
  const day = statsNormalizeDay(value);
  if (!day) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short"
  });
}

function statsFeedDay(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return statsNormalizeDay(raw);
}

function statsRequiredFeedLogs(dayValue, now = new Date()) {
  const day = statsFeedDay(dayValue);
  if (!day) return 2;
  return day === today() && now.getHours() < 12 ? 1 : 2;
}

function statsMassUnitFactor(unit) {
  const normalized = String(unit || "").trim().toLowerCase();
  if (normalized === "kg") return 1;
  if (normalized === "g") return 0.001;
  if (normalized === "lb") return 0.45359237;
  return null;
}

function statsToKg(value, unit) {
  const amount = Number(value);
  const factor = statsMassUnitFactor(unit);
  if (!Number.isFinite(amount) || factor == null) return null;
  return amount * factor;
}

function statsFmtWeightKg(valueKg) {
  const numeric = Number(valueKg);
  if (!Number.isFinite(numeric)) return "—";
  return `${fmtNum(numeric * 1000)} g`;
}

function statsFmtKg(valueKg) {
  const numeric = Number(valueKg);
  if (!Number.isFinite(numeric)) return "—";
  return `${fmtNum(numeric)} kg`;
}

function statsFmtKgPerBird(valueKg) {
  const numeric = Number(valueKg);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric < 1) return `${fmtNum(numeric * 1000)} g/bird`;
  return `${fmtNum(numeric)} kg/bird`;
}

function statsPlural(value, singular, plural = `${singular}s`) {
  return `${fmtNum(value)} ${value === 1 ? singular : plural}`;
}

function StatsSection({
  icon,
  title,
  subtitle,
  accent = "#0f172a",
  background = "#ffffff",
  borderColor = "#d9e3ef",
  children
}) {
  return React.createElement("div", {
    style: {
      ...C.card,
      background,
      borderColor
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 12,
      display: "grid",
      placeItems: "center",
      background: `${accent}18`,
      fontSize: 18
    }
  }, icon), React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: accent
    }
  }, title), subtitle && React.createElement("div", {
    style: {
      marginTop: 2,
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.35
    }
  }, subtitle))), children);
}

function StatsKpiGrid({
  items
}) {
  return React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: 10
    }
  }, items.map(item => React.createElement("div", {
    key: item.label,
    style: {
      background: item.background || "#ffffff",
      border: `1px solid ${item.borderColor || "#d9e3ef"}`,
      borderRadius: 14,
      padding: "12px 13px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      fontWeight: 800
    }
  }, item.label), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: String(item.value || "").length > 12 ? 18 : 24,
      fontWeight: 900,
      color: item.color || "#0f172a",
      lineHeight: 1.05,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, item.value), item.note && React.createElement("div", {
    style: {
      marginTop: 5,
      color: "#475569",
      fontSize: 12,
      lineHeight: 1.35,
      minHeight: 32
    }
  }, item.note))));
}

function StatsCompositionBar({
  segments,
  height = 10
}) {
  const total = (segments || []).reduce((sum, segment) => sum + (segment.value || 0), 0);
  if (!total) {
    return React.createElement("div", {
      style: {
        height,
        borderRadius: 999,
        background: "#e5edf6"
      }
    });
  }
  return React.createElement("div", {
    style: {
      display: "flex",
      height,
      overflow: "hidden",
      borderRadius: 999,
      background: "#e5edf6"
    }
  }, (segments || []).filter(segment => segment.value > 0).map(segment => React.createElement("div", {
    key: segment.id,
    title: `${segment.label}: ${fmtNum(segment.value)}`,
    style: {
      width: `${segment.value / total * 100}%`,
      background: segment.color
    }
  })));
}

function StatsMeterRow({
  label,
  value,
  total,
  tone,
  detail
}) {
  const numericValue = Number(value) || 0;
  const numericTotal = Number(total) || 0;
  const pct = numericTotal > 0 ? numericValue / numericTotal * 100 : 0;
  return React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "baseline"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: "#0f172a"
    }
  }, label), React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: tone
    }
  }, fmtNum(numericValue), numericTotal > 0 ? ` (${fmtPct(numericValue, numericTotal)})` : "")), React.createElement("div", {
    style: {
      marginTop: 6,
      height: 8,
      borderRadius: 999,
      background: "#e5edf6",
      overflow: "hidden"
    }
  }, React.createElement("div", {
    style: {
      width: `${Math.max(0, Math.min(100, pct))}%`,
      height: "100%",
      background: tone,
      borderRadius: 999
    }
  })), detail && React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#64748b",
      lineHeight: 1.35
    }
  }, detail));
}

function StatsTrendBars({
  items,
  tone,
  valueFormatter,
  emptyLabel
}) {
  const list = Array.isArray(items) ? items : [];
  const max = list.reduce((best, item) => Math.max(best, Number(item?.value) || 0), 0);
  if (!list.length || !max) {
    return React.createElement("div", {
      style: {
        padding: "18px 12px",
        color: "#64748b",
        fontSize: 13,
        textAlign: "center",
        border: "1px dashed #cbd5e1",
        borderRadius: 12,
        background: "#ffffff99"
      }
    }, emptyLabel || "No chart data yet.");
  }
  return React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: `repeat(${list.length}, minmax(0,1fr))`,
      gap: 8,
      alignItems: "end"
    }
  }, list.map(item => {
    const value = Number(item.value) || 0;
    return React.createElement("div", {
      key: item.id || item.label,
      style: {
        minWidth: 0
      }
    }, React.createElement("div", {
      style: {
        height: 92,
        display: "flex",
        alignItems: "flex-end"
      }
    }, React.createElement("div", {
      title: valueFormatter ? valueFormatter(value) : fmtNum(value),
      style: {
        width: "100%",
        minHeight: value > 0 ? 12 : 4,
        height: `${Math.max(8, value / max * 100)}%`,
        borderRadius: "12px 12px 4px 4px",
        background: `linear-gradient(180deg, ${tone} 0%, ${tone}cc 100%)`,
        boxShadow: `inset 0 1px 0 ${tone}55`
      }
    })), React.createElement("div", {
      style: {
        marginTop: 7,
        fontSize: 11,
        fontWeight: 800,
        color: "#334155",
        textAlign: "center"
      }
    }, item.label), React.createElement("div", {
      style: {
        marginTop: 2,
        fontSize: 10,
        color: "#64748b",
        textAlign: "center",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, valueFormatter ? valueFormatter(value) : fmtNum(value)));
  }));
}

function StatsSimpleRows({
  rows,
  emptyLabel,
  tone
}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return React.createElement("div", {
      style: {
        color: "#64748b",
        fontSize: 13,
        lineHeight: 1.4
      }
    }, emptyLabel || "Nothing logged yet.");
  }
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, list.map(row => React.createElement("div", {
    key: row.id || row.label,
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "center",
      padding: "10px 12px",
      borderRadius: 12,
      background: "#ffffffb5",
      border: "1px solid #dbe5f0"
    }
  }, React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: "#0f172a",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, row.label), row.note && React.createElement("div", {
    style: {
      marginTop: 2,
      fontSize: 12,
      color: "#64748b",
      lineHeight: 1.35
    }
  }, row.note)), React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: row.tone || tone || "#0f172a",
      whiteSpace: "nowrap"
    }
  }, row.value))));
}

function StatsTab({
  birds,
  batches,
  pens,
  feedTypes,
  penFeedLogs,
  measurements,
  healthEvents,
  reminders,
  eggStates
}) {
  birds = Array.isArray(birds) ? birds : [];
  batches = Array.isArray(batches) ? batches : [];
  pens = Array.isArray(pens) ? pens : [];
  feedTypes = Array.isArray(feedTypes) ? feedTypes : [];
  penFeedLogs = Array.isArray(penFeedLogs) ? penFeedLogs : [];
  measurements = Array.isArray(measurements) ? measurements : [];
  healthEvents = Array.isArray(healthEvents) ? healthEvents : [];
  reminders = Array.isArray(reminders) ? reminders : [];
  eggStates = Array.isArray(eggStates) ? eggStates : [];
  const now = new Date();
  const nowMs = now.getTime();
  const todayDay = today();
  const recent7Days = statsRecentDays(7, todayDay);
  const recent30StartMs = nowMs - 29 * DAY_MS;
  const liveBirds = birds.filter(bird => !bird.archivedAt);
  const activeBirds = liveBirds.filter(bird => (bird.status || "active") === "active");
  const birdById = new Map(birds.map(bird => [bird.id, bird]));
  const feedTypeById = new Map(feedTypes.map(feedType => [feedType.id, feedType]));
  const activeBirdsByPen = new Map();
  activeBirds.forEach(bird => {
    if (!bird.penId) return;
    const existing = activeBirdsByPen.get(bird.penId) || [];
    existing.push(bird);
    activeBirdsByPen.set(bird.penId, existing);
  });
  const activePens = pens.filter(pen => (activeBirdsByPen.get(pen.id) || []).length > 0);
  const activeBirdIdSet = new Set(activeBirds.map(bird => bird.id));
  const latestWeightByBird = new Map();
  const weightMeasurements = [];
  const eggMeasurements = [];
  measurements.forEach(measurement => {
    if (measurement.metricType === "weight") {
      weightMeasurements.push(measurement);
      const existing = latestWeightByBird.get(measurement.birdId);
      if (!existing || dateMs(measurement.measuredAt) > dateMs(existing.measuredAt)) latestWeightByBird.set(measurement.birdId, measurement);
    }
    if (measurement.metricType === "egg_count") eggMeasurements.push(measurement);
  });
  const staleWeightMs = DAY_MS * 14;
  const needsWeight = activeBirds.filter(bird => {
    const latest = latestWeightByBird.get(bird.id);
    if (!latest) return true;
    const measuredAtMs = dateMs(latest.measuredAt);
    if (!measuredAtMs) return true;
    return nowMs - measuredAtMs > staleWeightMs;
  }).sort((a, b) => {
    const aMs = dateMs(latestWeightByBird.get(a.id)?.measuredAt);
    const bMs = dateMs(latestWeightByBird.get(b.id)?.measuredAt);
    if (aMs !== bMs) return aMs - bMs;
    return normalizeTagId(a.tagId).localeCompare(normalizeTagId(b.tagId), undefined, {
      numeric: true
    });
  });
  const freshWeightCount = Math.max(0, activeBirds.length - needsWeight.length);
  const latestWeightKgValues = activeBirds.map(bird => statsToKg(latestWeightByBird.get(bird.id)?.value, latestWeightByBird.get(bird.id)?.unit)).filter(value => Number.isFinite(value));
  const avgLatestWeightKg = latestWeightKgValues.length ? latestWeightKgValues.reduce((sum, value) => sum + value, 0) / latestWeightKgValues.length : null;
  const latestWeightRecord = [...weightMeasurements].sort((a, b) => dateMs(b.measuredAt) - dateMs(a.measuredAt))[0] || null;
  const weightTrendMap = new Map();
  weightMeasurements.forEach(measurement => {
    if (!activeBirdIdSet.has(measurement.birdId)) return;
    const kg = statsToKg(measurement.value, measurement.unit);
    const day = statsNormalizeDay(measurement.measuredAt);
    if (!Number.isFinite(kg) || !day) return;
    const current = weightTrendMap.get(day) || {
      sum: 0,
      count: 0
    };
    current.sum += kg;
    current.count += 1;
    weightTrendMap.set(day, current);
  });
  const weightTrend = [...weightTrendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-7).map(([day, value]) => ({
    id: day,
    label: statsShortDayLabel(day),
    value: value.count ? value.sum / value.count : 0
  }));
  const weightTrendNote = weightTrend.length >= 2 ? (() => {
    const first = weightTrend[0].value;
    const last = weightTrend[weightTrend.length - 1].value;
    const diff = last - first;
    if (Math.abs(diff) < 0.03) return "Recent average weight is steady.";
    return `${diff > 0 ? "Up" : "Down"} ${statsFmtWeightKg(Math.abs(diff))} across the recent logged weigh days.`;
  })() : "Need at least two logged weigh days to show a trend.";
  const feedLogCountByPenDay = new Map();
  penFeedLogs.forEach(log => {
    const day = statsFeedDay(log.loggedAt);
    if (!log.penId || !day) return;
    const key = `${log.penId}::${day}`;
    feedLogCountByPenDay.set(key, (feedLogCountByPenDay.get(key) || 0) + 1);
  });
  const requiredTodayFeedLogs = statsRequiredFeedLogs(todayDay, now);
  const todayFedPens = activePens.filter(pen => (feedLogCountByPenDay.get(`${pen.id}::${todayDay}`) || 0) >= requiredTodayFeedLogs).length;
  const needsFeedPens = activePens.filter(pen => (feedLogCountByPenDay.get(`${pen.id}::${todayDay}`) || 0) < requiredTodayFeedLogs);
  const recent7DaySet = new Set(recent7Days);
  const feedDayMap = new Map(recent7Days.map(day => [day, {
    kg: 0
  }]));
  const penFeedTotals = new Map();
  const feedTypeTotals = new Map();
  let totalFeedKg7 = 0;
  let feedMassRounds7 = 0;
  let unsupportedFeedRounds7 = 0;
  let feedPerBirdRoundKgTotal = 0;
  let feedPerBirdRoundCount = 0;
  penFeedLogs.forEach(log => {
    const day = statsFeedDay(log.loggedAt);
    if (!day || !recent7DaySet.has(day)) return;
    const kg = statsToKg(log.amount, log.unit);
    if (!Number.isFinite(kg)) {
      unsupportedFeedRounds7 += 1;
      return;
    }
    totalFeedKg7 += kg;
    feedMassRounds7 += 1;
    const dayRow = feedDayMap.get(day);
    if (dayRow) dayRow.kg += kg;
    penFeedTotals.set(log.penId, (penFeedTotals.get(log.penId) || 0) + kg);
    feedTypeTotals.set(log.feedTypeId, {
      kg: (feedTypeTotals.get(log.feedTypeId)?.kg || 0) + kg,
      count: (feedTypeTotals.get(log.feedTypeId)?.count || 0) + 1
    });
    if (typeof statsEstimatePenFeedLog === "function") {
      const estimate = statsEstimatePenFeedLog({
        log,
        birds
      });
      if (estimate?.birdCount) {
        feedPerBirdRoundKgTotal += kg / estimate.birdCount;
        feedPerBirdRoundCount += 1;
      }
    }
  });
  const feedTrend = recent7Days.map(day => ({
    id: day,
    label: statsShortDayLabel(day),
    value: feedDayMap.get(day)?.kg || 0
  }));
  const avgFeedPerDayKg7 = totalFeedKg7 / recent7Days.length;
  const avgFeedPerBirdRoundKg = feedPerBirdRoundCount ? feedPerBirdRoundKgTotal / feedPerBirdRoundCount : null;
  const topFeedTypeEntry = [...feedTypeTotals.entries()].sort((a, b) => b[1].kg - a[1].kg || b[1].count - a[1].count)[0] || null;
  const topFeedTypeName = topFeedTypeEntry ? feedTypeById.get(topFeedTypeEntry[0])?.name || "Feed" : "—";
  const topFeedPens = pens.map(pen => {
    const kg = penFeedTotals.get(pen.id) || 0;
    return {
      id: pen.id,
      label: pen.name || "Pen",
      value: statsFmtKg(kg),
      note: `${statsPlural((activeBirdsByPen.get(pen.id) || []).length, "bird")} active now`,
      sortValue: kg,
      tone: "#a16207"
    };
  }).filter(row => row.sortValue > 0).sort((a, b) => b.sortValue - a.sortValue).slice(0, 4);
  const batchStatsById = new Map();
  batches.forEach(batch => batchStatsById.set(batch.id, {
    hatched: 0,
    failed: 0,
    pending: Math.max(0, Number(batch.eggCount) || 0)
  }));
  eggStates.forEach(state => {
    const current = batchStatsById.get(state.batchId);
    if (!current) return;
    if (state.status === "hatched") current.hatched += 1;
    if (state.status === "failed") current.failed += 1;
  });
  batchStatsById.forEach((stats, batchId) => {
    const batch = batches.find(item => item.id === batchId);
    const total = Math.max(0, Number(batch?.eggCount) || 0);
    stats.pending = Math.max(0, total - stats.hatched - stats.failed);
    stats.eggCount = total;
  });
  let hatcheryTotalEggs = 0;
  let hatcheryHatched = 0;
  let hatcheryFailed = 0;
  let hatcheryPending = 0;
  batchStatsById.forEach(stats => {
    hatcheryTotalEggs += stats.eggCount || 0;
    hatcheryHatched += stats.hatched || 0;
    hatcheryFailed += stats.failed || 0;
    hatcheryPending += stats.pending || 0;
  });
  const batchPerformanceRows = batches.map(batch => {
    const stats = batchStatsById.get(batch.id) || {
      hatched: 0,
      failed: 0,
      pending: Math.max(0, Number(batch.eggCount) || 0),
      eggCount: Math.max(0, Number(batch.eggCount) || 0)
    };
    return {
      id: batch.id,
      label: batch.code || "Batch",
      eggCount: stats.eggCount,
      hatched: stats.hatched,
      failed: stats.failed,
      pending: stats.pending,
      hatchRate: stats.eggCount ? stats.hatched / stats.eggCount : 0
    };
  }).sort((a, b) => {
    const aOpen = a.pending > 0 ? 1 : 0;
    const bOpen = b.pending > 0 ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    if (a.hatchRate !== b.hatchRate) return b.hatchRate - a.hatchRate;
    return b.eggCount - a.eggCount;
  }).slice(0, 4);
  const nextHatchReminder = reminders.filter(reminder => reminder.status === "pending" && reminder.source === "auto_hatch").sort((a, b) => dateMs(a.dueAt) - dateMs(b.dueAt))[0] || null;
  const overdueReminders = reminders.filter(reminder => reminder.status === "pending" && dateMs(reminder.dueAt) < nowMs);
  const urgentAutoHatchCount = reminders.filter(reminder => {
    if (reminder.status !== "pending" || reminder.source !== "auto_hatch") return false;
    const dueMs = dateMs(reminder.dueAt);
    if (!dueMs) return false;
    const daysUntil = Math.floor((dueMs - nowMs) / DAY_MS);
    return daysUntil <= STATS_HATCH_ALERT_WINDOW_DAYS;
  }).length;
  const health30 = healthEvents.filter(event => {
    const eventMs = dateMs(event.eventDate);
    return eventMs >= recent30StartMs && eventMs <= nowMs;
  });
  const healthEventTypeCounts = new Map();
  health30.forEach(event => {
    const key = event.eventType || "checkup";
    healthEventTypeCounts.set(key, (healthEventTypeCounts.get(key) || 0) + 1);
  });
  const topHealthType = [...healthEventTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const lossBirds = birds.filter(bird => bird.status === "deceased" || bird.status === "culled");
  const losses30 = lossBirds.filter(bird => {
    const when = bird.status === "deceased" ? bird.deceasedDate : bird.culledDate;
    const eventMs = dateMs(when);
    return eventMs >= recent30StartMs && eventMs <= nowMs;
  });
  const mortalityAll = birds.filter(bird => bird.status === "deceased").length;
  const cullAll = birds.filter(bird => bird.status === "culled").length;
  const lossReasonCounts = new Map();
  lossBirds.forEach(bird => {
    const label = bird.status === "deceased" ? bird.causeOfDeath || "Unspecified death" : bird.cullReason || "Unspecified cull";
    lossReasonCounts.set(label, (lossReasonCounts.get(label) || 0) + 1);
  });
  const topLossReasons = [...lossReasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => ({
    id: label,
    label,
    value: statsPlural(count, "case"),
    tone: "#b91c1c"
  }));
  const soldBirds = birds.filter(bird => bird.status === "sold");
  const sold30 = soldBirds.filter(bird => {
    const soldMs = dateMs(bird.soldDate);
    return soldMs >= recent30StartMs && soldMs <= nowMs;
  });
  const pricedSoldBirds = soldBirds.filter(bird => Number.isFinite(Number(bird.salePrice)));
  const totalSaleValue = pricedSoldBirds.reduce((sum, bird) => sum + Number(bird.salePrice), 0);
  const avgSaleValue = pricedSoldBirds.length ? totalSaleValue / pricedSoldBirds.length : null;
  const recentSales = [...soldBirds].sort((a, b) => dateMs(b.soldDate) - dateMs(a.soldDate)).slice(0, 4).map(bird => ({
    id: bird.id,
    label: bird.tagId || "Bird",
    note: [bird.buyerName || "", bird.soldDate ? fmtDate(bird.soldDate) : ""].filter(Boolean).join(" - "),
    value: Number.isFinite(Number(bird.salePrice)) ? fmtNum(Number(bird.salePrice)) : "No price",
    tone: "#047857"
  }));
  const egg7Set = new Set(recent7Days);
  const eggDayMap = new Map(recent7Days.map(day => [day, 0]));
  let eggTotal7 = 0;
  let eggTotal30 = 0;
  const eggBirdTotals30 = new Map();
  eggMeasurements.forEach(measurement => {
    const value = Math.max(0, Number(measurement.value) || 0);
    const day = statsNormalizeDay(measurement.measuredAt);
    const measuredAtMs = dateMs(measurement.measuredAt);
    if (day && egg7Set.has(day)) {
      eggDayMap.set(day, (eggDayMap.get(day) || 0) + value);
      eggTotal7 += value;
    }
    if (measuredAtMs >= recent30StartMs && measuredAtMs <= nowMs) {
      eggTotal30 += value;
      eggBirdTotals30.set(measurement.birdId, (eggBirdTotals30.get(measurement.birdId) || 0) + value);
    }
  });
  const eggTrend = recent7Days.map(day => ({
    id: day,
    label: statsShortDayLabel(day),
    value: eggDayMap.get(day) || 0
  }));
  const topEggBird = [...eggBirdTotals30.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const currentStatusRows = [{
    id: "active",
    label: "Active",
    value: liveBirds.filter(bird => (bird.status || "active") === "active").length,
    color: "#15803d"
  }, {
    id: "sold",
    label: "Sold",
    value: liveBirds.filter(bird => bird.status === "sold").length,
    color: "#1d4ed8"
  }, {
    id: "deceased",
    label: "Deceased",
    value: liveBirds.filter(bird => bird.status === "deceased").length,
    color: "#b91c1c"
  }, {
    id: "culled",
    label: "Culled",
    value: liveBirds.filter(bird => bird.status === "culled").length,
    color: "#c2410c"
  }].filter(row => row.value > 0 || liveBirds.length > 0);
  const stageCounts = new Map();
  activeBirds.forEach(bird => {
    const stage = bird.stage || stageSuggestion(bird)?.stage || "unknown";
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  });
  const stageRows = [{
    id: "chick",
    label: "Chick",
    color: "#f59e0b"
  }, {
    id: "pullet",
    label: "Pullet",
    color: "#7c3aed"
  }, {
    id: "grower",
    label: "Grower",
    color: "#2563eb"
  }, {
    id: "layer",
    label: "Layer",
    color: "#15803d"
  }, {
    id: "broiler",
    label: "Broiler",
    color: "#b45309"
  }, {
    id: "rooster",
    label: "Rooster",
    color: "#475569"
  }, {
    id: "retired",
    label: "Retired",
    color: "#64748b"
  }, {
    id: "unknown",
    label: "Unknown",
    color: "#94a3b8"
  }].map(row => ({
    ...row,
    value: stageCounts.get(row.id) || 0
  })).filter(row => row.value > 0);
  const topPensByBirdCount = pens.map(pen => ({
    id: pen.id,
    label: pen.name || "Pen",
    note: pen.location || "Active pen",
    value: statsPlural((activeBirdsByPen.get(pen.id) || []).length, "bird"),
    sortValue: (activeBirdsByPen.get(pen.id) || []).length,
    tone: "#0f766e"
  })).filter(row => row.sortValue > 0).sort((a, b) => b.sortValue - a.sortValue).slice(0, 4);
  const pulseTone = overdueReminders.length ? "#b91c1c" : needsFeedPens.length || needsWeight.length ? "#b45309" : "#15803d";
  const pulseTitle = overdueReminders.length ? "Needs attention today" : needsFeedPens.length || needsWeight.length ? "A few things to tighten up" : "Farm looks steady today";
  const pulseSummary = activeBirds.length ? `${statsPlural(activeBirds.length, "active bird")} across ${statsPlural(activePens.length, "working pen")}.` : "Start adding birds and pens to unlock live farm stats.";
  const pulseDetails = overdueReminders.length ? `${statsPlural(overdueReminders.length, "overdue reminder")} need action.` : needsFeedPens.length ? `${statsPlural(needsFeedPens.length, "pen")} still below today's feed target.` : needsWeight.length ? `${statsPlural(needsWeight.length, "bird")} need fresh weights.` : "Feed, weights, and reminders are currently on track.";
  const pulseChips = [{
    tone: "#15803d",
    label: `${statsPlural(activeBirds.length, "bird")} active`
  }, needsFeedPens.length ? {
    tone: "#a16207",
    label: `${statsPlural(needsFeedPens.length, "pen")} need feed`
  } : {
    tone: "#0f766e",
    label: `${todayFedPens}/${activePens.length || 0} pens fed today`
  }, needsWeight.length ? {
    tone: "#c2410c",
    label: `${statsPlural(needsWeight.length, "bird")} need weights`
  } : {
    tone: "#2563eb",
    label: `${fmtPct(freshWeightCount, activeBirds.length)} weights fresh`
  }, overdueReminders.length ? {
    tone: "#b91c1c",
    label: `${statsPlural(overdueReminders.length, "reminder")} overdue`
  } : nextHatchReminder ? {
    tone: "#1d4ed8",
    label: `${nextHatchReminder.batchCode || "Batch"} due ${fmtDate(nextHatchReminder.expectedHatchDate || nextHatchReminder.dueAt)}`
  } : {
    tone: "#475569",
    label: "No urgent reminders"
  }].filter(Boolean);
  const snapshotItems = [{
    label: "Active Birds",
    value: fmtNum(activeBirds.length),
    note: `${statsPlural(activePens.length, "pen")} in use`,
    color: "#15803d",
    background: "#f0fdf4",
    borderColor: "#86efac"
  }, {
    label: "Weights Fresh",
    value: activeBirds.length ? fmtPct(freshWeightCount, activeBirds.length) : "—",
    note: `${fmtNum(freshWeightCount)} of ${fmtNum(activeBirds.length)} within 14 days`,
    color: "#c2410c",
    background: "#fff7ed",
    borderColor: "#fdba74"
  }, {
    label: "Feed Today",
    value: activePens.length ? `${todayFedPens}/${activePens.length}` : "—",
    note: requiredTodayFeedLogs === 1 ? "morning target" : "full-day target",
    color: "#a16207",
    background: "#fffbeb",
    borderColor: "#fcd34d"
  }, {
    label: "Hatch Rate",
    value: hatcheryTotalEggs ? fmtPct(hatcheryHatched, hatcheryTotalEggs) : "—",
    note: hatcheryPending ? `${fmtNum(hatcheryPending)} eggs still pending` : "No pending eggs",
    color: "#1d4ed8",
    background: "#eff6ff",
    borderColor: "#93c5fd"
  }];
  const hasAnyStats = birds.length || batches.length || penFeedLogs.length || measurements.length || healthEvents.length;
  return React.createElement("div", {
    style: C.body
  }, React.createElement("div", {
    style: {
      padding: "20px 0 14px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 26,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "Stats"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 15,
      marginTop: 2
    }
  }, "Quick farm numbers tuned for a phone-sized screen")), !hasAnyStats && React.createElement(Empty, {
    icon: "📊",
    msg: "Add birds, feed logs, weights, or batches to unlock stats."
  }), hasAnyStats && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      marginBottom: 14,
      borderRadius: 20,
      padding: 18,
      background: `linear-gradient(135deg, ${pulseTone} 0%, #f59e0b 48%, #fff7ed 100%)`,
      color: "#ffffff",
      boxShadow: "0 14px 28px #b4530924"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: ".08em",
      opacity: 0.88
    }
  }, "Farm Pulse"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 25,
      fontWeight: 900,
      lineHeight: 1.08
    }
  }, pulseTitle), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 15,
      lineHeight: 1.45,
      maxWidth: 620
    }
  }, pulseSummary, " ", pulseDetails), React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14
    }
  }, pulseChips.map(chip => React.createElement("div", {
    key: chip.label,
    style: {
      borderRadius: 999,
      padding: "7px 11px",
      fontSize: 12,
      fontWeight: 800,
      background: "#ffffffde",
      color: chip.tone,
      border: `1px solid ${chip.tone}33`
    }
  }, chip.label)))), React.createElement(StatsKpiGrid, {
    items: snapshotItems
  }), React.createElement(StatsSection, {
    icon: "🐓",
    title: "Flock Mix",
    subtitle: "Current birds, active stages, and where the flock is sitting right now.",
    accent: "#15803d"
  }, liveBirds.length > 0 ? React.createElement(React.Fragment, null, React.createElement(StatsCompositionBar, {
    segments: currentStatusRows
  }), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: 10,
      marginTop: 12
    }
  }, currentStatusRows.map(row => React.createElement("div", {
    key: row.id,
    style: {
      padding: "10px 12px",
      borderRadius: 12,
      background: `${row.color}10`,
      border: `1px solid ${row.color}33`
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#64748b",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: ".05em"
    }
  }, row.label), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 22,
      fontWeight: 900,
      color: row.color
    }
  }, fmtNum(row.value)), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#475569"
    }
  }, liveBirds.length ? fmtPct(row.value, liveBirds.length) : "—")))), stageRows.length > 0 && React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#334155",
      textTransform: "uppercase",
      letterSpacing: ".05em"
    }
  }, "Active Stage Mix"), stageRows.map(row => React.createElement(StatsMeterRow, {
    key: row.id,
    label: row.label,
    value: row.value,
    total: activeBirds.length,
    tone: row.color,
    detail: activeBirds.length ? `${fmtPct(row.value, activeBirds.length)} of active birds` : ""
  }))), React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#334155",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 10
    }
  }, "Birds Per Pen"), React.createElement(StatsSimpleRows, {
    rows: topPensByBirdCount,
    emptyLabel: "No active pens yet.",
    tone: "#0f766e"
  }))) : React.createElement("div", {
    style: {
      color: "#64748b",
      fontSize: 14
    }
  }, "No current birds yet.")), React.createElement(StatsSection, {
    icon: "📏",
    title: "Growth and Weights",
    subtitle: "Latest body weights for the active flock, plus the birds that need a fresh weigh-in.",
    accent: "#c2410c",
    background: "#fff7ed",
    borderColor: "#fdba74"
  }, React.createElement(StatsKpiGrid, {
    items: [{
      label: "Avg Latest Weight",
      value: statsFmtWeightKg(avgLatestWeightKg),
      note: latestWeightKgValues.length ? `${statsPlural(latestWeightKgValues.length, "bird")} with convertible weight logs` : "No convertible weight logs yet",
      color: "#c2410c",
      background: "#ffffffd9",
      borderColor: "#fed7aa"
    }, {
      label: "Fresh Weights",
      value: activeBirds.length ? fmtPct(freshWeightCount, activeBirds.length) : "—",
      note: `${fmtNum(freshWeightCount)} of ${fmtNum(activeBirds.length)} active birds updated in 14 days`,
      color: "#0f766e",
      background: "#ffffffd9",
      borderColor: "#fed7aa"
    }, {
      label: "Need Weighing",
      value: fmtNum(needsWeight.length),
      note: needsWeight[0] ? `${needsWeight[0].tagId || "Bird"} has the stalest or missing log` : "No birds overdue right now",
      color: "#b91c1c",
      background: "#ffffffd9",
      borderColor: "#fed7aa"
    }, {
      label: "Latest Weight Log",
      value: latestWeightRecord ? fmtDate(latestWeightRecord.measuredAt) : "—",
      note: latestWeightRecord ? `${birdById.get(latestWeightRecord.birdId)?.tagId || "Bird"} • ${fmtWeightGrams(latestWeightRecord.value, latestWeightRecord.unit) || `${fmtNum(latestWeightRecord.value)} ${latestWeightRecord.unit || ""}`.trim()}` : "No weight measurement recorded yet",
      color: "#7c2d12",
      background: "#ffffffd9",
      borderColor: "#fed7aa"
    }]
  }), React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      alignItems: "baseline",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#9a3412",
      textTransform: "uppercase",
      letterSpacing: ".05em"
    }
  }, "Recent Weight Trend"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#7c2d12"
    }
  }, weightTrend.length ? `${statsPlural(weightTrend.length, "weigh day")}` : "")), React.createElement(StatsTrendBars, {
    items: weightTrend,
    tone: "#c2410c",
    valueFormatter: statsFmtWeightKg,
    emptyLabel: "Log weights on at least two days to see a trend."
  }), React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 13,
      color: "#7c2d12",
      lineHeight: 1.4
    }
  }, weightTrendNote)), needsWeight.length > 0 && React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#9a3412",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 10
    }
  }, "Birds To Weigh Next"), React.createElement(StatsSimpleRows, {
    rows: needsWeight.slice(0, 4).map(bird => {
      const latest = latestWeightByBird.get(bird.id);
      return {
        id: bird.id,
        label: bird.tagId || "Bird",
        note: latest ? `Last weighed ${fmtDate(latest.measuredAt)}` : "No weight recorded yet",
        value: bird.penId ? (pens.find(pen => pen.id === bird.penId)?.name || "Assigned pen") : "No pen",
        tone: "#c2410c"
      };
    }),
    tone: "#c2410c"
  }))), React.createElement(StatsSection, {
    icon: "🥣",
    title: "Feed Flow",
    subtitle: "Seven-day feed volume, current feed coverage, and the pens receiving the most feed.",
    accent: "#a16207",
    background: "#fffbeb",
    borderColor: "#fcd34d"
  }, React.createElement(StatsKpiGrid, {
    items: [{
      label: "7-Day Mass Feed",
      value: statsFmtKg(totalFeedKg7),
      note: `${statsFmtKg(avgFeedPerDayKg7)} per day across the last 7 days`,
      color: "#a16207",
      background: "#ffffffde",
      borderColor: "#fde68a"
    }, {
      label: "Pens Fed Today",
      value: activePens.length ? `${todayFedPens}/${activePens.length}` : "—",
      note: requiredTodayFeedLogs === 1 ? "morning feed window" : "full-day feed target",
      color: "#0f766e",
      background: "#ffffffde",
      borderColor: "#fde68a"
    }, {
      label: "Top Feed Type",
      value: topFeedTypeName,
      note: topFeedTypeEntry ? `${statsFmtKg(topFeedTypeEntry[1].kg)} across ${statsPlural(topFeedTypeEntry[1].count, "round")}` : "No feed type usage yet",
      color: "#92400e",
      background: "#ffffffde",
      borderColor: "#fde68a"
    }, {
      label: "Feed Rounds",
      value: fmtNum(feedMassRounds7),
      note: avgFeedPerBirdRoundKg != null ? `${statsFmtKgPerBird(avgFeedPerBirdRoundKg)} average per bird round` : unsupportedFeedRounds7 ? `${statsPlural(unsupportedFeedRounds7, "round")} used non-mass units` : "No mass-based feed rounds yet",
      color: "#7c2d12",
      background: "#ffffffde",
      borderColor: "#fde68a"
    }]
  }), React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      alignItems: "baseline",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#92400e",
      textTransform: "uppercase",
      letterSpacing: ".05em"
    }
  }, "Daily Feed Mass"), unsupportedFeedRounds7 > 0 && React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#92400e"
    }
  }, `${statsPlural(unsupportedFeedRounds7, "log")} excluded`)), React.createElement(StatsTrendBars, {
    items: feedTrend,
    tone: "#b45309",
    valueFormatter: statsFmtKg,
    emptyLabel: "Use kg, g, or lb logs to draw the feed trend."
  })), React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#92400e",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 10
    }
  }, "Top Feed Pens"), React.createElement(StatsSimpleRows, {
    rows: topFeedPens,
    emptyLabel: "No convertible feed logs in the last 7 days.",
    tone: "#a16207"
  }))), React.createElement(StatsSection, {
    icon: "🥚",
    title: "Hatchery",
    subtitle: "Egg batch performance, pending eggs, and the next hatch work that is coming up.",
    accent: "#1d4ed8",
    background: "#eff6ff",
    borderColor: "#93c5fd"
  }, React.createElement(StatsKpiGrid, {
    items: [{
      label: "Eggs Set",
      value: fmtNum(hatcheryTotalEggs),
      note: `${statsPlural(batches.length, "batch")} recorded`,
      color: "#1d4ed8",
      background: "#ffffffde",
      borderColor: "#bfdbfe"
    }, {
      label: "Hatch Rate",
      value: hatcheryTotalEggs ? fmtPct(hatcheryHatched, hatcheryTotalEggs) : "—",
      note: `${fmtNum(hatcheryHatched)} hatched • ${fmtNum(hatcheryFailed)} failed`,
      color: "#0f766e",
      background: "#ffffffde",
      borderColor: "#bfdbfe"
    }, {
      label: "Pending Eggs",
      value: fmtNum(hatcheryPending),
      note: hatcheryPending ? "Still waiting on hatch or fail outcomes" : "No pending eggs right now",
      color: "#92400e",
      background: "#ffffffde",
      borderColor: "#bfdbfe"
    }, {
      label: "Hatch Alerts",
      value: fmtNum(urgentAutoHatchCount),
      note: nextHatchReminder ? `${nextHatchReminder.batchCode || "Batch"} due ${fmtDate(nextHatchReminder.expectedHatchDate || nextHatchReminder.dueAt)}` : "No auto hatch reminders pending",
      color: "#7c3aed",
      background: "#ffffffde",
      borderColor: "#bfdbfe"
    }]
  }), React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#1e40af",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 10
    }
  }, "Batch Performance"), React.createElement(StatsSimpleRows, {
    rows: batchPerformanceRows.map(batch => ({
      id: batch.id,
      label: batch.label,
      note: `${fmtNum(batch.hatched)} hatched • ${fmtNum(batch.failed)} failed • ${fmtNum(batch.pending)} pending`,
      value: batch.eggCount ? fmtPct(batch.hatched, batch.eggCount) : "—",
      tone: batch.pending > 0 ? "#92400e" : "#1d4ed8"
    })),
    emptyLabel: "No batches recorded yet.",
    tone: "#1d4ed8"
  }), batchPerformanceRows.map(batch => React.createElement("div", {
    key: `${batch.id}-bar`,
    style: {
      marginTop: 8
    }
  }, React.createElement(StatsCompositionBar, {
    height: 8,
    segments: [{
      id: `${batch.id}-hatched`,
      label: "Hatched",
      value: batch.hatched,
      color: "#16a34a"
    }, {
      id: `${batch.id}-failed`,
      label: "Failed",
      value: batch.failed,
      color: "#dc2626"
    }, {
      id: `${batch.id}-pending`,
      label: "Pending",
      value: batch.pending,
      color: "#f59e0b"
    }]
  }))))), eggMeasurements.length > 0 && React.createElement(StatsSection, {
    icon: "🥚",
    title: "Egg Output",
    subtitle: "Egg count measurements logged from birds, useful for layer tracking on the phone.",
    accent: "#0f766e",
    background: "#ecfeff",
    borderColor: "#67e8f9"
  }, React.createElement(StatsKpiGrid, {
    items: [{
      label: "Eggs Last 7 Days",
      value: fmtNum(eggTotal7),
      note: `${fmtNum(eggTotal7 / recent7Days.length)} average per day`,
      color: "#0f766e",
      background: "#ffffffde",
      borderColor: "#a5f3fc"
    }, {
      label: "Eggs Last 30 Days",
      value: fmtNum(eggTotal30),
      note: `${statsPlural(eggMeasurements.length, "egg log")} total recorded`,
      color: "#0f766e",
      background: "#ffffffde",
      borderColor: "#a5f3fc"
    }, {
      label: "Top Layer",
      value: topEggBird ? birdById.get(topEggBird[0])?.tagId || "Bird" : "—",
      note: topEggBird ? `${fmtNum(topEggBird[1])} eggs in the last 30 days` : "No bird-level egg leader yet",
      color: "#0f766e",
      background: "#ffffffde",
      borderColor: "#a5f3fc"
    }, {
      label: "Days Logged",
      value: fmtNum(eggTrend.filter(item => item.value > 0).length),
      note: "Based on egg count measurements only",
      color: "#0f766e",
      background: "#ffffffde",
      borderColor: "#a5f3fc"
    }]
  }), React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#0f766e",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 10
    }
  }, "Daily Egg Trend"), React.createElement(StatsTrendBars, {
    items: eggTrend,
    tone: "#0f766e",
    valueFormatter: value => `${fmtNum(value)} eggs`,
    emptyLabel: "Log egg counts to unlock the 7-day egg trend."
  }))), React.createElement(StatsSection, {
    icon: "💊",
    title: "Health and Losses",
    subtitle: "Recent health activity, lifetime mortality, culls, and the most common loss reasons.",
    accent: "#b91c1c",
    background: "#fff1f2",
    borderColor: "#fda4af"
  }, React.createElement(StatsKpiGrid, {
    items: [{
      label: "Health Events 30d",
      value: fmtNum(health30.length),
      note: topHealthType ? `${humanize(topHealthType[0])} is the top issue` : "No health events logged in the last 30 days",
      color: "#b91c1c",
      background: "#ffffffde",
      borderColor: "#fecdd3"
    }, {
      label: "Losses 30d",
      value: fmtNum(losses30.length),
      note: losses30.length ? `${statsPlural(losses30.filter(bird => bird.status === "deceased").length, "death")} and ${statsPlural(losses30.filter(bird => bird.status === "culled").length, "cull")}` : "No deaths or culls logged in the last 30 days",
      color: "#b91c1c",
      background: "#ffffffde",
      borderColor: "#fecdd3"
    }, {
      label: "Mortality",
      value: birds.length ? fmtPct(mortalityAll, birds.length) : "—",
      note: `${fmtNum(mortalityAll)} deceased out of all recorded birds`,
      color: "#991b1b",
      background: "#ffffffde",
      borderColor: "#fecdd3"
    }, {
      label: "Cull Rate",
      value: birds.length ? fmtPct(cullAll, birds.length) : "—",
      note: `${fmtNum(cullAll)} culled out of all recorded birds`,
      color: "#9f1239",
      background: "#ffffffde",
      borderColor: "#fecdd3"
    }]
  }), React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#9f1239",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 10
    }
  }, "Top Loss Reasons"), React.createElement(StatsSimpleRows, {
    rows: topLossReasons,
    emptyLabel: "No loss reasons logged yet.",
    tone: "#b91c1c"
  }))), React.createElement(StatsSection, {
    icon: "💰",
    title: "Sales",
    subtitle: "Birds sold, total sale value entered, and the most recent completed sales.",
    accent: "#047857",
    background: "#ecfdf5",
    borderColor: "#86efac"
  }, React.createElement(StatsKpiGrid, {
    items: [{
      label: "Sold Birds",
      value: fmtNum(soldBirds.length),
      note: `${statsPlural(sold30.length, "bird")} sold in the last 30 days`,
      color: "#047857",
      background: "#ffffffde",
      borderColor: "#bbf7d0"
    }, {
      label: "Sale Value",
      value: pricedSoldBirds.length ? fmtNum(totalSaleValue) : "—",
      note: pricedSoldBirds.length ? `${fmtNum(pricedSoldBirds.length)} sale prices entered` : "No sale prices entered yet",
      color: "#047857",
      background: "#ffffffde",
      borderColor: "#bbf7d0"
    }, {
      label: "Avg Sale",
      value: pricedSoldBirds.length ? fmtNum(avgSaleValue) : "—",
      note: "Uses only birds with a recorded sale price",
      color: "#065f46",
      background: "#ffffffde",
      borderColor: "#bbf7d0"
    }, {
      label: "Recent Sales",
      value: fmtNum(recentSales.length),
      note: recentSales[0] ? `${recentSales[0].label} on ${recentSales[0].note || "recorded sale"}` : "No recent sale entries yet",
      color: "#065f46",
      background: "#ffffffde",
      borderColor: "#bbf7d0"
    }]
  }), React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#047857",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 10
    }
  }, "Recent Sale Entries"), React.createElement(StatsSimpleRows, {
    rows: recentSales,
    emptyLabel: "No sold birds logged yet.",
    tone: "#047857"
  })))));
}
