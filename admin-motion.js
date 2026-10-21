/* MAZI Admin — replay view entrance on EVERY nav tap (GPU-only: transform/opacity)
   and keep the active bottom-nav tab scrolled into view on mobile. */
(function () {
  'use strict';
  var mq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    var done = function () { el.classList.remove(cls); el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done);
  }
  function revealActive() {
    var nav = document.getElementById('nav');
    var a = nav && nav.querySelector('button.active');
    if (!a || nav.scrollWidth <= nav.clientWidth) return;
    var target = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: (mq && mq.matches) ? 'auto' : 'smooth' });
    setTimeout(updateNavScroll, 350);
  }

  /* Visible scroll indicator for the swipeable bottom nav (mobile). */
  function updateNavScroll() {
    var nav = document.getElementById('nav'), bar = document.getElementById('navScroll');
    if (!nav || !bar) return;
    var over = nav.scrollWidth - nav.clientWidth;
    bar.classList.toggle('on', over > 2);
    if (over <= 2) return;
    var thumb = bar.firstElementChild, track = bar.clientWidth;
    var w = Math.max(36, track * nav.clientWidth / nav.scrollWidth);
    thumb.style.width = w + 'px';
    thumb.style.transform = 'translate3d(' + ((track - w) * nav.scrollLeft / over) + 'px,0,0)';
  }
  (function () {
    var nav = document.getElementById('nav'); if (!nav) return;
    nav.addEventListener('scroll', function () { requestAnimationFrame(updateNavScroll); }, { passive: true });
    window.addEventListener('resize', updateNavScroll);
    new MutationObserver(updateNavScroll).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
    setTimeout(updateNavScroll, 300); setTimeout(updateNavScroll, 1500);
  })();

  /* Slide the bottom nav left/right: mouse drag, wheel, and end arrows
     (touch already swipes natively). */
  (function () {
    var nav = document.getElementById('nav'), side = document.getElementById('sideNav');
    if (!nav || !side) return;
    function mk(dir) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'nav-arrow ' + dir; b.setAttribute('aria-label', dir === 'l' ? 'Scroll left' : 'Scroll right');
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + (dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>';
      b.addEventListener('click', function () { nav.scrollBy({ left: (dir === 'l' ? -1 : 1) * nav.clientWidth * 0.6, behavior: 'smooth' }); });
      side.appendChild(b); return b;
    }
    var L = mk('l'), R = mk('r');
    function arrows() {
      var over = nav.scrollWidth - nav.clientWidth;
      L.classList.toggle('show', over > 2 && nav.scrollLeft > 4);
      R.classList.toggle('show', over > 2 && nav.scrollLeft < over - 4);
    }
    nav.addEventListener('scroll', arrows, { passive: true });
    window.addEventListener('resize', arrows);
    new MutationObserver(arrows).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
    setTimeout(arrows, 300); setTimeout(arrows, 1500);
    // wheel (vertical or horizontal) slides the nav sideways
    nav.addEventListener('wheel', function (e) {
      if (nav.scrollWidth <= nav.clientWidth) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      nav.scrollLeft += d; e.preventDefault();
    }, { passive: false });
    // mouse drag
    var down = false, moved = false, sx = 0, sl = 0;
    nav.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; sx = e.clientX; sl = nav.scrollLeft;
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (!moved && Math.abs(dx) > 5) { moved = true; nav.classList.add('dragging'); }
      if (moved) nav.scrollLeft = sl - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!down) return; down = false;
      setTimeout(function () { nav.classList.remove('dragging'); }, 0);
    });
    nav.addEventListener('click', function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  })();
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#sideNav [data-view]');
    if (!btn) return;
    var reduce = mq && mq.matches;
    requestAnimationFrame(function () {
      if (!reduce) {
        replay(btn, 'am-pop');
        var panel = document.getElementById('panel');
        if (panel) {
          panel.classList.remove('no-anim'); // same-tab taps are flagged no-anim by the app; lift it for this replay
          var kids = panel.children;
          for (var i = 0; i < kids.length; i++) {
            kids[i].style.animationDelay = (Math.min(i, 5) * 45) + 'ms';
            replay(kids[i], 'rise-item');
          }
        }
      }
      revealActive();
    });
  });
  window.addEventListener('load', function () { setTimeout(revealActive, 400); });
})();

/* MAZI Admin — 3-second entrance animation for the dashboard analytics
   (Net Sales bars, Today-so-far line, "This month" strip + all big numbers).
   Plays only when the Dashboard is freshly opened (same rule as the rest of the
   dashboard entrance: #panel is NOT .no-anim). 30-second background refreshes
   don't replay it. CSS is injected here so only this file needs to be replaced. */
(function () {
  'use strict';
  var DUR = 3000; // ms — total length of the animation
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css =
    '@keyframes nsxBar{from{transform:scaleY(0)}}' +
    '@keyframes nsxFade{from{opacity:0}}' +
    '@keyframes nsxDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}' +
    '@keyframes nsxPop{from{transform:scale(0);opacity:0}}' +
    /* bars grow up from the baseline, left → right (stagger via --i) */
    '.nsx .bar{transform-box:fill-box;transform-origin:50% 100%;animation:nsxBar 1.5s var(--ease,ease-out) backwards;' +
      'animation-delay:calc(.3s + var(--i,0) * .04s - var(--el,0s))}' +
    /* grid lines + axis labels fade in first */
    '.nsx svg .grid{animation:nsxFade .6s ease-out backwards;animation-delay:calc(0s - var(--el,0s))}' +
    '.nsx svg text{animation:nsxFade .8s ease-out backwards;animation-delay:calc(.1s - var(--el,0s))}' +
    /* "Today so far": line draws itself, area fades in, dot pops at the end */
    '.nsx .nsx-tl{stroke-dasharray:1;animation:nsxDraw 2.4s cubic-bezier(.4,0,.2,1) backwards;animation-delay:calc(.3s - var(--el,0s))}' +
    '.nsx .nsx-cl{animation:nsxFade 1.4s ease-out backwards;animation-delay:calc(.6s - var(--el,0s))}' +
    '.nsx path.area{animation:nsxFade 1.2s ease-out backwards;animation-delay:calc(1.6s - var(--el,0s))}' +
    '.nsx circle{transform-box:fill-box;transform-origin:center;animation:nsxPop .5s cubic-bezier(.3,1.6,.5,1) backwards;animation-delay:calc(2.5s - var(--el,0s))}' +
    '@media (prefers-reduced-motion:reduce){.nsx .bar,.nsx svg .grid,.nsx svg text,.nsx .nsx-tl,.nsx .nsx-cl,.nsx path.area,.nsx circle{animation:none!important}}';
  var st = document.createElement('style'); st.id = 'nsx-anim-css'; st.textContent = css;
  document.head.appendChild(st);

  var NUM = /\d[\d,]*(?:\.\d+)?/;
  function countUp(el, skipMs) {
    var tn = null, w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) { if (NUM.test(n.nodeValue)) { tn = n; break; } }
    if (!tn) return;
    var full = tn.nodeValue, m = full.match(NUM)[0];
    var target = parseFloat(m.replace(/,/g, '')); if (!isFinite(target) || target === 0) return;
    var dec = (m.split('.')[1] || '').length, grouped = m.indexOf(',') >= 0 || target >= 1000;
    var pre = full.slice(0, full.indexOf(m)), post = full.slice(full.indexOf(m) + m.length);
    function fmt(v) {
      return pre + (grouped || dec ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grouped })
                                   : String(Math.round(v))) + post;
    }
    var t0 = performance.now() - skipMs;
    tn.nodeValue = fmt(0);
    (function tick(now) {
      var p = Math.min(1, Math.max(0, (now - t0) / DUR)), e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      if (!tn.parentNode) return;               // node was replaced by a re-render
      tn.nodeValue = p >= 1 ? full : fmt(target * e);
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }

  function run(panel) {
    var nsx = panel.querySelector('.nsx');
    if (!nsx || panel.classList.contains('no-anim')) return;   // background refresh → show final state
    var el = parseFloat(panel.style.getPropertyValue('--el')) || 0; // seconds already played (re-render mid-entrance)
    nsx.querySelectorAll('.bar').forEach(function (b, i) { b.style.setProperty('--i', i); });
    nsx.querySelectorAll('polyline').forEach(function (pl) {
      if (pl.hasAttribute('stroke-dasharray')) pl.classList.add('nsx-cl');           // dashed comparison line
      else { pl.setAttribute('pathLength', '1'); pl.classList.add('nsx-tl'); }       // today's line
    });
    if (reduce) return;
    panel.querySelectorAll('.nsx .nsx-big, .nsx .nsx-foot b, .mstrip .v').forEach(function (n) { countUp(n, el * 1000); });
  }

  function init() {
    var panel = document.getElementById('panel');
    if (!panel) return;
    new MutationObserver(function () { run(panel); }).observe(panel, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* MAZI Admin — pill-style filter tabs with a sliding highlight.
   Applies to every tab/filter group: .tabs (orders, stock…), .myear-tabs (All sales / Online / Walk-in,
   Personal / Business, periods, years), .seg (Revenue / Count, vs Yesterday…), .cust-tabs and .pos-mode.
   Colours are unchanged (gray track, white active pill, black text).
   Smooth in every case:
   - the app rebuilds the whole panel on a click  → the new pill starts from where the old one was
   - a re-render lands while the pill is still gliding → it continues from its on-screen position (no jump)
   - a handler only flips the active class in place → the pill follows
   - tabs inside modals / outside #panel are covered too */
(function () {
  'use strict';
  var GROUPS = '.tabs, .myear-tabs, .seg, .cust-tabs, .pos-mode:not(.pos-pay)';   // .pos-pay (Cash/Card/Transfer/Credit) has its own coloured chips
  var DUR = 520;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var last = new Map();          // group key -> {sig, from:{x,y,w,h}, to:{x,y,w,h}, t0}

  var css =
    'html .mz-pill{position:relative;border-radius:999px !important;padding-top:4px !important;padding-bottom:4px !important;gap:2px !important;' +
      'background:var(--gray-50) !important;border:1px solid var(--line) !important}' +
    'html .mz-pill>button{position:relative;z-index:1;border-radius:999px !important;background:transparent !important;box-shadow:none !important;' +
      'padding-left:15px;padding-right:15px;transition:color .28s ease,transform .18s ease}' +
    'html .mz-pill>button:not(.active):not(.on):hover{color:var(--ink);background:transparent !important}' +
    'html .mz-pill>button:active{transform:scale(.96)}' +
    'html .mz-pill>button.active,html .mz-pill>button.on{color:var(--ink);font-weight:700}' +
    'html .mz-pill>button.active em,html .mz-pill>button.on em{background:var(--gray-100)}' +
    '.mz-ind{position:absolute;left:0;top:0;width:0;height:0;border-radius:999px;background:var(--surface);pointer-events:none;z-index:0;' +
      'box-shadow:0 1px 3px rgba(15,23,42,.16),0 4px 10px rgba(15,23,42,.08);scroll-snap-align:none;will-change:transform,width,height}' +
    'html[data-theme="dark"] .mz-ind{background:var(--gray-100);box-shadow:0 1px 3px rgba(0,0,0,.4)}' +
    '@media (prefers-reduced-motion:reduce){html .mz-pill>button{transition:none}}';
  var st = document.createElement('style'); st.id = 'mz-pill-css'; st.textContent = css;
  document.head.appendChild(st);

  /* cubic-bezier(.34,1.32,.5,1) — same spring-ish curve for the pill; solved here so a re-render
     mid-glide can read the pill's current on-screen position. */
  var P1X = .34, P1Y = 1.32, P2X = .5, P2Y = 1;
  function bez(p) {
    var t = p, i, x, d;
    for (i = 0; i < 8; i++) {
      x = 3 * (1 - t) * (1 - t) * t * P1X + 3 * (1 - t) * t * t * P2X + t * t * t - p;
      d = 3 * (1 - t) * (1 - t) * P1X + 6 * (1 - t) * t * (P2X - P1X) + 3 * t * t * (1 - P2X);
      if (Math.abs(x) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= x / d;
    }
    t = Math.min(1, Math.max(0, t));
    return 3 * (1 - t) * (1 - t) * t * P1Y + 3 * (1 - t) * t * t * P2Y + t * t * t;
  }
  function lerp(a, b, e) { return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e }; }
  function visual(rec) {                     // where the pill is on screen right now
    var p = Math.min(1, (performance.now() - rec.t0) / DUR);
    return p >= 1 ? rec.to : lerp(rec.from, rec.to, bez(p));
  }

  function activeBtn(g) { return g.querySelector(':scope > button.active, :scope > button.on'); }
  function btnId(b) {
    for (var k = 0; k < b.attributes.length; k++) if (b.attributes[k].name.indexOf('data-') === 0) return b.attributes[k].value;
    return b.textContent.replace(/[\d()]+/g, '').trim();
  }
  function sigOf(g) { return Array.prototype.map.call(g.querySelectorAll(':scope > button'), btnId).join('/'); }
  function baseKey(g) {
    var f = g.querySelector(':scope > button'), attr = '';
    if (f) for (var k = 0; k < f.attributes.length; k++) if (f.attributes[k].name.indexOf('data-') === 0) { attr = f.attributes[k].name; break; }
    return g.className.replace(/\bmz-pill\b/, '').trim() + '|' + (g.getAttribute('aria-label') || '') + '|' + attr + '|' + sigOf(g);
  }
  function put(ind, r, animate) {
    ind.style.transition = animate ? 'transform ' + DUR + 'ms cubic-bezier(.34,1.32,.5,1),width ' + DUR + 'ms cubic-bezier(.34,1.32,.5,1),height ' + DUR + 'ms cubic-bezier(.34,1.32,.5,1)' : 'none';
    ind.style.width = r.w + 'px'; ind.style.height = r.h + 'px';
    ind.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
  }
  function same(a, b) { return Math.abs(a.x - b.x) < .5 && Math.abs(a.y - b.y) < .5 && Math.abs(a.w - b.w) < .5 && Math.abs(a.h - b.h) < .5; }

  function sync(root, animate) {
    var seen = {};
    root.querySelectorAll(GROUPS).forEach(function (g) {
      if (g.closest('.cur-seg') || g.classList.contains('pos-pay')) return;
      var b = activeBtn(g); if (!b || !b.offsetWidth) return;
      g.classList.add('mz-pill');
      var bk = baseKey(g), n = seen[bk] = (seen[bk] || 0) + 1, key = bk + '#' + n;
      var target = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
      var prev = last.get(key), ind = g.querySelector(':scope > .mz-ind');
      var go = animate && !reduce;
      if (!ind) {
        ind = document.createElement('i'); ind.className = 'mz-ind'; ind.setAttribute('aria-hidden', 'true');
        g.insertBefore(ind, g.firstChild);
        var from = prev ? visual(prev) : null;
        if (go && from && !same(from, target)) {
          put(ind, from, false); void ind.offsetWidth;      // start where the old pill was on screen…
          put(ind, target, true);                           // …and glide to the active tab
          last.set(key, { from: from, to: target, t0: performance.now() });
        } else {
          put(ind, target, false);
          last.set(key, { from: target, to: target, t0: 0 });
        }
      } else {
        var cur = prev ? visual(prev) : target;
        if (prev && same(prev.to, target)) return;           // nothing moved
        if (go && !same(cur, target)) {                      // class flipped in place → glide from where it is
          put(ind, cur, false); void ind.offsetWidth;
          put(ind, target, true);
          last.set(key, { from: cur, to: target, t0: performance.now() });
        } else {
          put(ind, target, false);
          last.set(key, { from: target, to: target, t0: 0 });
        }
      }
    });
  }

  var queued = false, mo = null;
  function schedule() {
    if (queued) return; queued = true;
    requestAnimationFrame(function () {
      queued = false;
      sync(document, true);
      mo.takeRecords();            // ignore the nodes / classes we just touched ourselves
    });
  }
  function init() {
    mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) if (!(recs[i].target.nodeType === 1 && recs[i].target.classList.contains('mz-ind'))) { schedule(); return; }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    // switching to a different page: don't glide from the previous page's position
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#sideNav [data-view], #nav [data-view], [data-goto]')) last.clear();
    }, true);
    var rs; window.addEventListener('resize', function () { clearTimeout(rs); rs = setTimeout(function () { sync(document, false); }, 120); });
    window.addEventListener('load', function () { setTimeout(function () { sync(document, false); }, 300); setTimeout(function () { sync(document, false); }, 1500); });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
