/*
 * Prototype bridge — injected into every page served through the preview proxy.
 * Tells the presenter which page is showing (so device switches and reloads stay on it),
 * and keeps the preview inside the prototype. Plain ES2017, no dependencies.
 */
(function () {
  'use strict';
  if (window.__ptBridge) return;
  window.__ptBridge = true;

  var cfg = window.__PT__ || {};

  // Keep this tab's preview cookie current, in case another prototype was opened in another tab.
  function pinCookie() {
    if (cfg.c) document.cookie = '__pt=' + cfg.c + '; path=/; ' + (location.protocol === 'https:' ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax');
  }
  pinCookie();
  ['focus', 'pageshow', 'pointerdown', 'keydown'].forEach(function (t) {
    window.addEventListener(t, pinCookie, true);
  });
  document.addEventListener('visibilitychange', pinCookie);

  // A service worker registered on the preview origin would outlive the preview.
  try {
    var sw = navigator.serviceWorker;
    if (sw) {
      sw.register = function () {
        return Promise.reject(new Error('Service workers are disabled in prototype previews'));
      };
      sw.getRegistrations().then(function (rs) {
        rs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
    }
  } catch (e) {}

  // View only: links that would open a new tab stay inside the prototype instead.
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[target]');
      if (a && a.target !== '_self' && a.origin === location.origin) a.target = '_self';
    },
    true,
  );
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);

  // Only the page directly inside the presenter talks to it (not nested iframes).
  if (window.parent === window || window.parent !== window.top) return;

  var parentOrigin = (location.ancestorOrigins && location.ancestorOrigins[0]) || '*';
  function post(msg) {
    msg.src = 'pt';
    try { window.parent.postMessage(msg, parentOrigin); } catch (e) {}
  }

  var lastPath = null, lastTitle = null;
  function announce(type) {
    lastPath = location.pathname;
    lastTitle = document.title || '';
    post({ type: type, path: lastPath, title: lastTitle });
  }
  function checkRoute() {
    if (location.pathname !== lastPath) announce('route');
    else if ((document.title || '') !== lastTitle) announce('title');
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(checkRoute, 0);
      return r;
    };
  });
  window.addEventListener('popstate', checkRoute);
  window.addEventListener('hashchange', checkRoute);

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var d = e.data;
    if (d && d.src === 'pt-host' && d.type === 'hello') announce('ready');
  });

  function start() {
    announce('ready');
    setInterval(checkRoute, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
