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
