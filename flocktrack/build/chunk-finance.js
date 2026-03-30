// Generated bundle: build/chunk-finance.js. Edit source files, then run npm run build.

/* FILE: src/screens/finance.js */
function financeScreenMonthFallback(value) {
  const text = String(value == null ? "" : value).trim();
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  const day = typeof globalThis.FlockTrackLogic?.normalizeDay === "function" ? globalThis.FlockTrackLogic.normalizeDay(text) : "";
  return day ? day.slice(0, 7) : today().slice(0, 7);
}

function financeScreenShiftMonth(monthValue, delta) {
  const shiftMonth = globalThis.FlockTrackLogic?.shiftFinanceMonth;
  if (typeof shiftMonth === "function") return shiftMonth(monthValue, delta) || financeScreenMonthFallback(monthValue);
  const month = financeScreenMonthFallback(monthValue);
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return today().slice(0, 7);
  return new Date(Date.UTC(year, monthIndex + (Number(delta) || 0), 1)).toISOString().slice(0, 7);
}

function financeScreenMonthTitle(monthValue) {
  const monthTitle = globalThis.FlockTrackLogic?.financeMonthTitle;
  if (typeof monthTitle === "function") return monthTitle(monthValue) || financeScreenMonthFallback(monthValue);
  const month = financeScreenMonthFallback(monthValue);
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return month;
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function financeFreshForm(type = "expense") {
  const options = globalThis.FlockTrackLogic?.FINANCE_MANUAL_CATEGORY_OPTIONS?.[type] || [];
  const defaultExpenseCategory = options.find(option => option.id === "other_expense")?.id;
  return {
    date: today(),
    type,
    category: type === "expense" ? defaultExpenseCategory || options[0]?.id || "" : options[0]?.id || "",
    amount: "",
    description: "",
    notes: "",
    feedTypeId: "",
    quantity: "",
    unit: "kg",
    sackKg: ""
  };
}

function financeFormatQuantity(value, unit) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return "";
  return `${fmtNum(quantity)} ${unit || ""}`.trim();
}

function financeFeedPriceText(row) {
  const parts = [];
  if (Number.isFinite(Number(row.unitPrice)) && row.unit) parts.push(`${fmtMoney(row.unitPrice)}/${row.unit}`);
  if (Number.isFinite(Number(row.pricePerKg)) && row.unit !== "kg") parts.push(`${fmtMoney(row.pricePerKg)}/kg`);
  return parts.join(" · ");
}

function FinanceStatCard({
  label,
  value,
  note,
  color,
  background,
  borderColor
}) {
  return React.createElement("div", {
    style: {
      background,
      border: `1px solid ${borderColor}`,
      borderRadius: 14,
      padding: "14px 15px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: ".06em",
      fontWeight: 800
    }
  }, label), React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 24,
      fontWeight: 900,
      color,
      lineHeight: 1.1
    }
  }, value), React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 12,
      color: "#475569",
      lineHeight: 1.35,
      minHeight: 32
    }
  }, note || " "));
}

function FinanceCategoryGroup({
  title,
  tone,
  rows,
  emptyLabel
}) {
  const items = Array.isArray(rows) ? rows : [];
  return React.createElement("div", {
    style: {
      ...C.card,
      padding: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 900,
      color: tone,
      letterSpacing: ".05em",
      textTransform: "uppercase",
      marginBottom: 12
    }
  }, title), !items.length ? React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#64748b",
      lineHeight: 1.4
    }
  }, emptyLabel) : items.map(row => React.createElement("div", {
    key: row.category,
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "center",
      padding: "10px 0",
      borderTop: row === items[0] ? "none" : "1px solid #e2e8f0"
    }
  }, React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, row.label), React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 12,
      color: "#64748b"
    }
  }, fmtNum(row.count), " entr", row.count === 1 ? "y" : "ies")), React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: tone,
      whiteSpace: "nowrap"
    }
  }, fmtMoney(row.amount)))));
}

function FinanceLedgerRow({
  row,
  onEdit,
  onDelete,
  deleting
}) {
  const sourceTone = row.source === "bird_sale" ? "#047857" : "#1d4ed8";
  const typeTone = row.type === "income" ? "#047857" : "#b91c1c";
  const feedDetail = row.category === "feed" ? [row.feedTypeName || "", financeFormatQuantity(row.quantity, row.unit), financeFeedPriceText(row)].filter(Boolean).join(" · ") : "";
  return React.createElement("div", {
    style: {
      ...C.card,
      padding: 14,
      marginBottom: 10,
      borderColor: row.locked ? "#bbf7d0" : "#d9e3ef",
      background: row.locked ? "#f0fdf4" : "#ffffff"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "flex-start"
    }
  }, React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: C.badge(sourceTone)
  }, row.source === "bird_sale" ? "Bird sale" : "Manual"), React.createElement("span", {
    style: C.badge(typeTone)
  }, humanize(row.type || ""))), React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: "#0f172a",
      lineHeight: 1.25
    }
  }, row.description || row.categoryLabel || humanize(row.category || "Finance")), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.4
    }
  }, [row.categoryLabel || humanize(row.category || ""), fmtDate(row.date)].filter(Boolean).join(" · ")), !!feedDetail && React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: "#475569",
      lineHeight: 1.45
    }
  }, feedDetail), !!row.notes && React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 12,
      color: "#64748b",
      lineHeight: 1.45
    }
  }, row.notes)), React.createElement("div", {
    style: {
      textAlign: "right",
      flexShrink: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: typeTone,
      whiteSpace: "nowrap"
    }
  }, row.type === "expense" ? "-" : "+", fmtMoney(row.amount)), !row.locked && React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      justifyContent: "flex-end",
      marginTop: 10
    }
  }, React.createElement("button", {
    type: "button",
    style: {
      ...C.sm,
      color: "#1d4ed8",
      borderColor: "#93c5fd",
      background: "#eff6ff"
    },
    onClick: onEdit
  }, "Edit"), React.createElement("button", {
    type: "button",
    style: C.del,
    onClick: onDelete
  }, deleting ? "Deleting..." : "Delete")))));
}

function FinanceTab({
  birds,
  feedTypes,
  financeEntries,
  onAddFinanceEntry,
  onUpdateFinanceEntry,
  onDeleteFinanceEntry
}) {
  const financeLogic = globalThis.FlockTrackLogic || {};
  const buildFinanceLedgerRows = financeLogic.buildFinanceLedger;
  const filterFinanceRowsByMonth = financeLogic.filterFinanceRowsByMonth;
  const summarizeFinanceRows = financeLogic.summarizeFinanceRows;
  const rollupFinanceCategories = financeLogic.rollupFinanceCategories;
  const manualCategoryOptions = financeLogic.FINANCE_MANUAL_CATEGORY_OPTIONS || {
    income: [],
    expense: []
  };
  const feedUnitOptions = financeLogic.FINANCE_FEED_UNIT_OPTIONS || [{
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
  const buildFeedExpenseMetrics = financeLogic.buildFeedExpenseMetrics;
  const categoryLabel = financeLogic.financeCategoryLabel || (value => humanize(value || ""));
  birds = Array.isArray(birds) ? birds : [];
  feedTypes = Array.isArray(feedTypes) ? feedTypes.filter(item => item && typeof item === "object") : [];
  financeEntries = Array.isArray(financeEntries) ? financeEntries.filter(entry => entry && typeof entry === "object") : [];
  const [month, setMonth] = useState(() => financeScreenMonthFallback(today()));
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(() => financeFreshForm("expense"));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const feedTypeById = useMemo(() => new Map(feedTypes.map(feedType => [feedType.id, feedType])), [feedTypes]);
  const financeEntryById = useMemo(() => new Map(financeEntries.map(entry => [entry.id, entry])), [financeEntries]);
  const formCategoryOptions = useMemo(() => manualCategoryOptions[form.type] || [], [form.type, manualCategoryOptions]);
  const isFeedExpenseForm = form.type === "expense" && form.category === "feed";
  const selectedFeedType = isFeedExpenseForm ? feedTypeById.get(form.feedTypeId) || null : null;
  useEffect(() => {
    if (!formCategoryOptions.length) return;
    if (formCategoryOptions.some(option => option.id === form.category)) return;
    setForm(prev => ({
      ...prev,
      category: formCategoryOptions[0]?.id || ""
    }));
  }, [form.category, formCategoryOptions]);
  useEffect(() => {
    if (!isFeedExpenseForm) return;
    if (!feedTypes.length) return;
    if (form.feedTypeId && feedTypeById.has(form.feedTypeId)) return;
    setForm(prev => ({
      ...prev,
      feedTypeId: feedTypes[0]?.id || ""
    }));
  }, [feedTypeById, feedTypes, form.feedTypeId, isFeedExpenseForm]);
  useEffect(() => {
    if (!isFeedExpenseForm || form.unit !== "sack") return;
    const defaultSackKg = selectedFeedType?.sackKg != null && selectedFeedType.sackKg !== "" ? String(selectedFeedType.sackKg) : "";
    if (!defaultSackKg || form.sackKg) return;
    setForm(prev => ({
      ...prev,
      sackKg: defaultSackKg
    }));
  }, [form.sackKg, form.unit, isFeedExpenseForm, selectedFeedType?.sackKg]);
  const ledgerRows = useMemo(() => typeof buildFinanceLedgerRows === "function" ? buildFinanceLedgerRows({
    birds,
    financeEntries
  }).map(row => ({
    ...row,
    categoryLabel: categoryLabel(row.category),
    feedTypeName: row.feedTypeId ? feedTypeById.get(row.feedTypeId)?.name || "" : ""
  })) : [], [birds, buildFinanceLedgerRows, categoryLabel, feedTypeById, financeEntries]);
  const monthRows = useMemo(() => typeof filterFinanceRowsByMonth === "function" ? filterFinanceRowsByMonth(ledgerRows, month) : ledgerRows.filter(row => String(row?.date || "").slice(0, 7) === month), [filterFinanceRowsByMonth, ledgerRows, month]);
  const monthFeedRows = useMemo(() => monthRows.filter(row => row.category === "feed" && row.source === "manual"), [monthRows]);
  const feedPricePreview = useMemo(() => typeof buildFeedExpenseMetrics === "function" ? buildFeedExpenseMetrics({
    type: form.type,
    category: form.category,
    amount: form.amount,
    feedTypeId: form.feedTypeId,
    quantity: form.quantity,
    unit: form.unit,
    sackKg: form.unit === "sack" ? form.sackKg || selectedFeedType?.sackKg || null : null
  }) : null, [buildFeedExpenseMetrics, form.amount, form.category, form.feedTypeId, form.quantity, form.sackKg, form.type, form.unit, selectedFeedType?.sackKg]);
  const summary = useMemo(() => typeof summarizeFinanceRows === "function" ? summarizeFinanceRows(monthRows) : {
    income: 0,
    expenses: 0,
    net: 0,
    transactions: monthRows.length
  }, [monthRows, summarizeFinanceRows]);
  const categoryRollups = useMemo(() => typeof rollupFinanceCategories === "function" ? rollupFinanceCategories(monthRows) : {
    income: [],
    expense: []
  }, [monthRows, rollupFinanceCategories]);
  const feedPricePreviewText = [selectedFeedType?.name || "", financeFormatQuantity(feedPricePreview?.quantity, feedPricePreview?.unit), financeFeedPriceText(feedPricePreview || {})].filter(Boolean).join(" · ") || "Enter quantity and amount to see computed price per unit.";
  const feedPriceHistorySection = React.createElement("div", {
    style: {
      ...C.card,
      padding: 16,
      background: "#fffdf5",
      borderColor: "#f5deb3"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#9a3412",
      marginBottom: 6
    }
  }, "Feed Price History"), React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#64748b",
      lineHeight: 1.45,
      marginBottom: 12
    }
  }, "Feed purchases now record the type, quantity, unit, and computed price per unit so price changes are visible over time."), !monthFeedRows.length ? React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#64748b"
    }
  }, "No feed expenses recorded in this month yet.") : monthFeedRows.slice(0, 8).map(row => React.createElement("div", {
    key: row.id,
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "flex-start",
      padding: "10px 0",
      borderTop: row === monthFeedRows[0] ? "none" : "1px solid #f1e3c3"
    }
  }, React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: "#0f172a"
    }
  }, row.feedTypeName || "Feed"), React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 12,
      color: "#475569",
      lineHeight: 1.4
    }
  }, [fmtDate(row.date), financeFormatQuantity(row.quantity, row.unit), row.sackKg ? `${fmtNum(row.sackKg)} kg/sack` : ""].filter(Boolean).join(" · "))), React.createElement("div", {
    style: {
      textAlign: "right",
      flexShrink: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: "#9a3412"
    }
  }, financeFeedPriceText(row) || fmtMoney(row.amount)), React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 12,
      color: "#64748b"
    }
  }, fmtMoney(row.amount))))));
  const feedExpenseFields = !isFeedExpenseForm ? null : React.createElement("div", {
    style: {
      marginTop: 16,
      padding: 14,
      borderRadius: 12,
      border: "1px solid #f5d7b0",
      background: "#fff7ec"
    }
  }, !feedTypes.length ? React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#9a3412",
      lineHeight: 1.45
    }
  }, "Create a feed type in Pens before saving a feed expense.") : React.createElement(React.Fragment, null, React.createElement(FL, {
    lbl: "Feed Type"
  }, React.createElement("select", {
    style: C.sel,
    value: form.feedTypeId,
    onChange: e => setForm(prev => ({
      ...prev,
      feedTypeId: e.target.value,
      sackKg: prev.unit === "sack" && !String(prev.sackKg || "").trim() ? String(feedTypeById.get(e.target.value)?.sackKg || "") : prev.sackKg
    }))
  }, feedTypes.map(feedType => React.createElement("option", {
    key: feedType.id,
    value: feedType.id
  }, feedType.name || "Feed Type")))), React.createElement(FL, {
    lbl: "Quantity"
  }, React.createElement("input", {
    type: "number",
    min: "0.01",
    step: "0.01",
    inputMode: "decimal",
    style: C.inp,
    value: form.quantity,
    onChange: e => setForm(prev => ({
      ...prev,
      quantity: e.target.value
    })),
    placeholder: "0.00"
  })), React.createElement(FL, {
    lbl: "Unit"
  }, React.createElement("select", {
    style: C.sel,
    value: form.unit,
    onChange: e => setForm(prev => ({
      ...prev,
      unit: e.target.value,
      sackKg: e.target.value === "sack" ? String(prev.sackKg || selectedFeedType?.sackKg || "") : ""
    }))
  }, feedUnitOptions.map(option => React.createElement("option", {
    key: option.id,
    value: option.id
  }, option.label)))), form.unit === "sack" ? React.createElement(FL, {
    lbl: "Kg Per Sack"
  }, React.createElement("input", {
    type: "number",
    min: "0.01",
    step: "0.01",
    inputMode: "decimal",
    style: C.inp,
    value: form.sackKg,
    onChange: e => setForm(prev => ({
      ...prev,
      sackKg: e.target.value
    })),
    placeholder: selectedFeedType?.sackKg ? String(selectedFeedType.sackKg) : "Optional"
  })) : null, React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 12,
      color: "#9a3412",
      lineHeight: 1.45
    }
  }, feedPricePreviewText)));
  function closeForm() {
    setFormOpen(false);
    setEditingId("");
    setSaving(false);
    setForm(financeFreshForm("expense"));
  }
  function openCreateForm() {
    setEditingId("");
    setForm(financeFreshForm("expense"));
    setFormOpen(true);
  }
  function openEditForm(entry) {
    if (!entry?.id) return;
    setEditingId(entry.id);
    setForm({
      date: entry.date || today(),
      type: entry.type === "income" ? "income" : "expense",
      category: entry.category || "",
      amount: entry.amount == null ? "" : String(entry.amount),
      description: String(entry.description || ""),
      notes: String(entry.notes || ""),
      feedTypeId: String(entry.feedTypeId || ""),
      quantity: entry.quantity == null ? "" : String(entry.quantity),
      unit: String(entry.unit || "kg"),
      sackKg: entry.sackKg == null ? "" : String(entry.sackKg)
    });
    setFormOpen(true);
  }
  async function saveFinanceEntry() {
    const normalizedDate = typeof financeLogic.normalizeDay === "function" ? financeLogic.normalizeDay(form.date) : String(form.date || "").trim();
    if (!normalizedDate) {
      window.alert("Entry date is required.");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Amount must be a valid number greater than zero.");
      return;
    }
    const type = form.type === "income" ? "income" : "expense";
    const allowedCategoryIds = new Set((manualCategoryOptions[type] || []).map(option => option.id));
    const category = String(form.category || "").trim();
    if (!allowedCategoryIds.has(category)) {
      window.alert("Choose a valid finance category.");
      return;
    }
    let feedPayload = {
      feedTypeId: "",
      quantity: null,
      unit: "",
      sackKg: null
    };
    if (type === "expense" && category === "feed") {
      if (!feedTypes.length) {
        window.alert("Create a feed type in Pens before saving a feed expense.");
        return;
      }
      const feedTypeId = String(form.feedTypeId || "").trim();
      const feedType = feedTypeById.get(feedTypeId);
      if (!feedType) {
        window.alert("Choose a valid feed type.");
        return;
      }
      const quantity = Number(form.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        window.alert("Feed quantity must be a valid number greater than zero.");
        return;
      }
      const unit = feedUnitOptions.some(option => option.id === form.unit) ? form.unit : "";
      if (!unit) {
        window.alert("Choose a valid feed unit.");
        return;
      }
      const rawSackKg = String(form.sackKg || "").trim();
      const defaultSackKg = feedType?.sackKg != null && feedType.sackKg !== "" ? Number(feedType.sackKg) : null;
      let sackKg = null;
      if (unit === "sack") {
        const parsedSackKg = rawSackKg ? Number(rawSackKg) : defaultSackKg;
        if (Number.isFinite(parsedSackKg) && parsedSackKg > 0) sackKg = parsedSackKg;
      }
      feedPayload = {
        feedTypeId,
        quantity,
        unit,
        sackKg
      };
    }
    const nowIso = new Date().toISOString();
    const existing = editingId ? financeEntryById.get(editingId) : null;
    const payload = {
      id: existing?.id || uid(),
      date: normalizedDate,
      type,
      category,
      amount,
      description: String(form.description || "").trim(),
      notes: String(form.notes || "").trim(),
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      ...feedPayload
    };
    setSaving(true);
    try {
      if (existing) await Promise.resolve(onUpdateFinanceEntry?.(payload));else await Promise.resolve(onAddFinanceEntry?.(payload));
      setMonth(financeScreenMonthFallback(payload.date));
      closeForm();
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Could not save finance entry. Please try again.");
      setSaving(false);
    }
  }
  async function deleteFinanceEntry(row) {
    if (!row?.sourceId || row.locked || deletingId) return;
    const ok = window.confirm(`Delete "${row.description || row.categoryLabel || "this finance entry"}"?`);
    if (!ok) return;
    setDeletingId(row.sourceId);
    try {
      await Promise.resolve(onDeleteFinanceEntry?.(row.sourceId));
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Could not delete finance entry. Please try again.");
    } finally {
      setDeletingId("");
    }
  }
  return React.createElement("div", {
    style: C.body
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      padding: "20px 0 14px"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "💸 Finance"), React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.4
    }
  }, "Monthly poultry profit and loss with bird sales plus manual finance entries.")), React.createElement("button", {
    type: "button",
    style: {
      ...C.sec,
      color: "#047857",
      borderColor: "#86efac",
      background: "#ecfdf5"
    },
    onClick: openCreateForm
  }, "Add Entry")), React.createElement("div", {
    style: {
      ...C.card,
      padding: 14,
      background: "#fff7ed",
      borderColor: "#fed7aa"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, React.createElement("button", {
    type: "button",
    style: C.sec,
    onClick: () => setMonth(prev => financeScreenShiftMonth(prev, -1))
  }, "← Previous"), React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#9a3412"
    }
  }, financeScreenMonthTitle(month)), React.createElement("button", {
    type: "button",
    style: C.sec,
    onClick: () => setMonth(prev => financeScreenShiftMonth(prev, 1))
  }, "Next →"))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: 10,
      marginBottom: 14
    }
  }, React.createElement(FinanceStatCard, {
    label: "Income",
    value: fmtMoney(summary.income),
    note: summary.income > 0 ? `${fmtNum(categoryRollups.income.length)} income categor${categoryRollups.income.length === 1 ? "y" : "ies"}` : "No income recorded this month",
    color: "#047857",
    background: "#ecfdf5",
    borderColor: "#86efac"
  }), React.createElement(FinanceStatCard, {
    label: "Expenses",
    value: fmtMoney(summary.expenses),
    note: summary.expenses > 0 ? `${fmtNum(categoryRollups.expense.length)} expense categor${categoryRollups.expense.length === 1 ? "y" : "ies"}` : "No expenses recorded this month",
    color: "#b91c1c",
    background: "#fff1f2",
    borderColor: "#fda4af"
  }), React.createElement(FinanceStatCard, {
    label: "Net",
    value: fmtMoney(summary.net),
    note: summary.net >= 0 ? "Profit for the selected month" : "Loss for the selected month",
    color: summary.net >= 0 ? "#047857" : "#b91c1c",
    background: summary.net >= 0 ? "#f0fdf4" : "#fff7ed",
    borderColor: summary.net >= 0 ? "#86efac" : "#fdba74"
  }), React.createElement(FinanceStatCard, {
    label: "Transactions",
    value: fmtNum(summary.transactions),
    note: `${fmtNum(monthRows.filter(row => row.source === "bird_sale").length)} auto bird sale entr${monthRows.filter(row => row.source === "bird_sale").length === 1 ? "y" : "ies"}`,
    color: "#1d4ed8",
    background: "#eff6ff",
    borderColor: "#93c5fd"
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: 12,
      marginBottom: 14
    }
  }, React.createElement(FinanceCategoryGroup, {
    title: "Income Categories",
    tone: "#047857",
    rows: categoryRollups.income,
    emptyLabel: "No income categories in this month yet."
  }), React.createElement(FinanceCategoryGroup, {
    title: "Expense Categories",
    tone: "#b91c1c",
    rows: categoryRollups.expense,
    emptyLabel: "No expense categories in this month yet."
  })), feedPriceHistorySection, React.createElement("div", {
    style: {
      ...C.card,
      background: "#f8fafc"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: "#0f172a"
    }
  }, "Transactions"), React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#64748b",
      fontWeight: 700
    }
  }, financeScreenMonthTitle(month))), React.createElement("div", {
    style: {
      marginBottom: 12,
      fontSize: 13,
      color: "#475569",
      lineHeight: 1.45
    }
  }, "Bird sale rows are read-only and come from sold birds with a recorded sale price."), !monthRows.length ? React.createElement(Empty, {
    icon: "💸",
    msg: "No finance entries for this month"
  }) : monthRows.map(row => React.createElement(FinanceLedgerRow, {
    key: row.id,
    row,
    deleting: deletingId === row.sourceId,
    onEdit: () => openEditForm(financeEntryById.get(row.sourceId)),
    onDelete: () => deleteFinanceEntry(row)
  }))), formOpen && React.createElement(Modal, {
    title: editingId ? "Edit Finance Entry" : "Add Finance Entry",
    onClose: closeForm
  }, React.createElement(FL, {
    lbl: "Date"
  }, React.createElement("input", {
    type: "date",
    style: C.inp,
    value: form.date,
    onChange: e => setForm(prev => ({
      ...prev,
      date: e.target.value
    }))
  })), React.createElement(FL, {
    lbl: "Type"
  }, React.createElement("select", {
    style: C.sel,
    value: form.type,
    onChange: e => setForm(prev => ({
      ...prev,
      type: e.target.value === "income" ? "income" : "expense"
    }))
  }, React.createElement("option", {
    value: "expense"
  }, "Expense"), React.createElement("option", {
    value: "income"
  }, "Income"))), React.createElement(FL, {
    lbl: "Category"
  }, React.createElement("select", {
    style: C.sel,
    value: form.category,
    onChange: e => setForm(prev => ({
      ...prev,
      category: e.target.value
    }))
  }, formCategoryOptions.map(option => React.createElement("option", {
    key: option.id,
    value: option.id
  }, option.label)))), feedExpenseFields, React.createElement(FL, {
    lbl: "Amount"
  }, React.createElement("input", {
    type: "number",
    min: "0.01",
    step: "0.01",
    inputMode: "decimal",
    style: C.inp,
    value: form.amount,
    onChange: e => setForm(prev => ({
      ...prev,
      amount: e.target.value
    })),
    placeholder: "0.00"
  })), React.createElement(FL, {
    lbl: "Description"
  }, React.createElement("input", {
    style: C.inp,
    value: form.description,
    onChange: e => setForm(prev => ({
      ...prev,
      description: e.target.value
    })),
    placeholder: "Optional short description"
  })), React.createElement(FL, {
    lbl: "Notes"
  }, React.createElement("textarea", {
    style: C.ta,
    value: form.notes,
    onChange: e => setForm(prev => ({
      ...prev,
      notes: e.target.value
    })),
    placeholder: "Optional notes"
  })), React.createElement("button", {
    type: "button",
    style: C.btn,
    onClick: saveFinanceEntry,
    disabled: saving
  }, saving ? "Saving..." : editingId ? "Save Changes" : "Save Entry")));
}
