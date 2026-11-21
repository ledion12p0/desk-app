// chart.js - hand-drawn canvas charts (glowing P&L line with trade bubbles, candles, mini coin chart). No libraries.
(function () {
  const C = { green: "#1ed760", red: "#ff4d4d", blue: "#3d8bff", orange: "#ffa31a", cyan: "#3fd0ff", sec: "rgba(235,235,245,0.62)", ter: "rgba(235,235,245,0.34)", sep: "rgba(255,255,255,0.08)" };
  const FONT = "-apple-system,BlinkMacSystemFont,Inter,Roboto,system-ui,sans-serif";
  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = `11px ${FONT}`; return { g, w, h };
  }
  function money(v) { return "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // smooth path that passes through every point (Catmull-Rom -> Bezier, y clamped between neighbours to avoid overshoot)
  function smooth(g, P) {
    g.moveTo(P[0][0], P[0][1]);
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) / 6))];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) / 6))];
      g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
    }
  }
  function bubbleText(m) {
    if (m.pill) return m.pill;
    const amt = m.amount != null ? money(m.amount) : (m.value || "").split(" / ")[0].replace(/^[+-]/, "");
    return m.kind === "bought" ? `bought ${amt}` : m.kind === "stopped" ? `stopped -${amt}` : `sold ${(m.amount == null || m.amount >= 0) ? "+" : "-"}${amt}`;
  }
  function dot(g, x, y, col) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = "#000"; g.lineWidth = 1.5; g.stroke(); }
  // bubbles never overlap: newest first; try above, then below; if neither fits only the dot is drawn
  function bubble(g, w, h, x, y, m, col, placed) {
    const name = m.name || m.symbol || "?", ini = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "•", txt = bubbleText(m);
    const plain = !!m.pill;
    g.font = `800 12.5px ${FONT}`; const bw = g.measureText(txt).width + (plain ? 20 : 34), bh = plain ? 26 : 24, bx = Math.min(w - bw - 4, Math.max(4, x - bw / 2));
    const hit = r => placed.some(q => r.x < q.x + q.w + 4 && q.x < r.x + r.w + 4 && r.y < q.y + q.h + 3 && q.y < r.y + r.h + 3);
    const cand = [y - bh - 12, y + 12].map(by => ({ x: bx, y: by, w: bw, h: bh })).filter(r => r.y >= 2 && r.y + r.h <= h - 22 && !hit(r));
    if (cand.length) {
      const r = cand[0]; placed.push(r);
      g.strokeStyle = col; g.globalAlpha = .45; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x, r.y > y ? r.y : r.y + bh); g.stroke(); g.globalAlpha = 1;
      g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 10; rrect(g, r.x, r.y, bw, bh, 12); g.fillStyle = "rgba(20,21,24,.95)"; g.fill(); g.restore();
      rrect(g, r.x, r.y, bw, bh, 12); g.strokeStyle = col; g.globalAlpha = .6; g.stroke(); g.globalAlpha = 1;
      if (plain) { rrect(g, r.x, r.y, bw, bh, 13); g.fillStyle = col; g.fill();
        g.fillStyle = "#000"; g.font = `800 12.5px ${FONT}`; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(txt, r.x + 10, r.y + bh / 2 + .5); g.textBaseline = "alphabetic"; }
      else {
      g.beginPath(); g.arc(r.x + 12, r.y + bh / 2, 8.5, 0, 7); g.fillStyle = col; g.fill();
      g.fillStyle = "#000"; g.font = `800 10px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ini, r.x + 12, r.y + bh / 2 + .5);
      g.fillStyle = "#fff"; g.font = `700 11.5px ${FONT}`; g.textAlign = "left"; g.fillText(txt, r.x + 25, r.y + bh / 2 + .5); g.textBaseline = "alphabetic"; }
    }
    dot(g, x, y, col);
  }
  // points [[ts, value]], marks [{ts, kind, name, amount}], base = the value P&L is measured from
  window.drawLine = function (cv, points, marks, t0, t1, base, opts) {
    opts = opts || {};
    const { g, w, h } = setup(cv); const pad = { l: 18, r: 26, t: 40, b: 34 };
    let pts = points.filter(p => p[0] >= t0 && p[0] <= t1);
    const before = points.filter(p => p[0] < t0).pop(); if (before) pts.unshift([t0, before[1]]);
    if (pts.length && pts[pts.length - 1][0] < t1) pts.push([t1, pts[pts.length - 1][1]]);
    if (pts.length < 2) { g.fillStyle = C.ter; g.textAlign = "center"; g.font = `13px ${FONT}`; g.fillText("No balance points in this range yet", w / 2, h / 2); return; }
    let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    if (base != null) { lo = Math.min(lo, base); hi = Math.max(hi, base); }
    const top = hi;
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; } else { const m = (hi - lo) * .08; lo -= m; hi += m; }
    const X = t => pad.l + (w - pad.l - pad.r) * (t - t0) / Math.max(1, t1 - t0), Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const last = pts[pts.length - 1][1], up = last >= (base != null ? base : pts[0][1]), col = up ? C.green : C.red;
    const P = pts.map(p => [X(p[0]), Y(p[1])]);
    // faint grid
    g.strokeStyle = "rgba(255,255,255,0.045)"; g.lineWidth = 1;
    for (let i = 0; i <= 3; i++) { const y = pad.t + (h - pad.t - pad.b) * i / 3; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    if (base != null) { g.setLineDash([3, 5]); g.strokeStyle = "rgba(255,255,255,0.16)"; g.beginPath(); g.moveTo(0, Y(base)); g.lineTo(w, Y(base)); g.stroke(); g.setLineDash([]); }
    // area fill
    const grad = g.createLinearGradient(0, pad.t, 0, h); grad.addColorStop(0, up ? "rgba(30,215,96,0.28)" : "rgba(255,77,77,0.26)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.beginPath(); smooth(g, P); g.lineTo(P[P.length - 1][0], h); g.lineTo(P[0][0], h); g.closePath(); g.fillStyle = grad; g.fill();
    // glowing line
    g.save(); g.shadowColor = col; g.shadowBlur = 14; g.beginPath(); smooth(g, P); g.strokeStyle = col; g.lineWidth = 2.6; g.lineJoin = "round"; g.lineCap = "round"; g.stroke(); g.restore();
    // trade bubbles (real positions only)
    const valAt = t => { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= t) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / Math.max(1e-9, b[0] - a[0]); } return pts[pts.length - 1][1]; };
    const placed = [];
    let ms = (marks || []).filter(m => m.ts >= t0 && m.ts <= t1);
    if (opts.lastOnly) ms = ms.filter(m => m.kind !== "bought").sort((a, b) => a.ts - b.ts).slice(-1);        // Home: only the latest real sell, pill = its P&L
    ms.slice(-10).reverse().forEach(m => {
      const mc = m.kind === "bought" ? C.blue : m.kind === "sold" && !(m.amount < 0) ? C.green : C.red;
      bubble(g, w, h, X(m.ts), Y(valAt(m.ts)), m, mc, placed);
    });
    // live dot at the latest point
    const lp = P[P.length - 1]; const lx = Math.min(lp[0], w - pad.r + 8);
    g.beginPath(); g.arc(lx, lp[1], 9, 0, 7); g.fillStyle = up ? "rgba(30,215,96,0.22)" : "rgba(255,77,77,0.22)"; g.fill();
    g.save(); g.shadowColor = col; g.shadowBlur = 12; g.beginPath(); g.arc(lx, lp[1], 4.5, 0, 7); g.fillStyle = col; g.fill(); g.restore();
    g.beginPath(); g.arc(lx, lp[1], 2, 0, 7); g.fillStyle = "#fff"; g.fill();
    // axis labels
    g.font = `11px ${FONT}`; g.fillStyle = C.ter; g.textAlign = "left";
    const tl = t => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    g.fillText(tl(t0), pad.l, h - 10); g.textAlign = "right"; g.fillText("now", w - pad.r + 10, h - 10);
    g.textAlign = "right"; if (!opts.noHigh) g.fillText("high " + money(top), w - 6, pad.t - 8);
    return { x: lx, y: lp[1], up };
  };
  // mini chart for the featured coin: 5-min candles when there are enough, otherwise the real price line
  window.drawMini = function (cv, line, candles) {
    const { g, w, h } = setup(cv); const pad = 4;
    const useC = candles && candles.length >= 6 && candles.some(c => c[2] > c[3]);
    const vals = useC ? candles.flatMap(c => [c[2], c[3]]) : line.map(p => p[1]);
    if (vals.length < 2) { g.fillStyle = C.ter; g.textAlign = "center"; g.fillText("Not enough price ticks yet", w / 2, h / 2); return; }
    let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1e-15) { hi *= 1.01; lo *= 0.99; }
    const Y = v => pad + (h - 2 * pad) * (1 - (v - lo) / (hi - lo));
    if (useC) {
      const cw = (w - 2 * pad) / candles.length;
      candles.forEach((c, i) => { const x = pad + i * cw + cw / 2, col = c[4] >= c[1] ? C.green : C.red; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, Y(c[2])); g.lineTo(x, Y(c[3])); g.stroke();
        g.fillRect(x - Math.max(1.5, cw * 0.32), Y(Math.max(c[1], c[4])), Math.max(3, cw * 0.64), Math.max(1.5, Math.abs(Y(c[1]) - Y(c[4])))); });
      return;
    }
    const t0 = line[0][0], t1 = line[line.length - 1][0], X = t => pad + (w - 2 * pad) * (t - t0) / Math.max(1, t1 - t0);
    const up = line[line.length - 1][1] >= line[0][1], col = up ? C.green : C.red, P = line.map(p => [X(p[0]), Y(p[1])]);
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, up ? "rgba(30,215,96,0.25)" : "rgba(255,77,77,0.22)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.beginPath(); smooth(g, P); g.lineTo(P[P.length - 1][0], h); g.lineTo(P[0][0], h); g.closePath(); g.fillStyle = grad; g.fill();
    g.save(); g.shadowColor = col; g.shadowBlur = 8; g.beginPath(); smooth(g, P); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.restore();
    const l = P[P.length - 1]; g.beginPath(); g.arc(l[0] - 1, l[1], 3.5, 0, 7); g.fillStyle = col; g.fill();
  };
  // faint balance sparkline behind the hero number (ALL range)
  window.drawSpark = function (cv, points, base) {
    if (!cv) return; const { g, w, h } = setup(cv);
    const pts = (points || []).slice(); if (pts.length < 2) return;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    let lo = Math.min(...pts.map(p => p[1]), base), hi = Math.max(...pts.map(p => p[1]), base); if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const flat = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1])) < 1e-9;
    const P = pts.map(p => [w * (p[0] - t0) / Math.max(1, t1 - t0), flat ? h - 6 : h - 4 - (h * 0.55) * (p[1] - lo) / (hi - lo)]);
    const up = pts[pts.length - 1][1] >= base, col = up ? C.green : C.red;
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, up ? "rgba(30,215,96,0.16)" : "rgba(255,77,77,0.14)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.beginPath(); smooth(g, P); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = grad; g.fill();
    g.save(); g.globalAlpha = .45; g.shadowColor = col; g.shadowBlur = 10; g.beginPath(); smooth(g, P); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.restore();
  };
  // candles [[t,o,h,l,c,v]], lines [{price, color, dash, label}]
  window.drawCandles = function (cv, candles, lines) {
    const { g, w, h } = setup(cv); const pad = { l: 4, r: 64, t: 10, b: 16 };
    if (!candles.length) { g.fillStyle = C.ter; g.textAlign = "center"; g.fillText("No price data yet", w / 2, h / 2); return; }
    const cs = candles.slice(-90); let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2]));
    (lines || []).forEach(l => { if (l.price) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); } });
    if (hi - lo < 1e-15) { hi *= 1.01; lo *= 0.99; }
    const Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo)), cw = (w - pad.l - pad.r) / cs.length;
    g.strokeStyle = "rgba(255,255,255,0.045)"; for (let i = 0; i <= 4; i++) { const y = pad.t + (h - pad.t - pad.b) * i / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(w - pad.r, y); g.stroke(); }
    if (!cs.some(c => c[2] > c[3]) && cs.length > 1) {   // one price tick per candle: draw the real price line instead of flat dashes
      const up = cs[cs.length - 1][4] >= cs[0][4], col = up ? C.green : C.red, P = cs.map((c, i) => [pad.l + i * cw + cw / 2, Y(c[4])]);
      g.save(); g.shadowColor = col; g.shadowBlur = 10; g.beginPath(); smooth(g, P); g.strokeStyle = col; g.lineWidth = 2.2; g.stroke(); g.restore();
      P.forEach(p => { g.beginPath(); g.arc(p[0], p[1], 2.2, 0, 7); g.fillStyle = col; g.fill(); });
    } else cs.forEach((c, i) => {
      const x = pad.l + i * cw + cw / 2, up = c[4] >= c[1], col = up ? C.green : C.red;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(c[2])); g.lineTo(x, Y(c[3])); g.stroke();
      const top = Y(Math.max(c[1], c[4])), bh = Math.max(1, Math.abs(Y(c[1]) - Y(c[4])));
      g.fillRect(x - Math.max(1, cw * 0.35), top, Math.max(2, cw * 0.7), bh);
    });
    (lines || []).forEach(l => {
      if (!l.price) return; const y = Y(l.price);
      g.setLineDash(l.dash ? [6, 4] : []); g.strokeStyle = l.color; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r + 4, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = l.color; g.textAlign = "left"; g.fillText(l.label, w - pad.r + 6, y + 4);
    });
  };
})();
// ---- coin panel ----
(function () {
  const C = { green: "#1ed760", red: "#ff4d4d", ter: "rgba(235,235,245,0.38)", grid: "rgba(255,255,255,0.05)" };
  const FONT = "-apple-system,BlinkMacSystemFont,Inter,Roboto,system-ui,sans-serif";
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  // tiny meme prices the DexScreener way: 0.00009208 -> $0.0₄9208 (4 significant digits)
  // plain decimals with 4 significant digits: 0.00002991 -> $0.00002991 (no subscript notation)
  window.fmtPrice = function (v, noDollar) {
    if (v == null || !isFinite(v)) return "—"; const d = noDollar ? "" : "$", a = Math.abs(v);
    if (a >= 1000) return d + a.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (a >= 1) return d + a.toFixed(a >= 100 ? 2 : 3);
    if (a === 0) return d + "0";
    const dec = Math.min(14, Math.ceil(-Math.log10(a)) + 3);
    return d + a.toFixed(dec);
  };
  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); return { g, w, h };
  }
  function tag(g, x, y, text, bg, fg) {
    g.font = `700 10.5px ${FONT}`; const tw = g.measureText(text).width + 10, th = 17;
    g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(x, y - th / 2, tw, th, 4) : g.rect(x, y - th / 2, tw, th); g.fill();
    g.fillStyle = fg; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(text, x + 5, y + .5); g.textBaseline = "alphabetic";
  }
  // candles [[t,o,h,l,c,v]] oldest first; lines [{price,color,dash,label}]; marks [{ts,kind:'buy'|'sell',color}]; step = candle seconds
  // opts.fmt formats axis/tag values (the panel passes a market-cap formatter: candles/lines are already scaled to MC)
  window.drawPrice = function (cv, candles, lines, marks, step, opts) {
    const fmt = (opts && opts.fmt) || (v => fmtPrice(v, true));
    const { g, w, h } = setup(cv); const pad = { l: 6, r: 92, t: 12, b: 22 }, volH = 34;
    if (!candles.length) { g.fillStyle = C.ter; g.font = `13px ${FONT}`; g.textAlign = "center"; g.fillText("Waiting for price data…", w / 2, h / 2); return; }
    const pw = w - pad.l - pad.r, slot = 6.5, n = Math.max(10, Math.min(candles.length, Math.floor(pw / slot)));
    const cs = candles.slice(-n), cw = pw / n;
    let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2]));
    const span0 = Math.max(hi - lo, hi * 0.02);
    (lines || []).forEach(l => { if (l.price && l.price > lo - span0 * 1.5 && l.price < hi + span0 * 1.5) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); } });
    if (hi - lo < hi * 1e-6) { hi *= 1.01; lo *= 0.99; } const m = (hi - lo) * 0.06; hi += m; lo -= m;
    const ph = h - pad.t - pad.b, Y = v => pad.t + ph * (1 - (v - lo) / (hi - lo)), X = i => pad.l + i * cw + cw / 2;
    // grid + price axis
    g.font = `10.5px ${FONT}`; g.textAlign = "left"; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); g.strokeStyle = C.grid; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); }
    // volume
    const vmax = Math.max(...cs.map(c => c[5] || 0));
    if (vmax > 0) cs.forEach((c, i) => { const vh = volH * (c[5] || 0) / vmax; g.fillStyle = c[4] >= c[1] ? "rgba(30,215,96,.18)" : "rgba(255,77,77,.18)"; g.fillRect(X(i) - cw * .35, h - pad.b - vh, Math.max(1.5, cw * .7), vh); });
    // candles
    cs.forEach((c, i) => {
      const x = X(i), up = c[4] >= c[1], col = up ? C.green : C.red; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(x) + .5, Y(c[2])); g.lineTo(Math.round(x) + .5, Y(c[3])); g.stroke();
      const top = Y(Math.max(c[1], c[4])), bh = Math.max(1, Math.abs(Y(c[1]) - Y(c[4])));
      g.fillRect(x - Math.max(1, cw * .34), top, Math.max(2, cw * .68), bh);
    });
    // buy / sell markers on the candle they happened in
    (marks || []).forEach(mk => {
      const i = cs.findIndex(c => mk.ts >= c[0] && mk.ts < c[0] + step); if (i < 0) return;
      const x = X(i), c = cs[i], buy = mk.kind === "buy", y = buy ? Y(c[3]) + 7 : Y(c[2]) - 7;
      g.fillStyle = mk.color; g.beginPath();
      if (buy) { g.moveTo(x, y); g.lineTo(x - 5, y + 8); g.lineTo(x + 5, y + 8); } else { g.moveTo(x, y); g.lineTo(x - 5, y - 8); g.lineTo(x + 5, y - 8); }
      g.closePath(); g.fill();
      g.font = `800 9px ${FONT}`; g.textAlign = "center"; g.fillText(buy ? "B" : "S", x, buy ? y + 18 : y - 11);
    });
    // horizontal lines + right-side tags, pushed apart so they never overlap
    const last = cs[cs.length - 1][4], lastCol = last >= cs[0][1] ? C.green : C.red;
    const all = (lines || []).filter(l => l.price).map(l => ({ ...l })).concat([{ price: last, color: lastCol, label: "", now: true }]);
    all.forEach(l => { l.y = Math.min(h - pad.b - 8, Math.max(pad.t + 8, Y(l.price))); l.ty = l.y; l.off = Y(l.price) < pad.t || Y(l.price) > h - pad.b; });
    all.sort((a, b) => a.ty - b.ty);
    for (let i = 1; i < all.length; i++) if (all[i].ty - all[i - 1].ty < 18) all[i].ty = all[i - 1].ty + 18;
    for (let i = all.length - 2; i >= 0; i--) if (all[i + 1].ty > h - pad.b - 8 && all[i + 1].ty - all[i].ty < 18) { all[i + 1].ty = h - pad.b - 8; all[i].ty = Math.min(all[i].ty, all[i + 1].ty - 18); }
    all.forEach(l => {
      if (!l.off) { g.setLineDash(l.now ? [2, 3] : l.dash ? [6, 4] : []); g.strokeStyle = l.color; g.globalAlpha = l.now ? .8 : .9; g.lineWidth = l.now ? 1 : 1.4;
        g.beginPath(); g.moveTo(pad.l, l.y); g.lineTo(w - pad.r + 2, l.y); if (Math.abs(l.ty - l.y) > 1) g.lineTo(w - pad.r + 4, l.ty); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
      const txt = (l.label ? l.label + " " : "") + fmt(l.price) + (l.off ? (Y(l.price) < pad.t ? " ↑" : " ↓") : "");
      tag(g, w - pad.r + 3, l.ty, txt, l.color, l.fg || (l.now ? "#000" : "#fff"));
    });
    // price axis labels, skipped where a line tag already sits
    g.font = `10.5px ${FONT}`; g.textAlign = "left"; g.fillStyle = C.ter;
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); if (!all.some(l => Math.abs(l.ty - y) < 13)) g.fillText(fmt(v), w - pad.r + 6, y + 3.5); }
    // time axis
    g.font = `10.5px ${FONT}`; g.fillStyle = C.ter; g.textAlign = "center";
    const tl = t => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const every = Math.max(1, Math.round(n / 4));
    for (let i = n - 1; i >= 0; i -= every) if (cs[i] && X(i) > 22) g.fillText(tl(cs[i][0]), X(i), h - 6);
  };
})();
