// crypto.js - private link handling + AES-256-GCM decryption with WebCrypto. Nothing is ever sent anywhere.
const Desk = window.Desk = window.Desk || {};
(function () {
  const LS_PATH = "desk.data_path", LS_KEY = "desk.data_key";
  function b64u(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  // Opened once as {URL}#d={DATA_PATH}.{base64url DATA_KEY}: store both, then remove the fragment from the address bar/history.
  Desk.readFragment = function () {
    const m = /^#d=([A-Za-z0-9]+)\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
    if (m) { localStorage.setItem(LS_PATH, m[1]); localStorage.setItem(LS_KEY, m[2]); history.replaceState(null, "", location.pathname + location.search); }
    return { path: localStorage.getItem(LS_PATH), key: localStorage.getItem(LS_KEY) };
  };
  Desk.forget = function () { localStorage.removeItem(LS_PATH); localStorage.removeItem(LS_KEY); };
  let cryptoKey = null;
  Desk.fetchBlob = async function (rel, type) {          // binary data file (the Live screenshot), same AES-GCM key
    const c = Desk.creds;
    if (!c || !c.path || !c.key) throw Object.assign(new Error("no link"), { code: "nolink" });
    if (!cryptoKey) cryptoKey = await crypto.subtle.importKey("raw", b64u(c.key), "AES-GCM", false, ["decrypt"]);
    const r = await fetch(`d/${c.path}/${rel}`, { cache: "force-cache" });      // hashed name changes with every capture
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { code: "http" });
    const buf = new Uint8Array(await r.arrayBuffer());
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, cryptoKey, buf.slice(12));
    return new Blob([pt], { type: type || "application/octet-stream" });
  };
  Desk.fetchData = async function (rel) {
    const c = Desk.creds;
    if (!c || !c.path || !c.key) throw Object.assign(new Error("no link"), { code: "nolink" });
    if (!cryptoKey) cryptoKey = await crypto.subtle.importKey("raw", b64u(c.key), "AES-GCM", false, ["decrypt"]);
    const r = await fetch(`d/${c.path}/${rel}?t=${Date.now()}`, { cache: "no-store" });
    if (r.status === 404) throw Object.assign(new Error("not found"), { code: "404" });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { code: "http" });
    const buf = new Uint8Array(await r.arrayBuffer());
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, cryptoKey, buf.slice(12));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { throw Object.assign(new Error("decrypt"), { code: "key" }); }
  };
})();
