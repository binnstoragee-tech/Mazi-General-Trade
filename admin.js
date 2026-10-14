/* ============================================================
   MAZI — staff dashboard (admin.html)
   Views: Orders · Order History (+ Summary) · Stock
   Uses MaziAPI.admin*. Access is enforced by the database
   (profiles.is_admin + Row Level Security), NOT by hiding this page.
   ============================================================ */
(function () {
  'use strict';

  var LABEL = { placed: 'New', processing: 'Processing', delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
  var FLOW = ['placed', 'processing', 'delivery', 'delivered'];
  var NEXT_LABEL = { placed: 'Start processing', processing: 'Send out for delivery', delivery: 'Mark delivered' };
  var ACTIVE = ['placed', 'processing', 'delivery'];
  var TYPE_LABEL = { pickup: 'Pickup', delivery: 'Delivery', boat: 'Boat' };
  var MVR_PER_USD = 15.42;
  var POLL_MS = 30000;          // default; each device can change it in Settings
  var LOW_STOCK_MAX = 10;       // default; set from Settings (app_config.low_stock_threshold)
  var PRIMARY_SUPER_ADMIN_EMAIL = 'mazigeneraltrade@gmail.com';
  var PRIMARY_SUPER_ADMIN_NAME = 'MAZI General Trade';
  var PRIMARY_SUPER_ADMIN_MOBILE = '9291600';
  // Keep this in sync with CATEGORIES in script.js / the categories table.
  var CATEGORIES = [
    { id: 'dairy', name: 'Dairy' }, { id: 'tea', name: 'Tea' }, { id: 'coffee', name: 'Coffee & Instants' },
    { id: 'beverages', name: 'Beverages' }, { id: 'dried-fruits', name: 'Dates & Dried Fruits' },
    { id: 'grains', name: 'Grains, Cereals & Spreads' }, { id: 'confectionary', name: 'Confectionary & Snacks' },
    { id: 'canned', name: 'Canned Foods' }, { id: 'cooking', name: 'Cooking & Baking' },
    { id: 'personal-care', name: 'Personal Care' }, { id: 'sauces', name: 'Sauces & Oils' },
    { id: 'household', name: 'Household & Cleaning' }
  ];

  var S = {
    view: 'dashboard',
    tab: { live: 'all', history: 'all', stock: 'all', accounts: 'pending', accountsGroup: 'business', staffaccess: 'all' },
    q: '',
    orders: [], products: [], log: [], editLog: [], shops: [], shopsError: null,
    accounts: [], accountsError: null, profileChanges: [], profileChangesError: null, showChangesErrorDetail: false,
    productsError: null, drawerId: null, profile: null, editingId: null,
    expMonths: {}, showAllMonths: false, salesYear: 'all', salesSource: 'all',
    customers: [], customersError: null, editingCustomerId: null, custDetail: null, custMode: 'detail'
  };
  var knownIds = null, pollTimer = null, busy = false, menuEl = null, notifEl = null, pendingImageFile = null, lastPanelView = null;
  var animStart = 0, animElapsed = 0, ANIM_MS = 1600; // entrance window (ms): a re-render inside it continues the animation instead of cutting it

  // Wipe everything the previous signed-in account loaded (lists, current page, search) so a
  // different account that signs in on the same page can never see the old account's screens.
  var SUPER_ONLY_VIEWS = ['customers', 'accounts', 'staffaccess'];
  function resetSessionState() {
    S.view = 'dashboard'; S.q = '';
    S.orders = []; S.products = []; S.log = []; S.editLog = []; S.shops = [];
    S.accounts = []; S.accountsError = null; S.profileChanges = []; S.profileChangesError = null;
    S.customers = []; S.customersError = null; S.drawerId = null; S.editingId = null; S.profile = null;
    S.tab.accounts = 'pending'; S.tab.accountsGroup = 'business'; S.tab.staffaccess = 'all'; S.salesSource = 'all';
    knownIds = null; lastPanelView = null;
  }
  function getSeenPlaced() { try { return JSON.parse(localStorage.getItem('mazi_seen_placed') || '{}'); } catch (e) { return {}; } }
  function setSeenPlaced(obj) { try { localStorage.setItem('mazi_seen_placed', JSON.stringify(obj)); } catch (e) {} }
  function markPlacedSeen() {
    var seen = getSeenPlaced();
    S.orders.forEach(function (o) { if (o.status === 'placed') seen[o.id] = 1; });
    setSeenPlaced(seen);
  }
  function markOneSeen(id) {
    var seen = getSeenPlaced(); seen[id] = 1; setSeenPlaced(seen);
  }
  function badgeText(n) { return n > 9 ? '9+' : n; }

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Product names are stored ALL CAPS in Supabase (supplier convention).
  // Read-only displays show Title Case instead — same treatment as the
  // customer-facing site — so it reads calmer. The Edit form's input
  // keeps the raw value, since that's the actual DB text being edited.
  function productDisplayName(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/(^|[\s\-(\/])([a-z])/g, function (m, sep, ch) {
      return sep + ch.toUpperCase();
    });
  }
  function mvr(n) { return 'MVR ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function fmtDate(ts) { return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function fmtShort(ts) {
    var d = new Date(ts), now = new Date(), opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-GB', opts) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    var d = Math.floor(h / 24);
    return d < 7 ? d + ' d ago' : new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function ymd(ts) { var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var toastTimer;
  var TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.15" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>'
  };
  function toast(msg, isError) {
    var t = $('toast'), type = isError ? 'error' : 'success';
    t.innerHTML = '<span class="toast-icon">' + TOAST_ICONS[type] + '</span><span class="toast-msg"></span>';
    t.querySelector('.toast-msg').textContent = msg;
    t.dataset.toastType = type;
    t.className = 'toast';
    var icon = t.querySelector('.toast-icon');
    icon.classList.remove('pop'); void icon.offsetWidth; icon.classList.add('pop');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, isError ? 5000 : 2500);
  }
  // Toast with a 5-second ring countdown and an Undo button.
  var undoTick = null;
  function toastUndo(msg, onUndo, secs) {
    secs = secs || 5;
    var t = $('toast'), C = 2 * Math.PI * 12;
    clearTimeout(toastTimer); clearInterval(undoTick);
    t.innerHTML =
      '<span class="undo-ring"><svg viewBox="0 0 30 30"><circle class="trk" cx="15" cy="15" r="12"/>' +
      '<circle class="bar" cx="15" cy="15" r="12" style="stroke-dasharray:' + C.toFixed(2) + ';animation-duration:' + secs + 's"/></svg><b>' + secs + '</b></span>' +
      '<span class="toast-msg"></span><button type="button" class="undo-btn">Undo</button>';
    t.querySelector('.toast-msg').textContent = msg;
    t.dataset.toastType = 'undo';
    t.className = 'toast undo';
    void t.offsetWidth;
    t.classList.add('show');
    var left = secs, num = t.querySelector('.undo-ring b');
    function hide() { clearInterval(undoTick); clearTimeout(toastTimer); t.classList.remove('show'); }
    undoTick = setInterval(function () { left -= 1; if (num) num.textContent = Math.max(left, 0); }, 1000);
    toastTimer = setTimeout(hide, secs * 1000);
    t.querySelector('.undo-btn').onclick = function () { hide(); if (onUndo) onUndo(); };
  }
  var ICON = {
    kebab: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    cash: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
    receipt: '<svg viewBox="0 0 24 24"><path d="M6 2h9l3 3v17l-2.5-1.5L13 22l-2.5-1.5L8 22 6 20.5z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>'
  };

  /* ============ staff device notifications ============ */
  var NOTIF_ICON = 'img/icon-192.png';
  var NOTIF_BADGE = 'img/badge-96.png';
  function notifSupported() { return typeof window !== 'undefined' && 'Notification' in window; }
  function getStaffNotifPref() { return localStorage.getItem('mazi_staff_notif_pref') || 'on'; }
  function setStaffNotifPref(v) { localStorage.setItem('mazi_staff_notif_pref', v); }
  function registerNotifSW() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.register('sw.js').catch(function () { return null; });
  }
  function requestDeviceNotifPermission(onDone) {
    if (!notifSupported()) { if (onDone) onDone('unsupported'); return; }
    if (Notification.permission !== 'default') { if (onDone) onDone(Notification.permission); return; }
    registerNotifSW();
    Notification.requestPermission().then(function (p) { if (onDone) onDone(p); });
  }
  function fireNewOrderNotification(o) {
    if (!notifSupported() || Notification.permission !== 'granted' || getStaffNotifPref() === 'off') return;
    var c = o.customer || {};
    var title = 'New order #' + o.id;
    var options = {
      body: (c.name || 'A customer') + ' · ' + mvr(o.total),
      icon: NOTIF_ICON, badge: NOTIF_BADGE,
      tag: 'mazi-staff-order-' + o.id, renotify: true,
      data: { url: 'admin.html' }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title, options); })
        .catch(function () { try { new Notification(title, options); } catch (e) {} });
    } else {
      try { new Notification(title, options); } catch (e) {}
    }
  }

  /* ============ sign in ============ */
  function setMsg(text, ok, id) { var m = $(id || 'loginErr'); m.textContent = text || ''; m.className = 'msg' + (ok ? ' ok' : ''); }
  var AUTH_WAIT_MS = 600;   // just long enough that the loader never flashes; the result shows as soon as it is ready
  function showAuthLoading(text) {
    $('authLoadingText').textContent = text;
    $('authLoading').classList.remove('hidden');
    return Date.now();
  }
  function finishAuthLoading(started) {
    var wait = Math.max(0, AUTH_WAIT_MS - (Date.now() - started));
    return new Promise(function (resolve) { setTimeout(function () { $('authLoading').classList.add('hidden'); resolve(); }, wait); });
  }
  function showLogin(msg) {
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    $('forgotPane').classList.add('hidden');
    $('statusPane').classList.add('hidden');
    $('authCard').classList.remove('status');
    $('signinPane').classList.remove('hidden');
    $('forgotSent').classList.add('hidden');
    $('forgotRequest').style.display = '';
    setMsg(msg || '');
    stopWaiting(); stopPolling(); stopProfilesRealtime(); stopOrdersRealtime(); closeDrawer(); closeMenu();
    resetSessionState();
  }

  /* ============ waiting for Super Admin approval ============
     A staff-signup account (profiles.signup_source = 'admin') that has not
     been granted is_admin yet may sign in, but only sees this status screen.
     It never loads the dashboard or any staff data — the database (RLS +
     is_admin()) still blocks that. The screen re-checks the profile every few
     seconds; the moment a Super Admin turns on staff access it switches to the
     "approved" state and opens the dashboard. */
  var WAIT_POLL_MS = 6000, WAIT_AUTO_OPEN_MS = 3000;
  var W = { profile: null, done: false, timer: null, auto: null, busy: false, offer: false };
  function isPendingStaff(p) { return !!(p && !p.is_admin && (p.signup_source === 'admin' || p.staff_requested)); }
  // A shop (customer) account that asked for staff access from this page.
  function isShopStaffRequest(x) { return !!(x && !x.is_admin && x.staff_requested && x.signup_source !== 'admin'); }
  // Anything waiting for a Super Admin decision (admin.html sign-up OR shop account request).
  function isStaffRequest(x) { return !!(x && !x.is_admin && (x.signup_source === 'admin' || x.staff_requested)); }
  function stopWaiting() {
    if (W.timer) { clearInterval(W.timer); W.timer = null; }
    if (W.auto) { clearTimeout(W.auto); W.auto = null; }
    W.busy = false;
  }
  function setWaitNote(t) { $('stNote').textContent = t; }
  function clockNow() { try { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function showWaiting(profile) {
    stopWaiting(); stopPolling(); stopProfilesRealtime(); stopOrdersRealtime(); closeDrawer(); closeMenu();
    leaveOfferMode(); resetSessionState();
    W.profile = profile; W.done = false;
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    $('forgotPane').classList.add('hidden');
    $('signinPane').classList.add('hidden');
    $('authCard').classList.remove('signup');
    $('authCard').classList.add('status');
    var box = $('statusBox');
    box.classList.remove('is-done');
    // restart the entrance animation
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    $('statusPane').classList.remove('hidden');
    $('stTitle').textContent = 'Waiting for approval';
    $('stCap').textContent = 'Your account is registered. A Super Admin needs to give it staff access before you can open the dashboard.';
    $('stWho').textContent = profile.email || profile.name || 'your account';
    $('stStep2').className = 'now'; $('stStep3').className = '';
    $('stMainLabel').textContent = 'Check status';
    $('stMainBtn').disabled = false;
    $('ovCTitle').textContent = 'Almost there!';
    $('ovCText').textContent = 'Once a Super Admin approves your account, the staff dashboard opens automatically.';
    setWaitNote('Checking automatically…');
    setMsg('');
    W.timer = setInterval(function () { if (!document.hidden) checkWaiting(false); }, WAIT_POLL_MS);
  }
  /* ---- a SHOP (customer) account signed in here: offer to request staff access ----
     Nothing is opened. The account stays a normal customer account; the request is a
     separate flag (profiles.staff_requested) that only a Super Admin can approve. */
  function showRequestOffer(profile, declined) {
    stopWaiting(); stopPolling(); stopProfilesRealtime(); stopOrdersRealtime(); closeDrawer(); closeMenu();
    resetSessionState();
    W.profile = profile; W.done = false; W.offer = true;
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    $('forgotPane').classList.add('hidden');
    $('signinPane').classList.add('hidden');
    $('authCard').classList.remove('signup');
    $('authCard').classList.add('status');
    var box = $('statusBox');
    box.classList.remove('is-done');
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    $('statusPane').classList.remove('hidden');
    $('stTitle').textContent = declined ? 'Request not approved' : 'This is a shop account';
    $('stCap').textContent = declined
      ? 'A Super Admin did not approve staff access for this account. It still works as a normal shop account.'
      : 'You signed in with a customer account. It cannot open the staff dashboard unless a Super Admin approves it. Send a staff-access request?';
    $('stWho').textContent = profile.email || profile.name || 'your account';
    ['.st-steps', '.st-live', '.st-bar'].forEach(function (sel) { var el = box.querySelector(sel); if (el) el.style.display = 'none'; });
    $('stMainLabel').textContent = declined ? 'Request again' : 'Request staff access';
    $('stMainBtn').disabled = false;
    $('ovCTitle').textContent = 'Shop account';
    $('ovCText').textContent = 'Your shop account and orders are not affected.';
    setMsg('');
  }
  function leaveOfferMode() {
    W.offer = false;
    var box = $('statusBox');
    ['.st-steps', '.st-live', '.st-bar'].forEach(function (sel) { var el = box.querySelector(sel); if (el) el.style.display = ''; });
  }
  function sendStaffRequest() {
    var btn = $('stMainBtn');
    btn.disabled = true; $('stMainLabel').textContent = 'Sending…';
    MaziAPI.requestStaffAccess().then(function (p) {
      var email = W.profile && W.profile.email;
      p = Object.assign({}, p, email ? { email: email } : {});
      leaveOfferMode();
      showWaiting(p);
    }).catch(function (e) {
      btn.disabled = false; $('stMainLabel').textContent = 'Request staff access';
      var msg = String((e && e.message) || '');
      if (/request_staff_access|does not exist|schema cache/i.test(msg)) msg = 'Staff requests are not set up yet. Ask the developer to run 41_staff_access_request.sql in Supabase.';
      toast(msg || 'Could not send the request.', true);
    });
  }
  function checkWaiting(manual) {
    if (W.busy || W.done) return;
    W.busy = true;
    var btn = $('stMainBtn'), started = Date.now();
    if (manual) { btn.disabled = true; $('stMainLabel').textContent = 'Checking…'; }
    MaziAPI.getProfile().then(function (p) {
      if (p && W.profile && W.profile.email) p = Object.assign({}, p, { email: W.profile.email });
      if (isStaff(p)) { W.busy = false; showApproved(p); return; }
      if (p && !isPendingStaff(p)) { W.busy = false; showRequestOffer(p, true); return; }   // request was declined
      var wait = manual ? Math.max(0, 700 - (Date.now() - started)) : 0;
      return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
        setWaitNote((manual ? 'Not approved yet. ' : '') + 'Last checked ' + clockNow());
      });
    }).catch(function (e) {
      if (e && e.code === 'NOT_AUTHENTICATED') { stopWaiting(); showLogin('Session expired. Please sign in again.'); return; }
      setWaitNote('Could not check right now. Trying again…');
    }).then(function () {
      W.busy = false;
      if (!W.done) { btn.disabled = false; $('stMainLabel').textContent = 'Check status'; }
    });
  }
  function showApproved(profile) {
    if (W.timer) { clearInterval(W.timer); W.timer = null; }
    W.done = true; W.profile = profile;
    $('statusBox').classList.add('is-done');
    $('stTitle').textContent = "You're approved!";
    $('stCap').textContent = 'A Super Admin gave your account staff access. Welcome to the MAZI team.';
    $('stStep2').className = 'done'; $('stStep3').className = 'done';
    setWaitNote('Opening the dashboard…');
    $('stMainLabel').textContent = 'Open Dashboard';
    $('stMainBtn').disabled = false;
    $('ovCTitle').textContent = 'Welcome aboard!';
    $('ovCText').textContent = 'Your staff access is approved.';
    W.auto = setTimeout(openApprovedDashboard, WAIT_AUTO_OPEN_MS);
  }
  function openApprovedDashboard() {
    if (!W.done || !W.profile) return;
    var p = W.profile;
    stopWaiting(); W.done = false;
    $('statusPane').classList.add('hidden');
    $('authCard').classList.remove('status');
    showApp(p);
  }
  function showApp(profile) {
    resetSessionState();
    S.profile = profile;
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    startIdleGuard();
    $('meRole').textContent = isSuperAdmin(profile) ? 'Super Admin' : 'Staff';
    $('meName').textContent = displayName(profile);
    $('meAv').textContent = initials(displayName(profile));
    loadAll(true);
    startPolling();
    startOrdersRealtime();
    if (isSuperAdmin(profile)) startProfilesRealtime();
    syncNameFromSignup(profile);
  }
  // ---- Staff Access, live: a shopper's Personal Details save (name change,
  // etc) reaches this dashboard immediately instead of on the next 30s poll.
  // Only super admins call adminListAccounts() / see Staff Access, so this
  // only ever runs for them. See supabase/25_profiles_realtime.sql.
  var stopProfilesRealtimeFn = null;
  function startProfilesRealtime() {
    if (stopProfilesRealtimeFn || !window.MaziAPI || !MaziAPI.subscribeProfiles) return;
    stopProfilesRealtimeFn = MaziAPI.subscribeProfiles(function (payload) {
      var changed = (payload && (payload.new || payload.old)) || null;
      if (changed && S.profile && changed.id === S.profile.id && payload.new) {
        // Keep the Auth email as the identity source. Realtime profile rows
        // may contain an older/missing email and must not hide Super Admin
        // navigation after a profile edit.
        S.profile = Object.assign({}, S.profile, payload.new, { email: S.profile.email });
        $('meName').textContent = displayName(S.profile);
        $('meAv').textContent = initials(displayName(S.profile));
      }
      var becameAdminRequest = (changed && changed.signup_source === 'admin' && !changed.is_admin &&
        (payload.eventType === 'INSERT' || (payload.old && payload.old.signup_source !== 'admin'))) ||
        (payload.new && payload.new.staff_requested && !payload.new.is_admin &&
          payload.eventType === 'UPDATE' && payload.old && payload.old.staff_requested === false);
      if (becameAdminRequest) {
        toast('New staff-access request: ' + (changed.name || changed.email || 'An account') + ' is waiting for approval.');
        beep();
      }
      if (S.view === 'staffaccess' || S.view === 'accounts') {
        Promise.all([loadAccounts(), loadProfileChanges()]).then(render);
      }
    });
  }
  function stopProfilesRealtime() {
    if (stopProfilesRealtimeFn) { stopProfilesRealtimeFn(); stopProfilesRealtimeFn = null; }
  }
  // ---- Orders, live: a new order (or a status/refund change from another
  // staff device) reaches this dashboard immediately instead of waiting for
  // the next 30s poll. loadOrders() already knows how to toast + beep +
  // fire a browser notification for anything new — this just makes it run
  // right away instead of on a timer. Falls back to the existing 30s
  // polling automatically if the realtime socket drops for any reason.
  var stopOrdersRealtimeFn = null;
  function startOrdersRealtime() {
    if (stopOrdersRealtimeFn || !window.MaziAPI || !MaziAPI.subscribeAdminOrders) return;
    stopOrdersRealtimeFn = MaziAPI.subscribeAdminOrders(function () {
      if (busy) return; // a load is already in flight — it'll pick this up
      loadOrders(false).then(render);
    });
  }
  function stopOrdersRealtime() {
    if (stopOrdersRealtimeFn) { stopOrdersRealtimeFn(); stopOrdersRealtimeFn = null; }
  }
  // The name typed on the Create Account form travels in the auth metadata; copy it to the profile once.
  function syncNameFromSignup(profile) {
    if (profile.name) return;
    MaziAPI.getSession().then(function (sess) {
      var n = sess && sess.user && sess.user.user_metadata && sess.user.user_metadata.name;
      if (!n) return;
      return MaziAPI.updateProfile({ name: n }).then(function () {
        $('meName').textContent = n; $('meAv').textContent = initials(n);
      });
    }).catch(function () {});
  }
  function isStaff(p) { return !!(p && p.is_admin); }
  function isSuperAdmin(p) {
    // Super-admin access is controlled by the database flag, not by one
    // hard-coded UI label. MAZI has one primary Super Admin account.
    return !!(p && p.is_super_admin && String(p.email || '').trim().toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL);
  }
  function isPrimarySuperAdmin(p) {
    return !!(p && p.is_super_admin && String(p.email || '').trim().toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL);
  }
  function isPrimaryAdminAccount(p) {
    return !!(p && String(p.email || '').trim().toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL);
  }
  // Dashboard-only name: staff_name if the staff member set one, else falls back
  // to the shared profile name / email. Kept separate from the customer-facing
  // "name" (First Name) field so editing Personal Details on the shop side never
  // changes what shows here — see 22_super_admin.sql.
  function displayName(p) {
    if (isPrimarySuperAdmin(p)) return (p && p.staff_name) || PRIMARY_SUPER_ADMIN_NAME;
    return (p && (p.staff_name || p.name)) || ((p && p.email) || '').split('@')[0] || 'Staff';
  }
  function accountDisplayName(p) {
    return isPrimaryAdminAccount(p) ? PRIMARY_SUPER_ADMIN_NAME : ((p && p.name) || ((p && p.email) || '').split('@')[0] || 'Unnamed');
  }
  function accountMobile(p) {
    return isPrimaryAdminAccount(p) ? PRIMARY_SUPER_ADMIN_MOBILE : (p && p.mobile) || '';
  }

  /* ============ login spam guard (this browser) ============
     After 5 wrong passwords the Sign In button locks for 30s, then 1m, 5m, 15m.
     This only calms the form down. The real protection against bots is on the
     server (Supabase rate limits + CAPTCHA), because a bot can skip this page. */
  var LK_KEY = 'mazi_admin_login_lock', LK_STEPS = [30, 60, 300, 900], LK_FREE = 5, lkTimer = null;
  function lkRead() { try { return JSON.parse(localStorage.getItem(LK_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function lkWrite(o) { try { localStorage.setItem(LK_KEY, JSON.stringify(o)); } catch (e) {} }
  function lkLeft() { var o = lkRead(); return Math.max(0, Math.ceil(((o.until || 0) - Date.now()) / 1000)); }
  function lkFmt(n) { return n >= 60 ? Math.floor(n / 60) + 'm ' + (n % 60 < 10 ? '0' : '') + (n % 60) + 's' : n + 's'; }
  function lkTick() {
    var btn = $('loginBtn'), left = lkLeft();
    if (left <= 0) {
      if (lkTimer) { clearInterval(lkTimer); lkTimer = null; }
      if (btn) { btn.disabled = false; $('goLabel').textContent = 'Sign In'; }
      setMsg(''); return;
    }
    if (btn) { btn.disabled = true; $('goLabel').textContent = 'Locked ' + lkFmt(left); }
    setMsg('Too many wrong attempts. Try again in ' + lkFmt(left) + '.');
  }
  function lkStart() { lkTick(); if (!lkTimer && lkLeft() > 0) lkTimer = setInterval(lkTick, 1000); }
  function lkFail() {
    var o = lkRead(); o.n = (o.n || 0) + 1;
    if (o.n >= LK_FREE) { o.until = Date.now() + LK_STEPS[Math.min(o.n - LK_FREE, LK_STEPS.length - 1)] * 1000; }
    lkWrite(o); if (o.until && o.until > Date.now()) lkStart();
  }
  function lkClear() { try { localStorage.removeItem(LK_KEY); } catch (e) {} }

  function login() {
    if (lkLeft() > 0) { lkStart(); return; }
    var email = $('email').value.trim(), pw = $('password').value;
    if (!email || !pw) { setMsg('Enter your email and password.'); return; }
    if (email.indexOf('@') < 0) { setMsg('Sign in with your e-mail address (like name@example.com), not a username.'); $('email').focus(); return; }
    var btn = $('loginBtn'), loadingStarted = showAuthLoading('Signing in…');
    btn.disabled = true; $('goLabel').textContent = '…'; setMsg('');
    // Clear any persisted Supabase session first so a previous staff account
    // cannot remain active while the user is signing in with another email.
    MaziAPI.logout().catch(function () {}).then(function () { return MaziAPI.signInWithPassword(email, pw); }).then(function (res) {
      lkClear();
      if (isStaff(res.profile)) return showApp(res.profile);
      // Registered from admin.html but not approved yet: show the waiting screen.
      if (isPendingStaff(res.profile)) return showWaiting(res.profile);
      // A shop (customer) account: the session stays in THIS page's own storage slot only.
      // Offer to request access; the dashboard stays locked until a Super Admin approves.
      if (res.profile) return showRequestOffer(res.profile, false);
      return MaziAPI.logout().catch(function () {}).then(function () { showLogin('This account is not a staff account.'); });
    }).catch(function (e) {
      var m = String((e && e.message) || '');
      if (/invalid login|invalid credentials|incorrect|wrong/i.test(m) || (e && (e.code === 'invalid_credentials' || e.code === 'AUTH_INVALID'))) lkFail();
      setMsg(m || 'Could not sign in.');
    }).then(function () { return finishAuthLoading(loadingStarted); }).then(function () {
      if (lkLeft() > 0) { lkStart(); } else { btn.disabled = false; $('goLabel').textContent = 'Sign In'; }
    });
  }
  function loginWithGoogle() {
    if (!window.MaziAPI || !MaziAPI.signInWithGoogle) {
      setMsg('Google sign-in is not available. Refresh the page.'); return;
    }
    var btn = $('googleBtn'), loadingStarted = showAuthLoading('Opening Google sign-in…');
    if (btn) btn.disabled = true;
    setMsg('');
    // Mark that THIS click, right here on admin.html, is what should be
    // treated as an admin sign-up request. Without this flag, restore()
    // has no way to tell a deliberate admin.html Google sign-in apart from
    // a customer who is already Google-signed-in on the storefront and
    // simply opens admin.html - both look identical (an active session with
    // provider "google") once the page reloads.
    try { sessionStorage.setItem('mazi_admin_google_claim', String(Date.now())); } catch (e0) {}
    MaziAPI.signInWithGoogle('admin.html').catch(function (e) {
      try { sessionStorage.removeItem('mazi_admin_google_claim'); } catch (e2) {}
      setMsg(e.message || 'Could not start Google sign-in.');
      if (btn) btn.disabled = false;
      return finishAuthLoading(loadingStarted);
    });
  }
  function restore() {
    if (!window.MaziAPI) { showLogin('Could not load the app. Refresh the page.'); return; }
    var oauthParams = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'));
    var oauthError = oauthParams.get('error_description') || oauthParams.get('error');
    if (oauthError) {
      showLogin('Google sign-in failed: ' + oauthError.replace(/\+/g, ' '));
      if (window.history && window.history.replaceState) window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    // Consumed once: true only on the page load right after the user pressed
    // "Continue with Google" here on admin.html (see loginWithGoogle()).
    // Any later restore() of admin.html - a plain reload, or a customer who
    // was already Google-signed-in on the storefront opening admin.html -
    // must NOT re-trigger this, or every such visit quietly turns a
    // customer's account into a pending staff request.
    var claimGoogleAdmin = false;
    try {
      var claimVal = sessionStorage.getItem('mazi_admin_google_claim');
      claimGoogleAdmin = !!claimVal && (claimVal === '1' || (Date.now() - Number(claimVal) >= 0 && Date.now() - Number(claimVal) < 10 * 60 * 1000));
      sessionStorage.removeItem('mazi_admin_google_claim');
    } catch (e1) {}
    MaziAPI.getSession().then(function (s) {
      if (!s) return showLogin();
      var provider = s.user && s.user.app_metadata && s.user.app_metadata.provider;
      var profilePromise = MaziAPI.getProfile();
      // Google sign-in from admin.html registers the account as an admin
      // candidate. It only sees the waiting screen until a Super Admin grants is_admin.
      if (provider === 'google' && claimGoogleAdmin && MaziAPI.claimAdminSignup) {
        profilePromise = profilePromise.then(function () {
          return MaziAPI.claimAdminSignup().then(function () { return MaziAPI.getProfile(); });
        });
      }
      return profilePromise.then(function (p) {
        var authEmail = s.user && s.user.email;
        if (p && authEmail) p = Object.assign({}, p, { email: authEmail });
        if (isStaff(p)) showApp(p);
        else if (isPendingStaff(p)) showWaiting(p);   // waiting for Super Admin approval
        else if (p) showRequestOffer(p, false);        // shop account: may request staff access
        else MaziAPI.logout().catch(function () {}).then(function () { showLogin(''); });
      });
    }).catch(function (e) {
      // Google from admin.html on an existing shop account is not an error: offer the request.
      if (e && e.code === 'STOREFRONT_ACCOUNT') {
        return Promise.all([MaziAPI.getSession(), MaziAPI.getProfile()]).then(function (r) {
          var p = r[1], em = r[0] && r[0].user && r[0].user.email;
          if (p && em) p = Object.assign({}, p, { email: em });
          if (p && isPendingStaff(p)) showWaiting(p); else if (p) showRequestOffer(p, false); else showLogin('');
        }).catch(function () { showLogin(''); });
      }
      var msg = e && e.message ? String(e.message) : '';
      if (/claim_admin_signup|function .*does not exist|schema cache/i.test(msg)) {
        msg = 'Google request setup is incomplete. Ask the developer to run 23_admin_signup_source.sql in Supabase SQL Editor.';
      }
      showLogin(msg);
    });
  }


  /* ============ create account + info pop-ups ============ */
  function setAuthMode(mode) {
    var up = mode === 'signup';
    $('authCard').classList.toggle('signup', up);
    setMsg(''); setMsg('', false, 'suErr');
    setTimeout(function () { (up ? $('suName') : $('email')).focus(); }, 350);
  }
  function signup() {
    var name = $('suName').value.trim(), email = $('suEmail').value.trim(), pw = $('suPassword').value, btn = $('signupBtn');
    var err = function (m) { setMsg(m, false, 'suErr'); };
    if (name.length < 2) return err('Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return err('Please enter a valid email address.');
    if (pw.length < 6) return err('Password must be at least 6 characters.');
    if (!window.MaziAPI) return err('The service is not available. Refresh the page.');
    btn.disabled = true; $('suLabel').textContent = '…'; err('');
    var after = 'After you sign in, you will see your approval status until a Super Admin gives your account staff access.';
    MaziAPI.signUpWithPassword(email, pw, '', name, 'admin').then(function (res) {
      var done = function (msg) {
        $('suName').value = ''; $('suPassword').value = '';
        setAuthMode('signin'); $('email').value = email; $('password').value = '';
        setMsg(msg, true);
      };
      if (res.needsEmailConfirmation) return done('Account created. We sent a confirmation link to ' + email + '. Open it, then sign in here. ' + after);
      // signed in straight away (email confirmation is off): sign out so they log in properly
      return MaziAPI.logout().catch(function () {}).then(function () { done('Account created. You can sign in now. ' + after); });
    }).catch(function (e) {
      if (e && e.code === 'USER_EXISTS') err('This email already has an account (maybe a shop account). Sign in instead; a shop account can request staff access after signing in.');
      else err(e.message || 'Could not create the account.');
    }).then(function () { btn.disabled = false; $('suLabel').textContent = 'Sign Up'; });
  }
  var INFO = {
    about: '<h3>About us</h3><p>MAZI General Trade is a grocery and convenience wholesaler based in Male\', Republic of Maldives, delivering across Male\' and beyond.</p><p>This portal is for our staff to manage orders and stock.</p>',
    contact: '<h3>Contact</h3><p>Phone / Viber: <a href="tel:+9609291600">+960 929 1600</a></p><p>Email: <a href="mailto:info@mazitrading.mv">info@mazitrading.mv</a></p><p>Male\', Republic of Maldives</p>',
    help: '<h3>Help</h3><ol><li>Sign in with the email and password of your staff account, then press <b>Go</b>.</li><li>Forgot your password? Type your email, then press <b>Forgot Password</b> — we send you a reset link.</li><li>New here? Press <b>Create New Account</b>, confirm your email, then ask a Super Admin to give your account staff access (Staff Access page).</li><li>Already have a shop account? Sign in here with it and press <b>Request staff access</b>. You can only enter after a Super Admin approves.</li></ol><p>Shopping as a customer? <a href="index.html">Go to the MAZI shop</a>.</p><p>Still stuck? Write to <a href="mailto:info@mazitrading.mv">info@mazitrading.mv</a>.</p>'
  };
  function openInfo(k) { $('infoBody').innerHTML = INFO[k] || ''; $('infoModal').classList.remove('hidden'); }
  function closeInfo() { $('infoModal').classList.add('hidden'); }

  /* ============ data ============ */
  function loadOrders(initial) {
    return MaziAPI.adminListOrders().then(function (rows) {
      var fresh = [];
      if (knownIds) rows.forEach(function (o) { if (!knownIds[o.id]) fresh.push(o); });
      knownIds = {}; rows.forEach(function (o) { knownIds[o.id] = 1; });
      S.orders = rows;
      if (fresh.length && !initial) {
        toast(fresh.length === 1 ? 'New order #' + fresh[0].id : fresh.length + ' new orders');
        beep();
        fresh.forEach(fireNewOrderNotification);
      }
    });
  }
  function loadStock() {
    return Promise.all([
      MaziAPI.adminListProducts(),
      MaziAPI.adminListStockLog(40).catch(function () { return []; }),
      MaziAPI.adminListProductEditLog(40).catch(function () { return []; })
    ]).then(function (r) {
      S.products = r[0] || []; S.log = r[1] || []; S.editLog = r[2] || []; S.productsError = null;
    }).catch(function (e) {
      S.productsError = e;
    });
  }
  function loadShops() {
    if (!isSuperAdmin(S.profile)) { S.shops = []; S.shopsError = null; return Promise.resolve(); }
    return MaziAPI.adminListShops().then(function (rows) { S.shops = rows || []; S.shopsError = null; })
      .catch(function (e) { S.shopsError = e; });
  }
  function loadAccounts() {
    return MaziAPI.adminListAccounts().then(function (rows) { S.accounts = rows || []; S.accountsError = null; })
      .catch(function (e) { S.accountsError = e; });
  }
  function loadCustomers() {
    return MaziAPI.adminListCustomers().then(function (rows) { S.customers = rows || []; S.customersError = null; })
      .catch(function (e) { S.customersError = e; });
  }
  function loadProfileChanges() {
    if (!isSuperAdmin(S.profile)) { S.profileChanges = []; S.profileChangesError = null; return Promise.resolve(); }
    return MaziAPI.adminListProfileChanges(200).then(function (rows) { S.profileChanges = rows || []; S.profileChangesError = null; })
      .catch(function (e) { S.profileChangesError = e; });
  }
  var lastLoadFailed = false;
  function loadAll(initial) {
    if (busy) return Promise.resolve();
    busy = true; lastLoadFailed = false;
    var jobs = [loadOrders(initial)];
    if (initial) jobs.push(loadSettings());
    if (S.view === 'stock' || S.view === 'dashboard' || S.view === 'pos' || initial) jobs.push(loadStock());
    if (isSuperAdmin(S.profile) && (S.view === 'accounts' || initial)) jobs.push(loadShops(), loadProfileChanges());
    if (isSuperAdmin(S.profile) && (S.view === 'accounts' || S.view === 'staffaccess' || initial)) jobs.push(loadAccounts());
    if (S.view === 'customers' || initial) jobs.push(loadCustomers());
    return Promise.all(jobs).catch(function (e) {
      if (e && e.code === 'NOT_AUTHENTICATED') {
        // A background refresh (not the very first load) can hit a brief token/
        // network hiccup that looks like NOT_AUTHENTICATED even though the
        // session is still fine. Confirm with the server before kicking the
        // staff member back to the login screen — only log out for real.
        if (!initial && window.MaziAPI && MaziAPI.getSession) {
          return MaziAPI.getSession().then(function (sess) {
            if (!sess) showLogin('Session expired. Please sign in again.');
          }).catch(function () { /* stay signed in — try again on the next poll */ });
        }
        showLogin('Session expired. Please sign in again.');
      } else {
        toast((e && e.message) || 'Could not load data.', true);
      }
      lastLoadFailed = true;
    }).then(function () { busy = false; render(); });
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(function () { if (!document.hidden) loadAll(); }, getPollMs()); }
  function stopPolling() { clearInterval(pollTimer); }
  function beep() {
    if (!soundOn()) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext, c = new C(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); setTimeout(function () { o.stop(); c.close(); }, 180);
    } catch (e) {}
  }

  /* ============ helpers ============ */
  function findOrder(id) { return S.orders.filter(function (o) { return o.id === id; })[0]; }
  function findProduct(id) { return S.products.filter(function (p) { return p.id === id; })[0]; }
  function typeOf(o) { return o.orderType === 'walkin' ? 'Walk-in' : (TYPE_LABEL[o.customer && o.customer.method] || '—'); }
  function sourcePill(o) {
    return o.orderType === 'walkin'
      ? '<span class="pill amber src-pill">Walk-in</span>'
      : '<span class="pill src-pill">Online</span>';
  }
  // Who rang up a walk-in / POS sale (staff name; "" for online orders)
  function creatorName(o) {
    if (!o || o.orderType !== 'walkin') return '';
    if (S.profile && o.createdBy && o.createdBy === S.profile.id) return displayName(S.profile);
    return o.createdByName || '';
  }
  function byStaffHtml(o) { var n = creatorName(o); return n ? '<small class="by-staff">by <b>' + esc(n) + '</b></small>' : ''; }
  function locationText(o) {
    var l = (o.customer && o.customer.location) || {}, m = o.customer && o.customer.method, out = [];
    if (m === 'pickup') {
      out.push('Pickup — ' + (l.store || "Male' Showroom"));
      if (l.day) out.push('Day: ' + l.day);
    } else if (m === 'delivery') {
      out.push('Delivery — ' + [l.island, l.atoll].filter(Boolean).join(', '));
      out.push('Address: ' + (l.address || [l.house, l.landmark].filter(Boolean).join(', ')));
    } else if (m === 'boat') {
      out.push('Boat delivery');
      out.push('Boat: ' + (l.boatName || '') + ' · ' + (l.boatContact || '') + ' · departs ' + (l.boatDeparture || ''));
      out.push('Receiver: ' + (l.customerName || '') + ' · ' + (l.customerContact || ''));
      out.push('Island: ' + (l.islandName || '') + ' (' + (l.islandCode || '') + ')');
      out.push('Address: ' + (l.address || ''));
    }
    if (l.note) out.push('Note: ' + l.note);
    return out.join('\n');
  }
  function statusHtml(o) {
    var lbl = (o.orderType === 'walkin' && o.status === 'delivered') ? 'Completed' : LABEL[o.status];
    return '<span class="dot d-' + o.status + '"></span><span class="t-' + o.status + '">' + lbl + '</span>';
  }

  /* ============ render ============ */
  function render() {
    // Staff (non-Super-Admin) accounts can never be on Customers / Accounts / Staff Access, whatever state is left over.
    if (SUPER_ONLY_VIEWS.indexOf(S.view) >= 0 && !isSuperAdmin(S.profile)) { S.view = 'dashboard'; S.accounts = []; }
    // nav + counts
    var active = S.orders.filter(function (o) { return ACTIVE.indexOf(o.status) >= 0; }).length;
    var fresh = S.orders.filter(function (o) { return o.status === 'placed' && !getSeenPlaced()[o.id]; }).length;
    Array.prototype.forEach.call(document.querySelectorAll('.side [data-view]'), function (b) { b.classList.toggle('active', b.dataset.view === S.view); });
    var nc = $('navCnt'); nc.textContent = badgeText(active); nc.classList.toggle('hidden', !active);
    var pend = S.shops.filter(function (x) { return x.status === 'pending'; }).length;
    var sc = $('navShopCnt'); if (sc) { sc.textContent = badgeText(pend); sc.classList.toggle('hidden', !pend); }
    var bn = $('bellN'); bn.textContent = badgeText(fresh); bn.classList.toggle('hidden', !fresh);
    var acBtn = $('navAccountsBtn'); if (acBtn) acBtn.classList.toggle('hidden', !isSuperAdmin(S.profile));
    var saBtn = $('navStaffAccessBtn'); if (saBtn) saBtn.classList.toggle('hidden', !isSuperAdmin(S.profile));
    var cuBtn = $('navCustomersBtn'); if (cuBtn) cuBtn.classList.toggle('hidden', !isSuperAdmin(S.profile));
    var staffRequests = isSuperAdmin(S.profile) ? S.accounts.filter(isStaffRequest).length : 0;
    var sr = $('navStaffReqCnt'); if (sr) { sr.textContent = badgeText(staffRequests); sr.classList.toggle('hidden', !staffRequests); }
    $('search').placeholder = S.view === 'stock' ? 'Search products' : (S.view === 'accounts' ?
      (S.tab.accountsGroup === 'customer' ? 'Search name or email' : 'Search account, owner or mobile') :
      (S.view === 'staffaccess' ? 'Search name or email' : (S.view === 'customers' ? 'Search name or mobile' : 'Search order, name or mobile')));
    if ($('search').value !== S.q) $('search').value = S.q;
    var searchWrap = document.querySelector('.search');
    if (searchWrap) searchWrap.classList.toggle('hidden', S.view === 'dashboard' || S.view === 'pos' || S.view === 'settings');

    // Only replay the rise-up / chart-draw animations when we actually land on
    // a view for the first time (switching tabs). A background poll re-renders
    // the same view every 30s — without this it would replay every time and
    // look like a laggy double-animation.
    var freshMount = S.view !== lastPanelView;
    lastPanelView = S.view;
    // A re-render (poll / data load) that lands while the entrance is still
    // playing must not cut it off. `animEl` = seconds already played; new
    // nodes start their animations that far in (negative delay), so it keeps
    // flowing smoothly instead of snapping to the end.
    var nowMs = Date.now(), animEl = 0;
    if (freshMount) animStart = nowMs;
    else if (nowMs - animStart < ANIM_MS) animEl = (nowMs - animStart) / 1000;
    animElapsed = animEl;
    $('panel').classList.toggle('no-anim', !freshMount && animEl === 0);
    $('panel').style.setProperty('--el', animEl.toFixed(3) + 's');

    if (S.view === 'dashboard') renderDashboard(freshMount);
    else if (S.view === 'stock') renderStock();
    else if (S.view === 'accounts') renderAccounts();
    else if (S.view === 'staffaccess') renderStaffAccess();
    else if (S.view === 'customers') renderCustomers();
    else if (S.view === 'settings') {
      // Don't wipe half-typed values when the 30s background refresh calls render().
      if (freshMount) {
        settingsDirty = false; renderSettings();
        loadSettings().then(function () { if (S.view === 'settings' && !settingsDirty) renderSettings(); });
      } else if (!settingsDirty) renderSettings();
    }
    else if (S.view === 'pos') { if (freshMount) { posReset(); loadPosQuotations(); loadCustomers().then(function () { if (S.view === 'pos') renderPos(); }); } renderPos(); }
    else renderOrders();
    // Same rise-up entrance as the dashboard, applied to whatever landed in the
    // panel — works for every view (Orders, Order History, Stock, Accounts,
    // Staff Access) without needing to know each view's markup. Only runs on
    // an actual category switch (freshMount); background polling never
    // replays it, so it stays smooth and never feels laggy.
    if (freshMount || animEl > 0) animatePanelEntrance();
    if (S.drawerId) refreshDrawer();
  }
  function animatePanelEntrance() {
    var kids = $('panel').children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.add('rise-item');
      kids[i].style.animationDelay = (Math.min(i, 4) * 0.045 - animElapsed).toFixed(3) + 's';
    }
  }

  /* ---------- dashboard ---------- */
  function pctDelta(cur, prev) {
    if (!prev) return '<span class="dstat-delta ' + (cur ? 'up' : 'flat') + '">' + (cur ? 'New today' : 'No change') + '</span>';
    var p = Math.round(((cur - prev) / prev) * 100);
    if (p === 0) return '<span class="dstat-delta flat">Same as yesterday</span>';
    return '<span class="dstat-delta ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '▲' : '▼') + ' ' + Math.abs(p) + '% vs yesterday</span>';
  }
  /* ---- Sales source filter: All / Online / Walk-in ---- */
  function srcOk(o) {
    if (S.salesSource === 'walkin') return o.orderType === 'walkin';
    if (S.salesSource === 'online') return o.orderType !== 'walkin';
    return true;
  }
  function srcSuffix() { return S.salesSource === 'walkin' ? ' · Walk-in' : (S.salesSource === 'online' ? ' · Online' : ''); }
  function sourceTabsHtml() {
    var defs = [['all', 'All sales'], ['online', 'Online'], ['walkin', 'Walk-in']];
    return '<div class="myear-tabs" role="tablist" aria-label="Sales source" style="margin:0 0 14px">' + defs.map(function (d) {
      return '<button type="button" class="myear-tab' + (S.salesSource === d[0] ? ' active' : '') + '" data-sales-source="' + d[0] + '">' + d[1] + '</button>';
    }).join('') + '</div>';
  }
  // Compact "ring" KPI tiles - colour = level (green on track / amber watch / red needs action)
  function overviewRingsHtml(cards) {
    var C = 163.4;
    return '<div class="box ov-box"><h3>Overview' + srcSuffix() + '</h3><div class="rstats">' + cards.map(function (c) {
      var p = c.pct > 0 ? Math.max(c.pct, 0.05) : 0;
      return '<div class="rstat lv-' + c.lvl + '" role="button" tabindex="0" data-goto="' + c.g + '" aria-label="' + esc(c.label) + ': ' + c.val + '">' +
        '<div class="rstat-ring"><svg class="rg" viewBox="0 0 64 64" aria-hidden="true"><circle class="rg-bg" cx="32" cy="32" r="26"/>' +
        (p ? '<circle class="rg-fg" cx="32" cy="32" r="26" style="--p:' + (p * C).toFixed(1) + '"/>' : '') + '</svg>' +
        '<span class="rstat-ico">' + c.ico + '</span></div>' +
        '<b>' + c.val + '</b><small>' + c.label + '</small>' + c.delta + '</div>';
    }).join('') + '</div>' +
      '<div class="rlegend"><span class="lv-good"><i></i>On track</span><span class="lv-warn"><i></i>Watch</span><span class="lv-bad"><i></i>Needs action</span></div></div>';
  }

  function renderDashboard(freshMount) {
    var orders = S.orders, today = ymd(Date.now()), yest = ymd(Date.now() - 86400000);
    // Orders still awaiting staff acceptance ('placed') are excluded from dashboard
    // stats, revenue and the activity feed — they only appear on the Orders page
    // until accepted (moved to 'processing').
    var liveAll = orders.filter(function (o) { return o.status !== 'cancelled' && o.status !== 'placed'; });
    var live = liveAll.filter(srcOk);   // sales figures follow the All / Online / Walk-in filter
    var activeCount = orders.filter(function (o) { return o.status === 'processing' || o.status === 'delivery'; }).length;
    var freshCount = orders.filter(function (o) { return o.status === 'placed' && !getSeenPlaced()[o.id]; }).length;
    var todayOrders = live.filter(function (o) { return ymd(o.placedAt) === today; });
    var yestOrders = live.filter(function (o) { return ymd(o.placedAt) === yest; });
    var todayRev = todayOrders.reduce(function (s, o) { return s + o.total; }, 0);
    var yestRev = yestOrders.reduce(function (s, o) { return s + o.total; }, 0);
    var pendingRefunds = orders.filter(function (o) { return o.status === 'cancelled' && o.refundStatus === 'pending'; }).length;
    var lowStock = 0, outStock = 0;
    (S.products || []).forEach(function (p) { var k = stockStatus(p).key; if (k === 'low') lowStock++; if (k === 'out') outStock++; });
    var lowTotal = lowStock + outStock; // combined, used only for the "needs attention" notification badge

    var cards = [
      { ico: ICON.clock, cls: 'blue', label: 'Active Orders', val: num(activeCount), g: 'live:all', delta: '<span class="dstat-delta flat">' + num(liveAll.filter(function (o) { return o.orderType !== 'walkin' && ymd(o.placedAt) === today; }).length) + ' placed today</span>' },
      { ico: ICON.cash, cls: '', label: "Today's Revenue" + srcSuffix(), val: esc(mvr(todayRev)), g: 'history:all', delta: pctDelta(todayRev, yestRev) },
      { ico: ICON.bag, cls: 'purple', label: (S.salesSource === 'walkin' ? 'Sales Today' : 'New Orders Today') + srcSuffix(), val: num(todayOrders.length), g: 'history:all', delta: pctDelta(todayOrders.length, yestOrders.length) },
      { ico: ICON.alert, cls: 'amber', label: 'Low Stock Items', val: num(lowStock), g: 'stock:low', delta: '<span class="dstat-delta ' + (lowStock ? 'down' : 'flat') + '">' + (lowStock ? 'Needs restock' : 'All good') + '</span>' },
      { ico: ICON.alert, cls: 'red', label: 'Out of Stock', val: num(outStock), g: 'stock:out', delta: '<span class="dstat-delta ' + (outStock ? 'down' : 'flat') + '">' + (outStock ? 'Restock now' : 'All good') + '</span>' },
      { ico: ICON.undo, cls: 'red', label: 'Pending Refunds', val: num(pendingRefunds), g: 'history:refund_pending', delta: '<span class="dstat-delta ' + (pendingRefunds ? 'down' : 'flat') + '">' + (pendingRefunds ? 'Awaiting refund' : 'None pending') + '</span>' }
    ];
    var hr = new Date().getHours();
    var greetWord = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
    var firstName = displayName(S.profile).split(' ')[0];
    var dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    var h = '<h1>Good ' + greetWord + (firstName ? ', ' + esc(firstName) : '') + '</h1>' +
      '<p class="lead">' + esc(dateStr) + ' · Store overview &amp; today\'s activity.</p>' + sourceTabsHtml();
    // level colour code for the ring tiles: [fill 0..1, good|warn|bad|idle]
    function cmpLv(cur, prev) { var ref = Math.max(cur, prev); return [ref ? cur / ref : 0, prev ? (cur >= prev ? 'good' : 'warn') : (cur ? 'good' : 'idle')]; }
    function tierLv(n, warnAt, badAt, cap) { return [Math.min(n / cap, 1), n >= badAt ? 'bad' : (n >= warnAt ? 'warn' : 'good')]; }
    var lvls = [
      tierLv(activeCount, 5, 10, 10),          // Active Orders: 0-4 ok, 5-9 busy, 10+ backlog
      cmpLv(todayRev, yestRev),                // Today's Revenue vs yesterday
      cmpLv(todayOrders.length, yestOrders.length),
      tierLv(lowStock, 1, 5, 10),              // Low Stock: 0 ok, 1-4 watch, 5+ act
      tierLv(outStock, 1, 3, 5),               // Out of Stock: 0 ok, 1-2 watch, 3+ act
      tierLv(pendingRefunds, 1, 3, 5)          // Pending Refunds: 0 ok, 1-2 watch, 3+ act
    ];
    cards.forEach(function (c, i) { c.pct = lvls[i][0]; c.lvl = lvls[i][1]; });


    h += '<div class="dgrid"><div>';
    h += weeklyChartHtml(live);   // Weekly Performance sits at the top of the main column

    var qa = [
      { g: 'live:all', ico: ICON.bolt, t: 'Online Orders', s: num(activeCount) + ' need action' },
      { g: 'history:all', ico: ICON.receipt, t: 'Order History', s: num(orders.length) + ' total orders' },
      { g: 'stock:all', ico: ICON.box, t: 'Manage Stock', s: num((S.products || []).length) + ' products' },
      { g: 'stock:low', ico: ICON.alert, t: 'Low Stock', s: num(lowStock) + ' need restock' }
    ];
    h += '<div class="box"><h3>Quick Actions</h3><div class="qa-grid">' + qa.map(function (a) {
      return '<button type="button" class="qa-card" data-goto="' + a.g + '"><span class="qa-ico">' + a.ico + '</span><b>' + a.t + '</b><span>' + a.s + '</span></button>';
    }).join('') + '</div></div>';

    h += monthlySalesHtml(orders.filter(srcOk));
    h += topSellingProductsHtml(live);
    h += notifPanelHtml(lowStock, outStock, pendingRefunds, freshCount);   // landscape strip right under Top Selling Products
    h += '</div><div>';
    h += overviewRingsHtml(cards);
    h += activityFeedHtml();
    h += '</div></div>';

    $('panel').innerHTML = h;
    animateWeeklyChart(freshMount || animElapsed > 0, animElapsed);
  }

  function animateWeeklyChart(freshMount, skip) {
    skip = skip || 0;
    var wrap = document.querySelector('.chart-wrap');
    if (!wrap) return;
    var svg = wrap.querySelector('svg');
    if (!svg) return;
    var line = svg.querySelector('.chart-line');
    var area = svg.querySelector('path[fill^="url(#"]');
    var dot = wrap.querySelector('.chart-dot');
    if (!freshMount) {
      // Background refresh of the same view — show the finished state right
      // away instead of replaying the 3s draw-in every poll.
      if (line) { line.style.transition = 'none'; line.style.strokeDasharray = 'none'; line.style.strokeDashoffset = '0'; }
      if (area) { area.style.transition = 'none'; area.style.opacity = '1'; }
      if (dot) { dot.style.transition = 'none'; dot.style.opacity = '1'; }
      return;
    }
    if (line && line.getTotalLength) {
      var len = line.getTotalLength();
      line.style.transition = 'none';
      line.style.strokeDasharray = len + ' ' + len;
      line.style.strokeDashoffset = len;
      if (dot) dot.style.opacity = '0';
      if (area) area.style.opacity = '0';
      // force reflow so the starting state is committed before transitioning
      line.getBoundingClientRect();
      requestAnimationFrame(function () {
        line.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1) ' + (-skip).toFixed(3) + 's';
        line.style.strokeDashoffset = '0';
        if (area) { area.style.transition = 'opacity .9s ease-out ' + (0.5 - skip).toFixed(3) + 's'; area.style.opacity = '1'; }
        if (dot) { dot.style.transition = 'opacity .4s ease-out ' + (1.1 - skip).toFixed(3) + 's'; dot.style.opacity = '1'; }
      });
    }
  }

  function smoothPath(P) {
    if (P.length < 2) return 'M' + P[0].x.toFixed(1) + ',' + P[0].y.toFixed(1);
    var d = 'M' + P[0].x.toFixed(1) + ',' + P[0].y.toFixed(1);
    for (var i = 0; i < P.length - 1; i++) {
      var p0 = P[i === 0 ? 0 : i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2 < P.length ? i + 2 : i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
    }
    return d;
  }
  // Shared wave/sparkline renderer used by the Weekly Performance chart and
  // by each expanded month's mini daily-sales chart. Draws a smoothed line +
  // area over `vals`, with edge-to-edge hover columns (a guide line + tooltip
  // per point, using `fullLabels`/`ordVals` for the tooltip text) and a
  // permanent dot on the last point.
  function waveChartHtml(vals, fullLabels, ordVals, H) {
    var W = 620, pad = 8, padTop = Math.max(12, Math.round(H * 0.16));
    var max = Math.max.apply(null, vals.concat([1]));
    var P = vals.map(function (v, idx) {
      return { x: pad + idx * ((W - pad * 2) / Math.max(1, vals.length - 1)), y: H - pad - (v / max) * (H - pad - padTop) };
    });
    var line = smoothPath(P);
    var area = line + ' L' + (W - pad) + ',' + (H - pad) + ' L' + pad + ',' + (H - pad) + ' Z';
    var last = P[P.length - 1];
    var gradId = 'g' + Math.random().toString(36).slice(2, 9);
    var hits = P.map(function (pt, idx) {
      var leftBound = idx === 0 ? 0 : (P[idx - 1].x + pt.x) / 2;
      var rightBound = idx === P.length - 1 ? W : (pt.x + P[idx + 1].x) / 2;
      var colLeftPct = (leftBound / W * 100).toFixed(2);
      var colWidthPct = ((rightBound - leftBound) / W * 100).toFixed(2);
      var offPct = (((pt.x - leftBound) / (rightBound - leftBound)) * 100).toFixed(2);
      var topPct = (pt.y / H * 100).toFixed(2);
      var n = ordVals[idx];
      return '<div class="chart-hit" style="left:' + colLeftPct + '%;width:' + colWidthPct + '%">' +
        '<div class="chart-guide" style="left:' + offPct + '%"></div>' +
        '<div class="chart-hit-dot" style="left:' + offPct + '%;top:' + topPct + '%"></div>' +
        '<div class="chart-tip" style="left:' + offPct + '%;top:' + topPct + '%"><b>' + esc(mvr(vals[idx])) + '</b><span>' + esc(fullLabels[idx]) + '</span><span>' + num(n) + ' order' + (n === 1 ? '' : 's') + '</span></div>' +
        '</div>';
    }).join('');
    return '<div class="chart-plot" style="height:' + H + 'px">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:' + H + 'px;display:block;overflow:visible">' +
        '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="var(--green-500)" stop-opacity=".28"></stop>' +
          '<stop offset="100%" stop-color="var(--green-500)" stop-opacity="0"></stop>' +
        '</linearGradient></defs>' +
        '<path d="' + area + '" fill="url(#' + gradId + ')" stroke="none"></path>' +
        '<path class="chart-line" d="' + line + '" fill="none" stroke="var(--green-600)" stroke-width="2.4" stroke-linecap="round"></path>' +
      '</svg>' +
      '<span class="chart-dot" style="left:' + (last.x / W * 100).toFixed(2) + '%;top:' + (last.y / H * 100).toFixed(2) + '%"></span>' +
      hits +
      '</div>';
  }
  function weeklyChartHtml(live) {
    var days = [], i;
    for (i = 6; i >= 0; i--) days.push(ymd(Date.now() - i * 86400000));
    var revByDay = {}, ordByDay = {}; days.forEach(function (d) { revByDay[d] = 0; ordByDay[d] = 0; });
    live.forEach(function (o) { var d = ymd(o.placedAt); if (revByDay[d] != null) { revByDay[d] += o.total; ordByDay[d]++; } });
    var vals = days.map(function (d) { return revByDay[d]; });
    var ordVals = days.map(function (d) { return ordByDay[d]; });
    var thisWeek = vals.reduce(function (s, v) { return s + v; }, 0);
    var thisWeekOrders = live.filter(function (o) { return days.indexOf(ymd(o.placedAt)) >= 0; }).length;
    var prevDays = []; for (i = 13; i >= 7; i--) prevDays.push(ymd(Date.now() - i * 86400000));
    var prevWeek = 0; live.forEach(function (o) { var d = ymd(o.placedAt); if (prevDays.indexOf(d) >= 0) prevWeek += o.total; });
    var wchg = prevWeek ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null;
    var dLabels = days.map(function (d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }); });
    var dFull = days.map(function (d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); });

    return '<div class="box chart-wrap wk-box"><h3>Weekly Performance' + srcSuffix() + '</h3>' +
      '<div class="chart-legend"><span><i style="background:var(--green-600)"></i>Revenue · last 7 days</span></div>' +
      waveChartHtml(vals, dFull, ordVals, 150) +
      '<div class="chart-days">' + dLabels.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>' +
      '<div class="snap"><div><small>This Week Revenue</small><b>' + esc(mvr(thisWeek)) + '</b></div>' +
      '<div><small>This Week Orders</small><b>' + num(thisWeekOrders) + '</b></div>' +
      (wchg == null ? '' : '<div><small>vs Last Week</small><b>' + (wchg >= 0 ? '+' : '') + wchg + '%</b></div>') +
      '</div></div>';
  }

  function monthlySalesHtml(orders) {
    // Same "live" definition used across the dashboard: cancelled and
    // not-yet-accepted ('placed') orders don't count as sales.
    var live = orders.filter(function (o) { return o.status !== 'cancelled' && o.status !== 'placed'; });
    if (!live.length) {
      return '<div class="box month-sales" style="margin-top:16px"><h3>Sales by Month' + srcSuffix() + '</h3><div class="empty" style="padding:16px">No sales yet.</div></div>';
    }
    var byMonth = {};
    live.forEach(function (o) {
      var d = new Date(o.placedAt);
      var key = d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
      if (!byMonth[key]) byMonth[key] = { rev: 0, cnt: 0, year: d.getFullYear(), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), orders: [] };
      byMonth[key].rev += o.total; byMonth[key].cnt++; byMonth[key].orders.push(o);
    });
    // allMonths stays the full, unfiltered, newest-first list — the year tabs
    // below only change what's *shown*, so "vs prev." can keep comparing
    // against the true previous month (e.g. Jan 2026 vs Dec 2025) even while
    // a single year is selected.
    var allMonths = Object.keys(byMonth).map(function (k) { return { key: k, m: byMonth[k] }; }).sort(function (a, b) { return b.m.ts - a.m.ts; });
    var indexByKey = {}; allMonths.forEach(function (x, i) { indexByKey[x.key] = i; });

    // Once sales span more than one calendar year, show a year filter so the
    // list doesn't just keep growing forever.
    var years = []; allMonths.forEach(function (x) { if (years.indexOf(x.m.year) < 0) years.push(x.m.year); });
    years.sort(function (a, b) { return b - a; });
    var yearFilterOn = years.length > 1;
    if (yearFilterOn && S.salesYear !== 'all' && years.indexOf(Number(S.salesYear)) < 0) S.salesYear = 'all';
    var activeYear = yearFilterOn ? S.salesYear : 'all';
    var yearTabs = !yearFilterOn ? '' : '<div class="myear-tabs"><button type="button" class="myear-tab' + (activeYear === 'all' ? ' active' : '') + '" data-sales-year="all">All</button>' +
      years.map(function (y) { return '<button type="button" class="myear-tab' + (String(activeYear) === String(y) ? ' active' : '') + '" data-sales-year="' + y + '">' + y + '</button>'; }).join('') + '</div>';

    var monthsInView = activeYear === 'all' ? allMonths : allMonths.filter(function (x) { return x.m.year === Number(activeYear); });
    var grandRev = monthsInView.reduce(function (s, x) { return s + x.m.rev; }, 0);
    var grandCnt = monthsInView.reduce(function (s, x) { return s + x.m.cnt; }, 0);

    // Once the list grows past a handful of months, collapse it down to the
    // most recent ones with a "Show all" toggle (arrow) at the bottom, so the
    // dashboard doesn't turn into an endless scroll as history piles up.
    var LIMIT = 6;
    var showAll = !!S.showAllMonths || monthsInView.length <= LIMIT;
    var shown = showAll ? monthsInView : monthsInView.slice(0, LIMIT);

    var rows = shown.map(function (x) {
      var m = x.m, prevEntry = allMonths[indexByKey[x.key] + 1], prev = prevEntry && prevEntry.m;
      var deltaHtml = '';
      if (prev && prev.rev) {
        var d = Math.round(((m.rev - prev.rev) / prev.rev) * 100);
        deltaHtml = '<span class="dstat-delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '▲' : '▼') + ' ' + Math.abs(d) + '%</span>';
      }
      var expanded = !!S.expMonths[x.key];
      var row = '<div class="month-row" role="button" tabindex="0" data-month-toggle="' + x.key + '">' +
        '<span class="month-name"><span class="chevron-ico' + (expanded ? ' open' : '') + '">' + ICON.chevron + '</span>' + esc(m.label) + '</span>' +
        '<span>' + num(m.cnt) + '</span><span class="month-rev">' + esc(mvr(m.rev)) + '</span><span>' + deltaHtml + '</span></div>';
      if (!expanded) return '<div class="month-item">' + row + '</div>';
      // Expanded: a small day-by-day wave for this exact month, same hover
      // tooltip behaviour as the main Weekly Performance chart above.
      var monthDate = new Date(m.ts), year = monthDate.getFullYear(), monIdx = monthDate.getMonth();
      var now = new Date(), isCurrent = year === now.getFullYear() && monIdx === now.getMonth();
      var dayCount = isCurrent ? now.getDate() : new Date(year, monIdx + 1, 0).getDate();
      var dayRev = new Array(dayCount).fill(0), dayOrd = new Array(dayCount).fill(0);
      m.orders.forEach(function (o) { var dd = new Date(o.placedAt).getDate(); if (dd >= 1 && dd <= dayCount) { dayRev[dd - 1] += o.total; dayOrd[dd - 1]++; } });
      var dayFull = []; for (var di = 1; di <= dayCount; di++) dayFull.push(new Date(year, monIdx, di).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
      var wave = '<div class="month-wave"><div class="chart-legend"><span><i style="background:var(--green-600)"></i>Daily sales · ' + esc(m.label) + '</span></div>' + waveChartHtml(dayRev, dayFull, dayOrd, 72) + '</div>';
      return '<div class="month-item">' + row + wave + '</div>';
    }).join('');

    var moreBtn = monthsInView.length > LIMIT
      ? '<button type="button" class="month-more" data-months-toggle>' + (showAll ? 'Show less' : 'Show all ' + monthsInView.length + ' months') + '<span class="chevron-ico' + (showAll ? ' open' : '') + '">' + ICON.chevron + '</span></button>'
      : '';
    var totalLabel = 'Total' + (activeYear !== 'all' ? ' · ' + activeYear : '') + ' · ' + num(monthsInView.length) + ' month' + (monthsInView.length === 1 ? '' : 's');

    return '<div class="box month-sales" style="margin-top:16px"><h3>Sales by Month' + srcSuffix() + '</h3>' +
      yearTabs +
      '<div class="month-head"><span>Month</span><span>Orders</span><span>Revenue</span><span>vs prev.</span></div>' +
      (rows || '<div class="empty" style="padding:16px">No sales in ' + esc(activeYear) + '.</div>') + moreBtn +
      '<div class="month-total"><span>' + totalLabel + '</span><span>' + num(grandCnt) + '</span><span>' + esc(mvr(grandRev)) + '</span><span></span></div>' +
      '</div>';
  }

  // Top Selling Products — aggregates order_items across all live orders
  // (walk-in + online, same "live" rule as the rest of the dashboard: not
  // cancelled, not still 'placed') from the last 30 days, ranked by revenue.
  // Reuses data already in S.orders/S.products — no new table, no new query.
  function topSellingProductsHtml(live) {
    var cutoff = Date.now() - 30 * 86400000;
    var byProduct = {};
    live.forEach(function (o) {
      if (o.placedAt < cutoff) return;
      (o.items || []).forEach(function (it) {
        var key = it.id || it.name;
        if (!byProduct[key]) byProduct[key] = { id: it.id, name: it.name, qty: 0, rev: 0 };
        byProduct[key].qty += Number(it.qty) || 0;
        byProduct[key].rev += (Number(it.qty) || 0) * (Number(it.price) || 0) - (Number(it.discount) || 0);
      });
    });
    var list = Object.keys(byProduct).map(function (k) { return byProduct[k]; })
      .sort(function (a, b) { return b.rev - a.rev; })
      .slice(0, 6);
    var body = !list.length
      ? '<div class="empty" style="padding:16px">No sales in the last 30 days.</div>'
      : list.map(function (x, i) {
        var p = findProduct(x.id);
        var thumb = (p && p.image_url)
          ? '<img class="ico thumb" src="' + esc(p.image_url) + '" alt="" loading="lazy" data-img-view="' + esc(p.id) + '" title="Click to view" onerror="this.outerHTML=\'<span class=&quot;ico&quot;>' + esc((p && p.icon) || '📦') + '</span>\'">'
          : '<span class="ico">' + esc((p && p.icon) || '📦') + '</span>';
        return '<div class="topprod-row">' +
          '<span class="topprod-rank">' + (i + 1) + '</span>' +
          thumb +
          '<span class="topprod-name">' + esc(x.name || '—') + '</span>' +
          '<span class="topprod-figs"><span class="topprod-rev">' + esc(mvr(x.rev)) + '</span><span class="topprod-sold">' + num(x.qty) + ' sold</span></span>' +
          '</div>';
      }).join('');
    return '<div class="box" style="margin-top:16px"><h3>Top Selling Products' + srcSuffix() + '</h3><p class="topprod-lead">Your best movers · last 30 days</p>' + body + '</div>';
  }

  function activityFeedHtml() {
    var items = [];
    S.orders.filter(function (o) { return o.status !== 'placed'; }).slice().sort(function (a, b) { return b.placedAt - a.placedAt; }).slice(0, 5).forEach(function (o) {
      var c = o.customer || {};
      // clicking a "placed order" activity opens that exact order's drawer
      var who = creatorName(o);
      items.push({ t: o.placedAt, ico: ICON.bag, cls: 'amber',
        text: who ? '<b>' + esc(who) + '</b> created walk-in sale #' + esc(o.id) : '<b>' + esc(c.name || 'Customer') + '</b> placed order #' + esc(o.id),
        sub: (who && c.name ? esc(c.name) + ' · ' : '') + esc(mvr(o.total)) + ' · ' + LABEL[o.status], attrs: 'data-open="' + esc(o.id) + '"' });
    });
    var REASON = { restock: 'Restocked', set: 'Stock set', order: 'Sold', cancel: 'Returned' };
    var REASON_CLS = { restock: 'blue', set: 'purple', order: 'green', cancel: 'red' };
    (S.log || []).slice(0, 5).forEach(function (l) {
      var name = (l.products && l.products.name) || l.product_id;
      // clicking a stock activity jumps to the Stock page, already filtered to
      // this exact product and the tab matching its current stock level
      var afterQty = l.qty_after;
      var stockTab = afterQty == null ? 'all' : (afterQty <= 0 ? 'out' : (afterQty <= LOW_STOCK_MAX ? 'low' : 'in'));
      var attrs = 'data-goto="stock:' + stockTab + '" data-goto-q="' + esc(name) + '"';
      items.push({ t: new Date(l.created_at).getTime(), ico: ICON.box, cls: REASON_CLS[l.reason] || '', text: esc(REASON[l.reason] || l.reason) + ' <b>' + esc(name) + '</b>', sub: (l.change >= 0 ? '+' : '') + l.change + ' → ' + num(l.qty_after), attrs: attrs });
    });
    items.sort(function (a, b) { return b.t - a.t; });
    items = items.slice(0, 6);
    return '<div class="box"><h3>Activity Feed</h3><div class="feed">' + (items.length ? items.map(function (it) {
      return '<div class="feed-row" role="button" tabindex="0" ' + it.attrs + '><span class="feed-ico ' + (it.cls || '') + '">' + it.ico + '</span><div><p>' + it.text + '</p><small>' + it.sub + ' · ' + esc(ago(it.t)) + '</small></div></div>';
    }).join('') : '<div class="empty" style="padding:14px">Nothing yet.</div>') + '</div></div>';
  }

  function notifPanelHtml(lowStock, outStock, pendingRefunds, freshCount) {
    var alerts = [];
    if (freshCount) alerts.push({ cls: '', ico: ICON.bag, t: freshCount + ' new order' + (freshCount > 1 ? 's' : '') + ' need action', d: 'Waiting to be started.', g: 'live:placed' });
    if (outStock) alerts.push({ cls: 'red', ico: ICON.alert, t: outStock + ' product' + (outStock > 1 ? 's are' : ' is') + ' out of stock', d: 'Restock now — these can\'t be sold.', g: 'stock:out' });
    if (lowStock) alerts.push({ cls: 'amber', ico: ICON.alert, t: lowStock + ' product' + (lowStock > 1 ? 's are' : ' is') + ' low on stock', d: 'Restock soon to avoid running out.', g: 'stock:low' });
    if (pendingRefunds) alerts.push({ cls: 'red', ico: ICON.undo, t: pendingRefunds + ' refund' + (pendingRefunds > 1 ? 's' : '') + ' pending', d: 'Customers are waiting to be refunded.', g: 'history:refund_pending' });
    var body = alerts.length ? alerts.map(function (a) {
      return '<div class="alert-card ' + a.cls + '">' + a.ico + '<div><p class="at">' + esc(a.t) + '</p><p class="ad">' + esc(a.d) + '</p><button type="button" class="btn ghost sm" data-goto="' + a.g + '">View</button></div></div>';
    }).join('') : '<div class="alert-card ok">' + ICON.check + '<div><p class="at">All caught up</p><p class="ad">No alerts right now.</p></div></div>';

    var notifBit;
    if (!notifSupported()) {
      notifBit = '<span>Browser alerts aren\'t supported on this device.</span>';
    } else if (Notification.permission === 'denied') {
      notifBit = '<span>Browser alerts are blocked — enable them in your browser settings.</span>';
    } else if (Notification.permission === 'granted') {
      var on = getStaffNotifPref() !== 'off';
      notifBit = '<span>' + (on ? 'Order alerts are on' : 'Order alerts are off') + '</span><button type="button" class="btn ghost sm" ' + (on ? 'data-notif-off' : 'data-notif-on') + '>' + (on ? 'Turn off' : 'Turn on') + '</button>';
    } else {
      notifBit = '<span>Get notified here when a new order comes in.</span><button type="button" class="btn primary sm" data-notif-enable>Enable alerts</button>';
    }
    return '<div class="box notif-wide"><h3>Notifications</h3><div class="nw-body"><div class="alerts">' + body + '</div><div class="notif-card">' + notifBit + '</div></div></div>';
  }

  /* ---------- orders ---------- */
  function baseOrders() {
    var list = S.orders;
    if (S.view === 'live') list = list.filter(function (o) { return ACTIVE.indexOf(o.status) >= 0; });
    var q = S.q.trim().toLowerCase();
    if (q) list = list.filter(function (o) {
      var c = o.customer || {};
      return (o.id + ' ' + (c.name || '') + ' ' + (c.mobile || '') + ' ' + creatorName(o)).toLowerCase().indexOf(q) >= 0;
    });
    return list;
  }
  function tabList(list) {
    var tab = S.tab[S.view];
    if (S.view === 'live') return tab === 'all' ? list : list.filter(function (o) { return o.status === tab; });
    if (tab === 'completed') return list.filter(function (o) { return o.status === 'delivered'; });
    if (tab === 'cancelled') return list.filter(function (o) { return o.status === 'cancelled'; });
    if (tab === 'refund_pending') return list.filter(function (o) { return o.status === 'cancelled' && o.refundStatus === 'pending'; });
    if (tab === 'refund_done') return list.filter(function (o) { return o.status === 'cancelled' && o.refundStatus === 'refunded'; });
    if (tab === 'placed' || tab === 'processing' || tab === 'delivery') return list.filter(function (o) { return o.status === tab; });
    return list;
  }
  function cnt(list, st) { return list.filter(function (o) { return o.status === st; }).length; }
  function cntRefund(list, rs) { return list.filter(function (o) { return o.status === 'cancelled' && o.refundStatus === rs; }).length; }

  function renderOrders() {
    var base = baseOrders(), tab = S.tab[S.view], h = '';
    var defs, title, lead;
    if (S.view === 'live') {
      title = 'Online Orders'; lead = 'Online store orders that still need action. Walk-in sales are in Order History. Updates every 30 seconds.';
      defs = [['all', 'All', base.length], ['placed', 'New', cnt(base, 'placed')], ['processing', 'Processing', cnt(base, 'processing')], ['delivery', 'Out for delivery', cnt(base, 'delivery')]];
    } else {
      title = 'Order History'; lead = 'Every order, newest first.';
      defs = [['all', 'All Order', base.length], ['placed', 'New', cnt(base, 'placed')], ['processing', 'Processing', cnt(base, 'processing')], ['delivery', 'Out for delivery', cnt(base, 'delivery')], ['completed', 'Completed', cnt(base, 'delivered')], ['cancelled', 'Cancelled', cnt(base, 'cancelled')], ['refund_pending', 'Needs Refund', cntRefund(base, 'pending')], ['refund_done', 'Refunded', cntRefund(base, 'refunded')], ['summary', 'Summary', null]];
    }
    h += '<h1>' + title + '</h1><p class="lead">' + lead + '</p><div class="bar"><div class="tabs">' +
      defs.map(function (d) {
        return '<button class="tab' + (tab === d[0] ? ' active' : '') + '" data-tab="' + d[0] + '">' + d[1] + (d[2] != null ? '<span class="n">' + d[2] + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    h += '</div>';

    if (S.view === 'history' && tab === 'summary') {
      h += sourceTabsHtml() + summaryHtml(base.filter(srcOk));
    } else {
      var list = tabList(base);
      if (!list.length) h += '<div class="empty">No orders here.</div>';
      else {
        h += '<div class="thead"><div>Id</div><div>Customer</div><div>Payment</div><div>Placed</div><div>Type</div><div>Status</div><div>Total</div><div></div></div>';
        h += list.map(rowHtml).join('');
      }
    }
    $('panel').innerHTML = h;
  }

  function rowHtml(o) {
    var c = o.customer || {};
    return '<div class="trow' + (o.status === 'placed' ? ' new' : '') + '" data-open="' + esc(o.id) + '">' +
      '<div class="c-id">#' + esc(o.id) + '<div style="margin-top:4px">' + sourcePill(o) + '</div></div>' +
      '<div class="c-name"><span class="av">' + esc(initials(c.name)) + '</span><span><b>' + esc(c.name) + '</b><small>' + esc(c.mobile) + ' · ' + esc(typeOf(o)) + '</small></span></div>' +
      '<div class="c-pay">' + (o.orderType === 'walkin'
        ? '<span class="pill gray">At counter</span>' + byStaffHtml(o)
        : '<span class="pill">Slip</span> ' + esc(o.currency)) + '</div>' +
      '<div class="c-time"><b>' + esc(fmtShort(o.placedAt)) + '</b><small>' + esc(ago(o.placedAt)) + '</small></div>' +
      '<div class="c-type">' + esc(typeOf(o)) + '</div>' +
      '<div class="c-status">' + statusHtml(o) + '</div>' +
      '<div class="c-total">' + esc(mvr(o.total)) + '</div>' +
      '<div class="c-act"><button class="kebab" data-menu="' + esc(o.id) + '" aria-label="Actions">' + ICON.kebab + '</button></div>' +
    '</div>';
  }

  function summaryHtml(list) {
    var live = list.filter(function (o) { return o.status !== 'cancelled'; });
    var revenue = live.reduce(function (s, o) { return s + o.total; }, 0);
    var delivered = cnt(list, 'delivered'), cancelled = cnt(list, 'cancelled');
    var tbc = live.filter(function (o) { return o.deliveryFee == null; }).length;
    var byProd = {};
    live.forEach(function (o) { o.items.forEach(function (it) {
      var k = it.id || it.name; byProd[k] = byProd[k] || { name: it.name, qty: 0, amount: 0 };
      byProd[k].qty += it.qty; byProd[k].amount += it.qty * it.price - (Number(it.discount) || 0);
    }); });
    var top = Object.keys(byProd).map(function (k) { return byProd[k]; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 6);
    return '<div class="stats">' +
      '<div class="stat"><small>Orders</small><b>' + list.length + '</b></div>' +
      '<div class="stat"><small>Sales (not cancelled)</small><b>' + esc(mvr(revenue)) + '</b></div>' +
      '<div class="stat"><small>Delivered</small><b>' + delivered + '</b></div>' +
      '<div class="stat"><small>Cancelled</small><b>' + cancelled + '</b></div>' +
      '<div class="stat"><small>Fee still to confirm</small><b>' + tbc + '</b></div></div>' +
      '<div class="box"><h3>Best sellers</h3>' + (top.length ? top.map(function (t) {
        return '<div class="rank"><span>' + esc(t.name) + '</span><span><b>' + t.qty + '</b> units · ' + esc(mvr(t.amount)) + '</span></div>';
      }).join('') : '<div class="empty" style="padding:16px">No sales in this range.</div>') + '</div>' + staffSalesHtml(live);
  }
  // Walk-in sales grouped by the staff member who rang them up
  function staffSalesHtml(live) {
    var by = {}, any = false;
    live.forEach(function (o) {
      var n = creatorName(o); if (!n) return;
      any = true; by[n] = by[n] || { name: n, orders: 0, amount: 0 };
      by[n].orders++; by[n].amount += o.total;
    });
    if (!any) return '';
    var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.amount - a.amount; });
    return '<div class="box" style="margin-top:16px"><h3>Walk-in sales by staff</h3>' + rows.map(function (r) {
      return '<div class="rank"><span>' + esc(r.name) + '</span><span><b>' + r.orders + '</b> sale' + (r.orders === 1 ? '' : 's') + ' · ' + esc(mvr(r.amount)) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- stock ---------- */
  // Kept for reference; no longer used to exclude unpriced products from
  // admin's stock views — they now show in All / In stock / Low / Out /
  // Not tracked / Hidden based on actual stock status, with a "No price"
  // badge until priced.
  function hasPrice(p) { return p.price > 0; }
  function stockStatus(p) {
    if (p.stock_qty == null) return { key: 'untracked', label: 'Not tracked', cls: 'gray' };
    if (p.stock_qty <= 0) return { key: 'out', label: 'Out of stock', cls: 'red' };
    if (p.stock_qty <= LOW_STOCK_MAX) return { key: 'low', label: 'Low stock', cls: 'amber' };
    return { key: 'in', label: 'In stock', cls: '' };
  }
  function renderStock() {
    var h = '<div class="bar" style="align-items:flex-start"><div><h1>Stock</h1><p class="lead">Type the current count for a product and hit Update — that becomes its stock. Orders take units off automatically: <b>Low stock = 1–10 units</b>, while <b>Out of stock = 0 units</b>.</p></div>' +
      '<button type="button" class="btn primary sm" data-add-product>+ Add product</button></div>';
    if (S.productsError) {
      var msg = String(S.productsError.message || '');
      if (/stock_qty|stock_log|admin_adjust_stock/i.test(msg)) {
        h += '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>supabase/08_stock.sql</code>, then press Refresh.</div>';
      } else if (/product_edit_log|admin_update_product/i.test(msg)) {
        h += '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>supabase/10_product_edits.sql</code>, then press Refresh.</div>';
      } else {
        h += '<div class="note-banner">Could not load products: ' + esc(msg) + '</div>';
      }
      $('panel').innerHTML = h; return;
    }
    var P = S.products, c = { in: 0, low: 0, out: 0, untracked: 0, hidden: 0 };
    P.forEach(function (p) { var k = stockStatus(p).key; if (c[k] != null) c[k]++; if (!p.active) c.hidden++; });

    // Duplicate finder — groups products by normalized name (and separately
    // by id) so a bad import or double-add shows up here instead of just
    // inflating the All count.
    (function () {
      var byName = {}, byId = {};
      P.forEach(function (p) {
        var n = String(p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (n) (byName[n] = byName[n] || []).push(p);
        var i = String(p.id || '');
        if (i) (byId[i] = byId[i] || []).push(p);
      });
      var dupNames = Object.keys(byName).filter(function (n) { return byName[n].length > 1; });
      var dupIds = Object.keys(byId).filter(function (i) { return byId[i].length > 1; });
      if (dupNames.length || dupIds.length) {
        h += '<div class="note-banner">' +
          '<b>' + (dupNames.length + dupIds.length) + ' possible duplicate product' + ((dupNames.length + dupIds.length) > 1 ? 's' : '') + ' found.</b><br>' +
          dupNames.map(function (n) {
            var rows = byName[n];
            return esc(rows[0].name) + ' — ' + rows.length + '× (IDs: ' + rows.map(function (p) { return esc(p.id); }).join(', ') + ')';
          }).join('<br>') +
          (dupIds.length ? (dupNames.length ? '<br>' : '') + dupIds.map(function (i) { return 'Duplicate ID ' + esc(i) + ' (' + byId[i].length + ' rows)'; }).join('<br>') : '') +
          '</div>';
      }
    })();

    var tab = S.tab.stock;
    var defs = [['all', 'All', P.length], ['in', 'In stock', c.in], ['low', 'Low', c.low], ['out', 'Out', c.out], ['untracked', 'Not tracked', c.untracked], ['hidden', 'Hidden', c.hidden]];
    h += '<div class="bar"><div class="tabs">' + defs.map(function (d) {
      return '<button class="tab' + (tab === d[0] ? ' active' : '') + '" data-tab="' + d[0] + '">' + d[1] + '<span class="n">' + d[2] + '</span></button>';
    }).join('') + '</div></div>';

    var q = S.q.trim().toLowerCase();
    var list = P.filter(function (p) {
      if (tab === 'hidden') { if (p.active) return false; }
      else if (tab !== 'all' && stockStatus(p).key !== tab) return false;
      return !q || (p.name + ' ' + p.id).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) h += '<div class="empty">No products here.</div>';
    else {
      h += '<div class="shead"><div>Product</div><div>Status</div><div>In stock</div><div>Price</div><div>Update stock</div></div>';
      h += list.map(function (p) {
        var st = stockStatus(p), pid = esc(p.id);
        var thumb = p.image_url
          ? '<img class="ico thumb" src="' + esc(p.image_url) + '" alt="" loading="lazy" data-img-view="' + pid + '" style="cursor:zoom-in" title="Click to view" onerror="this.outerHTML=\'<span class=&quot;ico&quot;>' + esc(p.icon || '📦') + '</span>\'">'
          : '<span class="ico">' + esc(p.icon || '📦') + '</span>';
        return '<div class="srow" data-pid="' + pid + '">' +
          '<div class="s-name">' + thumb + '<span><span class="s-name-text">' + esc(productDisplayName(p.name)) + '</span><small>' + pid + ' · ' + esc(p.pack || '') + ' ' + esc(p.unit || '') + '</small></span></div>' +
          '<div class="s-status"><span class="pill ' + st.cls + '">' + st.label + '</span>' + (p.active ? '' : ' <span class="pill gray">Hidden</span>') + '</div>' +
          '<div class="s-qty">' + (p.stock_qty == null ? '—' : num(p.stock_qty) + ' <small>units</small>') + '</div>' +
          '<div class="s-price">' + (p.price > 0 ? esc(mvr(p.price)) : '<span class="pill gray">No price</span>') + '</div>' +
          '<div class="s-add">' +
            '<input type="number" inputmode="numeric" min="0" step="1" placeholder="' + (p.stock_qty == null ? 'Qty' : p.stock_qty) + '" id="qty-' + pid + '">' +
            '<button class="btn primary sm" data-add="' + pid + '" title="Sets stock to whatever you type here">Update</button>' +
            '<button class="kebab" data-stock-menu="' + pid + '" aria-label="More stock actions">' + ICON.kebab + '</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    var REASON = { restock: 'Added', set: 'Total set', order: 'Sold', cancel: 'Returned (cancel)' };
    h += '<div class="box log"><h3>Recent stock activity</h3>' + (S.log.length ? S.log.map(function (l) {
      var name = (l.products && l.products.name) || l.product_id;
      return '<div class="logrow"><span>' + esc(REASON[l.reason] || l.reason) + ' · ' + esc(name) + (l.order_id ? ' · #' + esc(l.order_id) : '') +
        '</span><span><span class="' + (l.change >= 0 ? 'plus' : 'minus') + '">' + (l.change >= 0 ? '+' : '') + l.change + '</span> → ' + num(l.qty_after) + ' · ' + esc(ago(new Date(l.created_at).getTime())) + '</span></div>';
    }).join('') : '<div class="empty" style="padding:14px">Nothing yet.</div>') + '</div>';

    var EFIELD = { name: 'Name', pack: 'Pack', unit: 'Unit', price: 'Price', icon: 'Icon', active: 'Visibility' };
    h += '<div class="box log"><h3>Recent edits</h3>' + (S.editLog.length ? S.editLog.map(function (l) {
      var name = (l.products && l.products.name) || l.product_id;
      var who = (l.profiles && (l.profiles.name || l.profiles.email)) || 'Staff';
      var fromV = l.field === 'price' ? mvr(l.old_value) : (l.old_value || '—');
      var toV = l.field === 'price' ? mvr(l.new_value) : (l.new_value || '—');
      return '<div class="logrow"><span>' + esc(EFIELD[l.field] || l.field) + ' · ' + esc(name) +
        '</span><span>' + esc(fromV) + ' → ' + esc(toV) + ' · <b>' + esc(who) + '</b> · ' + esc(ago(new Date(l.created_at).getTime())) + '</span></div>';
    }).join('') : '<div class="empty" style="padding:14px">No edits yet.</div>') + '</div>';
    // keep whatever the staff was typing in the Qty boxes while the list refreshes
    var typed = {}, focusId = document.activeElement && document.activeElement.id;
    Array.prototype.forEach.call($('panel').querySelectorAll('.s-add input'), function (i) { if (i.value) typed[i.id] = i.value; });
    $('panel').innerHTML = h;
    Object.keys(typed).forEach(function (id) { var i = $(id); if (i) i.value = typed[id]; });
    if (focusId && focusId.indexOf('qty-') === 0 && $(focusId)) $(focusId).focus();
  }

  /* ---------- accounts (My Accounts approval) ---------- */
  function renderAccounts() {
    var h = '<h1>Accounts</h1><p class="lead">Business, residence and customer accounts from the storefront, all in one place.</p>';
    if (!isSuperAdmin(S.profile)) {
      h += '<div class="note-banner">Only a Super Admin can view and approve customer accounts.</div>';
      $('panel').innerHTML = h; return;
    }
    var group = S.tab.accountsGroup || 'business';
    var groupDefs = [['business', 'Business Account'], ['customer', 'Customer Account'], ['changes', 'Change History'], ['deleted', 'Deleted Accounts']];
    h += '<div class="bar"><div class="tabs">' + groupDefs.map(function (d) {
      return '<button class="tab' + (group === d[0] ? ' active' : '') + '" data-agroup="' + d[0] + '">' + d[1] + '</button>';
    }).join('') + '</div></div>';

    h += group === 'customer' ? renderCustomerAccountsBody() : (group === 'changes' ? renderProfileChangesBody(false) : (group === 'deleted' ? renderProfileChangesBody(true) : renderBusinessAccountsBody()));
    $('panel').innerHTML = h;
  }
  function auditValue(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function auditLabel(k) {
    return String(k).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function auditAccountSnapshot(r) {
    var c = r && r.changes || {};
    var saved = c._account_snapshot && c._account_snapshot.new;
    var d = c.deleted_account && c.deleted_account.new;
    var b = c.deleted_business_account && c.deleted_business_account.new;
    return saved || d || b || {};
  }
  function renderProfileChangesBody(deletedOnly) {
    if (S.profileChangesError) {
      var msg = String(S.profileChangesError.message || '');
      var code = S.profileChangesError.code ? ' [' + S.profileChangesError.code + ']' : '';
      var detail = S.profileChangesError.detail ? String(S.profileChangesError.detail) : '';
      var showDetail = !!S.showChangesErrorDetail;
      return '<div class="note-banner">' +
        '<b>History isn\'t available right now.</b>' +
        '<p style="margin:4px 0 10px">This needs a one-time setup on the database — something a developer sets up once, not something you did wrong. Try again, or ask your developer to check it.</p>' +
        '<button type="button" class="btn ghost sm" data-retry-changes>Try again</button> ' +
        '<button type="button" class="btn ghost sm" data-toggle-error-detail>' + (showDetail ? 'Hide' : 'Show') + ' technical details</button>' +
        (showDetail ? ('<div style="margin-top:10px;font-size:12px;opacity:.8">Supabase says' + esc(code) + ': ' + esc(msg || 'Unknown error') + (detail ? '<br>Details: ' + esc(detail) : '') + '<br><br>For the developer: confirm <code>26_profile_change_audit.sql</code> and then <code>27_deleted_account_history.sql</code> completed successfully in SQL Editor, then press Try again.</div>') : '') +
        '</div>';
    }
    var rows = (S.profileChanges || []).filter(function (r) { return deletedOnly ? r.action === 'deleted' : r.action !== 'deleted'; });
    if (deletedOnly) {
      if (!rows.length) return '<p class="lead" style="margin-top:-4px">Deleted customer and business accounts stay here for Super Admin reference.</p><div class="empty">No deleted accounts recorded yet.</div>';
      return auditSummary(rows, true) + '<p class="lead" style="margin-top:12px">These accounts no longer appear in active Customer or Business Account lists. Their saved details remain available here for Super Admin reference.</p>' + rows.map(renderAuditRow).join('');
    }
    if (!rows.length) return '<p class="lead" style="margin-top:-4px">Customer and business changes will appear here after the audit migration is installed.</p><div class="empty">No profile changes recorded yet.</div>';
    return auditSummary(rows, false) + '<p class="lead" style="margin-top:12px">Every customer or business edit is recorded with the previous value, new value, editor, and exact time.</p>' + rows.map(renderAuditRow).join('');
  }
  function auditSummary(rows, deletedOnly) {
    var nameChanges = rows.filter(function (r) { var c = r.changes || {}; return !!(c.name || c.business_name); }).length;
    var businessChanges = rows.filter(function (r) { return r.entity_type === 'business'; }).length;
    var label = deletedOnly ? 'Deleted accounts' : 'Recorded changes';
    var third = deletedOnly ? 'Permanent' : 'Name changes';
    var thirdValue = deletedOnly ? 'REMOVED' : nameChanges;
    return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 8px"><div class="box" style="padding:12px 14px;min-width:150px;flex:1"><div style="font-size:11px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.04em">' + label + '</div><strong style="display:block;font-size:22px;margin-top:3px">' + rows.length + '</strong></div><div class="box" style="padding:12px 14px;min-width:150px;flex:1"><div style="font-size:11px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.04em">Business records</div><strong style="display:block;font-size:22px;margin-top:3px">' + businessChanges + '</strong></div><div class="box" style="padding:12px 14px;min-width:150px;flex:1"><div style="font-size:11px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.04em">' + third + '</div><strong style="display:block;font-size:17px;margin-top:6px;color:' + (deletedOnly ? 'var(--red)' : 'var(--ink)') + '">' + thirdValue + '</strong></div></div>';
  }
  function renderAuditRow(r) {
      var changes = r.changes || {};
      var snapshot = auditAccountSnapshot(r);
      var accountName = r.customer_name || snapshot.name || snapshot.business_name || r.customer_email || 'Unknown account';
      var accountEmail = r.customer_email || snapshot.email || '';
      var accountMobile = snapshot.mobile || '';
      var accountType = snapshot.account_type || (r.entity_type === 'business' ? 'business' : 'customer');
      var nameChange = changes.name || changes.business_name;
      var nameTrail = nameChange && nameChange.old !== nameChange.new
        ? '<div style="margin-top:4px;color:var(--ink-soft);font-size:12px"><b>Name changed:</b> ' + esc(auditValue(nameChange.old)) + ' → ' + esc(auditValue(nameChange.new)) + '</div>' : '';
      var detailSource = Object.keys(snapshot).filter(function (k) { return !/^id$|^user_id$|^created_at$/.test(k); });
      var fields = detailSource.map(function (k) {
        return '<div style="padding:6px 0;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:12px"><b>' + esc(auditLabel(k)) + '</b><span style="text-align:right;word-break:break-word">' + esc(auditValue(snapshot[k])) + '</span></div>';
      }).join('');
      var changedFields = Object.keys(changes).filter(function (k) { return k !== '_account_snapshot' && k !== 'deleted_account' && k !== 'deleted_business_account'; }).map(function (k) {
        var d = changes[k] || {};
        return '<div style="padding:8px 0;border-top:1px solid var(--line)"><b>' + esc(auditLabel(k)) + '</b><br><span style="color:var(--ink-soft)">Before:</span> ' + esc(auditValue(d.old)) + '<br><span style="color:var(--ink-soft)">After:</span> ' + esc(auditValue(d.new)) + '</div>';
      }).join('');
      var detailHeading = Object.keys(snapshot).length ? '<div style="margin-top:12px;font-size:12px;font-weight:700;color:var(--green-800)">FULL ACCOUNT DETAILS AT TIME OF RECORD</div>' + fields : '';
      var changeHeading = changedFields ? '<div style="margin-top:12px;font-size:12px;font-weight:700;color:var(--green-800)">CHANGED FIELDS</div>' + changedFields : '';
      var title = r.action === 'deleted' ? 'Deleted ' + (r.entity_type === 'business' ? 'business account' : 'customer account') : (r.entity_type === 'business' ? 'Business account change' : 'Customer profile change');
      var deletedBadge = r.action === 'deleted' ? ' <span class="pill red">DELETED</span>' : '';
      var summaryHead = '<div><b>' + esc(title) + '</b>' + deletedBadge + '<div style="margin-top:4px;font-size:13px"><b>Account:</b> ' + esc(accountName) + '</div>' + nameTrail + '<div style="margin-top:3px;color:var(--ink-soft);font-size:12.5px">' + esc(accountEmail || 'Email unavailable') + (accountMobile ? ' · ' + esc(accountMobile) : '') + ' · ' + esc(accountType) + '</div><div style="margin-top:3px;color:var(--ink-soft);font-size:11.5px">Recorded by: ' + esc(r.actor_email || 'Account owner before deletion') + '</div></div>';
      var dateBit = '<span style="color:var(--ink-soft);font-size:12px;white-space:nowrap">' + esc(fmtDate(new Date(r.changed_at).getTime())) + '</span>';
      var body = detailHeading + changeHeading;
      if (!body) {
        return '<div class="box" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">' + summaryHead + dateBit + '</div></div>';
      }
      return '<div class="box audit-row" style="margin-bottom:12px;padding:0"><details><summary style="padding:18px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;list-style:none;cursor:pointer">' + summaryHead + '<div style="display:flex;align-items:center;gap:8px">' + dateBit + '<span class="chev" style="color:var(--ink-soft);width:18px;height:18px">' + ICON.chevron + '</span></div></summary><div style="padding:0 18px 18px">' + body + '</div></details></div>';
  }
  function renderBusinessAccountsBody() {
    if (S.shopsError) {
      var msg = String(S.shopsError.message || '');
      if (/admin_list_shops|does not exist|schema cache|not authorized/i.test(msg)) {
        return '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>11_shops_admin.sql</code>, then press Refresh.</div>';
      }
      return '<div class="note-banner">Could not load accounts: ' + esc(msg) + '</div>';
    }
    var h = '<p class="lead" style="margin-top:-4px">Business and residence accounts that customers add from their profile. Approve a business account so the customer can select it at checkout.</p>';
    var L = S.shops, c = { pending: 0, approved: 0, rejected: 0 };
    L.forEach(function (x) { if (c[x.status] != null) c[x.status]++; });
    var tab = S.tab.accounts;
    var defs = [['pending', 'Pending', c.pending], ['approved', 'Approved', c.approved], ['rejected', 'Rejected', c.rejected], ['all', 'All', L.length]];
    h += '<div class="bar"><div class="tabs">' + defs.map(function (d) {
      return '<button class="tab' + (tab === d[0] ? ' active' : '') + '" data-tab="' + d[0] + '">' + d[1] + '<span class="n">' + d[2] + '</span></button>';
    }).join('') + '</div></div>';

    var q = S.q.trim().toLowerCase();
    var list = L.filter(function (x) {
      if (tab !== 'all' && x.status !== tab) return false;
      return !q || [x.name, x.owner_name, x.owner_mobile, x.owner_email, x.gst_tin, x.city, x.atoll].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { h += '<div class="empty">' + (tab === 'pending' ? 'No accounts waiting for approval.' : 'No accounts here.') + '</div>'; }
    else {
      h += list.map(function (x) {
        var cls = x.status === 'approved' ? '' : (x.status === 'pending' ? 'amber' : 'red');
        var biz = x.account_type === 'business';
        var lines = [
          biz ? ('Business' + (x.business_type ? ' · ' + x.business_type : '')) : 'Residence',
          biz ? (x.gst_exempt ? 'Not GST registered' : (x.gst_tin ? 'GST TIN: ' + x.gst_tin : '')) : '',
          [x.city, x.atoll].filter(Boolean).join(', '),
          'Owner: ' + [x.owner_name, x.owner_mobile, x.owner_email].filter(Boolean).join(' · '),
          'Added ' + ago(new Date(x.created_at).getTime())
        ].filter(Boolean);
        var btns = '';
        if (x.status !== 'approved') btns += '<button class="btn primary sm" data-shop-approve="' + esc(x.id) + '">Approve</button> ';
        if (x.status !== 'rejected') btns += '<button class="btn danger-soft sm" data-shop-reject="' + esc(x.id) + '">Reject</button>';
        return '<div class="box" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">' +
          '<div><b>' + esc(x.name) + '</b> <span class="pill ' + cls + '">' + esc(x.status) + '</span>' +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--ink-soft);line-height:1.6">' + lines.map(esc).join('<br>') + '</div></div>' +
          '<div style="display:flex;gap:8px">' + btns + '</div></div>';
      }).join('');
    }
    return h;
  }
  // Storefront shoppers — every account that signed up on the shop itself
  // (not through the admin Sign Up form). Reference-only, same rows Staff
  // Access used to mix in under a "Store front" tab; that tab is gone now —
  // customer accounts live here instead so they never get mixed up with staff.
  function renderCustomerAccountsBody() {
    if (S.accountsError) {
      var msg = String(S.accountsError.message || '');
      if (/admin_list_accounts|does not exist|schema cache/i.test(msg)) {
        return '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>22_super_admin.sql</code> then <code>23_admin_signup_source.sql</code>, then press Refresh.</div>';
      }
      return '<div class="note-banner">Could not load accounts: ' + esc(msg) + '</div>';
    }
    var h = '<p class="lead" style="margin-top:-4px">Everyone who registered on the customer storefront. A shop account only gets dashboard access if it requested it and a Super Admin approved it (see Staff Access).</p>';
    var q = S.q.trim().toLowerCase();
    var list = (S.accounts || []).filter(function (x) { return x.signup_source !== 'admin'; }).filter(function (x) {
      return !q || [x.name, x.email, x.mobile].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { h += '<div class="empty">No customer accounts match.</div>'; return h; }
    h += list.map(function (x) {
      var lines = [x.email || '', x.mobile || '', 'Added ' + ago(new Date(x.created_at).getTime())].filter(Boolean);
      return '<div class="box" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">' +
        '<div><b>' + esc(x.name || (x.email || '').split('@')[0] || 'Unnamed') + '</b>' +
        '<div style="margin-top:6px;font-size:12.5px;color:var(--ink-soft);line-height:1.6">' + lines.map(esc).join('<br>') + '</div></div>' +
        '<span>' + (x.is_admin ? '<span class="pill staff-pill">Staff</span> ' : (x.staff_requested ? '<span class="pill amber">Staff request pending</span> ' : '')) + '<span class="pill" title="Registered on the customer storefront">Store front account</span></span></div>';
    }).join('');
    return h;
  }
  function setShopStatus(id, status) {
    MaziAPI.adminSetShopStatus(id, status).then(function () {
      toast(status === 'approved' ? 'Account approved' : (status === 'rejected' ? 'Account rejected' : 'Account updated'));
      return loadShops().then(render);
    }).catch(function (e) { toast(e.message || 'Could not update the account.', true); });
  }

  /* ---------- staff access (Super Admin only) ---------- */
  function renderStaffAccess() {
    var h = '<h1>Staff Access</h1><p class="lead">Give or remove dashboard access. Requests come from the Admin Sign Up form, or from shop (customer) accounts that pressed “Request staff access” on the admin login. Nobody gets in until a Super Admin approves. Declining a shop account never deletes it.</p>';
    if (S.accountsError) {
      var msg = String(S.accountsError.message || '');
      if (/admin_list_accounts|does not exist|schema cache/i.test(msg)) {
        h += '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>22_super_admin.sql</code> then <code>23_admin_signup_source.sql</code>, then press Refresh.</div>';
      } else {
        h += '<div class="note-banner">Could not load accounts: ' + esc(msg) + '</div>';
      }
      $('panel').innerHTML = h; return;
    }
    // Staff Access only shows accounts created through the admin signup form.
    // Customer storefront accounts stay under Accounts -> Customer Account.
    var L = (S.accounts || []).filter(function (x) { return x.signup_source === 'admin' || x.staff_requested || x.is_admin; }), c = { staff: 0, available: 0 };
    L.forEach(function (x) { if (x.is_admin) c.staff++; else c.available++; });
    if (c.available) h += '<div class="note-banner"><b>' + c.available + ' staff-access request' + (c.available === 1 ? '' : 's') + ' waiting for approval.</b> Review the account' + (c.available === 1 ? '' : 's') + ' below and grant access when approved.</div>';
    var tab = S.tab.staffaccess;
    var defs = [['all', 'All', L.length], ['staff', 'Staff', c.staff], ['available', 'Requests', c.available]];
    h += '<div class="bar"><div class="tabs">' + defs.map(function (d) {
      return '<button class="tab' + (tab === d[0] ? ' active' : '') + '" data-tab="' + d[0] + '">' + d[1] + '<span class="n">' + d[2] + '</span></button>';
    }).join('') + '</div></div>';

    var q = S.q.trim().toLowerCase();
    var list = L.filter(function (x) {
      if (tab === 'staff' && !x.is_admin) return false;
      if (tab === 'available' && x.is_admin) return false;
      return !q || [x.name, x.staff_name, x.email, x.mobile].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { h += '<div class="empty">No accounts match.</div>'; }
    else {
      h += list.map(function (x) {
        var self = x.id === (S.profile && S.profile.id);
        var lines = [
          x.email || '', accountMobile(x),
          'Added ' + ago(new Date(x.created_at).getTime())
        ].filter(Boolean);
        var btns = '';
        if (x.is_admin || x.is_super_admin) {
          if (!isPrimaryAdminAccount(x)) btns += '<button class="kebab" data-staff-menu="' + esc(x.id) + '" aria-label="Staff actions" title="Staff actions">' + ICON.kebab + '</button>';
        } else if (isShopStaffRequest(x)) btns += '<button class="btn staff-grant sm" data-staff-on="' + esc(x.id) + '">Grant staff access</button> <button class="btn staff-remove sm" data-staff-decline="' + esc(x.id) + '">Decline</button>';
        else btns += '<button class="btn staff-grant sm" data-staff-on="' + esc(x.id) + '">Grant staff access</button> <button class="btn staff-remove sm" data-staff-reject="' + esc(x.id) + '">Remove</button>';
        var kind = isPrimaryAdminAccount(x) ? 'super' : (x.is_admin ? 'staff' : 'req');
        var nmShow = accountDisplayName(x), ini = esc((String(nmShow || '?').trim().charAt(0) || '?').toUpperCase());
        return '<div class="box staff-card sc-' + kind + '" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">' +
          '<i class="sc-av">' + ini + '</i><div style="flex:1;min-width:200px"><b>' + esc(nmShow) + '</b> ' +
          (kind === 'super' ? '<span class="pill role-super">Super Admin</span>' : (kind === 'staff' ? '<span class="pill role-staff">Staff</span>' : '<span class="pill role-req">Request</span>')) +
          (self ? ' <span class="pill role-you">You</span>' : '') +
          (isShopStaffRequest(x) ? ' <span class="pill role-shop" title="Existing shop account that requested staff access">Shop account</span>' : '') +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--ink-soft);line-height:1.6">' + lines.map(esc).join('<br>') + '</div></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btns + '</div></div>';
      }).join('');
    }
    $('panel').innerHTML = h;
  }
  function setStaffAccess(id, on) {
    if (!isSuperAdmin(S.profile)) { toast('Only a Super Admin can do that.', true); return; }
    MaziAPI.adminSetStaffAccess(id, on).then(function () {
      toast(on ? 'Staff access granted' : 'Staff access removed');
      return loadAccounts().then(render);
    }).catch(function (e) { toast(e.message || 'Could not update this account.', true); });
  }
  /* ---------- customers ---------- */
  var CUST_ICON = {
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>'
  };
  function activeCustomers() { return (S.customers || []).filter(function (c) { return !c.deletedAt; }); }
  function deletedCustomers() { return (S.customers || []).filter(function (c) { return !!c.deletedAt; }); }
  function askDeleteCustomer(id) {
    var c = findCustomer(id); if (!c) return;
    showConfirm({
      title: 'Delete ' + c.name + '?',
      message: 'They will move to History, where you can restore them any time. Their sales and payments stay on record.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: function () {
        MaziAPI.adminDeleteCustomer(id).then(function (nc) {
          var i = (S.customers || []).map(function (x) { return x.id; }).indexOf(id);
          if (i >= 0 && nc) S.customers[i] = nc;
          if (POS.customerId === id) { POS.customerId = ''; POS.customerText = ''; }
          if (S.view === 'customers') renderCustomers();
          toastUndo(c.name + ' moved to History', function () { restoreCustomer(id, true); }, 5);
        }).catch(function (e) { toast(String((e && e.message) || 'Could not delete this customer.'), true); });
      }
    });
  }
  function restoreCustomer(id, fromUndo) {
    MaziAPI.adminRestoreCustomer(id).then(function (nc) {
      var i = (S.customers || []).map(function (x) { return x.id; }).indexOf(id);
      if (i >= 0 && nc) S.customers[i] = nc;
      if (S.view === 'customers') renderCustomers();
      toast(fromUndo ? 'Delete undone' : 'Customer restored');
    }).catch(function (e) { toast(String((e && e.message) || 'Could not restore this customer.'), true); });
  }
  function askPurgeCustomer(id) {
    var c = findCustomer(id); if (!c) return;
    showConfirm({
      title: 'Delete ' + c.name + ' permanently?',
      message: 'This removes the customer record for good and cannot be undone. Past sales stay in Order History but will no longer be linked to this customer.',
      confirmLabel: 'Delete permanently',
      danger: true,
      onConfirm: function () {
        MaziAPI.adminPurgeCustomer(id).then(function () {
          S.customers = (S.customers || []).filter(function (x) { return x.id !== id; });
          if (POS.customerId === id) { POS.customerId = ''; POS.customerText = ''; }
          if (S.view === 'customers') renderCustomers();
          toast(c.name + ' deleted permanently');
        }).catch(function (e) {
          var m = String((e && e.message) || '');
          if (/CUSTOMER_HAS_PAYMENTS/i.test(m)) m = 'Cannot delete: this customer has payment records. Keep them in History to preserve the books.';
          else if (/CUSTOMER_NOT_DELETED/i.test(m)) m = 'Move the customer to History first.';
          else if (/admin_purge_customer|schema cache|does not exist/i.test(m)) m = 'One-time setup needed: run 49_customer_purge.sql in Supabase SQL Editor.';
          else if (!m) m = 'Could not delete this customer.';
          toast(m, true);
        });
      }
    });
  }
  function findCustomer(id) { return (S.customers || []).filter(function (c) { return c.id === id; })[0]; }
  function renderCustomers() {
    var h = '<h1>Customers</h1><p class="lead">Customer records with credit limits. Pick a customer in Walk-in / POS and choose <b>Credit</b> to put a sale on their account; collect what they owe from <b>Details</b>.</p>';
    if (S.customersError) {
      var msg = String(S.customersError.message || '');
      if (/admin_list_customers|does not exist|schema cache/i.test(msg)) {
        h += '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>38_customers.sql</code>, then press Refresh.</div>';
      } else {
        h += '<div class="note-banner">Could not load customers: ' + esc(msg) + '</div>';
      }
      $('panel').innerHTML = h; return;
    }
    var tab = S.custTab === 'deleted' ? 'deleted' : 'active';
    var nAct = activeCustomers().length, nDel = deletedCustomers().length;
    h += '<div class="bar cust-bar"><div class="cust-tabs" role="tablist">' +
      '<button type="button" role="tab" class="' + (tab === 'active' ? 'on' : '') + '" data-cust-tab="active">Customers <em>' + nAct + '</em></button>' +
      '<button type="button" role="tab" class="' + (tab === 'deleted' ? 'on' : '') + '" data-cust-tab="deleted">History <em>' + nDel + '</em></button></div>' +
      '<div style="flex:1"></div>' +
      (tab === 'active' ? '<button type="button" class="btn primary sm" data-new-customer>+ New Customer</button>' : '') + '</div>';
    var q = S.q.trim().toLowerCase();
    var list = (tab === 'deleted' ? deletedCustomers() : activeCustomers()).filter(function (c) {
      return !q || (c.name + ' ' + c.mobile).toLowerCase().indexOf(q) >= 0;
    });
    if (tab === 'deleted') {
      list.sort(function (a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); });
      h += '<p class="lead" style="margin:2px 0 12px">Deleted customers are kept here. Their sales and payments stay on record, and you can restore them any time.</p>';
    }
    if (!list.length) {
      h += '<div class="empty">' + (q ? 'No customers match.' : (tab === 'deleted' ? 'No deleted customers.' : 'No customers yet — add one to get started.')) + '</div>';
    } else {
      h += '<div class="cust-table' + (tab === 'deleted' ? ' is-history' : '') + '"><div class="cust-head"><span>Customer</span><span>' + (tab === 'deleted' ? 'Deleted' : 'Mobile') + '</span><span>Outstanding</span><span>Total Spent</span><span></span></div>';
      h += list.map(function (c) {
        var nm = String(c.name || '?').trim();
        var ini = esc((nm.charAt(0) || '?').toUpperCase());
        var second = tab === 'deleted'
          ? '<span class="cust-mob" data-l="Deleted">' + esc(fmtDate(c.deletedAt)) + '</span>'
          : '<span class="cust-mob" data-l="Mobile">' + esc(c.mobile || '—') + '</span>';
        var acts = tab === 'deleted'
          ? '<button type="button" class="btn ghost sm cust-restore" data-restore-customer="' + esc(c.id) + '">' + CUST_ICON.restore + 'Restore</button>' +
            '<button type="button" class="btn ghost sm cust-del cust-purge" data-purge-customer="' + esc(c.id) + '" title="Delete permanently" aria-label="Delete ' + esc(nm) + ' permanently">' + CUST_ICON.trash + '</button>'
          : '<button type="button" class="btn ghost sm" data-edit-customer="' + esc(c.id) + '">Details</button>' +
            '<button type="button" class="btn ghost sm cust-del" data-delete-customer="' + esc(c.id) + '" title="Delete customer" aria-label="Delete ' + esc(nm) + '">' + CUST_ICON.trash + '</button>';
        return '<div class="cust-row" role="button" tabindex="0" data-edit-customer="' + esc(c.id) + '">' +
          '<span class="cust-name"><i class="cust-av">' + ini + '</i><b>' + esc(nm) + '</b></span>' + second +
          '<span class="cust-num' + (c.outstanding > 0 ? ' owe' : '') + '" data-l="Outstanding">' + mvr(c.outstanding) + '</span>' +
          '<span class="cust-num" data-l="Total spent">' + mvr(c.totalSpent) + '</span>' +
          '<span class="cust-act">' + acts + '</span></div>';
      }).join('') + '</div>';
    }
    $('panel').innerHTML = h;
  }
  function custFormHtml(c) {
    c = c || {};
    return '<div class="field"><label>Name</label><input class="inp" id="custName" value="' + esc(c.name || '') + '" maxlength="120"></div>' +
      '<div class="field"><label>Mobile</label><input class="inp" id="custMobile" value="' + esc(c.mobile || '') + '" maxlength="20"></div>' +
      '<div class="field"><label>Email</label><input class="inp" id="custEmail" value="' + esc(c.email || '') + '" maxlength="120"></div>' +
      '<div class="field"><label>Address</label><input class="inp" id="custAddress" value="' + esc(c.address || '') + '" maxlength="200"></div>' +
      '<label style="display:flex;align-items:center;gap:8px;margin:2px 0 14px;font-weight:600;font-size:12.5px;cursor:pointer"><input type="checkbox" id="custGst"' + (c.taxNumber ? ' checked' : '') + ' onchange="document.getElementById(\'custTaxField\').style.display=this.checked?\'\':\'none\'"> GST registered (company / business)</label>' +
      '<div class="field" id="custTaxField"' + (c.taxNumber ? '' : ' style="display:none"') + '><label>GST TIN Number</label><input class="inp" id="custTax" value="' + esc(c.taxNumber || '') + '" maxlength="40" placeholder="e.g. 1234567GST501" autocomplete="off"></div>' +
      '<div class="field"><label>Credit Limit (MVR)</label><input class="inp" id="custCredit" type="number" min="0" step="0.01" value="' + esc(c.creditLimit || 0) + '"></div>' +
      '<div class="field"><label>Price Level</label><input class="inp" id="custPriceLevel" value="' + esc(c.priceLevel || '') + '" maxlength="60" placeholder="Optional reference label"></div>' +
      '<div class="field"><label>Note</label><input class="inp" id="custNote" value="' + esc(c.note || '') + '" maxlength="300"></div>' +
      (c.id ? '<div style="display:flex;gap:22px;margin:14px 0;padding-top:14px;border-top:1px dashed var(--line);font-size:12.5px;color:var(--ink-soft)"><span>Outstanding: <b style="color:var(--ink)">' + mvr(c.outstanding) + '</b></span><span>Total spent: <b style="color:var(--ink)">' + mvr(c.totalSpent) + '</b></span></div>' : '') +
      '<div class="acts modal-footer"><button type="button" class="btn ghost" ' + ((c.id && S.custDetail) ? 'data-cust-back>Back' : 'data-close-customer>Cancel') + '</button><button type="button" class="btn primary" data-save-customer="' + (c.id ? esc(c.id) : '__new__') + '">' + (c.id ? 'Save changes' : 'Add customer') + '</button></div>';
  }
  function openNewCustomer() {
    S.editingCustomerId = null; S.custDetail = null; S.custMode = 'edit';
    $('custTitle').textContent = 'New customer';
    $('custBody').innerHTML = custFormHtml();
    custBox(false);
    $('custModal').classList.remove('hidden');
    setTimeout(function () { var i = $('custName'); if (i) i.focus(); }, 50);
  }
  function custBox(wide) { var b = $('custModal').querySelector('.box'); if (b) b.classList.toggle('wide', !!wide); }

  // "Details" = the customer page: balances, credit, every sale, payments received.
  function openEditCustomer(id) {
    var c = findCustomer(id); if (!c) return;
    S.editingCustomerId = id; S.custDetail = null; S.custMode = 'detail';
    $('custTitle').textContent = c.name;
    $('custBody').innerHTML = '<p style="color:var(--ink-soft)">Loading…</p>';
    custBox(true);
    $('custModal').classList.remove('hidden');
    reloadCustDetail(id).catch(function (e) {
      // 43_customer_credit.sql not installed yet -> fall back to the plain edit form
      var msg = String((e && e.message) || '');
      if (/admin_customer_detail|does not exist|schema cache/i.test(msg)) {
        S.custDetail = null; S.custMode = 'edit'; custBox(false);
        $('custBody').innerHTML = '<div class="note-banner"><b>One-time setup needed.</b> Run <code>43_customer_credit.sql</code> in Supabase → SQL Editor to see sales history, credit and payments.</div>' + custFormHtml(c);
      } else { toast(msg || 'Could not load this customer.', true); closeCustomerModal(); }
    });
  }
  function reloadCustDetail(id) {
    return MaziAPI.adminCustomerDetail(id).then(function (d) {
      if (S.editingCustomerId !== id) return;
      S.custDetail = d;
      var i = (S.customers || []).map(function (x) { return x.id; }).indexOf(id);
      if (i >= 0) S.customers[i] = d.customer;
      renderCustDetail();
    });
  }
  function payBadge(o) {
    if (o.status === 'cancelled') return '<span class="pill gray">Cancelled</span>';
    if (o.paymentMethod !== 'credit') return '<span class="pill">Paid</span>';
    if (o.paid >= o.total - 0.005) return '<span class="pill">Paid</span>';
    if (o.paid > 0) return '<span class="pill amber">Part paid · ' + esc(mvr(o.total - o.paid)) + ' due</span>';
    return '<span class="pill red">Unpaid</span>';
  }
  var PM_LABEL = { cash: 'Cash', card: 'Card', transfer: 'Transfer', credit: 'Credit' };
  var PAY_ICON = {
    cash: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.2"/><path d="M6 12h.01M18 12h.01"/></svg>',
    card: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
    transfer: '<svg viewBox="0 0 24 24"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>',
    credit: '<svg viewBox="0 0 24 24"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>'
  };
  function renderCustDetail() {
    var d = S.custDetail; if (!d) return;
    var c = d.customer;
    var avail = c.creditLimit > 0 ? Math.max(0, c.creditLimit - c.outstanding) : 0;
    $('custTitle').textContent = c.name;
    var h = '<div class="cust-sub">' + esc(c.mobile || 'No mobile') + (c.email ? ' · ' + esc(c.email) : '') + (c.address ? ' · ' + esc(c.address) : '') + '</div>' +
      '<div class="cust-stats">' +
        '<div class="stat"><small>Outstanding</small><b style="' + (c.outstanding > 0 ? 'color:var(--red)' : '') + '">' + esc(mvr(c.outstanding)) + '</b></div>' +
        '<div class="stat"><small>Total spent</small><b>' + esc(mvr(c.totalSpent)) + '</b></div>' +
        '<div class="stat"><small>Credit limit</small><b>' + (c.creditLimit > 0 ? esc(mvr(c.creditLimit)) : 'None') + '</b></div>' +
        '<div class="stat"><small>Available credit</small><b>' + (c.creditLimit > 0 ? esc(mvr(avail)) : '—') + '</b></div>' +
      '</div>';
    h += '<div class="acts" style="margin:14px 0 6px">' +
      (c.outstanding > 0 ? '<button type="button" class="btn primary sm" data-cust-pay>Receive payment</button>' : '') +
      '<button type="button" class="btn ghost sm" data-cust-edit>Edit details</button>' +
      '<button type="button" class="btn ghost sm" data-close-customer>Close</button></div>';
    if (S.custMode === 'pay' && c.outstanding > 0) {
      h += '<div class="cust-pay"><h4>Receive payment</h4>' +
        '<div class="cust-pay-grid">' +
          '<div class="field"><label>Amount (MVR)</label><input class="inp" id="custPayAmt" type="number" inputmode="decimal" min="0" step="0.01" max="' + c.outstanding + '" value="' + c.outstanding + '"></div>' +
          '<div class="field"><label>Method</label><select class="inp" id="custPayMethod"><option value="cash">Cash</option><option value="transfer">Transfer</option><option value="card">Card</option></select></div>' +
        '</div>' +
        '<div class="field"><label>Note (optional)</label><input class="inp" id="custPayNote" maxlength="200" placeholder="e.g. Slip ref / receipt no."></div>' +
        '<div class="err" id="custPayErr"></div>' +
        '<div class="acts"><button type="button" class="btn primary sm" data-cust-pay-confirm>Confirm payment</button><button type="button" class="btn ghost sm" data-cust-back>Cancel</button></div></div>';
    }
    h += '<h4 class="cust-h">Sales (' + d.orders.length + ')</h4>';
    if (!d.orders.length) h += '<div class="empty">No sales linked to this customer yet.</div>';
    else h += '<div class="cust-list">' + d.orders.map(function (o) {
      return '<div class="cust-li"><span><b>#' + esc(o.id) + '</b><small>' + esc(fmtDate(o.placedAt)) + ' · ' + esc(PM_LABEL[o.paymentMethod] || o.paymentMethod) + '</small></span>' +
        '<span class="r">' + esc(mvr(o.total)) + '</span><span class="r">' + payBadge(o) + '</span></div>';
    }).join('') + '</div>';
    h += '<h4 class="cust-h">Payments received (' + d.payments.length + ')</h4>';
    if (!d.payments.length) h += '<div class="empty">No payments received yet.</div>';
    else h += '<div class="cust-list">' + d.payments.map(function (p) {
      return '<div class="cust-li"><span><b>' + esc(mvr(p.amount)) + '</b><small>' + esc(fmtDate(p.createdAt)) + ' · ' + esc(PM_LABEL[p.method] || p.method) + (p.receivedBy ? ' · ' + esc(p.receivedBy) : '') + '</small></span>' +
        '<span class="r" style="flex:2;color:var(--ink-soft);font-size:12px">' + esc(p.note || '') + '</span>' +
        '<span class="r" style="flex:0 0 auto"><button type="button" class="btn sm" data-cust-receipt="' + esc(p.id) + '">Receipt</button></span></div>';
    }).join('') + '</div>';
    $('custBody').innerHTML = h;
  }
  function custShowPay() { S.custMode = 'pay'; renderCustDetail(); setTimeout(function () { var i = $('custPayAmt'); if (i) { i.focus(); i.select(); } }, 30); }
  function custShowEdit() {
    if (!S.custDetail) return;
    S.custMode = 'edit'; custBox(false);
    $('custBody').innerHTML = custFormHtml(S.custDetail.customer);
  }
  function custBack() { S.custMode = 'detail'; custBox(true); renderCustDetail(); }
  function custConfirmPay() {
    var d = S.custDetail; if (!d) return;
    var amt = Number($('custPayAmt').value || 0), err = $('custPayErr');
    if (!(amt > 0)) { err.textContent = 'Enter an amount greater than 0.'; return; }
    if (amt > d.customer.outstanding + 0.005) { err.textContent = 'That is more than the customer owes (' + mvr(d.customer.outstanding) + ').'; return; }
    var btn = document.querySelector('[data-cust-pay-confirm]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    var id = d.customer.id;
    MaziAPI.adminReceiveCustomerPayment(id, amt, $('custPayMethod').value, $('custPayNote').value.trim()).then(function (nd) {
      S.custDetail = nd; S.custMode = 'detail';
      var i = (S.customers || []).map(function (x) { return x.id; }).indexOf(id);
      if (i >= 0) S.customers[i] = nd.customer;
      toast('Payment of ' + mvr(amt) + ' received');
      renderCustDetail(); render();
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm payment'; }
      err.textContent = (e && e.message) || 'Could not save this payment.';
    });
  }
  function closeCustomerModal() { S.editingCustomerId = null; S.custDetail = null; S.custMode = 'detail'; $('custModal').classList.add('hidden'); }
  function saveCustomer(id) {
    var name = $('custName').value.trim();
    if (!name) { toast('Enter a customer name.', true); $('custName').focus(); return; }
    // GST: only kept when "GST registered" is ticked; a changed TIN must look like 1234567GST501
    var gstOn = $('custGst') && $('custGst').checked;
    var tin = gstOn ? $('custTax').value.trim().toUpperCase() : '';
    if (gstOn) {
      var prev = (findCustomer(id) || {}).taxNumber || '';
      if (!tin) { toast('Enter the GST TIN number, or untick "GST registered".', true); $('custTax').focus(); return; }
      if (tin !== prev && !/^\d{7}GST\d{3}$/.test(tin)) { toast('GST TIN format should look like 1234567GST501.', true); $('custTax').focus(); return; }
    }
    var opts = {
      name: name, mobile: $('custMobile').value.trim(), email: $('custEmail').value.trim(),
      address: $('custAddress').value.trim(), taxNumber: tin,
      creditLimit: Number($('custCredit').value || 0), priceLevel: $('custPriceLevel').value.trim(),
      note: $('custNote').value.trim()
    };
    var call = id === '__new__' ? MaziAPI.adminCreateCustomer(opts) : MaziAPI.adminUpdateCustomer(id, opts);
    call.then(function () {
      toast(id === '__new__' ? 'Customer added' : 'Customer updated');
      if (id !== '__new__' && S.custDetail) {
        return loadCustomers().then(function () { render(); return reloadCustDetail(id).then(custBack); });
      }
      closeCustomerModal();
      return loadCustomers().then(render);
    }).catch(function (e) {
      var msg = String((e && e.message) || '');
      if (/admin_create_customer|admin_update_customer|does not exist|schema cache/i.test(msg)) {
        toast('One-time setup needed — open Supabase → SQL Editor and run supabase/38_customers.sql, then try again.', true);
      } else {
        toast(msg || 'Could not save this customer.', true);
      }
    });
  }

  function deleteSignupRequest(id) {
    if (!isSuperAdmin(S.profile)) { toast('Only a Super Admin can do that.', true); return; }
    MaziAPI.adminDeleteSignupRequest(id).then(function () {
      toast('Sign-up request removed');
      return loadAccounts().then(render);
    }).catch(function (e) { toast(e.message || 'Could not remove this request.', true); });
  }
  function declineStaffRequest(id) {
    if (!isSuperAdmin(S.profile)) { toast('Only a Super Admin can do that.', true); return; }
    MaziAPI.adminDeclineStaffRequest(id).then(function () {
      toast('Request declined. The shop account is untouched.');
      return loadAccounts().then(render);
    }).catch(function (e) { toast(e.message || 'Could not decline this request.', true); });
  }
  function setSuperAdmin(id, on) {
    if (!isSuperAdmin(S.profile)) { toast('Only a Super Admin can do that.', true); return; }
    MaziAPI.adminSetSuperAdmin(id, on).then(function () {
      toast(on ? 'Now a Super Admin' : 'Super Admin removed');
      return loadAccounts().then(render);
    }).catch(function (e) { toast(e.message || 'Could not update this account.', true); });
  }

  /* ---------- staff display name (dashboard-only, not the shop profile name) ---------- */
  function openStaffNameModal() {
    var primary = isPrimarySuperAdmin(S.profile);
    $('staffNameInput').value = (S.profile && S.profile.staff_name) || (primary ? PRIMARY_SUPER_ADMIN_NAME : '');
    $('staffNameInput').readOnly = false;
    $('staffNameModal').classList.remove('hidden');
    setTimeout(function () { $('staffNameInput').focus(); }, 50);
  }
  function closeStaffNameModal() { $('staffNameModal').classList.add('hidden'); }
  function saveStaffName() {
    var v = $('staffNameInput').value.trim();
    if (v === PRIMARY_SUPER_ADMIN_NAME && isPrimarySuperAdmin(S.profile)) v = '';   // same as the default -> clear the custom name
    MaziAPI.updateStaffName(v).then(function (p) {
      S.profile = p;
      $('meName').textContent = displayName(p); $('meAv').textContent = initials(displayName(p));
      closeStaffNameModal(); toast('Dashboard name updated'); render();
    }).catch(function (e) { toast(e.message || 'Could not save.', true); });
  }

  function adjustStock(pid, mode) {
    var input = $('qty-' + pid); if (!input) return;
    var v = input.value.trim();
    if (v === '' || !/^\d+$/.test(v)) { toast('Enter a whole number, e.g. 24.', true); input.focus(); return; }
    var n = parseInt(v, 10), p = findProduct(pid);
    if (n <= 0 && (mode === 'add' || mode === 'subtract')) { toast('Enter a quantity above 0.', true); return; }
    var opts = mode === 'set' ? { set: n } : { add: mode === 'subtract' ? -n : n };
    function run() {
      MaziAPI.adminAdjustStock(pid, opts).then(function (r) {
        toast((p ? productDisplayName(p.name).slice(0, 40) : pid) + ' → ' + num(r.stock_qty) + ' in stock');
        return loadStock().then(render);
      }).catch(function (e) {
        if (/adjust_stock|stock_qty/i.test(String(e.message))) { S.productsError = e; render(); }
        else toast(e.message || 'Could not update stock.', true);
      });
    }
    run();
  }

  /* ============ Walk-in / POS (needs supabase/36_walkin_pos.sql) ============ */
  var POS = { cart: {}, mode: 'order', name: '', mobile: '', note: '', q: '', quotations: [], busy: false, customerId: '', customerText: '', payment: 'cash', disc: {} };

  function posReset() { POS.cart = {}; POS.mode = 'order'; POS.name = ''; POS.mobile = ''; POS.note = ''; POS.q = ''; POS.busy = false; POS.customerId = ''; POS.customerText = ''; POS.payment = 'cash'; POS.disc = {}; }

  /* ---- POS: customer + payment method (Ewity-style) ---- */
  function custLabel(c) { return c.name + (c.mobile ? ' · ' + c.mobile : ''); }
  function posCustomer() { return POS.customerId ? findCustomer(POS.customerId) : null; }
  function posCustomerHtml() {
    var c = posCustomer();
    var opts = activeCustomers().map(function (x) { return '<option value="' + esc(custLabel(x)) + '"></option>'; }).join('');
    var h = '<div class="field" style="margin-bottom:8px"><label>Customer (optional — search saved customers)</label>' +
      '<input class="inp" id="posCustomer" list="posCustList" autocomplete="off" value="' + esc(POS.customerText) + '" placeholder="Type a name or mobile, or leave blank for walk-in">' +
      '<datalist id="posCustList">' + opts + '</datalist></div>';
    if (c) {
      var avail = c.creditLimit > 0 ? Math.max(0, c.creditLimit - c.outstanding) : 0;
      h += '<div class="pos-cust-card"><b>' + esc(c.name) + '</b><span>' + esc(c.mobile || '') + '</span>' +
        '<div class="pos-cust-nums"><span>Owes <b style="' + (c.outstanding > 0 ? 'color:var(--red)' : '') + '">' + esc(mvr(c.outstanding)) + '</b></span>' +
        '<span>Limit <b>' + (c.creditLimit > 0 ? esc(mvr(c.creditLimit)) : 'none') + '</b></span>' +
        '<span>Available <b>' + (c.creditLimit > 0 ? esc(mvr(avail)) : '—') + '</b></span></div></div>';
    } else {
      h += '<div class="field" style="margin-bottom:8px"><label>Customer name (optional)</label><input class="inp" id="posName" value="' + esc(POS.name) + '" placeholder="Walk-in customer"></div>' +
           '<div class="field" style="margin-bottom:8px"><label>Mobile (optional)</label><input class="inp" id="posMobile" value="' + esc(POS.mobile) + '"></div>';
    }
    return h;
  }
  function posPayHtml() {
    if (POS.mode !== 'order') return '';
    var c = posCustomer();
    var h = '<div class="pos-mode pos-pay"><label class="pos-pay-lbl">Payment</label>';
    ['cash', 'card', 'transfer', 'credit'].forEach(function (m) {
      var dis = m === 'credit' && !c;
      h += '<button type="button" class="' + (POS.payment === m ? 'active' : '') + '" data-pos-pay="' + m + '"' + (dis ? ' disabled title="Choose a customer first"' : '') + '>' + PAY_ICON[m] + '<span>' + PM_LABEL[m] + '</span></button>';
    });
    h += '</div>';
    if (POS.payment === 'credit' && c) {
      var total = posCartTotal(), avail = c.creditLimit > 0 ? Math.max(0, c.creditLimit - c.outstanding) : 0;
      if (c.creditLimit <= 0) h += '<div class="err" style="display:block">This customer has no credit limit. Set one under Customers → Details → Edit details.</div>';
      else if (total > avail + 0.005) h += '<div class="err" style="display:block">Over the credit limit — this sale is ' + esc(mvr(total)) + ' but only ' + esc(mvr(avail)) + ' is available.</div>';
      else h += '<div class="pos-credit-note">Goes on ' + esc(c.name) + '\'s account — they owe ' + esc(mvr(c.outstanding + total)) + ' after this sale.</div>';
    }
    return h;
  }
  function posPickCustomer(text) {
    POS.customerText = text;
    var t = String(text || '').trim().toLowerCase();
    var m = t ? activeCustomers().filter(function (x) { return custLabel(x).toLowerCase() === t; })[0] : null;
    var newId = m ? m.id : '';
    if (newId === POS.customerId) return;
    POS.customerId = newId;
    if (!newId && POS.payment === 'credit') POS.payment = 'cash';
    renderPos();
    var el = $('posCustomer'); if (el) { el.focus(); var v = el.value; el.value = ''; el.value = v; }
  }

  function loadPosQuotations() {
    MaziAPI.adminListQuotations().then(function (rows) {
      POS.quotations = (rows || []).filter(function (q) { return q.status === 'open'; }).slice(0, 20);
      if (S.view === 'pos') renderPos();
    }).catch(function () { POS.quotations = []; if (S.view === 'pos') renderPos(); });
  }

  // Item discount (offers / sales): POS.disc[id] = { type:'amount'|'percent', value:n }.
  // 'amount' = MVR off the WHOLE line, 'percent' = % off the line. Never more than the line itself.
  function posLineDisc(id) {
    var d = POS.disc[id], p = findProduct(id);
    if (!d || !p || !(Number(d.value) > 0)) return 0;
    var gross = Number(p.price || 0) * (POS.cart[id] || 0);
    var amt = d.type === 'percent' ? gross * Math.min(Number(d.value), 100) / 100
            : d.type === 'usd' ? Number(d.value) * MVR_PER_USD : Number(d.value);   // USD is converted to MVR
    return Math.round(Math.min(amt, gross) * 100 + 1e-7) / 100;
  }
  function posDiscDefaultType() { return getDocCur() === 'USD' ? 'usd' : 'amount'; }
  // POS shows prices in the chosen currency (MVR or USD). Everything stored / sent to the server stays MVR.
  function posMoney(mvrAmt) { return getDocCur() === 'USD' ? 'USD ' + numFmt((Number(mvrAmt) || 0) / MVR_PER_USD) : mvr(mvrAmt); }
  function posTotalInner(total) { return esc(posMoney(total)); }
  function posCurBtnsHtml() {
    var cur = getDocCur();
    return '<span class="cur-seg" role="group" aria-label="Currency" data-cur="' + cur + '">' +
      '<button type="button" class="' + (cur === 'MVR' ? 'active' : '') + '" data-pos-cur="MVR" aria-pressed="' + (cur === 'MVR') + '"><span class="cur-badge"><img class="pos-cur-ico" src="img/mvr-icon-black.png" alt=""></span><span class="cur-code">MVR</span></button>' +
      '<button type="button" class="' + (cur === 'USD' ? 'active' : '') + '" data-pos-cur="USD" aria-pressed="' + (cur === 'USD') + '"><span class="cur-badge"><span class="pos-cur-ico pos-cur-usd">$</span></span><span class="cur-code">USD</span></button>' +
    '</span>';
  }
  function posLineTotalInner(id) {
    var p = findProduct(id), qty = POS.cart[id] || 0, gross = (p ? Number(p.price || 0) : 0) * qty, disc = posLineDisc(id);
    return (disc > 0 ? '<s style="display:block;font-weight:400;color:var(--ink-soft);font-size:11px">' + esc(posMoney(gross)) + '</s>' : '') + esc(posMoney(gross - disc));
  }
  // Update the discount numbers in place (no full re-render) so typing / the dropdown never loses focus.
  function posRefreshLine(id) {
    var row = document.querySelector('[data-pos-row="' + String(id).replace(/"/g, '\\"') + '"]');
    if (!row) { renderPos(); return; }
    var lt = row.querySelector('.pos-line-total'); if (lt) lt.innerHTML = posLineTotalInner(id);
    var em = row.querySelector('.pos-disc-amt'); var d = posLineDisc(id);
    if (em) em.textContent = d > 0 ? '− ' + posMoney(d) : '';
    var tb = document.querySelector('.pos-total b'); if (tb) tb.innerHTML = posTotalInner(posCartTotal());
    if (POS.payment === 'credit') renderPos();   // credit-limit notice depends on the total
  }
  function posCartTotal() {
    return Object.keys(POS.cart).reduce(function (sum, id) {
      var p = findProduct(id); if (!p) return sum;
      return sum + Number(p.price || 0) * POS.cart[id] - posLineDisc(id);
    }, 0);
  }

  function posProductResultsHtml() {
    var q = POS.q.trim().toLowerCase();
    var list = (S.products || []).filter(function (p) { return p.active !== false; });
    if (q) {
      list = list.filter(function (p) {
        return (p.name || '').toLowerCase().indexOf(q) >= 0 || (p.id || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    list = list.slice(0, 60);
    if (!list.length) return '<div class="pos-list-empty">No products found.</div>';
    return list.map(function (p, i) {
      var sk = stockStatus(p);
      var disabled = sk.key === 'out';
      var pid = esc(p.id);
      var thumb = p.image_url
        ? '<img class="ico thumb" src="' + esc(p.image_url) + '" alt="" loading="lazy" data-img-view="' + pid + '" title="Click to view" onerror="this.outerHTML=\'<span class=&quot;ico&quot;>' + esc(p.icon || '📦') + '</span>\'">'
        : '<span class="ico">' + esc(p.icon || '📦') + '</span>';
      return '<div class="pos-row rise-item" style="animation-delay:' + (Math.min(i, 12) * 0.02) + 's">' +
        thumb +
        '<div style="flex:1;min-width:0">' +
          '<div class="pos-row-name">' + esc(productDisplayName(p.name)) + '</div>' +
          '<div class="pos-row-meta">' + pid + (p.pack ? ' · ' + esc(p.pack) : '') + ' · ' + esc(posMoney(p.price)) + ' · ' + esc(sk.label || sk.key) + '</div>' +
        '</div>' +
        '<button type="button" class="btn ' + (disabled ? 'ghost' : 'primary') + ' sm pos-add-btn" data-pos-add="' + pid + '"' + (disabled ? ' disabled' : '') + '>Add</button>' +
      '</div>';
    }).join('');
  }

  function posCartHtml() {
    var ids = Object.keys(POS.cart);
    if (!ids.length) return '<div class="pos-cart-empty">Cart is empty — add products from the left.</div>';
    return ids.map(function (id) {
      var p = findProduct(id);
      var name = p ? productDisplayName(p.name) : id;
      var price = p ? Number(p.price || 0) : 0;
      var qty = POS.cart[id];
      var dsc = POS.disc[id] || {}, disc = posLineDisc(id), dtype = dsc.type || posDiscDefaultType();
      var discHtml = '<div class="pos-disc"><span>Disc</span>' +
        '<input class="inp" inputmode="decimal" placeholder="0" data-pos-disc="' + esc(id) + '" value="' + (Number(dsc.value) > 0 ? esc(String(dsc.value)) : '') + '">' +
        '<select class="inp" data-pos-disc-type="' + esc(id) + '"><option value="amount"' + (dtype !== 'usd' ? ' selected' : '') + '>MVR</option><option value="usd"' + (dtype === 'usd' ? ' selected' : '') + '>USD</option></select>' +
        '<em class="pos-disc-amt">' + (disc > 0 ? '− ' + esc(posMoney(disc)) : '') + '</em></div>';
      return '<div class="pos-cart-row" data-pos-row="' + esc(id) + '">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="pos-row-name">' + esc(name) + '</div>' +
          '<div class="pos-row-meta">' + esc(posMoney(price)) + ' each</div>' +
        '</div>' +
        '<button type="button" class="btn ghost sm" style="width:26px;height:26px;padding:0" data-pos-dec="' + esc(id) + '">−</button>' +
        '<input class="inp" style="width:48px;text-align:center;padding:4px" data-pos-qty="' + esc(id) + '" value="' + qty + '">' +
        '<button type="button" class="btn ghost sm" style="width:26px;height:26px;padding:0" data-pos-inc="' + esc(id) + '">+</button>' +
        '<div class="pos-line-total" style="width:84px;text-align:right;font-weight:500;font-size:12.5px">' + posLineTotalInner(id) + '</div>' +
        '<button type="button" class="btn danger sm" style="width:26px;height:26px;padding:0" data-pos-remove="' + esc(id) + '">' + ICON.trash + '</button>' + discHtml +
      '</div>';
    }).join('');
  }

  function posQuotationsHtml() {
    if (!POS.quotations.length) return '<div class="pos-cart-empty">No open quotations.</div>';
    return POS.quotations.map(function (q) {
      return '<div class="pos-quote-row">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="pos-quote-name">' + esc(q.id) + ' · ' + esc(q.customer.name || 'Walk-in customer') + '</div>' +
          '<div class="pos-row-meta">' + esc(mvr(q.total)) + ' · ' + q.items.length + ' item(s) · ' + esc(fmtDate(q.createdAt)) + '</div>' +
        '</div>' +
        '<button type="button" class="btn neutral sm" data-pos-view-quote="' + esc(q.id) + '">View</button>' +
        '<button type="button" class="btn neutral sm" data-pos-print-quote="' + esc(q.id) + '">Print</button>' +
        '<button type="button" class="btn neutral sm" data-pos-download-quote="' + esc(q.id) + '">Download</button>' +
        '<button type="button" class="btn primary sm" data-pos-convert="' + esc(q.id) + '">Confirm sale</button>' +
        '<button type="button" class="btn danger sm" data-pos-void="' + esc(q.id) + '">Void</button>' +
      '</div>';
    }).join('');
  }

  var lastPosTotal = null;
  // resetList = true only when the product list itself changed (new search) — then start from the top.
  function renderPos(resetList) {
    // remember where everything was scrolled, so Add / + / - / remove don't jump back to the top
    var panelEl = $('panel');
    var hadPos = !!(panelEl && panelEl.querySelector('.pos-wrap'));
    var keep = null;
    if (hadPos) {
      var pl = panelEl.querySelector('.pos-list'), pc = panelEl.querySelector('.pos-cart');
      keep = { list: pl ? pl.scrollTop : 0, cart: pc ? pc.scrollTop : 0, anc: [] };
      for (var a = panelEl; a; a = a.parentElement) { if (a.scrollTop > 0) keep.anc.push([a, a.scrollTop]); }
      keep.win = window.pageYOffset || 0;
    }
    var total = posCartTotal();
    var bump = lastPosTotal !== null && total !== lastPosTotal;
    lastPosTotal = total;
    var h = '<h1>Walk-in / POS</h1><p class="lead">Ring up an in-person sale, or make a quotation first and confirm it later.</p>' +
      '<div class="pos-wrap">' +
        '<div class="pos-col">' +
          '<div class="pos-search-row"><div class="field" style="margin-bottom:0;flex:1;min-width:0"><input class="inp" id="posSearch" placeholder="Search product name or code…" value="' + esc(POS.q) + '"></div>' +
            '<div class="pos-mode pos-pay pos-cur-switch" title="Show prices in">' + posCurBtnsHtml() + '</div></div>' +
          '<div class="pos-list">' + posProductResultsHtml() + '</div>' +
        '</div>' +
        '<div class="pos-col">' +
          '<div class="pos-mode">' +
            '<button type="button" class="' + (POS.mode === 'order' ? 'active' : '') + '" data-pos-mode="order">Order</button>' +
            '<button type="button" class="' + (POS.mode === 'quotation' ? 'active' : '') + '" data-pos-mode="quotation">Quotation only</button>' +
          '</div>' +
          '<div class="pos-cart">' + posCartHtml() + '</div>' +
          '<div class="pos-total' + (bump ? ' bump' : '') + '"><span>Total (GST incl.)</span><b>' + posTotalInner(total) + '</b></div>' +
          posCustomerHtml() + posPayHtml() +
          '<div class="field" style="margin-bottom:0"><label>Note (optional)</label><input class="inp" id="posNote" value="' + esc(POS.note) + '"></div>' +
          '<div class="err" id="posErr"></div>' +
          '<button type="button" class="btn primary pos-submit" style="width:100%" id="posSubmitBtn" data-pos-submit>' +
            (POS.mode === 'quotation' ? 'Create quotation' : 'Complete sale &amp; print slip') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="box" style="margin-top:18px"><h3>Open quotations</h3>' + posQuotationsHtml() + '</div>';
    $('panel').innerHTML = h;
    if (keep) {
      var pl2 = panelEl.querySelector('.pos-list'), pc2 = panelEl.querySelector('.pos-cart');
      if (pl2) {
        // a re-render is not a new list: don't replay the fade-in on every row
        if (!resetList) {
          var rows = pl2.querySelectorAll('.rise-item');
          for (var r = 0; r < rows.length; r++) rows[r].classList.remove('rise-item');
        }
        pl2.scrollTop = resetList ? 0 : keep.list;
      }
      if (pc2) pc2.scrollTop = keep.cart;
      keep.anc.forEach(function (x) { x[0].scrollTop = x[1]; });
      if (keep.win) window.scrollTo(0, keep.win);
    }
  }

  function posSubmit() {
    if (POS.busy) return;
    if (!Object.keys(POS.cart).length) { var e0 = $('posErr'); if (e0) e0.textContent = 'Add at least one product to the cart.'; return; }
    var opts = {
      cart: POS.cart,
      name: $('posName') ? $('posName').value.trim() : POS.name,
      mobile: $('posMobile') ? $('posMobile').value.trim() : POS.mobile,
      note: $('posNote') ? $('posNote').value.trim() : POS.note,
      customerId: POS.customerId || '',
      paymentMethod: POS.mode === 'order' ? POS.payment : 'cash',
      disc: Object.keys(POS.cart).reduce(function (m, id) {
        var d = POS.disc[id]; if (d && posLineDisc(id) > 0) m[id] = { type: 'amount', value: posLineDisc(id) }; return m;   // server always gets MVR
      }, {})
    };
    var isQuote = POS.mode === 'quotation';
    if (isQuote) { posRun(opts, true); return; }
    var pc = posCustomer();
    if (opts.paymentMethod === 'credit') {
      var availCr = pc && pc.creditLimit > 0 ? Math.max(0, pc.creditLimit - pc.outstanding) : 0;
      var er = $('posErr');
      if (!pc) { if (er) er.textContent = 'Choose a customer for a credit sale.'; return; }
      if (pc.creditLimit <= 0) { if (er) er.textContent = 'This customer has no credit limit.'; return; }
      if (posCartTotal() > availCr + 0.005) { if (er) er.textContent = 'Over the credit limit (available ' + mvr(availCr) + ').'; return; }
    }
    // a real sale takes stock off and counts as revenue straight away, so ask first
    var lines = Object.keys(POS.cart).length;
    showConfirm({
      title: 'Confirm this sale?',
      message: lines + ' item' + (lines > 1 ? 's' : '') + ' · Total ' + mvr(posCartTotal()) + ' · ' + (opts.paymentMethod === 'credit' ? 'ON CREDIT (customer pays later)' : PM_LABEL[opts.paymentMethod] + ' payment') + '. This takes the items off stock and records the sale as completed.',
      confirmLabel: 'Confirm sale',
      onConfirm: function () { posRun(opts, false); }
    });
  }
  function posRun(opts, isQuote) {
    if (POS.busy) return;
    var btn = $('posSubmitBtn');
    POS.busy = true; if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }
    var call = isQuote ? MaziAPI.adminCreateQuotation(opts) : MaziAPI.adminCreateWalkinOrder(opts);
    call.then(function (result) {
      POS.busy = false;
      toast(isQuote ? 'Quotation ' + result.id + ' created' : 'Sale ' + result.id + ' completed');
      if (isQuote) { openPrintable(buildQuotationDocHtml(result)); }
      else { if (S.profile) result.createdBy = S.profile.id; /* so the fresh receipt says who served */ openPrintable(buildWalkinSlipHtml(result)); loadStock().then(render); loadOrders(true).then(render); loadCustomers(); }
      posReset();
      renderPos();
      loadPosQuotations();
    }).catch(function (e) {
      POS.busy = false;
      renderPos();
      var err = $('posErr'); if (err) err.textContent = e.message || 'Could not complete this.';
    });
  }

  function posConvertQuotation(id) {
    withQuotation(id, function (q) {
      var cust = q.customerId ? findCustomer(q.customerId) : null;
      function go(pm) {
        MaziAPI.adminConvertQuotation(id, pm).then(function (order) {
          toast('Converted to sale ' + order.id);
          openPrintable(buildWalkinSlipHtml(order));
          loadStock().then(render); loadOrders(true).then(render); loadCustomers();
          loadPosQuotations();
        }).catch(function (e) { toast(e.message || 'Could not confirm this sale.', true); });
      }
      showConfirm({
        title: 'Confirm this sale?',
        message: 'This takes the items off stock and creates a walk-in order from quotation ' + id + '.' + (cust ? ' Customer: ' + cust.name + '.' : ''),
        confirmLabel: cust ? 'Paid now (cash)' : 'Confirm sale',
        altLabel: cust ? 'Put on credit' : '',
        onConfirm: function () { go('cash'); },
        onAlt: function () { go('credit'); }
      });
    });
  }
  function posVoidQuotation(id) {
    showConfirm({
      title: 'Void this quotation?',
      message: 'Quotation ' + id + ' will be marked void. This cannot be undone.',
      confirmLabel: 'Void it',
      danger: true,
      onConfirm: function () {
        MaziAPI.adminVoidQuotation(id).then(function () {
          toast('Quotation voided'); loadPosQuotations();
        }).catch(function (e) { toast(e.message || 'Could not void this.', true); });
      }
    });
  }
  function withQuotation(id, cb) {
    var q = POS.quotations.filter(function (x) { return x.id === id; })[0];
    if (q) { cb(q); return; }
    MaziAPI.adminListQuotations().then(function (rows) {
      var found = (rows || []).filter(function (x) { return x.id === id; })[0];
      if (found) cb(found); else toast('Quotation not found.', true);
    }).catch(function (e) { toast(e.message || 'Could not load quotation.', true); });
  }
  // View = the same quotation document as Print/Download, shown inside the admin (no print dialog)
  function posViewExistingQuotation(id) {
    withQuotation(id, function (q) {
      var html = buildQuotationDocHtml(q).replace(/<script>window\.onload[\s\S]*?<\/script>/, '');
      var old = document.getElementById('posQuoteView'); if (old) old.remove();
      var m = document.createElement('div');
      m.className = 'modal'; m.id = 'posQuoteView'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.innerHTML = '<div class="box" style="max-width:720px">' +
        '<h3>' + esc(q.id) + ' \u00B7 ' + esc((q.customer && q.customer.name) || 'Walk-in customer') + '</h3>' +
        '<iframe id="posQuoteFrame" title="Quotation" style="width:100%;height:68vh;border:1px solid var(--line);background:#fff"></iframe>' +
        '<div class="acts modal-footer"><button type="button" class="btn ghost" data-qv-close>Close</button>' +
        '<button type="button" class="btn neutral" data-qv-print>Print</button>' +
        '<button type="button" class="btn neutral" data-qv-download>Download</button></div></div>';
      document.body.appendChild(m);
      m.querySelector('#posQuoteFrame').srcdoc = html;
      function close() { m.remove(); document.removeEventListener('keydown', onKey); }
      function onKey(ev) { if (ev.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      m.addEventListener('click', function (ev) {
        if (ev.target === m || ev.target.closest('[data-qv-close]')) { close(); return; }
        if (ev.target.closest('[data-qv-print]')) { openPrintable(buildQuotationDocHtml(q)); return; }
        if (ev.target.closest('[data-qv-download]')) { downloadQuotationPdf(q); return; }
      });
    });
  }
  function posPrintExistingQuotation(id) {
    withQuotation(id, function (q) { openPrintable(buildQuotationDocHtml(q)); });
  }
  function posDownloadExistingQuotation(id) {
    withQuotation(id, function (q) { downloadQuotationPdf(q); });
  }

  /* ---- A5 documents (portrait): quotation / tax invoice / receipt ----
     One layout for all three, styled like the MAZI printed quotation: logo + business details top-left,
     document title and numbers top-right, thick rule, Bill To, dotted item table, totals, notes,
     terms and two signature lines.
     Stored prices are GST-INCLUDED (see 01_schema.sql), so on paper: Unit Price = price without GST,
     Total = price x qty (GST incl.), and Subtotal + Tax (+ Delivery) = Total.
     Every amount carries the currency sign: the Rufiyaa icon for MVR, "$" for USD. */
  function posStoreInfo() {
    // Business details printed on every document — edited in Settings (stored in app_config).
    return {
      name: CFG.store_name, addr: CFG.store_addr,
      phone: CFG.store_phone, email: CFG.store_email, gstTin: CFG.store_gst_tin,
      logo: 'img/icon-192.png', mvrIcon: 'img/mvr-icon-black.png'
    };
  }
  function openPrintable(html) {
    // Prints via a hidden iframe in the current tab — no extra browser tab,
    // no pop-up blocker to worry about. The iframe's own onload script
    // triggers window.print(); we just clean it up afterwards.
    var ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(ifr);
    var cleaned = false;
    var cleanup = function () {
      if (cleaned) return; cleaned = true;
      setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 300);
    };
    try { if (ifr.contentWindow) ifr.contentWindow.addEventListener('afterprint', cleanup); } catch (e) {}
    var doc = ifr.contentDocument || (ifr.contentWindow && ifr.contentWindow.document);
    if (!doc) { cleanup(); toast('Could not open the print preview.', true); return; }
    doc.open(); doc.write(html); doc.close();
    setTimeout(cleanup, 20000); // fallback in case afterprint never fires
  }

  var DOC_GST_RATE = 0.08;
  var DOC_KINDS = {
    quotation: { name: 'Quotation',   title: 'QUOTATION',   numLabel: 'Quote #:',   sig2: 'Customer Acceptance' },
    invoice:   { name: 'Tax Invoice', title: 'TAX INVOICE', numLabel: 'Invoice #:', sig2: 'Received By' },
    receipt:   { name: 'Receipt',     title: 'RECEIPT',     numLabel: 'Receipt #:', sig2: 'Received By' }
  };
  // Currency the staff prints POS documents in (online orders always print in the customer's own currency).
  function getDocCur() { try { return localStorage.getItem('mazi_doc_currency') === 'USD' ? 'USD' : 'MVR'; } catch (e) { return 'MVR'; } }
  function setDocCur(c) { try { localStorage.setItem('mazi_doc_currency', c === 'USD' ? 'USD' : 'MVR'); } catch (e) {} }
  function r2(n) { return Math.round((Number(n) || 0) * 100 + 1e-7) / 100; }
  function toCur(amountMvr, cur) { var n = Number(amountMvr) || 0; return r2(cur === 'USD' ? n / MVR_PER_USD : n); }
  function numFmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function docDate(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear(); }
  function capFirst(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  function docItemLines(items, cur) {
    return (items || []).map(function (it, i) {
      var inc = Number(it.price) || 0, qty = Number(it.qty) || 0;      // inc = GST-included unit price in MVR, as stored
      var name = productDisplayName(it.name);
      var pack = it.pack ? String(it.pack) : '';
      if (pack && name.toLowerCase().replace(/[^a-z0-9]/g, '').indexOf(pack.toLowerCase().replace(/[^a-z0-9]/g, '')) >= 0) pack = '';   // name already says it
      var disc = Number(it.discount) || 0;                              // MVR, GST-included, for the whole line
      return { n: i + 1, name: name, sku: it.id || '', pack: pack, qty: qty, unit: String(it.unit || 'pcs').toLowerCase(),
        unitNet: toCur(inc / (1 + DOC_GST_RATE), cur), disc: toCur(disc, cur), line: toCur(inc * qty - disc, cur) };
    });
  }
  function docTotals(totalMvr, gstMvr, feeMvr, cur) {
    var total = toCur(totalMvr, cur), tax = toCur(gstMvr, cur), fee = toCur(feeMvr || 0, cur);
    return { net: r2(total - tax - fee), tax: tax, fee: fee, total: total };
  }
  function quotationModel(q) {
    var cur = getDocCur();
    return { kind: 'quotation', number: q.id, dateTs: q.createdAt, validTs: q.createdAt + 30 * 86400000,
      status: capFirst(q.status || 'open'), payment: '', customer: q.customer || {}, items: docItemLines(q.items, cur),
      totals: docTotals(q.total, q.gst, 0, cur), note: q.note || '', cur: cur };
  }
  // Walk-in sale paid at the counter -> Receipt. On credit, or an online order -> Tax Invoice.
  function saleModel(o) {
    var walk = o.orderType === 'walkin', credit = o.paymentMethod === 'credit';
    var cur = walk ? getDocCur() : (o.currency === 'USD' ? 'USD' : 'MVR');
    var fee = walk ? 0 : (Number(o.deliveryFee) || 0);
    var status = o.status === 'cancelled' ? 'Void' : (walk ? (credit ? 'Unpaid (on credit)' : 'Paid') : (LABEL[o.status] || capFirst(o.status)));
    return { kind: (walk && !credit) ? 'receipt' : 'invoice', number: o.id, dateTs: o.placedAt, status: status, servedBy: walk ? creatorName(o) : '',
      payment: walk ? (PM_LABEL[o.paymentMethod] || 'Cash') : 'Bank transfer', customer: o.customer || {},
      items: docItemLines(o.items, cur), totals: docTotals(o.total, o.gst, fee, cur), note: '', cur: cur };
  }
  function printLabel(o) { return (o.orderType === 'walkin' && o.paymentMethod !== 'credit') ? 'Print receipt' : 'Print invoice'; }
  // Receipt for money a customer paid off their credit account (no tax line: GST was on the original invoices).
  function paymentReceiptModel(p, customer) {
    var cur = getDocCur(), amt = toCur(p.amount, cur);
    return { kind: 'receipt', noTax: true, number: 'RC' + new Date(p.createdAt).getFullYear() + String(p.id).padStart(4, '0'),
      dateTs: p.createdAt, status: 'Paid', payment: PM_LABEL[p.method] || capFirst(p.method), customer: customer || {},
      items: [{ n: 1, name: 'Payment received on account', sku: '', pack: '', qty: 1, unit: '', unitNet: amt, disc: 0, line: amt }],
      totals: { net: amt, tax: 0, fee: 0, total: amt }, note: p.note || '', cur: cur };
  }
  function docTerms(m, st) {
    if (m.kind === 'quotation') return ['This quotation is valid for 30 days from the date of issue.', 'Prices and product availability are subject to change without prior notice.'];
    if (m.noTax) return ['Thank you for your payment.'];
    return ['Please check and accept the goods. If the goods are not in good condition, do not accept them and call us on ' + st.phone + '.',
      'Thank you for shopping with ' + st.name + '.'];
  }
  function docTotalRows(m) {
    var t = m.totals, rows = [];
    if (!m.noTax) {
      rows.push(['Subtotal', t.net]);
      rows.push(['Tax (GST ' + Math.round(DOC_GST_RATE * 100) + '%)', t.tax]);
      if (t.fee > 0) rows.push(['Delivery Fee', t.fee]);
    }
    rows.push([m.noTax ? 'Amount Received' : 'Total', t.total, true]);
    return rows;
  }
  function docMetaRows(m) {
    var K = DOC_KINDS[m.kind], rows = [[K.numLabel, m.number], ['Date:', docDate(m.dateTs)]];
    if (m.kind === 'quotation') rows.push(['Valid Until:', docDate(m.validTs)]);
    if (m.payment) rows.push(['Payment:', m.payment]);
    if (m.servedBy) rows.push(['Served by:', m.servedBy]);
    rows.push(['Status:', m.status]);
    return rows;
  }

  function docMoneyHtml(n, cur, iconUrl) {
    if (cur === 'USD') return '$' + numFmt(n);
    return '<img class="mv" src="' + esc(iconUrl) + '" alt="MVR" onerror="this.replaceWith(document.createTextNode(\'MVR \'))">' + numFmt(n);
  }
  function docHtml(m) {
    var st = posStoreInfo(), K = DOC_KINDS[m.kind], base = location.origin + '/';
    function money(n) { return docMoneyHtml(n, m.cur, base + st.mvrIcon); }
    var c = m.customer || {};
    var rows = m.items.map(function (it) {
      var sub = [it.sku ? 'SKU: ' + it.sku : '', it.pack].filter(Boolean).join(' \u00B7 ');
      return '<tr><td class="c">' + it.n + '</td><td>' + esc(it.name) + (sub ? '<div class="sku">' + esc(sub) + '</div>' : '') + '</td>' +
        '<td class="r">' + esc(it.qty + (it.unit ? ' ' + it.unit : '')) + '</td><td class="r">' + money(it.unitNet) + '</td>' +
        '<td class="r">' + numFmt(it.disc || 0) + '</td><td class="r">' + money(it.line) + '</td></tr>';
    }).join('');
    var meta = docMetaRows(m).map(function (r) { return '<div>' + esc(r[0]) + ' ' + esc(r[1]) + '</div>'; }).join('');
    var totals = docTotalRows(m).map(function (r) {
      return '<tr class="' + (r[2] ? 'grand' : '') + '"><td>' + esc(r[0]) + '</td><td class="r">' + money(r[1]) + '</td></tr>';
    }).join('');
    var terms = docTerms(m, st).map(function (t) { return '<div>' + esc(t) + '</div>'; }).join('');
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + esc(K.name + ' ' + m.number) + '</title><style>' +
      '@page{ size:A5 portrait; margin:7mm 8mm; } *{box-sizing:border-box;}' +
      'html,body{margin:0;padding:0;}' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:8.5px;line-height:1.35;font-weight:400;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '@media screen{ body{padding:8mm;} }' +
      'table{border-collapse:collapse;}' +
      '.top{width:100%;} .top td{vertical-align:top;padding:0;}' +
      '.logo{width:13mm;height:13mm;object-fit:contain;display:block;}' +
      '.bn{font-size:12px;font-weight:700;margin-bottom:1px;} .bi{font-size:8px;line-height:1.38;}' +
      '.dm{text-align:right;font-size:8.5px;font-weight:400;line-height:1.5;} .dt{font-size:16px;font-weight:700;letter-spacing:.02em;margin-bottom:3px;line-height:1.1;}' +
      '.rule{border-top:1px solid #111;margin:6px 0 7px;}' +
      '.lbl{font-size:8px;} .cn{font-weight:600;font-size:10px;}' +
      '.items{width:100%;margin-top:7px;}' +
      '.items thead{display:table-header-group;} .items tr{page-break-inside:avoid;}' +
      '.items th,.items td{border:.5px solid #111;padding:3px 5px;vertical-align:top;}' +
      '.items th{font-weight:600;text-align:left;font-size:8.5px;} .items td{font-weight:400;}' +
      '.items .r{text-align:right;white-space:nowrap;} .items .c{text-align:center;width:22px;}' +
      '.sku{font-size:7.5px;font-weight:400;color:#444;margin-top:1px;}' +
      '.mv{height:.82em;width:auto;vertical-align:-.04em;margin-right:1px;}' +
      '.end{page-break-inside:avoid;break-inside:avoid;}' +
      '.tot{margin:6px 0 0 auto;min-width:62mm;} .tot td{padding:2px 0 2px 14px;font-size:9px;font-weight:400;white-space:nowrap;} .tot .r{text-align:right;}' +
      '.tot .grand td{font-size:11px;font-weight:700;padding-top:3px;}' +
      '.note{margin-top:6px;font-weight:400;font-size:8.5px;}' +
      '.terms{margin-top:8px;border-top:1px solid #111;padding-top:4px;font-size:8px;} .terms b{display:block;font-size:8.5px;font-weight:600;margin-bottom:2px;}' +
      '.sigs{width:100%;margin-top:13mm;} .sigs td{width:46%;border-top:.5px solid #111;text-align:center;padding-top:3px;font-weight:400;font-size:8.5px;} .sigs td.gap{width:8%;border-top:0;}' +
      '</style></head><body>' +
      '<table class="top"><tr><td style="width:18mm"><img class="logo" src="' + esc(base + st.logo) + '" alt="" onerror="this.style.display=\'none\'"></td>' +
        '<td><div class="bn">' + esc(st.name) + '</div><div class="bi">' + esc(st.addr) + '<br>Tel: ' + esc(st.phone) + '<br>Email: ' + esc(st.email) + '<br><b>GST TIN: ' + esc(st.gstTin) + '</b></div></td>' +
        '<td class="dm" style="width:50mm"><div class="dt">' + esc(K.title) + '</div>' + meta + '</td></tr></table>' +
      '<div class="rule"></div>' +
      '<div class="lbl">Bill To</div><div class="cn">' + esc(c.name || 'Walk-In Customer') + '</div>' + (c.mobile ? '<div class="lbl">' + esc(c.mobile) + '</div>' : '') +
      '<table class="items"><thead><tr><th class="c">#</th><th>Item Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Disc</th><th class="r">Total</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="end"><table class="tot">' + totals + '</table>' +
        (m.note ? '<div class="note">Notes: ' + esc(m.note) + '</div>' : '') +
        '<div class="terms"><b>TERMS &amp; CONDITIONS</b>' + terms + '</div>' +
        '<table class="sigs"><tr><td>Authorized Signature</td><td class="gap"></td><td>' + esc(K.sig2) + '</td></tr></table></div>' +
      '<script>window.onload=function(){ setTimeout(function(){ window.print(); }, 250); };<\/script>' +
      '</body></html>';
  }
  function buildQuotationDocHtml(q) { return docHtml(quotationModel(q)); }
  function buildWalkinSlipHtml(order) { return docHtml(saleModel(order)); }   // receipt, tax invoice (credit / online)

  /* ---- PDF download (vector text via jsPDF; logo + Rufiyaa icon embedded when they load) ---- */
  var DOC_ASSETS = null;
  function loadImgData(path) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        try {
          var cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          cv.getContext('2d').drawImage(im, 0, 0);
          resolve({ data: cv.toDataURL('image/png'), w: im.naturalWidth, h: im.naturalHeight });
        } catch (e) { resolve(null); }
      };
      im.onerror = function () { resolve(null); };
      im.src = path;
    });
  }
  function loadDocAssets() {
    if (DOC_ASSETS && (DOC_ASSETS.logo || DOC_ASSETS.mvr)) return Promise.resolve(DOC_ASSETS);
    var st = posStoreInfo();
    return Promise.all([loadImgData(st.logo), loadImgData(st.mvrIcon)]).then(function (r) { DOC_ASSETS = { logo: r[0], mvr: r[1] }; return DOC_ASSETS; });
  }
  function docPdf(m, assets) {
    var JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) { toast('PDF library did not load. Refresh the page and try again.', true); return null; }
    var st = posStoreInfo(), K = DOC_KINDS[m.kind], c = m.customer || {};
    var doc = new JsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
    var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();   // 148 x 210
    var X0 = 8, X1 = PW - 8, BOTTOM = PH - 8, y = 8;
    var COLS = [
      { x: X0, w: 7, a: 'c', t: '#' }, { x: X0 + 7, w: 44, a: 'l', t: 'Item Description' }, { x: X0 + 51, w: 18, a: 'r', t: 'Qty' },
      { x: X0 + 69, w: 24, a: 'r', t: 'Unit Price' }, { x: X0 + 93, w: 11, a: 'r', t: 'Disc' }, { x: X0 + 104, w: 28, a: 'r', t: 'Total' }
    ];
    function font(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(0, 0, 0); }
    function money(n, xr, yb, size, bold) {
      var txt = numFmt(n);
      font(bold ? 'bold' : 'normal', size);
      if (m.cur === 'USD') { doc.text('$' + txt, xr, yb, { align: 'right' }); return; }
      if (assets && assets.mvr) {
        doc.text(txt, xr, yb, { align: 'right' });
        var w = doc.getTextWidth(txt), ih = size * 0.3528 * 0.78, iw = ih * (assets.mvr.w / assets.mvr.h);
        doc.addImage(assets.mvr.data, 'PNG', xr - w - iw - 0.6, yb - ih + 0.2, iw, ih);
      } else { doc.text('MVR ' + txt, xr, yb, { align: 'right' }); }
    }
    function cellText(col, txt, yb) {
      var tx = col.a === 'r' ? col.x + col.w - 1.6 : (col.a === 'c' ? col.x + col.w / 2 : col.x + 1.6);
      doc.text(txt, tx, yb, { align: col.a === 'r' ? 'right' : (col.a === 'c' ? 'center' : 'left') });
    }
    function dotted(on) { if (doc.setLineDashPattern) doc.setLineDashPattern([], 0); }
    function tableHead() {
      var h = 6.2;
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.15); dotted(true);
      COLS.forEach(function (col) { doc.rect(col.x, y, col.w, h); });
      font('bold', 7.5);
      COLS.forEach(function (col) { cellText(col, col.t, y + 4.2); });
      dotted(false);
      y += h;
    }

    // ---- header (page 1) ----
    var tx = X0;
    if (assets && assets.logo) {
      var sc = Math.min(15 / assets.logo.w, 15 / assets.logo.h);
      doc.addImage(assets.logo.data, 'PNG', X0, y, assets.logo.w * sc, assets.logo.h * sc);
      tx = X0 + 18;
    }
    font('bold', 11); doc.text(st.name, tx, y + 4);
    font('normal', 7);
    var ay = y + 8.2;
    doc.splitTextToSize(st.addr, 58).forEach(function (ln) { doc.text(ln, tx, ay); ay += 3.4; });
    doc.text('Tel: ' + st.phone, tx, ay); ay += 3.4;
    doc.text('Email: ' + st.email, tx, ay); ay += 3.4;
    font('normal', 7); doc.text('GST TIN: ' + st.gstTin, tx, ay);
    font('bold', 14); doc.text(K.title, X1, y + 5, { align: 'right' });
    font('normal', 7.5);
    var my = y + 10.5;
    docMetaRows(m).forEach(function (r) { doc.text(r[0] + ' ' + r[1], X1, my, { align: 'right' }); my += 4.2; });
    var ruleY = Math.max(ay, my) + 2.4;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(X0, ruleY, X1, ruleY);
    y = ruleY + 4.6;
    font('normal', 7.5); doc.text('Bill To', X0, y); y += 4.6;
    font('bold', 9); doc.text(c.name || 'Walk-In Customer', X0, y);
    if (c.mobile) { font('normal', 8); y += 4; doc.text(String(c.mobile), X0, y); }
    y += 4.2;

    // ---- item table (header repeats on every page) ----
    tableHead();
    m.items.forEach(function (it) {
      font('normal', 8);
      var nameLines = doc.splitTextToSize(it.name, COLS[1].w - 3.2);
      var sub = [it.sku ? 'SKU: ' + it.sku : '', it.pack].filter(Boolean).join(' \u00B7 ');
      var rh = 4.1 + (nameLines.length - 1) * 3.7 + (sub ? 3.4 : 0) + 1.8;
      if (y + rh > BOTTOM) { doc.addPage(); y = 8; tableHead(); }
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.15); dotted(true);
      COLS.forEach(function (col) { doc.rect(col.x, y, col.w, rh); });
      dotted(false);
      font('normal', 8);
      cellText(COLS[0], String(it.n), y + 4.1);
      nameLines.forEach(function (ln, i) { doc.text(ln, COLS[1].x + 1.6, y + 4.1 + i * 3.7); });
      if (sub) { font('normal', 6.5); doc.text(sub, COLS[1].x + 1.6, y + 4.1 + (nameLines.length - 1) * 3.7 + 3.3); }
      font('normal', 8);
      cellText(COLS[2], it.qty + (it.unit ? ' ' + it.unit : ''), y + 4.1);
      money(it.unitNet, COLS[3].x + COLS[3].w - 1.6, y + 4.1, 8, false);
      cellText(COLS[4], numFmt(it.disc || 0), y + 4.1);
      money(it.line, COLS[5].x + COLS[5].w - 1.6, y + 4.1, 8, false);
      y += rh;
    });

    // ---- totals, notes, terms, signatures (kept together) ----
    var tRows = docTotalRows(m);
    font('bold', 8);
    var noteLines = m.note ? doc.splitTextToSize('Notes: ' + m.note, X1 - X0) : [];
    font('normal', 8);
    var termLines = [];
    docTerms(m, st).forEach(function (t) { termLines = termLines.concat(doc.splitTextToSize(t, X1 - X0)); });
    var footH = 3 + tRows.length * 5.6 + (noteLines.length ? noteLines.length * 3.6 + 3 : 0) + 6.5 + termLines.length * 3.5 + 18;
    if (y + footH > BOTTOM) {
      doc.addPage(); y = 8;
      font('bold', 8); doc.text(K.title + ' ' + m.number + ' (continued)', X0, y + 3); y += 8;
    }
    y += 3;
    var tw = 62, tx0 = X1 - tw;
    tRows.forEach(function (r) {
      var big = !!r[2];
      font(big ? 'bold' : 'normal', big ? 9.5 : 8); doc.text(r[0], tx0, y + 3.8);
      money(r[1], X1, y + 3.8, big ? 9.5 : 8, big);
      y += 5.6;
    });
    if (noteLines.length) {
      y += 3; font('normal', 7.5);
      noteLines.forEach(function (ln) { doc.text(ln, X0, y); y += 3.6; });
    }
    y += 3;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(X0, y, X1, y);
    y += 4;
    font('bold', 8); doc.text('TERMS & CONDITIONS', X0, y); y += 3.8;
    font('normal', 7.5);
    termLines.forEach(function (ln) { doc.text(ln, X0, y); y += 3.5; });
    y += 11;
    doc.setLineWidth(0.2);
    var sw = (X1 - X0) * 0.46;
    doc.line(X0, y, X0 + sw, y); doc.line(X1 - sw, y, X1, y);
    font('normal', 8);
    doc.text('Authorized Signature', X0 + sw / 2, y + 4, { align: 'center' });
    doc.text(K.sig2, X1 - sw / 2, y + 4, { align: 'center' });
    return doc;
  }
  function downloadDocPdf(m, filename) {
    loadDocAssets().then(function (a) {
      var doc = docPdf(m, a);
      if (doc) doc.save(filename);
    });
  }
  function downloadQuotationPdf(q) { downloadDocPdf(quotationModel(q), 'Quotation-' + q.id + '.pdf'); }

  function onPosClick(e) {
    var t = e.target.closest('[data-pos-add],[data-pos-inc],[data-pos-dec],[data-pos-remove],[data-pos-mode],[data-pos-cur],[data-pos-pay],[data-pos-submit],[data-pos-convert],[data-pos-void],[data-pos-print-quote],[data-pos-download-quote],[data-pos-view-quote]');
    if (!t) return;
    var d = t.dataset;
    if (d.posAdd) { POS.cart[d.posAdd] = (POS.cart[d.posAdd] || 0) + 1; renderPos(); return; }
    if (d.posInc) { POS.cart[d.posInc] = (POS.cart[d.posInc] || 0) + 1; renderPos(); return; }
    if (d.posDec) {
      var n = (POS.cart[d.posDec] || 0) - 1;
      if (n <= 0) { delete POS.cart[d.posDec]; delete POS.disc[d.posDec]; } else POS.cart[d.posDec] = n;
      renderPos(); return;
    }
    if (d.posRemove) { delete POS.cart[d.posRemove]; delete POS.disc[d.posRemove]; renderPos(); return; }
    if (d.posMode) { POS.mode = d.posMode; renderPos(); return; }
    if (d.posCur) { setDocCur(d.posCur); renderPos(); return; }
    if (d.posPay) { if (!t.disabled) { POS.payment = d.posPay; renderPos(); } return; }
    if (d.posSubmit !== undefined) { posSubmit(); return; }
    if (d.posConvert) { posConvertQuotation(d.posConvert); return; }
    if (d.posVoid) { posVoidQuotation(d.posVoid); return; }
    if (d.posViewQuote) { posViewExistingQuotation(d.posViewQuote); return; }
    if (d.posPrintQuote) { posPrintExistingQuotation(d.posPrintQuote); return; }
    if (d.posDownloadQuote) { posDownloadExistingQuotation(d.posDownloadQuote); return; }
  }
  function onPosInput(e) {
    var t0 = e.target;
    if (t0 && t0.dataset && t0.dataset.posDisc !== undefined) {
      var did0 = t0.dataset.posDisc, cur0 = POS.disc[did0] || { type: posDiscDefaultType(), value: 0 };
      var dv0 = parseFloat(String(t0.value).replace(/,/g, ''));
      cur0.value = (isFinite(dv0) && dv0 > 0) ? dv0 : 0;
      POS.disc[did0] = cur0;
      posRefreshLine(did0);
      return;
    }
    var t = e.target; if (!t || !t.id) return;
    if (t.id === 'posSearch') {
      POS.q = t.value; renderPos(true);
      var el = $('posSearch');
      if (el) { el.focus(); var v = el.value; el.value = ''; el.value = v; }
      return;
    }
    if (t.id === 'posCustomer') { posPickCustomer(t.value); return; }
    if (t.id === 'posName') { POS.name = t.value; return; }
    if (t.id === 'posMobile') { POS.mobile = t.value; return; }
    if (t.id === 'posNote') { POS.note = t.value; return; }
  }
  function onPosChange(e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.posQty) {
      var id = t.dataset.posQty, v = parseInt(t.value, 10);
      if (!isFinite(v) || v <= 0) { delete POS.cart[id]; delete POS.disc[id]; } else POS.cart[id] = Math.min(v, 99999);
      renderPos();
    }
    if (t && t.dataset && t.dataset.posDiscType !== undefined) {
      var did = t.dataset.posDiscType, cur = POS.disc[did] || { type: posDiscDefaultType(), value: 0 };
      cur.type = t.value === 'usd' ? 'usd' : 'amount';
      POS.disc[did] = cur;
      posRefreshLine(did);
    }
    if (t && t.dataset && t.dataset.posDisc !== undefined) {   // tidy the typed number (2 decimals) when leaving the box
      var d2 = POS.disc[t.dataset.posDisc];
      if (d2 && d2.value > 0) { d2.value = Math.round(d2.value * 100) / 100; t.value = String(d2.value); }
    }
  }

  /* ============ edit product (name/pack/unit/price/icon/visibility) ============ */
  function editFormHtml(p) {
    return '<div class="field"><label>Name</label><input class="inp" id="editName" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label>Pack</label><input class="inp" id="editPack" value="' + esc(p.pack || '') + '"></div>' +
      '<div class="field"><label>Unit</label><input class="inp" id="editUnit" value="' + esc(p.unit || '') + '"></div>' +
      '<div class="field"><label>Price (MVR)</label><input class="inp" id="editPrice" type="number" inputmode="decimal" min="0" step="0.01" value="' + (p.price || 0) + '"></div>' +
      '<div class="field"><label>Icon (emoji)</label><input class="inp" id="editIcon" value="' + esc(p.icon || '') + '"></div>' +
      '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-weight:600;font-size:12.5px"><input type="checkbox" id="editActive"' + (p.active ? ' checked' : '') + '> Visible to customers</label>' +
      '<div class="err" id="editErr"></div>' +
      '<div class="acts modal-footer"><button type="button" class="btn ghost" data-close-edit>Cancel</button><button type="button" class="btn primary" id="editSaveBtn" data-save-product="' + esc(p.id) + '">Save changes</button></div>';
  }
  function imageUploadFieldHtml(url) {
    var has = !!url;
    return '<div class="field"><label>Product photo</label>' +
      '<div class="photo-uploader">' +
        '<div class="photo-preview">' +
          '<img id="editImgPreview" style="' + (has ? '' : 'display:none') + '" src="' + esc(url || '') + '" alt="" onerror="this.style.display=\'none\';var p=document.getElementById(\'editImgPlaceholder\');if(p)p.style.display=\'\'">' +
          '<span id="editImgPlaceholder" class="photo-placeholder" style="' + (has ? 'display:none' : '') + '">' + ICON.image + '</span>' +
        '</div>' +
        '<div class="photo-actions">' +
          '<div class="photo-actions-row">' +
            '<label for="editImageFile" class="btn neutral sm">' + ICON.upload + ' Choose photo…</label>' +
            '<button type="button" class="btn danger sm" id="editImageRemove" data-remove-image style="' + (has ? '' : 'display:none') + '">' + ICON.trash + ' Remove</button>' +
          '</div>' +
          '<small>JPG, PNG or WEBP, up to 5 MB.</small>' +
        '</div>' +
      '</div>' +
      '<input type="file" id="editImageFile" accept="image/jpeg,image/png,image/webp" style="display:none">' +
      '<input type="hidden" id="editImage" value="' + esc(url || '') + '">' +
    '</div>';
  }
  function addFormHtml() {
    var cats = CATEGORIES.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    return '<div class="field"><label>Product ID (unique code)</label><input class="inp" id="editId" placeholder="e.g. 108DW10103"></div>' +
      '<div class="field"><label>Category</label><select class="inp" id="editCategory">' + cats + '</select></div>' +
      '<div class="field"><label>Name</label><input class="inp" id="editName" placeholder="Product name"></div>' +
      '<div class="field"><label>Pack</label><input class="inp" id="editPack" placeholder="e.g. Carton"></div>' +
      '<div class="field"><label>Unit</label><input class="inp" id="editUnit" placeholder="e.g. 1 x 12"></div>' +
      '<div class="field"><label>Price (MVR)</label><input class="inp" id="editPrice" type="number" inputmode="decimal" min="0" step="0.01" value="0"></div>' +
      imageUploadFieldHtml('') +
      '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-weight:600;font-size:12.5px"><input type="checkbox" id="editActive" checked> Visible to customers</label>' +
      '<div class="err" id="editErr"></div>' +
      '<div class="acts modal-footer"><button type="button" class="btn ghost" data-close-edit>Cancel</button><button type="button" class="btn primary" id="editSaveBtn" data-save-product="__new__">Add product</button></div>';
  }
  function editFormHtml(p) {
    return '<div class="field"><label>Product code</label><input class="inp" value="' + esc(p.id) + '" disabled style="background:var(--bg,#f3f4f2);color:var(--ink-soft)"></div>' +
      '<div class="field"><label>Name</label><input class="inp" id="editName" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label>Pack</label><input class="inp" id="editPack" value="' + esc(p.pack || '') + '"></div>' +
      '<div class="field"><label>Unit</label><input class="inp" id="editUnit" value="' + esc(p.unit || '') + '"></div>' +
      '<div class="field"><label>Price (MVR)</label><input class="inp" id="editPrice" type="number" inputmode="decimal" min="0" step="0.01" value="' + (p.price || 0) + '"></div>' +
      imageUploadFieldHtml(p.image_url || '') +
      '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-weight:600;font-size:12.5px"><input type="checkbox" id="editActive"' + (p.active ? ' checked' : '') + '> Visible to customers</label>' +
      '<div class="err" id="editErr"></div>' +
      '<div class="acts modal-footer" style="justify-content:space-between">' +
        '<button type="button" class="btn danger" style="flex:0 0 auto" data-delete-product="' + esc(p.id) + '">Delete product</button>' +
        '<div style="display:flex;gap:10px">' +
          '<button type="button" class="btn ghost" style="flex:0 0 auto" data-close-edit>Cancel</button>' +
          '<button type="button" class="btn primary" style="flex:0 0 auto" id="editSaveBtn" data-save-product="' + esc(p.id) + '">Save changes</button>' +
        '</div>' +
      '</div>';
  }
  function openEditProduct(pid) {
    var p = findProduct(pid); if (!p) return;
    S.editingId = pid;
    pendingImageFile = null;
    $('editTitle').textContent = 'Edit — ' + productDisplayName(p.name);
    $('editBody').innerHTML = editFormHtml(p);
    $('editModal').classList.remove('hidden');
    setTimeout(function () { var i = $('editName'); if (i) i.focus(); }, 0);
  }
  function openAddProduct() {
    S.editingId = '__new__';
    pendingImageFile = null;
    $('editTitle').textContent = 'Add new product';
    $('editBody').innerHTML = addFormHtml();
    $('editModal').classList.remove('hidden');
    setTimeout(function () { var i = $('editId'); if (i) i.focus(); }, 0);
  }
  function closeEditProduct() { S.editingId = null; pendingImageFile = null; $('editModal').classList.add('hidden'); }
  function handleImageFileChange(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Photo must be a JPG, PNG or WEBP file.', true); input.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { toast('Photo must be 5 MB or smaller.', true); input.value = ''; return; }
    pendingImageFile = file;
    var img = $('editImgPreview');
    if (img) { img.src = URL.createObjectURL(file); img.style.display = ''; }
    var ph = $('editImgPlaceholder'); if (ph) ph.style.display = 'none';
    var rm = $('editImageRemove'); if (rm) rm.style.display = '';
  }

  /* ============ styled confirm (replaces window.confirm) ============ */
  function showConfirm(opts) {
    $('confirmTitle').textContent = opts.title || 'Are you sure?';
    var msg = $('confirmMsg');
    if (opts.message) { msg.textContent = opts.message; msg.style.display = ''; }
    else { msg.textContent = ''; msg.style.display = 'none'; }
    var btn = $('confirmOkBtn');
    btn.textContent = opts.confirmLabel || 'OK';
    btn.className = 'btn ' + (opts.danger ? 'confirm-danger' : 'primary');
    btn.onclick = function () { closeConfirm(); if (opts.onConfirm) opts.onConfirm(); };
    var oldAlt = $('confirmAltBtn'); if (oldAlt) oldAlt.parentNode.removeChild(oldAlt);
    if (opts.altLabel) {
      var alt = document.createElement('button');
      alt.type = 'button'; alt.id = 'confirmAltBtn'; alt.className = 'btn ghost'; alt.textContent = opts.altLabel;
      alt.onclick = function () { closeConfirm(); if (opts.onAlt) opts.onAlt(); };
      btn.parentNode.insertBefore(alt, btn);
    }
    $('confirmModal').classList.remove('hidden');
  }
  function closeConfirm() { $('confirmModal').classList.add('hidden'); }
  /* ============ idle auto-logout (security) ============
     If nobody touches the dashboard for IDLE_MAX_MS the staff session is signed out,
     so a phone/PC left open can't be used by someone else. Real activity only
     (mouse, keys, touch, scroll) - background polling does not count. */
  var IDLE_MAX_MS = 30 * 60 * 1000, IDLE_WARN_MS = 60 * 1000;
  var idle = { last: Date.now(), timer: null, warned: false, bound: false };
  function idleTouch() { idle.last = Date.now(); idle.warned = false; }
  function idleCheck() {
    var av = $('appView');
    if (!av || av.classList.contains('hidden')) { idleTouch(); return; }
    var left = IDLE_MAX_MS - (Date.now() - idle.last);
    if (left <= 0) {
      idleTouch();
      Promise.resolve().then(function () { return MaziAPI.logout(); }).catch(function () {}).then(function () {
        showLogin('You were signed out after 30 minutes of inactivity.');
      });
    } else if (left <= IDLE_WARN_MS && !idle.warned) {
      idle.warned = true;
      toast('Signing out in 1 minute because of inactivity. Tap anywhere to stay signed in.');
    }
  }
  function startIdleGuard() {
    idleTouch();
    if (!idle.bound) {
      idle.bound = true;
      ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (ev) {
        window.addEventListener(ev, idleTouch, { passive: true, capture: true });
      });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) idleCheck(); });
    }
    if (!idle.timer) idle.timer = setInterval(idleCheck, 15000);
  }

  function requestLogout() {
    showConfirm({
      title: 'Log out?',
      message: 'Are you sure you want to log out of the staff dashboard?',
      confirmLabel: 'Yes',
      danger: true,
      onConfirm: function () {
        var btn = $('logoutBtn'), loadingStarted = showAuthLoading('Logging out…');
        btn.disabled = true;
        Promise.resolve().then(function () { return MaziAPI.logout(); }).catch(function () {}).then(function () {
          showLogin();
          return finishAuthLoading(loadingStarted);
        }).then(function () { btn.disabled = false; });
      }
    });
  }

  /* ============ image quick view (with zoom) ============ */
  var IV = { z: 1, x: 0, y: 0, pts: {}, n: 0, pd: 0, pz: 1, drag: false, sx: 0, sy: 0, px: 0, py: 0 };
  var IV_MIN = 1, IV_MAX = 5;
  function ivApply(animate) {
    var img = $('imgViewPic'), st = $('imgViewStage');
    img.classList.toggle('iv-animate', !!animate);
    img.style.transform = 'translate(' + IV.x + 'px,' + IV.y + 'px) scale(' + IV.z + ')';
    st.classList.toggle('is-zoomed', IV.z > 1.01);
  }
  function ivClamp() {
    var st = $('imgViewStage');
    var mx = Math.max(0, (st.clientWidth * IV.z - st.clientWidth) / 2);
    var my = Math.max(0, (st.clientHeight * IV.z - st.clientHeight) / 2);
    IV.x = Math.min(mx, Math.max(-mx, IV.x));
    IV.y = Math.min(my, Math.max(-my, IV.y));
  }
  function ivSetZoom(z, animate) {
    IV.z = Math.min(IV_MAX, Math.max(IV_MIN, z));
    if (IV.z <= 1) { IV.x = 0; IV.y = 0; }
    ivClamp(); ivApply(animate);
  }
  function ivReset(animate) { IV.z = 1; IV.x = 0; IV.y = 0; ivApply(animate); }
  function bindImgViewZoom() {
    var st = $('imgViewStage');
    if (!st) return;
    var lastTap = 0;
    st.addEventListener('touchend', function (e) {
      if (e.touches.length) return;
      var now = Date.now();
      if (now - lastTap < 300) { lastTouchToggle = now; if (IV.z > 1) ivReset(true); else ivSetZoom(2.5, true); }
      lastTap = now;
    });
    st.addEventListener('wheel', function (e) {
      e.preventDefault();
      ivSetZoom(IV.z + (e.deltaY < 0 ? 0.25 : -0.25), false);
    }, { passive: false });
    var lastTouchToggle = 0;
    st.addEventListener('dblclick', function (e) {
      if (Date.now() - lastTouchToggle < 600) return;
      if (IV.z > 1) ivReset(true); else ivSetZoom(2.5, true);
    });
    st.addEventListener('pointerdown', function (e) {
      IV.pts[e.pointerId] = { x: e.clientX, y: e.clientY }; IV.n = Object.keys(IV.pts).length;
      if (IV.n === 1 && IV.z > 1) { IV.drag = true; IV.sx = e.clientX; IV.sy = e.clientY; IV.px = IV.x; IV.py = IV.y; }
      else if (IV.n === 2) {
        var a = Object.keys(IV.pts).map(function (k) { return IV.pts[k]; });
        IV.drag = false; IV.pd = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); IV.pz = IV.z;
      }
    });
    st.addEventListener('pointermove', function (e) {
      if (!IV.pts[e.pointerId]) return;
      IV.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (IV.n === 2 && IV.pd > 0) {
        var a = Object.keys(IV.pts).map(function (k) { return IV.pts[k]; });
        ivSetZoom(IV.pz * (Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / IV.pd), false);
      } else if (IV.drag) {
        IV.x = IV.px + (e.clientX - IV.sx); IV.y = IV.py + (e.clientY - IV.sy);
        ivClamp(); ivApply(false);
      }
    });
    function end(e) {
      delete IV.pts[e.pointerId]; IV.n = Object.keys(IV.pts).length;
      IV.drag = false; IV.pd = 0;
      if (IV.z <= 1) ivReset(false);
    }
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    st.addEventListener('pointerleave', end);
    document.addEventListener('keydown', function (e) {
      if ($('imgViewModal').classList.contains('hidden')) return;
      if (e.key === 'Escape') closeImgView();
      else if (e.key === '+' || e.key === '=') ivSetZoom(IV.z + 0.5, true);
      else if (e.key === '-') ivSetZoom(IV.z - 0.5, true);
      else if (e.key === '0') ivReset(true);
    });
  }
  function openImgView(pid) {
    var p = findProduct(pid); if (!p || !p.image_url) return;
    $('imgViewPic').src = p.image_url;
    $('imgViewName').textContent = productDisplayName(p.name);
    $('imgViewMeta').textContent = pid + (p.pack ? ' · ' + p.pack : '') + (p.unit ? ' ' + p.unit : '');
    IV.pts = {}; IV.n = 0; ivReset(false);
    $('imgViewModal').classList.remove('hidden');
  }
  function closeImgView() { $('imgViewModal').classList.add('hidden'); ivReset(false); }
  function saveProduct(pid) {
    var name = $('editName').value.trim();
    if (!name) { $('editErr').textContent = 'Name can\'t be empty.'; return; }
    var priceStr = $('editPrice').value.trim();
    if (priceStr !== '' && (isNaN(Number(priceStr)) || Number(priceStr) < 0)) { $('editErr').textContent = 'Enter a valid price.'; return; }
    var btn = $('editSaveBtn');
    var origLabel = btn.textContent;

    function withImageUrl(next) {
      if (!pendingImageFile) { next($('editImage').value.trim()); return; }
      btn.disabled = true; btn.textContent = 'Uploading photo…';
      var idForFile = pid === '__new__' ? ($('editId').value.trim() || 'new') : pid;
      MaziAPI.uploadProductImage(pendingImageFile, idForFile).then(function (url) {
        pendingImageFile = null;
        $('editImage').value = url;
        next(url);
      }).catch(function (e) {
        $('editErr').textContent = e.message || 'Could not upload the photo.';
        btn.disabled = false; btn.textContent = origLabel;
      });
    }

    if (pid === '__new__') {
      var newId = $('editId').value.trim();
      if (!newId) { $('editErr').textContent = 'Product ID is required.'; return; }
      if (findProduct(newId)) { $('editErr').textContent = 'A product with this ID already exists.'; return; }
      withImageUrl(function (imageUrl) {
        btn.disabled = true; btn.textContent = 'Adding…';
        MaziAPI.adminAddProduct({
          id: newId, name: name, category: $('editCategory').value,
          pack: $('editPack').value.trim(), unit: $('editUnit').value.trim(),
          price: priceStr === '' ? 0 : Number(priceStr),
          image_url: imageUrl,
          active: $('editActive').checked
        }).then(function () {
          toast(name.slice(0, 40) + ' added');
          closeEditProduct();
          return loadStock().then(render);
        }).catch(function (e) {
          var msg = String((e && e.message) || 'Could not add the product.');
          if (/admin_add_product/i.test(msg)) {
            msg = 'One-time setup needed — open Supabase → SQL Editor and run supabase/14_admin_add_product.sql, then try again.';
          }
          $('editErr').textContent = msg;
          btn.disabled = false; btn.textContent = 'Add product';
        });
      });
      return;
    }

    var p = findProduct(pid); if (!p) return;
    withImageUrl(function (imageUrl) {
      var patch = {
        name: name,
        pack: $('editPack').value.trim(),
        unit: $('editUnit').value.trim(),
        price: priceStr === '' ? 0 : Number(priceStr),
        icon: p.icon || '',
        image_url: imageUrl,
        active: $('editActive').checked
      };
      btn.disabled = true; btn.textContent = 'Saving…';
      MaziAPI.adminUpdateProduct(pid, patch).then(function () {
        toast(name.slice(0, 40) + ' updated');
        closeEditProduct();
        return loadStock().then(render);
      }).catch(function (e) {
        var msg = String((e && e.message) || 'Could not save changes.');
        if (/product_edit_log|admin_update_product/i.test(msg)) {
          msg = 'One-time setup needed — open Supabase → SQL Editor and run supabase/15_admin_update_product_image.sql, then try again.';
        }
        $('editErr').textContent = msg;
        btn.disabled = false; btn.textContent = 'Save changes';
      });
    });
  }
  function deleteProduct(pid) {
    var p = findProduct(pid); if (!p) return;
    showConfirm({
      title: 'Delete this product?',
      message: (p.name ? productDisplayName(p.name).slice(0, 60) : pid) + ' (' + pid + ') will be permanently removed — this can\'t be undone. Past orders keep their own record, so this won\'t change order history.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: function () {
        MaziAPI.adminDeleteProduct(pid).then(function () {
          toast((p.name ? productDisplayName(p.name).slice(0, 40) : pid) + ' deleted');
          closeEditProduct();
          return loadStock().then(render);
        }).catch(function (e) {
          var msg = String((e && e.message) || 'Could not delete the product.');
          if (/admin_delete_product/i.test(msg)) {
            msg = 'One-time setup needed — open Supabase → SQL Editor and run supabase/18_admin_delete_product.sql, then try again.';
          }
          toast(msg, true);
        });
      }
    });
  }

  /* ============ drawer (order details) ============ */
  function openDrawer(id) { S.drawerId = id; closeMenu(); $('scrim').classList.add('open'); $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); refreshDrawer(true); }
  function closeDrawer() { S.drawerId = null; $('scrim').classList.remove('open'); $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
  function refreshDrawer(force) {
    var o = findOrder(S.drawerId);
    if (!o) { closeDrawer(); return; }
    var ae = document.activeElement;
    if (!force && ae && $('drawer').contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return; // don't clobber typing
    $('drawer').innerHTML = drawerHtml(o);
  }
  function drawerHtml(o) {
    var c = o.customer || {}, wk = o.orderType === 'walkin', feeTbc = !wk && o.deliveryFee == null;
    var mobile = String(c.mobile || '').replace(/[^0-9+]/g, '');
    var items = o.items.map(function (it) {
      return '<li><span>' + esc(productDisplayName(it.name)) + '<small>' + esc(it.pack || '') + ' · ' + esc(mvr(it.price)) + ' × ' + it.qty + (it.discount > 0 ? ' · disc −' + esc(mvr(it.discount)) : '') + '</small></span><span>' + esc(mvr(it.price * it.qty - (it.discount || 0))) + '</span></li>';
    }).join('');
    var h = '<div class="dh"><div><h2>#' + esc(o.id) + '</h2><small>' + esc(fmtDate(o.placedAt)) + '</small><div class="c-status" style="margin-top:6px;gap:6px">' + sourcePill(o) + statusHtml(o) + '</div></div>' +
      '<button class="kebab" data-close aria-label="Close">' + ICON.close + '</button></div><div class="dc"><div class="dc-cols"><div class="dc-col">';
    h += '<div class="sec"><h4>Customer</h4><div><b>' + esc(c.name || (wk ? 'Walk-in customer' : '')) + '</b></div>' +
      ((wk && !mobile) ? '' : '<div><a href="tel:' + esc(mobile) + '">' + esc(c.mobile) + '</a> · <a href="https://wa.me/' + esc(mobile.replace(/^\+/, '')) + '" target="_blank" rel="noopener">WhatsApp</a></div>') + '</div>';
    if (wk) {
      if (creatorName(o)) h += '<div class="sec"><h4>Created by</h4><div><b>' + esc(creatorName(o)) + '</b> <span style="color:var(--ink-soft)">&middot; staff</span></div></div>';
      h += '<div class="sec"><h4>Sale</h4><div class="loc">Counter sale &middot; ' + (o.paymentMethod === 'credit' ? '<b style="color:var(--red)">on credit</b> (customer pays later)' : 'paid by ' + esc((PM_LABEL[o.paymentMethod] || 'cash').toLowerCase())) + '</div></div>';
    } else {
      h += '<div class="sec"><h4>' + esc(typeOf(o)) + '</h4><div class="loc">' + esc(locationText(o)) + '</div></div>';
      h += '<div class="sec"><h4>Payment slip</h4>' +
        (o.slipPath
          ? '<button class="btn ghost sm" data-slip="' + esc(o.id) + '">View payment slip</button>'
          : '<div style="color:var(--ink-soft);font-size:13px">No payment slip</div>') +
        '</div>';
    }
    h += '</div><div class="dc-col">';
    h += '<div class="sec"><h4>Items</h4><ul class="items">' + items + '</ul>' +
      '<div style="margin-top:8px"><div class="kv"><span>Subtotal</span><span>' + esc(mvr(o.subtotal)) + '</span></div>' +
      '<div class="kv" style="color:var(--ink-soft)"><span>incl. GST</span><span>' + esc(mvr(o.gst)) + '</span></div>' +
      (wk ? '' : '<div class="kv"><span>Delivery</span><span>' + (feeTbc ? '<b style="color:var(--amber)">to be confirmed</b>' : esc(mvr(o.deliveryFee))) + '</span></div>') +
      '<div class="kv total"><span>Total</span><span>' + esc(mvr(o.total)) + '</span></div></div>' +
      (o.currency === 'USD' ? '<div class="info">Customer chose to pay in <b>USD</b> ≈ $' + (o.total / MVR_PER_USD).toFixed(2) + ' (at ' + MVR_PER_USD + ')</div>' : '') + '</div>';
    h += '</div></div>';

    h += '<div class="sec dc-actions"><h4>Actions</h4><div class="acts">';
    if (wk && o.status !== 'cancelled') {
      h += '<span class="pill">Completed</span>' +
        '<button class="btn primary" data-reprint="' + esc(o.id) + '">' + printLabel(o) + '</button>' +
        '<button class="btn danger" data-cancel="' + esc(o.id) + '">Void sale</button>';
    } else if (o.status !== 'cancelled') {
      var i = FLOW.indexOf(o.status);
      if (i < FLOW.length - 1) h += '<button class="btn primary" data-next="' + esc(o.id) + '">' + NEXT_LABEL[o.status] + '</button>';
      if (o.status !== 'delivered') h += '<button class="btn danger" data-cancel="' + esc(o.id) + '">Cancel order</button>';
      if (o.status === 'delivered') h += '<span class="pill">Completed</span>';
      h += '<button class="btn" data-reprint="' + esc(o.id) + '">' + printLabel(o) + '</button>';
    } else {
      if (o.refundStatus === 'pending' || o.refundStatus === 'refunded') {
        h += '<span class="refund-chip' + (o.refundStatus === 'refunded' ? ' done' : '') + '"><span class="dot"></span>' + (o.refundStatus === 'refunded' ? 'Refunded' : 'Refund pending') + '</span>';
      } else {
        h += '<span class="pill gray">' + (wk ? 'Voided — stock returned' : 'Cancelled — no refund due') + '</span>';
      }
      if (o.refundStatus === 'pending') h += '<button class="btn primary" data-refunded="' + esc(o.id) + '">Mark refunded</button>';
    }
    h += '</div>';
    if (feeTbc && o.status !== 'cancelled') {
      h += '<div class="rowin"><input type="number" min="0" step="1" placeholder="Delivery fee (MVR)" id="fee-' + esc(o.id) + '"><button class="btn primary sm" data-fee="' + esc(o.id) + '">Set fee</button></div>';
    }
    h += '<div class="rowin"><input type="text" maxlength="500" placeholder="Internal note (customers can\'t see this)" id="note-' + esc(o.id) + '" value="' + esc(o.adminNote || '') + '"><button class="btn primary sm" data-note="' + esc(o.id) + '">Save note</button></div></div>';
    return h + '</div>';
  }

  /* ============ row menu ============ */
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(id, btn) {
    closeMenu();
    var o = findOrder(id); if (!o) return;
    var items = ['<button data-open="' + esc(id) + '">View details</button>'];
    var wkm = o.orderType === 'walkin';
    if (o.status !== 'cancelled') items.push('<button data-reprint="' + esc(id) + '">' + printLabel(o) + '</button>');
    if (!wkm && o.status !== 'cancelled') {
      var i = FLOW.indexOf(o.status);
      if (i < FLOW.length - 1) items.push('<button data-next="' + esc(id) + '">' + NEXT_LABEL[o.status] + '</button>');
    }
    if (o.slipPath) items.push('<button data-slip="' + esc(id) + '">View payment slip</button>');
    if (o.status === 'cancelled' && o.refundStatus === 'pending') items.push('<button data-refunded="' + esc(id) + '">Mark refunded</button>');
    if (o.status !== 'cancelled' && (o.status !== 'delivered' || wkm)) items.push('<button class="dng" data-cancel="' + esc(id) + '">' + (wkm ? 'Void sale' : 'Cancel order') + '</button>');
    placeMenu(items, btn);
  }
  function openStockMenu(pid, btn) {
    closeMenu();
    var items = [
      '<button data-edit="' + esc(pid) + '">Edit product details</button>'
    ];
    placeMenu(items, btn);
  }
  function openStaffMenu(id, btn) {
    closeMenu();
    if (!isSuperAdmin(S.profile)) return;
    var account = (S.accounts || []).filter(function (x) { return x.id === id; })[0];
    if (!account) return;
    var items = [];
    // No "Make Super Admin": MAZI has a single Super Admin (the primary company account).
    if ((account.is_admin || account.is_super_admin) && !isPrimaryAdminAccount(account)) {
      items.push('<button data-staff-off="' + esc(id) + '">Remove access</button>');
    }
    if (items.length) placeMenu(items, btn);
  }
  function placeMenu(items, btn) {
    menuEl = document.createElement('div');
    menuEl.className = 'menu'; menuEl.innerHTML = items.join('');
    document.body.appendChild(menuEl);
    var r = btn.getBoundingClientRect(), mh = menuEl.offsetHeight, mw = menuEl.offsetWidth;
    var top = r.bottom + 4; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    menuEl.style.top = top + 'px';
    menuEl.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + 'px';
  }

  /* ============ notifications dropdown ============ */
  function closeNotif() { if (notifEl) { notifEl.remove(); notifEl = null; } }
  function toggleNotif(btn) { if (notifEl) { closeNotif(); return; } openNotifDropdown(btn); }
  function openNotifDropdown(btn) {
    closeMenu();
    var seen = getSeenPlaced();
    var placed = S.orders.filter(function (o) { return o.status === 'placed'; })
      .sort(function (a, b) { return b.placedAt - a.placedAt; }).slice(0, 12);
    var body = placed.length ? placed.map(function (o) {
      var c = o.customer || {}, isNew = !seen[o.id];
      return '<button type="button" class="notif-dd-item" data-notif-item="' + esc(o.id) + '">' +
        '<span class="notif-dd-body"><p class="notif-dd-title">' + esc(c.name || 'A customer') + ' placed order #' + esc(o.id) + '</p>' +
        '<p class="notif-dd-sub">' + esc(mvr(o.total)) + ' · ' + esc(ago(o.placedAt)) + '</p></span>' +
        '<span class="notif-dd-dot' + (isNew ? ' new' : '') + '"></span></button>';
    }).join('') : '<div class="notif-dd-empty">No new orders right now.</div>';
    notifEl = document.createElement('div');
    notifEl.className = 'notif-dd';
    notifEl.innerHTML = '<div class="notif-dd-head">Notifications</div><div class="notif-dd-list">' + body +
      '</div><div class="notif-dd-foot"><button type="button" data-notif-viewall>View all</button></div>';
    document.body.appendChild(notifEl);
    var r = btn.getBoundingClientRect(), mh = notifEl.offsetHeight, mw = notifEl.offsetWidth;
    var top = r.bottom + 6; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    notifEl.style.top = top + 'px';
    notifEl.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + 'px';
  }

  /* ============ order actions ============ */
  function apply(id, status, extra, okMsg) {
    return MaziAPI.adminSetOrderStatus(id, status, extra).then(function () {
      toast(okMsg || 'Updated');
      return loadOrders().then(render);
    }).catch(function (e) { toast(e.message || 'Could not update the order.', true); });
  }


  /* ============ settings ============ */
  // Shared values live in app_config (the same table the server reads gst_rate from), so what is saved
  // here is what quotations, invoices, receipts and new orders really use. Only the Super Admin can save.
  var SETTINGS_DEFAULTS = {
    store_name: 'Mazi General Trade',
    store_addr: 'Ma. Wooden Park, Boduthakurufaanu Magu 20263, Male, Rep of Maldives',
    store_phone: '+960 3330067', store_email: 'mgt@miqapvtltd.com', store_gst_tin: '115973GTS501',
    mvr_per_usd: 15.42, gst_rate: 0.08, free_delivery_over_mvr: 500,
    male_islands: ["Male'", "Hulhumale'"], low_stock_threshold: 10
  };
  var CFG = Object.assign({}, SETTINGS_DEFAULTS);
  var settingsDirty = false;
  var REFRESH_CHOICES = [[15000, 'Every 15 seconds'], [30000, 'Every 30 seconds'], [60000, 'Every minute'], [120000, 'Every 2 minutes']];
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function soundOn() { return lsGet('mazi_staff_sound', 'on') !== 'off'; }
  function getPollMs() {
    var n = parseInt(lsGet('mazi_poll_ms', String(POLL_MS)), 10);
    return REFRESH_CHOICES.some(function (c) { return c[0] === n; }) ? n : POLL_MS;
  }
  function applySettings(raw) {
    var c = Object.assign({}, SETTINGS_DEFAULTS, raw || {});
    var rate = Number(c.mvr_per_usd), gst = Number(c.gst_rate), low = parseInt(c.low_stock_threshold, 10);
    if (!(rate > 0)) c.mvr_per_usd = SETTINGS_DEFAULTS.mvr_per_usd;
    if (!(gst >= 0 && gst <= 0.5)) c.gst_rate = SETTINGS_DEFAULTS.gst_rate;
    if (!(low >= 0)) c.low_stock_threshold = SETTINGS_DEFAULTS.low_stock_threshold;
    ['store_name', 'store_addr', 'store_phone', 'store_email', 'store_gst_tin'].forEach(function (k) {
      if (typeof c[k] !== 'string' || !c[k].trim()) c[k] = SETTINGS_DEFAULTS[k];
    });
    if (!Array.isArray(c.male_islands)) c.male_islands = SETTINGS_DEFAULTS.male_islands.slice();
    CFG = c;
    MVR_PER_USD = Number(c.mvr_per_usd);
    DOC_GST_RATE = Number(c.gst_rate);
    LOW_STOCK_MAX = parseInt(c.low_stock_threshold, 10);
  }
  function loadSettings() {
    return MaziAPI.getConfig().then(function (raw) { S.settingsError = null; applySettings(raw); })
      .catch(function (e) { S.settingsError = e; });
  }
  function pctText(rate) { return String(Math.round(Number(rate) * 10000) / 100); }
  function stField(id, label, val, o) {
    o = o || {};
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' +
      '<input class="inp" id="' + id + '" data-st-field type="' + (o.type || 'text') + '"' +
      (o.step ? ' step="' + o.step + '"' : '') + (o.min != null ? ' min="' + o.min + '"' : '') +
      ' value="' + esc(val) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.dis ? ' disabled' : '') + (o.type === 'number' ? '' : ' maxlength="' + (o.max || 200) + '"') + '>' +
      (o.hint ? '<small class="st-hint">' + esc(o.hint) + '</small>' : '') + '</div>';
  }
  function bnRowInner() {
    if (!notifSupported()) return '<div><b>Browser alerts</b><small>Not supported on this device.</small></div>';
    if (Notification.permission === 'denied') return '<div><b>Browser alerts</b><small>Blocked — allow notifications for this site in your browser settings.</small></div>';
    if (Notification.permission === 'granted') {
      return '<div><b>Browser alerts</b><small>Pop-up notification on this device when a new order comes in.</small></div>' +
        '<label class="sw"><input type="checkbox" data-st-bn-toggle' + (getStaffNotifPref() !== 'off' ? ' checked' : '') + '><i></i></label>';
    }
    return '<div><b>Browser alerts</b><small>Get a pop-up on this device when a new order comes in.</small></div>' +
      '<button type="button" class="btn primary sm" data-st-bn="enable">Enable</button>';
  }
  function renderSettings() {
    var p = S.profile || {}, sup = isSuperAdmin(p), dis = !sup;
    var email = isPrimarySuperAdmin(p) ? PRIMARY_SUPER_ADMIN_EMAIL : (p.email || '');
    var name = displayName(p);
    var h = '<h1>Settings</h1><p class="lead">Account, store details, tax and alert preferences for the staff dashboard.</p>';
    if (S.settingsError) {
      h += '<div class="note-banner">Shared settings could not be loaded, so the defaults are showing. If this keeps happening, run <code>supabase/47_app_settings.sql</code> in the Supabase SQL Editor and refresh.</div>';
    }
    h += '<div class="set-grid set-top">';

    // ---- account
    h += '<div class="box st-account"><h3>Account</h3><p class="st-sub">The account you are signed in with.</p>' +
      '<div class="st-acct"><div class="st-av">' + esc(initials(name)) + '</div><div style="min-width:0"><b>' + esc(name) + '</b>' +
      '<span class="st-mail">' + esc(email || '—') + '</span>' +
      '<span class="pill ' + (sup ? 'role-super' : 'role-staff') + '">' + (sup ? 'Super Admin' : 'Staff') + '</span></div></div>' +
      '<div class="acts">' +
      '<button type="button" class="btn ghost sm" data-open-staffname>Change dashboard name</button>' +
      '<button type="button" class="btn ghost sm" data-st-reset>Send password reset email</button>' +
      '<button type="button" class="btn ghost sm" data-st-logout>Log out</button></div></div>';

    // ---- this device
    var curNow = getDocCur(), pollNow = getPollMs();
    var TM = window.MaziTheme, tmMode = TM ? TM.mode() : 'system', tmAcc = TM ? TM.accent() : 'green';
    var THEME_ICO = {
      system: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
      light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
      dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>'
    };
    var ACC_SW = { green: ['Green', '#2F9375'], blue: ['Blue', '#2F5993'], violet: ['Violet', '#532F93'], rose: ['Rose', '#932F53'], orange: ['Orange', '#93572F'] };
    var themeRows =
      '<div class="set-row"><div><b>Theme</b><small>Match this device, or always use light or dark.</small></div>' +
      '<div class="seg" role="group" aria-label="Theme">' + ['system', 'light', 'dark'].map(function (m) {
        return '<button type="button" data-st-theme="' + m + '" class="' + (m === tmMode ? 'active' : '') + '" aria-pressed="' + (m === tmMode) + '">' + THEME_ICO[m] + (m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark') + '</button>';
      }).join('') + '</div></div>' +
      '<div class="set-row"><div><b>Accent colour</b><small>Buttons, highlights and charts.</small></div>' +
      '<div class="swatches" role="group" aria-label="Accent colour">' + Object.keys(ACC_SW).map(function (k) {
        return '<button type="button" class="swatch' + (k === tmAcc ? ' active' : '') + '" data-st-accent="' + k + '" style="--sw:' + ACC_SW[k][1] + '" title="' + ACC_SW[k][0] + (k === 'green' ? ' (default)' : '') + '" aria-label="' + ACC_SW[k][0] + '" aria-pressed="' + (k === tmAcc) + '"></button>';
      }).join('') + '</div></div>';
    h += '<div class="box"><h3>Alerts &amp; display</h3><p class="st-sub">Applies to this device only.</p>' + themeRows +
      '<div class="set-row"><div><b>Alert sound</b><small>Play a beep when a new order or request arrives.</small></div>' +
      '<label class="sw"><input type="checkbox" data-st-sound' + (soundOn() ? ' checked' : '') + '><i></i></label></div>' +
      '<div class="set-row" id="stBnRow">' + bnRowInner() + '</div>' +
      '<div class="set-row"><div><b>Auto-refresh</b><small>How often orders and stock reload by themselves.</small></div>' +
      '<select class="inp" data-st-poll>' + REFRESH_CHOICES.map(function (c) {
        return '<option value="' + c[0] + '"' + (c[0] === pollNow ? ' selected' : '') + '>' + c[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="set-row"><div><b>Document currency</b><small>Currency for POS quotations, invoices and receipts.</small></div>' +
      '<div class="myear-tabs" id="stCurTabs" style="margin:0">' + ['MVR', 'USD'].map(function (c) {
        return '<button type="button" class="myear-tab' + (c === curNow ? ' active' : '') + '" data-st-cur="' + c + '">' + c + '</button>';
      }).join('') + '</div></div></div>';
    h += '</div>';   // end of the first row of cards

    // ---- shared (Super Admin)
    h += '<div class="set-bar">' + (sup
      ? '<button type="button" class="btn primary" data-st-save>Save changes</button><button type="button" class="btn ghost" data-st-defaults>Reset to defaults</button><span class="st-lock">Shared by every staff account.</span>'
      : '<span class="st-lock">The settings below are shared by every staff account. Only a Super Admin can change them.</span>') + '</div>';
    h += '<div class="set-grid set-grid-3">';
    h += '<div class="box"><h3>Business details</h3><p class="st-sub">Printed at the top of every quotation, invoice and receipt.</p>' +
      stField('st_store_name', 'Business name', CFG.store_name, { dis: dis }) +
      stField('st_store_addr', 'Address', CFG.store_addr, { dis: dis, max: 300 }) +
      stField('st_store_phone', 'Phone', CFG.store_phone, { dis: dis, max: 40 }) +
      stField('st_store_email', 'Email', CFG.store_email, { dis: dis, type: 'email', max: 120 }) +
      stField('st_store_gst_tin', 'GST TIN', CFG.store_gst_tin, { dis: dis, max: 40 }) + '</div>';
    h += '<div class="box"><h3>Pricing &amp; tax</h3><p class="st-sub">Product prices are stored GST-included; these values split the tax and convert to USD.</p>' +
      stField('st_gst', 'GST rate (%)', pctText(CFG.gst_rate), { dis: dis, type: 'number', step: '0.01', min: 0, hint: 'Also used by the server when an order is placed.' }) +
      stField('st_mvr_per_usd', 'MVR per 1 USD', CFG.mvr_per_usd, { dis: dis, type: 'number', step: '0.01', min: 0 }) + '</div>';
    h += '<div class="box"><h3>Delivery &amp; stock</h3><p class="st-sub">Free-delivery rule and when a product counts as low on stock.</p>' +
      stField('st_free', 'Free delivery over (MVR)', CFG.free_delivery_over_mvr, { dis: dis, type: 'number', step: '1', min: 0, hint: 'Orders above this amount get free delivery.' }) +
      stField('st_islands', 'Male\u2019 area islands', CFG.male_islands.join(', '), { dis: dis, max: 300, hint: 'Comma-separated. Orders to these islands count as Male\u2019 area.' }) +
      stField('st_low', 'Low-stock alert at (units)', CFG.low_stock_threshold, { dis: dis, type: 'number', step: '1', min: 0, hint: 'At or below this count a product shows as Low stock.' }) + '</div>';
    h += '</div>';
    $('panel').innerHTML = h;
  }
  function stVal(id) { var el = $(id); return el ? el.value.trim() : ''; }
  function saveSettings() {
    if (!isSuperAdmin(S.profile)) { toast('Only a Super Admin can change these settings.', true); return; }
    var v = {
      store_name: stVal('st_store_name'), store_addr: stVal('st_store_addr'), store_phone: stVal('st_store_phone'),
      store_email: stVal('st_store_email'), store_gst_tin: stVal('st_store_gst_tin'),
      gst: Number(stVal('st_gst')), rate: Number(stVal('st_mvr_per_usd')), free: Number(stVal('st_free')),
      islands: stVal('st_islands').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      low: Number(stVal('st_low'))
    };
    var bad = null;
    if (!v.store_name) bad = 'Business name can\u2019t be empty.';
    else if (!(v.gst >= 0 && v.gst <= 50)) bad = 'GST rate must be between 0 and 50 (%).';
    else if (!(v.rate > 0 && v.rate <= 1000)) bad = 'Enter a valid MVR per USD rate, e.g. 15.42.';
    else if (!(v.free >= 0)) bad = 'Free delivery amount can\u2019t be negative.';
    else if (!(v.low >= 0 && v.low <= 1000 && Math.floor(v.low) === v.low)) bad = 'Low-stock alert must be a whole number from 0 to 1000.';
    if (bad) { toast(bad, true); return; }
    var payload = {
      store_name: v.store_name, store_addr: v.store_addr, store_phone: v.store_phone, store_email: v.store_email, store_gst_tin: v.store_gst_tin,
      gst_rate: Math.round(v.gst * 100) / 10000, mvr_per_usd: v.rate, free_delivery_over_mvr: v.free,
      male_islands: v.islands, low_stock_threshold: v.low
    };
    var btn = document.querySelector('[data-st-save]'); if (btn) btn.disabled = true;
    MaziAPI.adminSaveConfig(payload).then(function () {
      settingsDirty = false; S.settingsError = null;
      applySettings(Object.assign({}, CFG, payload));
      toast('Settings saved');
      render();
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      var m = String((e && e.message) || '');
      toast(/row-level security|permission|FORBIDDEN/i.test(m) ? 'Only the Super Admin can save these settings.' : (m || 'Could not save settings.'), true);
    });
  }
  function resetSettingsForm() {
    var D = SETTINGS_DEFAULTS, map = {
      st_store_name: D.store_name, st_store_addr: D.store_addr, st_store_phone: D.store_phone, st_store_email: D.store_email,
      st_store_gst_tin: D.store_gst_tin, st_gst: pctText(D.gst_rate), st_mvr_per_usd: D.mvr_per_usd, st_free: D.free_delivery_over_mvr,
      st_islands: D.male_islands.join(', '), st_low: D.low_stock_threshold
    };
    Object.keys(map).forEach(function (id) { if ($(id)) $(id).value = map[id]; });
    settingsDirty = true;
    toast('Defaults filled in — press Save changes to apply them.');
  }
  function sendResetEmail() {
    var email = isPrimarySuperAdmin(S.profile) ? PRIMARY_SUPER_ADMIN_EMAIL : (S.profile && S.profile.email);
    if (!email) { toast('No email found for this account.', true); return; }
    showConfirm({
      title: 'Send reset email?',
      message: 'We will email a password reset link to ' + email + '.',
      confirmLabel: 'Send',
      onConfirm: function () {
        MaziAPI.sendPasswordReset(email).then(function () { toast('Reset link sent to ' + email); })
          .catch(function (e) { toast((e && e.message) || 'Could not send the email.', true); });
      }
    });
  }
  function onSettingsClick(e) {
    var pf = e.target.closest('[data-pf]');
    if (pf) {
      closeMenu();
      if (pf.dataset.pf === 'name') openStaffNameModal();
      else if (pf.dataset.pf === 'settings') { S.view = 'settings'; S.q = ''; closeDrawer(); render(); }
      else if (pf.dataset.pf === 'logout') requestLogout();
      return;
    }
    var t = e.target.closest('[data-st-save],[data-st-defaults],[data-st-reset],[data-st-logout],[data-st-bn],[data-st-cur]');
    if (!t) return;
    if (t.hasAttribute('data-st-save')) saveSettings();
    else if (t.hasAttribute('data-st-defaults')) resetSettingsForm();
    else if (t.hasAttribute('data-st-reset')) sendResetEmail();
    else if (t.hasAttribute('data-st-logout')) requestLogout();
    else if (t.dataset.stBn === 'enable') {
      requestDeviceNotifPermission(function (perm) {
        if (perm === 'granted') setStaffNotifPref('on');
        var row = $('stBnRow'); if (row) row.innerHTML = bnRowInner();
      });
    } else if (t.dataset.stCur) {
      setDocCur(t.dataset.stCur);
      Array.prototype.forEach.call(document.querySelectorAll('#stCurTabs [data-st-cur]'), function (b) { b.classList.toggle('active', b === t); });
      toast('Documents will print in ' + t.dataset.stCur);
    }
  }
  function onSettingsChange(e) {
    var t = e.target;
    if (t.matches && t.matches('[data-st-sound]')) { lsSet('mazi_staff_sound', t.checked ? 'on' : 'off'); if (t.checked) beep(); }
    else if (t.matches && t.matches('[data-st-bn-toggle]')) setStaffNotifPref(t.checked ? 'on' : 'off');
    else if (t.matches && t.matches('[data-st-poll]')) { lsSet('mazi_poll_ms', t.value); startPolling(); toast('Auto-refresh updated'); }
  }
  function openProfileMenu(btn) {
    closeNotif(); closeMenu();
    placeMenu([
      '<button type="button" data-pf="name">Dashboard name</button>',
      '<button type="button" data-pf="settings">Settings</button>',
      '<button type="button" class="lo" data-pf="logout">Log out</button>'
    ], btn);
  }

  /* ============ events ============ */
  function onClick(e) {
    var t = e.target.closest('[data-tab],[data-agroup],[data-open],[data-menu],[data-stock-menu],[data-staff-menu],[data-next],[data-cancel],[data-slip],[data-reprint],[data-refunded],[data-fee],[data-note],[data-add],[data-subtract],[data-set],[data-edit],[data-add-product],[data-save-product],[data-delete-product],[data-close-edit],[data-shop-approve],[data-shop-reject],[data-close],[data-view],[data-goto],[data-month-toggle],[data-months-toggle],[data-sales-year],[data-sales-source],[data-notif-enable],[data-notif-off],[data-notif-on],[data-notif-item],[data-notif-viewall],[data-close-confirm],[data-img-view],[data-close-imgview],[data-remove-image],[data-staff-on],[data-staff-off],[data-staff-reject],[data-staff-decline],[data-sa-on],[data-sa-off],[data-open-staffname],[data-close-staffname],[data-save-staffname],[data-retry-changes],[data-toggle-error-detail],[data-new-customer],[data-edit-customer],[data-delete-customer],[data-restore-customer],[data-purge-customer],[data-cust-tab],[data-close-customer],[data-save-customer],[data-cust-pay],[data-cust-edit],[data-cust-back],[data-cust-pay-confirm],[data-cust-receipt]');
    if (!t) return;
    var d = t.dataset, o;
    if (d.view) { S.view = d.view; S.q = ''; if (d.view === 'live') markPlacedSeen(); closeDrawer(); closeMenu(); if (S.view === 'stock' || S.view === 'dashboard' || S.view === 'pos') { loadStock().then(render); } render(); return; }
    if (d.goto) {
      var parts = d.goto.split(':'); S.view = parts[0]; S.q = d.gotoQ || '';
      if (parts[1]) S.tab[S.view] = parts[1];
      if (S.view === 'live') markPlacedSeen();
      closeDrawer(); closeMenu();
      if (S.view === 'stock') { loadStock().then(render); } else render();
      return;
    }
    if (d.monthToggle) { S.expMonths[d.monthToggle] = !S.expMonths[d.monthToggle]; render(); return; }
    if (d.monthsToggle !== undefined) { S.showAllMonths = !S.showAllMonths; render(); return; }
    if (d.salesSource) { S.salesSource = d.salesSource; S.showAllMonths = false; render(); return; }
    if (d.salesYear) { S.salesYear = d.salesYear; S.showAllMonths = false; render(); return; }
    if (d.notifItem) { closeNotif(); markOneSeen(d.notifItem); openDrawer(d.notifItem); render(); return; }
    if (d.retryChanges !== undefined) { t.classList.add('spin'); loadProfileChanges().then(render); return; }
    if (d.toggleErrorDetail !== undefined) { S.showChangesErrorDetail = !S.showChangesErrorDetail; render(); return; }
    if (d.notifViewall !== undefined) { closeNotif(); S.view = 'live'; S.tab.live = 'placed'; markPlacedSeen(); closeDrawer(); render(); return; }
    if (d.notifEnable !== undefined) { requestDeviceNotifPermission(function (perm) { if (perm === 'granted') setStaffNotifPref('on'); render(); }); return; }
    if (d.notifOff !== undefined) { setStaffNotifPref('off'); render(); return; }
    if (d.notifOn !== undefined) { setStaffNotifPref('on'); render(); return; }
    if (d.close !== undefined) { closeDrawer(); return; }
    if (d.closeEdit !== undefined) { closeEditProduct(); return; }
    if (d.closeConfirm !== undefined) { closeConfirm(); return; }
    if (d.imgView) { openImgView(d.imgView); return; }
    if (d.closeImgview !== undefined) { closeImgView(); return; }
    if (d.removeImage !== undefined) {
      pendingImageFile = null;
      var hidden = $('editImage'); if (hidden) hidden.value = '';
      var fileInput = $('editImageFile'); if (fileInput) fileInput.value = '';
      var img = $('editImgPreview'); if (img) { img.style.display = 'none'; img.src = ''; }
      var ph = $('editImgPlaceholder'); if (ph) ph.style.display = '';
      t.style.display = 'none';
      return;
    }
    if (d.tab) { S.tab[S.view] = d.tab; render(); return; }
    if (d.agroup) { S.tab.accountsGroup = d.agroup; S.q = ''; render(); return; }
    if (d.menu) { e.stopPropagation(); openMenu(d.menu, t); return; }
    if (d.stockMenu) { e.stopPropagation(); openStockMenu(d.stockMenu, t); return; }
    if (d.staffMenu) { e.stopPropagation(); openStaffMenu(d.staffMenu, t); return; }
    if (d.open) { openDrawer(d.open); return; }
    if (d.shopApprove) { setShopStatus(d.shopApprove, 'approved'); return; }
    if (d.shopReject) {
      showConfirm({
        title: 'Reject this account?',
        confirmLabel: 'Reject',
        danger: true,
        onConfirm: function () { setShopStatus(d.shopReject, 'rejected'); }
      });
      return;
    }
    if (d.staffOn) { setStaffAccess(d.staffOn, true); return; }
    if (d.staffReject) {
      var reqToRemove = (S.accounts || []).filter(function (x) { return x.id === d.staffReject; })[0];
      showConfirm({
        title: 'Remove this sign-up request?',
        message: 'Remove the Admin sign-up request from ' + ((reqToRemove && (reqToRemove.name || reqToRemove.email)) || 'this account') + '? This deletes the request — they will not be given staff access, and they will need to sign up again if they want to request it later.',
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: function () { deleteSignupRequest(d.staffReject); }
      });
      return;
    }
    if (d.staffDecline) {
      var reqToDecline = (S.accounts || []).filter(function (x) { return x.id === d.staffDecline; })[0];
      showConfirm({
        title: 'Decline this request?',
        message: 'Decline staff access for ' + ((reqToDecline && (reqToDecline.name || reqToDecline.email)) || 'this account') + '? Their shop account and order history stay as they are. They can request again later.',
        confirmLabel: 'Decline',
        danger: true,
        onConfirm: function () { declineStaffRequest(d.staffDecline); }
      });
      return;
    }
    if (d.staffOff) {
      closeMenu();
      var staffToRemove = (S.accounts || []).filter(function (x) { return x.id === d.staffOff; })[0];
      showConfirm({
        title: 'Remove staff access?',
        message: 'Remove Admin Dashboard access from ' + ((staffToRemove && (staffToRemove.name || staffToRemove.email)) || 'this staff account') + '? They will no longer be able to sign in as staff.',
        confirmLabel: 'Remove access',
        danger: true,
        onConfirm: function () { setStaffAccess(d.staffOff, false); }
      });
      return;
    }
    if (d.saOn) { setSuperAdmin(d.saOn, true); return; }
    if (d.saOff) {
      showConfirm({
        title: 'Remove Super Admin?',
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: function () { setSuperAdmin(d.saOff, false); }
      });
      return;
    }
    if (d.newCustomer !== undefined) { openNewCustomer(); return; }
    if (d.deleteCustomer) { askDeleteCustomer(d.deleteCustomer); return; }
    if (d.restoreCustomer) { restoreCustomer(d.restoreCustomer); return; }
    if (d.purgeCustomer) { askPurgeCustomer(d.purgeCustomer); return; }
    if (d.custTab) { S.custTab = d.custTab; renderCustomers(); return; }
    if (d.editCustomer) { openEditCustomer(d.editCustomer); return; }
    if (d.closeCustomer !== undefined) { closeCustomerModal(); return; }
    if (d.saveCustomer) { saveCustomer(d.saveCustomer); return; }
    if (d.custPay !== undefined) { custShowPay(); return; }
    if (d.custEdit !== undefined) { custShowEdit(); return; }
    if (d.custBack !== undefined) { custBack(); return; }
    if (d.custPayConfirm !== undefined) { custConfirmPay(); return; }
    if (d.custReceipt !== undefined) {
      var cd = S.custDetail, pay = cd && (cd.payments || []).filter(function (x) { return String(x.id) === String(d.custReceipt); })[0];
      if (pay) openPrintable(docHtml(paymentReceiptModel(pay, cd.customer)));
      return;
    }
    if (d.openStaffname !== undefined) { openStaffNameModal(); return; }
    if (d.closeStaffname !== undefined) { closeStaffNameModal(); return; }
    if (d.saveStaffname !== undefined) { saveStaffName(); return; }
    if (d.add) { adjustStock(d.add, 'set'); return; }
    if (d.subtract) { closeMenu(); adjustStock(d.subtract, 'subtract'); return; }
    if (d.set) { closeMenu(); adjustStock(d.set, 'set'); return; }
    if (d.edit) { closeMenu(); openEditProduct(d.edit); return; }
    if (d.addProduct !== undefined) { openAddProduct(); return; }
    if (d.saveProduct) { saveProduct(d.saveProduct); return; }
    if (d.deleteProduct) { deleteProduct(d.deleteProduct); return; }
    if (d.next) {
      closeMenu(); o = findOrder(d.next); var i = FLOW.indexOf(o.status);
      t.disabled = true;
      apply(o.id, FLOW[i + 1], null, '#' + o.id + ' → ' + LABEL[FLOW[i + 1]]);
      return;
    }
    if (d.cancel) {
      closeMenu(); o = findOrder(d.cancel);
      var isWalkin = o.orderType === 'walkin';
      showConfirm({
        title: (isWalkin ? 'Void sale ' : 'Cancel order ') + o.id + '?',
        message: isWalkin
          ? 'Walk-in sale: the stock will be returned. No refund will be queued. Mark it refunded manually if you already gave money back.'
          : 'The customer paid with a slip, so the refund is marked as pending.',
        confirmLabel: isWalkin ? 'Void sale' : 'Cancel order',
        danger: true,
        onConfirm: function () {
          apply(o.id, 'cancelled', { refundStatus: isWalkin ? 'none' : 'pending' },
            isWalkin ? 'Walk-in sale voided' : 'Order cancelled — refund pending');
        }
      });
      return;
    }
    if (d.refunded) { closeMenu(); apply(d.refunded, 'cancelled', { refundStatus: 'refunded' }, 'Marked as refunded'); return; }
    if (d.fee) {
      o = findOrder(d.fee);
      var v = $('fee-' + o.id).value;
      if (v === '' || Number(v) < 0) { toast('Enter the delivery fee in MVR.', true); return; }
      apply(o.id, o.status, { deliveryFee: Number(v) }, 'Delivery fee saved');
      return;
    }
    if (d.note) { o = findOrder(d.note); apply(o.id, o.status, { note: $('note-' + o.id).value }, 'Note saved'); return; }
    if (d.reprint) { closeMenu(); o = findOrder(d.reprint); if (o) openPrintable(buildWalkinSlipHtml(o)); return; }
    if (d.slip) {
      closeMenu(); o = findOrder(d.slip);
      if (!o || !o.slipPath) { toast('This order has no payment slip.', true); return; }
      var w = window.open('', '_blank'); // open first so mobile browsers don't block the popup
      MaziAPI.getSlipUrl(o.slipPath).then(function (url) {
        if (w) w.location.href = url; else window.location.href = url;
      }).catch(function (err) { if (w) w.close(); toast(err.message || 'Could not open the slip.', true); });
    }
  }

  function boot() {
    $('loginBtn').addEventListener('click', login);
    if (lkLeft() > 0) lkStart();
    $('googleBtn').addEventListener('click', loginWithGoogle);
    $('stMainBtn').addEventListener('click', function () {
      if (W.offer) sendStaffRequest();
      else if (W.done) { if (W.auto) { clearTimeout(W.auto); W.auto = null; } openApprovedDashboard(); }
      else checkWaiting(true);
    });
    $('stOutBtn').addEventListener('click', function () {
      stopWaiting(); leaveOfferMode();
      MaziAPI.logout().catch(function () {}).then(function () { showLogin(); });
    });
    // coming back to the tab: check right away instead of waiting for the next tick
    document.addEventListener('visibilitychange', function () { if (!document.hidden && W.timer) checkWaiting(false); });
    function resetForgotPane() {
      $('forgotSent').classList.add('hidden');
      $('forgotRequest').style.display = '';
      $('sendResetBtn').disabled = false;
      $('resetLabel').textContent = 'Send Reset Link';
      setMsg('', false, 'forgotErr');
    }
    function goToSignin() {
      $('forgotPane').classList.add('hidden');
      $('signinPane').classList.remove('hidden');
      resetForgotPane();
    }
    function startResendCooldown(btn, label) {
      var n = 60; btn.disabled = true; label.textContent = 'Try again in ' + n + 's';
      var t = setInterval(function () {
        n--; if (n <= 0) { clearInterval(t); btn.disabled = false; label.textContent = 'Resend link'; }
        else label.textContent = 'Try again in ' + n + 's';
      }, 1000);
    }
    function doSendReset(email, btn, label, onDone) {
      MaziAPI.sendPasswordReset(email).then(function () {
        $('forgotRequest').style.display = 'none';
        $('forgotSent').classList.remove('hidden');
        startResendCooldown($('resendBtn'), $('resendLabel'));
      }).catch(function (e) {
        setMsg(e.message || 'Could not send the reset link.', false, 'forgotErr');
      }).then(function () { if (onDone) onDone(); });
    }
    $('forgotBtn').addEventListener('click', function () {
      resetForgotPane();
      $('forgotEmail').value = $('email').value.trim();
      $('signinPane').classList.add('hidden');
      $('forgotPane').classList.remove('hidden');
      setTimeout(function () { $('forgotEmail').focus(); }, 50);
    });
    $('backToSigninBtn1').addEventListener('click', goToSignin);
    $('backToSigninBtn2').addEventListener('click', goToSignin);
    $('forgotEmail').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('sendResetBtn').click(); });
    $('sendResetBtn').addEventListener('click', function () {
      var email = $('forgotEmail').value.trim(), btn = this;
      if (!/^\S+@\S+\.\S+$/.test(email)) { setMsg('Please enter a valid email address.', false, 'forgotErr'); $('forgotEmail').focus(); return; }
      btn.disabled = true; setMsg('', false, 'forgotErr');
      doSendReset(email, btn, $('resetLabel'), function () { btn.disabled = false; });
    });
    $('resendBtn').addEventListener('click', function () {
      var email = $('forgotEmail').value.trim();
      doSendReset(email, this, $('resendLabel'));
    });

    /* ---- Sign In <-> Create Account (sliding panel) ---- */
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () { setAuthMode(b.dataset.mode); });
    });
    $('signupBtn').addEventListener('click', signup);
    ['suName', 'suEmail', 'suPassword'].forEach(function (id) {
      $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') signup(); });
    });

    /* ---- About us / Contact / Help ---- */
    Array.prototype.forEach.call(document.querySelectorAll('[data-info]'), function (b) {
      b.addEventListener('click', function () { openInfo(b.dataset.info); });
    });
    $('infoClose').addEventListener('click', closeInfo);
    $('infoModal').addEventListener('click', function (e) { if (e.target === this) closeInfo(); });
    $('editModal').addEventListener('click', function (e) { if (e.target === this) closeEditProduct(); });
    $('confirmModal').addEventListener('click', function (e) { if (e.target === this) closeConfirm(); });
    $('editModal').addEventListener('change', function (e) {
      if (e.target && e.target.id === 'editImageFile') handleImageFileChange(e.target);
    });
    $('imgViewModal').addEventListener('click', function (e) { if (e.target === this) closeImgView(); });
    bindImgViewZoom();
    ['email', 'password'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); }); });
    $('logoutBtn').addEventListener('click', requestLogout);
    (function () {
      var side = $('sideNav'), logoBtn = $('sideLogoBtn'), expandBtn = $('sideExpandBtn');
      if (!side || !logoBtn || !expandBtn) return;
      var collapse = function () { side.classList.add('collapsed'); logoBtn.title = 'Expand sidebar'; };
      var expand = function () { side.classList.remove('collapsed'); logoBtn.title = 'Collapse sidebar'; };
      logoBtn.addEventListener('click', function () { side.classList.contains('collapsed') ? expand() : collapse(); });
      logoBtn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logoBtn.click(); } });
      expandBtn.addEventListener('click', function (e) { e.stopPropagation(); expand(); });
    })();
    var refreshBtnEl = $('refreshBtn');
    if (refreshBtnEl) refreshBtnEl.addEventListener('click', function () {
      var b = this;
      if (b.disabled) return;
      b.disabled = true; b.classList.add('spin');
      var t0 = Date.now();
      busy = false; // a manual refresh always runs, even if a background poll is mid-flight
      loadAll().then(function () {
        if (lastLoadFailed) return; // loadAll already showed the error
        toast('Refreshed');
      }).then(function () {
        // keep the icon spinning at least one full turn so the click always feels registered
        setTimeout(function () { b.classList.remove('spin'); b.disabled = false; }, Math.max(0, 600 - (Date.now() - t0)));
      });
    });
    $('bell').addEventListener('click', function (e) { e.stopPropagation(); toggleNotif(this); });
    $('meBtn').addEventListener('click', function (e) { e.stopPropagation(); if (menuEl) { closeMenu(); return; } openProfileMenu(this); });
    document.addEventListener('click', onSettingsClick);
    $('panel').addEventListener('change', onSettingsChange);
    $('panel').addEventListener('input', function (e) { if (S.view === 'settings' && e.target.closest && e.target.closest('[data-st-field]')) settingsDirty = true; });
    $('search').addEventListener('input', function (e) { S.q = e.target.value; render(); });
    $('panel').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id && e.target.id.indexOf('qty-') === 0) { adjustStock(e.target.id.slice(4), 'set'); return; }
      // keyboard activation for the clickable dashboard stat cards / feed rows
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[role="button"]')) { e.preventDefault(); onClick(e); }
    });
    document.addEventListener('click', function (e) { if (menuEl && !e.target.closest('.menu') && !e.target.closest('[data-menu]') && !e.target.closest('[data-stock-menu]') && !e.target.closest('[data-staff-menu]')) closeMenu(); });
    document.addEventListener('click', function (e) { if (notifEl && !e.target.closest('.notif-dd') && !e.target.closest('#bell')) closeNotif(); });
    ['nav', 'navBottom', 'panel', 'drawer', 'editModal', 'confirmModal', 'imgViewModal', 'staffNameModal', 'custModal'].forEach(function (id) { $(id).addEventListener('click', onClick); });
    $('custModal').addEventListener('click', function (e) { if (e.target === this) closeCustomerModal(); });
    $('staffNameModal').addEventListener('click', function (e) { if (e.target === this) closeStaffNameModal(); });
    var sni = $('staffNameInput'); if (sni) sni.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveStaffName(); });
    document.addEventListener('click', function (e) { if (menuEl && menuEl.contains(e.target)) onClick(e); }, true);
    document.addEventListener('click', function (e) { if (notifEl && notifEl.contains(e.target)) onClick(e); }, true);
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeMenu(); closeNotif(); closeInfo(); closeEditProduct(); closeStaffNameModal(); } });
    window.addEventListener('scroll', function () { closeMenu(); closeNotif(); }, true);
    $('panel').addEventListener('click', onPosClick);
    $('panel').addEventListener('input', onPosInput);
    $('panel').addEventListener('change', onPosChange);
    restore();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
