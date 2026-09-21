/* ============================================================
   MAZI — "How to Install" guide
   Opened manually from the "How to Install?" hero banner's View
   button (see HERO_SLIDES in script.js). Not shown automatically
   anywhere — this is a help/guide modal, not a nag screen.

   The guide is split into three device tabs — Android, iOS, then
   Windows (see #installTabs in index.html) — so instructions match
   however the visitor is actually going to install the app. The tab
   matching the visitor's own device is pre-selected automatically;
   the other two stay one tap away. Each tab shows a plain numbered
   step list — no screenshots.

   Where Chrome/Edge support a native one-tap install
   (beforeinstallprompt), the modal swaps to a single "Install Now"
   button instead of the tabs/step list. Everywhere else it shows the
   per-device text guide.
   ============================================================ */
(function () {
  'use strict';

  var deferredPrompt = null;
  var PLATFORMS = ['android', 'ios', 'windows']; // mobile first, then desktop
  var activePlatform = null;

  // Capture as early as possible — this listener has to exist before the
  // browser decides to fire the event, so this file is loaded in <head>.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
  });

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.navigator.standalone === true // iOS home-screen launch
    );
  }

  // Guess the visitor's device so the right tab opens first.
  // Falls back to "windows" for other desktop OSes (Mac/Linux) since the
  // Chrome/Edge install flow shown there is the same one, and to
  // "android" (the first tab) if nothing matches.
  function detectPlatform() {
    var ua = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Win/i.test(ua)) return 'windows';
    if (/Mac|Linux/i.test(ua)) return 'windows';
    return 'android';
  }

  var els = null;
  function cacheEls() {
    if (els) return els;
    var galleries = {};
    PLATFORMS.forEach(function (p) {
      galleries[p] = document.getElementById('installGuideGallery-' + p);
    });
    els = {
      backdrop: document.getElementById('installBackdrop'),
      modal: document.getElementById('installModal'),
      tabs: document.getElementById('installTabs'),
      tabBtns: document.querySelectorAll('#installTabs .install-tab'),
      galleries: galleries,
      nativeNote: document.getElementById('installNativeNote'),
      ctaLabel: document.getElementById('installCtaLabel'),
      ctaBtn: document.getElementById('installCtaBtn'),
      closeBtn: document.getElementById('installCloseBtn'),
    };
    return els;
  }

  // Switches the visible steps panel + tab highlight to match
  // the chosen platform ('android' | 'ios' | 'windows').
  function switchPlatform(platform) {
    var e = cacheEls();
    if (!e.galleries[platform]) return;
    activePlatform = platform;

    PLATFORMS.forEach(function (p) {
      if (e.galleries[p]) e.galleries[p].hidden = p !== platform;
    });

    e.tabBtns.forEach(function (btn) {
      var isActive = btn.getAttribute('data-platform') === platform;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function show() {
    var e = cacheEls();
    if (!e.backdrop || !e.modal) return;

    if (isStandalone()) {
      if (window.showToast) window.showToast('MAZI is already installed on this device.');
      return;
    }

    if (deferredPrompt) {
      e.modal.classList.add('install-native');
      e.nativeNote.hidden = false;
      e.ctaLabel.textContent = 'Install Now';
    } else {
      e.modal.classList.remove('install-native');
      e.nativeNote.hidden = true;
      e.ctaLabel.textContent = 'Got It';
      switchPlatform(activePlatform || detectPlatform());
    }

    e.backdrop.classList.add('show');
    e.modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function hide() {
    var e = cacheEls();
    if (e.backdrop) e.backdrop.classList.remove('show');
    if (e.modal) e.modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function bindEvents() {
    var e = cacheEls();
    if (!e.modal) return; // markup not on this page

    e.closeBtn.addEventListener('click', hide);
    e.backdrop.addEventListener('click', hide);

    e.tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchPlatform(btn.getAttribute('data-platform'));
      });
    });

    e.ctaBtn.addEventListener('click', function () {
      e.ctaBtn.classList.add('install-cta-pop');

      if (deferredPrompt) {
        var promptEvent = deferredPrompt;
        deferredPrompt = null;
        promptEvent.prompt();
        promptEvent.userChoice.catch(function () {});
      }
      setTimeout(hide, 180); // let the check-pop animation register before closing
    });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }

  // Called from the "View" button on the "How to Install?" hero slide.
  window.MaziInstallGuide = { show: show, hide: hide };

  /* ---- Bottom-corner "Install App" nag banner ----
     Separate from the guide modal above: this one shows itself a few
     seconds after page load (instead of waiting to be tapped), and can
     be dismissed. A dismissal is remembered for a week so it doesn't
     nag every single visit. Its own "Install App" button re-uses the
     same show() as the hero banner's "View" button — same native-prompt
     vs. per-device-guide logic either way. */
  var BANNER_DELAY_MS = 2500;
  var BANNER_SNOOZE_DAYS = 7;
  var BANNER_SNOOZE_KEY = 'mazi_install_banner_dismissed_until';

  function bannerIsSnoozed() {
    try {
      var until = Number(localStorage.getItem(BANNER_SNOOZE_KEY)) || 0;
      return Date.now() < until;
    } catch (e) { return false; }
  }
  function bannerSnooze() {
    try {
      localStorage.setItem(BANNER_SNOOZE_KEY, String(Date.now() + BANNER_SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    } catch (e) {}
  }

  function initInstallBanner() {
    var banner = document.getElementById('installBanner');
    if (!banner) return; // markup not on this page

    var cta = document.getElementById('installBannerCta');
    var close = document.getElementById('installBannerClose');

    function hideBanner() { banner.hidden = true; }

    if (close) close.addEventListener('click', function () { bannerSnooze(); hideBanner(); });
    if (cta) cta.addEventListener('click', function () { hideBanner(); show(); });

    // The native "installed" event should also dismiss the banner
    // immediately, not just wait for the next isStandalone() check.
    window.addEventListener('appinstalled', hideBanner);

    if (isStandalone() || bannerIsSnoozed()) return;

    setTimeout(function () {
      // Re-check right before showing — the visitor may have installed
      // or opened the full guide modal in the meantime.
      if (isStandalone() || bannerIsSnoozed()) return;
      if (document.body.style.overflow === 'hidden') return; // some other modal is open
      banner.hidden = false;
    }, BANNER_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInstallBanner);
  } else {
    initInstallBanner();
  }
})();
