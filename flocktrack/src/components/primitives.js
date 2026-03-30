const FL = ({
  lbl,
  children
}) => React.createElement("div", null, React.createElement("label", {
  style: C.lbl
}, lbl), children);
class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      error
    };
  }
  componentDidCatch(error) {
    console.error(error);
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({
        error: null
      });
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (typeof this.props.renderFallback === "function") return this.props.renderFallback(this.state.error);
    return React.createElement("div", {
      style: C.card
    }, React.createElement("div", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: "#b91c1c"
      }
    }, "Screen Error"), React.createElement("div", {
      style: {
        marginTop: 8,
        color: "#475569",
        fontSize: 14,
        lineHeight: 1.45
      }
    }, this.state.error?.message || "This screen could not be rendered."));
  }
}
const Overlay = ({
  onClose,
  children
}) => {
  const [title, ...content] = React.Children.toArray(children);
  return React.createElement("div", {
    style: OVERLAY_WRAP_STYLE
  }, React.createElement("div", {
    style: OVERLAY_CARD_STYLE
  }, React.createElement("div", {
    style: OVERLAY_HEAD_STYLE
  }, React.createElement("span", {
    style: OVERLAY_TITLE_STYLE
  }, title), React.createElement("button", {
    onClick: onClose,
    style: C.sec
  }, "\u2715")), content));
};
const Modal = ({
  title,
  onClose,
  children
}) => {
  return React.createElement("div", {
    style: OVERLAY_WRAP_STYLE
  }, React.createElement("div", {
    style: OVERLAY_CARD_STYLE
  }, React.createElement("div", {
    style: OVERLAY_HEAD_STYLE
  }, React.createElement("span", {
    style: OVERLAY_TITLE_STYLE
  }, title), React.createElement("button", {
    onClick: onClose,
    style: C.sec
  }, "\u2715")), children));
};
const Empty = ({
  icon,
  msg
}) => React.createElement("div", {
  style: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#475569"
  }
}, React.createElement("div", {
  style: {
    fontSize: 48,
    marginBottom: 12
  }
}, icon), React.createElement("div", {
  style: {
    fontSize: 17,
    fontWeight: 600
  }
}, msg));
function MiniChart({
  data
}) {
  const W = 320;
  const H = 140;
  const P = 32;
  if (!data || data.length < 2) return React.createElement("div", {
    style: {
      height: H,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#475569"
    }
  }, "Need 2+ data points");
  const vs = data.map(d => d.v);
  const mn = Math.min(...vs);
  const mx = Math.max(...vs);
  const x = i => P + i / (data.length - 1) * (W - P * 2);
  const y = v => mx === mn ? H / 2 : P + (mx - v) / (mx - mn) * (H - P * 2);
  const pts = data.map((d, i) => `${x(i)},${y(d.v)}`).join(" ");
  return React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    style: {
      width: "100%",
      height: "auto",
      display: "block"
    }
  }, React.createElement("defs", null, React.createElement("linearGradient", {
    id: "cg",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, React.createElement("stop", {
    offset: "0%",
    stopColor: "#b45309",
    stopOpacity: ".25"
  }), React.createElement("stop", {
    offset: "100%",
    stopColor: "#b45309",
    stopOpacity: "0"
  }))), [.25, .5, .75].map((t, i) => React.createElement("line", {
    key: i,
    x1: P,
    x2: W - P,
    y1: P + t * (H - P * 2),
    y2: P + t * (H - P * 2),
    stroke: "#d9e3ef",
    strokeWidth: "1"
  })), React.createElement("polygon", {
    points: `${x(0)},${H - P} ${pts} ${x(data.length - 1)},${H - P}`,
    fill: "url(#cg)"
  }), React.createElement("polyline", {
    points: pts,
    fill: "none",
    stroke: "#b45309",
    strokeWidth: "2.5",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }), data.map((d, i) => React.createElement("circle", {
    key: i,
    cx: x(i),
    cy: y(d.v),
    r: "4.5",
    fill: "#b45309",
    stroke: "#ffffff",
    strokeWidth: "2"
  })), React.createElement("text", {
    x: P,
    y: H - 6,
    fontSize: "10",
    fill: "#475569"
  }, fmtDate(data[0].date)), React.createElement("text", {
    x: W - P,
    y: H - 6,
    fontSize: "10",
    fill: "#475569",
    textAnchor: "end"
  }, fmtDate(data[data.length - 1].date)));
}
