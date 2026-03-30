const WORKSPACE_CANDLING_ID = "candling_capture";

function WorkspacesTab({
  batches,
  eggStates,
  eggPhotoCache = {},
  ensureEggPhotos,
  onAddEggPhoto,
  onUpdateEggPhoto,
  launchRequest = null,
  onLaunchHandled,
  onOpenBatch
}) {
  eggPhotoCache = eggPhotoCache && typeof eggPhotoCache === "object" ? eggPhotoCache : {};
  batches = Array.isArray(batches) ? batches : [];
  eggStates = Array.isArray(eggStates) ? eggStates : [];
  const [activeWorkspace, setActiveWorkspace] = useState("");
  const [activeBatchId, setActiveBatchId] = useState("");
  const [activeEggIndex, setActiveEggIndex] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoStatus, setPhotoStatus] = useState({
    kind: "idle",
    msg: ""
  });
  const camRef = useRef(null);
  const statusTimer = useRef(null);
  const eggStateById = useMemo(() => new Map(eggStates.map(state => [state.id, state])), [eggStates]);
  const batchStatsById = useMemo(() => {
    const map = new Map();
    batches.forEach(batch => map.set(batch.id, {
      hatched: 0,
      failed: 0,
      pending: Math.max(0, Number(batch?.eggCount) || 0)
    }));
    eggStates.forEach(state => {
      const current = map.get(state.batchId);
      if (!current) return;
      if (state.status === "hatched") current.hatched += 1;
      if (state.status === "failed") current.failed += 1;
    });
    map.forEach((stats, batchId) => {
      const batch = batches.find(item => item.id === batchId);
      const eggCount = Math.max(0, Number(batch?.eggCount) || 0);
      stats.pending = Math.max(0, eggCount - stats.hatched - stats.failed);
      stats.eggCount = eggCount;
    });
    return map;
  }, [batches, eggStates]);
  const batchIncubationById = useMemo(() => {
    const map = new Map();
    batches.forEach(batch => {
      const profile = typeof buildBatchIncubationProfile === "function" ? buildBatchIncubationProfile(batch) : null;
      if (profile) map.set(batch.id, profile);
    });
    return map;
  }, [batches]);
  const activeBatch = useMemo(() => activeBatchId ? batches.find(batch => batch.id === activeBatchId) || null : null, [activeBatchId, batches]);
  const activeIncubation = activeBatch?.id ? batchIncubationById.get(activeBatch.id) || null : null;
  const activeEggCount = Math.max(0, Number(activeBatch?.eggCount) || 0);
  const focusedEggIndex = Math.max(0, Math.min(activeEggCount > 0 ? activeEggCount - 1 : 0, Number(activeEggIndex) || 0));
  const activeEggCode = activeBatch && activeEggCount ? eggCode(activeBatch.code, focusedEggIndex) : "";
  const activeEggState = activeEggCode ? eggStateById.get(activeEggCode) || null : null;
  const captureDayNumber = activeBatch?.id ? normalizeEggPhotoDay(activeIncubation?.dayNumber || 1, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS) : 1;
  const activeEggPhotos = useMemo(() => activeEggCode ? sortEggProgressPhotos(eggPhotoCache[activeEggCode] || []) : [], [activeEggCode, eggPhotoCache]);
  const todayPhoto = useMemo(() => activeEggCode ? findEggPhotoForDay(activeEggPhotos, captureDayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS) : null, [activeEggCode, activeEggPhotos, activeIncubation?.totalDays, captureDayNumber]);
  const activeEggLoaded = !!activeEggCode && Object.prototype.hasOwnProperty.call(eggPhotoCache, activeEggCode);
  const captureStats = useMemo(() => {
    if (!activeBatch || !activeEggCount) return {
      captured: 0,
      total: activeEggCount,
      unresolved: 0
    };
    let captured = 0;
    let unresolved = 0;
    for (let i = 0; i < activeEggCount; i += 1) {
      const code = eggCode(activeBatch.code, i);
      if (!Object.prototype.hasOwnProperty.call(eggPhotoCache, code)) {
        unresolved += 1;
        continue;
      }
      if (findEggPhotoForDay(eggPhotoCache[code] || [], captureDayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)) captured += 1;
    }
    return {
      captured,
      total: activeEggCount,
      unresolved
    };
  }, [activeBatch, activeEggCount, activeIncubation?.totalDays, captureDayNumber, eggPhotoCache]);
  const activeEggFinalized = activeEggState?.status === "hatched" || activeEggState?.status === "failed";
  const captureDisabled = photoBusy || !activeBatch?.id || !activeEggCode || activeIncubation?.isScheduled || activeEggFinalized || todayPhoto && typeof onUpdateEggPhoto !== "function";
  const captureLabel = todayPhoto ? "Replace Photo" : "Capture Photo";

  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
  }, []);

  useEffect(() => {
    if (!launchRequest?.id) return;
    if (launchRequest.kind === WORKSPACE_CANDLING_ID) {
      resetCaptureUi();
      setActiveWorkspace(WORKSPACE_CANDLING_ID);
      setActiveBatchId(launchRequest.batchId || "");
      setActiveEggIndex(0);
    }
    if (typeof onLaunchHandled === "function") onLaunchHandled();
  }, [launchRequest?.id, launchRequest?.batchId, launchRequest?.kind, onLaunchHandled]);

  useEffect(() => {
    if (!activeBatch?.id || typeof ensureEggPhotos !== "function") return;
    const missingEggIds = [];
    for (let i = 0; i < activeEggCount; i += 1) {
      const code = eggCode(activeBatch.code, i);
      if (!Object.prototype.hasOwnProperty.call(eggPhotoCache, code)) missingEggIds.push(code);
    }
    if (!missingEggIds.length) return;
    Promise.all(missingEggIds.map(code => ensureEggPhotos(code).catch(err => {
      console.error(err);
      return [];
    }))).catch(console.error);
  }, [activeBatch?.code, activeBatch?.id, activeEggCount, eggPhotoCache, ensureEggPhotos]);

  function flashCaptureStatus(kind, msg) {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setPhotoStatus({
      kind,
      msg
    });
    if (kind === "busy") return;
    statusTimer.current = setTimeout(() => setPhotoStatus({
      kind: "idle",
      msg: ""
    }), 2600);
  }

  function resetCaptureUi() {
    setPhotoBusy(false);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setPhotoStatus({
      kind: "idle",
      msg: ""
    });
  }

  function openWorkspace(workspaceId) {
    resetCaptureUi();
    setActiveWorkspace(workspaceId || "");
    setActiveBatchId("");
    setActiveEggIndex(0);
  }

  function selectBatch(batch) {
    if (!batch?.id) return;
    resetCaptureUi();
    setActiveWorkspace(WORKSPACE_CANDLING_ID);
    setActiveBatchId(batch.id);
    setActiveEggIndex(0);
  }

  function focusEgg(idx) {
    const maxIdx = Math.max(0, activeEggCount - 1);
    setActiveEggIndex(Math.max(0, Math.min(maxIdx, idx)));
  }

  function moveEgg(direction) {
    focusEgg(focusedEggIndex + direction);
  }

  async function getEggPhotosForEgg(eggId) {
    if (!eggId) return [];
    if (Object.prototype.hasOwnProperty.call(eggPhotoCache, eggId)) return sortEggProgressPhotos(eggPhotoCache[eggId] || []);
    if (typeof ensureEggPhotos === "function") return sortEggProgressPhotos(await ensureEggPhotos(eggId));
    return [];
  }

  async function saveCapturePhoto(file) {
    if (!file || !activeEggCode || !activeBatch?.id || typeof onAddEggPhoto !== "function") return null;
    if (!file.type.startsWith("image/")) {
      flashCaptureStatus("err", "Please select an image file.");
      return null;
    }
    const totalDays = activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS;
    const dayNumber = normalizeEggPhotoDay(captureDayNumber, totalDays);
    setPhotoBusy(true);
    flashCaptureStatus("busy", "Processing photo...");
    try {
      const existingPhotos = await getEggPhotosForEgg(activeEggCode);
      const existingPhoto = findEggPhotoForDay(existingPhotos, dayNumber, totalDays);
      const takenAt = new Date().toISOString();
      const dataUrl = await compressImg(file);
      const sizeKb = Math.round(dataUrl.length * .75 / 1024);
      const nextPhoto = existingPhoto ? {
        ...existingPhoto,
        batchId: activeBatch.id,
        idx: focusedEggIndex,
        dayNumber,
        takenAt,
        modifiedAt: takenAt,
        sizeKb,
        dataUrl
      } : {
        id: uid(),
        eggId: activeEggCode,
        batchId: activeBatch.id,
        idx: focusedEggIndex,
        dayNumber,
        takenAt,
        createdAt: takenAt,
        sizeKb,
        dataUrl
      };
      if (existingPhoto) {
        if (typeof onUpdateEggPhoto !== "function") throw new Error("Egg photo updates are unavailable.");
        await onUpdateEggPhoto(nextPhoto);
      } else {
        await onAddEggPhoto(nextPhoto);
      }
      flashCaptureStatus("ok", `${existingPhoto ? "Replaced" : "Saved"} photo for ${eggPhotoDayLabel(dayNumber, totalDays)}.`);
      return nextPhoto;
    } catch (err) {
      console.error(err);
      flashCaptureStatus("err", "Could not save egg photo. Please try again.");
      return null;
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleCaptureFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      e.target.value = "";
      return;
    }
    await saveCapturePhoto(file);
    e.target.value = "";
  }

  const headerEl = React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      padding: "20px 0 14px"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "\uD83E\uDDF0 Workspace"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: "#475569",
      lineHeight: 1.5
    }
  }, activeWorkspace === WORKSPACE_CANDLING_ID ? "Focused tools for getting repetitive jobs done faster." : "One place for focused task flows. Candling Capture is the first workspace.")), activeWorkspace ? React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0
    },
    onClick: () => openWorkspace("")
  }, "\u2190 All Workspaces") : null);

  const hubEl = React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      display: "grid",
      gap: 14
    }
  }, React.createElement("button", {
    onClick: () => openWorkspace(WORKSPACE_CANDLING_ID),
    style: {
      ...C.card,
      marginBottom: 0,
      textAlign: "left",
      cursor: "pointer",
      background: "linear-gradient(180deg,#fff7ed 0%,#ffffff 100%)",
      borderColor: "#fdba74"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "flex-start",
      flexWrap: "wrap"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 900,
      letterSpacing: ".06em",
      textTransform: "uppercase",
      color: "#9a3412"
    }
  }, "Capture Workspace"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 26,
      fontWeight: 900,
      color: "#7c2d12"
    }
  }, "Candling Capture"), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 14,
      color: "#7c2d12",
      lineHeight: 1.5
    }
  }, "Choose a batch, move egg by egg, and keep one candling photo per egg per day.")), React.createElement("div", {
    style: C.badge("#b45309")
  }, "Open"))), React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 0,
      background: "#f8fafc",
      borderStyle: "dashed",
      color: "#475569"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, "More workspaces can live here later"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 1.5
    }
  }, "Examples: hatch outcome, weighing, feed logging, quick health checks."))));

  const batchPickerEl = !batches.length ? React.createElement(Empty, {
    icon: "\uD83E\uDD5A",
    msg: "Add a batch before using Candling Capture."
  }) : React.createElement("div", {
    style: {
      display: "grid",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 0,
      background: "#fff7ed",
      borderColor: "#fed7aa"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#7c2d12"
    }
  }, "Choose a batch"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 14,
      color: "#9a3412",
      lineHeight: 1.5
    }
  }, "You will see every egg in that batch, the current day photo slot, and fast next/back navigation.")), batches.map(batch => {
    const stats = batchStatsById.get(batch.id) || {
      pending: Math.max(0, Number(batch?.eggCount) || 0)
    };
    const incubation = batchIncubationById.get(batch.id) || null;
    const batchNo = batchNoFromBatchCode(batch.code);
    const theme = batchTheme(batchNo);
    return React.createElement("button", {
      key: batch.id,
      onClick: () => selectBatch(batch),
      style: {
        ...C.card,
        marginBottom: 0,
        textAlign: "left",
        background: theme.soft,
        borderColor: theme.border,
        cursor: "pointer"
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start"
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 24,
        fontWeight: 900,
        color: theme.color
      }
    }, batch.code), React.createElement("div", {
      style: {
        marginTop: 4,
        fontSize: 14,
        color: "#475569"
      }
    }, `${fmtNum(batch.eggCount || 0)} eggs · ${fmtNum(stats.pending || 0)} pending`), React.createElement("div", {
      style: {
        marginTop: 6,
        fontSize: 13,
        color: "#7c2d12",
        fontWeight: 700
      }
    }, incubation?.isScheduled ? `Starts ${fmtDate(incubation.incubationStartDate)}` : incubation ? `${eggPhotoDayLabel(incubation.dayNumber, incubation.totalDays)} · ${incubation.currentStage?.humidity || "—"}` : "Incubation details unavailable")), React.createElement("div", {
      style: {
        ...C.badge("#b45309"),
        alignSelf: "center"
      }
    }, "Open")));
  }));

  const workspaceBodyEl = !activeBatch ? batchPickerEl : React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 12,
      background: "#fff7ed",
      borderColor: "#fed7aa"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "flex-start",
      flexWrap: "wrap"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: ".06em",
      textTransform: "uppercase",
      color: "#9a3412"
    }
  }, "Candling Capture"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 24,
      fontWeight: 900,
      color: "#7c2d12"
    }
  }, activeBatch.code), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: "#9a3412",
      lineHeight: 1.5
    }
  }, `${fmtNum(captureStats.captured)} of ${fmtNum(captureStats.total)} eggs captured for ${eggPhotoDayLabel(captureDayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)}.`), captureStats.unresolved > 0 && React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#7c2d12",
      fontWeight: 700
    }
  }, `Loading ${captureStats.unresolved} remaining photo slot${captureStats.unresolved === 1 ? "" : "s"}...`)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0
    },
    onClick: () => {
      resetCaptureUi();
      setActiveBatchId("");
      setActiveEggIndex(0);
    }
  }, "Change Batch"), typeof onOpenBatch === "function" && React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0
    },
    onClick: () => onOpenBatch(activeBatch.id)
  }, "Open Batch")))), React.createElement("div", {
    style: {
      ...C.card,
      marginBottom: 14,
      background: "#ffffff"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, "Eggs in this batch"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#64748b",
      fontWeight: 700
    }
  }, "Tap an egg to focus it")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      gap: 10,
      marginTop: 14
    }
  }, Array.from({
    length: activeEggCount
  }, (_, i) => {
    const code = eggCode(activeBatch.code, i);
    const state = eggStateById.get(code) || null;
    const photoLoaded = Object.prototype.hasOwnProperty.call(eggPhotoCache, code);
    const photoForToday = photoLoaded ? findEggPhotoForDay(eggPhotoCache[code] || [], captureDayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS) : null;
    const isSelected = i === focusedEggIndex;
    const isHatched = state?.status === "hatched";
    const isFailed = state?.status === "failed";
    return React.createElement("button", {
      key: code,
      onClick: () => focusEgg(i),
      style: {
        border: `2px solid ${isSelected ? "#b45309" : isHatched ? "#86efac" : isFailed ? "#fca5a5" : photoForToday ? "#93c5fd" : "#d9e3ef"}`,
        background: isSelected ? "#fff7ed" : isHatched ? "#f0fdf4" : isFailed ? "#fef2f2" : photoForToday ? "#eff6ff" : "#ffffff",
        borderRadius: 16,
        minHeight: 92,
        padding: "10px 6px 8px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6
      }
    }, React.createElement("div", {
      style: {
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    }, React.createElement("span", {
      style: {
        fontSize: 18
      }
    }, isHatched ? "\uD83D\uDC23" : isFailed ? "\uD83D\uDC80" : photoForToday ? "\uD83D\uDCF7" : "\uD83E\uDD5A"), React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 800,
        color: photoForToday ? "#1d4ed8" : "#64748b"
      }
    }, photoForToday ? "TODAY" : photoLoaded ? "EMPTY" : "...")), React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 900,
        color: "#0f172a",
        wordBreak: "break-all"
      }
    }, code.split("-").slice(1).join("-")), React.createElement("div", {
      style: {
        fontSize: 10,
        fontWeight: 800,
        color: isHatched ? "#15803d" : isFailed ? "#b91c1c" : photoForToday ? "#1d4ed8" : "#64748b"
      }
    }, isHatched ? "Hatched" : isFailed ? "Failed" : photoForToday ? "Captured" : "Open"));
  }))), React.createElement("div", {
    style: {
      borderRadius: 24,
      border: "1px solid #d9e3ef",
      background: "#ffffff",
      padding: 18,
      boxShadow: "0 20px 40px -32px #00000099"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "flex-start",
      flexWrap: "wrap"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: ".08em",
      textTransform: "uppercase",
      color: "#64748b"
    }
  }, "Selected Egg"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 28,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, activeEggCode), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: "#475569",
      fontWeight: 700
    }
  }, `${eggPhotoDayLabel(captureDayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)} · ${activeIncubation?.currentStage?.label || "Candling"}`)), React.createElement("div", {
    style: C.badge(activeEggState?.status === "hatched" ? "#15803d" : activeEggState?.status === "failed" ? "#b91c1c" : todayPhoto ? "#1d4ed8" : "#b45309")
  }, activeEggState?.status === "hatched" ? "Hatched" : activeEggState?.status === "failed" ? "Failed" : todayPhoto ? "Photo Ready" : "No Photo Yet")), !activeEggLoaded ? React.createElement("div", {
    style: {
      marginTop: 16,
      borderRadius: 18,
      border: "1px dashed #cbd5e1",
      background: "#f8fafc",
      minHeight: 260,
      display: "grid",
      placeItems: "center",
      textAlign: "center",
      padding: 18,
      color: "#475569",
      fontWeight: 700
    }
  }, "Loading photo slots...") : todayPhoto ? React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      position: "relative",
      borderRadius: 20,
      overflow: "hidden",
      background: "#0f172a",
      minHeight: 280,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, todayPhoto.dataUrl ? React.createElement("img", {
    src: todayPhoto.dataUrl,
    alt: `${activeEggCode} ${eggPhotoDayLabel(captureDayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)}`,
    style: {
      width: "100%",
      maxHeight: "52vh",
      objectFit: "contain",
      display: "block"
    }
  }) : React.createElement("div", {
    style: {
      color: "#cbd5e1",
      fontWeight: 800
    }
  }, "Image unavailable"), React.createElement("div", {
    style: {
      position: "absolute",
      top: 12,
      left: 12,
      borderRadius: 999,
      background: "#ffffffdd",
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, eggPhotoDayLabel(todayPhoto.dayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS))), React.createElement("div", {
    style: {
      marginTop: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      fontSize: 13,
      color: "#475569"
    }
  }, React.createElement("div", {
    style: {
      fontWeight: 700
    }
  }, "Current photo for today"), React.createElement("div", null, eggPhotoLongDate(todayPhoto.takenAt) || "Unknown upload time"))) : React.createElement("div", {
    style: {
      marginTop: 16,
      borderRadius: 20,
      border: "2px dashed #cbd5e1",
      background: "#f8fafc",
      minHeight: 280,
      display: "grid",
      placeItems: "center",
      textAlign: "center",
      padding: 18
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 38
    }
  }, "\uD83D\uDCF7"), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 18,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "No photo for today"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 14,
      color: "#475569",
      lineHeight: 1.5
    }
  }, "Capture a candling photo for ", eggPhotoDayLabel(captureDayNumber, activeIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS), "."))), React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, activeIncubation?.isScheduled ? React.createElement("div", {
    style: {
      borderRadius: 16,
      border: "1px solid #fed7aa",
      background: "#fff7ed",
      padding: 14,
      color: "#9a3412",
      fontWeight: 700,
      lineHeight: 1.5
    }
  }, "Incubation starts ", fmtDate(activeIncubation.incubationStartDate), ". Capture opens when the batch is already on incubation.") : activeEggState?.status === "hatched" ? React.createElement("div", {
    style: {
      borderRadius: 16,
      border: "1px solid #bbf7d0",
      background: "#f0fdf4",
      padding: 14,
      color: "#166534",
      fontWeight: 700
    }
  }, "This egg is already marked hatched. Use the batch record if you need to edit history.") : activeEggState?.status === "failed" ? React.createElement("div", {
    style: {
      borderRadius: 16,
      border: "1px solid #fecaca",
      background: "#fef2f2",
      padding: 14,
      color: "#991b1b",
      fontWeight: 700
    }
  }, "This egg is already marked failed. Use the batch record if you need to edit history.") : React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 0,
      background: todayPhoto ? "#1d4ed8" : "#b45309"
    },
    onClick: () => camRef.current && camRef.current.click(),
    disabled: captureDisabled
  }, photoBusy ? "Saving..." : captureLabel), React.createElement("input", {
    ref: camRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    style: {
      display: "none"
    },
    onChange: handleCaptureFile,
    disabled: captureDisabled
  }), photoStatus.kind !== "idle" && React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 13,
      textAlign: "center",
      color: photoStatus.kind === "ok" ? "#15803d" : photoStatus.kind === "err" ? "#b91c1c" : "#475569",
      fontWeight: photoStatus.kind === "busy" ? 700 : 600
    }
  }, photoStatus.msg))), React.createElement("div", {
    style: {
      position: "fixed",
      left: 16,
      right: 16,
      bottom: 20,
      zIndex: 3,
      pointerEvents: "none"
    }
  }, React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: "0 auto",
      display: "flex",
      justifyContent: "space-between",
      gap: 12
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      pointerEvents: "auto",
      background: "#ffffffee",
      backdropFilter: "blur(8px)",
      opacity: focusedEggIndex <= 0 ? 0.55 : 1
    },
    onClick: () => moveEgg(-1),
    disabled: focusedEggIndex <= 0
  }, "\u2190 Previous"), React.createElement("button", {
    style: {
      ...C.sec,
      pointerEvents: "auto",
      background: "#ffffffee",
      backdropFilter: "blur(8px)",
      opacity: focusedEggIndex >= activeEggCount - 1 ? 0.55 : 1
    },
    onClick: () => moveEgg(1),
    disabled: focusedEggIndex >= activeEggCount - 1
  }, "Next \u2192"))));

  return React.createElement("div", {
    style: {
      ...C.body,
      paddingBottom: activeWorkspace === WORKSPACE_CANDLING_ID && activeBatch ? 108 : 16
    }
  }, headerEl, activeWorkspace === WORKSPACE_CANDLING_ID ? workspaceBodyEl : hubEl);
}
