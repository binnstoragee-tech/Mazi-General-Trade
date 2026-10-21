/* ============================================================
   Mobile bottom navigation — "liquid notch" tab bar.

   The white bar has a smooth round notch cut into it under the active
   tab, with a white bubble (holding the active icon) sitting in it.
   When another tab is tapped:
     1. the bubble shrinks away,
     2. the notch fills back in where it was while a new one grows under
        the tapped tab (both are drawn at the same time, so you see the
        two bumps trade places like liquid),
     3. the bubble pops up in the new notch (small overshoot) and the old
        tab's grey icon fades back in.
   The bar is an SVG path redrawn every frame; the active tab is still
   whichever .bn-item has the `active` class (script.js sets it), this file
   only reacts to that class changing.
   ============================================================ */
(function () {
  'use strict';

  var nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  var items = Array.prototype.slice.call(nav.querySelectorAll('.bn-item'));
  var svg = nav.querySelector('.bn-bg');
  var bar = svg && svg.querySelector('path');
  var bubble = nav.querySelector('.bn-bubble');
  if (!items.length || !bar || !bubble) return;

  /* ---- geometry (px) — keep in sync with the CSS block in style.css ---- */
  var OVER = 26;          // transparent space above the bar for the raised bubble
  var BAR = 62;           // visible bar height (not counting the safe-area inset)
  var R = 24;             // bubble radius
  var CYD = 2;            // bubble centre sits this far BELOW the bar's top edge
  var GAP = 4;            // ring of page showing between bubble and notch
  var RN = R + GAP;       // notch arc radius
  var X1 = 14;            // where the notch's round bottom hands over to its shoulders
  var S = 30;             // width of each shoulder
  var CORNER = 22;        // top corner radius of the bar
  var LIFT = BAR / 2 - CYD;   // how far the active icon rises into the bubble

  /* ---- timeline (ms) ---- */
  var T = 820;
  var T_BUBBLE_OUT = 150;     // old bubble shrinks 0 -> 150
  var T_OLD_FILL = [90, 480]; // old notch fills back in
  var T_NEW_GROW = [230, 640];// new notch grows (with a little overshoot)
  var T_BUBBLE_IN = [520, 800];

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function easeInOut(x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeIn(x) { return x * x; }
  function easeOutBack(x, c1) { var c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  var W = 0, H = 0;
  function measure() {
    W = nav.clientWidth;
    H = nav.clientHeight;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    return W > 0 && H > 0;
  }
  function centerX(i) { return (W / items.length) * (i + .5); }

  /* notch depth (px below the bar's top edge) at horizontal distance dx from its centre */
  var N1 = CYD + Math.sqrt(RN * RN - X1 * X1);     // depth where arc meets shoulder
  var M0 = -(X1 / Math.sqrt(RN * RN - X1 * X1)) * S; // arc slope, scaled for the Hermite shoulder
  function notch(dx) {
    var a = Math.abs(dx);
    if (a <= X1) return CYD + Math.sqrt(RN * RN - a * a);
    if (a >= X1 + S) return 0;
    var t = (a - X1) / S, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * N1 + (t3 - 2 * t2 + t) * M0;
  }
  function corner(x) {
    var xr = Math.min(x, W - x);
    if (xr >= CORNER) return 0;
    var d = CORNER - xr;
    return CORNER - Math.sqrt(CORNER * CORNER - d * d);
  }

  function draw(oldI, aOld, newI, aNew) {
    var cOld = oldI == null ? -9999 : centerX(oldI);
    var cNew = newI == null ? -9999 : centerX(newI);
    var d = 'M0 ' + H;
    for (var x = 0; x <= W; x++) {
      var y = corner(x);
      if (aOld > 0.001) y = Math.max(y, notch(x - cOld) * aOld);
      if (aNew > 0.001) y = Math.max(y, notch(x - cNew) * aNew);
      d += 'L' + x + ' ' + (OVER + y).toFixed(2);
    }
    d += 'L' + W + ' ' + H + 'Z';
    bar.setAttribute('d', d);
  }

  function bubbleX(i) { return centerX(i) - R; }
  function placeBubble(i) { bubble.style.transform = 'translate3d(' + bubbleX(i) + 'px,0,0) scale(1)'; }

  function activeIndex() {
    for (var i = 0; i < items.length; i++) if (items[i].classList.contains('active')) return i;
    return 0;
  }

  /* ---- state ---- */
  var cur = activeIndex();     // tab the bar is currently showing
  var raf = 0, anims = [];

  function stopAnimation() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    anims = [];
  }

  function rest() {
    stopAnimation();
    if (!measure()) return;
    draw(null, 0, cur, 1);
    placeBubble(cur);
    items.forEach(function (b, i) {
      b.setAttribute('aria-current', i === cur ? 'page' : 'false');
    });
  }

  function go(from, to) {
    stopAnimation();
    if (!measure()) { cur = to; return; }
    if (reduce || from === to || !bubble.animate) { cur = to; rest(); return; }

    var xFrom = bubbleX(from), xTo = bubbleX(to);
    var upTo = 'translateY(-' + LIFT + 'px)';

    /* bubble: shrink at the old spot, then pop up (with overshoot) at the new one */
    anims.push(bubble.animate([
      { offset: 0, transform: 'translate3d(' + xFrom + 'px,0,0) scale(1)', easing: 'cubic-bezier(.5,0,.9,.5)' },
      { offset: T_BUBBLE_OUT / T, transform: 'translate3d(' + xFrom + 'px,0,0) scale(0)' },
      { offset: T_BUBBLE_OUT / T + .0001, transform: 'translate3d(' + xTo + 'px,0,0) scale(0)' },
      { offset: T_BUBBLE_IN[0] / T, transform: 'translate3d(' + xTo + 'px,0,0) scale(0)', easing: 'cubic-bezier(.34,1.9,.5,1)' },
      { offset: T_BUBBLE_IN[1] / T, transform: 'translate3d(' + xTo + 'px,0,0) scale(1)' },
      { offset: 1, transform: 'translate3d(' + xTo + 'px,0,0) scale(1)' }
    ], { duration: T, fill: 'both' }));

    var ico = function (i) { return items[i].querySelector('.bn-ico'); };

    /* old tab: its dark icon shrinks away with the bubble, then the grey icon fades back in
       at its place in the bar once the notch has filled */
    if (ico(from)) anims.push(ico(from).animate([
      { offset: 0, opacity: 1, transform: upTo + ' scale(1)', color: 'var(--bn-ico-active)', easing: 'cubic-bezier(.5,0,.9,.5)' },
      { offset: T_BUBBLE_OUT / 520, opacity: 1, transform: upTo + ' scale(0)', color: 'var(--bn-ico-active)' },
      { offset: T_BUBBLE_OUT / 520 + .0001, opacity: 0, transform: 'none', color: 'var(--bn-ico)' },
      { offset: .42, opacity: 0, transform: 'none', color: 'var(--bn-ico)', easing: 'ease-out' },
      { offset: 1, opacity: 1, transform: 'none', color: 'var(--bn-ico)' }
    ], { duration: 520, fill: 'backwards' }));

    /* new tab: grey icon melts away, then the dark icon pops up inside the bubble */
    if (ico(to)) anims.push(ico(to).animate([
      { offset: 0, opacity: 1, transform: 'none' },
      { offset: .14, opacity: 0, transform: 'none' },
      { offset: .1401, opacity: 0, transform: upTo + ' scale(.3)' },
      { offset: T_BUBBLE_IN[0] / T, opacity: 0, transform: upTo + ' scale(.3)', easing: 'cubic-bezier(.34,1.8,.5,1)' },
      { offset: T_BUBBLE_IN[1] / T, opacity: 1, transform: upTo + ' scale(1)' },
      { offset: 1, opacity: 1, transform: upTo + ' scale(1)' }
    ], { duration: T, fill: 'both' }));

    var start = performance.now();
    (function frame(now) {
      var t = now - start;
      if (t >= T) {
        raf = 0; cur = to; rest(); return;
      }
      var aOld = 1 - easeInOut(seg(t, T_OLD_FILL[0], T_OLD_FILL[1]));
      var aNew = easeOutBack(seg(t, T_NEW_GROW[0], T_NEW_GROW[1]), 1.25);
      // the old notch stays fully open until the bubble has gone
      if (t < T_BUBBLE_OUT * .6) aOld = 1;
      draw(from, aOld, to, aNew);
      raf = requestAnimationFrame(frame);
    })(start);

    cur = to;
    items.forEach(function (b, i) { b.setAttribute('aria-current', i === to ? 'page' : 'false'); });
  }

  /* react to script.js changing which tab is .active */
  var lastShown = cur;
  function sync() {
    var next = activeIndex();
    if (next === lastShown) return;
    var from = lastShown;
    lastShown = next;
    go(from, next);
  }
  var mo = new MutationObserver(sync);
  items.forEach(function (b) { mo.observe(b, { attributes: true, attributeFilter: ['class'] }); });

  /* keep the bar sized to the screen (rotation, address-bar collapse, desktop <-> mobile) */
  var lastW = 0;
  function onResize() {
    var w = nav.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cur = lastShown;
    rest();
  }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(nav);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  rest();
  lastW = nav.clientWidth;
})();
