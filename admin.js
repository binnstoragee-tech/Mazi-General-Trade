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
  var POLL_MS = 30000;
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
    accounts: [], accountsError: null,
    productsError: null, drawerId: null, profile: null, editingId: null
  };
  var knownIds = null, pollTimer = null, busy = false, menuEl = null, notifEl = null, pendingImageFile = null, lastPanelView = null;

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
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>'
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
  function showLogin(msg) {
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    setMsg(msg || '');
    stopPolling(); stopProfilesRealtime(); closeDrawer(); closeMenu();
  }
  function showApp(profile) {
    S.profile = profile;
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    var who = profile.email || profile.name || 'Staff';
    $('who').textContent = who;
    $('meName').textContent = displayName(profile);
    $('meAv').textContent = initials(displayName(profile));
    loadAll(true);
    startPolling();
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
        S.profile = Object.assign({}, S.profile, payload.new);
        $('meName').textContent = displayName(S.profile);
        $('meAv').textContent = initials(displayName(S.profile));
      }
      if (S.view === 'staffaccess' || S.view === 'accounts') loadAccounts().then(render);
    });
  }
  function stopProfilesRealtime() {
    if (stopProfilesRealtimeFn) { stopProfilesRealtimeFn(); stopProfilesRealtimeFn = null; }
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
  function isSuperAdmin(p) { return !!(p && p.is_super_admin); }
  // Dashboard-only name: staff_name if the staff member set one, else falls back
  // to the shared profile name / email. Kept separate from the customer-facing
  // "name" (First Name) field so editing Personal Details on the shop side never
  // changes what shows here — see 22_super_admin.sql.
  function displayName(p) { return (p && (p.staff_name || p.name)) || ((p && p.email) || '').split('@')[0] || 'Staff'; }

  function login() {
    var email = $('email').value.trim(), pw = $('password').value;
    if (!email || !pw) { setMsg('Enter your email and password.'); return; }
    if (email.indexOf('@') < 0) { setMsg('Sign in with your e-mail address (like name@example.com), not a username.'); $('email').focus(); return; }
    var btn = $('loginBtn');
    btn.disabled = true; $('goLabel').textContent = '…'; setMsg('');
    MaziAPI.signInWithPassword(email, pw).then(function (res) {
      if (!isStaff(res.profile)) {
        return MaziAPI.logout().catch(function () {}).then(function () { showLogin('This account is not a staff account.'); });
      }
      showApp(res.profile);
    }).catch(function (e) {
      setMsg(e.message || 'Could not sign in.');
    }).then(function () { btn.disabled = false; $('goLabel').textContent = 'Sign In'; });
  }
  function restore() {
    if (!window.MaziAPI) { showLogin('Could not load the app. Refresh the page.'); return; }
    MaziAPI.getSession().then(function (s) {
      if (!s) return showLogin();
      return MaziAPI.getProfile().then(function (p) { if (isStaff(p)) showApp(p); else showLogin(); });
    }).catch(function () { showLogin(); });
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
    var after = 'Your account can open this dashboard only after a Super Admin gives it staff access.';
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
      err(e.message || 'Could not create the account.');
    }).then(function () { btn.disabled = false; $('suLabel').textContent = 'Sign Up'; });
  }
  var INFO = {
    about: '<h3>About us</h3><p>MAZI General Trade is a grocery and convenience wholesaler based in Male\', Republic of Maldives, delivering across Male\' and beyond.</p><p>This portal is for our staff to manage orders and stock.</p>',
    contact: '<h3>Contact</h3><p>Phone / Viber: <a href="tel:+9609291600">+960 929 1600</a></p><p>Email: <a href="mailto:info@mazitrading.mv">info@mazitrading.mv</a></p><p>Male\', Republic of Maldives</p>',
    help: '<h3>Help</h3><ol><li>Sign in with the email and password of your staff account, then press <b>Go</b>.</li><li>Forgot your password? Type your email, then press <b>Forgot Password</b> — we send you a reset link.</li><li>New here? Press <b>Create New Account</b>, confirm your email, then ask a Super Admin to give your account staff access (Staff Access page).</li></ol><p>Shopping as a customer? <a href="index.html">Go to the MAZI shop</a>.</p><p>Still stuck? Write to <a href="mailto:info@mazitrading.mv">info@mazitrading.mv</a>.</p>'
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
  function loadAll(initial) {
    if (busy) return Promise.resolve();
    busy = true;
    var jobs = [loadOrders(initial)];
    if (S.view === 'stock' || S.view === 'dashboard' || initial) jobs.push(loadStock());
    if (isSuperAdmin(S.profile) && (S.view === 'accounts' || initial)) jobs.push(loadShops());
    if (isSuperAdmin(S.profile) && (S.view === 'accounts' || S.view === 'staffaccess' || initial)) jobs.push(loadAccounts());
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
    }).then(function () { busy = false; render(); });
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(function () { if (!document.hidden) loadAll(); }, POLL_MS); }
  function stopPolling() { clearInterval(pollTimer); }
  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext, c = new C(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); setTimeout(function () { o.stop(); c.close(); }, 180);
    } catch (e) {}
  }

  /* ============ helpers ============ */
  function findOrder(id) { return S.orders.filter(function (o) { return o.id === id; })[0]; }
  function findProduct(id) { return S.products.filter(function (p) { return p.id === id; })[0]; }
  function typeOf(o) { return TYPE_LABEL[o.customer && o.customer.method] || '—'; }
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
  function statusHtml(o) { return '<span class="dot d-' + o.status + '"></span><span class="t-' + o.status + '">' + LABEL[o.status] + '</span>'; }

  /* ============ render ============ */
  function render() {
    // nav + counts
    var active = S.orders.filter(function (o) { return ACTIVE.indexOf(o.status) >= 0; }).length;
    var fresh = S.orders.filter(function (o) { return o.status === 'placed' && !getSeenPlaced()[o.id]; }).length;
    Array.prototype.forEach.call(document.querySelectorAll('#nav [data-view]'), function (b) { b.classList.toggle('active', b.dataset.view === S.view); });
    var nc = $('navCnt'); nc.textContent = badgeText(active); nc.classList.toggle('hidden', !active);
    var pend = S.shops.filter(function (x) { return x.status === 'pending'; }).length;
    var sc = $('navShopCnt'); if (sc) { sc.textContent = badgeText(pend); sc.classList.toggle('hidden', !pend); }
    var bn = $('bellN'); bn.textContent = badgeText(fresh); bn.classList.toggle('hidden', !fresh);
    var acBtn = $('navAccountsBtn'); if (acBtn) acBtn.classList.toggle('hidden', !isSuperAdmin(S.profile));
    var saBtn = $('navStaffAccessBtn'); if (saBtn) saBtn.classList.toggle('hidden', !isSuperAdmin(S.profile));
    $('search').placeholder = S.view === 'stock' ? 'Search products' : (S.view === 'accounts' ?
      (S.tab.accountsGroup === 'customer' ? 'Search name or email' : 'Search account, owner or mobile') :
      (S.view === 'staffaccess' ? 'Search name or email' : 'Search order, name or mobile'));
    if ($('search').value !== S.q) $('search').value = S.q;
    var searchWrap = document.querySelector('.search');
    if (searchWrap) searchWrap.classList.toggle('hidden', S.view === 'dashboard');

    // Only replay the rise-up / chart-draw animations when we actually land on
    // a view for the first time (switching tabs). A background poll re-renders
    // the same view every 30s — without this it would replay every time and
    // look like a laggy double-animation.
    var freshMount = S.view !== lastPanelView;
    lastPanelView = S.view;
    $('panel').classList.toggle('no-anim', !freshMount);

    if (S.view === 'dashboard') renderDashboard(freshMount);
    else if (S.view === 'stock') renderStock();
    else if (S.view === 'accounts') renderAccounts();
    else if (S.view === 'staffaccess') renderStaffAccess();
    else renderOrders();
    if (S.drawerId) refreshDrawer();
  }

  /* ---------- dashboard ---------- */
  function pctDelta(cur, prev) {
    if (!prev) return '<span class="dstat-delta ' + (cur ? 'up' : 'flat') + '">' + (cur ? 'New today' : 'No change') + '</span>';
    var p = Math.round(((cur - prev) / prev) * 100);
    if (p === 0) return '<span class="dstat-delta flat">Same as yesterday</span>';
    return '<span class="dstat-delta ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '▲' : '▼') + ' ' + Math.abs(p) + '% vs yesterday</span>';
  }
  function renderDashboard(freshMount) {
    var orders = S.orders, today = ymd(Date.now()), yest = ymd(Date.now() - 86400000);
    // Orders still awaiting staff acceptance ('placed') are excluded from dashboard
    // stats, revenue and the activity feed — they only appear on the Orders page
    // until accepted (moved to 'processing').
    var live = orders.filter(function (o) { return o.status !== 'cancelled' && o.status !== 'placed'; });
    var activeCount = orders.filter(function (o) { return o.status === 'processing' || o.status === 'delivery'; }).length;
    var freshCount = orders.filter(function (o) { return o.status === 'placed' && !getSeenPlaced()[o.id]; }).length;
    var todayOrders = live.filter(function (o) { return ymd(o.placedAt) === today; });
    var yestOrders = live.filter(function (o) { return ymd(o.placedAt) === yest; });
    var todayRev = todayOrders.reduce(function (s, o) { return s + o.total; }, 0);
    var yestRev = yestOrders.reduce(function (s, o) { return s + o.total; }, 0);
    var pendingRefunds = orders.filter(function (o) { return o.status === 'cancelled' && o.refundStatus === 'pending'; }).length;
    var lowStock = 0, outStock = 0;
    (S.products || []).forEach(function (p) { var k = stockStatus(p).key; if (k === 'low') lowStock++; if (k === 'out') outStock++; });
    var lowTotal = lowStock + outStock;

    var cards = [
      { ico: ICON.clock, cls: 'blue', label: 'Active Orders', val: num(activeCount), delta: '<span class="dstat-delta flat">' + num(todayOrders.length) + ' placed today</span>' },
      { ico: ICON.cash, cls: '', label: "Today's Revenue", val: esc(mvr(todayRev)), delta: pctDelta(todayRev, yestRev) },
      { ico: ICON.bag, cls: 'purple', label: 'New Orders Today', val: num(todayOrders.length), delta: pctDelta(todayOrders.length, yestOrders.length) },
      { ico: ICON.alert, cls: 'amber', label: 'Low Stock Items', val: num(lowTotal), delta: '<span class="dstat-delta ' + (lowTotal ? 'down' : 'flat') + '">' + (lowTotal ? 'Needs restock' : 'All good') + '</span>' },
      { ico: ICON.undo, cls: 'red', label: 'Pending Refunds', val: num(pendingRefunds), delta: '<span class="dstat-delta ' + (pendingRefunds ? 'down' : 'flat') + '">' + (pendingRefunds ? 'Awaiting refund' : 'None pending') + '</span>' }
    ];
    var hr = new Date().getHours();
    var greetWord = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
    var firstName = displayName(S.profile).split(' ')[0];
    var dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    var h = '<h1>Good ' + greetWord + (firstName ? ', ' + esc(firstName) : '') + '</h1>' +
      '<p class="lead">' + esc(dateStr) + ' · Store overview &amp; today\'s activity.</p>';
    h += '<div class="dstats">' + cards.map(function (c) {
      return '<div class="dstat"><div class="dstat-top"><small>' + c.label + '</small><span class="dstat-ico ' + c.cls + '">' + c.ico + '</span></div><b>' + c.val + '</b>' + c.delta + '</div>';
    }).join('') + '</div>';

    h += '<div class="dgrid"><div>';

    var qa = [
      { g: 'live:all', ico: ICON.bolt, t: 'Orders', s: num(activeCount) + ' need action' },
      { g: 'history:all', ico: ICON.receipt, t: 'Order History', s: num(orders.length) + ' total orders' },
      { g: 'stock:all', ico: ICON.box, t: 'Manage Stock', s: num((S.products || []).length) + ' products' },
      { g: 'stock:low', ico: ICON.alert, t: 'Low Stock', s: num(lowTotal) + ' need restock' }
    ];
    h += '<div class="box"><h3>Quick Actions</h3><div class="qa-grid">' + qa.map(function (a) {
      return '<button type="button" class="qa-card" data-goto="' + a.g + '"><span class="qa-ico">' + a.ico + '</span><b>' + a.t + '</b><span>' + a.s + '</span></button>';
    }).join('') + '</div></div>';

    h += weeklyChartHtml(live);
    h += '</div><div>';
    h += activityFeedHtml();
    h += notifPanelHtml(lowTotal, pendingRefunds, freshCount);
    h += '</div></div>';

    $('panel').innerHTML = h;
    animateWeeklyChart(freshMount);
  }

  function animateWeeklyChart(freshMount) {
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
        line.style.transition = 'stroke-dashoffset 3s cubic-bezier(.4,0,.2,1)';
        line.style.strokeDashoffset = '0';
        if (area) { area.style.transition = 'opacity 1.8s ease-out 1s'; area.style.opacity = '1'; }
        if (dot) { dot.style.transition = 'opacity .5s ease-out 2.7s'; dot.style.opacity = '1'; }
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
  function weeklyChartHtml(live) {
    var days = [], i;
    for (i = 6; i >= 0; i--) days.push(ymd(Date.now() - i * 86400000));
    var revByDay = {}; days.forEach(function (d) { revByDay[d] = 0; });
    live.forEach(function (o) { var d = ymd(o.placedAt); if (revByDay[d] != null) revByDay[d] += o.total; });
    var vals = days.map(function (d) { return revByDay[d]; });
    var max = Math.max.apply(null, vals.concat([1]));
    var W = 620, H = 150, pad = 8, padTop = 24;
    var P = vals.map(function (v, idx) {
      return { x: pad + idx * ((W - pad * 2) / (vals.length - 1)), y: H - pad - (v / max) * (H - pad - padTop) };
    });
    var line = smoothPath(P);
    var area = line + ' L' + (W - pad) + ',' + (H - pad) + ' L' + pad + ',' + (H - pad) + ' Z';
    var last = P[P.length - 1];
    var thisWeek = vals.reduce(function (s, v) { return s + v; }, 0);
    var thisWeekOrders = live.filter(function (o) { return days.indexOf(ymd(o.placedAt)) >= 0; }).length;
    var prevDays = []; for (i = 13; i >= 7; i--) prevDays.push(ymd(Date.now() - i * 86400000));
    var prevWeek = 0; live.forEach(function (o) { var d = ymd(o.placedAt); if (prevDays.indexOf(d) >= 0) prevWeek += o.total; });
    var wchg = prevWeek ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null;
    var dLabels = days.map(function (d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }); });

    return '<div class="box chart-wrap"><h3>Weekly Performance</h3>' +
      '<div class="chart-legend"><span><i style="background:var(--green-600)"></i>Revenue · last 7 days</span></div>' +
      '<div class="chart-plot">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:150px;display:block;overflow:visible">' +
        '<defs><linearGradient id="dChartFill" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="var(--green-500)" stop-opacity=".28"></stop>' +
          '<stop offset="100%" stop-color="var(--green-500)" stop-opacity="0"></stop>' +
        '</linearGradient></defs>' +
        '<path d="' + area + '" fill="url(#dChartFill)" stroke="none"></path>' +
        '<path class="chart-line" d="' + line + '" fill="none" stroke="var(--green-600)" stroke-width="2.6" stroke-linecap="round"></path>' +
      '</svg>' +
      '<span class="chart-dot" style="left:' + (last.x / W * 100).toFixed(2) + '%;top:' + (last.y / H * 100).toFixed(2) + '%"></span>' +
      '</div>' +
      '<div class="chart-days">' + dLabels.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>' +
      '<div class="snap"><div><small>This Week Revenue</small><b>' + esc(mvr(thisWeek)) + '</b></div>' +
      '<div><small>This Week Orders</small><b>' + num(thisWeekOrders) + '</b></div>' +
      (wchg == null ? '' : '<div><small>vs Last Week</small><b>' + (wchg >= 0 ? '+' : '') + wchg + '%</b></div>') +
      '</div></div>';
  }

  function activityFeedHtml() {
    var items = [];
    S.orders.filter(function (o) { return o.status !== 'placed'; }).slice().sort(function (a, b) { return b.placedAt - a.placedAt; }).slice(0, 5).forEach(function (o) {
      var c = o.customer || {};
      items.push({ t: o.placedAt, ico: ICON.bag, cls: 'amber', text: '<b>' + esc(c.name || 'Customer') + '</b> placed order #' + esc(o.id), sub: esc(mvr(o.total)) + ' · ' + LABEL[o.status] });
    });
    var REASON = { restock: 'Restocked', set: 'Stock set', order: 'Sold', cancel: 'Returned' };
    var REASON_CLS = { restock: 'blue', set: 'purple', order: 'green', cancel: 'red' };
    (S.log || []).slice(0, 5).forEach(function (l) {
      var name = (l.products && l.products.name) || l.product_id;
      items.push({ t: new Date(l.created_at).getTime(), ico: ICON.box, cls: REASON_CLS[l.reason] || '', text: esc(REASON[l.reason] || l.reason) + ' <b>' + esc(name) + '</b>', sub: (l.change >= 0 ? '+' : '') + l.change + ' → ' + num(l.qty_after) });
    });
    items.sort(function (a, b) { return b.t - a.t; });
    items = items.slice(0, 6);
    return '<div class="box"><h3>Activity Feed</h3><div class="feed">' + (items.length ? items.map(function (it) {
      return '<div class="feed-row"><span class="feed-ico ' + (it.cls || '') + '">' + it.ico + '</span><div><p>' + it.text + '</p><small>' + it.sub + ' · ' + esc(ago(it.t)) + '</small></div></div>';
    }).join('') : '<div class="empty" style="padding:14px">Nothing yet.</div>') + '</div></div>';
  }

  function notifPanelHtml(lowTotal, pendingRefunds, freshCount) {
    var alerts = [];
    if (freshCount) alerts.push({ cls: '', ico: ICON.bag, t: freshCount + ' new order' + (freshCount > 1 ? 's' : '') + ' need action', d: 'Waiting to be started.', g: 'live:placed' });
    if (lowTotal) alerts.push({ cls: 'amber', ico: ICON.alert, t: lowTotal + ' product' + (lowTotal > 1 ? 's are' : ' is') + ' low on stock', d: 'Restock soon to avoid running out.', g: 'stock:low' });
    if (pendingRefunds) alerts.push({ cls: 'red', ico: ICON.undo, t: pendingRefunds + ' refund' + (pendingRefunds > 1 ? 's' : '') + ' pending', d: 'Customers are waiting to be refunded.', g: 'history:cancelled' });
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
      notifBit = '<span>Get notified here when a new order comes in.</span><button type="button" class="btn sm" data-notif-enable>Enable alerts</button>';
    }
    return '<div class="box" style="margin-top:16px"><h3>Notifications</h3><div class="alerts">' + body + '</div><div class="notif-card">' + notifBit + '</div></div>';
  }

  /* ---------- orders ---------- */
  function baseOrders() {
    var list = S.orders;
    if (S.view === 'live') list = list.filter(function (o) { return ACTIVE.indexOf(o.status) >= 0; });
    var q = S.q.trim().toLowerCase();
    if (q) list = list.filter(function (o) {
      var c = o.customer || {};
      return (o.id + ' ' + (c.name || '') + ' ' + (c.mobile || '')).toLowerCase().indexOf(q) >= 0;
    });
    return list;
  }
  function tabList(list) {
    var tab = S.tab[S.view];
    if (S.view === 'live') return tab === 'all' ? list : list.filter(function (o) { return o.status === tab; });
    if (tab === 'completed') return list.filter(function (o) { return o.status === 'delivered'; });
    if (tab === 'cancelled') return list.filter(function (o) { return o.status === 'cancelled'; });
    if (tab === 'placed' || tab === 'processing' || tab === 'delivery') return list.filter(function (o) { return o.status === tab; });
    return list;
  }
  function cnt(list, st) { return list.filter(function (o) { return o.status === st; }).length; }

  function renderOrders() {
    var base = baseOrders(), tab = S.tab[S.view], h = '';
    var defs, title, lead;
    if (S.view === 'live') {
      title = 'Orders'; lead = 'Orders that still need action. Updates every 30 seconds.';
      defs = [['all', 'All', base.length], ['placed', 'New', cnt(base, 'placed')], ['processing', 'Processing', cnt(base, 'processing')], ['delivery', 'Out for delivery', cnt(base, 'delivery')]];
    } else {
      title = 'Order History'; lead = 'Every order, newest first.';
      defs = [['all', 'All Order', base.length], ['placed', 'New', cnt(base, 'placed')], ['processing', 'Processing', cnt(base, 'processing')], ['delivery', 'Out for delivery', cnt(base, 'delivery')], ['completed', 'Completed', cnt(base, 'delivered')], ['cancelled', 'Cancelled', cnt(base, 'cancelled')], ['summary', 'Summary', null]];
    }
    h += '<h1>' + title + '</h1><p class="lead">' + lead + '</p><div class="bar"><div class="tabs">' +
      defs.map(function (d) {
        return '<button class="tab' + (tab === d[0] ? ' active' : '') + '" data-tab="' + d[0] + '">' + d[1] + (d[2] != null ? '<span class="n">' + d[2] + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    h += '</div>';

    if (S.view === 'history' && tab === 'summary') {
      h += summaryHtml(base);
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
      '<div class="c-id">#' + esc(o.id) + '</div>' +
      '<div class="c-name"><span class="av">' + esc(initials(c.name)) + '</span><span><b>' + esc(c.name) + '</b><small>' + esc(c.mobile) + ' · ' + esc(typeOf(o)) + '</small></span></div>' +
      '<div class="c-pay"><span class="pill">Slip</span> ' + esc(o.currency) + '</div>' +
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
      byProd[k].qty += it.qty; byProd[k].amount += it.qty * it.price;
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
      }).join('') : '<div class="empty" style="padding:16px">No sales in this range.</div>') + '</div>';
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
    if (p.stock_qty <= 5) return { key: 'low', label: 'Low stock', cls: 'amber' };
    return { key: 'in', label: 'In stock', cls: '' };
  }
  function renderStock() {
    var h = '<div class="bar" style="align-items:flex-start"><div><h1>Stock</h1><p class="lead">Type the current count for a product and hit Update — that becomes its stock. Orders take units off automatically, and the shop shows In / Low / Out of stock by itself (Low = 5 or fewer).</p></div>' +
      '<button type="button" class="btn sm" data-add-product>+ Add product</button></div>';
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
          '<div class="s-name">' + thumb + '<span><b>' + esc(p.name) + '</b><small>' + pid + ' · ' + esc(p.pack || '') + ' ' + esc(p.unit || '') + '</small></span></div>' +
          '<div class="s-status"><span class="pill ' + st.cls + '">' + st.label + '</span>' + (p.active ? '' : ' <span class="pill gray">Hidden</span>') + '</div>' +
          '<div class="s-qty">' + (p.stock_qty == null ? '—' : num(p.stock_qty) + ' <small>units</small>') + '</div>' +
          '<div class="s-price">' + (p.price > 0 ? esc(mvr(p.price)) : '<span class="pill gray">No price</span>') + '</div>' +
          '<div class="s-add">' +
            '<input type="number" inputmode="numeric" min="0" step="1" placeholder="' + (p.stock_qty == null ? 'Qty' : p.stock_qty) + '" id="qty-' + pid + '">' +
            '<button class="btn sm" data-add="' + pid + '" title="Sets stock to whatever you type here">Update</button>' +
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
    var groupDefs = [['business', 'Business Account'], ['customer', 'Customer Account']];
    h += '<div class="bar"><div class="tabs">' + groupDefs.map(function (d) {
      return '<button class="tab' + (group === d[0] ? ' active' : '') + '" data-agroup="' + d[0] + '">' + d[1] + '</button>';
    }).join('') + '</div></div>';

    h += group === 'customer' ? renderCustomerAccountsBody() : renderBusinessAccountsBody();
    $('panel').innerHTML = h;
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
        if (x.status !== 'approved') btns += '<button class="btn sm" data-shop-approve="' + esc(x.id) + '">Approve</button> ';
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
    var h = '<p class="lead" style="margin-top:-4px">Everyone who registered on the customer store front. Reference only — these can never be given dashboard access.</p>';
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
        '<span class="pill" title="Registered on the customer store front — cannot be given staff access">Store front account</span></div>';
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
    var h = '<h1>Staff Access</h1><p class="lead">Give or remove dashboard access. Only a Super Admin can change this — new admins go through here instead of the SQL Editor. Only accounts created through the admin Sign Up form appear here; customer store front accounts are managed separately under Accounts → Customer Account.</p>';
    if (S.accountsError) {
      var msg = String(S.accountsError.message || '');
      if (/admin_list_accounts|does not exist|schema cache/i.test(msg)) {
        h += '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>22_super_admin.sql</code> then <code>23_admin_signup_source.sql</code>, then press Refresh.</div>';
      } else {
        h += '<div class="note-banner">Could not load accounts: ' + esc(msg) + '</div>';
      }
      $('panel').innerHTML = h; return;
    }
    // Staff Access only ever deals with accounts created through the admin
    // Sign Up form — storefront shoppers live under Accounts -> Customer
    // Account instead, so they never get mixed in here.
    var L = (S.accounts || []).filter(function (x) { return x.signup_source === 'admin'; }), c = { staff: 0, admin: 0 };
    L.forEach(function (x) { if (x.is_admin) c.staff++; else c.admin++; });
    var tab = S.tab.staffaccess;
    var defs = [['all', 'All', L.length], ['staff', 'Staff', c.staff], ['admin', 'Admin sign-ups', c.admin]];
    h += '<div class="bar"><div class="tabs">' + defs.map(function (d) {
      return '<button class="tab' + (tab === d[0] ? ' active' : '') + '" data-tab="' + d[0] + '">' + d[1] + '<span class="n">' + d[2] + '</span></button>';
    }).join('') + '</div></div>';

    var q = S.q.trim().toLowerCase();
    var list = L.filter(function (x) {
      if (tab === 'staff' && !x.is_admin) return false;
      if (tab === 'admin' && x.is_admin) return false;
      return !q || [x.name, x.staff_name, x.email, x.mobile].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { h += '<div class="empty">No accounts match.</div>'; }
    else {
      h += list.map(function (x) {
        var self = x.id === (S.profile && S.profile.id);
        var lines = [
          x.email || '', x.mobile || '',
          'Added ' + ago(new Date(x.created_at).getTime())
        ].filter(Boolean);
        var btns = '';
        if (x.is_admin) { if (!self) btns += '<button class="btn danger-soft sm" data-staff-off="' + esc(x.id) + '">Remove staff access</button> '; }
        else btns += '<button class="btn sm" data-staff-on="' + esc(x.id) + '">Grant staff access</button> ';
        if (x.is_super_admin) { if (!self) btns += '<button class="btn danger-soft sm" data-sa-off="' + esc(x.id) + '">Remove Super Admin</button>'; }
        else if (x.is_admin) btns += '<button class="btn ghost sm" data-sa-on="' + esc(x.id) + '">Make Super Admin</button>';
        return '<div class="box" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">' +
          '<div><b>' + esc(x.staff_name || x.name || (x.email || '').split('@')[0] || 'Unnamed') + '</b> ' +
          (x.is_super_admin ? '<span class="pill">Super Admin</span>' : (x.is_admin ? '<span class="pill">Staff</span>' : '')) +
          (self ? ' <span class="pill amber">You</span>' : '') +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--ink-soft);line-height:1.6">' + lines.map(esc).join('<br>') + '</div></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btns + '</div></div>';
      }).join('');
    }
    $('panel').innerHTML = h;
  }
  function setStaffAccess(id, on) {
    MaziAPI.adminSetStaffAccess(id, on).then(function () {
      toast(on ? 'Staff access granted' : 'Staff access removed');
      return loadAccounts().then(render);
    }).catch(function (e) { toast(e.message || 'Could not update this account.', true); });
  }
  function setSuperAdmin(id, on) {
    MaziAPI.adminSetSuperAdmin(id, on).then(function () {
      toast(on ? 'Now a Super Admin' : 'Super Admin removed');
      return loadAccounts().then(render);
    }).catch(function (e) { toast(e.message || 'Could not update this account.', true); });
  }

  /* ---------- staff display name (dashboard-only, not the shop profile name) ---------- */
  function openStaffNameModal() {
    $('staffNameInput').value = (S.profile && S.profile.staff_name) || '';
    $('staffNameModal').classList.remove('hidden');
    setTimeout(function () { $('staffNameInput').focus(); }, 50);
  }
  function closeStaffNameModal() { $('staffNameModal').classList.add('hidden'); }
  function saveStaffName() {
    var v = $('staffNameInput').value.trim();
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
        toast((p ? p.name.slice(0, 40) : pid) + ' → ' + num(r.stock_qty) + ' in stock');
        return loadStock().then(render);
      }).catch(function (e) {
        if (/adjust_stock|stock_qty/i.test(String(e.message))) { S.productsError = e; render(); }
        else toast(e.message || 'Could not update stock.', true);
      });
    }
    run();
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
      '<div class="acts modal-footer"><button type="button" class="btn ghost" data-close-edit>Cancel</button><button type="button" class="btn" id="editSaveBtn" data-save-product="' + esc(p.id) + '">Save changes</button></div>';
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
      '<div class="acts modal-footer"><button type="button" class="btn ghost" data-close-edit>Cancel</button><button type="button" class="btn" id="editSaveBtn" data-save-product="__new__">Add product</button></div>';
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
          '<button type="button" class="btn" style="flex:0 0 auto" id="editSaveBtn" data-save-product="' + esc(p.id) + '">Save changes</button>' +
        '</div>' +
      '</div>';
  }
  function openEditProduct(pid) {
    var p = findProduct(pid); if (!p) return;
    S.editingId = pid;
    pendingImageFile = null;
    $('editTitle').textContent = 'Edit — ' + p.name;
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
    btn.className = 'btn' + (opts.danger ? ' danger' : '');
    btn.onclick = function () { closeConfirm(); if (opts.onConfirm) opts.onConfirm(); };
    $('confirmModal').classList.remove('hidden');
  }
  function closeConfirm() { $('confirmModal').classList.add('hidden'); }

  /* ============ image quick view ============ */
  function openImgView(pid) {
    var p = findProduct(pid); if (!p || !p.image_url) return;
    $('imgViewPic').src = p.image_url;
    $('imgViewName').textContent = p.name;
    $('imgViewMeta').textContent = pid + (p.pack ? ' · ' + p.pack : '') + (p.unit ? ' ' + p.unit : '');
    $('imgViewModal').classList.remove('hidden');
  }
  function closeImgView() { $('imgViewModal').classList.add('hidden'); }
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
      message: (p.name ? p.name.slice(0, 60) : pid) + ' (' + pid + ') will be permanently removed — this can\'t be undone. Past orders keep their own record, so this won\'t change order history.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: function () {
        MaziAPI.adminDeleteProduct(pid).then(function () {
          toast((p.name ? p.name.slice(0, 40) : pid) + ' deleted');
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
    var c = o.customer || {}, feeTbc = o.deliveryFee == null;
    var mobile = String(c.mobile || '').replace(/[^0-9+]/g, '');
    var items = o.items.map(function (it) {
      return '<li><span>' + esc(it.name) + '<small>' + esc(it.pack || '') + ' · ' + esc(mvr(it.price)) + ' × ' + it.qty + '</small></span><span>' + esc(mvr(it.price * it.qty)) + '</span></li>';
    }).join('');
    var h = '<div class="dh"><div><h2>#' + esc(o.id) + '</h2><small>' + esc(fmtDate(o.placedAt)) + '</small><div class="c-status" style="margin-top:6px">' + statusHtml(o) + '</div></div>' +
      '<button class="kebab" data-close aria-label="Close">' + ICON.close + '</button></div><div class="dc"><div class="dc-cols"><div class="dc-col">';
    h += '<div class="sec"><h4>Customer</h4><div><b>' + esc(c.name) + '</b></div><div><a href="tel:' + esc(mobile) + '">' + esc(c.mobile) + '</a> · <a href="https://wa.me/' + esc(mobile.replace(/^\+/, '')) + '" target="_blank" rel="noopener">WhatsApp</a></div></div>';
    h += '<div class="sec"><h4>' + esc(typeOf(o)) + '</h4><div class="loc">' + esc(locationText(o)) + '</div></div>';
    h += '<div class="sec"><h4>Payment slip</h4><button class="btn ghost sm" data-slip="' + esc(o.id) + '">View payment slip</button></div>';
    h += '</div><div class="dc-col">';
    h += '<div class="sec"><h4>Items</h4><ul class="items">' + items + '</ul>' +
      '<div style="margin-top:8px"><div class="kv"><span>Subtotal</span><span>' + esc(mvr(o.subtotal)) + '</span></div>' +
      '<div class="kv" style="color:var(--ink-soft)"><span>incl. GST</span><span>' + esc(mvr(o.gst)) + '</span></div>' +
      '<div class="kv"><span>Delivery</span><span>' + (feeTbc ? '<b style="color:var(--amber)">to be confirmed</b>' : esc(mvr(o.deliveryFee))) + '</span></div>' +
      '<div class="kv total"><span>Total</span><span>' + esc(mvr(o.total)) + '</span></div></div>' +
      (o.currency === 'USD' ? '<div class="info">Customer chose to pay in <b>USD</b> ≈ $' + (o.total / MVR_PER_USD).toFixed(2) + ' (at ' + MVR_PER_USD + ')</div>' : '') + '</div>';
    h += '</div></div>';

    h += '<div class="sec dc-actions"><h4>Actions</h4><div class="acts">';
    if (o.status !== 'cancelled') {
      var i = FLOW.indexOf(o.status);
      if (i < FLOW.length - 1) h += '<button class="btn" data-next="' + esc(o.id) + '">' + NEXT_LABEL[o.status] + '</button>';
      if (o.status !== 'delivered') h += '<button class="btn danger" data-cancel="' + esc(o.id) + '">Cancel order</button>';
      if (o.status === 'delivered') h += '<span class="pill">Completed</span>';
    } else {
      h += '<span class="pill ' + (o.refundStatus === 'refunded' ? '' : 'amber') + '">Refund: ' + esc(o.refundStatus) + '</span>';
      if (o.refundStatus === 'pending') h += '<button class="btn" data-refunded="' + esc(o.id) + '">Mark refunded</button>';
    }
    h += '</div>';
    if (feeTbc && o.status !== 'cancelled') {
      h += '<div class="rowin"><input type="number" min="0" step="1" placeholder="Delivery fee (MVR)" id="fee-' + esc(o.id) + '"><button class="btn sm" data-fee="' + esc(o.id) + '">Set fee</button></div>';
    }
    h += '<div class="rowin"><input type="text" maxlength="500" placeholder="Internal note (customers can\'t see this)" id="note-' + esc(o.id) + '" value="' + esc(o.adminNote || '') + '"><button class="btn ghost sm" data-note="' + esc(o.id) + '">Save note</button></div></div>';
    return h + '</div>';
  }

  /* ============ row menu ============ */
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(id, btn) {
    closeMenu();
    var o = findOrder(id); if (!o) return;
    var items = ['<button data-open="' + esc(id) + '">View details</button>'];
    if (o.status !== 'cancelled') {
      var i = FLOW.indexOf(o.status);
      if (i < FLOW.length - 1) items.push('<button data-next="' + esc(id) + '">' + NEXT_LABEL[o.status] + '</button>');
    }
    items.push('<button data-slip="' + esc(id) + '">View payment slip</button>');
    if (o.status === 'cancelled' && o.refundStatus === 'pending') items.push('<button data-refunded="' + esc(id) + '">Mark refunded</button>');
    if (o.status !== 'cancelled' && o.status !== 'delivered') items.push('<button class="dng" data-cancel="' + esc(id) + '">Cancel order</button>');
    placeMenu(items, btn);
  }
  function openStockMenu(pid, btn) {
    closeMenu();
    var items = [
      '<button data-edit="' + esc(pid) + '">Edit product details</button>'
    ];
    placeMenu(items, btn);
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

  /* ============ events ============ */
  function onClick(e) {
    var t = e.target.closest('[data-tab],[data-agroup],[data-open],[data-menu],[data-stock-menu],[data-next],[data-cancel],[data-slip],[data-refunded],[data-fee],[data-note],[data-add],[data-subtract],[data-set],[data-edit],[data-add-product],[data-save-product],[data-delete-product],[data-close-edit],[data-shop-approve],[data-shop-reject],[data-close],[data-view],[data-goto],[data-notif-enable],[data-notif-off],[data-notif-on],[data-notif-item],[data-notif-viewall],[data-close-confirm],[data-img-view],[data-close-imgview],[data-remove-image],[data-staff-on],[data-staff-off],[data-sa-on],[data-sa-off],[data-open-staffname],[data-close-staffname],[data-save-staffname]');
    if (!t) return;
    var d = t.dataset, o;
    if (d.view) { S.view = d.view; S.q = ''; if (d.view === 'live') markPlacedSeen(); closeDrawer(); closeMenu(); if (S.view === 'stock' || S.view === 'dashboard') { loadStock().then(render); } render(); return; }
    if (d.goto) {
      var parts = d.goto.split(':'); S.view = parts[0]; S.q = '';
      if (parts[1]) S.tab[S.view] = parts[1];
      if (S.view === 'live') markPlacedSeen();
      closeDrawer(); closeMenu();
      if (S.view === 'stock') { loadStock().then(render); } else render();
      return;
    }
    if (d.notifItem) { closeNotif(); markOneSeen(d.notifItem); openDrawer(d.notifItem); render(); return; }
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
    if (d.staffOff) {
      showConfirm({
        title: 'Remove staff access?',
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
      showConfirm({
        title: 'Cancel order ' + o.id + '?',
        message: 'The customer paid with a slip, so the refund is marked as pending.',
        confirmLabel: 'Cancel order',
        danger: true,
        onConfirm: function () { apply(o.id, 'cancelled', { refundStatus: 'pending' }, 'Order cancelled — refund pending'); }
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
    if (d.slip) {
      closeMenu(); o = findOrder(d.slip);
      var w = window.open('', '_blank'); // open first so mobile browsers don't block the popup
      MaziAPI.getSlipUrl(o.slipPath).then(function (url) {
        if (w) w.location.href = url; else window.location.href = url;
      }).catch(function (err) { if (w) w.close(); toast(err.message || 'Could not open the slip.', true); });
    }
  }

  function boot() {
    $('loginBtn').addEventListener('click', login);
    $('forgotBtn').addEventListener('click', function () {
      var email = $('email').value.trim(), btn = this;
      if (!email) { setMsg('Type your email above first, then press Forgot Password.'); $('email').focus(); return; }
      btn.disabled = true; setMsg('');
      MaziAPI.sendPasswordReset(email).then(function () {
        setMsg('If this email has an account, we sent a reset link. Open it, set a new password, then come back here.', true);
      }).catch(function (e) {
        setMsg(e.message || 'Could not send the reset link.');
      }).then(function () {
        var n = 60; btn.textContent = 'Try again in ' + n + 's';
        var t = setInterval(function () {
          n--; if (n <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = 'Forgot Password'; }
          else btn.textContent = 'Try again in ' + n + 's';
        }, 1000);
      });
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
    ['email', 'password'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); }); });
    $('logoutBtn').addEventListener('click', function () { MaziAPI.logout().catch(function () {}).then(function () { showLogin(); }); });
    (function () {
      var side = $('sideNav'), logoBtn = $('sideLogoBtn'), expandBtn = $('sideExpandBtn');
      if (!side || !logoBtn || !expandBtn) return;
      var collapse = function () { side.classList.add('collapsed'); };
      var expand = function () { side.classList.remove('collapsed'); };
      logoBtn.addEventListener('click', function () { side.classList.contains('collapsed') ? expand() : collapse(); });
      logoBtn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logoBtn.click(); } });
      expandBtn.addEventListener('click', function (e) { e.stopPropagation(); expand(); });
    })();
    $('refreshBtn').addEventListener('click', function () {
      var b = this; b.classList.add('spin');
      loadAll().then(function () { toast('Refreshed'); }); if (S.view === 'stock') loadStock().then(render);
      setTimeout(function () { b.classList.remove('spin'); }, 650);
    });
    $('bell').addEventListener('click', function (e) { e.stopPropagation(); toggleNotif(this); });
    $('search').addEventListener('input', function (e) { S.q = e.target.value; render(); });
    $('panel').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id && e.target.id.indexOf('qty-') === 0) adjustStock(e.target.id.slice(4), 'set');
    });
    document.addEventListener('click', function (e) { if (menuEl && !e.target.closest('.menu') && !e.target.closest('[data-menu]') && !e.target.closest('[data-stock-menu]')) closeMenu(); });
    document.addEventListener('click', function (e) { if (notifEl && !e.target.closest('.notif-dd') && !e.target.closest('#bell')) closeNotif(); });
    ['nav', 'panel', 'drawer', 'editModal', 'confirmModal', 'imgViewModal', 'staffNameModal'].forEach(function (id) { $(id).addEventListener('click', onClick); });
    var meBtn = $('meBtn'); if (meBtn) meBtn.addEventListener('click', openStaffNameModal);
    $('staffNameModal').addEventListener('click', function (e) { if (e.target === this) closeStaffNameModal(); });
    var sni = $('staffNameInput'); if (sni) sni.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveStaffName(); });
    document.addEventListener('click', function (e) { if (menuEl && menuEl.contains(e.target)) onClick(e); }, true);
    document.addEventListener('click', function (e) { if (notifEl && notifEl.contains(e.target)) onClick(e); }, true);
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeMenu(); closeNotif(); closeInfo(); closeEditProduct(); closeStaffNameModal(); } });
    window.addEventListener('scroll', function () { closeMenu(); closeNotif(); }, true);
    restore();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
