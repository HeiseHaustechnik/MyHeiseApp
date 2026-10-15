/* My Heise: kleiner Knopf „Idee“ in jeder App.
   Einbinden: <script src="idee.js" data-app="planung" defer></script> (in Unterordnern ../idee.js)
   Optional data-slot=".top .home": Knopf direkt hinter dieses Element in die Kopfzeile setzen.
   Ohne data-slot (oder wenn es fehlt) schwebt der Knopf unten links; data-bottom="80" verschiebt ihn nach oben.
   Öffnet die Startseite mit dem Formular „Idee einreichen“ und vorausgewählter App. */
(function () {
  var s = document.currentScript; if (!s) return;
  var app = (s.dataset.app || 'allgemein').replace(/[^a-z0-9_]/g, '');
  var ziel = new URL('index.html#/ideen/neu/' + app, s.src).href;
  var unten = parseInt(s.dataset.bottom || '16', 10);
  function los() {
    if (document.getElementById('mh-idee')) return;
    var st = document.createElement('style');
    st.textContent = '#mh-idee{position:fixed;left:14px;bottom:calc(' + unten + 'px + env(safe-area-inset-bottom,0px));z-index:30;display:flex;align-items:center;gap:6px;height:38px;padding:0 13px 0 10px;border-radius:19px;background:#fff2dc;color:#b45309;font:700 13px/1 Montserrat,system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 10px rgba(13,21,36,.18);opacity:.92}'
      + '#mh-idee:hover{opacity:1}#mh-idee svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
      + '@media (max-width:600px){#mh-idee span{display:none}#mh-idee{padding:0;width:38px;justify-content:center}}'
      + '@media (prefers-color-scheme:dark){#mh-idee{background:#372611;color:#fbbf5b}}@media print{#mh-idee{display:none}}';
    st.textContent += '#mh-idee.in{position:static;height:32px;width:32px;padding:0;justify-content:center;border-radius:10px;box-shadow:none;background:rgba(255,255,255,.12);color:#fbbf5b;opacity:1;flex:none}#mh-idee.in span{display:none}#mh-idee.in:hover{background:rgba(255,255,255,.22)}';
    document.head.appendChild(st);
    var slot = s.dataset.slot ? document.querySelector(s.dataset.slot) : null;
    var a = document.createElement('a');
    a.id = 'mh-idee'; a.href = ziel; a.title = 'Idee oder Verbesserung für diese App einreichen'; a.setAttribute('aria-label', a.title);
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg><span>Idee</span>';
    if (slot) { a.className = 'in'; slot.insertAdjacentElement('afterend', a); } else document.body.appendChild(a);
  }
  if (document.body) los(); else document.addEventListener('DOMContentLoaded', los);
})();
