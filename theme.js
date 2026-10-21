/* MAZI store — device theme (light | dark | system, light by default). Loaded in <head> without defer so the right
   theme is on <html> before first paint (no white flash). Setting lives in Profile → Appearance. */
(function () {
  var KEY = 'mazi_theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function get() { try { return localStorage.getItem(KEY) || 'light'; } catch (e) { return 'light'; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  /* Light is the default until the shopper picks something else. */
  function mode() { var m = get(); return (m === 'dark' || m === 'system') ? m : 'light'; }
  /* Dark mode is only for signed-in shoppers. Guests (not logged in) always get the light theme,
     even if their device is in dark mode. Login state = the 'mazi_session' the storefront saves. */
  function loggedIn() { try { var s = JSON.parse(localStorage.getItem('mazi_session') || 'null'); return !!(s && (s.user || s.email || s.id || Object.keys(s).length)); } catch (e) { return false; } }
  function resolved() {
    if (!loggedIn()) return 'light';
    var m = mode(); return m === 'system' ? (mq && mq.matches ? 'dark' : 'light') : m;
  }

  function paint() {
    var h = document.documentElement, r = resolved();
    h.setAttribute('data-theme', r);
    h.setAttribute('data-mode', mode());
    h.setAttribute('data-auth', loggedIn() ? 'user' : 'guest');
    var mt = document.querySelector('meta[name="theme-color"]');
    if (!mt) { mt = document.createElement('meta'); mt.name = 'theme-color'; document.head.appendChild(mt); }
    mt.content = r === 'dark' ? '#0A1020' : '#FFFFFF';
    sync();
  }
  function sync() {
    var on = resolved() === 'dark';
    [].forEach.call(document.querySelectorAll('[data-theme-switch]'), function (el) { el.checked = on; });
    var m = mode();
    [].forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (el) {
      var t = on ? 'Switch to light mode' : 'Switch to dark mode';
      el.setAttribute('aria-label', t); el.title = t; el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var label = m === 'dark' ? 'Dark' : (m === 'system' ? 'System' : 'Light');
    [].forEach.call(document.querySelectorAll('[data-theme-current]'), function (el) { el.textContent = label; });
    [].forEach.call(document.querySelectorAll('[data-theme-mode]'), function (el) {
      var a = el.getAttribute('data-theme-mode') === m;
      el.classList.toggle('active', a); el.setAttribute('aria-pressed', a ? 'true' : 'false');
    });
  }

  /* ---- Theme popup (System / Light / Dark with a check) — opened from any [data-theme-menu] row ---- */
  var menuEl = null, menuTrigger = null;
  function buildMenu() {
    if (menuEl) return menuEl;
    var chk = '<svg class="th-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    menuEl = document.createElement('div');
    menuEl.id = 'themeMenu'; menuEl.className = 'theme-menu'; menuEl.setAttribute('role', 'menu'); menuEl.setAttribute('aria-label', 'Theme');
    menuEl.innerHTML =
      '<button type="button" role="menuitemradio" data-theme-mode="system"><span>System</span>' + chk + '</button>' +
      '<button type="button" role="menuitemradio" data-theme-mode="light"><span>Light</span>' + chk + '</button>' +
      '<button type="button" role="menuitemradio" data-theme-mode="dark"><span>Dark</span>' + chk + '</button>';
    document.body.appendChild(menuEl);
    return menuEl;
  }
  function placeMenu(t) {
    var m = menuEl, r = t.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, gap = 8;
    m.style.left = '0px'; m.style.top = '0px';
    var w = m.offsetWidth, h = m.offsetHeight, x, y;
    if (t.getAttribute('data-theme-side') === 'side' && r.left - w - gap >= gap) {   /* desktop dropdown: fly out beside the row */
      x = r.left - w - gap;
      y = r.top - 6;
    } else {                                                  /* mobile menu / profile page: under (or above) the row */
      x = r.right - w - (r.width > 260 ? 12 : 0);
      y = r.bottom + gap; if (y + h > vh - gap) y = r.top - h - gap;
    }
    x = Math.max(gap, Math.min(x, vw - w - gap)); y = Math.max(gap, Math.min(y, vh - h - gap));
    m.style.left = x + 'px'; m.style.top = y + 'px';
  }
  function openMenu(t, noFocus) {
    var m = buildMenu(); menuTrigger = t;
    [].forEach.call(document.querySelectorAll('.cur-menu.open'), function (c) { c.classList.remove('open'); });
    sync(); placeMenu(t);
    m.classList.add('open'); t.setAttribute('aria-expanded', 'true');
    if (!noFocus) { var a = m.querySelector('.active') || m.querySelector('button'); if (a) a.focus({ preventScroll: true }); }
  }
  function closeMenu(refocus) {
    if (!menuEl || !menuEl.classList.contains('open')) return;
    menuEl.classList.remove('open');
    if (menuTrigger) { menuTrigger.setAttribute('aria-expanded', 'false'); if (refocus) menuTrigger.focus({ preventScroll: true }); }
    menuTrigger = null;
  }
  function apply(animate) {
    var h = document.documentElement;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && document.startViewTransition && document.body && !reduce) {
      /* whole-page change: new theme is revealed from the top down with a fade (clip-path + opacity only) */
      try {
        h.classList.add('theme-vt');
        var vt = document.startViewTransition(function () { paint(); });
        var done = function () { h.classList.remove('theme-vt'); };
        vt.finished.then(done, done);
        return;
      } catch (e) { h.classList.remove('theme-vt'); }
    }
    paint();
  }

  window.MaziTheme = {
    mode: mode, resolved: resolved, apply: apply, loggedIn: loggedIn,
    close: function () { closeMenu(); },
    setMode: function (m) { put(m); apply(true); },
    setDark: function (on) { put(on ? 'dark' : 'light'); apply(true); }
  };

  paint();   // before first paint
  if (mq) { var onChange = function () { if (mode() === 'system') apply(true); }; mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange); }
  document.addEventListener('DOMContentLoaded', sync);
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target : null; if (!el) return;
    var trg = el.closest('[data-theme-menu]');
    if (trg) {
      e.preventDefault();
      if (hoverOK() && trg.getAttribute('data-theme-side') === 'side') { if (menuTrigger !== trg) { closeMenu(); openMenu(trg, true); } return; }   /* desktop dropdown: hover already opened it */
      if (menuTrigger === trg) closeMenu(); else { closeMenu(); openMenu(trg); }
      return;
    }
    var t = el.closest('[data-theme-toggle],[data-theme-mode]');
    if (t) {
      closeMenu();
      if (t.hasAttribute('data-theme-mode')) window.MaziTheme.setMode(t.getAttribute('data-theme-mode'));
      else window.MaziTheme.setDark(resolved() !== 'dark');
      return;
    }
    closeMenu();
  });

  /* Desktop dropdown: the Theme row opens its menu on hover and closes when the cursor leaves (row + menu). */
  var SIDE = '[data-theme-menu][data-theme-side="side"]', hoverT = null;
  function hoverOK() { return !!(window.matchMedia && window.matchMedia('(hover: hover)').matches); }
  document.addEventListener('mouseover', function (e) {
    if (!hoverOK() || !e.target || !e.target.closest) return;
    var trg = e.target.closest(SIDE);
    if (trg) { clearTimeout(hoverT); if (menuTrigger !== trg) { closeMenu(); openMenu(trg, true); } return; }
    if (menuEl && menuEl.contains(e.target)) clearTimeout(hoverT);
  });
  document.addEventListener('mouseout', function (e) {
    if (!hoverOK() || !menuEl || !menuTrigger || !e.target || !e.target.closest) return;
    if (!e.target.closest(SIDE) && !menuEl.contains(e.target)) return;
    var to = e.relatedTarget;
    if (to && to.closest && (menuEl.contains(to) || to.closest(SIDE))) return;
    clearTimeout(hoverT); hoverT = setTimeout(function () { closeMenu(); }, 160);
  });
  document.addEventListener('keydown', function (e) {
    if (!menuEl || !menuEl.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    var items = [].slice.call(menuEl.querySelectorAll('button')), i = items.indexOf(document.activeElement);
    i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
    items[i].focus();
  });
  window.addEventListener('resize', function () { closeMenu(); });
  document.addEventListener('scroll', function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('change', function (e) {
    var t = e.target; if (t && t.matches && t.matches('[data-theme-switch]')) window.MaziTheme.setDark(t.checked);
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === 'mazi_session') apply(true); });
})();
