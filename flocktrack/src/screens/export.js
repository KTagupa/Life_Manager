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
