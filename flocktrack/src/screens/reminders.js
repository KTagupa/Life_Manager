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
