/* ============================================================
   MAZI storefront - live shared settings
   Reads the same app_config values the staff Settings page saves and keeps
   every public page in step with them WITHOUT a reload:
     - realtime (Supabase) when 48_settings_live.sql has been run,
     - plus a 30s poll and a re-check whenever the tab becomes visible again.
   Pages hook in with  MaziSite.on(function (cfg) { ... })  (called once
   with the last known values, then again whenever something changes).
   Footer / contact text is bound with data attributes:
     data-site="store_name|store_addr|store_phone|store_email|store_gst_tin"
     data-site-tel="store_phone"   data-site-mail="store_email"
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'mazi_site_cfg', POLL_MS = 30000;
  var last = '', busy = false, listeners = [];
  var site = window.MaziSite = {
    cfg: {}, loaded: false,
    get: function (k, d) { var v = site.cfg[k]; return (v == null || v === '') ? d : v; },
    on: function (fn) {
      listeners.push(fn);
      if (site.loaded) { try { fn(site.cfg); } catch (e) { console.error(e); } }
    },
    refresh: refresh
  };

  function txt(v) { return typeof v === 'string' ? v.trim() : ''; }

  function applyDom(cfg) {
    var q = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    q('[data-site]').forEach(function (el) {
      var v = txt(cfg[el.getAttribute('data-site')]);
      if (v && !el.children.length) el.textContent = v;
    });
    q('[data-site-tel]').forEach(function (el) {
      var v = txt(cfg[el.getAttribute('data-site-tel')]);
      if (!v) return;
      el.setAttribute('href', 'tel:' + v.replace(/[^0-9+]/g, ''));
      if (!el.children.length) el.textContent = v;
    });
    q('[data-site-mail]').forEach(function (el) {
      var v = txt(cfg[el.getAttribute('data-site-mail')]);
      if (!v) return;
      el.setAttribute('href', 'mailto:' + v);
      if (!el.children.length) el.textContent = v;
    });
  }

  function setCfg(cfg, cached) {
    var s = JSON.stringify(cfg || {});
    if (s === last) return;
    last = s; site.cfg = cfg || {}; site.loaded = true;
    if (!cached) { try { localStorage.setItem(KEY, s); } catch (e) {} }
    applyDom(site.cfg);
    listeners.slice().forEach(function (fn) { try { fn(site.cfg); } catch (e) { console.error(e); } });
  }

  function refresh() {
    if (busy || !window.MaziAPI || !MaziAPI.getConfig) return Promise.resolve();
    busy = true;
    return MaziAPI.getConfig().then(function (cfg) { if (cfg) setCfg(cfg, false); })
      .catch(function () {})
      .then(function () { busy = false; });
  }

  // 1) last known values straight away (no flash of stale hard-coded text)
  try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && typeof c === 'object') setCfg(c, true); } catch (e) {}

  function start() {
    applyDom(site.cfg);
    refresh();
    try { if (window.MaziAPI && MaziAPI.subscribeConfig) MaziAPI.subscribeConfig(refresh); } catch (e) {}
    setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
