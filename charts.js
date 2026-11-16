// Hand-rolled SVG charts: line + area, bars, donut, sparkline. Animations via CSS classes.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#E87722";
  let gid = 0;
  function gradient(svg, opacity = 0.32) {
    const id = "g" + (++gid);
    const defs = el("defs", {}, svg);
    const lg = el("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0%", "stop-color": accent(), "stop-opacity": opacity }, lg);
    el("stop", { offset: "100%", "stop-color": accent(), "stop-opacity": 0 }, lg);
    return `url(#${id})`;
  }
  function smooth(pts) {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1] || pts[i], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[i + 2] || pts[i + 1];
      const c1x = x1 + (x2 - x0) / 6, c1y = y1 + (y2 - y0) / 6, c2x = x2 - (x3 - x1) / 6, c2y = y2 - (y3 - y1) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
    }
    return d;
  }
  function drawIn(path) { const len = path.getTotalLength ? path.getTotalLength() : 1000; path.style.setProperty("--len", len); path.classList.add("draw"); }

  function line(svg, data, { fmt = (v) => v, tip } = {}) {
    svg.innerHTML = "";
    const W = 640, H = 240, P = { l: 44, r: 12, t: 14, b: 26 };
    if (!data.length) return;
    const max = Math.max(1, ...data.map((d) => d.v)) * 1.12;
    const x = (i) => P.l + (data.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (data.length - 1));
    const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
    for (let i = 0; i <= 3; i++) {
      const v = (max / 3) * i, yy = y(v);
      el("line", { class: "gridline", x1: P.l, x2: W - P.r, y1: yy, y2: yy }, svg);
      el("text", { class: "axis", x: P.l - 8, y: yy + 3, "text-anchor": "end" }, svg).textContent = fmt(v, true);
    }
    data.forEach((d, i) => { el("text", { class: "axis", x: x(i), y: H - 6, "text-anchor": "middle" }, svg).textContent = d.label; });
    const pts = data.map((d, i) => [x(i), y(d.v)]);
    const fill = gradient(svg);
    const area = el("path", { d: smooth(pts) + ` L${pts[pts.length - 1][0]},${H - P.b} L${pts[0][0]},${H - P.b} Z`, fill, class: "fade" }, svg);
    area.style.opacity = 1;
    const ln = el("path", { d: smooth(pts), class: "line" }, svg); drawIn(ln);
    const last = pts[pts.length - 1]; el("circle", { cx: last[0], cy: last[1], r: 4.5, class: "dot fade" }, svg);
    const cursor = el("line", { class: "cursor", x1: 0, x2: 0, y1: P.t, y2: H - P.b, visibility: "hidden" }, svg);
    const step = data.length > 1 ? (W - P.l - P.r) / (data.length - 1) : W;
    data.forEach((d, i) => {
      const r = el("rect", { class: "hit", x: x(i) - step / 2, y: 0, width: step, height: H }, svg);
      r.addEventListener("mouseenter", () => {
        cursor.setAttribute("x1", x(i)); cursor.setAttribute("x2", x(i)); cursor.setAttribute("visibility", "visible");
        if (tip) { const box = svg.getBoundingClientRect(); tip.hidden = false; tip.style.left = (x(i) / W) * box.width + "px"; tip.style.top = (y(d.v) / H) * box.height + "px"; tip.innerHTML = `<b>${fmt(d.v)}</b>${d.full || d.label}`; }
      });
    });
    svg.addEventListener("mouseleave", () => { cursor.setAttribute("visibility", "hidden"); if (tip) tip.hidden = true; });
  }

  function bars(svg, data, { W = 300, H = 90 } = {}) {
    svg.innerHTML = "";
    if (!data.length) return;
    const max = Math.max(1, ...data.map((d) => d.v));
    const gap = 5, bw = (W - gap * (data.length - 1)) / data.length;
    data.forEach((d, i) => {
      const h = Math.max(2, (d.v / max) * (H - 16));
      const b = el("rect", { class: "bar grow" + (i === data.length - 1 ? " last" : ""), x: i * (bw + gap), y: H - 14 - h, width: bw, height: h, rx: 3 }, svg);
      b.style.animationDelay = i * 40 + "ms";
      const t = el("title", {}, b); t.textContent = `${d.label}: ${d.v}`;
      if (i === 0 || i === data.length - 1) el("text", { class: "axis", x: i * (bw + gap) + bw / 2, y: H - 2, "text-anchor": "middle" }, svg).textContent = d.label;
    });
  }

  function donut(svg, parts) {
    svg.innerHTML = "";
    const total = parts.reduce((a, p) => a + p.v, 0) || 1, r = 38, C = 2 * Math.PI * r;
    el("circle", { cx: 50, cy: 50, r, stroke: "var(--line)" }, svg);
    let off = 0;
    parts.forEach((p) => {
      const len = (p.v / total) * C;
      const c = el("circle", { cx: 50, cy: 50, r, stroke: p.color, class: "seg-arc", "stroke-dasharray": `${Math.max(0, len - 1.5)} ${C}`, "stroke-dashoffset": C }, svg);
      const target = -off; requestAnimationFrame(() => requestAnimationFrame(() => c.setAttribute("stroke-dashoffset", target)));
      off += len;
    });
  }

  function spark(svg, values) {
    svg.innerHTML = "";
    if (!values || values.length < 2) return;
    const W = 120, H = 32, max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
    const pts = values.map((v, i) => [(i * W) / (values.length - 1), H - 3 - ((v - min) / span) * (H - 8)]);
    const fill = gradient(svg, 0.22);
    el("path", { d: smooth(pts) + ` L${W},${H} L0,${H} Z`, fill, class: "fade" }, svg);
    const ln = el("path", { d: smooth(pts), fill: "none", stroke: "var(--accent)", "stroke-width": 1.4 }, svg); drawIn(ln);
  }

  window.HQCharts = { line, bars, donut, spark };
})();
