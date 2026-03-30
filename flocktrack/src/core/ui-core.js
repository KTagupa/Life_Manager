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
    paddingBottom: "calc(92px + env(safe-area-inset-bottom, 0px))"
  },
  bar: {
    background: "#ffffff",
    borderBottom: "1px solid #d9e3ef",
    padding: "calc(14px + env(safe-area-inset-top, 0px)) 18px 14px",
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
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
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
