// live.js - near-live market data for the coin panel, fetched straight from the phone from two PUBLIC, key-less APIs
// (both send Access-Control-Allow-Origin: *):
//   DexScreener  api.dexscreener.com/latest/dex/pairs/solana/{pool}      price, market cap, liquidity, volume, txns  every 10 s
//   GeckoTerminal api.geckoterminal.com/api/v2/networks/solana/pools/{pool}/ohlcv/minute   1m/5m/15m candles       every 30 s
// No cookies, no referrer, nothing from the desk is sent (only the public pool/mint address). Paused while the app is hidden.
// If either API fails the panel keeps showing the desk's published (encrypted) snapshot. Never builds a FOMO link.
(function () {
  const DX_PAIR = "https://api.dexscreener.com/latest/dex/pairs/solana/", DX_TOKEN = "https://api.dexscreener.com/tokens/v1/solana/";
  const GT = "https://api.geckoterminal.com/api/v2/networks/solana/pools/";
  const DX_EVERY = 10000, GT_EVERY = 30000, TFS = { "1m": 1, "5m": 5, "15m": 15 };
  const L = window.Live = { mint: null, pool: null, pair: null, pairTs: 0, ohlc: {}, ohlcTs: {}, tf: "1m", dxErr: null, gtErr: null, onUpdate: null };
  let tDx = null, tGt = null, busyDx = false, busyGt = false;
  const B58 = /^[A-Za-z0-9]{20,64}$/;          // address-shaped only (base58 in practice); nothing else goes in a URL

  async function getJSON(url) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ac.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", mode: "cors" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const num = v => (v == null || v === "" || isNaN(+v)) ? null : +v;
  // DexScreener pair -> the few numbers the panel shows
  L.readPair = function (p) {
    if (!p || !p.priceUsd) return null;
    const tx = p.txns || {}, vol = p.volume || {}, ch = p.priceChange || {};
    return { price: num(p.priceUsd), mc: num(p.marketCap) || num(p.fdv), fdv: num(p.fdv), liq: num(p.liquidity && p.liquidity.usd),
      vol_h1: num(vol.h1), vol_h24: num(vol.h24), vol_m5: num(vol.m5), ch_m5: num(ch.m5), ch_h1: num(ch.h1), ch_h6: num(ch.h6), ch_h24: num(ch.h24),
      buys_h1: tx.h1 ? tx.h1.buys : null, sells_h1: tx.h1 ? tx.h1.sells : null, buys_h24: tx.h24 ? tx.h24.buys : null, sells_h24: tx.h24 ? tx.h24.sells : null,
      created: p.pairCreatedAt ? p.pairCreatedAt / 1000 : null, dex: p.dexId || null, pool: p.pairAddress || null };
  };
  async function pollDx() {
    if (busyDx || !L.mint || document.hidden) return; busyDx = true;
    try {
      let pair = null;   // ?_= cache-buster: DexScreener's CDN otherwise serves the same answer for up to 30 s
      if (L.pool) { const j = await getJSON(DX_PAIR + L.pool + "?_=" + Date.now()); pair = (j.pairs && j.pairs[0]) || j.pair || null; }
      if (!pair) {                                   // no pool known yet: the token's most liquid pair
        const arr = await getJSON(DX_TOKEN + L.mint + "?_=" + Date.now()); const list = Array.isArray(arr) ? arr : (arr.pairs || []);
        pair = list.sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0] || null;
        if (pair && pair.pairAddress && B58.test(pair.pairAddress)) L.pool = pair.pairAddress;
      }
      const d = L.readPair(pair); if (!d) throw new Error("no pair");
      if (L.pair && d.price !== L.pair.price) { L.flash = d.price > L.pair.price ? "up" : "dn"; L.flashTs = Date.now(); L.changedTs = Date.now() / 1000; }
      if (!L.pair) L.changedTs = Date.now() / 1000;
      L.pair = d; L.pairTs = Date.now() / 1000; L.dxErr = null; L.polls = (L.polls || 0) + 1;
    } catch (e) { L.dxErr = String(e.message || e); }
    busyDx = false; L.onUpdate && L.onUpdate("dx");
    if (L.pool && !L.ohlc[L.tf] && !busyGt) pollGt(false);          // no candles yet (e.g. a 429): retry on the 10 s beat, not 30 s
  }
  async function pollGt(force) {
    if (busyGt || !L.pool || (document.hidden && !force)) return; busyGt = true;
    const tf = L.tf, agg = TFS[tf];
    try {
      const j = await getJSON(`${GT}${L.pool}/ohlcv/minute?aggregate=${agg}&limit=${agg === 1 ? 120 : 100}&currency=usd&token=base&_=${Date.now()}`);
      const list = (((j || {}).data || {}).attributes || {}).ohlcv_list || [];
      if (!list.length) throw new Error("no candles");
      L.ohlc[tf] = list.map(r => [r[0], +r[1], +r[2], +r[3], +r[4], +r[5]]).sort((a, b) => a[0] - b[0]);
      L.ohlcTs[tf] = Date.now() / 1000; L.gtErr = null;
    } catch (e) { L.gtErr = String(e.message || e); }
    busyGt = false; L.onUpdate && L.onUpdate("gt");
  }
  L.start = function (mint, pool, onUpdate) {
    L.onUpdate = onUpdate;
    if (mint === L.mint && tDx) return;
    L.stop(); if (!mint || !B58.test(mint)) return;
    L.mint = mint; L.pool = pool && B58.test(pool) ? pool : null; L.pair = null; L.flash = null; L.polls = 0; L.pairTs = 0; L.ohlc = {}; L.ohlcTs = {}; L.dxErr = L.gtErr = null;
    pollDx().then(() => pollGt(true));
    tDx = setInterval(pollDx, DX_EVERY); tGt = setInterval(() => pollGt(false), GT_EVERY);
  };
  L.stop = function () { clearInterval(tDx); clearInterval(tGt); tDx = tGt = null; L.mint = null; };
  L.setTf = function (tf) { if (!TFS[tf]) return; L.tf = tf; if (!L.ohlc[tf]) pollGt(true); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && L.mint) { pollDx(); pollGt(false); } });

  // candles for the chart: GeckoTerminal for the chosen timeframe, the newest one nudged by the live DexScreener price;
  // otherwise the desk's own price ticks bucketed to the timeframe with gaps carried forward (continuous, flat where no trade)
  L.candles = function (deskCandles) {
    const step = TFS[L.tf] * 60, now = Date.now() / 1000;
    let cs = L.bucket((L.ohlc[L.tf] || []).map(c => c.slice()), step, true), src = "geckoterminal";   // GeckoTerminal skips minutes with no trades: carry the close forward
    if (!cs.length) { cs = L.bucket(deskCandles || [], step); src = "desk"; }
    const p = L.pair && now - L.pairTs < 60 ? L.pair.price : null;
    if (p && cs.length) {
      const b = Math.floor(now / step) * step, last = cs[cs.length - 1];
      if (last[0] === b) { last[2] = Math.max(last[2], p); last[3] = Math.min(last[3], p); last[4] = p; }
      else if (b > last[0] && b - last[0] <= step * 3) cs.push([b, last[4], Math.max(last[4], p), Math.min(last[4], p), p, 0]);
    }
    return { candles: cs, src };
  };
  L.bucket = function (raw, step, keepVol) {
    if (!raw.length) return [];
    const m = new Map();
    raw.forEach(r => { const b = Math.floor(r[0] / step) * step, k = m.get(b);
      if (!k) m.set(b, [b, r[1], r[2], r[3], r[4], keepVol ? r[5] || 0 : 0]); else { if (keepVol) k[5] += r[5] || 0;   // volume 0: desk ticks only carry a sampled 5-min volume
      k[2] = Math.max(k[2], r[2]); k[3] = Math.min(k[3], r[3]); k[4] = r[4]; } });
    const keys = [...m.keys()].sort((a, b) => a - b), out = [];
    for (let t = keys[0], prev = null; t <= keys[keys.length - 1]; t += step) {
      const k = m.get(t);
      if (k) { if (prev) { k[1] = prev[4]; k[2] = Math.max(k[2], k[1]); k[3] = Math.min(k[3], k[1]); } out.push(k); prev = k; }           // open = previous close: no floating gaps
      else if (prev) { const c = prev[4]; prev = [t, c, c, c, c, 0]; out.push(prev); }
    }
    return out.slice(-150);
  };

  // ---------- Positions tab: every open position's price / market cap / liquidity in ONE DexScreener call ----------
  // api.dexscreener.com/tokens/v1/solana/{mint,mint,...} (public, key-less, CORS *), every 5 s while the tab is open and
  // the app is visible. Same pair choice as the desk's Risk agent: the PumpSwap pair, else the most liquid one.
  const P = window.LivePos = { mints: [], by: {}, ts: 0, err: null, onUpdate: null, polls: 0 };
  const POS_EVERY = 5000; let tPos = null, busyPos = false;
  P.pick = function (list, mint) {
    const mine = (list || []).filter(p => p && p.baseToken && p.baseToken.address === mint);
    const ps = mine.filter(p => p.dexId === "pumpswap");
    const pool = (ps.length ? ps : mine).sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0));
    return pool[0] || null;
  };
  async function pollPos() {
    if (busyPos || !P.mints.length || document.hidden) return; busyPos = true;
    try {
      const arr = await getJSON(DX_TOKEN + P.mints.slice(0, 30).join(",") + "?_=" + Date.now());
      const list = Array.isArray(arr) ? arr : (arr.pairs || []), now = Date.now() / 1000;
      P.mints.forEach(m => { const d = L.readPair(P.pick(list, m)); if (d) P.by[m] = { ...d, ts: now }; });
      P.ts = now; P.err = null; P.polls++;
    } catch (e) { P.err = String(e.message || e); }
    busyPos = false; P.onUpdate && P.onUpdate();
  }
  P.start = function (mints, onUpdate) {
    P.onUpdate = onUpdate; const ms = (mints || []).filter(m => B58.test(m)).sort();
    if (tPos && ms.join() === P.mints.join()) return;
    P.stop(); P.mints = ms; if (!ms.length) return;
    pollPos(); tPos = setInterval(pollPos, POS_EVERY);
  };
  P.stop = function () { clearInterval(tPos); tPos = null; P.mints = []; };
  P.get = function (m) { const d = P.by[m]; return d && Date.now() / 1000 - d.ts < 60 ? d : null; };   // older than 60 s = not live
  document.addEventListener("visibilitychange", () => { if (!document.hidden && P.mints.length) pollPos(); });
})();
