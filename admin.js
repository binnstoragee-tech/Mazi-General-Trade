/* ============================================================
   MAZI — staff dashboard (admin.html)
   Views: Live Orders · Order History (+ Summary) · Stock
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
  var POLL_MS = 20000;

  var S = {
    view: 'dashboard',
    tab: { live: 'all', history: 'all', stock: 'all', accounts: 'pending' },
    q: '',
    orders: [], products: [], log: [], shops: [], shopsError: null,
    productsError: null, drawerId: null, profile: null
  };
  var knownIds = null, pollTimer = null, busy = false, menuEl = null;

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
  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg; t.className = 'toast' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, isError ? 5000 : 2500);
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
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
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
    stopPolling(); closeDrawer(); closeMenu();
  }
  function showApp(profile) {
    S.profile = profile;
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    var who = profile.email || profile.name || 'Staff';
    $('who').textContent = who;
    $('meName').textContent = (profile.name || who.split('@')[0]);
    $('meAv').textContent = initials(profile.name || who.split('@')[0]);
    loadAll(true);
    startPolling();
    syncNameFromSignup(profile);
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
    var after = 'Your account can open this dashboard only after the shop owner gives it staff access.';
    MaziAPI.signUpWithPassword(email, pw, '', name).then(function (res) {
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
    help: '<h3>Help</h3><ol><li>Sign in with the email and password of your staff account, then press <b>Go</b>.</li><li>Forgot your password? Type your email, then press <b>Forgot Password</b> — we send you a reset link.</li><li>New here? Press <b>Create New Account</b>, confirm your email, then ask the shop owner to give your account staff access.</li></ol><p>Shopping as a customer? <a href="index.html">Go to the MAZI shop</a>.</p><p>Still stuck? Write to <a href="mailto:info@mazitrading.mv">info@mazitrading.mv</a>.</p>'
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
    return Promise.all([MaziAPI.adminListProducts(), MaziAPI.adminListStockLog(40).catch(function () { return []; })]).then(function (r) {
      S.products = r[0] || []; S.log = r[1] || []; S.productsError = null;
    }).catch(function (e) {
      S.productsError = e;
    });
  }
  function loadShops() {
    return MaziAPI.adminListShops().then(function (rows) { S.shops = rows || []; S.shopsError = null; })
      .catch(function (e) { S.shopsError = e; });
  }
  function loadAll(initial) {
    if (busy) return Promise.resolve();
    busy = true;
    var jobs = [loadOrders(initial)];
    if (S.view === 'stock' || S.view === 'dashboard' || initial) jobs.push(loadStock());
    jobs.push(loadShops());
    return Promise.all(jobs).catch(function (e) {
      if (e && e.code === 'NOT_AUTHENTICATED') showLogin('Session expired. Please sign in again.');
      else toast((e && e.message) || 'Could not load data.', true);
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
    var fresh = S.orders.filter(function (o) { return o.status === 'placed'; }).length;
    Array.prototype.forEach.call(document.querySelectorAll('#nav [data-view]'), function (b) { b.classList.toggle('active', b.dataset.view === S.view); });
    var nc = $('navCnt'); nc.textContent = active; nc.classList.toggle('hidden', !active);
    var pend = S.shops.filter(function (x) { return x.status === 'pending'; }).length;
    var sc = $('navShopCnt'); if (sc) { sc.textContent = pend; sc.classList.toggle('hidden', !pend); }
    var bn = $('bellN'); bn.textContent = fresh; bn.classList.toggle('hidden', !fresh);
    $('search').placeholder = S.view === 'stock' ? 'Search products' : (S.view === 'accounts' ? 'Search account, owner or mobile' : 'Search order, name or mobile');
    if ($('search').value !== S.q) $('search').value = S.q;
    var searchWrap = document.querySelector('.search');
    if (searchWrap) searchWrap.classList.toggle('hidden', S.view === 'dashboard');

    if (S.view === 'dashboard') renderDashboard();
    else if (S.view === 'stock') renderStock();
    else if (S.view === 'accounts') renderAccounts();
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
  function renderDashboard() {
    var orders = S.orders, today = ymd(Date.now()), yest = ymd(Date.now() - 86400000);
    var live = orders.filter(function (o) { return o.status !== 'cancelled'; });
    var activeCount = orders.filter(function (o) { return ACTIVE.indexOf(o.status) >= 0; }).length;
    var freshCount = orders.filter(function (o) { return o.status === 'placed'; }).length;
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
    var h = '<h1>Dashboard</h1><p class="lead">Store overview &amp; today\'s activity.</p>';
    h += '<div class="dstats">' + cards.map(function (c) {
      return '<div class="dstat"><div class="dstat-top"><small>' + c.label + '</small><span class="dstat-ico ' + c.cls + '">' + c.ico + '</span></div><b>' + c.val + '</b>' + c.delta + '</div>';
    }).join('') + '</div>';

    h += '<div class="dgrid"><div>';

    var qa = [
      { g: 'live:all', ico: ICON.bolt, t: 'Live Orders', s: num(activeCount) + ' need action' },
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
  }

  function weeklyChartHtml(live) {
    var days = [], i;
    for (i = 6; i >= 0; i--) days.push(ymd(Date.now() - i * 86400000));
    var revByDay = {}; days.forEach(function (d) { revByDay[d] = 0; });
    live.forEach(function (o) { var d = ymd(o.placedAt); if (revByDay[d] != null) revByDay[d] += o.total; });
    var vals = days.map(function (d) { return revByDay[d]; });
    var max = Math.max.apply(null, vals.concat([1]));
    var W = 620, H = 150, pad = 8;
    var pts = vals.map(function (v, idx) {
      var x = pad + idx * ((W - pad * 2) / (vals.length - 1));
      var y = H - pad - (v / max) * (H - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var line = 'M' + pts.join(' L');
    var area = 'M' + pad + ',' + (H - pad) + ' L' + pts.join(' L') + ' L' + (W - pad) + ',' + (H - pad) + ' Z';
    var thisWeek = vals.reduce(function (s, v) { return s + v; }, 0);
    var thisWeekOrders = live.filter(function (o) { return days.indexOf(ymd(o.placedAt)) >= 0; }).length;
    var prevDays = []; for (i = 13; i >= 7; i--) prevDays.push(ymd(Date.now() - i * 86400000));
    var prevWeek = 0; live.forEach(function (o) { var d = ymd(o.placedAt); if (prevDays.indexOf(d) >= 0) prevWeek += o.total; });
    var wchg = prevWeek ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null;
    var dLabels = days.map(function (d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }); });

    return '<div class="box chart-wrap"><h3>Weekly Performance</h3>' +
      '<div class="chart-legend"><span><i style="background:var(--green-600)"></i>Revenue · last 7 days</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:150px;display:block">' +
        '<path d="' + area + '" fill="var(--green-100)" stroke="none"></path>' +
        '<path d="' + line + '" fill="none" stroke="var(--green-600)" stroke-width="2.4"></path>' +
      '</svg>' +
      '<div class="chart-days">' + dLabels.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>' +
      '<div class="snap"><div><small>This Week Revenue</small><b>' + esc(mvr(thisWeek)) + '</b></div>' +
      '<div><small>This Week Orders</small><b>' + num(thisWeekOrders) + '</b></div>' +
      (wchg == null ? '' : '<div><small>vs Last Week</small><b>' + (wchg >= 0 ? '+' : '') + wchg + '%</b></div>') +
      '</div></div>';
  }

  function activityFeedHtml() {
    var items = [];
    S.orders.slice().sort(function (a, b) { return b.placedAt - a.placedAt; }).slice(0, 5).forEach(function (o) {
      var c = o.customer || {};
      items.push({ t: o.placedAt, ico: ICON.bag, text: '<b>' + esc(c.name || 'Customer') + '</b> placed order #' + esc(o.id), sub: esc(mvr(o.total)) + ' · ' + LABEL[o.status] });
    });
    var REASON = { restock: 'Restocked', set: 'Stock set', order: 'Sold', cancel: 'Returned' };
    (S.log || []).slice(0, 5).forEach(function (l) {
      var name = (l.products && l.products.name) || l.product_id;
      items.push({ t: new Date(l.created_at).getTime(), ico: ICON.box, text: esc(REASON[l.reason] || l.reason) + ' <b>' + esc(name) + '</b>', sub: (l.change >= 0 ? '+' : '') + l.change + ' → ' + num(l.qty_after) });
    });
    items.sort(function (a, b) { return b.t - a.t; });
    items = items.slice(0, 6);
    return '<div class="box"><h3>Activity Feed</h3><div class="feed">' + (items.length ? items.map(function (it) {
      return '<div class="feed-row"><span class="feed-ico">' + it.ico + '</span><div><p>' + it.text + '</p><small>' + it.sub + ' · ' + esc(ago(it.t)) + '</small></div></div>';
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
    return list;
  }
  function cnt(list, st) { return list.filter(function (o) { return o.status === st; }).length; }

  function renderOrders() {
    var base = baseOrders(), tab = S.tab[S.view], h = '';
    var defs, title, lead;
    if (S.view === 'live') {
      title = 'Live Orders'; lead = 'Orders that still need action. Updates every 20 seconds.';
      defs = [['all', 'All', base.length], ['placed', 'New', cnt(base, 'placed')], ['processing', 'Processing', cnt(base, 'processing')], ['delivery', 'Out for delivery', cnt(base, 'delivery')]];
    } else {
      title = 'Order History'; lead = 'Every order, newest first.';
      defs = [['all', 'All Order', base.length], ['summary', 'Summary', null], ['completed', 'Completed', cnt(base, 'delivered')], ['cancelled', 'Cancelled', cnt(base, 'cancelled')]];
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
  function stockStatus(p) {
    if (p.stock_qty == null) return { key: 'untracked', label: 'Not tracked', cls: 'gray' };
    if (p.stock_qty <= 0) return { key: 'out', label: 'Out of stock', cls: 'red' };
    if (p.stock_qty <= 5) return { key: 'low', label: 'Low stock', cls: 'amber' };
    return { key: 'in', label: 'In stock', cls: '' };
  }
  function renderStock() {
    var h = '<h1>Stock</h1><p class="lead">Add stock when new goods arrive. Orders take units off automatically, and the shop shows In / Low / Out of stock by itself (Low = 5 or fewer).</p>';
    if (S.productsError) {
      var msg = String(S.productsError.message || '');
      if (/stock_qty|stock_log|admin_adjust_stock/i.test(msg)) {
        h += '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>supabase/08_stock.sql</code>, then press Refresh.</div>';
      } else {
        h += '<div class="note-banner">Could not load products: ' + esc(msg) + '</div>';
      }
      $('panel').innerHTML = h; return;
    }
    var P = S.products, c = { low: 0, out: 0, untracked: 0, hidden: 0 };
    P.forEach(function (p) { var k = stockStatus(p).key; if (c[k] != null) c[k]++; if (!p.active) c.hidden++; });
    h += '<div class="chips">' +
      '<div class="chip"><small>Products</small><b>' + P.length + '</b></div>' +
      '<div class="chip"><small>Low stock</small><b>' + c.low + '</b></div>' +
      '<div class="chip"><small>Out of stock</small><b>' + c.out + '</b></div>' +
      '<div class="chip"><small>Not tracked yet</small><b>' + c.untracked + '</b></div></div>';

    var tab = S.tab.stock;
    var defs = [['all', 'All', P.length], ['low', 'Low', c.low], ['out', 'Out', c.out], ['untracked', 'Not tracked', c.untracked], ['hidden', 'Hidden', c.hidden]];
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
        return '<div class="srow" data-pid="' + pid + '">' +
          '<div class="s-name"><span class="ico">' + esc(p.icon || '📦') + '</span><span><b>' + esc(p.name) + '</b><small>' + pid + ' · ' + esc(p.pack || '') + ' ' + esc(p.unit || '') + '</small></span></div>' +
          '<div class="s-status"><span class="pill ' + st.cls + '">' + st.label + '</span>' + (p.active ? '' : ' <span class="pill gray">Hidden</span>') + '</div>' +
          '<div class="s-qty">' + (p.stock_qty == null ? '—' : num(p.stock_qty) + ' <small>units</small>') + '</div>' +
          '<div class="s-price">' + (p.price > 0 ? esc(mvr(p.price)) : '<span class="pill gray">No price</span>') + '</div>' +
          '<div class="s-add"><input type="number" inputmode="numeric" min="0" step="1" placeholder="Qty" id="qty-' + pid + '">' +
            '<button class="btn sm" data-add="' + pid + '">+ Add</button><button class="btn ghost sm" data-set="' + pid + '" title="Replace the total with this number">Set total</button></div>' +
        '</div>';
      }).join('');
    }

    var REASON = { restock: 'Added', set: 'Total set', order: 'Sold', cancel: 'Returned (cancel)' };
    h += '<div class="box log"><h3>Recent stock activity</h3>' + (S.log.length ? S.log.map(function (l) {
      var name = (l.products && l.products.name) || l.product_id;
      return '<div class="logrow"><span>' + esc(REASON[l.reason] || l.reason) + ' · ' + esc(name) + (l.order_id ? ' · #' + esc(l.order_id) : '') +
        '</span><span><span class="' + (l.change >= 0 ? 'plus' : 'minus') + '">' + (l.change >= 0 ? '+' : '') + l.change + '</span> → ' + num(l.qty_after) + ' · ' + esc(ago(new Date(l.created_at).getTime())) + '</span></div>';
    }).join('') : '<div class="empty" style="padding:14px">Nothing yet.</div>') + '</div>';
    // keep whatever the staff was typing in the Qty boxes while the list refreshes
    var typed = {}, focusId = document.activeElement && document.activeElement.id;
    Array.prototype.forEach.call($('panel').querySelectorAll('.s-add input'), function (i) { if (i.value) typed[i.id] = i.value; });
    $('panel').innerHTML = h;
    Object.keys(typed).forEach(function (id) { var i = $(id); if (i) i.value = typed[id]; });
    if (focusId && focusId.indexOf('qty-') === 0 && $(focusId)) $(focusId).focus();
  }

  /* ---------- accounts (My Accounts approval) ---------- */
  function renderAccounts() {
    var h = '<h1>Accounts</h1><p class="lead">Business and residence accounts that customers add from their profile. Approve a business account so the customer can select it at checkout.</p>';
    if (S.shopsError) {
      var msg = String(S.shopsError.message || '');
      if (/admin_list_shops|does not exist|schema cache|not authorized/i.test(msg)) {
        h += '<div class="note-banner"><b>One-time setup needed.</b> Open Supabase → SQL Editor and run <code>11_shops_admin.sql</code>, then press Refresh.</div>';
      } else {
        h += '<div class="note-banner">Could not load accounts: ' + esc(msg) + '</div>';
      }
      $('panel').innerHTML = h; return;
    }
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
        if (x.status !== 'rejected') btns += '<button class="btn ghost sm" data-shop-reject="' + esc(x.id) + '">Reject</button>';
        return '<div class="box" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">' +
          '<div><b>' + esc(x.name) + '</b> <span class="pill ' + cls + '">' + esc(x.status) + '</span>' +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--ink-soft);line-height:1.6">' + lines.map(esc).join('<br>') + '</div></div>' +
          '<div style="display:flex;gap:8px">' + btns + '</div></div>';
      }).join('');
    }
    $('panel').innerHTML = h;
  }
  function setShopStatus(id, status) {
    MaziAPI.adminSetShopStatus(id, status).then(function () {
      toast(status === 'approved' ? 'Account approved' : (status === 'rejected' ? 'Account rejected' : 'Account updated'));
      return loadShops().then(render);
    }).catch(function (e) { toast(e.message || 'Could not update the account.', true); });
  }

  function adjustStock(pid, mode) {
    var input = $('qty-' + pid); if (!input) return;
    var v = input.value.trim();
    if (v === '' || !/^\d+$/.test(v)) { toast('Enter a whole number, e.g. 24.', true); input.focus(); return; }
    var n = parseInt(v, 10), p = findProduct(pid);
    if (n <= 0 && mode === 'add') { toast('Enter a quantity above 0.', true); return; }
    var opts = mode === 'add' ? { add: n } : { set: n };
    if (mode === 'set' && p && p.stock_qty != null && !confirm('Replace the total for this product with ' + n + '?\n(now: ' + p.stock_qty + ')')) return;
    MaziAPI.adminAdjustStock(pid, opts).then(function (r) {
      toast((p ? p.name.slice(0, 40) : pid) + ' → ' + num(r.stock_qty) + ' in stock');
      return loadStock().then(render);
    }).catch(function (e) {
      if (/adjust_stock|stock_qty/i.test(String(e.message))) { S.productsError = e; render(); }
      else toast(e.message || 'Could not update stock.', true);
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
      '<button class="kebab" data-close aria-label="Close">' + ICON.close + '</button></div><div class="dc">';
    h += '<div class="sec"><h4>Customer</h4><div><b>' + esc(c.name) + '</b></div><div><a href="tel:' + esc(mobile) + '">' + esc(c.mobile) + '</a> · <a href="https://wa.me/' + esc(mobile.replace(/^\+/, '')) + '" target="_blank" rel="noopener">WhatsApp</a></div></div>';
    h += '<div class="sec"><h4>' + esc(typeOf(o)) + '</h4><div class="loc">' + esc(locationText(o)) + '</div></div>';
    h += '<div class="sec"><h4>Items</h4><ul class="items">' + items + '</ul>' +
      '<div style="margin-top:8px"><div class="kv"><span>Subtotal</span><span>' + esc(mvr(o.subtotal)) + '</span></div>' +
      '<div class="kv" style="color:var(--ink-soft)"><span>incl. GST</span><span>' + esc(mvr(o.gst)) + '</span></div>' +
      '<div class="kv"><span>Delivery</span><span>' + (feeTbc ? '<b style="color:var(--amber)">to be confirmed</b>' : esc(mvr(o.deliveryFee))) + '</span></div>' +
      '<div class="kv total"><span>Total</span><span>' + esc(mvr(o.total)) + '</span></div></div>' +
      (o.currency === 'USD' ? '<div class="info">Customer chose to pay in <b>USD</b> ≈ $' + (o.total / MVR_PER_USD).toFixed(2) + ' (at ' + MVR_PER_USD + ')</div>' : '') + '</div>';

    h += '<div class="sec"><h4>Payment slip</h4><button class="btn ghost sm" data-slip="' + esc(o.id) + '">View payment slip</button></div>';

    h += '<div class="sec"><h4>Actions</h4><div class="acts">';
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
    menuEl = document.createElement('div');
    menuEl.className = 'menu'; menuEl.innerHTML = items.join('');
    document.body.appendChild(menuEl);
    var r = btn.getBoundingClientRect(), mh = menuEl.offsetHeight, mw = menuEl.offsetWidth;
    var top = r.bottom + 4; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    menuEl.style.top = top + 'px';
    menuEl.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + 'px';
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
    var t = e.target.closest('[data-tab],[data-open],[data-menu],[data-next],[data-cancel],[data-slip],[data-refunded],[data-fee],[data-note],[data-add],[data-set],[data-shop-approve],[data-shop-reject],[data-close],[data-view],[data-goto],[data-notif-enable],[data-notif-off],[data-notif-on]');
    if (!t) return;
    var d = t.dataset, o;
    if (d.view) { S.view = d.view; S.q = ''; closeDrawer(); closeMenu(); if (S.view === 'stock' || S.view === 'dashboard') { loadStock().then(render); } render(); return; }
    if (d.goto) {
      var parts = d.goto.split(':'); S.view = parts[0]; S.q = '';
      if (parts[1]) S.tab[S.view] = parts[1];
      closeDrawer(); closeMenu();
      if (S.view === 'stock') { loadStock().then(render); } else render();
      return;
    }
    if (d.notifEnable !== undefined) { requestDeviceNotifPermission(function (perm) { if (perm === 'granted') setStaffNotifPref('on'); render(); }); return; }
    if (d.notifOff !== undefined) { setStaffNotifPref('off'); render(); return; }
    if (d.notifOn !== undefined) { setStaffNotifPref('on'); render(); return; }
    if (d.close !== undefined) { closeDrawer(); return; }
    if (d.tab) { S.tab[S.view] = d.tab; render(); return; }
    if (d.menu) { e.stopPropagation(); openMenu(d.menu, t); return; }
    if (d.open) { openDrawer(d.open); return; }
    if (d.shopApprove) { setShopStatus(d.shopApprove, 'approved'); return; }
    if (d.shopReject) { if (confirm('Reject this account?')) setShopStatus(d.shopReject, 'rejected'); return; }
    if (d.add) { adjustStock(d.add, 'add'); return; }
    if (d.set) { adjustStock(d.set, 'set'); return; }
    if (d.next) {
      closeMenu(); o = findOrder(d.next); var i = FLOW.indexOf(o.status);
      t.disabled = true;
      apply(o.id, FLOW[i + 1], null, '#' + o.id + ' → ' + LABEL[FLOW[i + 1]]);
      return;
    }
    if (d.cancel) {
      closeMenu(); o = findOrder(d.cancel);
      if (!confirm('Cancel order ' + o.id + '?\nThe customer paid with a slip, so the refund is marked as pending.')) return;
      apply(o.id, 'cancelled', { refundStatus: 'pending' }, 'Order cancelled — refund pending');
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
    ['email', 'password'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); }); });
    $('logoutBtn').addEventListener('click', function () { MaziAPI.logout().catch(function () {}).then(function () { showLogin(); }); });
    $('refreshBtn').addEventListener('click', function () {
      var b = this; b.classList.add('spin');
      loadAll().then(function () { toast('Refreshed'); }); if (S.view === 'stock') loadStock().then(render);
      setTimeout(function () { b.classList.remove('spin'); }, 650);
    });
    $('bell').addEventListener('click', function () { S.view = 'live'; S.tab.live = 'placed'; closeDrawer(); render(); });
    $('search').addEventListener('input', function (e) { S.q = e.target.value; render(); });
    $('panel').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id && e.target.id.indexOf('qty-') === 0) adjustStock(e.target.id.slice(4), 'add');
    });
    document.addEventListener('click', function (e) { if (menuEl && !e.target.closest('.menu') && !e.target.closest('[data-menu]')) closeMenu(); });
    ['nav', 'panel', 'drawer'].forEach(function (id) { $(id).addEventListener('click', onClick); });
    document.addEventListener('click', function (e) { if (menuEl && menuEl.contains(e.target)) onClick(e); }, true);
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeMenu(); closeInfo(); } });
    window.addEventListener('scroll', closeMenu, true);
    restore();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
