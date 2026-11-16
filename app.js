// Level Up HQ app: sign-in, render, interactions.
(function () {
  const CFG = window.HQ_CONFIG, D = window.HQData, C = window.HQCharts;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n, short) => short && Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : "$" + Math.round(n).toLocaleString("en-US");
  const fdate = (d, opts = { month: "short", day: "numeric" }) => (d ? d.toLocaleDateString("en-US", opts) : "");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DEMO = new URLSearchParams(location.search).has("demo");
  const PLAN_COLORS = { Pro: "var(--accent)", Compete: "color-mix(in srgb, var(--accent) 55%, var(--tile))", Elite: "color-mix(in srgb, var(--fg) 55%, transparent)", "Free Elite": "color-mix(in srgb, var(--fg) 22%, transparent)" };

  let token = null, tokenClient = null, model = null, raw = null, lastSync = null, range = 6, firstRender = true;
  const filt = { coach: "", plan: "" };

  // ---------- gate / auth ----------
  function gate(state, msg) {
    $("#gate").hidden = false; $("#app").hidden = true;
    const t = $("#gate-title"), s = $("#gate-sub"), b = $("#signin"), err = $("#gate-err");
    err.hidden = true;
    if (state === "setup") { t.textContent = "Almost ready"; s.textContent = "This dashboard needs its Google sign-in key before it can read the Level Up HQ sheet. Follow SETUP.md, then paste the client ID into config.js."; b.hidden = true; }
    else if (state === "loading") { t.textContent = "Opening HQ"; s.textContent = "Reading the Level Up HQ sheet."; b.hidden = true; }
    else { t.textContent = "Sign in to open HQ"; b.hidden = false; }
    if (msg) { err.textContent = msg; err.hidden = false; }
  }
  function loadGis() {
    return new Promise((res, rej) => { if (window.google?.accounts?.oauth2) return res(); const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = res; s.onerror = () => rej(new Error("Couldn't load Google sign-in.")); document.head.appendChild(s); });
  }
  async function initAuth() {
    if (DEMO) { $("#demo-banner").hidden = false; $("#signout").hidden = true; raw = D.sample(); return show(); }
    if (!CFG.GOOGLE_CLIENT_ID || /PASTE/.test(CFG.GOOGLE_CLIENT_ID)) return gate("setup");
    gate("signin");
    try {
      await loadGis();
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CFG.GOOGLE_CLIENT_ID, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        callback: async (resp) => { if (resp.error) return gate("signin", "Sign-in didn't finish. Try again."); token = resp.access_token; await refresh(true); },
      });
    } catch (e) { gate("signin", e.message); }
  }
  $("#signin").addEventListener("click", () => tokenClient && tokenClient.requestAccessToken({ prompt: "" }));
  $("#signout").addEventListener("click", () => { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); token = null; model = null; gate("signin"); });

  async function refresh(fromGate) {
    if (DEMO) { raw = D.sample(); return show(); }
    if (!token) return;
    if (fromGate) gate("loading");
    setSync("Syncing", false);
    try { raw = await D.fetchSheet(token); show(); }
    catch (e) {
      if (e.code === 401) { token = null; tokenClient.requestAccessToken({ prompt: "" }); return; }
      if (fromGate || !model) gate("signin", e.message); else setSync("Couldn't refresh", true);
    }
  }
  function show() {
    model = D.build(raw);
    lastSync = new Date();
    $("#gate").hidden = true; $("#app").hidden = false;
    fillCoachFilter(); render(); tickSync();
  }

  // ---------- sync indicator ----------
  function setSync(text, stale) { $("#sync-text").textContent = text; $("#sync").classList.toggle("stale", !!stale); }
  function tickSync() {
    if (!lastSync) return;
    const m = Math.floor((Date.now() - lastSync) / 60000);
    setSync(m < 1 ? "Synced just now" : `Synced ${m} min ago`, m > 30);
  }
  setInterval(tickSync, 30000);
  setInterval(() => { if (model && document.visibilityState === "visible") refresh(false); }, CFG.REFRESH_MINUTES * 60000);
  $("#sync").addEventListener("click", () => refresh(false));

  // ---------- filters ----------
  function fillCoachFilter() {
    const sel = $("#f-coach"); const cur = sel.value;
    const names = [...new Set(model.clients.filter((c) => c.active && c.coach).map((c) => c.coach))].sort();
    sel.innerHTML = '<option value="">All coaches</option>' + names.map((n) => `<option${n === cur ? " selected" : ""}>${esc(n)}</option>`).join("");
  }
  $("#f-coach").addEventListener("change", (e) => { filt.coach = e.target.value; render(); });
  $("#f-plan").addEventListener("change", (e) => { filt.plan = e.target.value; render(); });
  const passC = (c) => (!filt.coach || c.coach === filt.coach) && (!filt.plan || c.planKey === filt.plan || (filt.plan === "Elite" && c.plan === "Elite" && c.planKey === "Elite"));

  // ---------- derived ----------
  function derive() {
    const m = model, t = m.today;
    const cl = m.clients.filter(passC);
    const act = cl.filter((c) => c.active);
    const people = new Map(); act.forEach((c) => { const p = people.get(c.email); if (!p || rank(c.planKey) > rank(p.planKey)) people.set(c.email, c); });
    const persons = [...people.values()];
    const renew7 = persons.filter((c) => c.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);
    const notLogged = m.portalLive ? persons.filter((c) => { const p = m.portal.get(c.email); return !p || !p.loggedIn; }) : null;
    // orders filtered by coach/plan
    const ord = m.orders.filter((o) => (!filt.coach || o.coach === filt.coach) && (!filt.plan || o.plan === filt.plan.replace("Free ", "")));
    const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString("en-US", { month: "short" }), full: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }), v: 0 }); }
    ord.forEach((o) => { const mm = months.find((x) => x.y === o.date.getFullYear() && x.m === o.date.getMonth()); if (mm) mm.v += o.net; });
    // Month to date vs the same days of last month (a fair comparison mid-month).
    const lm = months[10];
    const lastMtd = ord.filter((o) => o.date.getFullYear() === lm.y && o.date.getMonth() === lm.m && o.date.getDate() <= t.getDate()).reduce((a, o) => a + o.net, 0);
    // new players per week (first order per email)
    const firstOrder = new Map(); [...m.orders].sort((a, b) => a.date - b.date).forEach((o) => { if (!firstOrder.has(o.email)) firstOrder.set(o.email, o); });
    const weeks = []; for (let i = 9; i >= 0; i--) { const s = new Date(t - (t.getDay() + 6) % 7 * D.DAY - i * 7 * D.DAY); weeks.push({ s, label: fdate(s), v: 0 }); }
    [...firstOrder.values()].filter((o) => (!filt.coach || o.coach === filt.coach)).forEach((o) => { const w = weeks.find((w, i) => o.date >= w.s && (i === weeks.length - 1 || o.date < weeks[i + 1].s)); if (w) w.v++; });
    // active over last weeks (approx: paid through after each week end and start before)
    const activeTrend = weeks.map((w) => cl.filter((c) => c.paid && c.start && c.start <= new Date(w.s.getTime() + 6 * D.DAY) && c.paid >= w.s).length);
    const planMix = ["Pro", "Compete", "Elite", "Free Elite"].map((k) => ({ k, v: persons.filter((c) => c.planKey === k).length, color: PLAN_COLORS[k] }));
    return { cl, act, persons, renew7, notLogged, months, weeks, activeTrend, planMix, lastMtd };
  }
  const rank = (k) => ({ Pro: 4, Compete: 3, Elite: 2, "Free Elite": 1 }[k] || 0);

  // ---------- render ----------
  function render() {
    const m = model, x = derive(), t = m.today;
    const h = new Date().getHours();
    $("#greet-word").textContent = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    $("#today").textContent = t.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    // glance
    $("#g-payday").textContent = m.nextPay ? usd(m.nextPay.total) : "-";
    $("#g-payday-date").textContent = m.nextPay ? fdate(m.nextPay.date, { weekday: "short", month: "short", day: "numeric" }) : "No payday found";
    count($("#g-review"), m.review.length);

    // KPIs
    const thisM = x.months[11].v, lastM = x.lastMtd;
    count($("#k-active"), x.persons.length);
    delta($("#k-active-d"), x.activeTrend[x.activeTrend.length - 1] - x.activeTrend[x.activeTrend.length - 2], "vs last week", true);
    C.spark($("#sp-active"), x.activeTrend);
    count($("#k-net"), thisM, true);
    delta($("#k-net-d"), lastM ? Math.round(((thisM - lastM) / lastM) * 100) : null, `vs same days of ${x.months[10].full.split(" ")[0]}`, false, "%");
    C.spark($("#sp-net"), x.months.slice(-6).map((mm) => mm.v));
    count($("#k-renew"), x.renew7.length);
    $("#k-renew-d").innerHTML = `${x.renew7.filter((c) => c.autoRenew).length} on auto-renew`;
    C.spark($("#sp-renew"), Array.from({ length: 8 }, (_, i) => x.persons.filter((c) => c.daysLeft <= i + 1 && c.daysLeft >= 0).length));
    if (x.notLogged) { count($("#k-login"), x.notLogged.length); $("#k-login-d").textContent = `of ${x.persons.length} active players`; C.spark($("#sp-login"), [x.persons.length, x.notLogged.length]); }
    else { $("#k-login").innerHTML = '<span class="k-empty">Portal not filling yet</span>'; $("#k-login-d").textContent = "Fills once the portal export is on"; $("#sp-login").innerHTML = ""; }

    // charts
    const series = x.months.slice(-range);
    C.line($("#ch-rev"), series, { fmt: (v, axis) => usd(v, axis), tip: $("#rev-tip") });
    C.bars($("#ch-new"), x.weeks.map((w) => ({ label: w.label, v: w.v })));
    C.donut($("#ch-mix"), x.planMix);
    $("#mix-legend").innerHTML = x.planMix.map((p) => `<li><i style="background:${p.color}"></i>${p.k}<b>${p.v}</b></li>`).join("");

    // what's next
    if (m.nextPay) {
      $("#pay-date").textContent = fdate(m.nextPay.date, { weekday: "short", month: "short", day: "numeric" });
      $("#pay-total").textContent = usd(m.nextPay.total);
      const cs = m.nextPay.coaches.filter((c) => c.amount > 0 && (!filt.coach || c.coach === filt.coach)); const mx = Math.max(1, ...cs.map((c) => c.amount));
      $("#pay-coaches").innerHTML = cs.map((c, i) => `<li><span>${esc(c.coach)}</span><span class="track"><span class="fill" style="width:${(c.amount / mx) * 100}%;animation-delay:${i * 70}ms"></span></span><span>${usd(c.amount)}</span></li>`).join("") || '<li class="empty">Nothing owed</li>';
    } else { $("#pay-total").textContent = "-"; $("#pay-coaches").innerHTML = '<li class="empty">No payday on the Payroll tab</li>'; }
    $("#renew-list").innerHTML = x.renew7.slice(0, 5).map((c) => row(c.name, `${c.planKey}${c.coach ? " · " + c.coach : ""} · ${fdate(c.paid)}`, `<span class="days${c.daysLeft <= 2 ? " hot" : ""}">${c.daysLeft === 0 ? "Today" : c.daysLeft + "d"}</span>`, c.email)).join("") + (x.renew7.length > 5 ? `<li class="more"><a href="#s-boards">+${x.renew7.length - 5} more on the Renewals board</a></li>` : "") || '<li class="empty">Nobody renews this week</li>';

    renderBoards(x); renderCoaches(x); renderFix(x);
    wireHover();
    if (firstRender) { reveal(); firstRender = false; }
  }

  function row(name, meta, right, email) { return `<li data-email="${esc(email || "")}"><span class="nm">${esc(name)}</span><span class="meta">${esc(meta)}</span><span class="right">${right}</span></li>`; }

  function renderBoards(x) {
    const m = model, t = m.today;
    const ob = m.onboard.filter((o) => (!filt.coach || o.coach === filt.coach) && (!filt.plan || o.plan === filt.plan));
    const cols = [["Needs onboarding", ob.filter((o) => o.done === 0)], ["In progress", ob.filter((o) => o.done > 0 && o.done < 5)], ["All good", ob.filter((o) => o.done === 5)]];
    $("#setup-sub").textContent = ob.length ? `${ob.filter((o) => o.done === 5).length} of ${ob.length} fully set up` : "";
    $("#board-setup").innerHTML = cols.map(([h, list]) => `<div class="col"><p class="col-h">${h}<b>${list.length}</b></p>${list.slice(0, 60).map((o) =>
      `<div class="card" data-email="${esc(o.email)}"><div class="nm">${esc(o.name)}</div><div class="meta"><span>${esc(o.plan)} · ${esc(o.coach)}</span><span>${o.done} of 5</span></div><div class="steps">${o.steps.map((s) => `<i class="${s[1] ? "on" : ""}" title="${s[0]}"></i>`).join("")}</div></div>`).join("") || '<p class="empty">None</p>'}</div>`).join("");

    const cl = x.cl;
    const due = x.renew7;
    const ended = cl.filter((c) => c.paid && c.daysLeft < 0 && c.daysLeft >= -30 && !/^(switched|canceled|cancelled)$/i.test(c.status) && !x.persons.some((p) => p.email === c.email));
    const renewed = cl.filter((c) => /renew/i.test(c.purchase) && c.start && D.daysBetween(t, c.start) <= 7 && D.daysBetween(t, c.start) >= 0);
    $("#renew-sub").textContent = `${due.length} due, ${ended.length} lapsed, ${renewed.length} renewed this week`;
    const card = (c, right) => `<div class="card" data-email="${esc(c.email)}"><div class="nm">${esc(c.name)}</div><div class="meta"><span>${esc(c.planKey)}${c.coach ? " · " + esc(c.coach) : ""}</span><span>${right}</span></div></div>`;
    $("#board-renew").innerHTML = [["Due in 7 days", due.map((c) => card(c, c.daysLeft === 0 ? "today" : c.daysLeft + "d"))], ["Ended, not renewed", ended.sort((a, b) => b.daysLeft - a.daysLeft).map((c) => card(c, Math.abs(c.daysLeft) + "d ago"))], ["Renewed this week", renewed.map((c) => card(c, fdate(c.start)))]]
      .map(([h, list]) => `<div class="col"><p class="col-h">${h}<b>${list.length}</b></p>${list.slice(0, 60).join("") || '<p class="empty">None</p>'}</div>`).join("");
  }

  function renderCoaches(x) {
    const m = model;
    const names = [...new Set(m.clients.filter((c) => c.active && c.coach).map((c) => c.coach))].filter((n) => !filt.coach || n === filt.coach).sort();
    $("#coach-grid").innerHTML = names.map((n, i) => {
      const mine = x.persons.filter((c) => c.coach === n);
      const pro = mine.filter((c) => c.planKey === "Pro").length, comp = mine.filter((c) => c.planKey === "Compete").length;
      const onb = m.onboard.filter((o) => o.coach === n && o.done < 5).length;
      const ren = mine.filter((c) => c.daysLeft <= 7).length;
      const owed = m.nextPay ? (m.nextPay.coaches.find((c) => c.coach === n) || {}).amount || 0 : 0;
      const tot = Math.max(1, pro + comp);
      return `<div class="coach"><h3>${esc(n)}</h3><p class="owed">Next payday <b>${usd(owed)}</b></p>
        <div class="c-stat"><span>Pro</span><b>${pro}</b></div><div class="c-stat"><span>Compete</span><b>${comp}</b></div>
        <div class="c-bar"><i style="width:${(pro / tot) * 100}%;animation-delay:${i * 60}ms"></i><i style="width:${(comp / tot) * 100}%"></i></div>
        <div class="c-stat"><span>Onboarding</span><b>${onb}</b></div><div class="c-stat"><span>Renewing 7d</span><b>${ren}</b></div></div>`;
    }).join("") || '<p class="empty">No coached players for this filter</p>';
  }

  function renderFix(x) {
    const m = model, items = [];
    const seen = new Map();
    x.act.forEach((c) => { const k = c.email + "|" + c.plan; if (seen.has(k)) items.push([c, "Two active rows on " + c.plan]); else seen.set(k, c); });
    if (m.portalLive) {
      x.persons.forEach((c) => {
        const p = m.portal.get(c.email);
        if (!p) { items.push([c, "Not in portal"]); return; }
        if (p.paid && c.paid && Math.abs(D.daysBetween(p.paid, c.paid)) > 1) items.push([c, `Paid-through differs (portal ${fdate(p.paid)})`]);
        if (p.coach && c.coach && p.coach.toLowerCase() !== c.coach.toLowerCase()) items.push([c, `Coach differs (portal ${p.coach})`]);
      });
    }
    $("#mm-sub").textContent = m.portalLive ? `${items.length} to look at` : "Duplicates only. Portal checks start once the export is on.";
    $("#mm-list").innerHTML = items.slice(0, 40).map(([c, why]) => `<li data-email="${esc(c.email)}"><span class="nm">${esc(c.name)}</span><span class="meta">${esc(c.planKey)}${c.coach ? " · " + esc(c.coach) : ""}</span><span class="right"><span class="flag">${esc(why)}</span></span></li>`).join("") || '<li class="empty">Nothing to fix</li>';

    const rv = m.review.filter((r) => !filt.coach || String(r.where).includes(filt.coach) || String(r.assigned).includes(filt.coach));
    const types = {}; rv.forEach((r) => (types[r.type] = (types[r.type] || 0) + 1));
    $("#rv-sub").textContent = `${rv.length} open`;
    $("#rv-types").innerHTML = Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${esc(k)}<b>${v}</b></span>`).join("");
    $("#rv-list").innerHTML = rv.slice(0, 25).map((r) => `<li><span class="nm">${esc(r.player || r.id)}</span><span class="meta">${esc(r.type)} · ${esc(r.next || r.details || "")}</span><span class="right"><span class="chip">${esc(r.assigned || "Unassigned")}</span></span></li>`).join("") || '<li class="empty">No open items</li>';
  }

  // ---------- motion helpers ----------
  function count(node, to, isMoney) {
    const from = 0, dur = reduced ? 0 : 1100, t0 = performance.now();
    const f = (v) => (isMoney ? usd(v) : Math.round(v).toLocaleString("en-US"));
    if (!dur) { node.textContent = f(to); return; }
    const step = (now) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); node.textContent = f(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function delta(node, v, label, abs, unit = "") {
    if (v === null || v === undefined || !Number.isFinite(v)) { node.textContent = label ? "" : ""; return; }
    const cls = v > 0 ? "up" : v < 0 ? "down" : "";
    node.innerHTML = `<span class="${cls}">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}${unit}</span> ${esc(label)}`;
  }
  function reveal() {
    const els = document.querySelectorAll(".tile, .hello");
    if (reduced || !("IntersectionObserver" in window)) return;
    els.forEach((e, i) => { e.classList.add("reveal"); e.style.transitionDelay = Math.min(i, 6) * 60 + "ms"; });
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.08 });
    els.forEach((e) => io.observe(e));
  }

  // ---------- hover cards ----------
  function personCard(email) {
    const rows = model.clients.filter((c) => c.email === email); if (!rows.length) return null;
    const c = rows.find((r) => r.active) || rows[0]; const p = model.portal.get(email);
    const ob = model.onboard.find((o) => o.email === email);
    const dl = [["Plan", c.planKey], ["Coach", c.coachFull || "None"], ["Status", c.status], ["Paid through", fdate(c.paid, { month: "short", day: "numeric", year: "numeric" })], ["Days left", c.daysLeft ?? "-"], ["Auto-renew", c.autoRenew ? "Yes" : "No"]];
    if (p) dl.push(["Logged in", p.loggedIn ? "Yes" : "No"], ["Last session", p.lastSession ? fdate(p.lastSession) : "None yet"]);
    if (ob) dl.push(["Onboarding", ob.done + " of 5"]);
    return `<h4>${esc(c.name)}</h4><dl>${dl.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  }
  const hov = $("#hover");
  function wireHover() {
    document.querySelectorAll("[data-email]").forEach((n) => {
      if (n._wired || !n.dataset.email) return; n._wired = true;
      n.addEventListener("mouseenter", () => { const html = personCard(n.dataset.email); if (!html) return; hov.innerHTML = html; hov.hidden = false; place(n); });
      n.addEventListener("mouseleave", () => (hov.hidden = true));
    });
  }
  function place(n) { const r = n.getBoundingClientRect(), w = 260; let x = r.right + 10; if (x + w > innerWidth - 8) x = r.left - w - 10; if (x < 8) x = 8; hov.style.left = x + "px"; hov.style.top = Math.min(innerHeight - hov.offsetHeight - 8, Math.max(8, r.top)) + "px"; }

  // ---------- command palette ----------
  const pal = $("#palette"), pin = $("#pal-input"), pres = $("#pal-results"); let sel = 0, hits = [];
  function openPal() { if (!model) return; pal.hidden = false; pin.value = ""; search(""); setTimeout(() => pin.focus(), 10); }
  function closePal() { pal.hidden = true; }
  function search(q) {
    q = q.trim().toLowerCase();
    const people = new Map(); model.clients.forEach((c) => { const p = people.get(c.email); if (!p || (c.active && !p.active)) people.set(c.email, c); });
    hits = [...people.values()].filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.includes(q)).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name)).slice(0, 30);
    sel = 0; drawHits();
  }
  function drawHits() {
    pres.innerHTML = hits.map((c, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}"><span class="nm">${esc(c.name)}</span><span class="meta">${esc(c.email)}</span><span class="right">${esc(c.planKey)}${c.coach ? " · " + esc(c.coach) : ""}<br>${c.active ? (c.daysLeft === 0 ? "ends today" : c.daysLeft + "d left") : "ended"}</span></li>`).join("") || '<li class="empty">No player found</li>';
    const cur = pres.querySelector('[aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: "nearest" });
  }
  function pickHit() { const c = hits[sel]; if (!c) return; closePal(); const n = document.querySelector(`[data-email="${CSS.escape(c.email)}"]`); if (n) { n.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); n.animate && n.animate([{ outline: "2px solid var(--accent)" }, { outline: "2px solid transparent" }], { duration: 1600 }); } else { hov.innerHTML = personCard(c.email); hov.hidden = false; hov.style.left = (innerWidth - 260) / 2 + "px"; hov.style.top = "18vh"; setTimeout(() => (hov.hidden = true), 3500); } }
  pin.addEventListener("input", () => search(pin.value));
  pin.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { sel = Math.min(hits.length - 1, sel + 1); drawHits(); e.preventDefault(); } else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); drawHits(); e.preventDefault(); } else if (e.key === "Enter") pickHit(); });
  pres.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) { sel = +li.dataset.i; pickHit(); } });
  pal.addEventListener("click", (e) => { if (e.target === pal) closePal(); });
  $("#open-search").addEventListener("click", openPal);

  // ---------- theme + range + keys ----------
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    const go = () => { document.documentElement.dataset.theme = next; try { localStorage.setItem("hq-theme", next); } catch (e) {} if (model) render(); };
    if (document.startViewTransition && !reduced) document.startViewTransition(go); else go();
  }
  $("#theme").addEventListener("click", toggleTheme);
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b)); range = +b.dataset.range; if (model) render(); }));
  document.addEventListener("keydown", (e) => {
    if (!pal.hidden) { if (e.key === "Escape") closePal(); return; }
    if (e.target.matches("input, select, textarea") || e.metaKey && e.key !== "k" || e.ctrlKey || e.altKey) return;
    if (e.key === "/" || (e.metaKey && e.key === "k")) { e.preventDefault(); openPal(); }
    else if (/^[1-6]$/.test(e.key)) { const s = document.querySelector(`[data-sec="${e.key}"]`); if (s) s.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); }
    else if (e.key.toLowerCase() === "t") toggleTheme();
    else if (e.key.toLowerCase() === "r") refresh(false);
  });
  window.addEventListener("scroll", () => (hov.hidden = true), { passive: true });

  initAuth();
})();
