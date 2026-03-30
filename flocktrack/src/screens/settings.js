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
