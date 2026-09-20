/* ============================================================
   MAZI — staff orders dashboard (admin.html)
   Uses MaziAPI.admin* functions. Access is enforced by the database
   (profiles.is_admin + Row Level Security), NOT by hiding this page.
   ============================================================ */
(function () {
  'use strict';

  var STATUS_LABEL = { placed: 'New order', processing: 'Processing', delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
  var FLOW = ['placed', 'processing', 'delivery', 'delivered'];
  var NEXT_LABEL = { placed: 'Start processing', processing: 'Send out for delivery', delivery: 'Mark delivered' };
  var MVR_PER_USD = 15.42;
  var POLL_MS = 20000;

  var orders = [];
  var filter = 'all';
  var query = '';
  var openIds = {};      // which cards are expanded
  var knownIds = null;   // to detect brand-new orders between refreshes
  var pollTimer = null;
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mvr(n) { return 'MVR ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(ts) {
    return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  var toastTimer;
  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, isError ? 5000 : 2500);
  }

  /* ---------- sign in ---------- */
  function showLogin(msg) {
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    $('loginErr').textContent = msg || '';
    stopPolling();
  }
  function showApp(profile) {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('who').textContent = profile.email || profile.name || '';
    loadOrders(true);
    startPolling();
  }
  function checkStaff(profile) {
    return !!(profile && profile.is_admin);
  }

  function login() {
    var email = $('email').value.trim(), pw = $('password').value;
    if (!email || !pw) { $('loginErr').textContent = 'Enter your email and password.'; return; }
    var btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in…'; $('loginErr').textContent = '';
    MaziAPI.signInWithPassword(email, pw).then(function (res) {
      if (!checkStaff(res.profile)) {
        return MaziAPI.logout().catch(function () {}).then(function () {
          showLogin('This account is not a staff account.');
        });
      }
      showApp(res.profile);
    }).catch(function (e) {
      $('loginErr').textContent = e.message || 'Could not sign in.';
    }).then(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  }

  function restore() {
    if (!window.MaziAPI) { showLogin('Could not load the app. Refresh the page.'); return; }
    MaziAPI.getSession().then(function (s) {
      if (!s) return showLogin();
      return MaziAPI.getProfile().then(function (p) {
        if (checkStaff(p)) showApp(p); else showLogin();
      });
    }).catch(function () { showLogin(); });
  }

  /* ---------- data ---------- */
  function loadOrders(initial) {
    if (busy) return Promise.resolve();
    busy = true;
    return MaziAPI.adminListOrders().then(function (rows) {
      var fresh = [];
      if (knownIds) rows.forEach(function (o) { if (!knownIds[o.id]) fresh.push(o); });
      knownIds = {}; rows.forEach(function (o) { knownIds[o.id] = 1; });
      orders = rows;
      if (fresh.length && !initial) {
        toast(fresh.length === 1 ? 'New order ' + fresh[0].id : fresh.length + ' new orders');
        beep();
      }
      render();
    }).catch(function (e) {
      if (e && e.code === 'NOT_AUTHENTICATED') showLogin('Session expired. Please sign in again.');
      else toast(e.message || 'Could not load orders.', true);
    }).then(function () { busy = false; });
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(function () { if (!document.hidden) loadOrders(); }, POLL_MS); }
  function stopPolling() { clearInterval(pollTimer); }

  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext, c = new C(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); setTimeout(function () { o.stop(); c.close(); }, 180);
    } catch (e) {}
  }

  /* ---------- rendering ---------- */
  function counts() {
    var c = { all: orders.length };
    ['placed', 'processing', 'delivery', 'delivered', 'cancelled'].forEach(function (k) { c[k] = 0; });
    orders.forEach(function (o) { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }
  function renderTabs() {
    var c = counts();
    var defs = [['all', 'All'], ['placed', 'New'], ['processing', 'Processing'], ['delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];
    $('tabs').innerHTML = defs.map(function (d) {
      return '<button class="tab' + (filter === d[0] ? ' active' : '') + '" data-tab="' + d[0] + '">' + d[1] + '<span class="n">' + (c[d[0]] || 0) + '</span></button>';
    }).join('');
  }

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

  function cardHtml(o) {
    var open = !!openIds[o.id];
    var isNew = o.status === 'placed';
    var cust = o.customer || {};
    var head =
      '<div class="card-head" data-toggle="' + esc(o.id) + '">' +
        '<div><div class="id">#' + esc(o.id) + '</div>' +
        '<div class="sub">' + esc(cust.name) + ' · ' + esc(fmtDate(o.placedAt)) + '</div></div>' +
        '<div style="text-align:right"><span class="badge b-' + o.status + '">' + STATUS_LABEL[o.status] + '</span>' +
        '<div class="sub" style="margin-top:4px">' + esc(mvr(o.total)) + '</div></div>' +
      '</div>';
    if (!open) return '<div class="card' + (isNew ? ' new' : '') + '">' + head + '</div>';

    var items = o.items.map(function (it) {
      return '<li><span>' + esc(it.name) + '<small>' + esc(it.pack || '') + ' · ' + esc(mvr(it.price)) + ' × ' + it.qty + '</small></span><span>' + esc(mvr(it.price * it.qty)) + '</span></li>';
    }).join('');

    var feeTbc = o.deliveryFee == null;
    var usdNote = o.currency === 'USD'
      ? '<div class="note">Customer chose to pay in <b>USD</b> ≈ $' + (o.total / MVR_PER_USD).toFixed(2) + ' (at ' + MVR_PER_USD + ')</div>' : '';

    var mobile = (cust.mobile || '').replace(/[^0-9+]/g, '');
    var body =
      '<div class="card-body"><div class="grid">' +
        '<div class="sec"><h3>Customer</h3>' +
          '<div><b>' + esc(cust.name) + '</b></div>' +
          '<div><a href="tel:' + esc(mobile) + '">' + esc(cust.mobile) + '</a> · <a href="https://wa.me/' + esc(mobile.replace(/^\+/, '')) + '" target="_blank" rel="noopener">WhatsApp</a></div>' +
          '<h3 style="margin-top:12px">Delivery</h3><div class="loc">' + esc(locationText(o)) + '</div>' +
        '</div>' +
        '<div class="sec"><h3>Items</h3><ul class="items">' + items + '</ul>' +
          '<div style="margin-top:8px">' +
            '<div class="kv"><span>Subtotal</span><span>' + esc(mvr(o.subtotal)) + '</span></div>' +
            '<div class="kv" style="color:var(--ink-soft)"><span>incl. GST</span><span>' + esc(mvr(o.gst)) + '</span></div>' +
            '<div class="kv"><span>Delivery</span><span>' + (feeTbc ? '<b style="color:var(--amber)">to be confirmed</b>' : esc(mvr(o.deliveryFee))) + '</span></div>' +
            '<div class="kv total"><span>Total</span><span>' + esc(mvr(o.total)) + '</span></div>' +
          '</div>' + usdNote +
        '</div>' +
      '</div>';

    body += '<div class="actions"><button class="btn ghost small" data-slip="' + esc(o.id) + '">View payment slip</button>';
    if (o.status !== 'cancelled') {
      var i = FLOW.indexOf(o.status);
      if (i < FLOW.length - 1) body += '<button class="btn small" data-next="' + esc(o.id) + '">' + NEXT_LABEL[o.status] + '</button>';
      if (o.status !== 'delivered') body += '<button class="btn danger small" data-cancel="' + esc(o.id) + '">Cancel order</button>';
    } else {
      if (o.refundStatus === 'pending') body += '<button class="btn small" data-refunded="' + esc(o.id) + '">Mark refunded</button>';
      body += '<span class="badge ' + (o.refundStatus === 'refunded' ? 'b-delivered' : 'b-placed') + '">Refund: ' + esc(o.refundStatus) + '</span>';
    }
    body += '</div>';

    if (feeTbc && o.status !== 'cancelled') {
      body += '<div class="row"><input type="number" min="0" step="1" placeholder="Delivery fee (MVR)" id="fee-' + esc(o.id) + '">' +
              '<button class="btn small" data-fee="' + esc(o.id) + '">Set fee</button></div>';
    }
    body += '<div class="row"><input type="text" maxlength="500" placeholder="Internal note (customers can\'t see this)" id="note-' + esc(o.id) + '" value="' + esc(o.adminNote || '') + '">' +
            '<button class="btn ghost small" data-note="' + esc(o.id) + '">Save note</button></div>';
    body += '</div>';
    return '<div class="card' + (isNew ? ' new' : '') + '">' + head + body + '</div>';
  }

  function visible() {
    var q = query.trim().toLowerCase();
    return orders.filter(function (o) {
      if (filter !== 'all' && o.status !== filter) return false;
      if (!q) return true;
      var c = o.customer || {};
      return (o.id + ' ' + (c.name || '') + ' ' + (c.mobile || '')).toLowerCase().indexOf(q) >= 0;
    });
  }
  function render() {
    renderTabs();
    var list = visible();
    $('meta').textContent = list.length + ' order' + (list.length === 1 ? '' : 's') + ' · auto-refreshes every 20 s';
    $('list').innerHTML = list.length ? list.map(cardHtml).join('') : '<div class="empty">No orders here yet.</div>';
  }

  /* ---------- actions ---------- */
  function find(id) { return orders.filter(function (o) { return o.id === id; })[0]; }
  function apply(id, status, extra, okMsg) {
    return MaziAPI.adminSetOrderStatus(id, status, extra).then(function () {
      toast(okMsg || 'Updated');
      return loadOrders();
    }).catch(function (e) { toast(e.message || 'Could not update the order.', true); });
  }
  function onClick(e) {
    var t = e.target.closest('[data-tab],[data-toggle],[data-next],[data-cancel],[data-slip],[data-refunded],[data-fee],[data-note]');
    if (!t) return;
    var ds = t.dataset, id, o;
    if (ds.tab) { filter = ds.tab; render(); return; }
    if (ds.toggle) { openIds[ds.toggle] = !openIds[ds.toggle]; render(); return; }
    if (ds.next) {
      o = find(ds.next); var i = FLOW.indexOf(o.status);
      t.disabled = true;
      apply(o.id, FLOW[i + 1], null, o.id + ' → ' + STATUS_LABEL[FLOW[i + 1]]);
      return;
    }
    if (ds.cancel) {
      o = find(ds.cancel);
      if (!confirm('Cancel order ' + o.id + '?\nThe customer paid with a slip, so this marks the refund as pending.')) return;
      apply(o.id, 'cancelled', { refundStatus: 'pending' }, 'Order cancelled — refund pending');
      return;
    }
    if (ds.refunded) { apply(ds.refunded, 'cancelled', { refundStatus: 'refunded' }, 'Marked as refunded'); return; }
    if (ds.fee) {
      o = find(ds.fee);
      var v = $('fee-' + o.id).value;
      if (v === '' || Number(v) < 0) { toast('Enter the delivery fee in MVR.', true); return; }
      apply(o.id, o.status, { deliveryFee: Number(v) }, 'Delivery fee saved');
      return;
    }
    if (ds.note) {
      o = find(ds.note);
      apply(o.id, o.status, { note: $('note-' + o.id).value }, 'Note saved');
      return;
    }
    if (ds.slip) {
      o = find(ds.slip);
      var w = window.open('', '_blank');   // open first so mobile browsers don't block the popup
      MaziAPI.getSlipUrl(o.slipPath).then(function (url) {
        if (w) w.location.href = url; else window.location.href = url;
      }).catch(function (err) { if (w) w.close(); toast(err.message || 'Could not open the slip.', true); });
    }
  }

  /* ---------- wire up ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    $('loginBtn').addEventListener('click', login);
    ['email', 'password'].forEach(function (id) {
      $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
    });
    $('refreshBtn').addEventListener('click', function () { loadOrders().then(function () { toast('Refreshed'); }); });
    $('logoutBtn').addEventListener('click', function () { MaziAPI.logout().catch(function () {}).then(function () { showLogin(); }); });
    $('search').addEventListener('input', function (e) { query = e.target.value; render(); });
    $('list').addEventListener('click', onClick);
    $('tabs').addEventListener('click', onClick);
    restore();
  });
})();
