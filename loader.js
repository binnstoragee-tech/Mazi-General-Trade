(function () {
  // Splash on the first open (installed app AND normal browser). Not on refresh,
  // and not when moving to another page.
  var loader = document.getElementById('pageLoader');
  if (!loader) return;

  function removeNow() {
    if (loader.parentNode) loader.parentNode.removeChild(loader);
  }

  // A refresh (reload) must NOT show the splash, only a fresh open does.
  var isReload = false;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    isReload = !!(nav && nav.type === 'reload') ||
      (!nav && performance.navigation && performance.navigation.type === 1);
  } catch (e) {}

  // Only once per app launch (moving between pages of the app does not replay it).
  var alreadyShown = false;
  try { alreadyShown = sessionStorage.getItem('mazi_splash_shown') === '1'; } catch (e) {}

  if (isReload || alreadyShown) { removeNow(); return; }
  try { sessionStorage.setItem('mazi_splash_shown', '1'); } catch (e) {}

  loader.hidden = false;

  // Exactly 2 seconds on screen, then a quick fade.
  var SHOW_MS = 2000;
  setTimeout(function () {
    loader.classList.add('loader-hide');
    setTimeout(removeNow, 450);
  }, SHOW_MS);
})();
