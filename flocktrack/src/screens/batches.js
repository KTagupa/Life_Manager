const EGG_PROGRESS_TOTAL_DAYS = typeof HATCH_INCUBATION_DAYS === "number" ? HATCH_INCUBATION_DAYS : 21;
const normalizeEggPhotoDay = (value, totalDays = EGG_PROGRESS_TOTAL_DAYS) => {
  const max = Math.max(1, Number(totalDays) || EGG_PROGRESS_TOTAL_DAYS);
  const day = Math.round(Number(value) || 1);
  return Math.max(1, Math.min(max, day || 1));
};
const sortEggProgressPhotos = photos => [...(Array.isArray(photos) ? photos : [])].sort((a, b) => normalizeEggPhotoDay(a?.dayNumber) - normalizeEggPhotoDay(b?.dayNumber) || new Date(a?.takenAt || 0) - new Date(b?.takenAt || 0));
const findEggPhotoForDay = (photos, dayNumber, totalDays = EGG_PROGRESS_TOTAL_DAYS) => {
  const targetDay = normalizeEggPhotoDay(dayNumber, totalDays);
  const matches = sortEggProgressPhotos(photos).filter(photo => normalizeEggPhotoDay(photo?.dayNumber, totalDays) === targetDay);
  return matches.length ? matches[matches.length - 1] : null;
};
const eggPhotoDayLabel = (value, totalDays = EGG_PROGRESS_TOTAL_DAYS) => `Day ${normalizeEggPhotoDay(value, totalDays)}`;
const eggPhotoShortDate = ts => {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
};
const eggPhotoLongDate = ts => {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};
const eggCardNoteMeta = state => {
  const breed = String(state?.breed || "").trim();
  const notes = String(state?.notes || "").trim();
  if (breed && notes) return {
    hasNote: true,
    label: "Breed and notes saved"
  };
  if (breed) return {
    hasNote: true,
    label: "Breed saved"
  };
  if (notes) return {
    hasNote: true,
    label: "Notes saved"
  };
  return {
    hasNote: false,
    label: ""
  };
};
function Batches({
  batches,
  eggStates,
  eggPhotoCache = {},
  onAdd,
  onUpdate,
  onHatch,
  onDelete,
  onSaveEgg,
  ensureEggPhotos,
  onAddEggPhoto,
  onUpdateEggPhoto,
  onDeleteEggPhoto,
  onOpenCandlingWorkspace,
  openBatchId = "",
  onOpenBatchHandled
}) {
  eggPhotoCache = eggPhotoCache && typeof eggPhotoCache === "object" ? eggPhotoCache : {};
  const [showNew, setShowNew] = useState(false);
  const [editB, setEditB] = useState(null);
  const [gridB, setGridB] = useState(null);
  const [eggAct, setEggAct] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [eggPhotoBusy, setEggPhotoBusy] = useState(false);
  const [eggPhotoStatus, setEggPhotoStatus] = useState({
    kind: "idle",
    msg: ""
  });
  const [photoDayDraft, setPhotoDayDraft] = useState("");
  const [form, setForm] = useState({
    date: today(),
    incubationStartDate: today(),
    count: "",
    notes: ""
  });
  const [ef, setEf] = useState({
    date: "",
    incubationStartDate: "",
    count: "",
    notes: ""
  });
  const [hf, setHf] = useState({
    breed: "",
    sex: "unknown",
    hatchDate: today(),
    notes: ""
  });
  const [failNote, setFailNote] = useState("");
  const camRef = useRef(null);
  const galRef = useRef(null);
  const workspaceCamRef = useRef(null);
  const statusTimer = useRef(null);
  const newCode = nextCode(batches);
  const eggStateById = useMemo(() => new Map(eggStates.map(state => [state.id, state])), [eggStates]);
  const batchStatsById = useMemo(() => {
    const map = new Map();
    batches.forEach(b => map.set(b.id, {
      hatched: 0,
      failed: 0,
      pending: b.eggCount
    }));
    eggStates.forEach(state => {
      const current = map.get(state.batchId);
      if (!current) return;
      if (state.status === "hatched") current.hatched += 1;
      if (state.status === "failed") current.failed += 1;
    });
    map.forEach((stats, batchId) => {
      const batch = batches.find(b => b.id === batchId);
      const eggCount = batch?.eggCount || 0;
      stats.pending = Math.max(0, eggCount - stats.hatched - stats.failed);
      stats.eggCount = eggCount;
    });
    return map;
  }, [batches, eggStates]);
  const hatcheryTotals = useMemo(() => {
    const totalEggs = batches.reduce((sum, batch) => sum + (batch.eggCount || 0), 0);
    let hatched = 0;
    let failed = 0;
    batchStatsById.forEach(stats => {
      hatched += stats.hatched || 0;
      failed += stats.failed || 0;
    });
    return {
      totalEggs,
      hatched,
      failed,
      pending: Math.max(0, totalEggs - hatched - failed)
    };
  }, [batchStatsById, batches]);
  const batchIncubationById = useMemo(() => {
    const map = new Map();
    batches.forEach(batch => {
      const profile = typeof buildBatchIncubationProfile === "function" ? buildBatchIncubationProfile(batch) : null;
      if (profile) map.set(batch.id, profile);
    });
    return map;
  }, [batches]);
  const formIncubationPreview = useMemo(() => typeof buildBatchIncubationProfile === "function" ? buildBatchIncubationProfile({
    collectedDate: form.date,
    incubationStartDate: form.incubationStartDate || form.date
  }) : null, [form.date, form.incubationStartDate]);
  const editIncubationPreview = useMemo(() => editB && typeof buildBatchIncubationProfile === "function" ? buildBatchIncubationProfile({
    ...editB,
    collectedDate: ef.date,
    incubationStartDate: ef.incubationStartDate || ef.date
  }) : null, [editB, ef.date, ef.incubationStartDate]);
  const gridStats = gridB?.id ? batchStatsById.get(gridB.id) || {
    hatched: 0,
    failed: 0,
    pending: gridB.eggCount || 0,
    eggCount: gridB.eggCount || 0
  } : null;
  const gridIncubation = gridB?.id ? batchIncubationById.get(gridB.id) || null : null;
  const activeEggState = eggAct?.code ? eggStateById.get(eggAct.code) || null : null;
  const activeEggOutcomeState = activeEggState?.status === "hatched" || activeEggState?.status === "failed" ? activeEggState : null;
  const activeEggIncubation = eggAct?.batchId ? batchIncubationById.get(eggAct.batchId) || null : null;
  const activeEggPhotos = useMemo(() => eggAct?.code ? sortEggProgressPhotos(eggPhotoCache[eggAct.code] || []) : [], [eggAct?.code, eggPhotoCache]);
  const selectedEggPhoto = useMemo(() => {
    if (!activeEggPhotos.length) return null;
    return activeEggPhotos.find(photo => photo.id === eggAct?.selectedPhotoId) || activeEggPhotos[activeEggPhotos.length - 1];
  }, [activeEggPhotos, eggAct?.selectedPhotoId]);
  const workspaceBatch = useMemo(() => workspace?.kind === "candling_capture" && workspace?.batchId ? batches.find(batch => batch.id === workspace.batchId) || null : null, [batches, workspace?.batchId, workspace?.kind]);
  const workspaceIncubation = workspaceBatch?.id ? batchIncubationById.get(workspaceBatch.id) || null : null;
  const workspaceEggCount = Math.max(0, Number(workspaceBatch?.eggCount) || 0);
  const workspaceEggIndex = Math.max(0, Math.min(workspaceEggCount > 0 ? workspaceEggCount - 1 : 0, Number(workspace?.idx) || 0));
  const workspaceEggCode = workspaceBatch && workspaceEggCount ? eggCode(workspaceBatch.code, workspaceEggIndex) : "";
  const workspaceDayNumber = workspaceBatch?.id ? resolveEggPhotoDay(workspaceBatch.id) : 1;
  const workspaceEggState = workspaceEggCode ? eggStateById.get(workspaceEggCode) || null : null;
  const workspaceEggPhotos = useMemo(() => workspaceEggCode ? sortEggProgressPhotos(eggPhotoCache[workspaceEggCode] || []) : [], [eggPhotoCache, workspaceEggCode]);
  const workspaceTodayPhoto = useMemo(() => workspaceEggCode ? findEggPhotoForDay(workspaceEggPhotos, workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS) : null, [workspaceDayNumber, workspaceEggCode, workspaceEggPhotos, workspaceIncubation?.totalDays]);
  const workspaceCaptureStats = useMemo(() => {
    if (!workspaceBatch || !workspaceEggCount) return {
      captured: 0,
      total: workspaceEggCount,
      unresolved: 0
    };
    let captured = 0;
    let unresolved = 0;
    for (let i = 0; i < workspaceEggCount; i += 1) {
      const code = eggCode(workspaceBatch.code, i);
      if (!Object.prototype.hasOwnProperty.call(eggPhotoCache, code)) {
        unresolved += 1;
        continue;
      }
      if (findEggPhotoForDay(eggPhotoCache[code] || [], workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)) captured += 1;
    }
    return {
      captured,
      total: workspaceEggCount,
      unresolved
    };
  }, [eggPhotoCache, workspaceBatch, workspaceDayNumber, workspaceEggCount, workspaceIncubation?.totalDays]);
  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
  }, []);
  useEffect(() => {
    if (!openBatchId) return;
    const targetBatch = batches.find(batch => batch.id === openBatchId) || null;
    if (targetBatch) setGridB(prev => prev?.id === targetBatch.id ? prev : targetBatch);
    if (typeof onOpenBatchHandled === "function") onOpenBatchHandled();
  }, [batches, onOpenBatchHandled, openBatchId]);
  useEffect(() => {
    if (!gridB?.id) return;
    const nextBatch = batches.find(batch => batch.id === gridB.id) || null;
    if (!nextBatch) {
      setGridB(null);
      return;
    }
    if (nextBatch !== gridB) setGridB(nextBatch);
  }, [batches, gridB]);
  useEffect(() => {
    if (!eggAct?.code || typeof ensureEggPhotos !== "function" || Object.prototype.hasOwnProperty.call(eggPhotoCache, eggAct.code)) return;
    ensureEggPhotos(eggAct.code).catch(console.error);
  }, [eggAct?.code, eggPhotoCache, ensureEggPhotos]);
  useEffect(() => {
    if (!eggAct?.code) return;
    const hasSelected = activeEggPhotos.some(photo => photo.id === eggAct.selectedPhotoId);
    const nextSelectedId = activeEggPhotos.length ? hasSelected ? eggAct.selectedPhotoId : activeEggPhotos[activeEggPhotos.length - 1].id : "";
    if (nextSelectedId === (eggAct.selectedPhotoId || "")) return;
    setEggAct(prev => prev?.code === eggAct.code ? {
      ...prev,
      selectedPhotoId: nextSelectedId
    } : prev);
  }, [activeEggPhotos, eggAct?.code, eggAct?.selectedPhotoId]);
  useEffect(() => {
    if (!selectedEggPhoto) {
      setPhotoDayDraft("");
      return;
    }
    const nextDraft = String(normalizeEggPhotoDay(selectedEggPhoto.dayNumber, activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS));
    setPhotoDayDraft(prev => prev === nextDraft ? prev : nextDraft);
  }, [activeEggIncubation?.totalDays, selectedEggPhoto?.dayNumber, selectedEggPhoto?.id]);
  useEffect(() => {
    if (!workspaceBatch?.id || typeof ensureEggPhotos !== "function") return;
    const missingEggIds = [];
    for (let i = 0; i < workspaceEggCount; i += 1) {
      const code = eggCode(workspaceBatch.code, i);
      if (!Object.prototype.hasOwnProperty.call(eggPhotoCache, code)) missingEggIds.push(code);
    }
    if (!missingEggIds.length) return;
    Promise.all(missingEggIds.map(code => ensureEggPhotos(code).catch(err => {
      console.error(err);
      return [];
    }))).catch(console.error);
  }, [eggPhotoCache, ensureEggPhotos, workspaceBatch?.code, workspaceBatch?.id, workspaceEggCount]);
  function flashEggPhoto(kind, msg) {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setEggPhotoStatus({
      kind,
      msg
    });
    if (kind === "busy") return;
    statusTimer.current = setTimeout(() => setEggPhotoStatus({
      kind: "idle",
      msg: ""
    }), 2600);
  }
  function resetEggPhotoUi() {
    setEggPhotoBusy(false);
    setPhotoDayDraft("");
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setEggPhotoStatus({
      kind: "idle",
      msg: ""
    });
  }
  function closeEggModal() {
    setEggAct(null);
    resetEggPhotoUi();
  }
  function closeWorkspace() {
    setWorkspace(null);
    resetEggPhotoUi();
  }
  function resolveEggPhotoDay(batchId) {
    const incubation = batchIncubationById.get(batchId) || null;
    return normalizeEggPhotoDay(incubation?.dayNumber || 1, incubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS);
  }
  function openCandlingWorkspace(batchId = "") {
    const targetBatch = batchId ? batches.find(batch => batch.id === batchId) || null : null;
    setGridB(null);
    setEggAct(null);
    resetEggPhotoUi();
    setWorkspace({
      kind: "candling_capture",
      batchId: targetBatch?.id || "",
      idx: 0,
      eggOpen: false
    });
  }
  function launchCandlingWorkspace(batchId = "") {
    if (typeof onOpenCandlingWorkspace === "function") {
      onOpenCandlingWorkspace(batchId);
      return;
    }
    openCandlingWorkspace(batchId);
  }
  function selectWorkspaceBatch(batch) {
    if (!batch?.id) return;
    resetEggPhotoUi();
    setWorkspace({
      kind: "candling_capture",
      batchId: batch.id,
      idx: 0,
      eggOpen: false
    });
  }
  function openWorkspaceEggCapture(idx) {
    if (!workspaceBatch) return;
    resetEggPhotoUi();
    const maxIdx = Math.max(0, (workspaceBatch.eggCount || 1) - 1);
    setWorkspace(prev => prev ? {
      ...prev,
      batchId: workspaceBatch.id,
      idx: Math.max(0, Math.min(maxIdx, idx)),
      eggOpen: true
    } : prev);
  }
  function closeWorkspaceEggCapture() {
    resetEggPhotoUi();
    setWorkspace(prev => prev?.kind === "candling_capture" ? {
      ...prev,
      eggOpen: false
    } : prev);
  }
  function setWorkspaceEggIndex(idx) {
    if (!workspaceBatch) return;
    const maxIdx = Math.max(0, (workspaceBatch.eggCount || 1) - 1);
    setWorkspace(prev => prev ? {
      ...prev,
      batchId: workspaceBatch.id,
      idx: Math.max(0, Math.min(maxIdx, idx))
    } : prev);
  }
  function moveWorkspaceEgg(direction) {
    setWorkspaceEggIndex(workspaceEggIndex + direction);
  }
  async function getEggPhotosForEgg(eggId) {
    if (!eggId) return [];
    if (Object.prototype.hasOwnProperty.call(eggPhotoCache, eggId)) return sortEggProgressPhotos(eggPhotoCache[eggId] || []);
    if (typeof ensureEggPhotos === "function") return sortEggProgressPhotos(await ensureEggPhotos(eggId));
    return [];
  }
  async function saveEggPhotoFromFile(file, target) {
    if (!file || !target?.eggId || !target?.batchId || typeof onAddEggPhoto !== "function") return null;
    if (!file.type.startsWith("image/")) {
      flashEggPhoto("err", "Please select an image file.");
      return null;
    }
    const totalDays = target.totalDays || EGG_PROGRESS_TOTAL_DAYS;
    const dayNumber = normalizeEggPhotoDay(target.dayNumber || resolveEggPhotoDay(target.batchId), totalDays);
    setEggPhotoBusy(true);
    flashEggPhoto("busy", "Processing photo...");
    try {
      const existingPhotos = await getEggPhotosForEgg(target.eggId);
      const existingPhoto = findEggPhotoForDay(existingPhotos, dayNumber, totalDays);
      const takenAt = new Date().toISOString();
      const dataUrl = await compressImg(file);
      const sizeKb = Math.round(dataUrl.length * .75 / 1024);
      const nextPhoto = existingPhoto ? {
        ...existingPhoto,
        batchId: target.batchId,
        idx: target.idx,
        dayNumber,
        takenAt,
        modifiedAt: takenAt,
        sizeKb,
        dataUrl
      } : {
        id: uid(),
        eggId: target.eggId,
        batchId: target.batchId,
        idx: target.idx,
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
      if (typeof target.onSaved === "function") target.onSaved(nextPhoto, existingPhoto);
      flashEggPhoto("ok", `${existingPhoto ? "Replaced" : "Saved"} photo for ${eggPhotoDayLabel(dayNumber, totalDays)}.`);
      return {
        photo: nextPhoto,
        replaced: !!existingPhoto
      };
    } catch (err) {
      console.error(err);
      flashEggPhoto("err", "Could not save egg photo. Please try again.");
      return null;
    } finally {
      setEggPhotoBusy(false);
    }
  }
  function saveBatch() {
    if (!form.count) return;
    onAdd({
      id: uid(),
      code: newCode,
      collectedDate: form.date,
      incubationStartDate: form.incubationStartDate || form.date,
      eggCount: +form.count,
      notes: form.notes,
      createdAt: new Date().toISOString()
    });
    setForm({
      date: today(),
      incubationStartDate: today(),
      count: "",
      notes: ""
    });
    setShowNew(false);
  }
  function saveEdit() {
    if (!ef.count) return;
    onUpdate({
      ...editB,
      collectedDate: ef.date,
      incubationStartDate: ef.incubationStartDate || ef.date,
      eggCount: +ef.count,
      notes: ef.notes
    });
    setEditB(null);
  }
  function setNewCollectionDate(value) {
    setForm(prev => ({
      ...prev,
      date: value,
      incubationStartDate: !prev.incubationStartDate || prev.incubationStartDate === prev.date ? value : prev.incubationStartDate
    }));
  }
  function setEditCollectionDate(value) {
    setEf(prev => ({
      ...prev,
      date: value,
      incubationStartDate: !prev.incubationStartDate || prev.incubationStartDate === prev.date ? value : prev.incubationStartDate
    }));
  }
  function toggleBatchBookmark(batch) {
    if (!batch) return;
    const nextBookmarked = !batch.bookmarked;
    onUpdate({
      ...batch,
      bookmarked: nextBookmarked,
      bookmarkedAt: nextBookmarked ? new Date().toISOString() : ""
    });
  }
  function tapEgg(code, batchId, idx) {
    const existingState = eggStateById.get(code) || null;
    setEggAct({
      code,
      batchId,
      idx,
      mode: existingState?.status === "hatched" || existingState?.status === "failed" ? "details" : null,
      selectedPhotoId: ""
    });
    setHf({
      breed: existingState?.breed || "",
      sex: "unknown",
      hatchDate: today(),
      notes: existingState?.notes || ""
    });
    setFailNote(existingState?.status === "failed" ? existingState.note || "" : "");
  }
  function cycleEggPhoto(direction) {
    if (!selectedEggPhoto || activeEggPhotos.length < 2) return;
    const currentIndex = activeEggPhotos.findIndex(photo => photo.id === selectedEggPhoto.id);
    if (currentIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(activeEggPhotos.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex) return;
    setEggAct(prev => prev ? {
      ...prev,
      selectedPhotoId: activeEggPhotos[nextIndex].id
    } : prev);
  }
  async function handleEggPhotoFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      e.target.value = "";
      return;
    }
    if (!eggAct) {
      e.target.value = "";
      return;
    }
    await saveEggPhotoFromFile(file, {
      eggId: eggAct.code,
      batchId: eggAct.batchId,
      idx: eggAct.idx,
      totalDays: activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS,
      onSaved: photo => setEggAct(prev => prev?.code === photo.eggId ? {
        ...prev,
        selectedPhotoId: photo.id
      } : prev)
    });
    e.target.value = "";
  }
  async function handleWorkspaceCaptureFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      e.target.value = "";
      return;
    }
    if (!workspaceEggCode || !workspaceBatch?.id) {
      e.target.value = "";
      return;
    }
    await saveEggPhotoFromFile(file, {
      eggId: workspaceEggCode,
      batchId: workspaceBatch.id,
      idx: workspaceEggIndex,
      dayNumber: workspaceDayNumber,
      totalDays: workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS
    });
    e.target.value = "";
  }
  async function saveSelectedEggPhotoDay() {
    if (!selectedEggPhoto || typeof onUpdateEggPhoto !== "function") return;
    const nextDay = normalizeEggPhotoDay(photoDayDraft, activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS);
    if (nextDay === normalizeEggPhotoDay(selectedEggPhoto.dayNumber, activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)) {
      flashEggPhoto("ok", "Day label is already up to date.");
      return;
    }
    setEggPhotoBusy(true);
    try {
      await onUpdateEggPhoto({
        ...selectedEggPhoto,
        dayNumber: nextDay,
        modifiedAt: new Date().toISOString()
      });
      flashEggPhoto("ok", `Photo moved to ${eggPhotoDayLabel(nextDay, activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)}.`);
    } catch (err) {
      console.error(err);
      flashEggPhoto("err", "Could not update the day label.");
    } finally {
      setEggPhotoBusy(false);
    }
  }
  async function deleteSelectedEggPhoto() {
    if (!selectedEggPhoto || !eggAct?.code || typeof onDeleteEggPhoto !== "function") return;
    if (!window.confirm("Delete this egg photo?")) return;
    setEggPhotoBusy(true);
    try {
      await onDeleteEggPhoto(eggAct.code, selectedEggPhoto.id);
      flashEggPhoto("ok", "Photo removed.");
    } catch (err) {
      console.error(err);
      flashEggPhoto("err", "Could not remove this egg photo.");
    } finally {
      setEggPhotoBusy(false);
    }
  }
  function savePendingEggProfile() {
    if (!eggAct) return;
    const nowIso = new Date().toISOString();
    onSaveEgg({
      ...(activeEggState || {}),
      id: eggAct.code,
      batchId: eggAct.batchId,
      idx: eggAct.idx,
      status: "pending",
      birdId: null,
      date: activeEggState?.date || "",
      note: activeEggState?.note || "",
      breed: String(hf.breed || "").trim(),
      notes: String(hf.notes || "").trim(),
      updatedAt: nowIso,
      createdAt: activeEggState?.createdAt || nowIso
    });
  }
  function doHatch() {
    const bird = {
      id: uid(),
      tagId: eggAct.code,
      originBatchId: eggAct.batchId,
      hatchDate: hf.hatchDate,
      stage: "chick",
      breed: hf.breed,
      sex: hf.sex,
      status: "active",
      notes: hf.notes,
      createdAt: new Date().toISOString()
    };
    onHatch(bird);
    onSaveEgg({
      id: eggAct.code,
      batchId: eggAct.batchId,
      idx: eggAct.idx,
      status: "hatched",
      birdId: bird.id,
      date: hf.hatchDate,
      note: "",
      breed: String(hf.breed || "").trim(),
      notes: String(hf.notes || "").trim()
    });
    closeEggModal();
  }
  function doFail() {
    onSaveEgg({
      id: eggAct.code,
      batchId: eggAct.batchId,
      idx: eggAct.idx,
      status: "failed",
      birdId: null,
      date: today(),
      note: failNote,
      breed: String(hf.breed || "").trim(),
      notes: String(hf.notes || "").trim()
    });
    closeEggModal();
  }
  const newBatchModal = showNew ? React.createElement(Modal, {
    title: "New Batch · " + newCode,
    onClose: () => setShowNew(false)
  }, React.createElement("div", {
    style: {
      color: "#475569",
      fontSize: 14,
      marginBottom: 4
    }
  }, form.count ? `Eggs: ${eggCode(newCode, 0)} → ${eggCode(newCode, +form.count - 1)}` : "Enter count to preview codes"), React.createElement(FL, {
    lbl: "Collection Date"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: form.date,
    onChange: e => setNewCollectionDate(e.target.value)
  })), React.createElement(FL, {
    lbl: "Incubation Start"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: form.incubationStartDate,
    onChange: e => setForm({
      ...form,
      incubationStartDate: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Egg Count *"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    value: form.count,
    onChange: e => setForm({
      ...form,
      count: e.target.value
    }),
    min: "1",
    placeholder: "e.g. 12"
  })), React.createElement(FL, {
    lbl: "Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: form.notes,
    onChange: e => setForm({
      ...form,
      notes: e.target.value
    })
  })), formIncubationPreview?.expectedHatchDate && React.createElement("div", {
    style: {
      marginBottom: 12,
      fontSize: 13,
      color: "#9a3412",
      fontWeight: 700
    }
  }, "Expected hatch: ", fmtDate(formIncubationPreview.expectedHatchDate)), React.createElement("button", {
    style: C.btn,
    onClick: saveBatch
  }, "Save Batch")) : null;
  const editBatchModal = editB ? React.createElement(Modal, {
    title: "Edit " + editB.code,
    onClose: () => setEditB(null)
  }, React.createElement(FL, {
    lbl: "Collection Date"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: ef.date,
    onChange: e => setEditCollectionDate(e.target.value)
  })), React.createElement(FL, {
    lbl: "Incubation Start"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: ef.incubationStartDate,
    onChange: e => setEf({
      ...ef,
      incubationStartDate: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Egg Count"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    value: ef.count,
    onChange: e => setEf({
      ...ef,
      count: e.target.value
    }),
    min: "1"
  }), +ef.count < editB.eggCount && React.createElement("div", {
    style: {
      color: "#a16207",
      fontSize: 13,
      marginTop: 6
    }
  }, "\u26A0\uFE0F Reducing count hides eggs beyond the new number.")), React.createElement(FL, {
    lbl: "Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: ef.notes,
    onChange: e => setEf({
      ...ef,
      notes: e.target.value
    })
  })), editIncubationPreview?.expectedHatchDate && React.createElement("div", {
    style: {
      marginBottom: 12,
      fontSize: 13,
      color: "#9a3412",
      fontWeight: 700
    }
  }, "Expected hatch: ", fmtDate(editIncubationPreview.expectedHatchDate)), React.createElement("button", {
    style: C.btn,
    onClick: saveEdit
  }, "Save Changes")) : null;
  const gridEggCells = gridB ? Array.from({
    length: gridB.eggCount
  }, (_, i) => {
    const code = eggCode(gridB.code, i);
    const st = eggStateById.get(code) || null;
    const isH = st?.status === "hatched";
    const isF = st?.status === "failed";
    const breedLabel = String(st?.breed || "").trim();
    const noteMeta = eggCardNoteMeta(st);
    return React.createElement("div", {
      key: code,
      onClick: () => tapEgg(code, gridB.id, i),
      style: {
        background: isH ? "#15803d18" : isF ? "#b91c1c18" : "#d9e3ef",
        border: isH ? "2px solid #15803d" : isF ? "2px solid #b91c1c" : "2px solid #c4d0df",
        borderRadius: 12,
        padding: "10px 4px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        cursor: "pointer",
        userSelect: "none"
      }
    }, React.createElement("div", {
      style: {
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 4
      }
    }, React.createElement("span", {
      style: {
        fontSize: 24
      }
    }, isH ? "🐣" : isF ? "💀" : "🥚"), noteMeta.hasNote && React.createElement("span", {
      title: noteMeta.label,
      ariaLabel: noteMeta.label,
      style: {
        fontSize: 12,
        lineHeight: 1,
        padding: "4px 5px",
        borderRadius: 999,
        background: "#ffffffcc",
        border: "1px solid #cbd5e1",
        color: "#475569",
        boxShadow: "0 4px 10px -8px #0f172a80"
      }
    }, "\uD83D\uDCDD")), React.createElement("span", {
      style: {
        fontSize: 9,
        color: isH ? "#15803d" : isF ? "#b91c1c" : "#475569",
        fontWeight: 700,
        textAlign: "center",
        wordBreak: "break-all"
      }
    }, code.split("-").slice(1).join("-")), !!breedLabel && React.createElement("span", {
      title: breedLabel,
      style: {
        maxWidth: "100%",
        fontSize: 9,
        color: "#7c2d12",
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, breedLabel));
  }) : [];
  const gridIncubationHeaderEl = gridIncubation ? React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      flexWrap: "wrap"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: ".05em",
      textTransform: "uppercase",
      color: "#9a3412"
    }
  }, "Incubation guidance"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 19,
      fontWeight: 900,
      color: "#7c2d12"
    }
  }, gridIncubation.isScheduled ? `Starts ${fmtDate(gridIncubation.incubationStartDate)}` : `Day ${gridIncubation.dayNumber} of ${gridIncubation.totalDays}`), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: "#9a3412",
      fontWeight: 700
    }
  }, `${gridIncubation.currentStage?.label || "Incubation"} · ${gridIncubation.currentStage?.humidity || "—"}`), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 13,
      color: "#7c2d12",
      lineHeight: 1.45
    }
  }, gridIncubation.currentStage?.purpose || "")), React.createElement("div", {
    style: {
      minWidth: 132,
      padding: "10px 12px",
      borderRadius: 12,
      background: "#ffffff",
      border: "1px solid #fdba74"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: ".05em",
      color: "#9a3412"
    }
  }, "Pending"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 24,
      fontWeight: 900,
      color: "#c2410c"
    }
  }, fmtNum(gridStats.pending)), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#9a3412"
    }
  }, "Hatch due ", fmtDate(gridIncubation.expectedHatchDate)))) : null;
  const gridIncubationScheduleEl = gridIncubation ? React.createElement("div", {
    style: {
      marginTop: 12,
      display: "grid",
      gap: 8
    }
  }, (Array.isArray(INCUBATION_SCHEDULE) ? INCUBATION_SCHEDULE : []).map(stage => React.createElement("div", {
    key: stage.id,
    style: {
      display: "grid",
      gridTemplateColumns: "96px minmax(0,1fr) auto",
      gap: 10,
      alignItems: "center",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${gridIncubation.currentStage?.id === stage.id ? "#fdba74" : "#fed7aa"}`,
      background: gridIncubation.currentStage?.id === stage.id ? "#ffedd5" : "#ffffff"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      color: "#9a3412"
    }
  }, `Day ${stage.startDay}-${stage.endDay}`), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: "#7c2d12"
    }
  }, stage.label), React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 12,
      color: "#9a3412"
    }
  }, stage.purpose)), React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: "#c2410c",
      whiteSpace: "nowrap"
    }
  }, stage.humidity)))) : null;
  const gridIncubationNextEl = gridIncubation?.nextCheckpointDay ? React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 13,
      color: "#7c2d12",
      fontWeight: 700
    }
  }, "Next checkpoint: ", gridIncubation.nextCheckpointTitle, " on ", fmtDate(gridIncubation.nextCheckpointDay), gridIncubation.nextStage ? ` · ${gridIncubation.nextStage.humidity}` : "") : null;
  const gridIncubationCardEl = gridIncubation && gridStats?.pending > 0 ? React.createElement("div", {
    style: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 16,
      border: "1px solid #fed7aa",
      background: "linear-gradient(180deg,#fff7ed 0%,#ffffff 100%)"
    }
  }, gridIncubationHeaderEl, gridIncubationScheduleEl, gridIncubationNextEl) : null;
  const gridModalEl = gridB ? React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000000b0",
      zIndex: 200,
      overflowY: "auto"
    }
  }, React.createElement("div", {
    style: {
      background: "#ffffff",
      border: "1px solid #d9e3ef",
      borderRadius: 18,
      margin: "16px 10px 90px",
      padding: 18
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 900,
      color: "#b45309"
    }
  }, gridB.code), React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#475569"
    }
  }, gridB.eggCount, " eggs \xB7 ", fmtDate(gridB.collectedDate))), React.createElement("button", {
    onClick: () => setGridB(null),
    style: C.sec
  }, "\u2715")), gridIncubationCardEl, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 12,
      fontSize: 13,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      flexWrap: "wrap"
    }
  }, React.createElement("span", {
    style: {
      color: "#475569",
      fontWeight: 700
    }
  }, "\uD83E\uDD5A Pending"), React.createElement("span", {
    style: {
      color: "#15803d",
      fontWeight: 700
    }
  }, "\uD83D\uDC23 Hatched"), React.createElement("span", {
    style: {
      color: "#b91c1c",
      fontWeight: 700
    }
  }, "\uD83D\uDC80 Failed")), React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      background: "#fff7ed",
      color: "#b45309",
      borderColor: "#fdba74"
    },
    onClick: () => launchCandlingWorkspace(gridB.id)
  }, "\uD83D\uDCF7 Candling Capture")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      gap: 8
    }
  }, gridEggCells))) : null;
  const eggProfileBreed = String(activeEggState?.breed || "").trim();
  const eggProfileNotes = String(activeEggState?.notes || "").trim();
  const eggPendingGuidance = activeEggIncubation?.currentStage ? `${activeEggIncubation.currentStage.label} \u00B7 ${activeEggIncubation.currentStage.humidity}` : "Add progress photos during candling, then edit the day if the upload was late.";
  const eggStatusTone = activeEggOutcomeState?.status === "hatched" ? "#15803d" : activeEggOutcomeState?.status === "failed" ? "#b91c1c" : "#b45309";
  const eggStatusIcon = activeEggOutcomeState?.status === "hatched" ? "\uD83D\uDC23" : activeEggOutcomeState?.status === "failed" ? "\uD83D\uDC80" : "\uD83E\uDD5A";
  const eggStatusLabel = activeEggOutcomeState?.status === "hatched" ? "Hatched" : activeEggOutcomeState?.status === "failed" ? "Failed" : "Pending";
  const eggStatusDetail = activeEggOutcomeState ? activeEggOutcomeState.status === "hatched" ? `Hatched on ${fmtDate(activeEggOutcomeState.date)}` : `Marked failed on ${fmtDate(activeEggOutcomeState.date)}` : eggProfileBreed ? `Breed saved: ${eggProfileBreed}` : activeEggIncubation ? activeEggIncubation.isScheduled ? `Incubation starts ${fmtDate(activeEggIncubation.incubationStartDate)}` : `${eggPhotoDayLabel(activeEggIncubation.dayNumber, activeEggIncubation.totalDays)} of ${activeEggIncubation.totalDays}` : "No final outcome yet";
  const eggStatusNote = activeEggOutcomeState?.status === "failed" ? activeEggOutcomeState.note || eggProfileNotes || "No failure note saved." : activeEggOutcomeState?.status === "hatched" ? [activeEggOutcomeState.birdId ? "Chick record linked to this egg." : "Chick record saved.", eggProfileNotes].filter(Boolean).join(" \u00B7 ") : [eggProfileBreed ? `Breed: ${eggProfileBreed}` : "", eggProfileNotes, eggPendingGuidance].filter(Boolean).join(" \u00B7 ");
  const selectedEggPhotoIndex = selectedEggPhoto ? activeEggPhotos.findIndex(photo => photo.id === selectedEggPhoto.id) : -1;
  const eggSummaryCardEl = eggAct ? React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 14,
      borderRadius: 16,
      border: `1px solid ${eggStatusTone}33`,
      background: activeEggOutcomeState?.status === "hatched" ? "#f0fdf4" : activeEggOutcomeState?.status === "failed" ? "#fef2f2" : "#fff7ed"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      width: 42,
      height: 42,
      borderRadius: 12,
      display: "grid",
      placeItems: "center",
      background: `${eggStatusTone}18`,
      fontSize: 22
    }
  }, eggStatusIcon), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: ".05em",
      textTransform: "uppercase",
      color: eggStatusTone
    }
  }, eggStatusLabel), React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 16,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, eggStatusDetail))), React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 1.5,
      color: "#475569"
    }
  }, eggStatusNote)) : null;
  const eggPhotoContentEl = selectedEggPhoto ? React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      position: "relative",
      marginTop: 12,
      borderRadius: 18,
      overflow: "hidden",
      background: "#0f172a",
      minHeight: 260,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, selectedEggPhoto.dataUrl ? React.createElement("img", {
    src: selectedEggPhoto.dataUrl,
    alt: `${eggAct?.code || "Egg"} ${eggPhotoDayLabel(selectedEggPhoto.dayNumber, activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)}`,
    style: {
      width: "100%",
      maxHeight: "42vh",
      objectFit: "contain",
      display: "block"
    }
  }) : React.createElement("div", {
    style: {
      color: "#cbd5e1",
      fontSize: 14,
      fontWeight: 700
    }
  }, "Image unavailable"), React.createElement("div", {
    style: {
      position: "absolute",
      top: 10,
      left: 10,
      background: "#ffffffd9",
      borderRadius: 999,
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, eggPhotoDayLabel(selectedEggPhoto.dayNumber, activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)), React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 10,
      right: 10,
      background: "#0f172acc",
      borderRadius: 999,
      padding: "5px 9px",
      fontSize: 11,
      fontWeight: 700,
      color: "#e2e8f0"
    }
  }, `~${selectedEggPhoto.sizeKb || 0}KB`)), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      gap: 8,
      alignItems: "center",
      marginTop: 12
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      opacity: selectedEggPhotoIndex <= 0 ? 0.55 : 1
    },
    onClick: () => cycleEggPhoto(-1),
    disabled: selectedEggPhotoIndex <= 0
  }, "\u2190 Previous"), React.createElement("div", {
    style: {
      textAlign: "center",
      fontSize: 12,
      color: "#475569",
      fontWeight: 700
    }
  }, eggPhotoShortDate(selectedEggPhoto.takenAt) || "No upload date"), React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      opacity: selectedEggPhotoIndex >= activeEggPhotos.length - 1 ? 0.55 : 1
    },
    onClick: () => cycleEggPhoto(1),
    disabled: selectedEggPhotoIndex >= activeEggPhotos.length - 1
  }, "Next \u2192")), React.createElement("div", {
    style: {
      marginTop: 12,
      display: "grid",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#475569"
    }
  }, "Uploaded ", eggPhotoLongDate(selectedEggPhoto.takenAt) || "unknown time"), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) auto auto",
      gap: 8,
      alignItems: "end"
    }
  }, React.createElement(FL, {
    lbl: "Incubation Day"
  }, React.createElement("input", {
    style: C.inp,
    type: "number",
    min: "1",
    max: String(activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS),
    value: photoDayDraft,
    onChange: e => setPhotoDayDraft(e.target.value)
  })), React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      padding: "13px 16px",
      whiteSpace: "nowrap"
    },
    onClick: saveSelectedEggPhotoDay,
    disabled: eggPhotoBusy
  }, eggPhotoBusy ? "Saving..." : "Save Day"), React.createElement("button", {
    style: {
      background: "#ffffff",
      color: "#b91c1c",
      border: "1px solid #fecaca",
      borderRadius: 12,
      padding: "13px 16px",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap"
    },
    onClick: deleteSelectedEggPhoto,
    disabled: eggPhotoBusy
  }, "Delete")))) : React.createElement("div", {
    style: {
      marginTop: 12,
      borderRadius: 18,
      border: "2px dashed #cbd5e1",
      background: "#ffffff",
      minHeight: 220,
      display: "grid",
      placeItems: "center",
      textAlign: "center",
      padding: 18
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 34
    }
  }, "\uD83D\uDCF7"), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 15,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, "No progress photos yet"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.5
    }
  }, "Add a candling photo now. It will default to ", eggPhotoDayLabel(resolveEggPhotoDay(eggAct?.batchId), activeEggIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS), ".")));
  const eggPhotoViewerEl = eggAct ? React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 14,
      borderRadius: 18,
      border: "1px solid #d9e3ef",
      background: "#f8fafc"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: ".05em",
      textTransform: "uppercase",
      color: "#475569"
    }
  }, "Progress photos"), React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 15,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, activeEggPhotos.length ? `${selectedEggPhotoIndex + 1} of ${activeEggPhotos.length}` : "No photos yet")), React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#475569",
      fontWeight: 700
    }
  }, activeEggIncubation && !activeEggIncubation.isScheduled ? `${eggPhotoDayLabel(activeEggIncubation.dayNumber, activeEggIncubation.totalDays)} default` : "Day label is editable")), eggPhotoContentEl, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginTop: 12
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      color: eggPhotoBusy ? "#475569" : "#b45309",
      borderColor: eggPhotoBusy ? "#cbd5e1" : "#fdba74"
    },
    onClick: () => camRef.current && camRef.current.click(),
    disabled: eggPhotoBusy
  }, eggPhotoBusy ? "Saving..." : "\uD83D\uDCF8 Capture"), React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0
    },
    onClick: () => galRef.current && galRef.current.click(),
    disabled: eggPhotoBusy
  }, eggPhotoBusy ? "Saving..." : "\uD83D\uDDBC Pick File"), React.createElement("input", {
    ref: camRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    style: {
      display: "none"
    },
    onChange: handleEggPhotoFile,
    disabled: eggPhotoBusy
  }), React.createElement("input", {
    ref: galRef,
    type: "file",
    accept: "image/*",
    style: {
      display: "none"
    },
    onChange: handleEggPhotoFile,
    disabled: eggPhotoBusy
  })), eggPhotoStatus.kind !== "idle" && React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 13,
      textAlign: "center",
      color: eggPhotoStatus.kind === "ok" ? "#15803d" : eggPhotoStatus.kind === "err" ? "#b91c1c" : "#475569",
      fontWeight: eggPhotoStatus.kind === "busy" ? 700 : 600
    }
  }, eggPhotoStatus.msg)) : null;
  const eggPendingDetailsEl = !activeEggOutcomeState && eggAct?.mode === null ? React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 14,
      borderRadius: 16,
      border: "1px solid #fde68a",
      background: "#fffbeb"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: ".05em",
      textTransform: "uppercase",
      color: "#a16207"
    }
  }, "Egg profile"), React.createElement(FL, {
    lbl: "Breed"
  }, React.createElement("input", {
    style: C.inp,
    value: hf.breed,
    onChange: e => setHf({
      ...hf,
      breed: e.target.value
    }),
    placeholder: "Optional breed while still incubating"
  })), React.createElement(FL, {
    lbl: "Egg Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: hf.notes,
    onChange: e => setHf({
      ...hf,
      notes: e.target.value
    }),
    placeholder: "Observations, markings, concerns, breeder notes..."
  })), React.createElement("button", {
    style: {
      ...C.sec,
      width: "100%",
      marginTop: 18,
      borderColor: "#fcd34d",
      color: "#92400e",
      background: "#ffffff"
    },
    onClick: savePendingEggProfile
  }, "Save Egg Profile")) : null;
  const eggModePickerEl = !activeEggOutcomeState && eggAct?.mode === null ? React.createElement("div", {
    style: {
      marginTop: 14,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12
    }
  }, React.createElement("button", {
    onClick: () => setEggAct({
      ...eggAct,
      mode: "hatch"
    }),
    style: {
      background: "#15803d18",
      border: "2px solid #15803d55",
      borderRadius: 14,
      padding: "16px 8px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      fontSize: 32
    }
  }, "\uD83D\uDC23"), React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#15803d"
    }
  }, "Hatched \u2713")), React.createElement("button", {
    onClick: () => setEggAct({
      ...eggAct,
      mode: "fail"
    }),
    style: {
      background: "#b91c1c18",
      border: "2px solid #b91c1c55",
      borderRadius: 14,
      padding: "16px 8px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      fontSize: 32
    }
  }, "\uD83D\uDC80"), React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#b91c1c"
    }
  }, "Failed \u2717"))) : null;
  const eggHatchFormEl = !activeEggOutcomeState && eggAct?.mode === "hatch" ? React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 14,
      borderRadius: 16,
      border: "1px solid #bbf7d0",
      background: "#f0fdf4"
    }
  }, React.createElement(FL, {
    lbl: "Hatch Date"
  }, React.createElement("input", {
    style: C.inp,
    type: "date",
    value: hf.hatchDate,
    onChange: e => setHf({
      ...hf,
      hatchDate: e.target.value
    })
  })), React.createElement(FL, {
    lbl: "Breed"
  }, React.createElement("input", {
    style: C.inp,
    value: hf.breed,
    onChange: e => setHf({
      ...hf,
      breed: e.target.value
    }),
    placeholder: "e.g. Rhode Island Red"
  })), React.createElement(FL, {
    lbl: "Sex"
  }, React.createElement("select", {
    style: C.sel,
    value: hf.sex,
    onChange: e => setHf({
      ...hf,
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
    value: hf.notes,
    onChange: e => setHf({
      ...hf,
      notes: e.target.value
    })
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginTop: 18
    }
  }, React.createElement("button", {
    style: C.sec,
    onClick: () => setEggAct({
      ...eggAct,
      mode: null
    })
  }, "\u2190 Back"), React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 0
    },
    onClick: doHatch
  }, "\uD83D\uDC23 Confirm"))) : null;
  const eggFailFormEl = !activeEggOutcomeState && eggAct?.mode === "fail" ? React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 14,
      borderRadius: 16,
      border: "1px solid #fecaca",
      background: "#fef2f2"
    }
  }, React.createElement(FL, {
    lbl: "Reason"
  }, React.createElement("textarea", {
    style: C.ta,
    value: failNote,
    onChange: e => setFailNote(e.target.value),
    placeholder: "e.g. Infertile, cracked..."
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginTop: 18
    }
  }, React.createElement("button", {
    style: C.sec,
    onClick: () => setEggAct({
      ...eggAct,
      mode: null
    })
  }, "\u2190 Back"), React.createElement("button", {
    style: {
      background: "#b91c1c",
      color: "#eef3f9",
      border: "none",
      borderRadius: 12,
      padding: "15px",
      fontSize: 16,
      fontWeight: 800,
      cursor: "pointer"
    },
    onClick: doFail
  }, "\uD83D\uDC80 Mark Failed"))) : null;
  const eggModalSubtitle = activeEggOutcomeState ? "Outcome saved. Progress photos stay editable." : eggAct?.mode === "hatch" ? "Save the chick details for this egg." : eggAct?.mode === "fail" ? "Save why this egg failed." : "Track photos now, save breed and egg notes, then mark hatch or fail when ready.";
  const eggActionModalEl = eggAct ? React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000000c0",
      zIndex: 300,
      overflowY: "auto",
      padding: "18px 10px 40px"
    }
  }, React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "0 auto",
      background: "#ffffff",
      border: "1px solid #d9e3ef",
      borderRadius: 22,
      padding: 18,
      paddingBottom: 26
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      width: 54,
      height: 54,
      borderRadius: 16,
      display: "grid",
      placeItems: "center",
      background: `${eggStatusTone}18`,
      fontSize: 28,
      flexShrink: 0
    }
  }, eggStatusIcon), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      fontSize: 21,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, eggAct.code), React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.5
    }
  }, eggModalSubtitle)), React.createElement("button", {
    onClick: closeEggModal,
    style: {
      ...C.sec,
      marginTop: 0
    }
  }, "\u2715")), eggSummaryCardEl, eggPhotoViewerEl, eggPendingDetailsEl, eggModePickerEl, eggHatchFormEl, eggFailFormEl, React.createElement("button", {
    onClick: closeEggModal,
    style: {
      ...C.sec,
      width: "100%",
      marginTop: 14
    }
  }, "Close"))) : null;
  const workspaceSelectedEggLoaded = !!workspaceEggCode && Object.prototype.hasOwnProperty.call(eggPhotoCache, workspaceEggCode);
  const workspaceEggFinalized = workspaceEggState?.status === "hatched" || workspaceEggState?.status === "failed";
  const workspaceEggCaptureOpen = workspace?.kind === "candling_capture" && !!workspace?.eggOpen && !!workspaceBatch?.id && !!workspaceEggCode;
  const workspaceCaptureDisabled = eggPhotoBusy || !workspaceBatch?.id || !workspaceEggCode || workspaceIncubation?.isScheduled || workspaceEggFinalized;
  const workspaceCaptureLabel = workspaceTodayPhoto ? "Replace Photo" : "Capture Photo";
  const workspacePhotoPanelEl = workspaceBatch && workspaceEggCode ? React.createElement("div", {
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
  }, workspaceEggCode), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: "#475569",
      fontWeight: 700
    }
  }, `${eggPhotoDayLabel(workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)} · ${workspaceIncubation?.currentStage?.label || "Candling"}`)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap",
      justifyContent: "flex-end"
    }
  }, React.createElement("div", {
    style: C.badge(workspaceEggState?.status === "hatched" ? "#15803d" : workspaceEggState?.status === "failed" ? "#b91c1c" : workspaceTodayPhoto ? "#1d4ed8" : "#b45309")
  }, workspaceEggState?.status === "hatched" ? "Hatched" : workspaceEggState?.status === "failed" ? "Failed" : workspaceTodayPhoto ? "Photo Ready" : "No Photo Yet"), React.createElement("button", {
    onClick: closeWorkspaceEggCapture,
    style: {
      ...C.sec,
      marginTop: 0
    }
  }, "Close"))), React.createElement("div", {
    style: {
      marginTop: 14,
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap"
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      opacity: workspaceEggIndex <= 0 || eggPhotoBusy ? 0.55 : 1
    },
    onClick: () => moveWorkspaceEgg(-1),
    disabled: workspaceEggIndex <= 0 || eggPhotoBusy
  }, "\u2190 Previous"), React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      opacity: workspaceEggIndex >= workspaceEggCount - 1 || eggPhotoBusy ? 0.55 : 1
    },
    onClick: () => moveWorkspaceEgg(1),
    disabled: workspaceEggIndex >= workspaceEggCount - 1 || eggPhotoBusy
  }, "Next \u2192")), !workspaceSelectedEggLoaded ? React.createElement("div", {
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
  }, "Loading photo slots...") : workspaceTodayPhoto ? React.createElement("div", {
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
  }, workspaceTodayPhoto.dataUrl ? React.createElement("img", {
    src: workspaceTodayPhoto.dataUrl,
    alt: `${workspaceEggCode} ${eggPhotoDayLabel(workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)}`,
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
  }, eggPhotoDayLabel(workspaceTodayPhoto.dayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS))), React.createElement("div", {
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
  }, "Current photo for today"), React.createElement("div", null, eggPhotoLongDate(workspaceTodayPhoto.takenAt) || "Unknown upload time"))) : React.createElement("div", {
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
  }, "Capture a candling photo for ", eggPhotoDayLabel(workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS), "."))), React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, workspaceIncubation?.isScheduled ? React.createElement("div", {
    style: {
      borderRadius: 16,
      border: "1px solid #fed7aa",
      background: "#fff7ed",
      padding: 14,
      color: "#9a3412",
      fontWeight: 700,
      lineHeight: 1.5
    }
  }, "Incubation starts ", fmtDate(workspaceIncubation.incubationStartDate), ". Capture opens when the batch is already on incubation.") : workspaceEggState?.status === "hatched" ? React.createElement("div", {
    style: {
      borderRadius: 16,
      border: "1px solid #bbf7d0",
      background: "#f0fdf4",
      padding: 14,
      color: "#166534",
      fontWeight: 700
    }
  }, "This egg is already marked hatched. Use the regular egg record if you need to edit history.") : workspaceEggState?.status === "failed" ? React.createElement("div", {
    style: {
      borderRadius: 16,
      border: "1px solid #fecaca",
      background: "#fef2f2",
      padding: 14,
      color: "#991b1b",
      fontWeight: 700
    }
  }, "This egg is already marked failed. Use the regular egg record if you need to edit history.") : React.createElement("button", {
    style: {
      ...C.btn,
      marginTop: 0,
      background: workspaceTodayPhoto ? "#1d4ed8" : "#b45309"
    },
    onClick: () => workspaceCamRef.current && workspaceCamRef.current.click(),
    disabled: workspaceCaptureDisabled
  }, eggPhotoBusy ? "Saving..." : workspaceCaptureLabel), React.createElement("input", {
    ref: workspaceCamRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    style: {
      display: "none"
    },
    onChange: handleWorkspaceCaptureFile,
    disabled: workspaceCaptureDisabled
  }), eggPhotoStatus.kind !== "idle" && React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 13,
      textAlign: "center",
      color: eggPhotoStatus.kind === "ok" ? "#15803d" : eggPhotoStatus.kind === "err" ? "#b91c1c" : "#475569",
      fontWeight: eggPhotoStatus.kind === "busy" ? 700 : 600
    }
  }, eggPhotoStatus.msg))) : null;
  const workspaceEggModalEl = workspaceEggCaptureOpen ? React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 330,
      background: "#0f172a7a",
      overflowY: "auto",
      padding: "20px 14px 28px"
    }
  }, React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: "0 auto"
    }
  }, workspacePhotoPanelEl)) : null;
  const candlingWorkspaceEl = workspace?.kind === "candling_capture" ? React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 320,
      background: "#eef3f9",
      overflowY: "auto",
      padding: "14px 14px 120px"
    }
  }, React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: "0 auto"
    }
  }, React.createElement("div", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 2,
      padding: "10px 0 14px",
      background: "linear-gradient(180deg,#eef3f9 82%,#eef3f900 100%)"
    }
  }, React.createElement("div", {
    style: {
      borderRadius: 24,
      border: "1px solid #d9e3ef",
      background: "#ffffff",
      padding: 16,
      boxShadow: "0 18px 34px -26px #00000088"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: ".08em",
      textTransform: "uppercase",
      color: "#64748b"
    }
  }, "Workspace"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 28,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "Candling Capture"), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 14,
      color: "#475569",
      lineHeight: 1.5
    }
  }, workspaceBatch ? `${workspaceBatch.code} · ${eggPhotoDayLabel(workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)} · ${workspaceCaptureStats.captured}/${workspaceCaptureStats.total} captured` : "Choose a batch, then tap an egg to capture today's candling photo.")), React.createElement("button", {
    onClick: closeWorkspace,
    style: {
      ...C.sec,
      marginTop: 0
    }
  }, "\u2715")))), !batches.length ? React.createElement(Empty, {
    icon: "\uD83E\uDD5A",
    msg: "Add a batch before using Candling Capture."
  }) : !workspaceBatch ? React.createElement("div", {
    style: {
      display: "grid",
      gap: 12
    }
  }, batches.map(batch => {
    const stats = batchStatsById.get(batch.id) || {
      pending: batch.eggCount || 0
    };
    const incubation = batchIncubationById.get(batch.id) || null;
    const batchNo = batchNoFromBatchCode(batch.code);
    const theme = batchTheme(batchNo);
    return React.createElement("button", {
      key: batch.id,
      onClick: () => selectWorkspaceBatch(batch),
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
    }, `${fmtNum(batch.eggCount || 0)} eggs · ${stats.pending || 0} pending`), React.createElement("div", {
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
  })) : React.createElement(React.Fragment, null, React.createElement("div", {
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
      alignItems: "flex-start",
      gap: 12,
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
  }, "Current Batch"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 24,
      fontWeight: 900,
      color: "#7c2d12"
    }
  }, workspaceBatch.code), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: "#9a3412",
      lineHeight: 1.5
    }
  }, `${fmtNum(workspaceCaptureStats.captured)} of ${fmtNum(workspaceCaptureStats.total)} eggs captured for ${eggPhotoDayLabel(workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS)}.`), workspaceCaptureStats.unresolved > 0 && React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#7c2d12",
      fontWeight: 700
    }
  }, `Loading ${workspaceCaptureStats.unresolved} remaining photo slot${workspaceCaptureStats.unresolved === 1 ? "" : "s"}...`)), React.createElement("button", {
    onClick: () => {
      resetEggPhotoUi();
      setWorkspace({
        kind: "candling_capture",
        batchId: "",
        idx: 0,
        eggOpen: false
      });
    },
    style: {
      ...C.sec,
      marginTop: 0
    }
  }, "Change Batch"))), React.createElement("div", {
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
  }, "Tap any egg to open capture")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      gap: 10,
      marginTop: 14
    }
  }, Array.from({
    length: workspaceEggCount
  }, (_, i) => {
    const code = eggCode(workspaceBatch.code, i);
    const state = eggStateById.get(code) || null;
    const photoLoaded = Object.prototype.hasOwnProperty.call(eggPhotoCache, code);
    const todayPhoto = photoLoaded ? findEggPhotoForDay(eggPhotoCache[code] || [], workspaceDayNumber, workspaceIncubation?.totalDays || EGG_PROGRESS_TOTAL_DAYS) : null;
    const isSelected = i === workspaceEggIndex;
    const isHatched = state?.status === "hatched";
    const isFailed = state?.status === "failed";
    const breedLabel = String(state?.breed || "").trim();
    const noteMeta = eggCardNoteMeta(state);
    return React.createElement("button", {
      key: code,
      onClick: () => openWorkspaceEggCapture(i),
      style: {
        border: `2px solid ${isSelected ? "#b45309" : isHatched ? "#86efac" : isFailed ? "#fca5a5" : todayPhoto ? "#93c5fd" : "#d9e3ef"}`,
        background: isSelected ? "#fff7ed" : isHatched ? "#f0fdf4" : isFailed ? "#fef2f2" : todayPhoto ? "#eff6ff" : "#ffffff",
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
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 4
      }
    }, React.createElement("span", {
      style: {
        fontSize: 18
      }
    }, isHatched ? "\uD83D\uDC23" : isFailed ? "\uD83D\uDC80" : todayPhoto ? "\uD83D\uDCF7" : "\uD83E\uDD5A"), noteMeta.hasNote && React.createElement("span", {
      title: noteMeta.label,
      ariaLabel: noteMeta.label,
      style: {
        fontSize: 10,
        lineHeight: 1,
        padding: "3px 4px",
        borderRadius: 999,
        background: "#ffffffcc",
        border: "1px solid #cbd5e1",
        color: "#475569"
      }
    }, "\uD83D\uDCDD")), React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 800,
        color: todayPhoto ? "#1d4ed8" : "#64748b"
      }
    }, todayPhoto ? "TODAY" : photoLoaded ? "EMPTY" : "...")), React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 900,
        color: "#0f172a",
        wordBreak: "break-all"
      }
    }, code.split("-").slice(1).join("-")), !!breedLabel && React.createElement("div", {
      title: breedLabel,
      style: {
        maxWidth: "100%",
        fontSize: 9,
        fontWeight: 700,
        color: "#7c2d12",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, breedLabel), React.createElement("div", {
      style: {
        fontSize: 10,
        fontWeight: 800,
        color: isHatched ? "#15803d" : isFailed ? "#b91c1c" : todayPhoto ? "#1d4ed8" : "#64748b"
      }
    }, isHatched ? "Hatched" : isFailed ? "Failed" : todayPhoto ? "Captured" : "Open"));
  })))), workspaceEggModalEl), workspaceBatch && workspaceEggCount > 0 && !workspaceEggCaptureOpen && React.createElement("div", {
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
      opacity: workspaceEggIndex <= 0 || eggPhotoBusy ? 0.55 : 1
    },
    onClick: () => moveWorkspaceEgg(-1),
    disabled: workspaceEggIndex <= 0 || eggPhotoBusy
  }, "\u2190 Previous"), React.createElement("button", {
    style: {
      ...C.sec,
      pointerEvents: "auto",
      background: "#ffffffee",
      backdropFilter: "blur(8px)",
      opacity: workspaceEggIndex >= workspaceEggCount - 1 || eggPhotoBusy ? 0.55 : 1
    },
    onClick: () => moveWorkspaceEgg(1),
    disabled: workspaceEggIndex >= workspaceEggCount - 1 || eggPhotoBusy
  }, "Next \u2192")))) : null;
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
  }, "\uD83E\uDD5A Hatchery"), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "flex-end"
    }
  }, React.createElement("button", {
    style: {
      ...C.sec,
      marginTop: 0,
      background: "#fff7ed",
      color: "#b45309",
      borderColor: "#fdba74"
    },
    onClick: () => launchCandlingWorkspace()
  }, "\uD83D\uDCF7 Candling Capture"), React.createElement("button", {
    style: {
      ...C.btn,
      width: "auto",
      marginTop: 0,
      padding: "12px 20px"
    },
    onClick: () => setShowNew(true)
  }, "+ New"))), batches.length > 0 && React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: 10,
      marginBottom: 12
    }
  }, [{
    label: "Total Eggs",
    value: fmtNum(hatcheryTotals.totalEggs),
    color: "#b45309"
  }, {
    label: "Hatched",
    value: fmtNum(hatcheryTotals.hatched),
    color: "#15803d"
  }, {
    label: "Failed",
    value: fmtNum(hatcheryTotals.failed),
    color: "#b91c1c"
  }, {
    label: "Pending",
    value: fmtNum(hatcheryTotals.pending),
    color: "#475569"
  }, {
    label: "Hatch Rate",
    value: fmtPct(hatcheryTotals.hatched, hatcheryTotals.totalEggs),
    color: "#0f766e"
  }, {
    label: "Fail Rate",
    value: fmtPct(hatcheryTotals.failed, hatcheryTotals.totalEggs),
    color: "#7c3aed"
  }].map(card => React.createElement("div", {
    key: card.label,
    style: {
      background: "#ffffff",
      border: "1px solid #d9e3ef",
      borderRadius: 14,
      padding: "12px 13px"
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
      fontSize: 24,
      fontWeight: 900,
      color: card.color,
      marginTop: 4
    }
  }, card.value)))), !batches.length && React.createElement(Empty, {
    icon: "\uD83E\uDD5A",
    msg: "No batches yet"
  }), batches.map(b => {
    const stats = batchStatsById.get(b.id) || {
      hatched: 0,
      failed: 0,
      pending: b.eggCount
    };
    const incubation = batchIncubationById.get(b.id) || null;
    const hatched = stats.hatched || 0;
    const failed = stats.failed || 0;
    const pending = stats.pending || 0;
    const age = Math.floor((Date.now() - new Date(b.collectedDate)) / 86400000);
    const bNo = batchNoFromBatchCode(b.code);
    const bt = batchTheme(bNo);
    const headerLeftEl = React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        color: bt.color
      }
    }, b.code), React.createElement("div", {
      style: {
        color: "#475569",
        fontSize: 14,
        marginTop: 2
      }
    }, "Collected ", fmtDate(b.collectedDate), " \xB7 ", age, "d ago"));
    const headerRightEl = React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, React.createElement("div", {
      style: {
        fontSize: 26,
        fontWeight: 900,
        color: bt.color
      }
    }, b.eggCount), React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#475569"
      }
    }, "eggs"), React.createElement("div", {
      style: {
        color: bt.color,
        fontSize: 13,
        fontWeight: 800,
        marginTop: 4
      }
    }, "Hatch ", fmtPct(hatched, b.eggCount), " · Fail ", fmtPct(failed, b.eggCount)));
    const headerEl = React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start"
      }
    }, headerLeftEl, headerRightEl);
    const incubationInfoEl = incubation ? React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        color: "#9a3412"
      }
    }, "Incubation"), React.createElement("div", {
      style: {
        marginTop: 3,
        fontSize: 15,
        fontWeight: 800,
        color: "#7c2d12"
      }
    }, incubation.isScheduled ? `Starts ${fmtDate(incubation.incubationStartDate)}` : `Day ${incubation.dayNumber} · ${incubation.currentStage?.humidity || "—"}`), React.createElement("div", {
      style: {
        marginTop: 2,
        fontSize: 13,
        color: "#9a3412"
      }
    }, incubation.currentStage?.shortLabel || "")) : null;
    const incubationDueEl = incubation?.expectedHatchDate ? React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: "#9a3412",
        alignSelf: "flex-start"
      }
    }, "Hatch due ", fmtDate(incubation.expectedHatchDate)) : null;
    const incubationEl = incubation && pending > 0 ? React.createElement("div", {
      style: {
        marginTop: 8,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #fed7aa",
        background: "#fff7ed"
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap"
      }
    }, incubationInfoEl, incubationDueEl)) : null;
    const footerEl = React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap"
      }
    }, React.createElement("span", {
      style: {
        fontSize: 14,
        color: "#15803d",
        fontWeight: 700
      }
    }, "\uD83D\uDC23 ", hatched), React.createElement("span", {
      style: {
        fontSize: 14,
        color: "#b91c1c",
        fontWeight: 700
      }
    }, "\uD83D\uDC80 ", failed), React.createElement("span", {
      style: {
        fontSize: 14,
        color: "#475569"
      }
    }, "\uD83E\uDD5A ", pending), React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        gap: 8
      }
    }, React.createElement("button", {
      style: bookmarkButtonStyle(!!b.bookmarked, {
        ...C.sm
      }),
      onClick: e => {
        e.stopPropagation();
        toggleBatchBookmark(b);
      }
    }, bookmarkButtonTheme(!!b.bookmarked).icon), React.createElement("button", {
      style: {
        ...C.sm,
        color: bt.color,
        borderColor: bt.border
      },
      onClick: e => {
        e.stopPropagation();
        setEf({
          date: b.collectedDate,
          incubationStartDate: b.incubationStartDate || b.collectedDate || "",
          count: String(b.eggCount),
          notes: b.notes || ""
        });
        setEditB(b);
      }
    }, "\u270E"), React.createElement("button", {
      style: C.del,
      onClick: e => {
        e.stopPropagation();
        onDelete(b.id);
      }
    }, "Delete")));
    return React.createElement("div", {
      key: b.id,
      style: {
        ...C.card,
        background: bt.soft,
        borderColor: bt.border,
        cursor: "pointer"
      },
      onClick: () => setGridB(b)
    }, headerEl, b.notes && React.createElement("div", {
      style: {
        color: "#475569",
        marginTop: 8,
        fontSize: 14
      }
    }, b.notes), incubationEl, React.createElement("div", {
      style: C.div
    }), footerEl);
  }), newBatchModal, editBatchModal, gridModalEl, eggActionModalEl, candlingWorkspaceEl);
}
