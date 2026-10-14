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
