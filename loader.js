(function () {
  // Only show the splash on the installed app (desktop or mobile "Add to
  // Home Screen" / installed PWA window) — never on a normal browser tab.
  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true; // iOS Safari home-screen apps

  var loader = document.getElementById('pageLoader');
  if (!loader) return;

  if (!isStandalone) {
    // Not installed — remove it immediately, no splash for regular visits.
    loader.parentNode.removeChild(loader);
    return;
  }

  loader.hidden = false;

  var MIN_VISIBLE_MS = 600; // brief branded flash only — just enough to avoid a jarring instant flicker
  var startedAt = Date.now();

  function hideLoader() {
    var elapsed = Date.now() - startedAt;
    var wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    setTimeout(function () {
      loader.classList.add('loader-hide');
      loader.addEventListener('transitionend', function remove() {
        loader.removeEventListener('transitionend', remove);
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      });
      // Safety fallback in case transitionend doesn't fire
      setTimeout(function () {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 700);
    }, wait);
  }

  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader);
  }

  // Hard safety cap: never let the loader block the app for more than 2.5s
  setTimeout(hideLoader, 2500);
})();
