// Level Up HQ data: read the sheet (or sample data), parse, and build the model.
// No real data ever lives in this file or this repo.
(function () {
  const CFG = window.HQ_CONFIG;
  const DAY = 864e5;
  const RANGES = {
    clients: "Clients!A1:Q",
    orders: "Orders!A1:P",
    portal: "Portal!A1:L",
    review: "'Needs Review'!A1:L",
    onboard: "'Coach Onboarding'!A10:N",
    payroll: "Payroll!A1:K",
    coachPay: "'Coach Pay'!A1:O",
    settings: "Settings!A1:B30",
  };

  // ---- parsing helpers ----
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function parseDate(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * DAY); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m && MON[m[1].toLowerCase()] !== undefined) return new Date(+m[3], MON[m[1].toLowerCase()], +m[2]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    return null;
  }
  const money = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
  const yes = (v) => /^(true|yes|y|✓|x|1|done)$/i.test(String(v ?? "").trim());
  const norm = (e) => String(e ?? "").trim().toLowerCase();
  const first = (name) => String(name ?? "").trim().split(/\s+/)[0] || "";
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);

  function table(values) {
    if (!values || !values.length) return [];
    const head = values[0].map((h) => String(h).trim());
    return values.slice(1).filter((r) => r && r.some((c) => String(c).trim() !== "")).map((r) => {
      const o = {}; head.forEach((h, i) => { o[h] = r[i] ?? ""; }); return o;
    });
  }

  // ---- fetching ----
  async function fetchSheet(token) {
    const qs = Object.values(RANGES).map((r) => "ranges=" + encodeURIComponent(r)).join("&");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SPREADSHEET_ID}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`;
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (res.status === 401) { const e = new Error("expired"); e.code = 401; throw e; }
    if (res.status === 403 || res.status === 404) { const e = new Error("This Google account doesn't have access to the Level Up HQ sheet."); e.code = 403; throw e; }
    if (!res.ok) throw new Error("Couldn't read the sheet (" + res.status + "). Try again in a minute.");
    const json = await res.json();
    const out = {}; Object.keys(RANGES).forEach((k, i) => { out[k] = (json.valueRanges[i] && json.valueRanges[i].values) || []; });
    return out;
  }

  // ---- model ----
  function build(raw, today = new Date()) {
    today = startOfDay(today);
    const excluded = (e) => CFG.EXCLUDE_EMAIL.test(norm(e));
    const clients = table(raw.clients).filter((c) => c.Email && !excluded(c.Email)).map((c) => {
      const paid = parseDate(c["Paid Through"]);
      const amount = money(c["Amount Paid"]);
      const plan = String(c.Plan || "").trim();
      const freeElite = plan === "Elite" && (amount === 0 || /free/i.test(c["Purchase Type"]));
      return {
        name: String(c.Name || "").trim(), email: norm(c.Email), phone: c.Phone, plan, planKey: freeElite ? "Free Elite" : plan,
        coach: first(c.Coach), coachFull: String(c.Coach || "").trim(), status: String(c.Status || "").trim(),
        start: parseDate(c.Start), paid, daysLeft: paid ? daysBetween(paid, today) : null, autoRenew: yes(c["Auto-Renew"]),
        purchase: c["Purchase Type"], amount, notes: c.Notes,
      };
    });
    clients.forEach((c) => { c.active = !!c.paid && c.daysLeft >= 0 && !/^(switched|canceled|cancelled)$/i.test(c.status); });

    const portalRows = table(raw.portal).filter((p) => p.Email && !excluded(p.Email)).map((p) => ({
      email: norm(p.Email), name: p.Name, plan: p.Plan, coach: first(p.Coach), paid: parseDate(p["Paid Through"]),
      loggedIn: yes(p["Logged In"]), intake: p["Intake Done"], lastSession: parseDate(p["Last Session"]),
      welcome: yes(p["Welcome Sent"]), chat: yes(p["Google Chat Sent"]), drills: yes(p["Drills Set Up"]), call: yes(p["Intro Call Booked"]),
    }));
    const portal = new Map(portalRows.map((p) => [p.email, p]));
    const portalLive = portalRows.length > 0;

    const orders = table(raw.orders).filter((o) => !/^(test|cancelled|canceled)$/i.test(String(o.Status).trim()) && !excluded(o.Email)).map((o) => ({
      num: o["Order #"], date: parseDate(o.Date), email: norm(o.Email), name: o.Name, category: o.Category, plan: o.Plan,
      coach: first(o.Coach), gross: money(o["Gross $"]), fee: money(o["Shopify Fee $"]), refunded: money(o["Refunded $"]), net: money(o["Net $"]),
    })).filter((o) => o.date);

    const review = table(raw.review).filter((r) => /^open$/i.test(String(r.Status).trim())).map((r) => ({
      id: r.ID, date: parseDate(r["Date Flagged"]), player: r.Player, email: norm(r.Email), where: r.Where, type: r["Issue Type"] || "Other",
      details: r.Details, assigned: r["Assigned To"], next: r["Next Action"],
    }));

    const onboard = table(raw.onboard).filter((r) => r.Name && !excluded(r.Email)).map((r) => {
      const p = portal.get(norm(r.Email));
      const steps = [
        ["Google Chat", yes(r["Google Chat Sent"]) || !!(p && p.chat)],
        ["On portal", yes(r["On Portal"]) || !!(p && p.loggedIn)],
        ["Welcome", yes(r["Welcome Sent"]) || !!(p && p.welcome)],
        ["Drills", yes(r["Drills Set Up"]) || !!(p && p.drills)],
        ["Intro", yes(r["Intro / Personalizing"])],
      ];
      return { name: r.Name, email: norm(r.Email), coach: first(r.Coach), plan: r.Plan, start: parseDate(r.Start), paid: parseDate(r["Paid Through"]), steps, done: steps.filter((s) => s[1]).length };
    });

    const payRows = table(raw.payroll);
    const coachCols = payRows.length ? Object.keys(payRows[0]).filter((k) => !/^(payday|covers earnings|total|status)$/i.test(k)) : [];
    const paydays = payRows.map((r) => ({ date: parseDate(r.Payday), covers: r["Covers Earnings"], status: r.Status, total: money(r.Total),
      coaches: coachCols.map((c) => ({ coach: first(c), amount: money(r[c]) })) })).filter((p) => p.date);
    const nextPay = paydays.find((p) => /next/i.test(p.status)) || paydays.filter((p) => p.date >= today).sort((a, b) => a.date - b.date)[0] || null;

    return { today, clients, portal, portalLive, orders, review, onboard, paydays, nextPay };
  }

  // ---- sample data for ?demo=1 (made up, clearly fake) ----
  function sample() {
    const first = ["Avery", "Blake", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indy", "Jordan", "Kai", "Logan", "Morgan", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Tatum", "Wren", "Rowan", "Skyler", "Jules", "Remy", "Lane", "Hollis", "Marlo", "Ellis", "Shay"];
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const coaches = ["Richard Nyberg", "AJ Sims", "Colin Hodet", "Hunter Thorson", "Payton Haynes"];
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const now = new Date();
    const clients = [["Name", "Email", "Phone", "Plan", "Coach", "Status", "Start", "Paid Through", "Days Left", "Term", "Auto-Renew", "Amount Paid", "Purchase Type", "Lead Source", "Client Since", "Portal", "Notes"]];
    const portal = [["Email", "Name", "Plan", "Coach", "Paid Through", "Logged In", "Intake Done", "Last Session", "Welcome Sent", "Google Chat Sent", "Drills Set Up", "Intro Call Booked"]];
    const onboard = [["Coach", "Name", "Plan", "Email", "Phone", "Start", "Paid Through", "Google Chat Sent", "On Portal", "Welcome Sent", "Drills Set Up", "Intro / Personalizing", "Notes", "All Good?"]];
    for (let i = 0; i < 74; i++) {
      const plan = i < 26 ? "Pro" : i < 32 ? "Compete" : "Elite";
      const free = plan === "Elite" && i > 50;
      const coach = plan === "Elite" ? "" : pick(coaches);
      const name = `${first[i % first.length]} Sample${i >= first.length ? " " + (Math.floor(i / first.length) + 1) : ""}`;
      const email = `sample${i}@example.com`;
      const start = new Date(now - Math.floor(rnd() * 40) * DAY);
      const paid = new Date(now.getTime() + (Math.floor(rnd() * 34) - (i % 9 === 0 ? 12 : 2)) * DAY);
      clients.push([name, email, "", plan, coach, i % 9 === 0 ? "Renewal Due" : "Active", fmt(start), fmt(paid), "", "1 Month", rnd() > .6 ? "Yes" : "No", free ? "$0.00" : plan === "Pro" ? "$100.00" : plan === "Compete" ? "$45.00" : "$20.00", free ? "Free Elite" : i % 4 ? "New" : "Renewal", "", "", "", ""]);
      const logged = rnd() > .35;
      if (i % 7 !== 3) portal.push([email, name, plan, coach.split(" ")[0], fmt(i % 11 === 0 ? new Date(paid.getTime() + 3 * DAY) : paid), logged ? "yes" : "no", plan === "Elite" ? "n/a" : rnd() > .5 ? "yes" : "no", logged ? fmt(new Date(now - Math.floor(rnd() * 12) * DAY)) : "", plan === "Pro" ? (rnd() > .4 ? "yes" : "no") : "n/a", plan === "Pro" ? (rnd() > .5 ? "yes" : "no") : "n/a", rnd() > .5 ? "yes" : "no", rnd() > .6 ? "yes" : "no"]);
      if (plan !== "Elite") onboard.push([coach, name, plan, email, "", fmt(start), fmt(paid), ...[0, 1, 2, 3, 4].map(() => (rnd() > .55 ? "TRUE" : "FALSE")), "", ""]);
    }
    const orders = [["Order #", "Date", "Email", "Name", "Category", "Plan", "Item", "Coach", "Months", "Gross $", "Refunded $", "Shopify Fee $", "Fee Source", "Net $", "Status", "Product ID"]];
    for (let i = 0; i < 420; i++) {
      const fresh = i >= 360; // last 60 orders: first-time buyers in the last 10 weeks
      const d = new Date(now - Math.floor(rnd() * (fresh ? 70 : 360)) * DAY);
      const plan = pick(["Pro", "Pro", "Elite", "Elite", "Compete"]); const g = plan === "Pro" ? 100 : plan === "Compete" ? 45 : 20;
      orders.push([`#S${1000 + i}`, fmt(d), fresh ? `new${i}@example.com` : `sample${i % 74}@example.com`, "Sample", "Plan", plan, plan, plan === "Elite" ? "" : pick(coaches), "1", `$${g}`, "$0", `$${(g * .029 + .3).toFixed(2)}`, "Sample", `$${(g * .971 - .3).toFixed(2)}`, "Counted", ""]);
    }
    const review = [["ID", "Date Flagged", "Player", "Email", "Where", "Issue Type", "Details", "Assigned To", "Next Action", "Status", "Resolved Date", "Resolution Notes"]];
    ["Missing contact info", "Missing contact info", "Status unclear", "Uncertain coach", "Missing contact info", "Unmatched buyer", "Status unclear", "Missing contact info"].forEach((t, i) =>
      review.push([`NR-S${i + 1}`, fmt(now), `${first[i]} Sample`, `sample${i}@example.com`, "Clients", t, "Sample review item", i % 2 ? "Richard" : "Gavin", "Sample next step", "Open", "", ""]));
    const nextWed = new Date(now); nextWed.setDate(now.getDate() + ((3 - now.getDay() + 7) % 7 || 7));
    const payroll = [["Payday", "Covers Earnings", "Richard Nyberg", "AJ Sims", "Colin Hodet", "Hunter Thorson", "Payton Haynes", "Total", "Status"],
      [fmt(nextWed), "Sample period", "$312.40", "$228.10", "$96.55", "$61.09", "$74.80", "$772.94", "Next up"]];
    return { clients, orders, portal, review, onboard, payroll, coachPay: [], settings: [] };
  }

  window.HQData = { fetchSheet, build, sample, parseDate, daysBetween, startOfDay, DAY };
})();
