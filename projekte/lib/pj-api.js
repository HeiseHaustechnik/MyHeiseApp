/* =====================================================================
   Heise Projekte (Aufmaß + Bautagebuch) – Anbindung an die My Heise App
   • gemeinsames Login über den Schlüssel „heiseSession“ (wie alle Module)
   • alle Daten laufen über die Supabase-Funktion pj_api()
   • PJ.api(pfad, {method, body}) verhält sich wie die frühere /api/-Schnittstelle
   ===================================================================== */
(function () {
  'use strict';
  const CFG = Object.assign({
    sb: 'https://bbjzfoirefcsqqgztjpt.supabase.co',
    key: 'sb_publishable_foIFF173jDFlX6KQ70vJPQ_kdoTBk6H',
    portal: '../index.html'
  }, window.PJ_CONFIG || {});
  const SB = CFG.sb, KEY = CFG.key, PORTAL = CFG.portal, SESS_KEY = 'heiseSession';
  // PDS_V2: PDS-Testbereich (nur Admin). Alle Datenbank-Funktionen laufen dann im Schema „pdstest“,
  // die echten Projekte bleiben unberührt. Umschalten über PJ.setTest(true/false).
  const TEST = (() => { try { return localStorage.getItem('pj_test') === '1' } catch (e) { return false } })();

  /* ---------- Sitzung ---------- */
  const AUTH = { access: null, refresh: null, exp: 0 }; let refreshP = null;
  const storedRefresh = () => { try { return (JSON.parse(localStorage.getItem(SESS_KEY) || 'null') || {}).r || null } catch (e) { return null } };
  function authSave(j) {
    AUTH.access = j.access_token; AUTH.refresh = j.refresh_token;
    AUTH.exp = j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000;
    try { localStorage.setItem(SESS_KEY, JSON.stringify({ r: AUTH.refresh })) } catch (e) { }
  }
  function authClear() { AUTH.access = null; AUTH.refresh = null; AUTH.exp = 0; try { localStorage.removeItem(SESS_KEY) } catch (e) { } }
  // Nach dem Login zurück an dieselbe Stelle: über die Weiche projekte.html im Hauptordner
  function toLogin() {
    const datei = location.pathname.split('/').pop() || 'index.html';
    location.replace(`${PORTAL}?next=${encodeURIComponent('projekte.html#' + datei + location.search + location.hash)}`);
  }
  async function refresh() {
    let r;
    try {
      r = await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ refresh_token: AUTH.refresh }) });
    } catch (e) { throw new Error('Keine Verbindung – bitte Netz prüfen') }   // offline: NICHT abmelden
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { authClear(); toLogin(); throw new Error('Sitzung abgelaufen – bitte neu anmelden') }
    authSave(j);
  }
  async function ensureToken() {
    if (AUTH.access && AUTH.exp - Date.now() > 60000) return AUTH.access;
    const r = storedRefresh() || AUTH.refresh;
    if (!r) { toLogin(); throw new Error('Nicht angemeldet') }
    AUTH.refresh = r;
    if (!refreshP) refreshP = refresh().finally(() => { refreshP = null });
    await refreshP; return AUTH.access;
  }
  async function req(path, body) {
    const tok = await ensureToken();
    let r;
    try {
      const h = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + tok };
      if (TEST && /^rpc\/(pj_|pds_)/.test(path)) { h['Accept-Profile'] = 'pdstest'; h['Content-Profile'] = 'pdstest'; }
      r = await fetch(`${SB}/rest/v1/${path}`, { method: 'POST', headers: h, body: JSON.stringify(body || {}) });
    } catch (e) { throw new Error('Keine Verbindung – bitte Netz prüfen') }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const m = (j && j.message) || r.statusText || 'Fehler';
      if (r.status === 401) { AUTH.access = null }
      throw new Error(/permission denied|42501/i.test(m) ? 'Dafür fehlt dir die Berechtigung' : m);
    }
    return j;
  }
  const rpc = (name, args) => req('rpc/' + name, args);
  const jwtSub = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub } catch (e) { return null } };

  /* ---------- frühere REST-Schnittstelle ---------- */
  async function api(path, opt = {}) {
    const method = (opt.method || 'GET').toUpperCase();
    let body = null;
    if (opt.body != null) body = typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body;
    return await rpc('pj_api', { p_method: method, p_path: String(path).replace(/^\/?(api\/)?/, ''), p_body: body });
  }

  /* Zusätzliche Arbeiten (supabase/zusatz.sql): gleiche Aufrufart, eigene Funktion pj_za */
  async function za(path, opt = {}) {
    const method = (opt.method || 'GET').toUpperCase();
    let body = null;
    if (opt.body != null) body = typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body;
    return await rpc('pj_za', { p_method: method, p_path: String(path), p_body: body });
  }

  /* Protokolle (supabase/protokolle.sql): gleiche Aufrufart, eigene Funktion pj_pr */
  async function pr(path, opt = {}) {
    const method = (opt.method || 'GET').toUpperCase();
    let body = null;
    if (opt.body != null) body = typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body;
    return await rpc('pj_pr', { p_method: method, p_path: String(path), p_body: body });
  }

  /* ---------- Zugriff prüfen ---------- */
  const ROLLE_KEY = 'pj_rolle';
  function setRolle(r) {
    PJ.rolle = r || null;
    if (r) document.documentElement.dataset.rolle = r; else delete document.documentElement.dataset.rolle;
    try { r ? localStorage.setItem(ROLLE_KEY, r) : localStorage.removeItem(ROLLE_KEY) } catch (e) { }
  }
  function keinZugriff(msg) {
    document.body.innerHTML = `<main class="shell"><div class="empty" style="margin-top:12vh"><b style="font-size:20px;display:block;margin-bottom:8px">Kein Zugriff</b>
      <div>${msg}</div><div style="margin-top:22px"><a class="btn cta" href="${PORTAL}">Zur My Heise App</a></div></div></main>`;
  }
  async function check() {
    try { setRolle(localStorage.getItem(ROLLE_KEY)) } catch (e) { }
    if (!storedRefresh()) { toLogin(); return null }
    if (!navigator.onLine) return PJ.rolle;                  // offline weiterarbeiten
    try {
      await ensureToken();
      const me = (await fetch(`${SB}/rest/v1/benutzer?auth_id=eq.${jwtSub(AUTH.access)}&select=id,name,rolle,pw_aendern`, { headers: { apikey: KEY, Authorization: 'Bearer ' + AUTH.access } }).then(r => r.json()))[0];
      if (!me) { keinZugriff('Für dieses Konto ist kein Benutzerprofil hinterlegt.'); return null }
      PJ.me = me;
      if (me.pw_aendern) { toLogin(); return null }
      const r = await rpc('pj_rolle');
      // Testbereich nur für Admins: sonst sofort verlassen
      if (TEST && r !== 'admin') { try { localStorage.removeItem('pj_test') } catch (e) { } location.reload(); return null }
      setRolle(r);
      if (!r) { keinZugriff('Das Modul „Projekte“ ist für dein Konto nicht freigeschaltet. Bitte beim Administrator melden.'); return null }
      return r;
    } catch (e) { return PJ.rolle }                           // Netzfehler: mit gespeicherter Rolle weiter
  }

  // E-Mail über die Edge Function „mail-senden“ (z. B. Ereignis „Bautagebuch unterschrieben“ mit PDF)
  async function mail(action, payload) {
    if (TEST) return { ok: true, test: true };               // im Testbereich keine E-Mails
    const tok = await ensureToken();
    const r = await fetch(`${SB}/functions/v1/mail-senden`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, 'x-user-token': tok || '' }, body: JSON.stringify(Object.assign({ action }, payload || {})) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || ('Fehler ' + r.status));
    return j;
  }
  // Edge Function mit Login-Token aufrufen (PDS_V2: pds-bruecke, nur Admin)
  async function fn(name, body) {
    const tok = await ensureToken();
    let r;
    try {
      r = await fetch(`${SB}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, 'x-user-token': tok || '' }, body: JSON.stringify(body || {}) });
    } catch (e) { throw new Error('Keine Verbindung – bitte Netz prüfen') }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || ('Fehler ' + r.status)); e.daten = j; e.status = r.status; throw e; }
    return j;
  }
  const PJ = window.PJ = { api, rpc, za, pr, mail, fn, test: TEST, rolle: null, me: null, portal: PORTAL, logout() { authClear(); location.replace(PORTAL) } };
  PJ.setTest = on => { try { on ? localStorage.setItem('pj_test', '1') : localStorage.removeItem('pj_test') } catch (e) { } location.replace(location.pathname + '?bereich=' + (on ? 'test#pds' : 'echt')) };
  // Hinweisleiste im Testbereich
  if (TEST) {
    const leiste = () => {
      if (document.getElementById('pj-testleiste')) return;
      const d = document.createElement('div'); d.id = 'pj-testleiste';
      d.style.cssText = 'position:sticky;top:0;z-index:999;background:#E25304;color:#fff;font:600 13.5px/1.35 Montserrat,system-ui,sans-serif;padding:8px 14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap';
      d.innerHTML = '<span><b>PDS-Testbereich</b> · Testdaten, nicht die echten Projekte. E-Mails werden nicht verschickt.</span>';
      const b = document.createElement('button'); b.textContent = 'Testbereich verlassen';
      b.style.cssText = 'background:#fff;color:#E25304;border:0;border-radius:10px;padding:6px 12px;font:700 13px Montserrat,system-ui,sans-serif;cursor:pointer';
      b.onclick = () => PJ.setTest(false); d.appendChild(b); document.body.prepend(d);
    };
    if (document.body) leiste(); else document.addEventListener('DOMContentLoaded', leiste);
  }
  PJ.leitung = () => PJ.rolle === 'bauleitung' || PJ.rolle === 'admin';
  PJ.ready = check();
  window.addEventListener('storage', e => { if (e.key === SESS_KEY && !e.newValue) location.replace(PORTAL) });
})();
