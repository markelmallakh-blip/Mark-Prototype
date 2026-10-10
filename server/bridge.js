/*
 * Prototype comment bridge — injected into every page served through the preview proxy.
 * Draws comment pins inside the page (so they scroll with it), captures clicks in comment
 * mode, and talks to the presenter via postMessage. Plain ES2017, no dependencies.
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
  // Only behind the preview proxy (cfg.c set): elsewhere, e.g. the static demo, the origin isn't ours to clear.
  try {
    var sw = cfg.c && navigator.serviceWorker;
    if (sw) {
      sw.register = function () {
        return Promise.reject(new Error('Service workers are disabled in prototype previews'));
      };
      sw.getRegistrations().then(function (rs) {
        rs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
    }
  } catch (e) {}

  // Links that would open a new tab stay inside the prototype instead.
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[target]');
      if (a && a.target !== '_self' && a.origin === location.origin) a.target = '_self';
    },
    true,
  );

  // Only the page directly inside the presenter talks to it (not nested iframes, not a standalone tab).
  if (window.parent === window || window.parent !== window.top) return;

  var parentOrigin = (location.ancestorOrigins && location.ancestorOrigins[0]) || '*';
  function post(msg) {
    msg.src = 'pt';
    try { window.parent.postMessage(msg, parentOrigin); } catch (e) {}
  }

  var state = { pins: [], mode: 'browse', scale: 1, track: null, draft: null, activeId: null };
  var pendingScroll = null;
  var host, root, capture, layer, draftEl;
  var pinEls = {};
  var lastTrack = '';
  var k = 0;
  var mounted = false;

  var CURSOR =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M3 29V14C3 7.9 7.9 3 14 3h4c6.1 0 11 4.9 11 11s-4.9 11-11 11H7z' fill='%230a84ff' stroke='%23ffffff' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M16 9v10M11 14h10' stroke='%23ffffff' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E\") 3 29, crosshair";

  var CSS =
    ':host{all:initial}' +
    '.capture{position:fixed;inset:0;pointer-events:none;cursor:' + CURSOR + '}' +
    '.capture.on{pointer-events:auto}' +
    '.capture.dragging{cursor:crosshair}' +
    // Area comments: dashed region, pin on its top-right corner. Stroke width stays constant on screen.
    '.area{position:absolute;left:0;top:0;display:none;box-sizing:border-box;pointer-events:none;' +
    'border:calc(2px*var(--k,1)) dashed #0a84ff;border-radius:calc(4px*var(--k,1));background:rgba(10,132,255,.1);' +
    'box-shadow:0 0 0 calc(1px*var(--k,1)) rgba(10,10,10,.35),inset 0 0 0 calc(1px*var(--k,1)) rgba(10,10,10,.25)}' +
    '.pin.has-area.active .area,.pin.has-area.draft .area,.pin.has-area:hover .area,.pin.drag .area{display:block}' +
    '.pin{position:absolute;width:0;height:0}' +
    '.b{position:absolute;left:0;bottom:0;transform-origin:0 100%;transform:scale(var(--k,1));pointer-events:auto;cursor:pointer;' +
    'box-sizing:border-box;min-width:32px;height:32px;padding:0 10px;border-radius:16px 16px 16px 3px;background:#0a84ff;color:#ffffff;' +
    'font:700 13px/32px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;letter-spacing:-.01em;' +
    'box-shadow:0 0 0 2.5px #fff,0 6px 16px rgba(0,0,0,.3);transition:transform .14s cubic-bezier(.2,.8,.2,1),background .14s,color .14s;user-select:none}' +
    '.b:hover{transform:scale(calc(var(--k,1)*1.1))}' +
    '.pin.active .b{background:#2c2d31;color:#ffffff;transform:scale(calc(var(--k,1)*1.14))}' +
    '.pin.resolved .b{background:#e4e4e7;color:#52525b}' +
    '.pin.draft .b{background:#2c2d31;color:#ffffff;font-size:18px;animation:pop .22s cubic-bezier(.2,.8,.2,1.2)}' +
    '@keyframes pop{from{transform:scale(0)}}' +
    '@media (prefers-reduced-motion:reduce){.b{transition:none;animation:none!important}}';

  function ensureLayer() {
    if (!host) {
      host = document.createElement('pt-layer');
      host.style.cssText =
        'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;display:block;';
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + CSS + '</style><div class="capture"></div><div class="pins"></div>';
      capture = root.querySelector('.capture');
      layer = root.querySelector('.pins');
      ['mousedown', 'mouseup', 'touchstart', 'click'].forEach(function (t) {
        capture.addEventListener(t, stop);
      });
      capture.addEventListener('pointerdown', onDown);
      capture.addEventListener('pointermove', onMove);
      capture.addEventListener('pointerup', onUp);
      capture.addEventListener('pointercancel', endDrag);
    }
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function stop(e) {
    e.stopPropagation();
    if (e.type !== 'touchstart') e.preventDefault();
  }

  // --- Anchors -------------------------------------------------------------

  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && !/\d{4,}/.test(el.id)) {
        var sel = '#' + el.id;
        if (document.querySelectorAll(sel).length === 1) {
          parts.unshift(sel);
          return parts.join('>');
        }
      }
      var tag = el.tagName.toLowerCase();
      var parent = el.parentElement;
      if (!parent) break;
      var idx = 0, count = 0;
      for (var i = 0; i < parent.children.length; i++) {
        if (parent.children[i].tagName === el.tagName) {
          count++;
          if (parent.children[i] === el) idx = count;
        }
      }
      parts.unshift(count > 1 ? tag + ':nth-of-type(' + idx + ')' : tag);
      el = parent;
    }
    return parts.join('>');
  }

  function query(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function elementAt(x, y) {
    capture.style.pointerEvents = 'none';
    var el = document.elementFromPoint(x, y);
    capture.style.pointerEvents = '';
    if (!el || el === host) return null;
    var svg = el.closest && el.closest('svg');
    return svg || el;
  }

  function anchorAt(cx, cy) {
    return anchorFor(elementAt(cx, cy), cx, cy);
  }

  /** Anchor for a point (client coords) relative to `el`, with raw page coords as fallback. */
  function anchorFor(el, cx, cy) {
    var a = { x: Math.round(cx + scrollX), y: Math.round(cy + scrollY), vw: innerWidth };
    if (el && el !== document.body && el !== document.documentElement) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        var sel = cssPath(el);
        if (sel && query(sel) === el) {
          a.selector = sel;
          a.ox = Math.round((cx - r.left) * 10) / 10;
          a.oy = Math.round((cy - r.top) * 10) / 10;
        }
      }
    }
    return a;
  }

  /** Anchor for a dragged region (page coords): tied to the smallest element that contains all of it. */
  function areaAnchor(r) {
    var cl = r.l - scrollX, ct = r.t - scrollY;
    var el = elementAt(cl + 1, ct + 1);
    while (el && el !== document.body && el !== document.documentElement) {
      var b = el.getBoundingClientRect();
      if (b.left <= cl + 1 && b.top <= ct + 1 && b.right >= cl + r.w - 1 && b.bottom >= ct + r.h - 1) break;
      el = el.parentElement;
    }
    var a = anchorFor(el, cl, ct);
    a.w = Math.round(r.w);
    a.h = Math.round(r.h);
    return a;
  }

  /** Page coordinates for an anchor; null when its element exists but is hidden (e.g. closed menu). */
  function resolve(a) {
    if (a.selector) {
      var el = query(a.selector);
      if (el) {
        var r = el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return {
          x: r.left + scrollX + Math.min(a.ox, r.width),
          y: r.top + scrollY + Math.min(a.oy, r.height),
          el: el,
        };
      }
    }
    return { x: a.x, y: a.y, el: null };
  }

  // --- Rendering -----------------------------------------------------------

  function makePin(id) {
    var el = document.createElement('div');
    el.className = 'pin';
    var area = document.createElement('div');
    area.className = 'area';
    el.appendChild(area);
    var b = document.createElement('div');
    b.className = 'b';
    el.appendChild(b);
    ['pointerdown', 'mousedown', 'mouseup', 'touchstart'].forEach(function (t) {
      b.addEventListener(t, function (e) { e.stopPropagation(); });
    });
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      post({ type: 'pin', id: id });
    });
    layer.appendChild(el);
    return el;
  }

  function place(el, pos) {
    if (!pos) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    var l = pos.x + 'px', t = pos.y + 'px';
    if (el.style.left !== l) el.style.left = l;
    if (el.style.top !== t) el.style.top = t;
  }

  /** Sizes the dashed region of an area pin and moves its bubble to the region's top-right corner. */
  function sizeArea(el, a) {
    var w = a.w || 0, h = a.h || 0;
    var area = el.querySelector('.area'), b = el.querySelector('.b');
    area.style.width = w + 'px';
    area.style.height = h + 'px';
    b.style.left = w + 'px';
    return w > 0 && h > 0;
  }

  /** Where the bubble's point sits (and where popovers attach): top-right corner for areas. */
  function tip(pos, a) {
    return pos ? { x: pos.x + (a.w || 0), y: pos.y, el: pos.el } : null;
  }

  var raf = 0;
  function schedule() {
    if (!raf) raf = requestAnimationFrame(function () { raf = 0; layout(); });
  }

  function layout() {
    if (!mounted) return;
    ensureLayer();
    var nk = 1 / (state.scale || 1);
    if (nk !== k) {
      k = nk;
      host.style.setProperty('--k', String(k));
    }
    capture.className = 'capture' + (state.mode === 'comment' ? ' on' : '');

    var positions = {};
    var seen = {};
    for (var i = 0; i < state.pins.length; i++) {
      var p = state.pins[i];
      var el = pinEls[p.id] || (pinEls[p.id] = makePin(p.id));
      var isArea = sizeArea(el, p.anchor);
      var cls = 'pin' + (isArea ? ' has-area' : '') + (p.id === state.activeId ? ' active' : '') + (p.resolved ? ' resolved' : '');
      if (el.className !== cls) el.className = cls;
      var label = String(p.n);
      var bubble = el.querySelector('.b');
      if (bubble.textContent !== label) bubble.textContent = label;
      var pos = resolve(p.anchor);
      place(el, pos);
      positions[p.id] = tip(pos, p.anchor);
      seen[p.id] = true;
    }
    for (var id in pinEls) {
      if (!seen[id]) {
        pinEls[id].remove();
        delete pinEls[id];
      }
    }

    if (state.draft) {
      if (!draftEl) {
        draftEl = document.createElement('div');
        draftEl.innerHTML = '<div class="area"></div><div class="b">+</div>';
        layer.appendChild(draftEl);
      }
      draftEl.className = 'pin draft' + (sizeArea(draftEl, state.draft) ? ' has-area' : '');
      var dpos = resolve(state.draft);
      place(draftEl, dpos);
      positions.draft = tip(dpos, state.draft);
    } else if (draftEl) {
      draftEl.remove();
      draftEl = null;
    }

    if (state.track) {
      var tp = positions[state.track];
      var msg;
      if (tp) {
        var cx = Math.round(tp.x - scrollX), cy = Math.round(tp.y - scrollY);
        msg = { id: state.track, x: cx, y: cy, visible: cy >= -8 && cy <= innerHeight + 8 && cx >= -8 && cx <= innerWidth + 8 };
      } else {
        msg = { id: state.track, x: 0, y: 0, visible: false };
      }
      var sig = msg.id + ':' + msg.x + ':' + msg.y + ':' + msg.visible;
      if (sig !== lastTrack) {
        lastTrack = sig;
        msg.type = 'track';
        post(msg);
      }
    }

    if (pendingScroll) tryScroll();
  }

  function tryScroll() {
    var id = pendingScroll;
    var pin = null;
    for (var i = 0; i < state.pins.length; i++) if (state.pins[i].id === id) pin = state.pins[i];
    if (!pin) return;
    pendingScroll = null;
    var pos = resolve(pin.anchor);
    if (!pos) return;
    var smooth = { behavior: 'smooth' };
    if (pos.el && pos.el.getBoundingClientRect().height < innerHeight * 0.6) {
      smooth.block = 'center';
      pos.el.scrollIntoView(smooth);
    } else {
      window.scrollTo({ top: Math.max(0, pos.y - innerHeight * 0.4), behavior: 'smooth' });
    }
  }

  // --- Comment mode: click = point comment, drag = area comment ---------------

  var drag = null; // { id, sx, sy (page), cx, cy (client), moved }
  var dragEl = null;

  function dragRect(d) {
    var x = d.cx + scrollX, y = d.cy + scrollY;
    return { l: Math.min(d.sx, x), t: Math.min(d.sy, y), w: Math.abs(x - d.sx), h: Math.abs(y - d.sy) };
  }

  function drawDrag() {
    if (!drag || !drag.moved) return;
    var r = dragRect(drag);
    if (!dragEl) {
      dragEl = document.createElement('div');
      dragEl.className = 'pin drag';
      dragEl.innerHTML = '<div class="area"></div>';
      layer.appendChild(dragEl);
    }
    place(dragEl, { x: r.l, y: r.t });
    var area = dragEl.firstChild;
    area.style.width = r.w + 'px';
    area.style.height = r.h + 'px';
  }

  function endDrag() {
    drag = null;
    if (dragEl) {
      dragEl.remove();
      dragEl = null;
    }
    capture.classList.remove('dragging');
  }

  function onDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.pointerType === 'mouse') e.preventDefault();
    drag = { id: e.pointerId, sx: e.clientX + scrollX, sy: e.clientY + scrollY, cx: e.clientX, cy: e.clientY, moved: false };
    // Touch keeps its native scrolling (a drag scrolls, which cancels the pointer); mouse drags draw an area.
    if (e.pointerType === 'mouse') {
      try { capture.setPointerCapture(e.pointerId); } catch (err) {}
    }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.cx = e.clientX;
    drag.cy = e.clientY;
    if (!drag.moved) {
      var r = dragRect(drag);
      if (r.w < 5 && r.h < 5) return;
      drag.moved = true;
      capture.classList.add('dragging');
    }
    drawDrag();
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    e.stopPropagation();
    drag.cx = e.clientX;
    drag.cy = e.clientY;
    var r = drag.moved ? dragRect(drag) : null;
    endDrag();
    var anchor = r && r.w >= 8 && r.h >= 8 ? areaAnchor(r) : anchorAt(e.clientX, e.clientY);
    post({ type: 'place', anchor: anchor });
  }

  // --- Page / route reporting ---------------------------------------------

  var lastPath = null, lastTitle = null;
  function announce(type) {
    lastPath = location.pathname;
    lastTitle = document.title || '';
    post({ type: type, path: lastPath, title: lastTitle });
  }
  function checkRoute() {
    if (location.pathname !== lastPath) {
      announce('route');
      schedule();
    } else if ((document.title || '') !== lastTitle) {
      announce('title');
    }
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
    if (!d || d.src !== 'pt-host') return;
    if (d.type === 'state') {
      state.pins = d.pins || [];
      state.mode = d.mode || 'browse';
      state.scale = d.scale || 1;
      state.track = d.track || null;
      state.draft = d.draft || null;
      state.activeId = d.activeId || null;
      if (state.mode !== 'comment' && drag) endDrag();
      lastTrack = '';
      schedule();
    } else if (d.type === 'scrollTo') {
      pendingScroll = d.id;
      schedule();
    } else if (d.type === 'navigate') {
      if (typeof d.path === 'string' && d.path.charAt(0) === '/' && d.path !== location.pathname) location.assign(d.path);
    } else if (d.type === 'hello') {
      announce('ready');
    }
  });

  document.addEventListener(
    'keydown',
    function (e) {
      var t = e.target;
      var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === 'Escape') post({ type: 'key', key: 'Escape' });
      else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'c' || e.key === 'C')) post({ type: 'key', key: 'c' });
    },
    true,
  );

  function start() {
    announce('ready');
    // Mount after hydration so frameworks that hydrate the whole document don't trip over the layer:
    // on load, or shortly after DOM ready for pages whose heavy media delays load.
    var mount = function () {
      if (mounted) return;
      mounted = true;
      ensureLayer();
      schedule();
      new MutationObserver(function () {
        if (!host.isConnected) ensureLayer();
        schedule();
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      if (window.ResizeObserver) new ResizeObserver(schedule).observe(document.documentElement);
    };
    if (document.readyState === 'complete') mount();
    else {
      window.addEventListener('load', mount);
      setTimeout(mount, 1200);
    }
    window.addEventListener('scroll', function () { schedule(); drawDrag(); }, true);
    window.addEventListener('resize', schedule);
    setInterval(function () {
      checkRoute();
      schedule();
    }, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
