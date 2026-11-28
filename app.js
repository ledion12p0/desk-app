// app.js - the desk app. Reads encrypted files under d/{DATA_PATH}/ (see crypto.js). Every FOMO link comes from the
// data files (built by links.py on the desk); this file never builds a FOMO URL.
// last part (Telegram buttons): the moonbag after tp2 (3-part exit), or the second half after tp1 when tp2 is off
function halfLabel(h, p) {
  return ({ hold: "Hold for target", tight: `Tighter trail ${p.trail_pct}%`, auto: "You decide (default)", sell: "Sell now",
            timeout: "No answer · default trail", quiet: "Quiet hours · default trail" })[h.choice] || "Waiting for your choice";
}
(function () {
  const $ = s => document.querySelector(s), view = $("#view");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v, sign) => (v == null ? "—" : (sign && v > 0 ? "+" : v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = v => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const hms = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }) : "—";
  const hm = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—";
  const ago = ts => { if (!ts) return "never"; const s = Date.now() / 1000 - ts; return s < 90 ? Math.round(s) + "s ago" : s < 5400 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago"; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = { tab: "home", stack: [], data: {}, err: null, range: "LIVE", loaded: false };
  Desk.creds = Desk.readFragment();

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add("hidden"), 2200); }
  function errorView(e) {
    const msg = e.code === "nolink" ? ["Open your private link once", "This app needs the private link from your desk (it ends with #d=…). Open it once on this phone and it's remembered."]
      : e.code === "key" ? ["This link's key doesn't match", "The data couldn't be decrypted. Open the newest private link from your desk again."]
      : e.code === "404" ? ["No desk data here", "The data path wasn't found. The link may be old, or the publisher hasn't run yet."]
      : ["Can't reach the desk", "Couldn't load the latest data. Check your connection; it retries every 15 s."];
    return `<div class="error"><div class="em">!</div><h3>${msg[0]}</h3><p>${msg[1]}</p><button class="btn grey" id="retry">Try again</button></div>`;
  }
  function loadingView() { return `<div class="skel" style="height:18px;width:55%;margin:10px 0"></div><div class="skel" style="height:58px;width:70%;margin:8px 0"></div><div class="skel" style="height:20px;width:40%"></div><div class="skel" style="height:230px;margin:14px 0"></div><div class="skel" style="height:34px;border-radius:999px"></div><div class="skel" style="height:52px;margin:22px 0 8px"></div><div class="skel" style="height:52px"></div>`; }
  function empty(icon, t, s, sm) { return `<div class="empty${sm ? " sm" : ""}"><div class="em">${icon}</div><h3>${esc(t)}</h3><p>${esc(s)}</p></div>`; }

  async function refresh() {
    try {
      const [state, chart, activity, index] = await Promise.all(["state.bin", "chart.bin", "activity.bin", "index.bin"].map(Desk.fetchData));
      S.data = { ...S.data, state, chart, activity, index }; S.err = null; S.loaded = true;
      await loadCapture(index);
      const top = S.stack[S.stack.length - 1];
      if (top && top.kind === "coin") await loadCoin(top.mint, true);
      if (top && top.kind === "auditor") await loadAudit(top.mint, true);
      if (top && top.kind === "agent" || S.tab === "agents") await loadAgents();
    } catch (e) { S.err = e; }
    render();
  }
  async function loadCapture(index) {       // the real screenshot of the coin page the desk is looking at (encrypted like all data)
    const f = index && index.capture;
    if (!f) { if (S.capUrl) URL.revokeObjectURL(S.capUrl); S.capUrl = null; S.capFile = null; return; }
    if (f === S.capFile) return;
    try { const b = await Desk.fetchBlob(`cap/${f}.bin`, "image/jpeg"); if (S.capUrl) URL.revokeObjectURL(S.capUrl); S.capUrl = URL.createObjectURL(b); S.capFile = f; S.capFresh = true; }
    catch (e) { /* keep the previous one; the terminal is the fallback */ }
  }
  async function loadCoin(mint, quiet) {
    const f = S.data.index && S.data.index.coins[mint]; if (!f) { S.coin = null; return; }
    try { S.coin = await Desk.fetchData(`coin/${f}.bin`); } catch (e) { if (!quiet) S.err = e; }
  }
  async function loadAudit(mint, quiet) {
    const m = mint || (S.data.index && S.data.index.latest_audit); const f = m && S.data.index.audits[m];
    if (!f) { S.audit = null; return; }
    try { S.audit = await Desk.fetchData(`audit/${f}.bin`); } catch (e) { if (!quiet) S.err = e; }
  }
  async function loadAgents() {
    const names = ["scanner", "auditor", "analyst", "brain", "executor", "risk"];
    try { const r = await Promise.all(names.map(n => Desk.fetchData(`agents/${n}.bin`))); S.agents = Object.fromEntries(names.map((n, i) => [n, r[i]])); } catch (e) { S.err = e; }
  }

  // ---------- odometer ----------
  // digits roll from the last shown value to the new one
  function odometer(v) {
    const s = money(v), from = S.lastBal != null && money(S.lastBal).length === s.length ? money(S.lastBal) : s;
    S.lastBal = v;
    return `<span class="odo" aria-label="${esc(s)}">` + [...s].map((ch, i) => /\d/.test(ch)
      ? `<span class="d"><span data-to="${ch}" style="transform:translateY(-${Number(/\d/.test(from[i]) ? from[i] : ch) * 1.15}em)">${[0,1,2,3,4,5,6,7,8,9].map(n => `<i>${n}</i>`).join("")}</span></span>`
      : `<span>${esc(ch)}</span>`).join("") + `</span>`;
  }
  function rollOdometers() { requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll(".odo span[data-to]").forEach(el => { el.style.transform = `translateY(-${Number(el.dataset.to) * 1.15}em)`; }))); }
  function modePill() {
    const st = S.data.state, p = $("#modepill"); if (!st) { p.classList.add("hidden"); return; }
    const live = st.mode === "LIVE";
    p.innerHTML = `<span class="b"></span>${live ? "LIVE" : esc(st.mode)}`; p.className = "pill " + (live ? "live" : "paper");
  }
  const AG = {
    scanner: { c: "#3fd0ff", n: "Scanner", i: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>' },
    auditor: { c: "#a877ff", n: "Auditor", i: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>' },
    analyst: { c: "#ffd23f", n: "Analyst", i: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>' },
    brain: { c: "#ff6b9a", n: "Brain", i: '<svg viewBox="0 0 24 24"><path d="M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 7 17.5a2.5 2.5 0 0 0 5 .5V6a1.8 1.8 0 0 0-2.5-1.5z"/><path d="M14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 4.8 2.5 2.5 0 0 1-5 .5"/></svg>' },
    executor: { c: "#1ed760", n: "Executor", i: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>' },
    risk: { c: "#ff4d4d", n: "Risk", i: '<svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.1"/></svg>' },
  };
  const AVC = ["#1ed760", "#3fd0ff", "#ffd23f", "#a877ff", "#ff6b9a", "#ffa31a", "#3d8bff"];
  // coin icon: DexScreener image when the desk has one, else a colored initial (shown if the image fails)
  const avatar = (name, icon, cls) => { const n = String(name || "?"), ini = (n.replace(/[^A-Za-z0-9]/g, "")[0] || "•").toUpperCase(); let hsh = 0; for (const ch of n) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const img = icon && /^https:\/\/(cdn|dd)\.dexscreener\.com\//.test(icon) ? `<img src="${esc(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
    return `<span class="av ${cls || ""}" style="background:${AVC[hsh % AVC.length]}">${esc(ini)}${img}</span>`; };
  const tinyPrice = v => v == null ? "—" : v >= 1 ? "$" + v.toFixed(2) : v >= 0.01 ? "$" + v.toFixed(4) : "$" + Number(v).toPrecision(3);
  const usdK = v => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v);

  // ---------- screens ----------
  const ageOld = ts => { if (!ts) return "—"; const s = Math.max(0, Date.now() / 1000 - ts); return s < 90 ? Math.round(s) + "s old" : s < 5400 ? Math.round(s / 60) + "m old" : s < 172800 ? Math.round(s / 3600) + "h old" : Math.round(s / 86400) + "d old"; };
  const STAT_LBL = { open: "POSITION OPEN", rejected: "REJECTED", skipped: "SKIPPED", sold: "SOLD", watching: "WATCHING" };
  function feedPos(it, st) {
    return (st.positions || []).find(p => p.mint === it.mint && p.status === "open") || it.position || null;
  }
  function scanTile(label, field) {
    const text = field && field.text != null && field.text !== "" ? field.text : "—";
    const tone = (field && field.tone) || "na";
    return `<div class="sftile ${esc(tone)}"><div class="k"><i class="sdot"></i>${esc(label)}</div><div class="v">${esc(text)}</div></div>`;
  }
  function scanStep(name, state, reason) {
    const stt = state || "pending";
    const mark = stt === "done" ? "✓" : stt === "fail" ? "✕" : stt === "current" ? '<span class="sspin"></span>' : "";
    return `<div class="stp ${esc(stt)}"><span class="c">${mark}</span><span class="l">${esc(name)}</span>${stt === "fail" && reason ? `<span class="why">${esc(reason)}</span>` : ""}</div>`;
  }
  function scanBar(it, livePct) {
    let w = 0, cls = "na";
    if (it.status === "open") {
      const tgt = it.position && it.position.tp1 ? (it.tp2_target_pct || 100) : (it.tp1_target_pct || 30);
      const p = livePct == null ? 0 : livePct;
      w = Math.max(2, Math.min(100, p >= 0 ? (100 * p / tgt) : (100 * Math.abs(p) / 20)));
      cls = p >= 0 ? "up" : "dn";
    } else if (it.status === "sold") {
      const p = it.position && it.position.pct;
      w = 100; cls = p == null ? "na" : p >= 0 ? "up" : "dn";
    } else if (it.status === "rejected" || it.status === "skipped") { w = 100; cls = it.status === "rejected" ? "dn" : "na"; }
    else w = 8;
    return `<div class="sbar ${cls}"><i style="width:${w.toFixed(0)}%"></i></div>`;
  }
  function scanCard(it, st) {
    const now = Date.now() / 1000, p = feedPos(it, st);
    const open = it.status === "open" && p && !p.closed;
    const live = open ? posLive(p) : null;
    const ticker = it.symbol ? "$" + it.symbol : (it.name || (it.mint ? it.mint.slice(0, 4) : "—"));
    const ageTs = it.first_seen || it.scan_ts || it.ts;
    const young = ageTs && (now - ageTs) < 1800;
    const mc = (live && live.mc != null) ? live.mc : it.mc;
    const sub = [young ? "new launch" : null, ageTs ? `<span class="sage" data-ts="${ageTs}">${ageOld(ageTs)}</span>` : null,
      "mc " + usdK(mc)].filter(Boolean).join(" · ");
    const gpct = open ? live.gpct : (p && p.pct != null ? p.pct : null);
    const entry = open ? (p.orig_size || p.size) : (p && (p.orig_size || p.size));
    const detail = [entry != null ? money(entry) + " entry" : null, mc != null ? usdK(mc) + " mc" : (it.liq != null ? "liq " + usdK(it.liq) : null)].filter(Boolean).join(" · ") || "—";
    const why = it.status === "rejected" ? (it.audit_reason || it.reason) : it.reason;
    const small = it.status === "open" ? (p && p.tp1 && p.tp2 ? "moonbag trailing" : p && p.tp1 ? "half taken · rest trailing" : "in trade")
      : it.status === "sold" ? (p && p.reason ? String(p.reason) : (it.reason || "sold"))
      : it.status === "watching" ? (it.steps && it.steps.rug === "current" ? "rug check" : it.steps && it.steps.bought === "current" ? "buying" : "watching")
      : (why || "");
    const pnl = gpct == null ? "" : `<div class="spnl ${gpct >= 0 ? "green" : "red"}">${pct(gpct)}</div>`;
    const steps = it.steps || { found: "done", rug: "pending", bought: "pending", sold: "pending" };
    return `<button class="scard ${esc(it.status)}" ${it.mint ? `data-coin="${esc(it.mint)}"` : ""}>
      <div class="srctop"><span>FOUND ON ${esc(it.source || "—")}</span><span class="ix">Latest</span></div>
      <div class="tickrow"><div class="nm"><div class="ticker">${esc(ticker)}</div><div class="sub">${sub}</div></div>${avatar(it.symbol || it.name || ticker, it.icon, "xl")}</div>
      <div class="sftiles">${scanTile("DEV HOLDING", it.dev)}${scanTile("BUNDLES", it.bundles)}${scanTile("DEV HISTORY", it.dev_history)}</div>
      <div class="strack">${scanStep("Found", steps.found)}<i class="sline ${steps.rug === "pending" ? "" : "on"}"></i>${scanStep("Rug check", steps.rug, it.audit_reason)}<i class="sline ${steps.bought === "pending" ? "" : "on"}"></i>${scanStep("Bought", steps.bought)}<i class="sline ${steps.sold === "pending" ? "" : "on"}"></i>${scanStep("Sold", steps.sold)}</div>
      <div class="sfoot"><div class="sl"><div class="sst ${esc(it.status)}">${STAT_LBL[it.status] || esc(it.status)}</div><div class="sdet">${esc(detail)}</div><div class="ssm">${esc(small)}</div></div>${pnl}</div>
      ${scanBar(it, gpct)}
    </button>`;
  }
  function home() {
    const st = S.data.state, ch = S.data.chart;
    const ranges = { LIVE: 900, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800, ALL: 0 };
    const base = st.start_stack || st.equity, gain = st.equity - base, gpct = base ? 100 * gain / base : 0, up = gain >= -0.004;
    const running = Object.values(st.agents).filter(a => a.ok && !a.paused).length;
    const lt = st.last_trade, lp = lt ? lt.last_pnl : null;
    const pill = lp == null ? "" : `<span class="pnlpill ${lp >= 0 ? "up" : "dn"}">${money(lp, true)}</span>`;
    const latest = (st.scan_feed || [])[0];
    if (latest && latest.status === "open" && window.LivePos) {
      LivePos.start([latest.mint], () => { if (S.tab === "home" && !S.stack.length) home(); });
    } else if (window.LivePos && S.tab === "home") LivePos.stop();
    const latestBlock = latest ? `<div class="h2 h5"><span class="l">Latest scan</span></div><div class="scanfeed">${scanCard(latest, st)}</div>` : "";
    const openUsd = (st.positions || []).reduce((a, p) => a + (p.size || 0), 0);
    view.innerHTML = `<div class="bal5">
        <div class="balrow"><div class="balance big5">${odometer(st.equity)}</div>${pill}</div>
        <div class="freeline">Free to trade ${money(st.free)}${openUsd ? ` · ${money(openUsd)} in open coins` : ""}</div>
        <div class="chgrow"><span class="${up ? "green" : "red"} chg5">${up ? "▲" : "▼"} ${money(Math.abs(gain))} (${Math.abs(gpct).toFixed(2)}%)</span>
          <span class="mult ${up ? "up" : "dn"}">${st.multiplier.toFixed(2)}×</span>${st.mode === "PAPER" ? '<span class="pill paper xs">PAPER</span>' : ""}</div></div>
      ${latestBlock}
      <div class="chartwrap c5"><canvas class="chart" id="chart" aria-label="Balance chart"></canvas><span class="pulse hidden" id="pulse"></span></div>
      <div class="ranges r5">${Object.keys(ranges).map(r => `<button data-range="${r}" class="${S.range === r ? "on" : ""}">${r === "LIVE" ? '<span class="rd"></span>' : ""}${r}</button>`).join("")}</div>
      <div class="h2 h5"><span class="l">Live screen</span><span class="r green">Bot's computer</span></div>
      ${livePanel(st)}
      <div class="h2 h5"><span class="l">Bots</span><span class="r ${running === Object.keys(st.agents).length ? "green" : running ? "orange" : "red"}">${running} running</span></div>
      <div class="bots">${agentCards(st.agents, st.agent_stats || {}, true)}</div>
      <div class="foot">${st.mode} · updated ${ago(st.generated_at)}</div>`;
    rollOdometers(); tradeToast(lt);
    const now = Date.now() / 1000, span = ranges[S.range], pts = ch.points;
    const t0 = span ? now - span : (pts.length ? pts[0][0] : now - 3600);
    const marks = (ch.marks || []).map(m => m.kind === "bought" ? m : { ...m, pill: money(m.amount, true) });
    requestAnimationFrame(() => {
      const cv = $("#chart"); if (!cv) return;
      const end = drawLine(cv, pts, marks, t0, now, base, { lastOnly: true, noHigh: true }), pu = $("#pulse");
      if (end && pu) { pu.style.left = end.x + "px"; pu.style.top = end.y + "px"; pu.className = "pulse " + (end.up ? "up" : "dn"); }
    });
  }
  // iOS-style banner for the newest REAL trade (from positions in the desk db): slides in once per event, then hides
  function tradeToast(lt) {
    if (!lt || !lt.ts) return; const key = "desk.toast_seen";
    if (Date.now() / 1000 - lt.ts > 6 * 3600) return;                              // old news: no banner
    if (+(sessionStorage.getItem(key) || 0) >= lt.ts) return; sessionStorage.setItem(key, lt.ts);
    const sym = esc(lt.symbol || lt.name || ""), mc = lt.mc ? ` at ${usdK(lt.mc).replace(/\.0K$/, "K")} MC` : "";
    const txt = lt.kind === "sold" ? `Sold ${money(lt.amount)} ${sym}${mc} · <b class="${lt.pnl >= 0 ? "green" : "red"}">${money(lt.pnl, true)} (${lt.pct >= 0 ? "+" : ""}${lt.pct}%)</b>`
      : `Bought ${money(lt.amount)} ${sym}${mc}`;
    let el = $("#ntoast"); if (!el) { el = document.createElement("button"); el.id = "ntoast"; el.className = "ntoast"; document.body.appendChild(el); }
    el.dataset.coin = lt.mint || "";
    el.innerHTML = `<span class="nicon">F</span><span class="nmain"><span class="nt"><b>Desk${S.data.state.mode === "PAPER" ? " · PAPER" : ""}</b><span class="ter">${Date.now() / 1000 - lt.ts < 90 ? "now" : ago(lt.ts)}</span></span><span class="nb">${txt}</span></span>`;
    el.classList.remove("in"); void el.offsetWidth; el.classList.add("in"); document.body.classList.add("toasting");   // content slides down under it
    clearTimeout(tradeToast.t); tradeToast.t = setTimeout(() => { el.classList.remove("in"); document.body.classList.remove("toasting"); }, 6000);
  }
  // Live panel: a real screenshot of the public chart page for the coin the desk is on (taken by capture.py; the bots never click),
  // overlaid with real desk state. No screenshot (or it's stale) -> the terminal feed of real agent actions.
  function livePanel(st) {
    const cap = st.capture, lv = st.live || {}, hd = lv.header || st.focus || {}, bt = lv.bottom || {};
    const showShot = cap && S.capUrl && !S.forceTerm;
    const fresh = S.capFresh; S.capFresh = false;
    const head = `<div class="ov ovt"><span class="l"><span class="b${hd.agent === "Desk" ? " off" : ""}"></span>Live · Bot's computer</span><span class="r">${esc(hd.agent || "")}${hd.doing ? " · " + esc(hd.doing) : ""}</span></div>`;
    const bottom = `<div class="ov ovb"><span class="bt ${esc(bt.tone || "")}">${esc(bt.text || "")}${bt.verified ? ` · <b class="green">✓ verified</b>` : ""}</span><span class="dots"><i></i><i></i><i></i></span></div>`;
    const src = cap ? `<div class="capsrc">${esc(cap.source)} · ${esc(cap.name || "")} · ${ago(cap.ts)}</div>` : "";
    const body = showShot ? `<img class="shot${fresh ? " fresh" : ""}" src="${S.capUrl}" alt="Live screenshot of the ${esc(cap.name || "coin")} chart page">${head}${bottom}`
      : `${head}<div class="termwrap">${terminal(st)}</div>${bottom}`;
    return `<button class="live${showShot ? "" : " noshot"}" ${cap && cap.mint ? `data-coin="${esc(cap.mint)}"` : ""} aria-label="Live screen${cap && cap.name ? ": " + esc(cap.name) : ""}">${body}</button>`;
  }
  // "Live · Bot's computer": the desk's real agent actions as a terminal tail (no fake cursor, no fake trading screen)
  function terminal(st, n) {
    const lines = (st.terminal || []).slice(-(n || 14)), fo = st.focus || {}, seen = S.termSeen || 0;
    if (!n) S.termSeen = lines.length ? lines[lines.length - 1].ts : seen; else if (!S.termSeen2 && lines.length) S.termSeen2 = lines[lines.length - 1].ts;
    const fresh = seen ? lines.filter(l => l.ts > seen).length : 0;
    const off = fo.agent === "Desk";
    const pad = (t, n) => esc(String(t || "").padEnd(n).slice(0, n));
    const body = lines.length ? lines.map((l, i) => { const isNew = i >= lines.length - fresh;
      return `<div class="tl${isNew ? " new" : ""}" style="${isNew ? `animation-delay:${(i - (lines.length - fresh)) * 140}ms` : ""}"><span class="tt">${hms(l.ts)}</span> <span class="ta a-${esc(l.agent)}">${pad(l.agent, 8)}</span> <span class="tv v-${esc(l.verb)}">${pad(l.verb, 6)}</span> <span class="tc">${esc(l.coin)}</span>${l.coin ? "  " : ""}<span class="tx">${esc(l.text)}</span></div>`; }).join("")
      : `<div class="tl ter">waiting for the first agent action…</div>`;
    if (n) return `<div class="term sm"><div class="termb sm">${body}<div class="tl prompt"><span class="green">desk@box</span><span class="ter">:~$</span> <span class="cur"></span></div></div></div>`;
    return `<div class="term"><div class="termh"><span class="l"><span class="b${off ? " off" : ""}"></span>Live · Bot's computer</span><span class="r">${esc(fo.agent || "")}${fo.doing ? " · " + esc(fo.doing) : ""}</span></div>
      <div class="termb" id="termb">${body}<div class="tl prompt"><span class="green">desk@box</span><span class="ter">:~$</span> <span class="cur"></span></div></div></div>`;
  }
  function newsRow(e) {
    const tone = e.tone === "buy" || e.tone === "win" ? e.tone : e.tone === "loss" ? "loss" : "";
    const agent = AG[e.agent] ? AG[e.agent].n : e.agent;
    return `<button class="nrow ${tone}" ${e.mint ? `data-coin="${esc(e.mint)}"` : ""}><span class="tm">${hm(e.ts)}</span>${avatar(e.name, e.icon)}
      <span class="main"><div class="t">${esc(e.name)}</div><div class="s">${esc(agent)} · ${esc(e.text)}</div></span><span class="tag ${esc(e.tone)}">${esc(e.tag)}</span></button>`;
  }
  function featured(f) {
    const ch = f.change_pct, cc = ch == null ? "" : ch >= 0 ? "green" : "red";
    const facts = [f.liq != null ? `liq ${usdK(f.liq)}` : null, f.h1 != null ? `1h ${f.h1 > 0 ? "+" : ""}${Number(f.h1).toFixed(0)}%` : null,
      f.score != null ? `score ${f.score}` : null, f.why].filter(Boolean);
    return `<div class="h2"><span class="l">Watching</span><span class="r ter">since ${hm(f.since)}</span></div>
      <button class="feat" data-coin="${esc(f.mint)}"><div class="top2">${avatar(f.name, f.icon)}<div style="min-width:0"><div class="nm">${esc(f.name)}</div><div class="sy">${esc(f.symbol ? "$" + f.symbol : "")}</div></div>
      <div class="px"><b>${tinyPrice(f.price)}</b><span class="${cc}" style="font-size:13px;font-weight:700">${ch == null ? "" : (ch >= 0 ? "▲ " : "▼ ") + Math.abs(ch).toFixed(1) + "%"}</span></div></div>
      <canvas id="mini" aria-label="Price chart"></canvas><div class="facts">${facts.map(x => `<span class="pill">${esc(x)}</span>`).join("")}</div></button>`;
  }
  function agentCards(ag, stats, compact) {
    stats = stats || (S.data.state && S.data.state.agent_stats) || {};
    const order = ["scanner", "auditor", "analyst", "brain", "executor", "risk"].filter(n => ag[n]);
    return order.map(n => { const a = ag[n] || {}, s = stats[n] || {}, m = AG[n]; const dot = a.paused ? "pause" : a.ok ? "" : "off";
      const sub = a.paused ? "paused" : !a.ok ? "no heartbeat · " + ago(a.heartbeat) : (s.row_sub || s.status || a.sub || "");
      const tags = compact ? "" : (s.tags || []).map(t => `<code>${esc(t)}</code>`).join("");
      const st5 = S.data.state || {}, mcset = (st5.settings || []).find(x => x.key === "brain.max_mc_pct");
      let stat = s.row_stat || s.stat || a.title || "—", sub2 = sub, scls = "";
      if (compact && n === "brain") { stat = money(st5.free) + " free"; if (a.ok && !a.paused) sub2 = `size by score · cap ${mcset ? mcset.value : "?"} of MC`; }
      if (compact && n === "analyst" && /score/.test(stat)) { const v = parseInt(stat.replace(/\D+/g, "")), mn = (st5.agents.analyst || {}).min_score; scls = mn != null && v >= mn ? "green" : ""; }
      return `<button class="agent bot" data-agent="${n}" style="--ac:${m.c}"><span class="ring">${m.i}</span>
        <span class="main"><div class="nmrow">${m.n}<span class="dot ${dot}"></span></div><div class="st"><span class="sx">${esc(sub2)}</span>${tags}</div></span>
        <span class="bstat ${scls}">${esc(stat)}</span></button>`; }).join("");
  }
  function ring(score, min) {
    const v = score == null ? 0 : score, c = 2 * Math.PI * 34, col = v >= (min || 70) ? "#00d35a" : "rgba(235,235,245,0.3)";
    return `<svg class="ring" viewBox="0 0 84 84"><circle cx="42" cy="42" r="34" fill="none" stroke="#2c2c2e" stroke-width="8"/>
      <circle cx="42" cy="42" r="34" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 42 42)"/>
      <text x="42" y="48" text-anchor="middle" fill="#fff" font-size="20" font-weight="700">${score == null ? "—" : v}</text></svg>`;
  }
  function actRow(a) {
    const badge = { bought: "✓", sold: "$", stopped: "−", rejected: "×", lesson: "!" }[a.kind] || "•";
    const name = String(a.title || "").replace(/^(Bought|Sold|Stopped|Rejected|Skipped)\s+/, "");
    const v = String(a.value || ""); let amt = v, second = "", col = "";
    if (a.kind === "bought") { const [x, y] = v.split(" · "); amt = x; second = a.mc ? "MC " + usdK(a.mc) : (y || "").replace(" of stack", ""); col = "green"; }
    else if (a.kind === "sold") { const [x, y] = v.split(" / "); amt = x; second = y || (a.mc ? "MC " + usdK(a.mc) : ""); col = x.startsWith("-") ? "red" : "green"; }
    else if (a.kind === "stopped") { amt = v; second = a.mc ? "MC " + usdK(a.mc) : "stop"; col = "red"; }
    else if (a.kind === "rejected") { amt = "skip"; second = a.mc ? "MC " + usdK(a.mc) : a.liq ? "liq " + usdK(a.liq) : ""; col = "ter"; }
    return `<button class="item arow" ${a.mint ? `data-coin="${esc(a.mint)}"` : ""}><span class="cic">${avatar(name, a.icon, "lg")}<span class="badge ${a.kind}">${badge}</span></span>
      <div class="main"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.subtitle)} · ${hm(a.ts)}${a.mode === "PAPER" ? " · PAPER" : ""}</div></div>
      <div class="v"><b class="${col}">${esc(amt)}</b><small>${esc(second)}</small></div></button>`;
  }
  function agentsTab() {
    const st = S.data.state, running = Object.values(st.agents).filter(a => a.ok && !a.paused).length;
    view.innerHTML = `<div class="h2" style="margin-top:8px"><span class="l sec" style="font-size:14px;font-weight:600">Tap a bot for its feed</span><span class="r ${running === Object.keys(st.agents).length ? "green" : "orange"}">${running} running</span></div>
      <div class="bots">${agentCards(st.agents, st.agent_stats)}</div>
      <div class="card" style="margin-top:16px"><div class="kv"><span class="k">Stop / trail</span><span class="val"><span class="pill red">${esc(st.agents.risk.stop_pill || "")}</span> <span class="pill green">${esc(st.agents.risk.trail_pill || "")}</span></span></div>
      <div class="kv"><span class="k">Analyst bar</span><span class="val">score ≥ ${esc(st.agents.analyst.min_score)}</span></div>
      <div class="kv"><span class="k">Waiting room</span><span class="val">${esc(st.agents.scanner.waiting || 0)} pools</span></div></div>
      ${lessonsCard(st.lessons)}`;
  }
  function lessonsCard(L) {
    if (!L || !(L.items || []).length) return "";
    const tag = l => l.action === "none" ? `<span class="pill ${l.kind === "good" ? "green" : ""}">${l.kind === "good" ? "good" : "note"}</span>` : `<span class="pill red">${esc(l.action)}</span>`;
    return `<div class="h2">Lessons</div><p class="ter" style="margin-top:0">Brain reads these before every buy · from ${esc(L.trades)} closed trades · ${ago(L.built_at)}</p>
      <div class="card">${L.items.map(l => `<div class="kv" style="align-items:flex-start;gap:10px"><span class="val" style="flex:none">${tag(l)}</span><span class="k" style="text-align:left">${esc(l.text)}</span></div>`).join("")}</div>`;
  }
  function agentScreen(n) {
    const a = S.agents && S.agents[n]; if (!a) { view.innerHTML = loadingView(); return; }
    const ag = a.agent, feed = a.feed || [];
    const row = f => {
      if (n === "scanner") return [f.name || f.mint.slice(0, 6), f.verdict === "pass" ? `liq $${Math.round(f.liquidity_usd || 0).toLocaleString()} · → auditor` : f.reason, f.verdict === "pass" ? "green" : "red"];
      if (n === "auditor") return [f.name || f.mint.slice(0, 6), f.passed ? "9/9 → Executor" : f.reason, f.passed ? "green" : "red"];
      if (n === "analyst") return [f.name || f.mint.slice(0, 6), `score ${f.score}` + (f.reason ? ` · ${f.reason}` : ""), f.pass ? "green" : "red"];
      if (n === "brain") return [f.name || f.mint.slice(0, 6), f.line || f.reason || f.status, f.status === "sized" ? "green" : "red"];
      if (n === "executor") return [f.name || f.mint.slice(0, 6), `${f.status}` + (f.size_usd ? ` · $${f.size_usd.toFixed(2)}` : "") + (f.reason ? ` · ${f.reason}` : ""), f.status === "bought" ? "green" : "sec"];
      return [f.name || f.mint.slice(0, 6), `${f.exit_reason}${f.tp2_at ? " (half + quarter taken earlier)" : f.tp1_at ? " (half taken earlier)" : ""} · ${money(f.pnl_usd, true)}`, f.pnl_usd >= 0 ? "green" : "red"];
    };
    view.innerHTML = `<div class="card"><div class="row"><span class="dot ${ag.paused ? "pause" : ag.ok ? "" : "off"}"></span><b>${ag.paused ? "Paused" : ag.ok ? "Running" : "No heartbeat"}</b><span class="sec">· ${ago(ag.heartbeat)}</span></div>
      <div class="big" style="font-size:22px;font-weight:700;margin-top:8px">${esc(ag.title || "")}</div><div class="sec">${esc(ag.sub || "")}</div>
      ${n === "auditor" ? `<button class="btn grey" data-auditor="">Open the latest audit</button>` : ""}</div>
      <div class="h2">Recent</div>${feed.length ? `<div class="list">${feed.map(f => { const [t, s, c] = row(f);
        return `<button class="item" ${n === "auditor" ? `data-auditor="${esc(f.mint)}"` : `data-coin="${esc(f.mint)}"`}><div class="main"><div class="t">${esc(t)}</div><div class="s ${c}${n === "brain" ? " wrap" : ""}" ${n === "scanner" && f.verdict !== "pass" ? 'style="text-decoration:line-through;text-decoration-color:#ff453a"' : ""}>${esc(s)}</div></div><div class="v ter">${hm(f.ts)}</div></button>`; }).join("")}</div>`
        : empty("○", "Nothing yet", "This agent hasn't decided on a coin tonight.")}`;
  }
  function auditorScreen() {
    const a = S.audit;
    if (!a) { view.innerHTML = empty("◎", "No audits yet", "When Scanner passes a coin, Auditor takes it apart in 9 layers here."); return; }
    const discs = a.layers.map(L => `<div class="disc ${L.pass === true ? "ok" : L.pass === false ? "bad" : "nc"}" data-n="${L.n}">${L.pass === true ? "✓" : L.pass === false ? "✗" : L.n}</div>`).join("");
    view.innerHTML = `<div class="card"><div class="t" style="font-weight:700;font-size:20px">${esc(a.name || a.mint)}</div>
      <div class="${a.passed ? "green" : "red"}">${a.passed ? "9/9 → Executor" : esc(a.reason || "taking apart…")}</div>
      <div class="discs" id="discs">${discs}</div>
      ${a.layers.map(L => `<div class="layer"><span>${L.n} ${esc(L.name)}</span><span class="${L.pass === true ? "green" : L.pass === false ? "red" : "ter"}">${esc(L.value)}</span></div>`).join("")}</div>
      <a class="btn blue" href="${esc(a.link)}" target="_blank" rel="noopener">Open on FOMO</a>
      <button class="btn grey" data-coin="${esc(a.mint)}">Coin screen</button>`;
    if (!reduce) { // cyan beam sweeps the checked layers once, then each disc shows its verdict
      const ds = [...document.querySelectorAll(".disc")]; let i = 0;
      const step = () => { ds.forEach(d => d.classList.remove("beam")); const d = ds[i]; if (!d || d.classList.contains("nc")) return; d.classList.add("beam"); i++; setTimeout(step, 220); };
      step(); setTimeout(() => ds.forEach(d => d.classList.remove("beam")), 220 * 9);
    }
  }
  // ---------- coin panel: live header, candles with entry/stop/trail, stats grid, verdicts, mint, FOMO buttons ----------
  const fp = v => window.fmtPrice(v);
  const chg = (v, lbl) => v == null ? "" : `<span class="chg ${v >= 0 ? "up" : "dn"}">${lbl ? `<b>${lbl}</b>` : ""}${v >= 0 ? "+" : ""}${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}%</span>`;
  const dur = s => s == null ? "—" : s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h " + Math.round((s % 3600) / 60) + "m" : Math.floor(s / 86400) + "d " + Math.round((s % 86400) / 3600) + "h";
  const agoS = s => s < 60 ? Math.max(0, Math.round(s)) + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago";
  function coinLive(c) {      // newest of: phone's DexScreener read (<60 s) / Risk's last_price for an open position / desk snapshot
    const L = window.Live || {}, now = Date.now() / 1000, mk = c.market || {}, p = c.position && !c.position.closed ? c.position : null;
    const dx = L.mint === c.mint && L.pair && now - L.pairTs < 60 ? L.pair : null;
    if (dx) return { ...dx, ts: L.pairTs, src: "DexScreener", live: true };
    const price = p && p.last ? p.last : mk.price;
    const stale = L.mint === c.mint && L.pair ? L.pair : {};            // older phone read still beats nothing for volume/txns
    return { ...stale, price, mc: mk.mc_src === "dexscreener" ? mk.mc : (price && c.mint.endsWith("pump") ? price * 1e9 : mk.mc), mcEst: mk.mc_src !== "dexscreener",
      liq: stale.liq || mk.liq, ch_h1: stale.ch_h1 != null ? stale.ch_h1 : mk.h1, ts: mk.ts, src: "desk", live: false,
      psrc: (p && p.price_src) || mk.price_src || null };
  }
  function updLine(lv) {
    const a = Date.now() / 1000 - (lv.ts || 0), fresh = lv.live && a < 30;
    const why = !lv.live && window.Live && Live.dxErr ? ` title="${esc(Live.dxErr)}"` : "";
    return `<span class="upd ${fresh ? "on" : "off"}"${why}><i></i>${lv.live ? "live" : window.Live && Live.dxErr && !lv.psrc ? "offline" : "desk"}${!lv.live && lv.psrc ? (lv.psrc === "curve" ? " · bonding curve" : " · Jupiter") : ""} · <span id="updago" data-ts="${lv.ts || 0}">${lv.ts ? agoS(a) : "—"}</span></span>`;
  }
  function coinScreen() {
    const c = S.coin;
    if (!c) { window.Live && Live.stop(); view.innerHTML = empty("○", "No data for this coin", "The desk hasn't published this coin's prices yet."); return; }
    if (window.Live) Live.start(c.mint, c.pool, why => { const top = S.stack[S.stack.length - 1]; if (top && top.kind === "coin" && S.coin && S.coin.mint === Live.mint) coinScreen(); });
    const lv = coinLive(c), st = S.data.state, now = Date.now() / 1000;
    const flash = lv.live && Live.flash && Date.now() - Live.flashTs < 1500 ? Live.flash : null;   // price moved on this poll
    const pos = c.position, open = pos && !pos.closed ? pos : null, closed = pos && pos.closed ? pos : null;
    const tf = (window.Live && Live.tf) || "1m", step = { "1m": 60, "5m": 300, "15m": 900 }[tf];
    const ch = window.Live ? Live.candles(c.candles) : { candles: c.candles, src: "desk" };
    // chart in MARKET CAP: price x supply, supply from the same source as the header MC (DexScreener mc/price; pump.fun = 1B)
    const supply = lv.mc && lv.price ? lv.mc / lv.price : (c.mint.endsWith("pump") ? 1e9 : null);
    const mcK = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v);
    // position maths from the live price (Risk's last_price when the phone can't reach DexScreener)
    let pnl = null, pnlPct = null, value = null;
    if (open && open.entry && lv.price) { pnlPct = 100 * (lv.price / open.entry - 1); value = open.size * lv.price / open.entry; pnl = value - open.size; }
    const lines = open ? [{ price: open.entry, color: "#3d8bff", label: "entry" }, { price: open.stop_price, color: "#ff4d4d", dash: true, label: "stop" },
        open.trail_line ? { price: open.trail_line, color: "#ffa31a", dash: true, label: "trail", fg: "#000" } : { price: open.trail_arm, color: "rgba(255,163,26,.55)", dash: true, label: "trail@", fg: "#000" }]
      : closed ? [{ price: closed.entry, color: "#3d8bff", label: "entry" }, { price: closed.exit, color: (closed.pnl || 0) >= 0 ? "#1ed760" : "#ff4d4d", label: "exit", fg: (closed.pnl || 0) >= 0 ? "#000" : "#fff" }] : [];
    const marks = [pos && pos.opened_at && { ts: pos.opened_at, kind: "buy", color: "#3d8bff" }, closed && closed.closed_at && { ts: closed.closed_at, kind: "sell", color: (closed.pnl || 0) >= 0 ? "#1ed760" : "#ff4d4d" }].filter(Boolean);
    const mk = c.market || {}, age = lv.created ? now - lv.created : mk.migrated_at ? now - mk.migrated_at : mk.age_min != null ? mk.age_min * 60 : null;
    const posCard = open ? `<div class="pos"><div class="pl"><div class="k">Position <span class="pill ${st.mode === "LIVE" ? "live" : "paper"} xs">${esc(st.mode)}</span></div>
        <div class="v">${money(open.size)} <span class="ter">→</span> ${money(value)}</div>${open.tp1 ? `<div class="ter sm">Took half at ${pct(open.tp1.pct)}${open.tp2 ? ` + a quarter at ${pct(open.tp2.pct)}` : ""} · <span class="${(open.tp1.pnl || 0) + (open.tp2 ? open.tp2.pnl || 0 : 0) >= 0 ? "green" : "red"}">${money((open.tp1.pnl || 0) + (open.tp2 ? open.tp2.pnl || 0 : 0), true)}</span> banked</div>` : ""}</div>
        <div class="pr"><div class="big ${pnl >= 0 ? "green" : "red"}">${money(pnl, true)}</div><div class="${pnl >= 0 ? "green" : "red"}">${pct(pnlPct)}</div></div></div>`
      : closed ? `<div class="pos"><div class="pl"><div class="k">Closed · ${esc(closed.reason || "")} <span class="pill ${closed.mode === "LIVE" ? "live" : "paper"} xs">${esc(closed.mode || st.mode)}</span></div>
        <div class="v">${money(closed.size)} <span class="ter">· held ${dur(closed.closed_at - closed.opened_at)}</span></div>${closed.tp1 ? (closed.tp2 ? `<div class="ter sm">half at ${pct(closed.tp1.pct)}, a quarter at ${pct(closed.tp2.pct)} · total of all 3 parts</div>` : `<div class="ter sm">half taken at ${pct(closed.tp1.pct)} · total of both halves</div>`) : ""}</div>
        <div class="pr"><div class="big ${(closed.pnl || 0) >= 0 ? "green" : "red"}">${money(closed.pnl, true)}</div><div class="${(closed.pnl || 0) >= 0 ? "green" : "red"}">${pct(closed.pct)}</div></div></div>` : "";
    const tile = (k, v, cls) => `<div class="tile"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div></div>`;
    const bs = lv.buys_h1 != null ? `<span class="green">${lv.buys_h1.toLocaleString("en-US")}</span> <span class="ter">/</span> <span class="red">${lv.sells_h1.toLocaleString("en-US")}</span>` : "—";
    const tiles = [tile("Market cap", lv.mc ? usdK(lv.mc) + (lv.live || !lv.mcEst ? "" : ' <span class="ter sm">est</span>') : "—"), tile("Liquidity", usdK(lv.liq)),
      tile("Volume 1h", usdK(lv.vol_h1)), tile("Volume 24h", usdK(lv.vol_h24)),
      tile("Holders", c.holders != null ? Number(c.holders).toLocaleString("en-US") : "—"), tile("Top-10 holders", mk.top10 != null ? mk.top10.toFixed(1) + "%" : "—"),
      tile("Pool age", dur(age)), tile("Buys / sells 1h", bs)];
    // trade levels in market cap (like the chart), the plain price underneath
    const lvl = v => v == null ? "—" : supply ? `${mcK(v * supply)} <span class="ter px">${fp(v)}</span>` : fp(v);
    if (open) tiles.push(tile("Entry (MC)", lvl(open.entry)), tile(open.tp1 && open.stop_label === "stop at breakeven" ? "Stop at breakeven (MC)" : `Stop −${open.stop_pct}% (MC)`, lvl(open.stop_price), "red"),
      tile(open.trail_line ? `Trail ${open.trail_pct}% (MC)` : `Trail ${open.trail_pct}% arms at (MC)`, lvl(open.trail_line || open.trail_arm), "orange"), tile("Time in trade", dur(now - open.opened_at)));
    if (closed) tiles.push(tile("Entry (MC)", lvl(closed.entry)), tile("Exit (MC)", lvl(closed.exit), (closed.pnl || 0) >= 0 ? "green" : "red"),
      tile(`Stop −${closed.stop_pct}% (MC)`, lvl(closed.stop_price)), tile("Peak (MC)", lvl(closed.peak)));
    const vd = c.verdicts || {}, an = c.verdict;
    const chip = (n, v, attr) => `<${attr ? "button" : "div"} class="vchip ${v ? (v.ok ? "ok" : "no") : "na"}" ${attr || ""}><div class="k">${n}</div><div class="v">${v ? esc(v.text) : "—"}</div></${attr ? "button" : "div"}>`;
    const verdicts = chip("Scanner", vd.scanner) + chip("Auditor", vd.auditor, `data-auditor="${esc(c.mint)}"`)
      + chip("Analyst", an ? { ok: !!an.pass, text: "score " + an.score } : null) + chip("Brain", vd.brain);
    const short = c.mint.slice(0, 6) + "…" + c.mint.slice(-6);
    view.innerHTML = `<div class="coinp">
      <div class="ch-head">${avatar(c.name || c.symbol, c.icon, "lg")}<div class="nm"><div class="n">${esc(c.name || c.symbol || short)}</div><div class="s">${c.symbol ? "$" + esc(c.symbol) : ""}${lv.dex ? ` · ${esc(lv.dex)}` : ""}</div></div>${updLine(lv)}</div>
      <div class="ch-price${flash ? " flash-" + flash : ""}">${fp(lv.price)}</div>
      <div class="ch-chg">${chg(lv.ch_m5, "5m ")}${chg(lv.ch_h1, "1h ")}${chg(lv.ch_h24, "24h ")}</div>
      <div class="ch-mc"><span class="mcbig">MC <b>${lv.mc ? usdK(lv.mc) : "—"}</b></span><span>Liq <b>${usdK(lv.liq)}</b></span><span>Vol 1h <b>${usdK(lv.vol_h1)}</b></span></div>
      ${posCard}
      <div class="ch-tf"><div class="seg">${["1m", "5m", "15m"].map(t => `<button data-tf="${t}" class="${t === tf ? "on" : ""}">${t}</button>`).join("")}</div>
        <span class="ter sm">${supply ? "market cap · " : ""}${ch.src === "geckoterminal" ? "GeckoTerminal" : "desk ticks"}</span></div>
      <canvas class="chart" id="candles" style="height:270px"></canvas>
      ${lines.length ? `<div class="legend">${open ? `<span><i class="entry"></i>entry</span><span><i class="stop"></i>${esc(open.stop_label || "stop −" + open.stop_pct + "%")}</span><span><i></i>${open.trail_line ? "trailing stop" : "trail arms"}</span>` : `<span><i class="entry"></i>entry</span><span><i class="exit ${(closed.pnl || 0) >= 0 ? "" : "neg"}"></i>exit</span>`}</div>` : ""}
      <div class="grid2">${tiles.join("")}</div>
      <div class="vrow">${verdicts}</div>
      <div class="mintrow"><span class="k">Mint</span><span class="m" title="${esc(c.mint)}">${esc(short)}</span><button class="copy" data-copy="${esc(c.mint)}">Copy</button></div>
      <div class="actbar"><a class="btn green" href="${esc(c.link)}" target="_blank" rel="noopener">Buy on FOMO</a>${open ? `<a class="btn red" href="${esc(c.link)}" target="_blank" rel="noopener">Sell on FOMO</a>` : ""}</div>
    </div>`;
    const sc = supply ? ch.candles.map(k => [k[0], k[1] * supply, k[2] * supply, k[3] * supply, k[4] * supply, k[5]]) : ch.candles;
    const sl = supply ? lines.map(l => ({ ...l, price: l.price ? l.price * supply : l.price })) : lines;
    requestAnimationFrame(() => { const cv = $("#candles"); if (cv) drawPrice(cv, sc, sl, marks, step, supply ? { fmt: mcK } : null); });
  }
  setInterval(() => { const e = $("#updago"); if (!e) return; const ts = +e.dataset.ts; if (ts) e.textContent = agoS(Date.now() / 1000 - ts); }, 1000);
  // ---------- Positions tab: ONLY open positions, live from the phone's DexScreener read (5 s), else Risk's last poll ----------
  const sideFee = (t, disc) => { t = Math.max(0, +t || 0); const f = t <= 47.5 ? 0.02 * t : t <= 190 ? 0.95 : 0.005 * t; return f * (1 - (disc || 0)); };  // = fees.py
  function posLive(p) {
    const lp = window.LivePos ? LivePos.get(p.mint) : null;
    const price = lp && lp.price ? lp.price : p.last;
    const supply = lp && lp.mc && lp.price ? lp.mc / lp.price : p.supply;
    const mc = lp && lp.mc ? lp.mc : price && supply ? price * supply : null;      // Risk: supply = last_mc / last_price
    const liq = lp && lp.liq != null ? lp.liq : p.liq;
    const full = p.orig_size || p.size, rest = p.size, e = p.entry;
    const value = e && price ? rest * price / e : null, gross = value != null ? value - rest : null, gpct = e && price ? 100 * (price / e - 1) : null;
    const banked = (p.tp1 ? p.tp1.pnl || 0 : 0) + (p.tp2 ? p.tp2.pnl || 0 : 0);
    const total = gross != null ? gross + banked : null;   // banked (tp1/tp2) + unrealized on what's still held
    const net = value != null ? value - rest - sideFee(full, p.fee_disc) * (full ? rest / full : 1) - sideFee(value, p.fee_disc) + banked : null;
    const peak = Math.max(p.peak || 0, price || 0) || null;
    const trail = p.trail_active && peak ? peak * (1 - p.trail_pct / 100) : null;
    const bought = full;
    const soldCost = (p.tp1 ? p.tp1.sold || 0 : 0) + (p.tp2 ? p.tp2.sold || 0 : 0);
    const soldPnl = banked, soldRecv = soldCost + soldPnl;
    const totalPct = bought && total != null ? 100 * total / bought : null;
    return { lp, price, supply, mc: mc && isFinite(mc) ? mc : null, liq, value, gross, gpct, banked, total, net, peak, trail,
      bought, soldCost, soldPnl, soldRecv, totalPct,
      ts: lp ? lp.ts : p.last_at, live: !!lp, src: lp ? "DexScreener · phone" : "Risk · desk" };
  }
  function positionCard(p, st, now) {
    const v = posLive(p), mcOf = px => px && v.supply ? usdK(px * v.supply) : "—";
    const lvl = px => px == null ? "—" : `${mcOf(px)} <span class="ter px">${fp(px)}</span>`;
    const dist = px => px && v.price ? (100 * (px / v.price - 1)) : null;
    const cls = x => x == null ? "" : x >= 0 ? "green" : "red";
    const liqCh = v.liq != null && p.entry_liq ? 100 * (v.liq / p.entry_liq - 1) : null;
    const tile = (k, val, c) => `<div class="tile"><div class="k">${k}</div><div class="v ${c || ""}">${val}</div></div>`;
    const short = p.mint.slice(0, 6) + "…" + p.mint.slice(-6);
    const fresh = v.live && now - v.ts < 30;
    const cp = p.copy ? `<span class="pill xs ${p.copy.group === "fomo" ? "green" : ""}">copy · ${esc(p.copy.name || p.copy.wallet.slice(0, 4) + "…" + p.copy.wallet.slice(-3))}${p.copy.group ? " · " + esc(p.copy.group) : ""}</span>` : "";
    const tiles = [
      tile("Entry MC", p.entry_mc ? usdK(p.entry_mc) : mcOf(p.entry)), tile("Entry price", fp(p.entry)),
      tile("Put in", money(p.orig_size || p.size) + (p.tp1 ? ` <span class="ter px">${money(p.size)} still held</span>` : "")),
      tile("If sold now", money(v.net, true), cls(v.net)),
      tile("Peak (MC)", `${mcOf(v.peak)} <span class="ter px">${pct(v.peak && p.entry ? 100 * (v.peak / p.entry - 1) : null)}</span>`, "green"),
      tile(p.stop_label === "stop at breakeven" ? "Stop · breakeven (MC)" : `Stop −${p.stop_pct}% (MC)`, `${mcOf(p.stop_price)} <span class="ter px">${pct(dist(p.stop_price))} away</span>`, "red"),
      v.trail ? tile(`Trailing ${p.trail_pct}% · on (MC)`, `${mcOf(v.trail)} <span class="ter px">${pct(dist(v.trail))} away</span>`, "orange")
        : tile(`Trail ${p.trail_pct}% · arms at (MC)`, `${mcOf(p.trail_arm)} <span class="ter px">${pct(dist(p.trail_arm))} to go</span>`, "orange"),
      p.tp1 ? tile("Half sold (tp1)", `${money(p.tp1.sold)} at ${pct(p.tp1.pct)} <span class="ter px ${cls(p.tp1.pnl)}">${money(p.tp1.pnl, true)} banked · ${hm(p.tp1.ts)}</span>`)
        : tile(`Sell half at +${p.tp1_target_pct}% (MC)`, `${mcOf(p.tp1_target)} <span class="ter px">${pct(dist(p.tp1_target))} to go</span>`, "green"),
      ...(p.tp2 ? [tile("Quarter sold (tp2)", `${money(p.tp2.sold)} at ${pct(p.tp2.pct)} <span class="ter px ${cls(p.tp2.pnl)}">${money(p.tp2.pnl, true)} banked · ${hm(p.tp2.ts)}</span>`)]
        : p.tp2_target ? [tile(`Sell a quarter at +${p.tp2_target_pct}% (MC)`, `${mcOf(p.tp2_target)} <span class="ter px">${pct(dist(p.tp2_target))} to go · then moonbag on ${p.moon_trail_pct}% trail</span>`, "green")] : []),
      ...(p.half && (p.tp2 || p.tp2_target_pct == null) ? [tile(p.tp2 ? "Moonbag" : "Second half", halfLabel(p.half, p) + (p.half.target ? ` <span class="ter px">${mcOf(p.half.target)} · ${pct(dist(p.half.target))} to go</span>` : ""), p.half.target ? "green" : "")] : []),
      tile("Liquidity now", `${usdK(v.liq)} <span class="ter px ${cls(liqCh)}">${liqCh == null ? "—" : pct(liqCh)} vs entry</span>`),
      tile("Liquidity at entry", usdK(p.entry_liq)),
      tile("Opened", `${hm(p.opened_at)} <span class="ter px">${new Date(p.opened_at * 1000).toLocaleDateString([], { day: "numeric", month: "short" })}</span>`), tile("Time in trade", dur(now - p.opened_at))];
    const detOpen = S.posOpenDetails && S.posOpenDetails.has(p.mint) ? " open" : "";
    return `<div class="pcard">
      <button class="ch-head" data-coin="${esc(p.mint)}">${avatar(p.name || p.symbol, p.icon, "lg")}<div class="nm"><div class="n">${esc(p.name || p.symbol || short)}</div>
        <div class="s">${p.symbol ? "$" + esc(p.symbol) : ""} <span class="pill ${p.mode === "LIVE" ? "live" : "paper"} xs">${esc(p.mode || st.mode)}</span> ${cp}</div></div>
        <span class="upd ${fresh ? "on" : "off"}"><i></i>${v.live ? "live" : "desk"} · <span class="pago" data-ts="${v.ts || 0}">${v.ts ? agoS(now - v.ts) : "—"}</span></span></button>
      <div class="prows">
        <div class="prow"><div class="k">Bought</div><div class="v boughtv">${money(v.bought)}</div></div>
        <div class="prow"><div class="k">Sold</div><div class="r"><div class="v soldv">${money(v.soldRecv)}</div>
          <div class="sub ${v.soldCost ? cls(v.soldPnl) : "ter"}">${v.soldCost ? money(v.soldPnl, true) + " profit" : "Nothing sold yet"}</div></div></div>
        <div class="prow"><div class="k">Holding</div><div class="r"><div class="v holdv">${money(v.value)}</div>
          <div class="sub ${cls(v.gross)}">${v.gross == null ? "—" : money(v.gross, true)}</div></div></div>
      </div>
      <div class="ptotal"><div class="k">Total profit/loss</div><div class="r"><div class="v ${cls(v.total)}">${money(v.total, true)}</div>
        <div class="sub ${cls(v.totalPct)}">${pct(v.totalPct)}</div></div></div>
      <details class="pdetails"${detOpen} data-mint="${esc(p.mint)}"><summary>Details</summary><div class="grid2">${tiles.join("")}</div></details>
      <div class="mintrow"><span class="k">Mint</span><span class="m" title="${esc(p.mint)}">${esc(short)}</span><button class="copy" data-copy="${esc(p.mint)}">Copy</button></div>
      <div class="actbar"><a class="btn red" href="${esc(p.link)}" target="_blank" rel="noopener">Sell on FOMO</a><button class="btn grey" data-coin="${esc(p.mint)}">Chart</button></div>
      <div class="ter sm pnote">${esc(v.src)} · desk stop/trail as of ${ago(st.generated_at)}</div></div>`;
  }
  function positionsTab() {
    const st = S.data.state, now = Date.now() / 1000, ps = (st.positions || []).filter(p => p.status === "open");
    if (window.LivePos) LivePos.start(ps.map(p => p.mint), () => { if (S.tab === "positions" && !S.stack.length) positionsTab(); });
    if (!ps.length) { view.innerHTML = empty("○", "No open positions", "When the desk buys a coin it shows up here with the live holding value and P&L. Updated " + ago(st.generated_at) + ".") + `<div class="foot">${esc(st.mode)}</div>`; return; }
    const vs = ps.map(posLive), tin = ps.reduce((a, p) => a + (p.size || 0), 0), tval = vs.reduce((a, v) => a + (v.value || 0), 0);
    const tbank = vs.reduce((a, v) => a + (v.banked || 0), 0);
    const tunreal = vs.every(v => v.gross != null) ? vs.reduce((a, v) => a + v.gross, 0) : null;
    const ttotal = tunreal != null ? tunreal + tbank : null;
    view.innerHTML = `<div class="psum"><div><div class="k">Holding value · ${ps.length} open · ${esc(st.mode)}</div><div class="v holdtotal">${money(tval)}</div>
        <div class="ter sm">${money(tin)} still held${tbank ? " · " + money(tbank, true) + " banked" : ""}</div></div>
        <div class="r"><div class="k">Total P&amp;L</div><div class="big ${ttotal == null ? "" : ttotal >= 0 ? "green" : "red"}">${money(ttotal, true)}</div>
        <div class="ter sm">${tunreal == null ? "" : "Unrealized " + money(tunreal, true)}</div></div></div>
      ${ps.map(p => positionCard(p, st, now)).join("")}
      <div class="foot">${esc(st.mode)} · live prices every 5 s · desk data ${ago(st.generated_at)}</div>`;
  }
  setInterval(() => {
    const now = Date.now() / 1000;
    document.querySelectorAll(".pago").forEach(e => { const ts = +e.dataset.ts; if (ts) e.textContent = agoS(now - ts); });
    document.querySelectorAll(".sage").forEach(e => { const ts = +e.dataset.ts; if (ts) e.textContent = ageOld(ts); });
  }, 1000);
  function activityTab() {
    const it = S.data.activity.items || [];
    view.innerHTML = it.length ? `<div class="list">${it.map(actRow).join("")}</div>` : empty("○", "No activity yet", "Every buy, exit and rejection tonight is listed here.");
  }
  function accountTab() {
    const st = S.data.state;
    view.innerHTML = `<div class="card">
      <div class="kv"><span class="k">Mode</span><span class="val"><span class="pill ${st.mode === "PAPER" ? "paper" : "live"}">${st.mode}</span></span></div>
      <div class="kv"><span class="k">${st.mode === "PAPER" ? "PAPER balance" : "LIVE stack"} (with open)</span><span class="val">${money(st.equity)}</span></div>
      <div class="kv"><span class="k">Stack (closed trades)</span><span class="val">${money(st.stack)}</span></div>
      <div class="kv"><span class="k">Free</span><span class="val">${money(st.free)}</span></div>
      <div class="kv"><span class="k">FOMO</span><span class="val">${st.profile_url ? `<a href="${esc(st.profile_url)}" target="_blank" rel="noopener">@${esc(st.fomo_handle.replace(/^@/, ""))}</a>` : "—"}</span></div>
      <div class="kv"><span class="k">Telegram</span><span class="val ${st.telegram.ok ? "green" : "red"}">${st.telegram.ok ? "Connected" : "Not responding"} · ${ago(st.telegram.last)}</span></div>
      <div class="kv"><span class="k">Data</span><span class="val ter">updated ${ago(st.generated_at)}</span></div></div>
      <button class="btn blue" id="invite">Invite a friend to FOMO</button>
      <div class="h2">Settings</div><p class="ter" style="margin-top:0">Read-only here. Change any of them from Telegram, e.g. “set stop to -8%”.</p>
      <div class="card">${st.settings.map(s => `<div class="kv"><span class="k">${esc(s.key)}</span><span class="val">${esc(s.value)}${s.min != null ? `<div class="ter" style="font-size:12px">${s.min}–${s.max}</div>` : ""}</span></div>`).join("")}</div>
      <button class="btn grey" id="forget">Forget this phone</button>`;
  }

  // ---------- render / navigation ----------
  function render() {
    modePill();
    const top = S.stack[S.stack.length - 1];
    $("#back").classList.toggle("hidden", !top);
    document.body.classList.toggle("home5", !top && S.tab === "home" && S.loaded && !S.err);
    $("#title").innerHTML = !top && S.tab === "home" ? `<span class="logo">F</span>Desk` : esc(top ? ({ coin: (S.coin && S.coin.symbol ? "$" + S.coin.symbol : "Coin"), auditor: "Auditor", agent: top.name && top.name[0].toUpperCase() + top.name.slice(1) }[top.kind])
      : { home: "Desk", positions: "Positions", agents: "Bots", activity: "Activity", account: "Account" }[S.tab]);
    document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
    if (S.err && !S.loaded) { view.innerHTML = errorView(S.err); return; }
    if (!S.loaded) { view.innerHTML = loadingView(); return; }
    if (S.err && S.err.code !== "http") { view.innerHTML = errorView(S.err); return; }
    if ((!top || top.kind !== "coin") && window.Live) Live.stop();
    if ((top || (S.tab !== "positions" && S.tab !== "home")) && window.LivePos) LivePos.stop();
    if (top) return top.kind === "coin" ? coinScreen() : top.kind === "auditor" ? auditorScreen() : agentScreen(top.name);
    ({ home, positions: positionsTab, agents: agentsTab, activity: activityTab, account: accountTab })[S.tab]();
  }
  async function open(kind, arg) {
    S.stack.push({ kind, mint: arg, name: arg }); view.innerHTML = loadingView();
    if (kind === "coin") await loadCoin(arg); if (kind === "auditor") await loadAudit(arg || null); if (kind === "agent") await loadAgents();
    render(); scrollTo(0, 0);
  }
  document.addEventListener("toggle", e => {
    if (!e.target.classList || !e.target.classList.contains("pdetails")) return;
    const mint = e.target.dataset.mint;
    if (!mint) return;
    S.posOpenDetails = S.posOpenDetails || new Set();
    if (e.target.open) S.posOpenDetails.add(mint); else S.posOpenDetails.delete(mint);
  }, true);
  document.addEventListener("click", async e => {
    const t = e.target.closest("button,a"); if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; S.stack = []; if (S.tab === "agents") await loadAgents(); render(); scrollTo(0, 0); return; }
    if (t.id === "back") { S.stack.pop(); render(); return; }
    if (t.dataset.range) { S.range = t.dataset.range; render(); return; }
    if (t.dataset.tf) { window.Live && Live.setTf(t.dataset.tf); coinScreen(); return; }
    if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); toast("Mint copied"); } catch (err) { toast(t.dataset.copy); } return; }
    if (t.dataset.coin) return open("coin", t.dataset.coin);
    if (t.dataset.auditor !== undefined) return open("auditor", t.dataset.auditor);
    if (t.dataset.agent) return t.dataset.agent === "auditor" ? open("auditor", "") : open("agent", t.dataset.agent);
    if (t.id === "termtoggle") { S.forceTerm = !S.forceTerm; render(); return; }
    if (t.id === "retry") { S.err = null; S.loaded = false; render(); return refresh(); }
    if (t.id === "invite") {
      const url = S.data.state.signup_url;
      try { if (navigator.share) { await navigator.share({ title: "FOMO", url }); return; } } catch (err) { if (err.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(url); toast("Invite link copied"); } catch (err) { toast(url); }
      return;
    }
    if (t.id === "forget") { Desk.forget(); Desk.creds = {}; S.loaded = false; S.err = { code: "nolink" }; render(); }
  });
  window.addEventListener("resize", () => { if (S.loaded) render(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  render(); refresh(); setInterval(refresh, 15000);
  setInterval(() => { const c = $("#clock"); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }, 10000);
})();
