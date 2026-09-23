/* ============================================================
   MAZI — API client  (window.MaziAPI)

   Load order in your HTML (api.js goes right AFTER supabase-config.js):
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
     <script src="supabase-config.js"></script>
     <script src="api.js"></script>
     ...
     <script src="script.js"></script>

   Every function returns a Promise and THROWS an Error with:
     err.code     e.g. 'OUT_OF_STOCK', 'CANNOT_CANCEL', 'NOT_AUTHENTICATED'
     err.message  friendly text you can show in a toast
     err.detail   extra info (e.g. the product ids that are out of stock)
   ============================================================ */
(function () {
  'use strict';

  var SLIP_BUCKET = 'payment-slips';
  var SLIP_MAX_BYTES = 5 * 1024 * 1024;
  var SLIP_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
  var PRODUCT_IMAGE_BUCKET = 'product-images';
  var IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  var IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  var ORDER_STATUSES = ['placed', 'processing', 'delivery', 'delivered']; // same order as ORDER_STEPS in script.js

  var MESSAGES = {
    NOT_AUTHENTICATED: 'Please log in first.',
    TERMS_REQUIRED: 'Please accept the Terms & Conditions.',
    INVALID_CURRENCY: 'Invalid currency.',
    INVALID_METHOD: 'Please choose pickup or delivery.',
    INVALID_CUSTOMER: 'Please enter a valid name and mobile number.',
    INVALID_LOCATION: 'Please complete the delivery / pickup details.',
    INVALID_ITEMS: 'Some items in your cart are invalid.',
    EMPTY_CART: 'Your cart is empty.',
    SLIP_REQUIRED: 'Please upload your payment slip.',
    IMAGE_REQUIRED: 'Please choose a photo to upload.',
    RATE_LIMITED: 'Too many orders in a short time. Please try again later.',
    PRODUCT_NOT_FOUND: 'Some products are no longer available.',
    OUT_OF_STOCK: 'Some items are out of stock.',
    INSUFFICIENT_STOCK: 'Not enough stock left for some items. Please lower the quantity.',
    INVALID_STOCK: 'Enter a valid quantity.',
    ORDER_NOT_FOUND: 'Order not found.',
    CANNOT_CANCEL: 'This order can no longer be cancelled.',
    FORBIDDEN: 'You do not have permission to do that.',
    INVALID_STATUS: 'Invalid order status.',
    INVALID_REFUND_STATUS: 'Invalid refund status.',
    NOT_FOUND: 'That account could not be found.',
    CANNOT_REMOVE_SELF: 'You cannot remove your own staff access.',
    LAST_SUPER_ADMIN: 'There must always be at least one Super Admin — make another account Super Admin first.',
    STOREFRONT_ACCOUNT: 'This account signed up on the customer store front and cannot be given staff access.'
  };

  // ---------- client ----------
  var client = null;
  function getClient() {
    if (client) return client;
    if (typeof window.supabase === 'undefined') throw fail('CONFIG', 'Supabase library did not load.');
    var url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
    if (!url || !key || String(url).indexOf('PASTE_YOUR') === 0) throw fail('CONFIG', 'supabase-config.js is not filled in.');
    client = window.supabase.createClient(url, key);
    return client;
  }

  // ---------- errors ----------
  function fail(code, message, detail) {
    var e = new Error(message || MESSAGES[code] || code);
    e.code = code; e.detail = detail || null; e.isMazi = true;
    return e;
  }
  function toError(err) {
    if (!err) return fail('UNKNOWN', 'Something went wrong.');
    if (err.isMazi) return err;
    var raw = String(err.message || '').trim();
    // our SQL functions raise plain codes like OUT_OF_STOCK
    if (MESSAGES[raw]) return fail(raw, MESSAGES[raw], err.details || err.detail || null);
    // Specific sign-in / sign-up messages (must come BEFORE the generic NOT_AUTHENTICATED check)
    if (/Invalid login credentials/i.test(raw)) return fail('INVALID_LOGIN', 'Incorrect email or password, or this account does not exist yet.');
    if (/Email not confirmed/i.test(raw)) return fail('EMAIL_NOT_CONFIRMED', 'Please confirm your email first. Check your inbox.');
    if (/User already registered/i.test(raw)) return fail('USER_EXISTS', 'This email already has an account. Please sign in.');
    if (/same as the old|different from the old/i.test(raw)) return fail('SAME_PASSWORD', 'Your new password must be different from your old one.');
    if (/JWT|not authenticated|Invalid login|session/i.test(raw)) return fail('NOT_AUTHENTICATED', MESSAGES.NOT_AUTHENTICATED);
    // "For security purposes, you can only request this after 45 seconds" -> short per-address wait
    var wait = raw.match(/after\s+(\d+)\s+seconds?/i);
    if (wait || /only request this|for security purposes/i.test(raw)) {
      var secs = wait ? parseInt(wait[1], 10) : 60;
      var e1 = fail('RATE_LIMITED', 'Please wait ' + secs + ' seconds before requesting another email.');
      e1.retryAfter = secs;
      return e1;
    }
    // "email rate limit exceeded" -> the project-wide hourly email quota is used up
    // (Supabase's built-in email sender only allows a handful of emails per hour).
    // Waiting a minute will not fix this one.
    if (/email rate limit|over_email_send_rate_limit/i.test(raw) || err.code === 'over_email_send_rate_limit') {
      return fail('EMAIL_LIMIT', 'Our email limit was reached for now. Please try again in about an hour.');
    }
    if (/rate limit|too many/i.test(raw)) return fail('RATE_LIMITED', 'Too many attempts. Please wait a minute, then try again.');
    if (/Token has expired|invalid.*(token|code)|otp/i.test(raw)) return fail('INVALID_OTP', 'That code is incorrect or has expired.');
    if (/Failed to fetch|NetworkError|network/i.test(raw)) return fail('NETWORK', 'Connection problem. Please check your internet and try again.');
    return fail(err.code || 'UNKNOWN', raw || 'Something went wrong.', err.details || null);
  }
  function unwrap(res) {
    if (res && res.error) throw toError(res.error);
    return res ? res.data : null;
  }
  function run(promiseFn) {
    return Promise.resolve().then(promiseFn).catch(function (e) { throw toError(e); });
  }

  // ---------- helpers ----------
  // "777 1234" / "7771234" / "+9607771234" / "9607771234"  ->  "+9607771234"
  function normalizeMobile(input) {
    var s = String(input || '').replace(/[\s\-()]/g, '');
    if (!s) return '';
    if (s.charAt(0) === '+') return s;
    if (s.indexOf('960') === 0 && s.length >= 10) return '+' + s;
    return '+960' + s;
  }

  function statusIndex(order) {
    var i = ORDER_STATUSES.indexOf(order && order.status);
    return i < 0 ? 0 : i;
  }

  // DB row -> the object shape script.js / checkout.js already use for orders
  function normalizeOrder(o) {
    if (!o) return null;
    var items = (o.items || o.order_items || []).map(function (it) {
      return { id: it.product_id, name: it.name, pack: it.pack, unit: it.unit, price: Number(it.price), qty: it.qty };
    });
    var customer = o.customer || { name: o.customer_name, mobile: o.customer_mobile };
    var fee = o.delivery_fee == null ? null : Number(o.delivery_fee);
    var order = {
      id: o.id,
      status: o.status,
      cancelled: o.status === 'cancelled',
      placedAt: new Date(o.placed_at).getTime(),
      items: items,
      subtotal: Number(o.subtotal),
      gst: Number(o.gst),
      deliveryFee: fee,
      total: Number(o.total),
      currency: o.currency || 'MVR',
      refundStatus: o.refund_status || 'none',
      customer: {
        name: customer.name, mobile: customer.mobile,
        method: o.method, location: o.location || {},
        deliveryFee: fee, gst: Number(o.gst), total: Number(o.total)
      }
    };
    order.statusIndex = statusIndex(order);
    return order;
  }

  // ============================================================
  // Config + catalog (works for guests)
  // ============================================================
  function getConfig() {
    return run(function () {
      return getClient().from('app_config').select('key,value').then(unwrap).then(function (rows) {
        var cfg = {};
        (rows || []).forEach(function (r) { cfg[r.key] = r.value; });
        return cfg; // { mvr_per_usd, gst_rate, free_delivery_over_mvr, male_islands }
      });
    });
  }

  function listCategories() {
    return run(function () {
      return getClient().from('categories').select('id,name').order('sort_order').then(unwrap);
    });
  }

  // Returns products in the SAME shape as the PRODUCTS array in script.js:
  // { id, name, cat, icon, pack, unit, price, stock, img }
  function listProducts(opts) {
    opts = opts || {};
    return run(function () {
      return getClient().rpc('list_products', {
        p_cat: opts.cat || null, p_q: opts.q || null,
        p_limit: opts.limit || 500, p_offset: opts.offset || 0
      }).then(unwrap).then(function (rows) {
        return (rows || []).map(function (p) {
          var out = { id: p.id, name: p.name, cat: p.category, icon: p.icon, pack: p.pack,
                      unit: p.unit, price: p.price, stock: p.stock };
          if (p.image_url) out.img = p.image_url;
          return out;
        });
      });
    });
  }

  // ============================================================
  // Auth (free email + password; mobile is stored in the profile)
  // ============================================================
  function sendOtp(mobile) {
    return run(function () {
      var phone = normalizeMobile(mobile);
      if (phone.length < 8) throw fail('INVALID_CUSTOMER', 'Please enter a valid mobile number.');
      return getClient().auth.signInWithOtp({ phone: phone }).then(unwrap).then(function () {
        return { sent: true, mobile: phone };
      });
    });
  }

  // Resolves { user, profile, isNewUser }. isNewUser = has not finished onboarding yet.
  function verifyOtp(mobile, code) {
    return run(function () {
      var phone = normalizeMobile(mobile);
      return getClient().auth.verifyOtp({ phone: phone, token: String(code).trim(), type: 'sms' })
        .then(unwrap)
        .then(function (data) {
          return getProfile().then(function (profile) {
            return { user: data.user, profile: profile, isNewUser: !profile || !profile.onboarded };
          });
        });
    });
  }

  function getSession() {
    return run(function () {
      return getClient().auth.getSession().then(unwrap).then(function (d) { return d && d.session; });
    });
  }
  function onAuthChange(cb) {
    return getClient().auth.onAuthStateChange(function (event, session) { cb(event, session); });
  }
  function logout() {
    return run(function () { return getClient().auth.signOut().then(unwrap); });
  }

  function authResult(data) {
    return getProfile().then(function (profile) {
      return { user: data.user, profile: profile, isNewUser: !profile || !profile.onboarded };
    });
  }

  function signInWithPassword(email, password) {
    return run(function () {
      return getClient().auth.signInWithPassword({ email: String(email).trim(), password: String(password) })
        .then(unwrap).then(authResult);
    });
  }

  // "Continue with Google" — redirects the shopper to Google's sign-in
  // page, then back here already signed in. Google verifies the email
  // itself, so no confirmation email step is needed for this path.
  function signInWithGoogle() {
    return run(function () {
      return getClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl() }
      }).then(unwrap);
    });
  }

  // Where the confirmation link in the email sends the shopper back to (this site).
  function redirectUrl() {
    return /^https?:$/.test(window.location.protocol) ? window.location.origin + '/' : undefined;
  }

  function signUpWithPassword(email, password, mobile, name, source) {
    return run(function () {
      return getClient().auth.signUp({
        email: String(email).trim(),
        password: String(password),
        options: { data: { mobile: mobile || null, name: name || null, source: source || 'storefront' }, emailRedirectTo: redirectUrl() }
      }).then(unwrap).then(function (data) {
        // Supabase hides "already registered" (no error) and returns a user with no identities
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw fail('USER_EXISTS', 'This email already has an account. Please sign in.');
        }
        if (!data.session) return { user: data.user, profile: null, isNewUser: true, needsEmailConfirmation: true };
        // The signup trigger stores the mobile metadata in profiles.mobile.
        // Do not make the auth result depend on a second profile update: an
        // older database migration may not yet grant mobile-column updates,
        // and that should never turn a successful signup into an auth error.
        return authResult(data);
      });
    });
  }

  // Sends the confirmation email again (60 s cooldown enforced by Supabase)
  function resendConfirmation(email) {
    return run(function () {
      return getClient().auth.resend({
        type: 'signup',
        email: String(email).trim(),
        options: { emailRedirectTo: redirectUrl() }
      }).then(unwrap).then(function () { return { sent: true }; });
    });
  }

  // Forgot password: emails a reset link that brings the shopper back to this
  // site with #access_token=...&type=recovery (handled in script.js).
  // Supabase answers the same way whether or not the email has an account.
  function sendPasswordReset(email) {
    return run(function () {
      return getClient().auth.resetPasswordForEmail(String(email).trim(), { redirectTo: redirectUrl() })
        .then(unwrap).then(function () { return { sent: true }; });
    });
  }

  // Sets the new password for the shopper who just opened a reset link.
  function updatePassword(newPassword) {
    return run(function () {
      return getClient().auth.updateUser({ password: String(newPassword) })
        .then(unwrap).then(function () { return { updated: true }; });
    });
  }

  // ============================================================
  // Profile
  // ============================================================
  function currentUserId() {
    return getSession().then(function (s) {
      if (!s || !s.user) throw fail('NOT_AUTHENTICATED');
      return s.user.id;
    });
  }

  function getProfile() {
    return run(function () {
      return currentUserId().then(function (uid) {
        return getClient().from('profiles').select('*').eq('id', uid).maybeSingle().then(unwrap).then(function (p) {
          if (p) return p;
          // No profile row yet (there is no signup trigger any more) -> create it server-side.
          // Never let a failure here turn a successful login into an error.
          return getClient().rpc('ensure_profile').then(unwrap).catch(function (e) {
            if (window.console) console.warn('ensure_profile failed:', e && e.message);
            return null;
          });
        });
      });
    });
  }

  var PROFILE_FIELDS = ['name', 'last_name', 'dob', 'email', 'mobile', 'account_type', 'business_type', 'business_name', 'gst_tin',
                        'atoll', 'city', 'onboarded', 'notifications_enabled'];
  function updateProfile(fields) {
    return run(function () {
      var patch = {};
      PROFILE_FIELDS.forEach(function (k) { if (fields && fields[k] !== undefined) patch[k] = fields[k]; });
      return currentUserId().then(function (uid) {
        return getClient().from('profiles').update(patch).eq('id', uid).select().single().then(unwrap);
      });
    });
  }

  // Called from the onboarding form submit
  function completeOnboarding(f) {
    return updateProfile({
      account_type: f.accountType,
      business_type: f.accountType === 'business' ? (f.businessType || null) : null,
      business_name: f.businessName || null,
      gst_tin: f.gstTin || null,
      city: f.city || null,
      atoll: f.atoll || null,
      onboarded: true
    });
  }

  // Staff-only dashboard display name (profiles.staff_name). Kept separate from
  // updateProfile()/PROFILE_FIELDS on purpose: this never touches the customer-
  // facing "name" (First Name) field, and vice versa — see 22_super_admin.sql.
  function updateStaffName(name) {
    return run(function () {
      return currentUserId().then(function (uid) {
        return getClient().from('profiles').update({ staff_name: String(name || '').trim() || null }).eq('id', uid).select().single().then(unwrap);
      });
    });
  }

  function deleteAccount() {
    return run(function () {
      return getClient().rpc('delete_my_account').then(unwrap).then(function () {
        return getClient().auth.signOut();
      });
    });
  }

  // ============================================================
  // Payment slip + orders
  // ============================================================
  function uploadPaymentSlip(file) {
    return run(function () {
      if (!file) throw fail('SLIP_REQUIRED');
      var ext = SLIP_TYPES[file.type];
      if (!ext) throw fail('SLIP_REQUIRED', 'Slip must be a JPG, PNG or PDF file.');
      if (file.size > SLIP_MAX_BYTES) throw fail('SLIP_REQUIRED', 'Slip must be 5 MB or smaller.');
      return currentUserId().then(function (uid) {
        var rand = Math.random().toString(36).slice(2, 8);
        var path = uid + '/' + Date.now() + '-' + rand + '.' + ext;
        return getClient().storage.from(SLIP_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
          .then(unwrap).then(function () { return path; });
      });
    });
  }

  // ============================================================
  // Product photos (staff upload, public bucket — customers see these directly)
  // ============================================================
  // Uploads a product photo the staff picked from their device to a PUBLIC
  // storage bucket and resolves with the public URL to save as image_url.
  // productId (optional) is used to keep the file name readable; pass '__new__'
  // or leave it out while adding a brand-new product that has no id yet.
  function uploadProductImage(file, productId) {
    return run(function () {
      if (!file) throw fail('IMAGE_REQUIRED');
      var ext = IMAGE_TYPES[file.type];
      if (!ext) throw fail('IMAGE_REQUIRED', 'Photo must be a JPG, PNG or WEBP file.');
      if (file.size > IMAGE_MAX_BYTES) throw fail('IMAGE_REQUIRED', 'Photo must be 5 MB or smaller.');
      var safeId = String(productId || 'new').replace(/[^a-zA-Z0-9_-]/g, '') || 'new';
      var rand = Math.random().toString(36).slice(2, 8);
      var path = safeId + '-' + Date.now() + '-' + rand + '.' + ext;
      return getClient().storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: true })
        .then(unwrap).then(function () {
          var pub = getClient().storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
          var url = pub && pub.data && pub.data.publicUrl;
          if (!url) throw fail('UNKNOWN', 'Uploaded, but could not get the photo link.');
          return url;
        });
    });
  }

  // opts = {
  //   cart: { MZ002: 2, MZ005: 1 }   (state.cart from script.js)  OR  items: [{product_id, qty}]
  //   currency, name, mobile, method: 'pickup'|'delivery'|'boat', location: {...},
  //   slipFile: File (or slipPath: a path returned earlier by uploadPaymentSlip), termsAccepted: true
  // }
  // Prices/totals are NOT sent — the server works them out.
  function createOrder(opts) {
    return run(function () {
      var items = opts.items || Object.keys(opts.cart || {}).map(function (id) {
        return { product_id: id, qty: opts.cart[id] };
      });
      // opts.slipPath lets you retry after an error WITHOUT uploading the slip again
      var slipStep = opts.slipPath ? Promise.resolve(opts.slipPath) : uploadPaymentSlip(opts.slipFile);
      return slipStep.then(function (slipPath) {
        var payload = {
          items: items,
          currency: opts.currency || 'MVR',
          customer: { name: opts.name, mobile: opts.mobile },
          method: opts.method,
          location: opts.location || {},
          terms_accepted: opts.termsAccepted === true,
          payment_slip_path: slipPath
        };
        return getClient().rpc('create_order', { payload: payload }).then(unwrap).then(normalizeOrder);
      });
    });
  }

  function listOrders() {
    return run(function () {
      return getClient().from('orders').select('*, order_items(*)')
        .order('placed_at', { ascending: false }).then(unwrap)
        .then(function (rows) { return (rows || []).map(normalizeOrder); });
    });
  }

  function getOrder(id) {
    return run(function () {
      return getClient().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle()
        .then(unwrap).then(normalizeOrder);
    });
  }

  function cancelOrder(id) {
    return run(function () {
      return getClient().rpc('cancel_order', { p_order_id: id }).then(unwrap).then(normalizeOrder);
    });
  }

  // Live status updates (replaces the demo timer). Returns an unsubscribe function.
  // cb(order) fires whenever one of the user's orders changes.
  function subscribeOrders(cb) {
    var channel = null, stopped = false;
    currentUserId().then(function (uid) {
      if (stopped) return;
      channel = getClient().channel('orders-' + uid)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'orders', filter: 'user_id=eq.' + uid },
            function () { getOrder(payloadId(arguments[0])).then(function (o) { if (o) cb(o); }).catch(function () {}); })
        .subscribe();
    }).catch(function () {});
    return function unsubscribe() {
      stopped = true;
      if (channel) getClient().removeChannel(channel);
    };
  }
  function payloadId(p) { return (p && p.new && p.new.id) || (p && p.old && p.old.id); }

  // Fires whenever ANY product row changes (staff edits stock/price/name/
  // image/active in admin -> Stock). No login needed: this listens for the
  // change and hands off to the caller (script.js re-pulls via listProducts,
  // which is subject to normal RLS so hidden products never leak).
  function subscribeProducts(cb) {
    var channel = getClient().channel('products-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, function () { cb(); })
      .subscribe();
    return function unsubscribe() {
      try { getClient().removeChannel(channel); } catch (e) {}
    };
  }

  // Fires whenever ANY profile row changes (a shopper edits their First/Last
  // Name in Personal Details, a Super Admin grants staff access, etc). Used
  // by admin.js -> Staff Access to stay live instead of waiting for the
  // 30s poll. Needs supabase/25_profiles_realtime.sql run once. RLS already
  // lets admins SELECT every profile row (see 01_schema.sql), so this only
  // ever reaches accounts with is_admin = true.
  function subscribeProfiles(cb) {
    var channel = getClient().channel('profiles-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, function (payload) { cb(payload); })
      .subscribe();
    return function unsubscribe() {
      try { getClient().removeChannel(channel); } catch (e) {}
    };
  }

  // ============================================================
  // Staff / admin (only works for profiles with is_admin = true)
  // ============================================================
  function adminListOrders(status) {
    return run(function () {
      var q = getClient().from('orders').select('*, order_items(*)').order('placed_at', { ascending: false });
      if (status) q = q.eq('status', status);
      return q.then(unwrap).then(function (rows) {
        return (rows || []).map(function (r) { var o = normalizeOrder(r); o.slipPath = r.payment_slip_path; o.userId = r.user_id; o.adminNote = r.admin_note; return o; });
      });
    });
  }
  function adminSetOrderStatus(id, status, extra) {
    extra = extra || {};
    return run(function () {
      return getClient().rpc('admin_set_order_status', {
        p_order_id: id, p_status: status,
        p_delivery_fee: extra.deliveryFee == null ? null : extra.deliveryFee,
        p_note: extra.note || null, p_refund_status: extra.refundStatus || null
      }).then(unwrap).then(normalizeOrder);
    });
  }
  function adminSetBusinessVerified(userId, verified) {
    return run(function () {
      return getClient().rpc('admin_set_business_verified', { p_user: userId, p_verified: !!verified }).then(unwrap);
    });
  }
  // ---- My Accounts approval (needs 11_shops_admin.sql) ----
  function adminListShops(status) {
    return run(function () {
      return getClient().rpc('admin_list_shops', { p_status: status || null }).then(unwrap).then(function (r) { return r || []; });
    });
  }
  function adminSetShopStatus(id, status) {
    return run(function () {
      return getClient().rpc('admin_set_shop_status', { p_shop: id, p_status: status }).then(unwrap);
    });
  }
  // ---- Staff access / Super Admin (needs supabase/22_super_admin.sql) ----
  function adminListAccounts() {
    return run(function () {
      return getClient().rpc('admin_list_accounts').then(unwrap).then(function (r) { return r || []; });
    });
  }
  function adminSetStaffAccess(userId, isAdmin) {
    return run(function () {
      return getClient().rpc('admin_set_staff_access', { p_user: userId, p_is_admin: !!isAdmin }).then(unwrap);
    });
  }
  function adminSetSuperAdmin(userId, isSuper) {
    return run(function () {
      return getClient().rpc('admin_set_super_admin', { p_user: userId, p_is_super: !!isSuper }).then(unwrap);
    });
  }
  // ---- stock control (needs supabase/08_stock.sql) ----
  function adminListProducts() {
    return run(function () {
      return getClient().from('products')
        .select('id,name,pack,unit,price,stock,stock_qty,active,category_id,icon,image_url')
        .order('name').then(unwrap);
    });
  }
  // opts: { add: 24 }  -> +24 units   |   { set: 100 } -> exactly 100 units
  function adminAdjustStock(productId, opts) {
    opts = opts || {};
    return run(function () {
      return getClient().rpc('admin_adjust_stock', {
        p_product_id: productId,
        p_add: opts.add == null ? null : Math.trunc(opts.add),
        p_set: opts.set == null ? null : Math.trunc(opts.set)
      }).then(unwrap);
    });
  }
  function adminListStockLog(limit) {
    return run(function () {
      return getClient().from('stock_log').select('*, products(name)')
        .order('created_at', { ascending: false }).limit(limit || 40).then(unwrap);
    });
  }
  // ---- product editing (needs supabase/09_product_edits.sql) ----
  // patch: { name, pack, unit, price, icon, active }
  function adminUpdateProduct(productId, patch) {
    patch = patch || {};
    return run(function () {
      return getClient().rpc('admin_update_product', {
        p_product_id: productId,
        p_name: patch.name == null ? null : String(patch.name).trim(),
        p_pack: patch.pack == null ? null : String(patch.pack).trim() || null,
        p_unit: patch.unit == null ? null : String(patch.unit).trim() || null,
        p_price: patch.price == null ? null : Number(patch.price),
        p_icon: patch.icon == null ? null : String(patch.icon).trim() || null,
        p_active: patch.active == null ? null : !!patch.active,
        p_image_url: patch.image_url == null ? null : String(patch.image_url).trim() || null
      }).then(unwrap);
    });
  }
  // ---- add a brand-new product (needs supabase/14_admin_add_product.sql) ----
  // fields: { id, name, category, pack, unit, price, icon, image_url, active }
  function adminAddProduct(fields) {
    fields = fields || {};
    return run(function () {
      return getClient().rpc('admin_add_product', {
        p_product_id: String(fields.id || '').trim(),
        p_name: String(fields.name || '').trim(),
        p_category_id: fields.category,
        p_pack: fields.pack == null ? null : String(fields.pack).trim() || null,
        p_unit: fields.unit == null ? null : String(fields.unit).trim() || null,
        p_price: Number(fields.price) || 0,
        p_icon: fields.icon == null ? null : String(fields.icon).trim() || null,
        p_image_url: fields.image_url == null ? null : String(fields.image_url).trim() || null,
        p_active: fields.active == null ? true : !!fields.active
      }).then(unwrap);
    });
  }
  function adminListProductEditLog(limit) {
    return run(function () {
      return getClient().from('product_edit_log').select('*, products(name), profiles(name,email)')
        .order('created_at', { ascending: false }).limit(limit || 40).then(unwrap);
    });
  }
  // ---- permanently remove a product (needs supabase/18_admin_delete_product.sql) ----
  function adminDeleteProduct(productId) {
    return run(function () {
      return getClient().rpc('admin_delete_product', { p_product_id: productId }).then(unwrap);
    });
  }
  // Temporary (5 min) link to view a private payment slip
  function getSlipUrl(path) {
    return run(function () {
      return getClient().storage.from(SLIP_BUCKET).createSignedUrl(path, 300).then(unwrap)
        .then(function (d) { return d.signedUrl; });
    });
  }

  // ============================================================
  // My Accounts (extra Business / Residence accounts under one login)
  // Table: public.shops  (see 10_shops.sql)
  // ============================================================
  var ACTIVE_SHOP_KEY = 'mazi_active_shop';
  function getActiveShopId() {
    try { return localStorage.getItem(ACTIVE_SHOP_KEY) || 'personal'; } catch (e) { return 'personal'; }
  }
  function setActiveShopId(id) {
    try { localStorage.setItem(ACTIVE_SHOP_KEY, id || 'personal'); } catch (e) {}
  }
  function listShops() {
    return run(function () {
      return getClient().from('shops').select('*').order('created_at', { ascending: true })
        .then(unwrap).then(function (rows) { return rows || []; });
    });
  }
  function addShop(f) {
    return run(function () {
      return currentUserId().then(function (uid) {
        var row = {
          user_id: uid,
          account_type: f.accountType === 'business' ? 'business' : 'residence',
          name: String(f.name || '').trim(),
          business_type: f.accountType === 'business' ? (f.businessType || null) : null,
          gst_tin: f.accountType === 'business' && !f.gstExempt ? (f.gstTin || null) : null,
          gst_exempt: f.accountType === 'business' ? !!f.gstExempt : false,
          atoll: f.atoll || null,
          city: f.city || null
        };
        return getClient().from('shops').insert(row).select().single().then(unwrap);
      });
    });
  }
  // Edit an existing business account. The server always resets it to
  // 'pending' — it needs a Super Admin's approval again after any change.
  function updateShop(id, f) {
    return run(function () {
      return getClient().rpc('update_my_shop', {
        p_id: id,
        p_name: String(f.name || '').trim(),
        p_business_type: f.businessType || null,
        p_gst_tin: !f.gstExempt ? (f.gstTin || null) : null,
        p_gst_exempt: !!f.gstExempt,
        p_atoll: f.atoll || null,
        p_city: f.city || null
      }).then(unwrap);
    });
  }

  window.MaziAPI = {
    get client() { return getClient(); },
    normalizeMobile: normalizeMobile,
    statusIndex: statusIndex,
    ORDER_STATUSES: ORDER_STATUSES,
    getConfig: getConfig, listCategories: listCategories, listProducts: listProducts,
    sendOtp: sendOtp, verifyOtp: verifyOtp, signInWithPassword: signInWithPassword,
    signUpWithPassword: signUpWithPassword, resendConfirmation: resendConfirmation,
    signInWithGoogle: signInWithGoogle,
    sendPasswordReset: sendPasswordReset, updatePassword: updatePassword, getSession: getSession, onAuthChange: onAuthChange, logout: logout,
    listShops: listShops, addShop: addShop, updateShop: updateShop, getActiveShopId: getActiveShopId, setActiveShopId: setActiveShopId,
    getProfile: getProfile, updateProfile: updateProfile, updateStaffName: updateStaffName, completeOnboarding: completeOnboarding, deleteAccount: deleteAccount,
    uploadPaymentSlip: uploadPaymentSlip, createOrder: createOrder, listOrders: listOrders, getOrder: getOrder,
    cancelOrder: cancelOrder, subscribeOrders: subscribeOrders, subscribeProducts: subscribeProducts, subscribeProfiles: subscribeProfiles,
    adminListOrders: adminListOrders, adminSetOrderStatus: adminSetOrderStatus,
    adminListShops: adminListShops, adminSetShopStatus: adminSetShopStatus,
    adminListAccounts: adminListAccounts, adminSetStaffAccess: adminSetStaffAccess, adminSetSuperAdmin: adminSetSuperAdmin,
    adminSetBusinessVerified: adminSetBusinessVerified, getSlipUrl: getSlipUrl,
    adminListProducts: adminListProducts, adminAdjustStock: adminAdjustStock, adminListStockLog: adminListStockLog,
    adminUpdateProduct: adminUpdateProduct, adminAddProduct: adminAddProduct, adminListProductEditLog: adminListProductEditLog,
    adminDeleteProduct: adminDeleteProduct,
    uploadProductImage: uploadProductImage
  };
})();
