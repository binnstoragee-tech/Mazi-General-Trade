/* MAZI store — device theme (system | light | dark). Loaded in <head> without defer so the right
   theme is on <html> before first paint (no white flash). Setting lives in Profile → Appearance. */
(function () {
  var KEY = 'mazi_theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function get() { try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function mode() { var m = get(); return (m === 'light' || m === 'dark') ? m : 'system'; }
  function resolved() { var m = mode(); return m === 'system' ? (mq && mq.matches ? 'dark' : 'light') : m; }

  function paint() {
    var h = document.documentElement, r = resolved();
    h.setAttribute('data-theme', r);
    h.setAttribute('data-mode', mode());
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
    [].forEach.call(document.querySelectorAll('[data-theme-mode]'), function (el) {
      var a = el.getAttribute('data-theme-mode') === m;
      el.classList.toggle('active', a); el.setAttribute('aria-pressed', a ? 'true' : 'false');
    });
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
    mode: mode, resolved: resolved, apply: apply,
    setMode: function (m) { put(m); apply(true); },
    setDark: function (on) { put(on ? 'dark' : 'light'); apply(true); }
  };

  paint();   // before first paint
  if (mq) { var onChange = function () { if (mode() === 'system') apply(true); }; mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange); }
  document.addEventListener('DOMContentLoaded', sync);
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-theme-toggle],[data-theme-mode]') : null;
    if (!t) return;
    if (t.hasAttribute('data-theme-mode')) window.MaziTheme.setMode(t.getAttribute('data-theme-mode'));
    else window.MaziTheme.setDark(resolved() !== 'dark');
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (t && t.matches && t.matches('[data-theme-switch]')) window.MaziTheme.setDark(t.checked);
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(true); });
})();
