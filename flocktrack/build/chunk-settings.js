// Generated bundle: build/chunk-settings.js. Edit source files, then run npm run build.

/* FILE: src/screens/reminders.js */
const RKINDS = ["weighing", "vaccination", "deworming", "checkup", "egg_collection", "other"];
function Reminders({
  birds,
  batches,
  reminders,
  rules,
  onAddRule,
  onComplete,
  onDeleteRule,
  onOpenBatch,
  embedded = false
}) {
  const [showForm, setShowForm] = useState(false);
  const [rf, setRf] = useState({
    birdId: "",
    kind: "weighing",
    cadenceDays: "7"
  });
  const now = new Date();
  const batchById = new Map((batches || []).map(batch => [batch.id, batch]));
  const overdue = reminders.filter(r => r.status === "pending" && new Date(r.dueAt) < now);
  const upcoming = reminders.filter(r => r.status === "pending" && new Date(r.dueAt) >= now).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const done = reminders.filter(r => r.status === "done").sort((a, b) => new Date(b.dueAt) - new Date(a.dueAt)).slice(0, 8);
  function saveRule() {
    if (!rf.birdId) return;
    const rule = {
      id: uid(),
      birdId: rf.birdId,
      kind: rf.kind,
      cadenceDays: +rf.cadenceDays,
      active: true
    };
    onAddRule(rule);
    onComplete({
      id: uid(),
      birdId: rf.birdId,
      kind: rf.kind,
      dueAt: new Date(Date.now() + +rf.cadenceDays * 86400000).toISOString(),
      status: "pending",
      ruleId: rule.id
    }, false);
    setRf({
      birdId: "",
      kind: "weighing",
      cadenceDays: "7"
    });
    setShowForm(false);
  }
  function RRow({
    r,
    canDone
  }) {
    const bird = birds.find(b => b.id === r.birdId);
    const batch = r.batchId ? batchById.get(r.batchId) : null;
    const od = r.status === "pending" && new Date(r.dueAt) < now;
    const isAutoHatch = r.source === "auto_hatch";
    const isAutoIncubation = r.source === "auto_incubation";
    const titleLabel = isAutoHatch || isAutoIncubation ? `${r.batchCode || batch?.code || "Batch"} — ${r.title || humanize(r.kind)}` : `${bird?.tagId || "?"} — ${r.kind}`;
    const detailLabel = isAutoHatch ? `${fmtNum(r.pendingEggCount)} pending eggs · expected hatch ${fmtDate(r.expectedHatchDate || r.dueAt)}` : isAutoIncubation ? `${r.dayRangeLabel || "Incubation"} · ${r.humidity || ""} · ${fmtNum(r.pendingEggCount)} pending eggs` : `${od ? "⚠️ Overdue · " : ""}${fmtDate(r.dueAt)}`;
    return React.createElement("div", {
      style: {
        ...C.card,
        borderColor: od ? "#dc262644" : r.status === "done" ? "#15803d22" : "#d9e3ef",
        marginBottom: 10,
        cursor: isAutoHatch || isAutoIncubation ? "pointer" : "default"
      }
    ,
      onClick: () => {
        if ((isAutoHatch || isAutoIncubation) && typeof onOpenBatch === "function") onOpenBatch(r.batchId);
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: od ? "#b91c1c" : r.status === "done" ? "#15803d" : "#0f172a"
      }
    }, titleLabel), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 13,
        marginTop: 2
      }
    }, detailLabel)), canDone && r.status === "pending" && !r.auto && React.createElement("button", {
      style: {
        ...C.sm,
        color: "#15803d",
        borderColor: "#15803d33"
      },
      onClick: () => onComplete(r, true)
    }, "\u2713 Done"), r.status === "done" && React.createElement("span", {
      style: C.badge("#15803d")
    }, "\u2713"), r.auto && React.createElement("span", {
      style: C.badge(isAutoIncubation ? "#0f766e" : "#b45309")
    }, "Auto")));
  }
  return React.createElement("div", embedded ? null : {
    style: C.body
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: embedded ? "4px 0 12px" : "20px 0 14px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: embedded ? 22 : 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "\uD83D\uDD14 Tasks"), React.createElement("button", {
    style: {
      ...C.btn,
      width: "auto",
      marginTop: 0,
      padding: "12px 20px"
    },
    onClick: () => setShowForm(true)
  }, "+ New")), overdue.length > 0 && React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#b91c1c",
      marginBottom: 8
    }
  }, "\u26A0\uFE0F Overdue (", overdue.length, ")"), overdue.map(r => React.createElement(RRow, {
    key: r.id,
    r: r,
    canDone: true
  }))), upcoming.length > 0 && React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 8
    }
  }, "\uD83D\uDCC5 Upcoming"), upcoming.map(r => React.createElement(RRow, {
    key: r.id,
    r: r,
    canDone: true
  }))), done.length > 0 && React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#475569",
      marginBottom: 8
    }
  }, "\u2705 Completed"), done.map(r => React.createElement(RRow, {
    key: r.id,
    r: r,
    canDone: false
  }))), !reminders.length && React.createElement(Empty, {
    icon: "\uD83D\uDD14",
    msg: "No reminders set"
  }), rules.length > 0 && React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: "#475569",
      marginBottom: 8
    }
  }, "Active Rules"), rules.map(rule => {
    const bird = birds.find(b => b.id === rule.birdId);
    return React.createElement("div", {
      key: rule.id,
      style: {
        ...C.card,
        marginBottom: 10
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 700,
        color: "#0f172a"
      }
    }, bird?.tagId || "?", " \u2014 ", rule.kind), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 13
      }
    }, "Every ", rule.cadenceDays, "d")), React.createElement("button", {
      style: C.del,
      onClick: () => onDeleteRule(rule.id)
    }, "\u2715")));
  })), showForm && React.createElement(Modal, {
    title: "New Reminder Rule",
    onClose: () => setShowForm(false)
  }, React.createElement(FL, {
    lbl: "Bird *"
  }, React.createElement("select", {
    style: C.sel,
    value: rf.birdId,
    onChange: e => setRf({
      ...rf,
      birdId: e.target.value
    })
  }, React.createElement("option", {
    value: ""
  }, "Select bird..."), birds.filter(b => b.status === "active").map(b => React.createElement("option", {
    key: b.id,
    value: b.id
  }, b.tagId, b.breed ? ` — ${b.breed}` : "")))), React.createElement(FL, {
    lbl: "Task"
  }, React.createElement("select", {
    style: C.sel,
    value: rf.kind,
    onChange: e => setRf({
      ...rf,
      kind: e.target.value
    })
  }, RKINDS.map(k => React.createElement("option", {
    key: k,
    value: k
  }, k)))), React.createElement(FL, {
    lbl: "Every (days)"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    value: rf.cadenceDays,
    onChange: e => setRf({
      ...rf,
      cadenceDays: e.target.value
    }),
    min: "1"
  })), React.createElement("button", {
    style: C.btn,
    onClick: saveRule
  }, "Save Rule")));
}

/* FILE: src/screens/export.js */
function ExportTab({
  birds,
  batches,
  pens,
  feedTypes,
  penFeedLogs,
  financeEntries,
  measurements,
  healthEvents,
  reminders,
  eggStates,
  photos,
  embedded = false
}) {
  const buildFinanceLedgerRows = globalThis.FlockTrackLogic?.buildFinanceLedger;
  const financeLabel = globalThis.FlockTrackLogic?.financeCategoryLabel;
  financeEntries = Array.isArray(financeEntries) ? financeEntries : [];
  const birdTagById = useMemo(() => {
    const m = new Map();
    birds.forEach(b => m.set(b.id, b.tagId || ""));
    return m;
  }, [birds]);
  const batchById = useMemo(() => {
    const m = new Map();
    batches.forEach(batch => m.set(batch.id, batch));
    return m;
  }, [batches]);
  const feedTypeById = useMemo(() => {
    const m = new Map();
    feedTypes.forEach(feedType => m.set(feedType.id, feedType));
    return m;
  }, [feedTypes]);
  const latestWeightByBird = useMemo(() => {
    const m = new Map();
    measurements.forEach(entry => {
      if (entry.metricType !== "weight") return;
      const existing = m.get(entry.birdId);
      if (!existing || dateMs(entry.measuredAt) > dateMs(existing.measuredAt)) m.set(entry.birdId, entry);
    });
    return m;
  }, [measurements]);
  const countRows = useCallback((section, values, total) => {
    const map = new Map();
    values.forEach(value => {
      const key = (value || "Unknown").trim ? (value || "Unknown").trim() || "Unknown" : String(value || "Unknown");
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => ({
      section,
      label,
      count,
      share: total > 0 ? `${Math.round(count / total * 100)}%` : "—"
    }));
  }, []);
  const financeLedgerRows = useMemo(() => typeof buildFinanceLedgerRows === "function" ? buildFinanceLedgerRows({
    birds,
    financeEntries
  }).map(row => ({
    id: row.id,
    source: row.source,
    sourceId: row.sourceId,
    date: row.date,
    type: row.type,
    category: row.category,
    categoryLabel: financeLabel ? financeLabel(row.category) : humanize(row.category || ""),
    feedTypeId: row.feedTypeId || "",
    feedTypeName: row.feedTypeId ? feedTypeById.get(row.feedTypeId)?.name || "" : "",
    quantity: row.quantity != null ? row.quantity : "",
    unit: row.unit || "",
    sackKg: row.sackKg != null ? row.sackKg : "",
    unitPrice: row.unitPrice != null ? row.unitPrice : "",
    pricePerKg: row.pricePerKg != null ? row.pricePerKg : "",
    amount: row.amount,
    description: row.description || "",
    notes: row.notes || "",
    locked: !!row.locked
  })) : [], [birds, buildFinanceLedgerRows, feedTypeById, financeEntries, financeLabel]);
  const rawExports = useMemo(() => [{
    l: "Birds",
    ic: "🐓",
    fn: "birds.csv",
    data: birds
  }, {
    l: "Egg Batches",
    ic: "🥚",
    fn: "batches.csv",
    data: batches
  }, {
    l: "Pens",
    ic: "🪺",
    fn: "pens.csv",
    data: pens
  }, {
    l: "Feed Types",
    ic: "🧺",
    fn: "feed-types.csv",
    data: feedTypes
  }, {
    l: "Pen Feed Logs",
    ic: "🪣",
    fn: "pen-feed-logs.csv",
    data: penFeedLogs
  }, {
    l: "Finance Entries",
    ic: "💸",
    fn: "finance-entries.csv",
    data: financeEntries
  }, {
    l: "Measurements",
    ic: "📏",
    fn: "measurements.csv",
    data: measurements.map(m => ({
      ...m,
      tagId: birdTagById.get(m.birdId) || ""
    }))
  }, {
    l: "Health Events",
    ic: "🩺",
    fn: "health.csv",
    data: healthEvents.map(h => ({
      ...h,
      tagId: birdTagById.get(h.birdId) || ""
    }))
  }, {
    l: "Egg States",
    ic: "🐣",
    fn: "egg-states.csv",
    data: eggStates.map(state => ({
      ...state,
      batchCode: batchById.get(state.batchId)?.code || "",
      tagId: state.birdId ? birdTagById.get(state.birdId) || "" : ""
    }))
  }, {
    l: "Reminders",
    ic: "🔔",
    fn: "reminders.csv",
    data: reminders
  }, {
    l: "Bird Photos",
    ic: "📷",
    fn: "bird-photos.csv",
    data: photos.map(p => ({
      id: p.id,
      birdId: p.birdId,
      tagId: birdTagById.get(p.birdId) || "",
      takenAt: p.takenAt,
      sizeKb: p.sizeKb,
      hasImage: p.hasImage != null ? !!p.hasImage : !!p.dataUrl
    }))
  }], [batchById, batches, birdTagById, birds, eggStates, feedTypes, financeEntries, healthEvents, measurements, penFeedLogs, pens, photos, reminders]);
  const hatcherySummaryRows = useMemo(() => batches.map(batch => {
    const states = eggStates.filter(state => state.batchId === batch.id);
    const hatched = states.filter(state => state.status === "hatched").length;
    const failed = states.filter(state => state.status === "failed").length;
    const pending = Math.max(0, (batch.eggCount || 0) - hatched - failed);
    return {
      batchCode: batch.code,
      collectedDate: batch.collectedDate,
      eggCount: batch.eggCount || 0,
      hatched,
      failed,
      pending,
      hatchRate: fmtPct(hatched, batch.eggCount || 0),
      failRate: fmtPct(failed, batch.eggCount || 0),
      notes: batch.notes || ""
    };
  }).sort((a, b) => a.batchCode.localeCompare(b.batchCode, undefined, {
    numeric: true
  })), [batches, eggStates]);
  const flockSummaryRows = useMemo(() => {
    const total = birds.length;
    return [{
      section: "overview",
      label: "Total birds",
      count: total,
      share: "100%"
    }, {
      section: "overview",
      label: "Birds with weights",
      count: latestWeightByBird.size,
      share: total > 0 ? `${Math.round(latestWeightByBird.size / total * 100)}%` : "—"
    }, ...countRows("status", birds.map(b => humanize(b.status || "active")), total), ...countRows("stage", birds.map(b => stageLabel(b.stage)), total), ...countRows("sex", birds.map(b => humanize(b.sex || "unknown")), total), ...countRows("breed", birds.map(b => b.breed || "Unknown"), total)];
  }, [birds, countRows, latestWeightByBird.size]);
  const salesReportRows = useMemo(() => birds.filter(b => b.status === "sold").map(b => ({
    tagId: b.tagId || "",
    batch: birdBatchLabel(b, batchById),
    breed: b.breed || "",
    sex: b.sex || "",
    hatchDate: b.hatchDate || "",
    soldDate: b.soldDate || "",
    buyerName: b.buyerName || "",
    salePrice: b.salePrice != null ? b.salePrice : "",
    latestWeight: latestWeightByBird.get(b.id)?.value ?? "",
    latestWeightUnit: latestWeightByBird.get(b.id)?.unit || "",
    notes: b.notes || ""
  })).sort((a, b) => dateMs(b.soldDate) - dateMs(a.soldDate) || a.tagId.localeCompare(b.tagId, undefined, {
    numeric: true
  })), [batchById, birds, latestWeightByBird]);
  const mortalityReportRows = useMemo(() => birds.filter(b => b.status === "deceased" || b.status === "culled").map(b => ({
    tagId: b.tagId || "",
    status: b.status || "",
    batch: birdBatchLabel(b, batchById),
    breed: b.breed || "",
    sex: b.sex || "",
    hatchDate: b.hatchDate || "",
    eventDate: b.status === "deceased" ? b.deceasedDate || "" : b.culledDate || "",
    reason: b.status === "deceased" ? b.causeOfDeath || "" : b.cullReason || "",
    notes: b.notes || ""
  })).sort((a, b) => dateMs(b.eventDate) - dateMs(a.eventDate) || a.tagId.localeCompare(b.tagId, undefined, {
    numeric: true
  })), [batchById, birds]);
  const reportExports = useMemo(() => [{
    l: "Flock Summary",
    ic: "📊",
    fn: "flock-summary.csv",
    data: flockSummaryRows
  }, {
    l: "Hatchery Summary",
    ic: "🥚",
    fn: "hatchery-summary.csv",
    data: hatcherySummaryRows
  }, {
    l: "Sales Report",
    ic: "💸",
    fn: "sales-report.csv",
    data: salesReportRows
  }, {
    l: "Mortality Report",
    ic: "⚰️",
    fn: "mortality-report.csv",
    data: mortalityReportRows
  }, {
    l: "Finance Ledger",
    ic: "💸",
    fn: "finance-ledger.csv",
    data: financeLedgerRows
  }], [financeLedgerRows, flockSummaryRows, hatcherySummaryRows, mortalityReportRows, salesReportRows]);
  function tableHtml(rows, columns) {
    if (!rows.length) return `<p>No records yet.</p>`;
    return `<table><thead><tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${escapeHtml(col.render ? col.render(row) : row[col.key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  function printFlockSummary() {
    const totals = {
      total: birds.length,
      active: birds.filter(b => b.status === "active").length,
      sold: birds.filter(b => b.status === "sold").length,
      deceased: birds.filter(b => b.status === "deceased").length,
      culled: birds.filter(b => b.status === "culled").length,
      weighted: latestWeightByBird.size
    };
    const sectionsHtml = `<div class="kpis"><div class="kpi"><span>Total Birds</span><strong>${escapeHtml(fmtNum(totals.total))}</strong></div><div class="kpi"><span>Active</span><strong>${escapeHtml(fmtNum(totals.active))}</strong></div><div class="kpi"><span>Sold</span><strong>${escapeHtml(fmtNum(totals.sold))}</strong></div><div class="kpi"><span>Deceased</span><strong>${escapeHtml(fmtNum(totals.deceased))}</strong></div><div class="kpi"><span>Culled</span><strong>${escapeHtml(fmtNum(totals.culled))}</strong></div><div class="kpi"><span>With Weight Records</span><strong>${escapeHtml(fmtNum(totals.weighted))}</strong></div></div><h2>Summary Rollups</h2>${tableHtml(flockSummaryRows, [{
      key: "section",
      label: "Section"
    }, {
      key: "label",
      label: "Label"
    }, {
      key: "count",
      label: "Count"
    }, {
      key: "share",
      label: "Share"
    }])}${salesReportRows.length ? `<h2>Recent Sales</h2>${tableHtml(salesReportRows.slice(0, 10), [{
      key: "tagId",
      label: "Tag"
    }, {
      key: "soldDate",
      label: "Sold"
    }, {
      key: "buyerName",
      label: "Buyer"
    }, {
      key: "salePrice",
      label: "Price",
      render: row => row.salePrice === "" ? "" : fmtNum(row.salePrice)
    }])}` : ""}${mortalityReportRows.length ? `<h2>Recent Mortality / Culls</h2>${tableHtml(mortalityReportRows.slice(0, 10), [{
      key: "tagId",
      label: "Tag"
    }, {
      key: "status",
      label: "Status"
    }, {
      key: "eventDate",
      label: "Date"
    }, {
      key: "reason",
      label: "Reason"
    }])}` : ""}`;
    openPrintableReport("Flock Summary", sectionsHtml);
  }
  function printHatcherySummary() {
    const totalEggs = hatcherySummaryRows.reduce((sum, row) => sum + (row.eggCount || 0), 0);
    const hatched = hatcherySummaryRows.reduce((sum, row) => sum + (row.hatched || 0), 0);
    const failed = hatcherySummaryRows.reduce((sum, row) => sum + (row.failed || 0), 0);
    const pending = hatcherySummaryRows.reduce((sum, row) => sum + (row.pending || 0), 0);
    const sectionsHtml = `<div class="kpis"><div class="kpi"><span>Total Eggs</span><strong>${escapeHtml(fmtNum(totalEggs))}</strong></div><div class="kpi"><span>Hatched</span><strong>${escapeHtml(fmtNum(hatched))}</strong></div><div class="kpi"><span>Failed</span><strong>${escapeHtml(fmtNum(failed))}</strong></div><div class="kpi"><span>Pending</span><strong>${escapeHtml(fmtNum(pending))}</strong></div><div class="kpi"><span>Hatch Rate</span><strong>${escapeHtml(fmtPct(hatched, totalEggs))}</strong></div><div class="kpi"><span>Fail Rate</span><strong>${escapeHtml(fmtPct(failed, totalEggs))}</strong></div></div><h2>Batch Performance</h2>${tableHtml(hatcherySummaryRows, [{
      key: "batchCode",
      label: "Batch"
    }, {
      key: "collectedDate",
      label: "Collected",
      render: row => fmtDate(row.collectedDate)
    }, {
      key: "eggCount",
      label: "Eggs"
    }, {
      key: "hatched",
      label: "Hatched"
    }, {
      key: "failed",
      label: "Failed"
    }, {
      key: "pending",
      label: "Pending"
    }, {
      key: "hatchRate",
      label: "Hatch Rate"
    }])}`;
    openPrintableReport("Hatchery Summary", sectionsHtml);
  }
  return React.createElement("div", embedded ? null : {
    style: C.body
  }, React.createElement("div", {
    style: {
      padding: embedded ? "4px 0 12px" : "20px 0 14px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: embedded ? 22 : 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "\uD83D\uDCE4 Reports"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14,
      marginTop: 2
    }
  }, "Download raw CSVs, summary CSVs, or printable offline reports")), React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 8
    }
  }, "Raw Data"), rawExports.map(c => {
    const n = c.data.length;
    return React.createElement("div", {
      key: c.l,
      style: {
        ...C.card,
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: 12
      }
    }, React.createElement("span", {
      style: {
        fontSize: 26
      }
    }, c.ic), React.createElement("div", {
      style: {
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: "#0f172a"
      }
    }, c.l), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 13
      }
    }, n, " records")), React.createElement("button", {
      style: {
        ...C.sm,
        color: n > 0 ? "#b45309" : "#475569",
        borderColor: n > 0 ? "#b4530944" : "#c4d0df"
      },
      disabled: !n,
      onClick: () => csvDown(c.data, c.fn)
    }, "\u2193 CSV"));
  }), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 4,
      marginBottom: 18
    }
  }, React.createElement("button", {
    style: C.btn,
    onClick: () => rawExports.forEach(c => {
      if (c.data.length) csvDown(c.data, c.fn);
    })
  }, "\u2193 Export All Raw")), React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 8
    }
  }, "Reports"), reportExports.map(report => {
    const n = report.data.length;
    const canPrint = report.l === "Flock Summary" || report.l === "Hatchery Summary";
    return React.createElement("div", {
      key: report.l,
      style: {
        ...C.card,
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: 12
      }
    }, React.createElement("span", {
      style: {
        fontSize: 26
      }
    }, report.ic), React.createElement("div", {
      style: {
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: "#0f172a"
      }
    }, report.l), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 13
      }
    }, n, " rows")), React.createElement("div", {
      style: {
        display: "flex",
        gap: 8
      }
    }, React.createElement("button", {
      style: {
        ...C.sm,
        color: n > 0 ? "#b45309" : "#475569",
        borderColor: n > 0 ? "#b4530944" : "#c4d0df"
      },
      disabled: !n,
      onClick: () => csvDown(report.data, report.fn)
    }, "\u2193 CSV"), canPrint && React.createElement("button", {
      style: {
        ...C.sm,
        color: "#1d4ed8",
        borderColor: "#1d4ed844"
      },
      onClick: () => report.l === "Flock Summary" ? printFlockSummary() : printHatcherySummary()
    }, "\u2399 Print")));
  }), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 4
    }
  }, React.createElement("button", {
    style: C.btn,
    onClick: () => reportExports.forEach(report => {
      if (report.data.length) csvDown(report.data, report.fn);
    })
  }, "\u2193 Export All Reports")));
}

/* FILE: src/screens/settings.js */
const SETTINGS_SECTION_SLIDES = [{
  id: "general",
  label: "General",
  color: "#1d4ed8"
}, {
  id: "tasks",
  label: "Tasks",
  color: "#b45309"
}, {
  id: "reports",
  label: "Reports",
  color: "#0f766e"
}];
const PASTE_IMPORT_STORE_LABELS = {
  eggBatches: "Egg Batches",
  birds: "Birds",
  measurements: "Measurements",
  healthEvents: "Health Events",
  reminderRules: "Reminder Rules",
  reminderInstances: "Reminder Instances",
  eggStates: "Egg States",
  birdPhotos: "Bird Photos",
  eggProgressPhotos: "Egg Progress Photos",
  pens: "Pens",
  feedTypes: "Feed Types",
  penFeedLogs: "Pen Feed Logs",
  financeEntries: "Finance Entries"
};
const PASTE_IMPORT_LLM_PROMPT = `Convert the raw poultry data below into valid FlockTrack backup JSON.

Rules:
- Return JSON only. No markdown. No extra text.
- Use this exact top-level shape: { "format": "flocktrack-backup-v1", "stores": { ... } }.
- Include all store keys shown in the template below.
- Use arrays for every store key (use [] when no rows apply).
- Keep dates in ISO format when possible (YYYY-MM-DD or full ISO datetime).
- Preserve data as-is when uncertain. Do not invent facts.
- Create stable string IDs for each new row and keep references consistent across stores (birdId, batchId, penId, feedTypeId, originBatchId).
- For bird rows, include "nickname" when available in the raw data.

Allowed stores template:
{
  "format": "flocktrack-backup-v1",
  "stores": {
    "eggBatches": [],
    "birds": [],
    "measurements": [],
    "healthEvents": [],
    "reminderRules": [],
    "reminderInstances": [],
    "eggStates": [],
    "birdPhotos": [],
    "eggProgressPhotos": [],
    "pens": [],
    "feedTypes": [],
    "penFeedLogs": [],
    "financeEntries": []
  }
}

RAW DATA TO CONVERT:
<<<PASTE RAW DATA HERE>>>`;

function SettingsTab({
  section = "general",
  generalTab = "archivable",
  onSectionChange,
  onGeneralTabChange,
  birds,
  batches,
  pens,
  feedTypes,
  penFeedLogs,
  financeEntries,
  measurements,
  healthEvents,
  reminders,
  eggStates,
  photos,
  rules,
  onArchiveBird,
  onAddRule,
  onComplete,
  onDeleteRule,
  onOpenBatch,
  storageInfo,
  retentionInfo,
  onLoadStorage,
  onExportRetention,
  onCleanupRetention,
  onBackupJson,
  onRestoreBackup,
  onPreviewPasteImport,
  onImportPastedJson,
  onResetAppData,
  gistSyncConfig,
  onSaveGistSyncConfig,
  onPushToGist,
  onPullFromGist,
  hideableTabs = [],
  tabVisibility = {},
  onUpdateTabVisibility
}) {
  const [sectionView, setSectionView] = useState(section || "general");
  const [generalView, setGeneralView] = useState(generalTab || "archivable");
  const [busyId, setBusyId] = useState("");
  const [expBusy, setExpBusy] = useState(false);
  const [cleanBusy, setCleanBusy] = useState(false);
  const [zipOn, setZipOn] = useState(true);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [gistSaveBusy, setGistSaveBusy] = useState(false);
  const [gistPushBusy, setGistPushBusy] = useState(false);
  const [gistPullBusy, setGistPullBusy] = useState(false);
  const [pastePreviewBusy, setPastePreviewBusy] = useState(false);
  const [pasteImportBusy, setPasteImportBusy] = useState(false);
  const [gistSyncEnabled, setGistSyncEnabled] = useState(gistSyncConfig?.syncEnabled !== false);
  const [gistToken, setGistToken] = useState(gistSyncConfig?.token || "");
  const [gistId, setGistId] = useState(gistSyncConfig?.gistId || "");
  const [gistFileName, setGistFileName] = useState(gistSyncConfig?.fileName || "flocktrack-sync.json");
  const [pasteJsonText, setPasteJsonText] = useState("");
  const [pastePreview, setPastePreview] = useState(null);
  const [pasteError, setPasteError] = useState("");
  const [promptCopyBusy, setPromptCopyBusy] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const restoreRef = useRef(null);
  const archivable = useMemo(() => birds.filter(b => !b.archivedAt && (b.status === "sold" || b.status === "deceased" || b.status === "culled")).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [birds]);
  const archived = useMemo(() => birds.filter(b => !!b.archivedAt).sort((a, b) => new Date(b.archivedAt || 0) - new Date(a.archivedAt || 0)), [birds]);
  const tabToggleRows = useMemo(() => (Array.isArray(hideableTabs) ? hideableTabs : []).filter(tabDef => tabDef && tabDef.id).map(tabDef => ({
    ...tabDef,
    visible: tabVisibility[tabDef.id] !== false
  })), [hideableTabs, tabVisibility]);
  const tabToggleGridColumns = useMemo(() => `repeat(${Math.max(1, tabToggleRows.length)}, minmax(0, 1fr))`, [tabToggleRows.length]);
  useEffect(() => {
    if (!section || sectionView === section) return;
    setSectionView(section);
  }, [section, sectionView]);
  useEffect(() => {
    if (!generalTab || generalView === generalTab) return;
    setGeneralView(generalTab);
  }, [generalTab, generalView]);
  function handleSectionChange(nextSection) {
    setSectionView(nextSection);
    if (typeof onSectionChange === "function") onSectionChange(nextSection);
  }
  function handleGeneralTabChange(nextGeneralTab) {
    setGeneralView(nextGeneralTab);
    if (typeof onGeneralTabChange === "function") onGeneralTabChange(nextGeneralTab);
  }
  useEffect(() => {
    if (sectionView !== "general" || generalView !== "storage" || !onLoadStorage) return;
    onLoadStorage().catch(console.error);
  }, [generalView, onLoadStorage, sectionView]);
  useEffect(() => {
    setGistToken(gistSyncConfig?.token || "");
    setGistId(gistSyncConfig?.gistId || "");
    setGistFileName(gistSyncConfig?.fileName || "flocktrack-sync.json");
  }, [gistSyncConfig?.fileName, gistSyncConfig?.gistId, gistSyncConfig?.token]);
  useEffect(() => {
    setGistSyncEnabled(gistSyncConfig?.syncEnabled !== false);
  }, [gistSyncConfig?.syncEnabled]);
  async function doArchive(bird) {
    if (!bird || bird.archivedAt) return;
    if (!window.confirm(`Archive ${bird.tagId || "this bird"}?`)) return;
    setBusyId(bird.id);
    try {
      await onArchiveBird(bird.id);
    } catch (err) {
      console.error(err);
      window.alert("Could not archive this chicken. Please try again.");
    } finally {
      setBusyId("");
    }
  }
  async function doExport() {
    if (!onExportRetention) return 0;
    setExpBusy(true);
    try {
      const n = await onExportRetention(zipOn);
      if (!n) window.alert("No photos are currently due for retention cleanup.");else window.alert(`Exported ${n} retention record${n === 1 ? "" : "s"}${zipOn ? " with ZIP." : "."}`);
      return n;
    } catch (err) {
      console.error(err);
      window.alert("Could not export retention set. Please try again.");
      return 0;
    } finally {
      setExpBusy(false);
    }
  }
  async function doCleanup() {
    if (!onCleanupRetention) return;
    try {
      const due = retentionInfo?.eligibleCount || 0;
      if (due > 0) {
        const exportFirst = window.confirm("Export due photos before cleanup?\nOK = export first, Cancel = skip export.");
        if (exportFirst) await doExport();
      }
      if (!window.confirm("Clean up now? This removes image data only and keeps metadata/history.")) return;
      setCleanBusy(true);
      const n = await onCleanupRetention();
      if (!n) window.alert("No photos are currently due for retention cleanup.");else window.alert(`Cleaned up ${n} photo record${n === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      window.alert("Cleanup failed. Please try again.");
    } finally {
      setCleanBusy(false);
    }
  }
  async function doBackup() {
    if (!onBackupJson) return;
    setBackupBusy(true);
    try {
      const info = await onBackupJson();
      if (info && typeof info.total === "number") window.alert(`Backup created with ${info.total} record${info.total === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      window.alert("Could not create backup JSON. Please try again.");
    } finally {
      setBackupBusy(false);
    }
  }
  async function handleRestoreFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = "";
    if (!onRestoreBackup) return;
    if (!window.confirm("Restore from this backup JSON? This will replace current app data.")) return;
    setRestoreBusy(true);
    try {
      const info = await onRestoreBackup(file);
      if (info && typeof info.total === "number") window.alert(`Restore complete. Loaded ${info.total} record${info.total === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      window.alert("Could not restore backup JSON. Check file format and try again.");
    } finally {
      setRestoreBusy(false);
    }
  }
  async function doPreviewPaste() {
    if (!onPreviewPasteImport) return;
    const text = (pasteJsonText || "").trim();
    if (!text) {
      window.alert("Paste JSON first.");
      return;
    }
    setPastePreviewBusy(true);
    setPasteError("");
    try {
      const info = await onPreviewPasteImport(text);
      setPastePreview(info || null);
    } catch (err) {
      console.error(err);
      setPastePreview(null);
      setPasteError(err?.message || "Could not parse pasted JSON.");
      window.alert(err?.message || "Could not parse pasted JSON.");
    } finally {
      setPastePreviewBusy(false);
    }
  }
  async function copyLlmPrompt() {
    if (promptCopyBusy) return;
    setPromptCopyBusy(true);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(PASTE_IMPORT_LLM_PROMPT);
      } else {
        const area = document.createElement("textarea");
        area.value = PASTE_IMPORT_LLM_PROMPT;
        area.setAttribute("readonly", "readonly");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.focus();
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (!ok) throw new Error("Copy command was rejected.");
      }
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1800);
    } catch (err) {
      console.error(err);
      window.alert("Could not copy prompt. Please copy it manually.");
    } finally {
      setPromptCopyBusy(false);
    }
  }
  async function doImportPasted(mode) {
    if (!onImportPastedJson) return;
    const text = (pasteJsonText || "").trim();
    if (!text) {
      window.alert("Paste JSON first.");
      return;
    }
    const mergeMode = mode === "merge";
    const confirmText = mergeMode ? "Merge pasted JSON with existing app data?\nThis keeps existing records and adds/updates matching records safely." : "Replace app data using pasted JSON?\nThis will overwrite all current records.";
    if (!window.confirm(confirmText)) return;
    setPasteImportBusy(true);
    setPasteError("");
    try {
      const info = await onImportPastedJson(text, {
        mode: mergeMode ? "merge" : "replace"
      });
      const importedTotal = typeof info?.importedTotal === "number" ? info.importedTotal : info?.total || 0;
      if (mergeMode) {
        const addText = typeof info?.addedFromImport === "number" ? `\nAdded ${info.addedFromImport} imported record${info.addedFromImport === 1 ? "" : "s"} that were not in local data.` : "";
        const conflictText = info?.conflicts ? `\nResolved ${info.conflicts} conflict${info.conflicts === 1 ? "" : "s"} using merge rules.` : "";
        window.alert(`Merge import complete. Imported payload had ${importedTotal} record${importedTotal === 1 ? "" : "s"}. App now has ${info?.total || 0} record${info?.total === 1 ? "" : "s"}.${addText}${conflictText}`);
      } else {
        window.alert(`Import complete. Loaded ${info?.total || 0} record${info?.total === 1 ? "" : "s"}.`);
      }
      setPastePreview(null);
      setPasteJsonText("");
    } catch (err) {
      console.error(err);
      setPasteError(err?.message || "Could not import pasted JSON.");
      window.alert(err?.message || "Could not import pasted JSON.");
    } finally {
      setPasteImportBusy(false);
    }
  }
  async function doReset() {
    if (!onResetAppData) return;
    if (!window.confirm("Reset app data and start fresh? This removes all current records.")) return;
    setResetBusy(true);
    try {
      await onResetAppData();
      window.alert("App reset complete.");
    } catch (err) {
      console.error(err);
      window.alert("Could not reset app data. Please try again.");
    } finally {
      setResetBusy(false);
    }
  }
  async function doSaveGistConfig(showSavedMessage = true) {
    if (!onSaveGistSyncConfig) return null;
    setGistSaveBusy(true);
    try {
      const saved = await onSaveGistSyncConfig({
        syncEnabled: gistSyncEnabled,
        token: gistToken,
        gistId: gistId,
        fileName: gistFileName
      });
      if (saved?.gistId != null) setGistId(saved.gistId || "");
      if (saved?.fileName) setGistFileName(saved.fileName);
      if (showSavedMessage) window.alert("Gist sync settings saved on this device.");
      return saved || null;
    } catch (err) {
      console.error(err);
      window.alert("Could not save Gist sync settings. Please try again.");
      return null;
    } finally {
      setGistSaveBusy(false);
    }
  }
  async function toggleGistSyncEnabled() {
    if (!onSaveGistSyncConfig || gistSaveBusy || gistPushBusy || gistPullBusy) return;
    const nextEnabled = !gistSyncEnabled;
    setGistSaveBusy(true);
    try {
      const saved = await onSaveGistSyncConfig({
        syncEnabled: nextEnabled
      });
      setGistSyncEnabled(saved?.syncEnabled !== false);
    } catch (err) {
      console.error(err);
      window.alert("Could not update the Gist sync toggle. Please try again.");
    } finally {
      setGistSaveBusy(false);
    }
  }
  async function doPushGist() {
    if (!onPushToGist) return;
    if (!gistSyncEnabled) {
      window.alert("Gist sync is turned off on this device.");
      return;
    }
    setGistPushBusy(true);
    try {
      const info = await onPushToGist({
        syncEnabled: gistSyncEnabled,
        token: gistToken,
        gistId: gistId,
        fileName: gistFileName
      });
      if (info?.gistId) setGistId(info.gistId);
      const conflictText = info?.conflicts ? `\nResolved ${info.conflicts} same-record conflict${info.conflicts === 1 ? "" : "s"} using latest timestamp.` : "";
      const mergeText = info?.addedFromRemote ? `\nIncluded ${info.addedFromRemote} record${info.addedFromRemote === 1 ? "" : "s"} from remote before push.` : "";
      window.alert(`Push complete. Synced ${info?.total || 0} record${info?.total === 1 ? "" : "s"} to gist ${info?.gistId || gistId || ""}.${mergeText}${conflictText}`);
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Could not push to Gist. Check token/gist settings and try again.");
    } finally {
      setGistPushBusy(false);
    }
  }
  async function doPullGist() {
    if (!onPullFromGist) return;
    if (!gistSyncEnabled) {
      window.alert("Gist sync is turned off on this device.");
      return;
    }
    setGistPullBusy(true);
    try {
      const info = await onPullFromGist({
        syncEnabled: gistSyncEnabled,
        token: gistToken,
        gistId: gistId,
        fileName: gistFileName
      });
      if (info?.gistId) setGistId(info.gistId);
      if (info?.fileName) setGistFileName(info.fileName);
      const conflictText = info?.conflicts ? `\nResolved ${info.conflicts} same-record conflict${info.conflicts === 1 ? "" : "s"} using latest timestamp.` : "";
      const localKeepText = info?.addedFromLocal ? `\nKept ${info.addedFromLocal} local-only record${info.addedFromLocal === 1 ? "" : "s"} during merge.` : "";
      window.alert(`Pull complete. Loaded ${info?.total || 0} merged record${info?.total === 1 ? "" : "s"} from gist.${localKeepText}${conflictText}`);
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Could not pull from Gist. Check token/gist settings and try again.");
    } finally {
      setGistPullBusy(false);
    }
  }
  const usage = storageInfo?.usage || 0;
  const quota = storageInfo?.quota || 0;
  const usagePct = quota > 0 ? Math.min(100, Math.round(usage / quota * 100)) : null;
  const actionsBusy = expBusy || cleanBusy || backupBusy || restoreBusy || resetBusy || gistSaveBusy || gistPushBusy || gistPullBusy || pastePreviewBusy || pasteImportBusy;
  const pastePreviewRows = pastePreview?.storeCounts ? Object.entries(pastePreview.storeCounts).filter(([, count]) => Number(count) > 0).sort((a, b) => b[1] - a[1]) : [];
  const gistSyncStamp = gistSyncConfig?.lastSyncAt ? `${gistSyncConfig?.lastSyncDirection === "pull" ? "Last pull" : "Last push"}: ${fmtDateTime(gistSyncConfig.lastSyncAt)}` : "No Gist sync yet on this device.";
  const gistSyncStatusLine = gistSyncEnabled ? "Sync is ON for this device." : "Sync is OFF for this device. Push and Pull are blocked.";
  const archivableList = archivable.length ? archivable.map(b => {
    const bBatchTheme = birdBatchTheme(b);
    const bBatchLabel = birdBatchChipLabel(b);
    return React.createElement("div", {
      key: b.id,
      style: {
        ...C.card,
        background: bBatchTheme.soft,
        borderColor: bBatchTheme.border,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 17,
        fontWeight: 800,
        color: "#0f172a"
      }
  }, b.tagId || "Untitled"), React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, React.createElement("span", {
    style: C.badge(sc(b.status))
  }, b.status), React.createElement("span", {
    style: {
      ...C.badge(bBatchTheme.color),
      color: "#0f172a",
      background: bBatchTheme.bg,
      border: `1px solid ${bBatchTheme.border}`,
      marginLeft: 6
    }
  }, bBatchLabel), React.createElement("span", {
    style: {
      color: "#475569",
      fontSize: 13,
      marginLeft: 8
    }
  }, b.breed || "No breed"))), React.createElement("button", {
    style: {
      ...C.sm,
      color: "#1d4ed8",
      borderColor: "#1d4ed844",
      minWidth: 86
    },
    disabled: busyId === b.id,
    onClick: () => doArchive(b)
  }, busyId === b.id ? "..." : "Archive"));
  }) : React.createElement(Empty, {
    icon: "\uD83D\uDCC2",
    msg: "No sold, deceased, or culled chickens ready to archive"
  });
  const archivedList = archived.length ? archived.map(b => {
    const bBatchTheme = birdBatchTheme(b);
    const bBatchLabel = birdBatchChipLabel(b);
    return React.createElement("div", {
      key: b.id,
      style: {
        ...C.card,
        background: bBatchTheme.soft,
        borderColor: bBatchTheme.border,
        marginBottom: 10
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, b.tagId || "Untitled"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      marginTop: 3
    }
  }, "Archived ", fmtDate(b.archivedAt), " \xB7 ", b.breed || "No breed")), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, React.createElement("span", {
    style: C.badge(sc(b.status))
  }, b.status), React.createElement("span", {
    style: {
      ...C.badge(bBatchTheme.color),
      color: "#0f172a",
      background: bBatchTheme.bg,
      border: `1px solid ${bBatchTheme.border}`
    }
  }, bBatchLabel))));
  }) : React.createElement(Empty, {
    icon: "\uD83D\uDCC1",
    msg: "No archived chickens yet"
  });
  const storagePanel = React.createElement("div", null, React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 6
    }
  }, "\uD83D\uDCBE Device Storage"), storageInfo?.supported === false ? React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14
    }
  }, "Storage estimate is not supported by this browser.") : React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      fontSize: 26,
      fontWeight: 900,
      color: "#1d4ed8"
    }
  }, storageInfo?.loading ? "Loading..." : `${fmtBytes(usage)} / ${fmtBytes(quota)}`), usagePct != null && React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      marginTop: 2
    }
  }, usagePct, "% used"), storageInfo?.error && React.createElement("div", {
    style: {
      color: "#b91c1c",
      fontSize: 13,
      marginTop: 4
    }
  }, storageInfo.error))), React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 6
    }
  }, "\uD83D\uDCC2 Archived Photos"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14,
      lineHeight: 1.6,
      whiteSpace: "pre-line"
    }
  }, retentionInfo?.loading ? "Loading photo retention stats..." : `Photos by archived birds: ${retentionInfo?.archivedPhotos || 0}\nPhotos still carrying image data: ${retentionInfo?.archivedPhotosWithImage || 0}\nEstimated image bytes in archived birds: ${fmtBytes(retentionInfo?.archivedImageBytes || 0)}\nDue for cleanup now: ${retentionInfo?.eligibleCount || 0} (sold: ${retentionInfo?.eligibleSold || 0}, deceased: ${retentionInfo?.eligibleDeceased || 0}, culled: ${retentionInfo?.eligibleCulled || 0})`), retentionInfo?.error && React.createElement("div", {
    style: {
      color: "#b91c1c",
      fontSize: 13,
      marginTop: 4
    }
  }, retentionInfo.error)), React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 10
    }
  }, "\u2699\uFE0F Retention Actions"), React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      color: "#475569",
      fontSize: 14,
      marginBottom: 12
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: zipOn,
    onChange: e => setZipOn(e.target.checked),
    disabled: actionsBusy
  }), "Include photos ZIP in export"), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      color: "#1d4ed8",
      borderColor: "#1d4ed844",
      padding: "13px 12px"
    },
    onClick: doExport,
    disabled: actionsBusy
  }, expBusy ? "Exporting..." : "Export Due Set"), React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 0,
      padding: "13px 12px"
    },
    onClick: doCleanup,
    disabled: actionsBusy
  }, cleanBusy ? "Cleaning..." : "Clean Up Now")), React.createElement("button", {
    style: {
      ...C.sec,
      width: "100%",
      marginTop: 10
    },
    onClick: () => onLoadStorage && onLoadStorage().catch(console.error),
    disabled: actionsBusy
  }, "Refresh Storage Stats")), React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 10
    }
  }, "\uD83D\uDCBE Backup & Restore (JSON)"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      lineHeight: 1.5,
      marginBottom: 10
    }
  }, "This is a full app backup/restore (including photos), separate from CSV Export."), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      color: "#1d4ed8",
      borderColor: "#1d4ed844",
      padding: "13px 12px"
    },
    onClick: doBackup,
    disabled: actionsBusy
  }, backupBusy ? "Backing up..." : "Download Backup"), React.createElement("button", {
    style: {
      ...C.sec,
      padding: "13px 12px"
    },
    onClick: () => restoreRef.current && restoreRef.current.click(),
    disabled: actionsBusy
  }, restoreBusy ? "Restoring..." : "Load Backup")), React.createElement("input", {
    ref: restoreRef,
    type: "file",
    accept: ".json,application/json",
    style: {
      display: "none"
    },
    onChange: handleRestoreFile,
    disabled: actionsBusy
  }), React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "10px 10px 12px",
      borderRadius: 12,
      border: "1px solid #dbeafe",
      background: "#f8fbff"
    }
  }, React.createElement("div", {
    style: {
      color: "#1e3a8a",
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "Paste Import (LLM-ready)"), React.createElement("div", {
    style: {
      border: "1px solid #bfdbfe",
      background: "#eff6ff",
      borderRadius: 10,
      padding: "8px 8px 9px",
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 6
    }
  }, React.createElement("div", {
    style: {
      color: "#1e3a8a",
      fontSize: 12,
      fontWeight: 700
    }
  }, "Prompt For External LLM"), React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      padding: "6px 10px",
      fontSize: 12,
      width: "auto",
      minWidth: 120
    },
    onClick: copyLlmPrompt,
    disabled: actionsBusy || promptCopyBusy
  }, promptCopyBusy ? "Copying..." : promptCopied ? "Prompt Copied" : "Copy LLM Prompt")), React.createElement("textarea", {
    value: PASTE_IMPORT_LLM_PROMPT,
    readOnly: true,
    disabled: actionsBusy || promptCopyBusy,
    style: {
      ...C.inp,
      minHeight: 120,
      resize: "vertical",
      marginBottom: 0,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      lineHeight: 1.4,
      color: "#1e293b",
      background: "#f8fbff"
    }
  })), React.createElement("textarea", {
    value: pasteJsonText,
    onChange: e => {
      setPasteJsonText(e.target.value);
      if (pasteError) setPasteError("");
      if (pastePreview) setPastePreview(null);
    },
    placeholder: "Paste backup JSON or a markdown code block here.",
    disabled: actionsBusy,
    style: {
      ...C.inp,
      minHeight: 120,
      resize: "vertical",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      lineHeight: 1.45
    }
  }), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 8,
      marginTop: 8
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      padding: "11px 8px"
    },
    onClick: doPreviewPaste,
    disabled: actionsBusy || !(pasteJsonText || "").trim()
  }, pastePreviewBusy ? "Previewing..." : "Preview"), React.createElement("button", {
    style: {
      ...C.sec,
      color: "#0f766e",
      borderColor: "#0f766e44",
      padding: "11px 8px"
    },
    onClick: () => doImportPasted("merge"),
    disabled: actionsBusy || !(pasteJsonText || "").trim()
  }, pasteImportBusy ? "Importing..." : "Merge Safely"), React.createElement("button", {
    style: {
      ...C.del,
      marginTop: 0,
      padding: "11px 8px"
    },
    onClick: () => doImportPasted("replace"),
    disabled: actionsBusy || !(pasteJsonText || "").trim()
  }, pasteImportBusy ? "Importing..." : "Replace All")), pasteError && React.createElement("div", {
    style: {
      marginTop: 8,
      color: "#b91c1c",
      fontSize: 12,
      lineHeight: 1.4
    }
  }, pasteError), pastePreview && React.createElement("div", {
    style: {
      marginTop: 8,
      color: "#334155",
      fontSize: 12,
      lineHeight: 1.45
    }
  }, React.createElement("div", {
    style: {
      fontWeight: 700,
      color: "#0f172a"
    }
  }, "Parsed payload: ", fmtNum(pastePreview.total || 0), " record", pastePreview.total === 1 ? "" : "s"), pastePreviewRows.length ? pastePreviewRows.map(([storeName, count]) => React.createElement("div", {
    key: storeName
  }, "- ", PASTE_IMPORT_STORE_LABELS[storeName] || storeName, ": ", fmtNum(count))) : React.createElement("div", null, "No records were found in recognized stores.")), React.createElement("div", {
    style: {
      marginTop: 7,
      color: "#64748b",
      fontSize: 11,
      lineHeight: 1.4
    }
  }, "Tip: You can paste plain JSON or markdown code fences. Use Preview first.")), React.createElement("button", {
    style: {
      ...C.del,
      width: "100%",
      marginTop: 10
    },
    onClick: doReset,
    disabled: actionsBusy
  }, resetBusy ? "Resetting..." : "Reset App Data")), React.createElement("div", {
    style: C.card
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      marginBottom: 10
    }
  }, "\uD83C\uDF10 Sync via GitHub Gist"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      lineHeight: 1.5,
      marginBottom: 10
    }
  }, "Push and pull full app data using a private gist. Token and gist settings are saved only on this device."), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      borderRadius: 14,
      border: `1px solid ${gistSyncEnabled ? "#bbf7d0" : "#fecaca"}`,
      background: gistSyncEnabled ? "#f0fdf4" : "#fef2f2",
      marginBottom: 12
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: gistSyncEnabled ? "#166534" : "#991b1b"
    }
  }, gistSyncEnabled ? "Gist Sync Enabled" : "Gist Sync Disabled"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: gistSyncEnabled ? "#166534" : "#991b1b",
      lineHeight: 1.45
    }
  }, gistSyncEnabled ? "This device can push and pull data to your gist." : "Keep this off while testing with made-up data. Turn it back on when you want real sync.")), React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      borderColor: gistSyncEnabled ? "#86efac" : "#fca5a5",
      color: gistSyncEnabled ? "#166534" : "#991b1b",
      background: "#ffffff",
      minWidth: 96
    },
    onClick: toggleGistSyncEnabled,
    disabled: actionsBusy
  }, gistSaveBusy ? "Saving..." : gistSyncEnabled ? "Turn Off" : "Turn On")), React.createElement("label", {
    style: {
      display: "block",
      color: "#334155",
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "GitHub Token"), React.createElement("input", {
    type: "password",
    value: gistToken,
    onChange: e => setGistToken(e.target.value),
    placeholder: "ghp_...",
    disabled: actionsBusy,
    style: {
      ...C.inp,
      fontSize: 15,
      padding: "10px 12px",
      marginBottom: 10
    }
  }), React.createElement("label", {
    style: {
      display: "block",
      color: "#334155",
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Gist ID"), React.createElement("input", {
    value: gistId,
    onChange: e => setGistId(e.target.value),
    placeholder: "Leave blank to create on first push",
    disabled: actionsBusy,
    style: {
      ...C.inp,
      fontSize: 15,
      padding: "10px 12px",
      marginBottom: 10
    }
  }), React.createElement("label", {
    style: {
      display: "block",
      color: "#334155",
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "File Name"), React.createElement("input", {
    value: gistFileName,
    onChange: e => setGistFileName(e.target.value),
    placeholder: "flocktrack-sync.json",
    disabled: actionsBusy,
    style: {
      ...C.inp,
      fontSize: 15,
      padding: "10px 12px",
      marginBottom: 10
    }
  }), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      padding: "13px 10px"
    },
    onClick: () => doSaveGistConfig(true),
    disabled: actionsBusy
  }, gistSaveBusy ? "Saving..." : "Save"), React.createElement("button", {
    style: {
      ...C.sec,
      color: "#1d4ed8",
      borderColor: "#1d4ed844",
      padding: "13px 10px"
    },
    onClick: doPushGist,
    disabled: actionsBusy || !gistSyncEnabled
  }, gistPushBusy ? "Pushing..." : "Push"), React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 0,
      padding: "13px 10px"
    },
    onClick: doPullGist,
    disabled: actionsBusy || !gistSyncEnabled
  }, gistPullBusy ? "Pulling..." : "Pull")), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 12,
      marginTop: 10,
      lineHeight: 1.4,
      whiteSpace: "pre-line"
    }
  }, gistSyncStatusLine, `\n${gistSyncStamp}`, gistSyncConfig?.gistId ? `\nGist: ${gistSyncConfig.gistId}` : "")));
  const sectionDescription = sectionView === "general" ? "Organize archive, storage, backup, and sync settings." : sectionView === "tasks" ? "Manage reminder rules and complete pending tasks." : "Download raw data, summary CSVs, and printable reports.";
  return React.createElement("div", {
    style: C.body
  }, React.createElement("div", {
    style: {
      padding: "20px 0 14px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "\u2699\uFE0F Settings"), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14,
      marginTop: 2
    }
  }, sectionDescription)), !!tabToggleRows.length && React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 6
    }
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, "Quick Access Tabs"), React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: ".05em"
    }
  }, "Overview + Settings stay visible")), React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 13,
      lineHeight: 1.45,
      marginBottom: 10
    }
  }, "Tap an icon to show or hide it in the bottom navigation. Overview and Settings always stay visible."), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: tabToggleGridColumns,
      gap: 8,
      alignItems: "stretch"
    }
  }, tabToggleRows.map(tabDef => {
    const isVisible = tabDef.visible;
    const tabLabel = tabDef.lbl || tabDef.label || humanize(tabDef.id);
    return React.createElement("button", {
      key: `tab-toggle-${tabDef.id}`,
      type: "button",
      title: `${tabLabel} ${isVisible ? "shown" : "hidden"}`,
      "aria-label": `${isVisible ? "Hide" : "Show"} ${tabLabel} tab`,
      "aria-pressed": isVisible,
      onClick: () => typeof onUpdateTabVisibility === "function" && onUpdateTabVisibility(tabDef.id, !isVisible),
      style: {
        appearance: "none",
        WebkitAppearance: "none",
        width: "100%",
        minWidth: 0,
        minHeight: 56,
        padding: "10px 0",
        borderRadius: 14,
        border: isVisible ? "1px solid #16a34a" : "1px solid #cbd5e1",
        background: isVisible ? "#16a34a" : "#e2e8f0",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        boxShadow: isVisible ? "inset 0 1px 0 #ffffff33, 0 8px 16px #16a34a30" : "inset 0 1px 0 #ffffffb3",
        transition: "background-color .18s ease, border-color .18s ease, box-shadow .18s ease",
        cursor: "pointer"
      }
    }, tabDef.iconSrc ? React.createElement("img", {
      src: tabDef.iconSrc,
      alt: "",
      style: {
        width: "56%",
        maxWidth: 28,
        height: 24,
        objectFit: "cover",
        imageRendering: "pixelated",
        transform: `scale(${tabDef.iconScale || 1})`,
        filter: isVisible ? "none" : "grayscale(1) saturate(0.15)",
        opacity: isVisible ? 1 : 0.8
      }
    }) : React.createElement("span", {
      style: {
        fontSize: 22,
        lineHeight: 1,
        filter: isVisible ? "none" : "grayscale(1) saturate(0)",
        opacity: isVisible ? 1 : 0.72
      }
    }, tabDef.ic || "•"));
  }))), React.createElement("div", {
    style: {
      marginBottom: sectionView === "general" ? 10 : 14
    }
  }, React.createElement(AnimatedSlider, {
    options: SETTINGS_SECTION_SLIDES,
    value: sectionView,
    onChange: handleSectionChange
  })), sectionView === "general" && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, React.createElement(AnimatedSlider, {
    options: SETTINGS_SLIDES,
    value: generalView,
    onChange: handleGeneralTabChange
  })), generalView === "archivable" && React.createElement("div", null, archivableList), generalView === "archives" && React.createElement("div", null, archivedList), generalView === "storage" && storagePanel), sectionView === "tasks" && React.createElement(Reminders, {
    birds: birds || [],
    batches: batches || [],
    reminders: reminders || [],
    rules: rules || [],
    onAddRule: onAddRule,
    onComplete: onComplete,
    onDeleteRule: onDeleteRule,
    onOpenBatch: onOpenBatch,
    embedded: true
  }), sectionView === "reports" && React.createElement(ExportTab, {
    birds: birds || [],
    batches: batches || [],
    pens: pens || [],
    feedTypes: feedTypes || [],
    penFeedLogs: penFeedLogs || [],
    financeEntries: financeEntries || [],
    measurements: measurements || [],
    healthEvents: healthEvents || [],
    reminders: reminders || [],
    eggStates: eggStates || [],
    photos: photos || [],
    embedded: true
  }));
}
