/* =====================================================================
   Heise Projekte: einheitlicher Rahmen wie in den übrigen Modulen
   • ab 960 px Breite: Seitenleiste links (Menü, Nachrichten, My Heise Startseite, Benutzer, Abmelden)
   • Handy: Reiterleiste unten, solange man in Übersichten ist (beim Erfassen ausgeblendet)
   • Aufruf je Seite: PJS.set({seite:'liste'|'projekt'|'aufmass'|'btb'|'za', pid, pname, erfassen})
   ===================================================================== */
(function () {
  'use strict';
  const W = 272;
  const css = `
.pjs-rail{display:none}
.pjs-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:40;display:none;grid-template-columns:repeat(4,1fr);align-items:end;padding:8px 6px calc(8px + var(--safe-b,0px));background:var(--surface);background:color-mix(in srgb,var(--surface) 86%,transparent);-webkit-backdrop-filter:saturate(1.6) blur(18px);backdrop-filter:saturate(1.6) blur(18px);border-top:1px solid var(--line)}
body.pjs-tabs .pjs-tabbar{display:grid}
body.pjs-tabs{padding-bottom:calc(66px + var(--safe-b,0px))}
body.pjs-tabs .bottombar{bottom:calc(66px + var(--safe-b,0px))}
body.pjs-tabs .toast{bottom:calc(150px + var(--safe-b,0px))}
.pjs-tab{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;color:var(--ink-3);font-size:11px;font-weight:650;text-decoration:none;position:relative;min-width:0}
.pjs-tab .ic{width:22px;height:22px}
.pjs-tab span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}
.pjs-tab.on{color:var(--brand)}
.pjs-pills{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.pjs-pill{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px 0 11px;border-radius:16px;background:var(--surface);box-shadow:var(--shadow);font-size:13px;font-weight:680;color:var(--ink-2);text-decoration:none}
.pjs-pill .ic{width:16px;height:16px}
.pjs-nzb{min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:var(--red);color:#fff;font-size:11px;font-weight:800;display:inline-grid;place-items:center;line-height:1}
.pjs-nzb[hidden]{display:none}
@media (min-width:960px){
  body{padding-left:${W}px}
  body.pjs-tabs{padding-bottom:0}
  body.pjs-tabs .bottombar{bottom:0}
  body.pjs-tabs .toast{bottom:calc(32px + var(--safe-b,0px))}
  .pjs-tabbar,body.pjs-tabs .pjs-tabbar{display:none}
  .pjs-pills{display:none}
  .topbar .brand .lt{display:none}
  .pjs-desk-aus{display:none}
  .sheet{left:${W}px}
  .toast{left:calc(50% + ${W / 2}px)}
  nav.tabs{left:calc(50% + ${W / 2}px)}
  .pjs-rail{display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;width:${W}px;z-index:35;padding:22px 16px calc(16px + var(--safe-b,0px));border-right:1px solid var(--line);background:var(--surface);overflow:auto}
  .pjs-brand{display:flex;align-items:center;gap:12px;padding:4px 8px 22px;text-decoration:none;color:var(--ink)}
  .pjs-logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(145deg,var(--brand-2),var(--brand));color:#fff;display:grid;place-items:center;overflow:hidden;flex:none}
  .pjs-logo img{width:100%;height:100%;object-fit:cover;display:block}
  .pjs-brand b{font-size:16px;letter-spacing:-.01em;display:block}.pjs-brand small{color:var(--ink-3);font-size:12px}
  .pjs-new{margin:0 0 18px;width:100%}
  .pjs-nav{display:grid;gap:4px}
  .pjs-sec{font-size:11.5px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);padding:18px 12px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pjs-item{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:12px;color:var(--ink-2);font-weight:600;text-decoration:none;transition:background .15s}
  .pjs-item .ic{width:20px;height:20px;flex:none}
  .pjs-item:hover{background:var(--surface-2)}
  .pjs-item.on{background:var(--surface-2);color:var(--ink)}
  .pjs-item .pjs-nzb{margin-left:auto}
  .pjs-foot{margin-top:auto;display:grid;gap:8px;padding-top:18px}
  .pjs-user{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:var(--surface-2)}
  .pjs-av{width:42px;height:42px;border-radius:50%;background:linear-gradient(145deg,var(--brand-2),var(--brand));color:#fff;display:grid;place-items:center;font-weight:700;font-size:15px;flex:none}
  .pjs-user b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pjs-user small{color:var(--ink-3);font-size:12px}
  .pjs-out{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:var(--ink-3);background:transparent;border:0;cursor:pointer;flex:none}
  .pjs-out:hover{background:var(--surface);color:var(--ink)}
}
@media print{.pjs-rail,.pjs-tabbar,.pjs-pills{display:none!important}body{padding:0!important}}`;

  // Icons, die heise-icons.js nicht kennt
  const EXTRA = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'
  };
  const ic = (n, c) => EXTRA[n] ? `<svg class="ic${c ? ' ' + c : ''}" viewBox="0 0 24 24" aria-hidden="true">${EXTRA[n]}</svg>` : (window.IC ? window.IC(n, c) : '');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } } };

  const S = { seite: 'liste', pid: null, pname: '', erfassen: false };
  let NZ = 0, rail, tabbar;
  const PJ = () => window.PJ || {};
  const portal = () => PJ().portal || '../index.html';
  const leitung = () => typeof PJ().leitung === 'function' && PJ().leitung();
  const rolleName = r => ({ admin: 'Admin', bauleitung: 'Bauleitung', monteur: 'Monteur' }[r] || '');

  function mount() {
    if (rail) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    rail = document.createElement('aside'); rail.className = 'pjs-rail'; rail.setAttribute('aria-label', 'Menü Projekte');
    tabbar = document.createElement('nav'); tabbar.className = 'pjs-tabbar'; tabbar.setAttribute('aria-label', 'Hauptmenü');
    document.body.prepend(rail); document.body.appendChild(tabbar);
  }

  function render() {
    mount();
    const me = PJ().me || ls.get('pjs_me', null);
    if (PJ().me) ls.set('pjs_me', { name: PJ().me.name || '' });
    const name = (me && me.name) || '';
    const ini = (name.trim().charAt(0) || '?').toUpperCase();
    const pid = S.pid, on = k => (k === S.seite ? ' on" aria-current="page' : '');
    const nzb = `<span class="pjs-nzb" data-pjs-nz ${NZ ? '' : 'hidden'}>${NZ > 99 ? '99+' : NZ}</span>`;
    // im Aufmaß gilt „Übersicht und Aufmaße“ als aktiv
    const onP = S.seite === 'projekt' || S.seite === 'aufmass' ? ' on" aria-current="page' : '';

    rail.innerHTML =
      `<a class="pjs-brand" href="index.html"><div class="pjs-logo">${ic('ruler')}<img src="../icon.png?v=5" alt="" onload="this.previousElementSibling.remove()" onerror="this.remove()"></div><div><b>Projekte</b><small>Heise Haustechnik</small></div></a>` +
      (leitung() ? `<a class="btn cta pjs-new" href="index.html#neu">${ic('plus')}Neues Projekt</a>` : '') +
      `<nav class="pjs-nav"><a class="pjs-item${on('liste')}" href="index.html">${ic('folder')}Alle Projekte</a>` +
      (pid ? `<div class="pjs-sec" title="${esc(S.pname)}">${esc(S.pname || 'Projekt')}</div>` +
        `<a class="pjs-item${onP}" href="index.html#p=${encodeURIComponent(pid)}">${ic('ruler')}Übersicht und Aufmaße</a>` +
        `<a class="pjs-item${on('btb')}" href="bautagebuch.html?p=${encodeURIComponent(pid)}">${ic('book')}Bautagebuch</a>` +
        `<a class="pjs-item${on('za')}" href="zusatz.html?p=${encodeURIComponent(pid)}">${ic('clock')}Zusätzliche Arbeiten</a>` : '') +
      `</nav>` +
      `<div class="pjs-foot">` +
      `<a class="pjs-item" href="${portal()}#/nachrichten">${ic('bell')}Nachrichten${nzb}</a>` +
      `<a class="pjs-item" href="${portal()}">${ic('apps')}My Heise Startseite</a>` +
      `<div class="pjs-user"><div class="pjs-av">${esc(ini)}</div><div style="min-width:0;flex:1"><b>${esc(name || 'Angemeldet')}</b><small>${esc(rolleName(PJ().rolle))}</small></div>` +
      `<button class="pjs-out" type="button" data-pjs-logout aria-label="Abmelden" title="Abmelden">${ic('logout')}</button></div></div>`;
    rail.querySelector('[data-pjs-logout]').onclick = () => { if (confirm('Abmelden?')) (PJ().logout ? PJ().logout() : location.replace(portal())); };

    const tabs = pid && !S.erfassen;
    document.body.classList.toggle('pjs-tabs', !!tabs);
    tabbar.innerHTML = tabs ?
      `<a class="pjs-tab${on('liste')}" href="index.html">${ic('folder')}<span>Projekte</span></a>` +
      `<a class="pjs-tab${onP}" href="index.html#p=${encodeURIComponent(pid)}">${ic('ruler')}<span>Aufmaß</span></a>` +
      `<a class="pjs-tab${on('btb')}" href="bautagebuch.html?p=${encodeURIComponent(pid)}">${ic('book')}<span>Bautagebuch</span></a>` +
      `<a class="pjs-tab${on('za')}" href="zusatz.html?p=${encodeURIComponent(pid)}">${ic('clock')}<span>Zusatz</span></a>` : '';
  }

  // Leiste „My Heise · Nachrichten“ oben auf der Startseite des Moduls (nur Handy, wie in den anderen Modulen)
  function pills() {
    return `<div class="pjs-pills"><a class="pjs-pill" href="${portal()}">${ic('apps')} My Heise</a><a class="pjs-pill" href="${portal()}#/nachrichten">${ic('bell')} Nachrichten<span class="pjs-nzb" data-pjs-nz ${NZ ? '' : 'hidden'}>${NZ > 99 ? '99+' : NZ}</span></a></div>`;
  }

  function paintNz() { document.querySelectorAll('[data-pjs-nz]').forEach(e => { e.textContent = NZ > 99 ? '99+' : NZ; e.hidden = !NZ; }); }
  async function loadNz() {
    if (!navigator.onLine || !PJ().rpc) return;
    try { const z = await PJ().rpc('hub_zaehler', {}); NZ = (+(z && z.ungelesen) || 0) + ((PJ().me && PJ().me.rolle === 'admin') ? (+(z && z.meldungen) || 0) : 0); paintNz(); } catch (e) { }
  }

  function set(o) {
    const vorher = JSON.stringify(S);
    Object.assign(S, o || {});
    if (rail && vorher === JSON.stringify(S)) return;   // nichts geändert
    if (document.body) render(); else document.addEventListener('DOMContentLoaded', render, { once: true });
  }

  window.PJS = { set, pills, ic };
  // nach der Anmeldung Name, Rolle und Nachrichten nachladen
  Promise.resolve(PJ().ready).then(() => { if (rail) render(); loadNz(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNz(); });
})();
