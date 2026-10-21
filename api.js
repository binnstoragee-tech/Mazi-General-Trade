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
    INVALID_DISCOUNT: 'That discount is not valid (it cannot be negative, over 100%, or bigger than the item total).',
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
    CANNOT_REMOVE_SELF: 'You cannot remove your own admin access.',
    CANNOT_REMOVE_PRIMARY_SUPER_ADMIN: 'The primary Super Admin account cannot be removed.',
    LAST_SUPER_ADMIN: 'There must always be at least one Super Admin — make another account Super Admin first.',
    STOREFRONT_ACCOUNT: 'This is a shop account that has not requested admin access.',
    NOT_A_STAFF_REQUEST: 'This account has no pending admin-access request.',
    ALREADY_STAFF: 'This account already has admin access.',
    CUSTOMER_NOT_FOUND: 'That customer could not be found.',
    NAME_REQUIRED: 'Enter a customer name.',
    INVALID_PAYMENT_METHOD: 'Choose a valid payment method.',
    CREDIT_NEEDS_CUSTOMER: 'Choose a customer first — credit sales must be linked to a customer.',
    CREDIT_NOT_ALLOWED: 'This customer has no credit limit. Set a credit limit on the customer first.',
    CREDIT_LIMIT_EXCEEDED: 'This sale goes over the customer\'s credit limit.',
    INVALID_AMOUNT: 'Enter a valid amount.',
    PAYMENT_EXCEEDS_OUTSTANDING: 'That is more than the customer owes.',
    CUSTOMER_HAS_BALANCE: 'This customer still owes money. Collect the balance from Details first, then delete.'
  };

  // ---------- client ----------
  var client = null;
  function getClient() {
    if (client) return client;
    if (typeof window.supabase === 'undefined') throw fail('CONFIG', 'Supabase library did not load.');
    var url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
    if (!url || !key || String(url).indexOf('PASTE_YOUR') === 0) throw fail('CONFIG', 'supabase-config.js is not filled in.');
    // The staff dashboard sets window.MAZI_AUTH_STORAGE_KEY so staff and shopper
    // logins don't overwrite each other (both live on the same site/origin).
    var opts = window.MAZI_AUTH_STORAGE_KEY ? { auth: { storageKey: window.MAZI_AUTH_STORAGE_KEY } } : undefined;
    client = window.supabase.createClient(url, key, opts);
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
    if (/captcha/i.test(raw)) return fail('CAPTCHA_FAILED', 'The security check failed. Refresh the page and try again.');
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
      return { id: it.product_id, name: it.name, pack: it.pack, unit: it.unit, price: Number(it.price), qty: it.qty, discount: Number(it.discount) || 0 };
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
      // tracking info (columns exist after supabase/52_*.sql; null before that)
      statusUpdatedAt: o.status_updated_at ? new Date(o.status_updated_at).getTime() : null,
      shippedAt: o.shipped_at ? new Date(o.shipped_at).getTime() : null,
      deliveredAt: o.delivered_at ? new Date(o.delivered_at).getTime() : null,
      paymentStatus: o.payment_status || null,
      trackingNo: o.tracking_no || '',
      courier: o.courier || '',
      orderType: o.order_type || 'online',
      shopId: o.shop_id || null,   // business account this order was placed with (null = Personal)
      customerId: o.customer_id || null,
      paymentMethod: o.payment_method || (o.order_type === 'walkin' ? 'cash' : 'transfer'),
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
          // Only trust image_url from the database when it's a real uploaded
          // Storage URL (http/https) — some rows still carry stale, old-style
          // relative paths from early seed data (full product names + .jpg)
          // that never matched the actual files on disk. For anything else,
          // always resolve to the known img/household&cleaning/<id>.png
          // convention that every current product photo actually uses.
          var isUploadedUrl = p.image_url && /^https?:\/\//i.test(p.image_url);
          out.img = isUploadedUrl ? p.image_url : ('img/household&cleaning/' + p.id + '.png');
          return out;
        });
      });
    });
  }

  // ============================================================
  // Bot protection (Cloudflare Turnstile) - OFF until a site key is set.
  // Set  window.MAZI_TURNSTILE_SITEKEY  in supabase-config.js, then switch on
  // CAPTCHA protection in Supabase (Authentication -> Attack Protection).
  // With no key nothing changes. The widget is invisible unless Cloudflare
  // decides a visitor needs to prove they are human.
  // ============================================================
  var TS_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var tsLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (tsLoading) return tsLoading;
    tsLoading = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = TS_URL; sc.async = true;
      sc.onload = function () { resolve(); };
      sc.onerror = function () { tsLoading = null; reject(fail('CAPTCHA_FAILED', 'The security check could not load. Check your connection and try again.')); };
      document.head.appendChild(sc);
    });
    return tsLoading;
  }
  function getCaptchaToken() {
    var key = String(window.MAZI_TURNSTILE_SITEKEY || '').trim();
    if (!key) return Promise.resolve(undefined);
    return loadTurnstile().then(function () {
      return new Promise(function (resolve, reject) {
        var host = document.getElementById('mazi-captcha');
        if (!host) {
          host = document.createElement('div');
          host.id = 'mazi-captcha';
          host.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000';
          document.body.appendChild(host);
        }
        var wid = null, settled = false;
        function end(fn, v) {
          if (settled) return; settled = true;
          clearTimeout(tm);
          try { if (wid != null) window.turnstile.remove(wid); } catch (e) {}
          fn(v);
        }
        var tm = setTimeout(function () { end(reject, fail('CAPTCHA_FAILED', 'The security check timed out. Please try again.')); }, 60000);
        try {
          wid = window.turnstile.render(host, {
            sitekey: key,
            appearance: 'interaction-only',
            callback: function (tok) { end(resolve, tok); },
            'error-callback': function () { end(reject, fail('CAPTCHA_FAILED', 'The security check failed. Refresh the page and try again.')); },
            'timeout-callback': function () { end(reject, fail('CAPTCHA_FAILED', 'The security check timed out. Please try again.')); }
          });
        } catch (e) { end(reject, fail('CAPTCHA_FAILED', 'The security check could not start. Refresh the page and try again.')); }
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
      return getCaptchaToken().then(function (cap) {
        return getClient().auth.signInWithOtp({ phone: phone, options: { captchaToken: cap } });
      }).then(unwrap).then(function () {
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
    return run(function () { return getClient().auth.signOut({ scope: 'local' }).then(unwrap); }); // this device only
  }

  function authResult(data) {
    // Same rule as the Google path: a profile-read failure must not turn a valid login into an error.
    var profileFailed = false;
    return getProfile().catch(function (e) {
      profileFailed = true;
      if (window.console) console.error('Login: could not load profile:', e && e.message, e);
      return null;
    }).then(function (profile) {
      if (profileFailed) return { user: data.user, profile: null, isNewUser: false };
      // Auth is the source of truth for the signed-in email. Older profile rows
      // can retain a previous email because ensure_profile() does not overwrite
      // an existing profiles.email value.
      var authEmail = data && data.user && data.user.email;
      var effectiveProfile = profile && authEmail && profile.email !== authEmail
        ? Object.assign({}, profile, { email: authEmail })
        : profile;
      return { user: data.user, profile: effectiveProfile, isNewUser: !effectiveProfile || !effectiveProfile.onboarded };
    });
  }

  function signInWithPassword(email, password) {
    return run(function () {
      return getCaptchaToken().then(function (cap) {
        return getClient().auth.signInWithPassword({ email: String(email).trim(), password: String(password), options: { captchaToken: cap } });
      }).then(unwrap).then(authResult);
    });
  }

  // "Continue with Google" — redirects the shopper to Google's sign-in
  // page, then back here already signed in. Google verifies the email
  // itself, so no confirmation email step is needed for this path.
  function signInWithGoogle(redirectPath) {
    if (!redirectPath) { try { sessionStorage.removeItem('mazi_admin_google_claim'); } catch (e0) {} }   // shop login: drop any stale staff flag
    return run(function () {
      var redirectTo = redirectPath
        ? new URL(String(redirectPath).replace(/^\/+/, ''), window.location.href).href
        : redirectUrl();
      return getClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo }
      }).then(unwrap).then(function (data) {
        // Supabase normally redirects automatically. Explicitly navigating to
        // the returned URL also covers deployments/browser modes where the
        // client returns the OAuth URL without performing the navigation.
        if (data && data.url && window.location.href !== data.url) window.location.assign(data.url);
        return data;
      });
    });
  }

  // Where the confirmation link in the email sends the shopper back to (this site).
  function redirectUrl() {
    return /^https?:$/.test(window.location.protocol) ? window.location.origin + '/' : undefined;
  }

  function signUpWithPassword(email, password, mobile, name, source) {
    return run(function () {
      return getCaptchaToken().then(function (cap) {
        return getClient().auth.signUp({
          email: String(email).trim(),
          password: String(password),
          options: { data: { mobile: mobile || null, name: name || null, source: source || 'storefront' }, emailRedirectTo: redirectUrl(), captchaToken: cap }
        });
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
      return getCaptchaToken().then(function (cap) {
        return getClient().auth.resend({
          type: 'signup',
          email: String(email).trim(),
          options: { emailRedirectTo: redirectUrl(), captchaToken: cap }
        });
      }).then(unwrap).then(function () { return { sent: true }; });
    });
  }

  // Forgot password: emails a reset link that brings the shopper back to this
  // site with #access_token=...&type=recovery (handled in script.js).
  // Supabase answers the same way whether or not the email has an account.
  function sendPasswordReset(email) {
    return run(function () {
      return getCaptchaToken().then(function (cap) {
        return getClient().auth.resetPasswordForEmail(String(email).trim(), { redirectTo: redirectUrl(), captchaToken: cap });
      }).then(unwrap).then(function () { return { sent: true }; });
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

  // A Google user who starts from admin.html is marked as an admin-signup
  // candidate, but is still denied entry until a Super Admin grants is_admin.
  function claimAdminSignup() {
    return run(function () {
      return getClient().rpc('claim_admin_signup').then(unwrap);
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
        // which account the order is for: 'personal' (residential pricing) or a business account (shop_id)
        if (opts.shopId) { payload.shop_id = opts.shopId; payload.account = 'business'; }
        else if (opts.account === 'personal') { payload.account = 'personal'; }
        return getClient().rpc('create_order', { payload: payload }).then(unwrap).then(normalizeOrder);
      });
    });
  }

  // "My Orders" = ONLY the signed-in account's own orders. The query used to rely on RLS
  // alone, but RLS also lets staff/admin accounts read EVERY order — so a staff member
  // browsing the store saw all walk-in (POS) sales and other customers' orders in their
  // own My Orders. Walk-in sales have user_id = NULL, so this filter excludes them.
  function listOrders() {
    return run(function () {
      return currentUserId().then(function (uid) {
        if (!uid) return [];
        return getClient().from('orders').select('*, order_items(*)')
          .eq('user_id', uid).eq('order_type', 'online')
          .order('placed_at', { ascending: false }).then(unwrap)
          .then(function (rows) {
            var list = (rows || []).map(normalizeOrder);
            if (!list.length) return list;
            // Per-step timestamps for the tracking timeline. Optional: if the
            // order_status_history table isn't there yet, the card falls back
            // to placed/updated times and still works.
            return getClient().from('order_status_history')
              .select('order_id,status,note,created_at')
              .in('order_id', list.map(function (o) { return o.id; }))
              .order('created_at', { ascending: true })
              .then(function (res) {
                var by = {};
                if (res && !res.error && res.data) {
                  res.data.forEach(function (h) {
                    (by[h.order_id] = by[h.order_id] || []).push({ status: h.status, note: h.note || '', at: new Date(h.created_at).getTime() });
                  });
                }
                list.forEach(function (o) { o.history = by[o.id] || []; });
                return list;
              }, function () { list.forEach(function (o) { o.history = []; }); return list; });
          });
      });
    });
  }

  function getOrder(id) {
    return run(function () {
      // own orders only (see listOrders) — never another account's, even for staff
      return currentUserId().then(function (uid) {
        return getClient().from('orders').select('*, order_items(*)').eq('id', id).eq('user_id', uid).maybeSingle()
          .then(unwrap).then(normalizeOrder);
      });
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
    // 'products' announces edits; 'live_ping' (touched by a trigger on every product change,
    // see 59_realtime_everything.sql) also announces a product being HIDDEN, which realtime
    // cannot send for the products table itself because the row is no longer visible to shoppers.
    var channel = getClient().channel('products-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, function () { cb(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_ping' }, function () { cb(); })
      .subscribe();
    return function unsubscribe() {
      try { getClient().removeChannel(channel); } catch (e) {}
    };
  }

  // Fires whenever a shared setting (app_config) is saved on the staff Settings page, so the
  // storefront can re-read it and update itself live. Needs supabase/48_settings_live.sql run once
  // (adds app_config to the realtime publication); site-config.js also polls as a fallback.
  function subscribeConfig(cb) {
    var channel = getClient().channel('config-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, function () { cb(); })
      .subscribe();
    return function unsubscribe() {
      try { getClient().removeChannel(channel); } catch (e) {}
    };
  }

  // Business accounts (public.shops), live. A shopper (default) hears only about THEIR OWN
  // accounts (approved / rejected by staff); pass {all:true} from the admin dashboard to hear about
  // every account (new requests). cb(payload) gets the realtime payload. Needs 59_realtime_everything.sql.
  // Returns an unsubscribe function.
  function subscribeShops(cb, opts) {
    var channel = null, stopped = false;
    function go(filter) {
      if (stopped) return;
      var spec = { event: '*', schema: 'public', table: 'shops' };
      if (filter) spec.filter = filter;
      channel = getClient().channel('shops-live-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', spec, function (payload) { try { cb(payload); } catch (e) {} })
        .subscribe();
    }
    if (opts && opts.all) go(null);
    else currentUserId().then(function (uid) { go('user_id=eq.' + uid); }).catch(function () {});
    return function unsubscribe() {
      stopped = true;
      try { if (channel) getClient().removeChannel(channel); } catch (e) {}
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

  // Realtime order updates for staff/admin (ALL orders, not just one user's —
  // that's subscribeOrders above, used by the customer-facing live tracker).
  // RLS (orders_select, see 01_schema.sql) already limits what any given
  // account receives to user_id = self OR is_admin() = true, so a staff
  // account only ever hears about the full order stream, same as a normal
  // adminListOrders() call would return. Requires public.orders to be in the
  // supabase_realtime publication (already done in 01_schema.sql, section 9).
  function subscribeAdminOrders(cb) {
    var channel = getClient().channel('orders-live-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function (payload) { cb(payload); })
      .subscribe();
    return function unsubscribe() {
      try { getClient().removeChannel(channel); } catch (e) {}
    };
  }

  // ============================================================
  // Staff / admin (only works for profiles with is_admin = true)
  // ============================================================
  // Adds, to every ONLINE order: o.ownerProfile (the login's profile when it is a staff/admin
  // account) and o.handledByProfile (the staff member who last moved the order forward, from
  // order_status_history.actor_id). Best effort: if anything fails the list is returned as is.
  function attachOrderActors(list) {
    var online = list.filter(function (o) { return o.orderType !== 'walkin'; });
    if (!online.length) return Promise.resolve(list);
    return Promise.all([
      getClient().from('order_status_history').select('order_id,status,actor_id,created_at')
        .order('created_at', { ascending: false }).limit(5000).then(unwrap),
      getClient().from('profiles').select('id,name,last_name,staff_name,email,is_admin,is_super_admin').eq('is_admin', true).then(unwrap),
      // the login that CREATED each online order (staff or shopper) so the Staff filter can list them
      (function () {
        var ids = {}; online.forEach(function (o) { if (o.userId) ids[o.userId] = 1; });
        ids = Object.keys(ids);
        if (!ids.length) return Promise.resolve([]);
        return getClient().from('profiles').select('id,name,last_name,staff_name,email,is_admin,is_super_admin').in('id', ids).then(unwrap).catch(function () { return []; });
      })()
    ]).then(function (res) {
      var staff = {}; (res[1] || []).forEach(function (p) { staff[p.id] = p; });
      var owners = {}; (res[2] || []).forEach(function (p) { owners[p.id] = p; });
      var last = {};
      (res[0] || []).forEach(function (r) {            // newest first: the first hit per order is the latest
        if (r.status === 'placed' || !r.actor_id || !staff[r.actor_id] || last[r.order_id]) return;
        last[r.order_id] = staff[r.actor_id];
      });
      online.forEach(function (o) { o.ownerProfile = staff[o.userId] || owners[o.userId] || null; o.handledByProfile = last[o.id] || null; });
      return list;
    }).catch(function () { return list; });
  }
  function adminListOrders(status) {
    return run(function () {
      function build(sel) {
        var q = getClient().from('orders').select(sel).order('placed_at', { ascending: false });
        if (status) q = q.eq('status', status);
        return q.then(unwrap);
      }
      function mapRows(rows) {
        return (rows || []).map(function (r) {
          var o = normalizeOrder(r); o.slipPath = r.payment_slip_path; o.userId = r.user_id; o.adminNote = r.admin_note;
          // who created it (staff who rang up a walk-in / POS sale)
          var cr = r.creator;
          o.account = r.shop ? { name: r.shop.name, type: r.shop.account_type, businessType: r.shop.business_type,
                                 gst: r.shop.gst_exempt ? 'Not GST registered' : (r.shop.gst_tin || '') } : null;
          o.createdBy = r.created_by || null;
          o.deletedAt = r.deleted_at ? new Date(r.deleted_at).getTime() : null;
          o.createdByName = cr ? (cr.staff_name || [cr.name, cr.last_name].filter(Boolean).join(' ').trim() || String(cr.email || '').split('@')[0] || '') : '';
          return o;
        });
      }
      var CR = 'creator:profiles!orders_created_by_fkey(name,last_name,staff_name,email)';
      var SH = 'shop:shops!orders_shop_id_fkey(name,account_type,business_type,gst_tin,gst_exempt)';
      // embed the creator + the business account; if a join is ever refused, fall back step by step
      return build('*, order_items(*), ' + CR + ', ' + SH)
        .catch(function () { return build('*, order_items(*), ' + CR); })
        .catch(function () { return build('*, order_items(*)'); })
        .then(mapRows)
        .then(attachOrderActors);
    });
  }
  function adminTrashOrder(id) { return run(function () { return getClient().rpc('admin_trash_order', { p_id: id }).then(unwrap); }); }
  function adminRestoreOrder(id) { return run(function () { return getClient().rpc('admin_restore_order', { p_id: id }).then(unwrap); }); }
  function adminPurgeOrder(id) { return run(function () { return getClient().rpc('admin_purge_order', { p_id: id }).then(unwrap); }); }
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
  function adminListProfileChanges(limit) {
    return run(function () {
      return getClient().rpc('admin_list_profile_changes', { p_limit: limit || 200 }).then(unwrap).then(function (r) { return r || []; }).catch(function (rpcErr) {
        // Older deployments may have the audit table but not the RPC yet.
        // The RLS policy in 26_profile_change_audit.sql permits this fallback
        // only to the authenticated Super Admin.
        return getClient().from('profile_change_audit').select('*').order('changed_at', { ascending: false }).limit(limit || 200).then(unwrap).catch(function () { throw rpcErr; });
      });
    });
  }
  // ---- Staff access / Super Admin (needs supabase/22_super_admin.sql) ----
  function adminListAccounts() {
    return run(function () {
      return getClient().rpc('admin_list_accounts').then(unwrap).then(function (r) { return r || []; });
    });
  }
  // Every approved staff account (id + names only). Any staff login may read this: the
  // profiles_select policy lets admins read all profiles. Feeds the Orders "Created by" filter.
  function listStaffProfiles() {
    return run(function () {
      return getClient().from('profiles').select('id,name,last_name,staff_name,email,is_admin,is_super_admin').eq('is_admin', true).then(unwrap).then(function (r) { return r || []; });
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
  // ---- reject/delete a pending Admin Sign Up request (needs supabase/32_admin_delete_signup_request.sql) ----
  function adminDeleteSignupRequest(userId) {
    return run(function () {
      return getClient().rpc('admin_delete_signup_request', { p_user: userId }).then(unwrap);
    });
  }
  // ---- customer (shop) account asks for staff access (needs supabase/41_staff_access_request.sql) ----
  // Uses a separate flag (profiles.staff_requested); never touches signup_source
  // and never deletes anything. Dashboard stays locked until a Super Admin approves.
  function requestStaffAccess() {
    return run(function () {
      return getClient().rpc('request_staff_access').then(unwrap);
    });
  }
  function cancelStaffRequest() {
    return run(function () {
      return getClient().rpc('cancel_staff_request').then(unwrap);
    });
  }
  function adminDeclineStaffRequest(userId) {
    return run(function () {
      return getClient().rpc('admin_decline_staff_request', { p_user: userId }).then(unwrap);
    });
  }
  // ---- stock control (needs supabase/08_stock.sql) ----
  function adminListProducts() {
    return run(function () {
      function q(cols) { return getClient().from('products').select(cols).order('name').then(unwrap); }
      var base = 'id,name,pack,unit,price,stock,stock_qty,active,category_id,icon,image_url';
      // deleted_at needs 61_recycle_bin_products.sql; fall back so the Stock page works before it is run
      return q(base + ',deleted_at').catch(function () { return q(base); });
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
  // One step: every (non-deleted) product gets this stock. Needs supabase/62_admin_set_all_stock.sql.
  function adminSetAllStock(qty) {
    return run(function () {
      return getClient().rpc('admin_set_all_stock', { p_qty: Math.trunc(qty) }).then(unwrap);
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
  function adminRestoreProduct(id) { return run(function () { return getClient().rpc('admin_restore_product', { p_product_id: id }).then(unwrap); }); }
  function adminPurgeProduct(id) { return run(function () { return getClient().rpc('admin_purge_product', { p_product_id: id }).then(unwrap); }); }
  // ============================================================
  // Walk-in POS (needs supabase/36_walkin_pos.sql)
  // Admin-only: create a walk-in sale directly, or a quotation first.
  // opts = { cart:{productId:qty} OR items:[{product_id,qty,disc_type,disc_value}], disc:{productId:{type,value}}, name, mobile, note }
  // ============================================================
  function posPayload(opts) {
    opts = opts || {};
    var items = opts.items || Object.keys(opts.cart || {}).map(function (id) {
      var it = { product_id: id, qty: opts.cart[id] };
      var d = opts.disc && opts.disc[id];                       // { type:'amount'|'percent', value:number } — optional
      if (d && Number(d.value) > 0) { it.disc_type = d.type === 'percent' ? 'percent' : 'amount'; it.disc_value = Math.round(Number(d.value) * 100) / 100; }
      return it;
    });
    return {
      items: items, customer: { name: opts.name || '', mobile: opts.mobile || '' }, note: opts.note || '',
      customer_id: opts.customerId || null, payment_method: opts.paymentMethod || 'cash'
    };
  }
  function normalizeQuotation(q) {
    if (!q) return null;
    var items = (q.items || q.quotation_items || []).map(function (it) {
      return { id: it.product_id, name: it.name, pack: it.pack, unit: it.unit, price: Number(it.price), qty: it.qty, discount: Number(it.discount) || 0 };
    });
    var customer = q.customer || { name: q.customer_name, mobile: q.customer_mobile };
    return {
      id: q.id,
      status: q.status,
      createdAt: new Date(q.created_at || Date.now()).getTime(),
      items: items,
      subtotal: Number(q.subtotal),
      gst: Number(q.gst),
      total: Number(q.total),
      note: q.note || '',
      convertedOrderId: q.converted_order_id || null,
      customerId: q.customer_id || null,
      customer: { name: customer.name, mobile: customer.mobile }
    };
  }
  // Confirmed walk-in sale — takes stock off immediately (same rules as an
  // online order: not enough stock raises INSUFFICIENT_STOCK / OUT_OF_STOCK-
  // style errors and nothing is saved).
  function adminCreateWalkinOrder(opts) {
    return run(function () {
      return getClient().rpc('admin_create_walkin_order', { payload: posPayload(opts) }).then(unwrap).then(normalizeOrder);
    });
  }
  // Quotation only — no stock impact. Convert it later with adminConvertQuotation.
  function adminCreateQuotation(opts) {
    return run(function () {
      return getClient().rpc('admin_create_quotation', { payload: posPayload(opts) }).then(unwrap).then(normalizeQuotation);
    });
  }
  // Turns an OPEN quotation into a real walk-in order (stock moves now, at
  // conversion time). Returns the new order.
  function adminConvertQuotation(quotationId, paymentMethod) {
    return run(function () {
      return getClient().rpc('admin_convert_quotation', { p_id: quotationId, p_payment_method: paymentMethod || 'cash' }).then(unwrap).then(normalizeOrder);
    });
  }
  function adminVoidQuotation(quotationId) {
    return run(function () {
      return getClient().rpc('admin_void_quotation', { p_id: quotationId }).then(unwrap).then(normalizeQuotation);
    });
  }
  function adminListQuotations(status) {
    return run(function () {
      var q = getClient().from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      return q.then(unwrap).then(function (rows) { return (rows || []).map(normalizeQuotation); });
    });
  }

  // ============================================================
  // Customers (needs supabase/38_customers.sql)
  // Admin-only: real customer records with credit limit, used by POS.
  // opts = { name, mobile, email, address, taxNumber, creditLimit, priceLevel, note }
  // ============================================================
  function customerPayload(opts) {
    opts = opts || {};
    return {
      name: opts.name || '', mobile: opts.mobile || '', email: opts.email || '',
      address: opts.address || '', tax_number: opts.taxNumber || '',
      credit_limit: opts.creditLimit || 0, price_level: opts.priceLevel || '', note: opts.note || ''
    };
  }
  function normalizeCustomer(c) {
    if (!c) return null;
    return {
      id: c.id, name: c.name, mobile: c.mobile || '', email: c.email || '',
      address: c.address || '', taxNumber: c.tax_number || '',
      creditLimit: Number(c.credit_limit || 0), priceLevel: c.price_level || '', note: c.note || '',
      totalSpent: Number(c.total_spent || 0), outstanding: Number(c.outstanding || 0),
      createdAt: new Date(c.created_at || Date.now()).getTime(),
      deletedAt: c.deleted_at ? new Date(c.deleted_at).getTime() : null
    };
  }
  // Shared system settings live in app_config (key -> jsonb). Reading is public (getConfig);
  // writing is Super Admin only (see supabase/47_app_settings.sql). values = { key: jsonValue }
  function adminSaveConfig(values) {
    return run(function () {
      var rows = Object.keys(values || {}).map(function (k) { return { key: k, value: values[k] }; });
      if (!rows.length) return [];
      return getClient().from('app_config').upsert(rows, { onConflict: 'key' }).select().then(unwrap);
    });
  }
  function adminListCustomers() {
    return run(function () {
      return getClient().rpc('admin_list_customers').then(unwrap)
        .then(function (rows) { return (rows || []).map(normalizeCustomer); });
    });
  }
  function adminCreateCustomer(opts) {
    return run(function () {
      return getClient().rpc('admin_create_customer', { payload: customerPayload(opts) }).then(unwrap).then(normalizeCustomer);
    });
  }
  // Customer page: profile + every sale + payments received (needs 43_customer_credit.sql)
  function adminCustomerDetail(id) {
    return run(function () {
      return getClient().rpc('admin_customer_detail', { p_id: id }).then(unwrap).then(normalizeCustomerDetail);
    });
  }
  // Customer pays off (part of) what they owe. method = cash | card | transfer
  function adminReceiveCustomerPayment(id, amount, method, note) {
    return run(function () {
      return getClient().rpc('admin_receive_customer_payment', {
        p_customer_id: id, p_amount: Number(amount), p_method: method || 'cash', p_note: note || ''
      }).then(unwrap).then(normalizeCustomerDetail);
    });
  }
  function normalizeCustomerDetail(d) {
    if (!d) return null;
    return {
      customer: normalizeCustomer(d.customer),
      orders: (d.orders || []).map(function (o) {
        return { id: o.id, placedAt: new Date(o.placed_at).getTime(), status: o.status, orderType: o.order_type,
                 paymentMethod: o.payment_method, total: Number(o.total), paid: Number(o.paid || 0) };
      }),
      payments: (d.payments || []).map(function (p) {
        return { id: p.id, amount: Number(p.amount), method: p.method, note: p.note || '',
                 createdAt: new Date(p.created_at).getTime(), receivedBy: p.received_by || '' };
      })
    };
  }
  function adminUpdateCustomer(id, opts) {
    return run(function () {
      return getClient().rpc('admin_update_customer', { p_id: id, payload: customerPayload(opts) }).then(unwrap).then(normalizeCustomer);
    });
  }

  // Delete = hide into History (soft delete, needs 44_customer_delete_restore.sql). Restore brings it back.
  function adminDeleteCustomer(id) {
    return run(function () {
      return getClient().rpc('admin_delete_customer', { p_id: id }).then(unwrap).then(normalizeCustomer);
    });
  }
  function adminRestoreCustomer(id) {
    return run(function () {
      return getClient().rpc('admin_restore_customer', { p_id: id }).then(unwrap).then(normalizeCustomer);
    });
  }
  // Permanently remove a customer that is already in History (needs 49_customer_purge.sql).
  function adminPurgeCustomer(id) {
    return run(function () {
      return getClient().rpc('admin_purge_customer', { p_id: id }).then(unwrap);
    });
  }

  // Temporary (5 min) link to view a private payment slip
  function getSlipUrl(path) {
    if (!path) return Promise.reject(new Error('No payment slip for this order.'));
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
      // Only THIS login's own accounts. RLS alone is not enough: staff/admin logins can read
      // every shop (policy shops_select_admin), so we must filter by user_id here too.
      return currentUserId().then(function (uid) {
        return getClient().from('shops').select('*').eq('user_id', uid).order('created_at', { ascending: true });
      }).then(unwrap).then(function (rows) { return rows || []; });
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
    getConfig: getConfig, subscribeConfig: subscribeConfig, listCategories: listCategories, listProducts: listProducts,
    sendOtp: sendOtp, verifyOtp: verifyOtp, getCaptchaToken: getCaptchaToken, signInWithPassword: signInWithPassword,
    signUpWithPassword: signUpWithPassword, resendConfirmation: resendConfirmation,
    signInWithGoogle: signInWithGoogle,
    sendPasswordReset: sendPasswordReset, updatePassword: updatePassword, getSession: getSession, onAuthChange: onAuthChange, logout: logout,
    listShops: listShops, subscribeShops: subscribeShops, addShop: addShop, updateShop: updateShop, getActiveShopId: getActiveShopId, setActiveShopId: setActiveShopId,
    getProfile: getProfile, claimAdminSignup: claimAdminSignup, updateProfile: updateProfile, updateStaffName: updateStaffName, completeOnboarding: completeOnboarding, deleteAccount: deleteAccount,
    uploadPaymentSlip: uploadPaymentSlip, createOrder: createOrder, listOrders: listOrders, getOrder: getOrder,
    cancelOrder: cancelOrder, subscribeOrders: subscribeOrders, subscribeAdminOrders: subscribeAdminOrders, subscribeProducts: subscribeProducts, subscribeProfiles: subscribeProfiles,
    adminListOrders: adminListOrders, adminSetOrderStatus: adminSetOrderStatus,
    adminTrashOrder: adminTrashOrder, adminRestoreOrder: adminRestoreOrder, adminPurgeOrder: adminPurgeOrder,
    adminListShops: adminListShops, adminSetShopStatus: adminSetShopStatus, adminListProfileChanges: adminListProfileChanges,
    adminListAccounts: adminListAccounts, listStaffProfiles: listStaffProfiles, adminSetStaffAccess: adminSetStaffAccess, adminSetSuperAdmin: adminSetSuperAdmin,
    adminDeleteSignupRequest: adminDeleteSignupRequest,
    requestStaffAccess: requestStaffAccess, cancelStaffRequest: cancelStaffRequest, adminDeclineStaffRequest: adminDeclineStaffRequest,
    adminSetBusinessVerified: adminSetBusinessVerified, getSlipUrl: getSlipUrl,
    adminListProducts: adminListProducts, adminAdjustStock: adminAdjustStock, adminSetAllStock: adminSetAllStock, adminListStockLog: adminListStockLog,
    adminUpdateProduct: adminUpdateProduct, adminAddProduct: adminAddProduct, adminListProductEditLog: adminListProductEditLog,
    adminDeleteProduct: adminDeleteProduct, adminRestoreProduct: adminRestoreProduct, adminPurgeProduct: adminPurgeProduct,
    uploadProductImage: uploadProductImage,
    adminCreateWalkinOrder: adminCreateWalkinOrder, adminCreateQuotation: adminCreateQuotation,
    adminConvertQuotation: adminConvertQuotation, adminVoidQuotation: adminVoidQuotation,
    adminListQuotations: adminListQuotations,
    adminSaveConfig: adminSaveConfig,
    adminListCustomers: adminListCustomers, adminCreateCustomer: adminCreateCustomer, adminUpdateCustomer: adminUpdateCustomer,
    adminCustomerDetail: adminCustomerDetail, adminReceiveCustomerPayment: adminReceiveCustomerPayment,
    adminDeleteCustomer: adminDeleteCustomer, adminRestoreCustomer: adminRestoreCustomer,
    adminPurgeCustomer: adminPurgeCustomer
  };
})();
