/* ============================================
   MAZI GENERAL TRADE — store logic
============================================ */

/* ---------- Supabase ----------
   The one and only Supabase client lives in api.js (window.MaziAPI.client).
   A second client used to be created here too, but nothing used it and it
   made Supabase warn about "Multiple GoTrueClient instances" (two clients
   fighting over the same login session). */

// Collapses bursts of resize events (window drag-resize, mobile keyboard
// open/close, orientation change) down to one call per animation frame
// instead of running the handler dozens of times a second — this is what
// was making layout math (thumb/carousel/nav positioning) feel janky on
// lower-end phones.
function rafDebounce(fn){
  let scheduled = false;
  return function (...args){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(()=>{
      scheduled = false;
      fn.apply(this, args);
    });
  };
}

/* ---------- Category data ---------- */
const CATEGORIES = [
  { id: 'dairy',        name: 'Dairy' },
  { id: 'tea',          name: 'Tea' },
  { id: 'coffee',       name: 'Coffee & Instants' },
  { id: 'beverages',    name: 'Beverages' },
  { id: 'dried-fruits', name: 'Dates & Dried Fruits' },
  { id: 'grains',       name: 'Grains, Cereals & Spreads' },
  { id: 'confectionary',name: 'Confectionary & Snacks' },
  { id: 'canned',       name: 'Canned Foods' },
  { id: 'cooking',      name: 'Cooking & Baking' },
  { id: 'personal-care',name: 'Personal Care' },
  { id: 'sauces',       name: 'Sauces & Oils' },
  { id: 'household',    name: 'Household & Cleaning' },
];

/* ---------- Product data ---------- */
const PRODUCTS = [
  /* Daiwa, Sanzoft, Carefor, R-Fresh, Pinto. id = backend code, name = backend name.
     Prices = Sept 2026 shipment invoice MD2026-001 (CIF, USD) x 15.42 MVR/USD.
     Photos: all in img/household&cleaning/ (new ones named <product code>.png, from the supplier packing list).
     KEEP THIS LIST IDENTICAL in script.js and checkout.js. */
  { id:'108DW10103', name:'DAIWA DISINFECTANT DEODORIZER 3500 ML. , (1 X 4) CTN', cat:'household', icon:'🧴', pack:'Carton', unit:'1 x 4', price:237.53, stock:'in', img:'img/household&cleaning/108DW10103.png' },
  { id:'104DW40405', name:'DAIWA FLOOR CLEANER 3800 ML.-AQUA BLUE , (1 X 4) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 4', price:203.85, stock:'in', img:'img/household&cleaning/104DW40405.png' },
  { id:'104DW10107', name:'DAIWA FLOOR CLEANER 3800 ML.-FLORAL MIST SCENT , (1 X 4) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 4', price:203.85, stock:'in', img:'img/household&cleaning/104DW10107.png' },
  { id:'104DW20205', name:'DAIWA FLOOR CLEANER 3800 ML.-LAVENDER SCENT , (1 X 4) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 4', price:203.85, stock:'in', img:'img/household&cleaning/104DW20205.png' },
  { id:'104DW30305', name:'DAIWA FLOOR CLEANER 3800 ML.-LEMON SCENT , (1 X 4) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 4', price:203.85, stock:'in', img:'img/household&cleaning/104DW30305.png' },
  { id:'001SZ10108', name:'SANZOFT FABRIC SOFTENER 3800 ML.-LOVELY PINK (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:165.3, stock:'in', img:'img/household&cleaning/001SZ10108.png' },
  { id:'001SZ30307', name:'SANZOFT FABRIC SOFTENER 3800 ML.-SENSE OF VIOLET (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:165.3, stock:'in', img:'img/household&cleaning/001SZ30307.png' },
  { id:'001SZ20208', name:'SANZOFT FABRIC SOFTENER 3800 ML.-SOFTLY TOUCH (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:165.3, stock:'in', img:'img/household&cleaning/001SZ20208.png' },
  { id:'006SZSB020201N', name:'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-MYSTICAL PERFUME (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:304.08, stock:'in', img:'img/household&cleaning/006SZSB020201N.png' },
  { id:'006SZ000204N', name:'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-PINK ROSE SCENT (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:304.08, stock:'in', img:'img/household&cleaning/006SZ000204N.png' },
  { id:'006SZ000305', name:'SANZOFT LAUNDRY LIQUID DETERGENT 5000 ML.-VIOLET SCENT (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:304.08, stock:'in', img:'img/household&cleaning/006SZ000305.png' },
  { id:'606SZ000401', name:'SANZOFT SENSATION SPRAY 270 ML. - BLUE, (1 X 12) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 12', price:427.44, stock:'low', img:'img/household&cleaning/606SZ000401.png' },
  { id:'606SZ000501', name:'SANZOFT SENSATION SPRAY 270 ML. - PINK (1 X 12) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 12', price:427.44, stock:'low', img:'img/household&cleaning/606SZ000501.png' },
  { id:'606SZ000301', name:'SANZOFT SENSATION SPRAY 270 ML. - VIOLET, (1 X 12) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 12', price:427.44, stock:'low', img:'img/household&cleaning/606SZ000301.png' },
  { id:'607CF01001', name:'CAREFOR AIR FRESHENER GEL 180 GRAM.- AGARWOOD, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607CF01001.png' },
  { id:'607CF02001', name:'CAREFOR AIR FRESHENER GEL 180 GRAM.- COFFEE, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607CF02001.png' },
  { id:'607CF04001', name:'CAREFOR AIR FRESHENER GEL 180 GRAM.- LEMON GRASS, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607CF04001.png' },
  { id:'607CF03001', name:'CAREFOR AIR FRESHENER GEL 180 GRAM.- ROSE, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607CF03001.png' },
  { id:'607RF01001', name:'R-FRESH AIR FRESHENER GEL 180 GRAM.-JASMINE, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607RF01001.png' },
  { id:'607RF02001', name:'R-FRESH AIR FRESHENER GEL 180 GRAM.-LAVENDER, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607RF02001.png' },
  { id:'607RF04001', name:'R-FRESH AIR FRESHENER GEL 180 GRAM.-LEMON, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607RF04001.png' },
  { id:'607RF05001', name:'R-FRESH AIR FRESHENER GEL 180 GRAM.-LILY, (1 X 24) CTN', cat:'household', icon:'🌸', pack:'Carton', unit:'1 x 24', price:381.18, stock:'in', img:'img/household&cleaning/607RF05001.png' },
  { id:'101DW00008', name:'DAIWA DISH WASHING LIQUID 800 ML. - HYGIENE , (1 X 12) CTN', cat:'household', icon:'🧴', pack:'Carton', unit:'1 x 12', price:142.17, stock:'in', img:'img/household&cleaning/101DW00008.png' },
  { id:'101DW10304', name:'DAIWA DISH WASHING LIQUID 800 ML. - LEMON , (1 X 12) CTN', cat:'household', icon:'🧴', pack:'Carton', unit:'1 x 12', price:142.17, stock:'in', img:'img/household&cleaning/101DW10304.png' },
  { id:'101DW000501', name:'DAIWA DISH WASHING LIQUID 800 ML. - MINT , (1 X 12) CTN', cat:'household', icon:'🧴', pack:'Carton', unit:'1 x 12', price:142.17, stock:'in', img:'img/household&cleaning/101DW000501.png' },
  { id:'107DW10102', name:'DAIWA DISINFECTANT DEODORIZER 500 ML. , (1 X 12) CTN', cat:'household', icon:'🧴', pack:'Carton', unit:'1 x 12', price:211.56, stock:'in', img:'img/household&cleaning/107DW10102.png' },
  { id:'104DW40402', name:'DAIWA FLOOR CLEANER 900 ML. - AQUA BLUE , (1 X 10) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 10', price:180.72, stock:'in', img:'img/household&cleaning/104DW40402.png' },
  { id:'104DW10105', name:'DAIWA FLOOR CLEANER 900 ML. - FLORAL MIST , (1 X 10) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 10', price:180.72, stock:'in', img:'img/household&cleaning/104DW10105.png' },
  { id:'104DW20202', name:'DAIWA FLOOR CLEANER 900 ML. - LAVENDER , (1 X 10) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 10', price:180.72, stock:'in', img:'img/household&cleaning/104DW20202.png' },
  { id:'104DW30302', name:'DAIWA FLOOR CLEANER 900 ML. - LEMON , (1 X 10) CTN', cat:'household', icon:'🧹', pack:'Carton', unit:'1 x 10', price:180.72, stock:'in', img:'img/household&cleaning/104DW30302.png' },
  { id:'102DW10003', name:'DAIWA GLASS CLEANER 600 ML. , (1 X 12) CTN', cat:'household', icon:'🪟', pack:'Carton', unit:'1 x 12', price:203.85, stock:'in', img:'img/household&cleaning/102DW10003.png' },
  { id:'103DW10101', name:'DAIWA GLOSS DAILY CLEANER 500 ML. , (1 X 12) CTN', cat:'household', icon:'✨', pack:'Carton', unit:'1 x 12', price:211.56, stock:'in', img:'img/household&cleaning/103DW10101.png' },
  { id:'501DW00103', name:'DAIWA LIQUID HAND SOAP 500 ML. - FRAGRANCE RICE , (1 X 12) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 12', price:211.56, stock:'in', img:'img/household&cleaning/501DW00103.png' },
  { id:'501DW50501', name:'DAIWA LIQUID HAND SOAP 500 ML. - FRUITY , (1 X 12) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 12', price:211.56, stock:'in', img:'img/household&cleaning/501DW50501.png' },
  { id:'501DW40401', name:'DAIWA LIQUID HAND SOAP 500 ML. - GENTLE SCENT , (1 X 12) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 12', price:211.56, stock:'in', img:'img/household&cleaning/501DW40401.png' },
  { id:'501DW20201', name:'DAIWA LIQUID HAND SOAP 500 ML. - LAVENDER , (1 X 12) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 12', price:211.56, stock:'in', img:'img/household&cleaning/501DW20201.png' },
  { id:'501DW30301', name:'DAIWA LIQUID HAND SOAP 500 ML. - MELON , (1 X 12) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 12', price:211.56, stock:'in', img:'img/household&cleaning/501DW30301.png' },
  { id:'006SZSB080802', name:'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-MYSTICAL PERFUME (1 X 6) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 6', price:219.27, stock:'in', img:'img/household&cleaning/006SZSB080802.png' },
  { id:'006SZ000202', name:'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-PINK ROSE SCENT (1 X 6) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 6', price:219.27, stock:'in', img:'img/household&cleaning/006SZ000202.png' },
  { id:'006SZ000302', name:'SANZOFT LAUNDRY LIQUID DETERGENT 2000 ML.-VIOLET SCENT (1 X 6) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 6', price:219.27, stock:'in', img:'img/household&cleaning/006SZ000302.png' },
  { id:'006SZ080801N', name:'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-MYSTICAL PERFUME (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:234.69, stock:'in', img:'img/household&cleaning/006SZ080801N.png' },
  { id:'006SZ000201N', name:'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-PINK ROSE SCENT (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:234.69, stock:'in', img:'img/household&cleaning/006SZ000201N.png' },
  { id:'006SZ000301N', name:'SANZOFT LAUNDRY LIQUID DETERGENT 3500 ML.-VIOLET SCENT (1 X 4) CTN', cat:'household', icon:'🧺', pack:'Carton', unit:'1 x 4', price:234.69, stock:'in', img:'img/household&cleaning/006SZ000301N.png' },

  /* Pinto Click — pack ratio (pcs per carton) not given in the invoice, unit left blank until confirmed. */
  { id:'101PTCL101001', name:'PINTO CLICK DISH WASHING LIQUID 750 ML. - LEMON', cat:'household', icon:'🧴', pack:'Carton', unit:'', price:126.75, stock:'in', img:'img/household&cleaning/101PTCL101001.png' },
  { id:'101PTCLK40101', name:'PINTO CLICK DISH WASHING LIQUID 750 ML. - KIWI', cat:'household', icon:'🧴', pack:'Carton', unit:'', price:126.75, stock:'in', img:'img/household&cleaning/101PTCLK40101.png' },
  { id:'101PTCLP20101', name:'PINTO CLICK DISH WASHING LIQUID 750 ML. - PURE&CARE', cat:'household', icon:'🧴', pack:'Carton', unit:'', price:126.75, stock:'in', img:'img/household&cleaning/101PTCLP20101.png' },
  { id:'101PTCLP30101', name:'PINTO CLICK DISH WASHING LIQUID 750 ML. - POMELO&PASSION FRUIT', cat:'household', icon:'🧴', pack:'Carton', unit:'', price:126.75, stock:'in', img:'img/household&cleaning/101PTCLP30101.png' },
  { id:'101PTLE010101', name:'PINTO CLICK DISH WASHING LIQUID 800 ML. - LEMON', cat:'household', icon:'🧴', pack:'Carton', unit:'', price:188.43, stock:'in', img:'img/household&cleaning/101PTLE010101.png' },
  { id:'101PTMA050501', name:'PINTO CLICK DISH WASHING LIQUID 800 ML. - MANGO', cat:'household', icon:'🧴', pack:'Carton', unit:'', price:188.43, stock:'in', img:'img/household&cleaning/101PTMA050501.png' },
  { id:'101PTBI010101', name:'PINTO CLICK DISH WASHING LIQUID 800 ML. - BIO', cat:'household', icon:'🧴', pack:'Carton', unit:'', price:188.43, stock:'in', img:'img/household&cleaning/101PTBI010101.png' },
  { id:'101PTLE010102Y2', name:'PINTO DISH WASHING LIQUID 3600 ML. - LEMON (PUMP 1 X 2)', cat:'household', icon:'🧴', pack:'Carton', unit:'1 x 2', price:103.62, stock:'in', img:'img/household&cleaning/101PTLE010102Y2.png' },
  { id:'101PTKL000002', name:'PINTO DISH WASHING LIQUID 3600 ML. - KLEAR (PUMP 1 X 2)', cat:'household', icon:'🧴', pack:'Carton', unit:'1 x 2', price:103.62, stock:'in', img:'img/household&cleaning/101PTKL000002.png' },

  /* TEMP — NO PRICE YET (price:0). Shown only while the list is being reviewed.
     BEFORE GO-LIVE: give each a price (and set price + active = true in Supabase) or comment the line out. */
  { id:'501DW30302', name:'DAIWA LIQUID HAND SOAP 3500 ML. - FRAGRANCE RICE , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'low', img:'img/household&cleaning/501DW30302.png' },
  { id:'501DW00101', name:'DAIWA LIQUID HAND SOAP 3500 ML. - FRUITY , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'low', img:'img/household&cleaning/501DW00101.png' },
  { id:'501DW40402', name:'DAIWA LIQUID HAND SOAP 3500 ML. - GENTLE SCENT , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'low', img:'img/household&cleaning/501DW40402.png' },
  { id:'501DW50502', name:'DAIWA LIQUID HAND SOAP 3500 ML. - LAVENDER , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'low', img:'img/household&cleaning/501DW50502.png' },
  { id:'501DW20202', name:'DAIWA LIQUID HAND SOAP 3500 ML. - MELON , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'low', img:'img/household&cleaning/501DW20202.png' },
  { id:'607CR00101', name:'CLEAREX EUCALYPTUS OIL AIR FRESHENER GEL 180G', cat:'household', icon:'🌸', pack:'Carton', unit:'', price:0, stock:'low', img:'img/household&cleaning/607CR00101.png' },
  { id:'607BN00201', name:'ZLEEP EASY BY BANNE DEEP SLEEP AIR GEL 180 G', cat:'household', icon:'🌸', pack:'Carton', unit:'', price:0, stock:'low', img:'img/household&cleaning/607BN00201.png' },
  { id:'503ZS00101', name:'ZENSI NATURAL CLEANSING SHOWER 450 ML.', cat:'personal-care', icon:'🚿', pack:'Carton', unit:'', price:0, stock:'low', img:'img/household&cleaning/503ZS00101.png' },
];

/* ---------- Hero slides ---------- */
/* TODO: paste the Viber community invite link here (e.g. https://invite.viber.com/?g=xxxxxxxx) */
const VIBER_COMMUNITY_LINK = '';

const HERO_SLIDES = [
  { eyebrow:'This Week', title:'Free delivery on orders over MVR 500', desc:"Order today within Male' and get it delivered by tomorrow.", cta:'Start Shopping', icon:'🚚', imgMobile:'img/home/a-phone.jpeg', imgWeb:'img/home/a-desktop.jpeg' },
  { eyebrow:'New Arrivals', title:'New products landing every week', desc:'Join our Viber community to be the first to know when new stock arrives.', cta:'Viber Community', icon:'🆕', imgMobile:'img/home/b-phone.jpeg', imgWeb:'img/home/b-desktop.jpeg', link: VIBER_COMMUNITY_LINK || '#' },
  { eyebrow:'App', title:'How to<br>Install?', desc:'Add MAZI to your home screen for one-tap access and a faster, app-like experience.', cta:'View', icon:'📲', imgMobile:'img/home/c-phone.jpeg', imgWeb:'img/home/c-desktop.jpeg', action:'install-guide' },
];

/* ---------- State ---------- */
/* Cart, orders, and recent searches are namespaced per account, so logging
   out hides them and logging back into the same account brings them back. */
function accountId(){
  try{
    const session = JSON.parse(localStorage.getItem('mazi_session') || 'null');
    if (!session) return 'guest';
    // Accounts here are identified by mobile number (see isNewAccount check
    // in the OTP login flow) — email is optional and blank until the person
    // fills it in from Profile. Keying this off email meant every mobile
    // login stayed on the 'guest' bucket, which made the guest cart key and
    // the "logged in" cart key collide and wiped the cart on login.
    const key = (session.mobile || session.email || '').toLowerCase();
    return key || 'guest';
  } catch(e){ return 'guest'; }
}

(function migratePerAccountData(){
  // Older versions of the site stored these globally (shared by every
  // account on the device). Move any leftover data into the "guest" bucket
  // once, so nothing is silently lost.
  const migrations = [
    ['mazi_recent_searches', 'mazi_recent_searches_guest'],
    ['mazi_cart', 'mazi_cart_guest'],
    ['mazi_orders', 'mazi_orders_guest'],
  ];
  migrations.forEach(([oldKey, newKey])=>{
    try{
      const old = localStorage.getItem(oldKey);
      if (old !== null){
        if (localStorage.getItem(newKey) === null){
          localStorage.setItem(newKey, old);
        }
        localStorage.removeItem(oldKey);
      }
    } catch(e){}
  });
})();

function recentSearchesKey(){
  return 'mazi_recent_searches_' + accountId();
}
function loadRecentSearches(){
  try{ return JSON.parse(localStorage.getItem(recentSearchesKey()) || '[]'); }
  catch(e){ return []; }
}

function cartKey(){
  return 'mazi_cart_' + accountId();
}
function loadCart(){
  try{
    const saved = JSON.parse(localStorage.getItem(cartKey()) || '{}');
    // Drop anything that is no longer sold (hidden / removed from PRODUCTS) —
    // otherwise a stale id in a returning customer's saved cart breaks the cart view.
    const known = new Set(PRODUCTS.map(p => p.id));
    const cart = {};
    Object.keys(saved).forEach(id => { if (known.has(id)) cart[id] = saved[id]; });
    return cart;
  }
  catch(e){ return {}; }
}

function ordersKey(){
  return 'mazi_orders_' + accountId();
}

let state = {
  category: 'all',
  query: '',
  cart: loadCart(),
  recentSearches: loadRecentSearches(),
  pendingQty: {},
};

/* ---------- Checkout config ---------- */
const GST_RATE = 0.08; // product prices already include GST — this is just the informational breakout
let ckMethod = 'pickup'; // 'pickup' | 'delivery' | 'boat'
let ckSlipFile = null;
let ckPickupDayIndex = 0;

/* ============ Helpers ============ */
// Maldivian Rufiyaa is pegged to the US Dollar by the Maldives Monetary
// Authority at MVR 15.42 = USD 1 — this is the standard peg rate used for
// the shop's MVR -> USD display conversion.
const USD_PER_MVR = 1 / 15.42;
function getCurrency(){
  return localStorage.getItem('mazi_currency') || 'MVR';
}
function setCurrency(cur){
  if (cur !== 'MVR' && cur !== 'USD') return;
  localStorage.setItem('mazi_currency', cur);
  const session = getSession();
  if (session) setSession({ ...session, currency: cur });
  syncCurrencyToggleUI();
  refreshVisibleCurrency();
}
// MVR currency icon markup — replaces the plain "MVR" text everywhere a
// price is shown.
const MVR_ICON = '<img class="cur-icon" src="img/mvr-icon-black.png" alt="MVR">';
// Shop-browsing price display — follows the MVR/USD toggle in the header.
// Returns HTML (not plain text) since MVR amounts now include the icon —
// call sites must use innerHTML, not textContent.
const fmt = n => getCurrency() === 'USD'
  ? '$' + (n * USD_PER_MVR).toFixed(2)
  : MVR_ICON + n.toFixed(2);
// Order price display — orders now lock in whichever currency (MVR or
// USD) the shopper had selected at checkout, via order.currency, so
// order history/receipts stay in that currency regardless of what the
// shop-browsing toggle is set to afterward. Also returns HTML.
function fmtCur(n, cur){
  return (cur === 'USD')
    ? '$' + (n * USD_PER_MVR).toFixed(2)
    : MVR_ICON + n.toFixed(2);
}
// Legacy alias for any call site that hasn't been passed an explicit
// currency — falls back to the live toggle.
const fmtMvr = n => fmtCur(n, getCurrency());
const $ = sel => document.querySelector(sel);
// Escapes user-entered text before it's dropped into an innerHTML template
// (search terms, delivery address/notes, etc.) so someone can't get a
// <script>/<img onerror> payload to execute by typing it into a form field.
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function syncCurrencyToggleUI(){
  const cur = getCurrency();
  $$('[data-currency]').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.currency === cur);
  });
  positionCurrencyThumbs();
}
// Slides the glass thumb behind whichever currency button is active.
// Re-measures on every call so it stays correct across screen sizes
// (mobile hides the icon, which changes the MVR button's width).
function positionCurrencyThumbs(){
  $$('.currency-toggle').forEach(toggle=>{
    const thumb = toggle.querySelector('.currency-toggle-thumb');
    const activeBtn = toggle.querySelector('.currency-toggle-btn.active');
    if (!thumb || !activeBtn) return;
    thumb.style.left = activeBtn.offsetLeft + 'px';
    thumb.style.width = activeBtn.offsetWidth + 'px';
  });
}
window.addEventListener('resize', rafDebounce(positionCurrencyThumbs));
// Re-renders whatever price displays are currently on screen after the
// currency toggle changes. Past orders/receipts are intentionally left
// untouched here — they stay in whichever currency they were placed in
// (order.currency), not the live toggle.
function refreshVisibleCurrency(){
  renderProducts();
  renderPopularProducts();
  updateCartUI();
  if ($('#productView') && $('#productView').classList.contains('open') && state.currentProductId != null){
    const p = PRODUCTS.find(p=>p.id===state.currentProductId);
    if (p){
      renderProductDetail(p);
      renderSimilarProducts(p);
      renderOtherProducts(p);
    }
  }
}

function saveCart(){
  localStorage.setItem(cartKey(), JSON.stringify(state.cart));
}

function saveRecentSearches(){
  localStorage.setItem(recentSearchesKey(), JSON.stringify(state.recentSearches));
}

function getRegisteredAccounts(){
  return JSON.parse(localStorage.getItem('mazi_accounts') || '[]');
}
function saveRegisteredAccount(mobile, name){
  const accounts = getRegisteredAccounts();
  accounts.push({ mobile, name: name || '' });
  localStorage.setItem('mazi_accounts', JSON.stringify(accounts));
}
function findRegisteredAccount(mobile){
  return getRegisteredAccounts().find(a => a.mobile === mobile) || null;
}
// Called whenever the person edits their name (profile page) so it's
// remembered for next time they sign in with this number — otherwise every
// sign-in would reset back to the generic "Account" placeholder.
function updateRegisteredAccountName(mobile, name){
  const accounts = getRegisteredAccounts();
  const idx = accounts.findIndex(a => a.mobile === mobile);
  if (idx === -1){
    accounts.push({ mobile, name: name || '' });
  } else {
    accounts[idx] = { ...accounts[idx], name: name || '' };
  }
  localStorage.setItem('mazi_accounts', JSON.stringify(accounts));
}
function clearMobileError(){
  $('#mobileField').classList.remove('has-error');
  $('#mobileError').hidden = true;
}

/* ============ Free email + password authentication ============ */
let authMode = 'signin';
let authRecoveryPending = false; // true while the "set a new password" panel is open

/* ---- Email validation ----
   Two layers: (1) a stricter format check than the old "has @ and a dot"
   regex, so obviously fake addresses like "a@b.c" or "test@test" are
   rejected before they ever reach Supabase; (2) a blocklist of common
   disposable/temp-mail domains that spam signups and throwaway bots use,
   so those never even attempt to create an account. Real Gmail, Yahoo,
   Outlook, iCloud, and any normal company/domain email are unaffected. */
const EMAIL_FORMAT_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com','tempmail.com','temp-mail.org','guerrillamail.com','guerrillamail.info',
  '10minutemail.com','10minutemail.net','throwawaymail.com','yopmail.com','trashmail.com',
  'getnada.com','maildrop.cc','fakeinbox.com','dispostable.com','mailnesia.com',
  'sharklasers.com','spam4.me','mintemail.com','mohmal.com','moakt.com'
]);
function isValidEmailFormat(email){
  if (!EMAIL_FORMAT_RE.test(email)) return false;
  const domain = email.split('@')[1] || '';
  // Require a real-looking TLD (2+ letters) so things like "user@company" fail.
  if (!/\.[a-zA-Z]{2,}$/.test(domain)) return false;
  return true;
}
function isDisposableEmail(email){
  const domain = (email.split('@')[1] || '').toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/* ---- 60-second cooldown after a rate-limit ("Too many attempts") ----
   The limit itself is enforced by Supabase on the server; we can't lift it
   early. What we do here is stop the shopper from hammering the button:
   the button turns into a live "Try again in 42s" countdown, and the time
   is stored so it survives closing the modal or refreshing the page. */
const AUTH_COOLDOWN_SECONDS = 60;
const EMAIL_LIMIT_COOLDOWN_SECONDS = 300; // hourly email quota is used up — a minute won't help, so don't let people keep retrying
function isRateLimitError(err){
  return !!err && (err.code === 'RATE_LIMITED' || err.code === 'EMAIL_LIMIT');
}
function rateLimitSeconds(err){
  if (err && err.code === 'EMAIL_LIMIT') return EMAIL_LIMIT_COOLDOWN_SECONDS;
  return err && err.retryAfter ? err.retryAfter + 1 : AUTH_COOLDOWN_SECONDS;
}
function formatWait(seconds){
  if (seconds <= 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function createCooldown(storageKey, render){
  let timer = null;
  const cd = {
    left(){
      let until = 0;
      try{ until = Number(localStorage.getItem(storageKey)) || 0; }catch(e){}
      return Math.max(0, Math.ceil((until - Date.now()) / 1000));
    },
    start(seconds){
      try{ localStorage.setItem(storageKey, String(Date.now() + seconds * 1000)); }catch(e){}
      cd.resume();
    },
    resume(){
      clearInterval(timer);
      render(cd.left());
      if (cd.left() <= 0) return;
      timer = setInterval(()=>{
        const left = cd.left();
        render(left);
        if (left <= 0) clearInterval(timer);
      }, 1000);
    }
  };
  return cd;
}
let authRateLimitMsgShown = false;
const authCooldown = createCooldown('mazi_auth_cooldown_until', left=>{
  refreshAuthSubmitLabel();
  if (left <= 0 && authRateLimitMsgShown){ authRateLimitMsgShown = false; clearAuthErrors(); }
});
const resetCooldown = createCooldown('mazi_reset_cooldown_until', left=>{
  const btn = $('#authForgotSubmit');
  if (!btn) return;
  btn.disabled = left > 0;
  btn.classList.toggle('is-cooldown', left > 0);
  btn.textContent = left > 0 ? `Try again in ${formatWait(left)}` : 'Send reset link';
});
// Single place that decides what the Sign In / Create Account button says.
function refreshAuthSubmitLabel(){
  const btn = $('#emailAuthSubmit');
  if (!btn) return;
  const left = authCooldown.left();
  btn.disabled = left > 0;
  btn.classList.toggle('is-cooldown', left > 0);
  btn.textContent = left > 0
    ? `Try again in ${formatWait(left)}`
    : (authMode === 'signup' ? 'Create Account' : 'Sign In');
}
function clearAuthErrors(){
  ['emailField', 'passwordField', 'authMobileField'].forEach(id => $(`#${id}`)?.classList.remove('has-error'));
  ['emailError', 'passwordError', 'authMobileError'].forEach(id => { const el = $(`#${id}`); if (el) el.hidden = true; });
}
function setAuthMode(mode){
  authMode = mode === 'signup' ? 'signup' : 'signin';
  const isSignup = authMode === 'signup';
  $('#authTitle').textContent = isSignup ? 'Create Account' : 'Sign In';
  $('#authSubtitle').textContent = isSignup ? 'Free email and password account' : 'Sign in with your email';
  refreshAuthSubmitLabel();
  $('#authForgotRow').hidden = isSignup; // "Forgot password?" only makes sense on Sign In
  $('#authMobileField').hidden = !isSignup;
  $('#authMobileInput').required = isSignup;
  $('#authPasswordInput').autocomplete = isSignup ? 'new-password' : 'current-password';
  $('#authSwitchPrompt').textContent = isSignup ? 'Already have an account?' : 'New here?';
  $('#authModeToggle').textContent = isSignup ? 'Sign in' : 'Create an account';
  // Direct style toggle (not .hidden) — .auth-google-btn / .auth-or-divider
  // both set their own display:flex in CSS, which otherwise overrides the
  // [hidden] attribute and keeps the button visible.
  const googleBtn = $('#authGoogleBtn');
  if (googleBtn) googleBtn.style.display = isSignup ? 'none' : '';
  const googleDivider = $('.auth-or-divider');
  if (googleDivider) googleDivider.style.display = isSignup ? 'none' : '';
  clearAuthErrors();
}
function showMobileStep(){
  hideAuthVerify();
  setAuthMode('signin');
  $('#authEmailInput').value = '';
  $('#authPasswordInput').value = '';
  $('#authPasswordInput').type = 'password';
  $('#authPasswordToggle').classList.remove('showing');
  $('#authPasswordToggle').setAttribute('aria-label', 'Show password');
  $('#authMobileInput').value = '';
}
function showAuthError(message, fieldId){
  const field = fieldId ? $(`#${fieldId}`) : null;
  if (field) field.classList.add('has-error');
  const error = fieldId === 'emailField' ? $('#emailError') : fieldId === 'passwordField' ? $('#passwordError') : $('#authMobileError');
  if (error){ error.textContent = message; error.hidden = false; }
}
function applyAuthenticatedSession(result, opts){
  const wasSignup = authMode === 'signup'; // closeLogin() resets the mode, so grab it first
  const profile = result.profile || {};
  const user = result.user || {};
  const name = profile.name || user.user_metadata?.full_name || user.user_metadata?.name || 'Account';
  const mobile = profile.mobile || user.user_metadata?.mobile || '';
  setSession({
    name,
    firstName: name,
    lastName: profile.last_name || '',
    email: profile.email || user.email || '',
    mobile,
    atoll: profile.atoll || '',
    city: profile.city || '',
    accountType: profile.account_type || 'residence',
    businessName: profile.business_name || '',
  });
  closeLogin();
  // First-ever sign-in (fresh account, or an older account never onboarded):
  // collect name/mobile/location/account type before letting them in, instead
  // of dropping them straight into the "Welcome" animation.
  if (result.isNewUser && !(opts && opts.deferOnboarding)){
    openOnboarding({ name: profile.name ? name : '', mobile, wasSignup });
    return;
  }
  if (!(opts && opts.skipSuccess)) showLoginSuccess(name, wasSignup);
}

/* ============ Email confirmation panel (lives inside the auth modal) ============
   States: 'sent' (just signed up), 'unconfirmed' (tried to sign in before
   confirming), 'confirmed' (came back from the email link), 'expired'. */
const AUTH_VERIFY_ICONS = {
  mail:  '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  alert: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.6v.01"/></svg>'
};
const AUTH_VERIFY_COPY = {
  sent:        { icon:'mail',  title:'Check your inbox',   text:'We sent a confirmation link to {email}. Tap it to activate your account, then come back and sign in.', primary:'Go to Sign In', resend:true,  hint:true },
  unconfirmed: { icon:'mail',  title:'Confirm your email', text:'Your account is almost ready. Open the confirmation link we sent to {email}, or request a new one below.', primary:'Go to Sign In', resend:true,  hint:true },
  confirmed:   { icon:'check', title:'Email confirmed!',   text:'Your MAZI account is verified and you are now signed in. Welcome aboard.', primary:'Continue', resend:false, hint:false },
  resetSent:   { icon:'mail',  title:'Check your inbox',   text:'If there is an account for {email}, we sent a link to reset your password. Open it to choose a new one.', primary:'Back to Sign In', resend:true,  hint:true },
  expired:     { icon:'alert', title:'Link expired',       text:'This email link is invalid or has expired. Go back to sign in — you can request a new confirmation email, or tap "Forgot password?" to get a new reset link.', primary:'Back to Sign In', resend:false, hint:false }
};
let authVerifyState = null;
let authVerifyEmail = '';
let authResendLeft = 0;
let authResendTimer = null;

function setAuthVerifyStatus(msg, isError){
  const el = $('#authVerifyStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
  el.classList.toggle('is-error', !!isError);
}
function updateAuthResendBtn(){
  const btn = $('#authVerifyResend');
  if (!btn) return;
  btn.disabled = authResendLeft > 0;
  btn.textContent = authResendLeft > 0 ? `Resend email in ${formatWait(authResendLeft)}` : 'Resend email';
}
function startAuthResendCooldown(seconds){
  clearInterval(authResendTimer);
  authResendLeft = seconds;
  updateAuthResendBtn();
  if (seconds <= 0) return;
  authResendTimer = setInterval(()=>{
    authResendLeft -= 1;
    updateAuthResendBtn();
    if (authResendLeft <= 0) clearInterval(authResendTimer);
  }, 1000);
}
function hideAuthPanels(){
  ['authForgot', 'authNewPass'].forEach(id=>{ const el = $(`#${id}`); if (el) el.hidden = true; });
}
function hideAuthVerify(){
  authVerifyState = null;
  hideAuthPanels();
  const panel = $('#authVerify');
  if (!panel) return;
  clearInterval(authResendTimer);
  authResendLeft = 0;
  panel.hidden = true;
  $('#authModal .auth-head').hidden = false;
  $('#emailAuthForm').hidden = false;
}
function showAuthVerify(state, email){
  const cfg = AUTH_VERIFY_COPY[state];
  const panel = $('#authVerify');
  if (!cfg || !panel) return;
  authVerifyState = state;
  if (email) authVerifyEmail = email;
  hideAuthPanels();

  panel.dataset.state = state;
  $('#authVerifyIcon').innerHTML = AUTH_VERIFY_ICONS[cfg.icon];
  $('#authVerifyTitle').textContent = cfg.title;

  const textEl = $('#authVerifyText');
  const parts = cfg.text.split('{email}');
  textEl.textContent = parts[0];
  if (parts.length > 1){
    const strong = document.createElement('strong');
    strong.textContent = authVerifyEmail;
    textEl.appendChild(strong);
    textEl.appendChild(document.createTextNode(parts[1]));
  }
  $('#authVerifyPrimary').textContent = cfg.primary;
  $('#authVerifyResend').hidden = !cfg.resend;
  $('#authVerifyHint').hidden = !cfg.hint;
  setAuthVerifyStatus('');

  $('#authModal .auth-head').hidden = true;
  $('#emailAuthForm').hidden = true;
  panel.hidden = false;
  panel.classList.remove('auth-verify-in');
  void panel.offsetWidth; // restart the entrance animation
  panel.classList.add('auth-verify-in');

  $('#authBackdrop').classList.add('show');
  $('#authModal').classList.add('open');

  // right after signup the email was just sent, so start the resend cooldown
  startAuthResendCooldown(state === 'sent' || state === 'resetSent' ? 60 : 0);
}
/* When the "Email confirmed!" panel's primary button leads into onboarding
   instead of straight to the Welcome animation (set just before that panel
   is shown from handleEmailConfirmationLanding()). */
let pendingConfirmIsNewUser = false;

function bindAuthVerifyEvents(){
  $('#authVerifyPrimary').addEventListener('click', ()=>{
    if (authVerifyState === 'confirmed'){
      closeLogin();
      const sess = getSession();
      if (pendingConfirmIsNewUser){
        openOnboarding({ name: '', mobile: (sess && sess.mobile) || '', wasSignup: true });
      } else {
        showLoginSuccess(sess && sess.name, true);
      }
      return;
    }
    const email = authVerifyEmail;
    hideAuthVerify();
    setAuthMode('signin');
    if (email) $('#authEmailInput').value = email;
    $('#authPasswordInput').focus();
  });
  $('#authVerifyResend').addEventListener('click', ()=>{
    if (!authVerifyEmail || authResendLeft > 0) return;
    const btn = $('#authVerifyResend');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    setAuthVerifyStatus('');
    const resend = authVerifyState === 'resetSent' ? 'sendPasswordReset' : 'resendConfirmation';
    const request = window.MaziAPI && MaziAPI[resend]
      ? MaziAPI[resend](authVerifyEmail)
      : Promise.reject(new Error('The authentication service is not configured yet.'));
    request.then(()=>{
      setAuthVerifyStatus('New email sent. Please check your inbox.');
      startAuthResendCooldown(60);
    }).catch(err=>{
      setAuthVerifyStatus(err.message || 'Could not send the email. Please try again.', true);
      startAuthResendCooldown(isRateLimitError(err) ? rateLimitSeconds(err) : 0);
    });
  });
}

/* ============ Forgot password + set a new password ============ */
function showAuthForgot(){
  const typed = $('#authEmailInput').value.trim();
  hideAuthVerify(); // back to a known state, then swap the form for the forgot panel
  $('#authModal .auth-head').hidden = true;
  $('#emailAuthForm').hidden = true;
  $('#authForgotEmail').value = typed;
  $('#authForgotField').classList.remove('has-error');
  $('#authForgotError').hidden = true;
  const panel = $('#authForgot');
  panel.hidden = false;
  panel.classList.remove('auth-verify-in');
  void panel.offsetWidth;
  panel.classList.add('auth-verify-in');
  resetCooldown.resume();
  $('#authForgotEmail').focus();
}
function showAuthNewPassword(){
  hideAuthVerify();
  $('#authModal .auth-head').hidden = true;
  $('#emailAuthForm').hidden = true;
  ['authNewPassInput', 'authNewPassConfirm'].forEach(id=>{ $(`#${id}`).value = ''; });
  $('#authNewPassError').hidden = true;
  ['authNewPassField', 'authNewPassConfirmField'].forEach(id=> $(`#${id}`).classList.remove('has-error'));
  const panel = $('#authNewPass');
  panel.hidden = false;
  panel.classList.remove('auth-verify-in');
  void panel.offsetWidth;
  panel.classList.add('auth-verify-in');
  authRecoveryPending = true;
  $('#authBackdrop').classList.add('show');
  $('#authModal').classList.add('open');
  $('#authNewPassInput').focus();
}
function bindForgotPasswordEvents(){
  $('#authForgotBtn').addEventListener('click', showAuthForgot);
  $('#authForgotBack').addEventListener('click', ()=>{
    const typed = $('#authForgotEmail').value.trim();
    hideAuthVerify();
    setAuthMode('signin');
    if (typed) $('#authEmailInput').value = typed;
  });
  $('#authForgotEmail').addEventListener('input', ()=>{
    $('#authForgotField').classList.remove('has-error');
    $('#authForgotError').hidden = true;
  });
  $('#authForgotForm').addEventListener('submit', e=>{
    e.preventDefault();
    if (resetCooldown.left() > 0) return;
    const email = $('#authForgotEmail').value.trim();
    const field = $('#authForgotField');
    const errEl = $('#authForgotError');
    const showErr = msg=>{ errEl.textContent = msg; errEl.hidden = false; field.classList.add('has-error'); };
    field.classList.remove('has-error');
    errEl.hidden = true;
    if (!isValidEmailFormat(email)){
      showErr('Please enter a valid email address.');
      return;
    }
    const btn = $('#authForgotSubmit');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    const request = window.MaziAPI && MaziAPI.sendPasswordReset
      ? MaziAPI.sendPasswordReset(email)
      : Promise.reject(new Error('The authentication service is not configured yet.'));
    request.then(()=>{
      resetCooldown.start(AUTH_COOLDOWN_SECONDS);
      showAuthVerify('resetSent', email);
    }).catch(err=>{
      showErr(err.message || 'Could not send the email. Please try again.');
      if (isRateLimitError(err)) resetCooldown.start(rateLimitSeconds(err));
      else resetCooldown.resume();
    });
  });
  $('#authNewPassForm').addEventListener('submit', e=>{
    e.preventDefault();
    const pw = $('#authNewPassInput').value;
    const pw2 = $('#authNewPassConfirm').value;
    const errEl = $('#authNewPassError');
    const showErr = (msg, ...fieldIds)=>{
      errEl.textContent = msg;
      errEl.hidden = false;
      fieldIds.forEach(id=> $(`#${id}`).classList.add('has-error'));
    };
    errEl.hidden = true;
    ['authNewPassField', 'authNewPassConfirmField'].forEach(id=> $(`#${id}`).classList.remove('has-error'));
    if (pw.length < 6){ showErr('Password must be at least 6 characters.', 'authNewPassField'); return; }
    if (pw !== pw2){ showErr('Passwords do not match.', 'authNewPassConfirmField'); return; }
    const btn = $('#authNewPassSubmit');
    btn.disabled = true;
    btn.textContent = 'Updating...';
    MaziAPI.updatePassword(pw)
      .then(()=> MaziAPI.getSession())
      .then(session=>{
        if (!session || !session.user) throw new Error('No session');
        return MaziAPI.getProfile().then(profile=>({
          user: session.user,
          profile,
          isNewUser: !profile || !profile.onboarded
        }));
      })
      .then(result=>{
        authRecoveryPending = false; // signed in for real now — keep the session on close
        hideAuthVerify();
        applyAuthenticatedSession(result);
      })
      .catch(err=>{
        showErr(err && err.code === 'NOT_AUTHENTICATED'
          ? 'This reset link has expired. Close this window and request a new one.'
          : ((err && err.message) || 'Could not update your password. Please try again.'));
      })
      .finally(()=>{
        btn.disabled = false;
        btn.textContent = 'Update password';
      });
  });
}

/* The confirmation link in the email brings the shopper back here with
   #access_token=...&type=signup (or #error_code=... if it expired). supabase-js
   reads the tokens itself; we just sign the shopper in and show a proper
   "Email confirmed" screen instead of dropping them on a silent homepage. */
function handleEmailConfirmationLanding(){
  const hash = window.location.hash || '';
  if (!/access_token=|error_code=|error_description=/.test(hash)) return;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const cleanUrl = ()=> history.replaceState(null, '', window.location.pathname + window.location.search);

  if (params.get('error') || params.get('error_code') || params.get('error_description')){
    cleanUrl();
    showAuthVerify('expired');
    return;
  }
  if (params.get('type') === 'recovery' && window.MaziAPI){
    // Link from the "Forgot password?" email: supabase-js has already turned
    // the tokens into a temporary session, so ask for the new password.
    MaziAPI.getSession().then(session=>{
      if (!session || !session.user) throw new Error('No session');
      cleanUrl();
      showAuthNewPassword();
    }).catch(()=>{
      cleanUrl();
      showAuthVerify('expired');
    });
    return;
  }
  if (params.get('type') !== 'signup' || !window.MaziAPI) return;

  MaziAPI.getSession().then(session=>{
    if (!session || !session.user) throw new Error('No session');
    return MaziAPI.getProfile().then(profile=>({
      user: session.user,
      profile,
      isNewUser: !profile || !profile.onboarded
    }));
  }).then(result=>{
    cleanUrl();
    pendingConfirmIsNewUser = result.isNewUser;
    applyAuthenticatedSession(result, { skipSuccess: true, deferOnboarding: true });
    showAuthVerify('confirmed', result.user.email);
  }).catch(()=>{
    cleanUrl();
    showAuthVerify('expired');
  });
}

function cartCount(){
  return Object.values(state.cart).reduce((s,q)=>s+q,0);
}

const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.15" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 10.5v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.4" r="1.15" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>`
};
// type: 'success' (default) | 'error' | 'info' — picks the icon + accent color the toast shows.
function showToast(msg, sub, type){
  const t = $('#toast');
  type = TOAST_ICONS[type] ? type : 'success';
  const iconSvg = TOAST_ICONS[type];

  if (sub){
    t.innerHTML = `<span class="toast-icon">${iconSvg}</span><span class="toast-text"><span class="toast-title"></span><span class="toast-sub"></span></span>`;
    t.querySelector('.toast-title').textContent = msg;
    t.querySelector('.toast-sub').textContent = sub;
  } else {
    t.innerHTML = `<span class="toast-icon">${iconSvg}</span><span class="toast-msg"></span>`;
    t.querySelector('.toast-msg').textContent = msg;
  }
  t.dataset.toastType = type;

  // restart the icon pop each time
  const icon = t.querySelector('.toast-icon');
  icon.classList.remove('pop');
  void icon.offsetWidth;
  icon.classList.add('pop');

  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=> t.classList.remove('show'), sub ? 2200 : 1800);
}

/* ============ Sidebar / category strip / pills ============ */
// Switching category always clears any active search — otherwise the
// heading/results stay stuck on "Results for ..." (and filtered by the old
// keyword) instead of reflecting the category the person just tapped.
function setCategory(catId){
  state.category = catId;
  state.query = '';
  $('#searchInput').value = '';
  $('#mobileSearchInput').value = '';
}

function renderCategoryNav(){
  // Categories are listed A–Z by name ("All Categories" always stays on top).
  // Sidebar (desktop) — highlight pill is rebuilt as the first list item each render
  const sidebarItems = [
    `<li><button data-cat="all" class="${state.category==='all'?'active':''}">All Categories</button></li>`,
    ...[...CATEGORIES].sort((a,b)=> a.name.localeCompare(b.name, 'en', {sensitivity:'base'})).map(c => `<li><button data-cat="${c.id}" class="${state.category===c.id?'active':''}">${c.name}</button></li>`)
  ].join('');
  const sidebarHtml = `<div class="sidebar-highlight" id="sidebarHighlight"></div>${sidebarItems}`;
  const mobileHtml = `<div class="sidebar-highlight" id="mobileMenuHighlight"></div>${sidebarItems}`;
  $('#sidebarList').innerHTML = sidebarHtml;
  $('#mobileMenuList').innerHTML = mobileHtml;

  $$('[data-cat]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setCategory(btn.dataset.cat);
      $$('[data-cat]').forEach(b=> b.classList.toggle('active', b.dataset.cat === state.category));
      renderProducts();
      closeMenu();
    });
  });

  // Position all three sliding highlights on the frame after render so
  // layout has settled (needed for accurate getBoundingClientRect reads).
  requestAnimationFrame(updateCategoryHighlights);
  requestAnimationFrame(updateSidebarRail);
}

/* ============ Sidebar custom scrollbar (rail) ============ */
function updateSidebarRail(){
  const wrap = $('#sidebarScrollwrap');
  const rail = $('#sidebarRail');
  const track = $('#sidebarRailTrack');
  const thumb = $('#sidebarRailThumb');
  const upBtn = $('#sidebarRailUp');
  const downBtn = $('#sidebarRailDown');
  if (!wrap || !rail || !track || !thumb) return;

  const scrollable = wrap.scrollHeight > wrap.clientHeight + 1;
  rail.hidden = !scrollable;
  if (!scrollable) return;

  // Pin the rail's height to the list's own rendered height so the track
  // never runs longer than the visible category list.
  rail.style.height = wrap.clientHeight + 'px';

  const trackHeight = track.clientHeight;
  // Thumb is always ~96% of the track (scales with screen height) instead of
  // shrinking with the number of categories, so it never looks tiny.
  const THUMB_RATIO = 0.96;
  const thumbHeight = Math.max(24, trackHeight * THUMB_RATIO);
  const maxScroll = wrap.scrollHeight - wrap.clientHeight;
  const maxThumbTop = trackHeight - thumbHeight;
  const thumbTop = maxScroll > 0 ? (wrap.scrollTop / maxScroll) * maxThumbTop : 0;

  thumb.style.height = thumbHeight + 'px';
  thumb.style.top = thumbTop + 'px';

  if (upBtn) upBtn.disabled = wrap.scrollTop <= 0;
  if (downBtn) downBtn.disabled = wrap.scrollTop >= maxScroll - 1;
}

function initSidebarRail(){
  const wrap = $('#sidebarScrollwrap');
  const upBtn = $('#sidebarRailUp');
  const downBtn = $('#sidebarRailDown');
  if (!wrap) return;

  wrap.addEventListener('scroll', updateSidebarRail, { passive:true });
  window.addEventListener('resize', rafDebounce(updateSidebarRail));

  if (upBtn) upBtn.addEventListener('click', ()=>{
    wrap.scrollBy({ top: -96, behavior: 'smooth' });
  });
  if (downBtn) downBtn.addEventListener('click', ()=>{
    wrap.scrollBy({ top: 96, behavior: 'smooth' });
  });
}

function positionHighlight(container, highlightEl, horizontal){
  if (!container || !highlightEl) return;
  const activeBtn = container.querySelector('button.active');
  if (!activeBtn){ highlightEl.classList.remove('ready'); return; }
  const btnRect = activeBtn.getBoundingClientRect();
  const boxRect = container.getBoundingClientRect();
  if (horizontal){
    highlightEl.style.transform = `translateX(${btnRect.left - boxRect.left}px)`;
    highlightEl.style.width = btnRect.width + 'px';
    highlightEl.style.height = btnRect.height + 'px';
  } else {
    highlightEl.style.transform = `translateY(${btnRect.top - boxRect.top}px)`;
    highlightEl.style.width = btnRect.width + 'px';
    highlightEl.style.height = btnRect.height + 'px';
  }
  highlightEl.classList.add('ready');
}

function updateCategoryHighlights(){
  positionHighlight($('#sidebarList'), $('#sidebarHighlight'), false);
  positionHighlight($('#mobileMenuList'), $('#mobileMenuHighlight'), false);
}

/* ============ Brands ticker: auto-scroll that pauses on drag/hover
   and resumes the loop after the user lets go ============ */
function initBrandsTicker(){
  const viewport = document.querySelector('.brands-ticker-viewport');
  const track = $('#brandsTickerTrack');
  if (!viewport || !track) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = 42; // px per second

  let setWidth = 0;    // width of one (of the 3 duplicated) item sets
  let pos = 0;         // current translateX, always <= 0
  let dragging = false;
  let hovering = false;
  let pausedAfterDrag = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let resumeTimer = null;
  let lastTime = null;

  function measure(){
    // The track markup has 4 duplicated sets of logos (A, B, C, D) so the
    // loop never shows a gap on wide screens — must match that here or the
    // wrap point falls mid-set and the loop stutters/jumps.
    setWidth = track.scrollWidth / 4 || 0;
  }
  function applyTransform(){
    track.style.transform = `translateX(${pos}px)`;
  }
  function wrap(){
    if (setWidth <= 0) return;
    while (pos <= -setWidth * 2) pos += setWidth;
    while (pos > 0) pos -= setWidth;
  }

  function tick(t){
    if (lastTime === null) lastTime = t;
    const dt = (t - lastTime) / 1000;
    lastTime = t;
    if (!reduceMotion && !dragging && !hovering && !pausedAfterDrag){
      pos -= SPEED * dt;
      wrap();
      applyTransform();
    }
    requestAnimationFrame(tick);
  }

  function pointerX(e){
    return e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
  }

  function onDown(e){
    dragging = true;
    pausedAfterDrag = false;
    clearTimeout(resumeTimer);
    dragStartX = pointerX(e);
    dragStartPos = pos;
  }
  function onMove(e){
    if (dragging){
      const delta = pointerX(e) - dragStartX;
      pos = dragStartPos + delta;
      wrap();
      applyTransform();
      return;
    }
    // Robust hover check (works even if mouseenter/mouseleave get missed
    // due to overlapping elements) — purely geometric, based on cursor
    // position vs the viewport's box.
    if (typeof e.clientX === 'number'){
      const r = viewport.getBoundingClientRect();
      hovering = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }
  }
  function onUp(){
    if (!dragging) return;
    dragging = false;
    pausedAfterDrag = true;
    clearTimeout(resumeTimer);
    // brief pause before the auto-scroll loop continues on its own
    resumeTimer = setTimeout(()=>{ pausedAfterDrag = false; lastTime = null; }, 1000);
  }

  track.addEventListener('touchstart', onDown, {passive:true});
  track.addEventListener('touchmove', onMove, {passive:true});
  track.addEventListener('touchend', onUp);
  track.addEventListener('touchcancel', onUp);

  track.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  viewport.addEventListener('mouseenter', ()=>{ hovering = true; });
  viewport.addEventListener('mouseleave', ()=>{ hovering = false; });
  document.addEventListener('mouseleave', ()=>{ hovering = false; });

  window.addEventListener('resize', rafDebounce(measure));
  measure();

  // Images load async — re-measure once they've all settled so the loop
  // width is accurate from the very first frame (avoids a jump/stutter
  // partway through once late-loading logos change the track's size).
  const imgs = track.querySelectorAll('img');
  let pending = imgs.length;
  if (pending){
    imgs.forEach(img=>{
      if (img.complete){ pending--; return; }
      img.addEventListener('load', ()=>{ if(--pending<=0) measure(); }, {once:true});
      img.addEventListener('error', ()=>{ if(--pending<=0) measure(); }, {once:true});
    });
    if (pending<=0) measure();
  }

  requestAnimationFrame(tick);
}


let heroIndex = 0;
let heroTimer = null;

function renderHero(){
  $('#heroTrack').innerHTML = HERO_SLIDES.map(s => {
    const hasResponsiveImg = !!(s.imgMobile && s.imgWeb);
    const hasImg = hasResponsiveImg || !!s.img;
    const slideStyle = hasResponsiveImg
      ? `--hero-bg-mobile:url('${s.imgMobile}');--hero-bg-web:url('${s.imgWeb}')`
      : (s.img ? `background-image:url('${s.img}')` : '');
    return `
    <div class="hero-slide${hasImg ? ' has-img' : ''}${hasResponsiveImg ? ' has-responsive-img' : ''}" style="${slideStyle}">
      ${hasImg
        ? ``
        : `<div class="hero-visual">${s.icon}</div>`}
    </div>
  `;
  }).join('');

  $('#heroDots').innerHTML = HERO_SLIDES.map((_,i)=>`<button data-i="${i}" class="${i===0?'active':''}"></button>`).join('')
    + `<span class="hero-dot-highlight"></span>`;

  $$('#heroDots button').forEach(b=>{
    b.addEventListener('click', ()=> goToSlide(parseInt(b.dataset.i)));
  });

  positionHeroDotHighlight();
  window.addEventListener('resize', rafDebounce(positionHeroDotHighlight));

  startHeroAuto();
}

function positionHeroDotHighlight(){
  const container = $('#heroDots');
  const highlight = container && container.querySelector('.hero-dot-highlight');
  const activeBtn = container && container.querySelector('button.active');
  if (!container || !highlight || !activeBtn) return;
  const hw = highlight.offsetWidth;
  const left = activeBtn.offsetLeft + (activeBtn.offsetWidth/2) - (hw/2);
  highlight.style.transform = `translate(${left}px, -50%)`;
}

function goToSlide(i){
  heroIndex = i;
  $('#heroTrack').style.transform = `translateX(-${i*100}%)`;
  $$('#heroDots button').forEach((b,idx)=> b.classList.toggle('active', idx===i));
  positionHeroDotHighlight();
  startHeroAuto();
}

function startHeroAuto(){
  clearInterval(heroTimer);
  heroTimer = setInterval(()=>{
    goToSlide((heroIndex+1)%HERO_SLIDES.length);
  }, 5000);
}

/* ============ Product grid ============ */
function getFilteredProducts(){
  const filtered = PRODUCTS.filter(p=>{
    const matchCat = state.category==='all' || p.cat===state.category;
    const matchQuery = !state.query || p.name.toLowerCase().includes(state.query) || p.id.toLowerCase().includes(state.query);
    return matchCat && matchQuery;
  });
  // Products with a real uploaded photo (p.img set) go first; the rest
  // (falling back to the default img/products/ID.png convention, which may
  // still be a placeholder) come after. Sort is stable, so order within
  // each group is unchanged.
  return filtered.slice().sort((a, b) => (a.img ? 0 : 1) - (b.img ? 0 : 1));
}

function stockMeta(p){
  if (p.stock === 'out') return { cls: 'out-stock', label: 'Out of Stock' };
  if (p.stock === 'low') return { cls: 'low-stock', label: 'Low Stock' };
  return { cls: 'in-stock', label: 'In Stock' };
}

function cardActionHtml(p, opts){
  opts = opts || {};
  const detailed = !!opts.detailed;
  const qty = state.cart[p.id] || 0;
  if (qty > 0){
    return `<button class="card-add card-add-done" data-id="${p.id}">
      <span class="card-add-success">
        <span class="card-add-success-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        Added to cart
      </span>
    </button>
    <button class="card-remove-link" data-id="${p.id}">Click to remove</button>`;
  }
  if (p.stock === 'out'){
    return `<button class="card-add card-add-disabled" disabled>
      <span class="card-add-label">Out of Stock</span>
    </button>`;
  }
  const pendingQty = detailed ? (state.pendingQty[p.id] || 1) : 1;
  const qtySelector = detailed ? `
    <div class="pd-qty-select">
      <div class="pd-qty-label">Quantity</div>
      <div class="card-qty pd-qty" data-id="${p.id}">
        <button class="qty-btn" data-dir="-1" ${pendingQty<=1?'disabled':''}>&minus;</button>
        <span class="qty-val">${pendingQty}</span>
        <button class="qty-btn" data-dir="1">&plus;</button>
      </div>
    </div>` : '';
  return `${qtySelector}
  <button class="card-add" data-id="${p.id}" data-qty="${pendingQty}">
    <svg class="card-add-icon" viewBox="0 0 24 24"><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="21" r="1.4" fill="currentColor"/><circle cx="19" cy="21" r="1.4" fill="currentColor"/></svg>
    <span class="card-add-label">Add to Cart</span>
    <span class="card-add-dots"><span></span><span></span><span></span></span>
    <span class="card-add-success">
      <span class="card-add-success-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      Added to cart
    </span>
  </button>`;
}

function bindCardSlot(slot){
  if (!slot) return;
  const addBtn = slot.classList && slot.classList.contains('card-add') ? slot : slot.querySelector && slot.querySelector('.card-add');
  const id = slot.dataset.id || (addBtn && addBtn.dataset.id);

  if (addBtn && addBtn.classList.contains('card-add-done')){
    addBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openCart(); });
  } else if (addBtn && addBtn.classList.contains('card-add-disabled')){
    // Out of stock — no action.
  } else if (addBtn){
    addBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      if (addBtn.classList.contains('loading') || addBtn.classList.contains('success')) return;
      const qty = parseInt(addBtn.dataset.qty || '1', 10);
      addBtn.classList.add('loading');
      setTimeout(()=>{
        addBtn.classList.remove('loading');
        addBtn.classList.add('success');
        setTimeout(()=>{ addToCart(addBtn.dataset.id, qty); }, 900);
      }, 1500);
    });
  }

  const removeLink = slot.classList && slot.classList.contains('card-remove-link') ? slot : slot.querySelector && slot.querySelector('.card-remove-link');
  if (removeLink){
    removeLink.addEventListener('click', (e)=>{ e.stopPropagation(); removeFromCart(removeLink.dataset.id); });
  }

  const pdQty = slot.classList && slot.classList.contains('card-qty') ? slot : slot.querySelector && slot.querySelector('.card-qty');
  if (pdQty){
    const qId = pdQty.dataset.id || id;
    const container = slot.classList && slot.classList.contains('card-action-slot') ? slot : pdQty.closest('.card-action-slot');
    pdQty.querySelectorAll('.qty-btn').forEach(b=>{
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        const dir = parseInt(b.dataset.dir, 10);
        const next = (state.pendingQty[qId] || 1) + dir;
        state.pendingQty[qId] = Math.max(1, next);
        if (container){
          const p = PRODUCTS.find(p=>p.id===qId);
          container.innerHTML = cardActionHtml(p, { detailed: true }).trim();
          bindCardSlot(container);
        }
      });
    });
  }
}

function refreshCardSlot(id, detailed){
  // Update every instance of this product's action controls on the page —
  // it can appear in the main grid, the product detail view, and the
  // similar-products strip all at once.
  const olds = $$(`.card-action-slot[data-id="${id}"]`);
  if (!olds.length) return;
  const p = PRODUCTS.find(p=>p.id===id);
  olds.forEach(old=>{
    const isDetailed = typeof detailed === 'boolean' ? detailed : old.classList.contains('pd-actions');
    old.innerHTML = cardActionHtml(p, { detailed: isDetailed }).trim();
    old.classList.add('swap-in');
    bindCardSlot(old);
  });
}

function productCardHtml(p){
  return `
    <div class="product-card" data-id="${p.id}">
      <div class="card-media">
        <img class="card-img" src="${productImg(p)}" alt="${p.name}" loading="lazy" onerror="this.classList.add('img-missing')">
      </div>
      <div class="card-body">
        <div class="stock-indicator ${stockMeta(p).cls}">
          <span class="stock-dot"></span>
          <span class="stock-text">${stockMeta(p).label}</span>
        </div>
        <div class="card-title">${p.name}</div>
        <div class="card-code">${p.id}</div>
        <div class="card-meta">
          <div class="card-unit"><small>${p.pack}</small><strong>${p.unit}</strong></div>
          <div class="card-price">${fmt(p.price)}</div>
        </div>
        <div class="card-action-slot" data-id="${p.id}">${cardActionHtml(p)}</div>
      </div>
    </div>
  `;
}

function bindProductCardClicks(container){
  $$('.product-card', container).forEach(card=>{
    card.addEventListener('click', (e)=>{
      if (e.target.closest('.card-add, .card-qty, .card-remove-link')) return;
      openProductView(card.dataset.id);
    });
  });
}

function productImg(p){
  // Some products (e.g. specific brand scents/variants) ship with a real
  // photo already placed at a custom path — use that if set on the product.
  if (p.img) return p.img;
  // Default placeholder path convention — drop matching files in
  // img/products/ (e.g. img/products/MZ001.png) and they'll show automatically.
  // Falls back to the emoji if the file isn't there yet.
  return `img/products/${p.id}.png`;
}

/* ============ Popular products preview (home redesign) ============ */
function renderPopularProducts(){
  const grid = $('#popularProductsGrid');
  if (!grid) return;
  // Prefer in-stock items that already have a real photo, so the preview
  // never leans on the placeholder/emoji path; falls back to any in-stock
  // item if fewer than 4 photographed products exist yet.
  const withPhotos = PRODUCTS.filter(p => p.img && p.stock !== 'out');
  const rest = PRODUCTS.filter(p => !p.img && p.stock !== 'out');
  const picks = [...withPhotos, ...rest].slice(0, 6);
  grid.innerHTML = picks.map(p => productCardHtml(p)).join('');
  $$('.card-action-slot', grid).forEach(bindCardSlot);
  bindProductCardClicks(grid);
}

function renderSkeletons(count = 6){
  $('#emptyState').hidden = true;
  $('#productGrid').style.display = 'grid';
  $('#productGrid').innerHTML = Array.from({length: count}).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-media"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join('');
}

function renderProducts(){
  const list = getFilteredProducts();
  const catName = state.category==='all' ? 'All Products' : CATEGORIES.find(c=>c.id===state.category)?.name || 'All Products';
  $('#sectionTitle').textContent = state.query ? `Results for "${state.query}"` : catName;
  $('#resultCount').textContent = `${list.length} item${list.length!==1?'s':''}`;

  $('#emptyState').hidden = list.length !== 0;
  $('#productGrid').style.display = list.length === 0 ? 'none' : 'grid';

  $('#productGrid').innerHTML = list.map(p => productCardHtml(p)).join('');

  $$('#productGrid .card-action-slot').forEach(bindCardSlot);
  bindProductCardClicks($('#productGrid'));
}

/* ============ Product detail view ============ */
function renderProductDetail(p){
  $('#productDetailCard').innerHTML = `
    <div class="pd-media">
      <img src="${productImg(p)}" alt="${p.name}" onerror="this.classList.add('img-missing')">
    </div>
    <div class="pd-info">
      <div>
        <div class="stock-indicator ${stockMeta(p).cls}">
          <span class="stock-dot"></span>
          <span class="stock-text">${stockMeta(p).label}</span>
        </div>
        <div class="pd-title">${p.name}</div>
        <div class="pd-code">${p.id}</div>
      </div>
      <div class="pd-divider"></div>
      <div class="pd-meta">
        <div class="pd-unit"><small>${p.pack}</small><strong>${p.unit}</strong></div>
        <div class="pd-price">${fmt(p.price)}</div>
      </div>
      <div class="pd-divider"></div>
      <div class="pd-actions card-action-slot" data-id="${p.id}">${cardActionHtml(p, { detailed: true })}</div>
    </div>
  `;
  bindCardSlot($('#productDetailCard .pd-actions'));
}

// Same-category products shown in the "Similar Products" carousel (max 8).
function getSimilarProducts(p){
  return PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 8);
}
function renderSimilarProducts(p){
  const similar = getSimilarProducts(p);
  const section = $('#similarProductsSection');
  if (!similar.length){ section.hidden = true; return; }
  section.hidden = false;
  $('#similarProductsGrid').innerHTML = similar.map(x => productCardHtml(x)).join('');
  $$('#similarProductsGrid .card-action-slot').forEach(bindCardSlot);
  bindProductCardClicks($('#similarProductsGrid'));
  $('#similarProductsGrid').scrollLeft = 0;
  updateSimilarCarouselArrows();
}
function updateSimilarCarouselArrows(){
  const track = $('#similarProductsGrid');
  const prevBtn = $('#similarPrevBtn');
  const nextBtn = $('#similarNextBtn');
  if (!track || !prevBtn || !nextBtn) return;
  prevBtn.disabled = track.scrollLeft <= 4;
  nextBtn.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
}
function scrollSimilarCarousel(dir){
  const track = $('#similarProductsGrid');
  if (!track) return;
  const card = track.querySelector('.product-card');
  const step = card ? card.getBoundingClientRect().width + 16 : 220;
  track.scrollBy({ left: dir * step * 2, behavior: 'smooth' });
}

function renderOtherProducts(p){
  // "Other Products" = everything that is neither the product being viewed nor
  // already shown in Similar Products. (Previously it only used OTHER categories,
  // so it stayed empty while every product lives in a single category.)
  const similarIds = new Set(getSimilarProducts(p).map(x => x.id));
  const pool = shuffleArray(PRODUCTS.filter(x => x.id !== p.id && !similarIds.has(x.id)));
  state.otherProductsPool = pool;
  state.otherProductsShown = [];
  const section = $('#otherProductsSection');
  if (!pool.length){ section.hidden = true; return; }
  section.hidden = false;
  $('#otherProductsGrid').innerHTML = '';
  loadMoreOtherProducts(Infinity);
}
function loadMoreOtherProducts(count = 4){
  const pool = state.otherProductsPool || [];
  const shown = state.otherProductsShown || [];
  const next = pool.filter(x => !shown.includes(x.id)).slice(0, count);
  if (!next.length) return;
  state.otherProductsShown = shown.concat(next.map(x=>x.id));
  $('#otherProductsGrid').insertAdjacentHTML('beforeend', next.map(x => productCardHtml(x)).join(''));
  $$('#otherProductsGrid .card-action-slot').forEach(bindCardSlot);
  bindProductCardClicks($('#otherProductsGrid'));
}
function shuffleArray(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function openProductView(id){
  const p = PRODUCTS.find(p=>p.id===id);
  if (!p) return;
  state.currentProductId = id;
  renderProductDetail(p);
  renderSimilarProducts(p);
  renderOtherProducts(p);
  closeOtherFullScreenViews('productView');
  $('#productView').classList.add('open');
  document.body.style.overflow = 'hidden';
  $('#productView').scrollTop = 0;
}
function closeProductView(){
  $('#productView').classList.remove('open');
  document.body.style.overflow = '';
}

// Only one full-screen .profile-view panel (Profile / My Orders / Product
// detail) should be open at a time — they all share the same z-index, and
// #productView sits later in the DOM, so if it's left open it silently
// paints over Profile/Orders when those are opened from within it.
function closeOtherFullScreenViews(exceptId){
  ['profileView','ordersView','productView'].forEach(id=>{
    if (id === exceptId) return;
    const el = $('#' + id);
    if (el) el.classList.remove('open');
  });
}

/* ============ Cart logic ============ */
function addToCart(id, qty){
  qty = qty || 1;
  state.cart[id] = (state.cart[id] || 0) + qty;
  delete state.pendingQty[id];
  saveCart();
  updateCartUI();
  refreshCardSlot(id);
  openCart();
}

function changeQty(id, delta){
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) { delete state.cart[id]; }
  else { state.cart[id] = next; }
  saveCart();
  updateCartUI();
  refreshCardSlot(id);
}

function removeFromCart(id){
  delete state.cart[id];
  delete state.pendingQty[id];
  saveCart();
  updateCartUI();
  refreshCardSlot(id);
}

function updateCartUI(){
  const count = cartCount();
  $$('.js-cart-count').forEach(el=>{
    el.textContent = count;
    el.style.display = count>0 ? 'flex' : 'none';
  });

  const ids = Object.keys(state.cart);
  if (ids.length===0){
    $('#cartItems').innerHTML = `<div class="cart-empty">Your cart is empty.<br>Add some products to get started.</div>`;
    $('#cartSubtotal').innerHTML = fmt(0);
    return;
  }

  let subtotal = 0;
  $('#cartItems').innerHTML = ids.map(id=>{
    const p = PRODUCTS.find(p=>p.id===id);
    const qty = state.cart[id];
    const lineTotal = p.price * qty;
    subtotal += lineTotal;
    return `
      <div class="cart-row">
        <div class="cart-row-media"><img class="cart-row-img" decoding="async" src="${productImg(p)}" alt="${p.name}" onerror="this.classList.add('img-missing')"></div>
        <div class="cart-row-info">
          <div class="cart-row-title">${p.name}</div>
          <div class="cart-row-price">${fmt(lineTotal)}</div>
          <div class="cart-row-qty">
            <button data-qty-minus="${id}">&minus;</button>
            <span>${qty}</span>
            <button data-qty-plus="${id}">&plus;</button>
          </div>
        </div>
        <button class="cart-row-delete" data-remove="${id}" aria-label="Remove item" title="Remove item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  $('#cartSubtotal').innerHTML = fmt(subtotal);

  $$('[data-qty-plus]').forEach(b=> b.addEventListener('click', ()=> changeQty(b.dataset.qtyPlus, 1)));
  $$('[data-qty-minus]').forEach(b=> b.addEventListener('click', ()=> changeQty(b.dataset.qtyMinus, -1)));
  $$('[data-remove]').forEach(b=> b.addEventListener('click', ()=> removeFromCart(b.dataset.remove)));
}

/* ============ Drawer / menu toggles ============ */
function openCart(){
  $('#cartDrawer').classList.add('open');
  $('#drawerBackdrop').classList.add('show');
}
function closeCart(){
  $('#cartDrawer').classList.remove('open');
  $('#drawerBackdrop').classList.remove('show');
}
/* Bottom nav: remember which tab was active so the transient "Categories"
   highlight can hand it back once the categories menu closes. */
let bnPrevAction = 'home';
function setBottomNavActive(action){
  $$('.bn-item[data-action]').forEach(b=>{
    b.classList.toggle('active', b.dataset.action === action);
  });
}
function currentBottomNavAction(){
  const a = document.querySelector('.bn-item.active');
  return a ? a.dataset.action : 'home';
}
function openMenu(){
  const cur = currentBottomNavAction();
  if (cur !== 'categories') bnPrevAction = cur;
  setBottomNavActive('categories');
  $('#mobileMenu').classList.add('open');
  $('#menuBackdrop').classList.add('show');
}
function closeMenu(){
  $('#mobileMenu').classList.remove('open');
  $('#menuBackdrop').classList.remove('show');
  if (currentBottomNavAction() === 'categories') setBottomNavActive(bnPrevAction || 'home');
}
function openLogin(){
  $('#authBackdrop').classList.add('show');
  $('#authModal').classList.add('open');
  showMobileStep();
  authCooldown.resume(); // pick the "Try again in Ns" countdown back up if one is still running
}
function closeLogin(){
  $('#authBackdrop').classList.remove('show');
  $('#authModal').classList.remove('open');
  // Closed the "set a new password" panel without finishing: drop the
  // temporary recovery session so nobody is left half signed in.
  if (authRecoveryPending){
    authRecoveryPending = false;
    if (window.MaziAPI && MaziAPI.logout) MaziAPI.logout().catch(()=>{});
  }
}

/* ============ "Complete your profile" onboarding modal ============
   Shown once, right after a shopper's very first successful sign-in
   (Google or email) — before they land in the shop as a full account. */
const MAZI_ATOLLS = [
  "Haa Alif (HA)", "Haa Dhaalu (HDh)", "Shaviyani (Sh)", "Noonu (N)", "Raa (R)",
  "Baa (B)", "Lhaviyani (Lh)", "Kaafu (K)", "Alif Alif (AA)", "Alif Dhaalu (ADh)",
  "Vaavu (V)", "Meemu (M)", "Faafu (F)", "Dhaalu (Dh)", "Thaa (Th)", "Laamu (L)",
  "Gaafu Alif (GA)", "Gaafu Dhaalu (GDh)", "Gnaviyani (Gn)", "Seenu (Addu) (S)"
];
// Matches the allowed business_type values in MAZI_API_SPEC.md
const MAZI_BUSINESS_TYPES = ["Retail Shop", "Wholesale / Trading", "Restaurant / Café", "Guesthouse / Hotel", "Other"];
function populatePvBusinessTypes(){
  const el = $('#pvBusinessType');
  if (!el || el.options.length) return; // only needs to run once
  el.innerHTML = MAZI_BUSINESS_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  enhanceSelect(el);
}
let onboardWasSignup = false;
let onboardAccountType = 'residence';
let pvAccountType = 'residence';
function setPvAccountType(type){
  pvAccountType = type === 'business' ? 'business' : 'residence';
  $$('#pvTypeTabs .co-tab').forEach(tab=>{
    tab.classList.toggle('active', tab.dataset.accountType === pvAccountType);
  });
  const bizField = $('#pvBusinessSection');
  if (bizField) bizField.hidden = pvAccountType !== 'business';
}

function populateOnboardAtolls(){
  ['#onboardAtoll', '#pvAtoll'].forEach(sel=>{
    const el = $(sel);
    if (!el || el.options.length) return; // only needs to run once per select
    el.innerHTML = MAZI_ATOLLS.map(a => `<option value="${a}">${a}</option>`).join('');
    enhanceSelect(el);
  });
}

/* Turns a plain <select> into a custom dropdown: a styled trigger button +
   an options panel that opens wherever there's actually room (flips above
   the field instead of below when the field sits near the bottom of the
   screen/modal), with full keyboard support. Same component already used
   for the Atoll picker in checkout.js — ported here so onboardAtoll/pvAtoll
   get the same treatment instead of the browser's plain native dropdown. */
function enhanceSelect(sel){
  if (!sel || sel.dataset.ddReady) return;
  sel.dataset.ddReady = '1';

  const wrap = document.createElement('div');
  wrap.className = 'co-dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'co-dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<strong class="co-dd-label"></strong>'
    + '<svg class="co-dd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const list = document.createElement('div');
  list.className = 'co-dd-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(btn);
  wrap.appendChild(sel);
  wrap.appendChild(list);
  sel.classList.add('co-dd-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  const labelEl = btn.querySelector('.co-dd-label');
  let active = -1;

  function sync(){
    const o = sel.options[sel.selectedIndex];
    labelEl.textContent = o ? o.text : '';
    Array.from(list.children).forEach((b, i)=>{
      b.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
    });
  }
  function build(){
    list.innerHTML = '';
    Array.from(sel.options).forEach((o, i)=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'co-dd-opt';
      b.setAttribute('role', 'option');
      b.tabIndex = -1;
      b.textContent = o.text;
      b.addEventListener('click', ()=> choose(i));
      list.appendChild(b);
    });
    sync();
  }
  function choose(i){
    const changed = sel.selectedIndex !== i;
    sel.selectedIndex = i;
    sync();
    close(true);
    if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function setActive(i, center){
    if (active >= 0 && list.children[active]) list.children[active].classList.remove('active');
    active = Math.max(0, Math.min(list.children.length - 1, i));
    const el = list.children[active];
    if (!el) return;
    el.classList.add('active');
    if (center){
      list.scrollTop = el.offsetTop - (list.clientHeight - el.offsetHeight) / 2;
    } else if (el.offsetTop < list.scrollTop){
      list.scrollTop = el.offsetTop;
    } else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight){
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    }
  }
  function place(){
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    list.style.maxHeight = '';
    const natural = Math.min(list.scrollHeight + 2, 320);
    // Prefer DOWN. Flip up only if the list would be cramped below AND there is more room above.
    const up = below < Math.min(natural, 200) && above > below;
    const room = up ? above : below;
    list.style.maxHeight = Math.max(120, Math.min(320, room)) + 'px';
    wrap.classList.toggle('up', up);
    list.style.left = '0';
    list.style.right = 'auto';
    if (list.getBoundingClientRect().right > vw - 8){
      list.style.left = 'auto';
      list.style.right = '0';
    }
  }
  function isOpen(){ return !list.hidden; }
  function open(){
    if (isOpen()) return;
    document.querySelectorAll('.co-dd.open').forEach(w=>{ if (w.__ddClose) w.__ddClose(); });
    list.hidden = false;
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    place();
    active = -1;
    setActive(sel.selectedIndex < 0 ? 0 : sel.selectedIndex, true);
  }
  function close(focusBtn){
    list.hidden = true;
    wrap.classList.remove('open', 'up');
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  }
  wrap.__ddClose = ()=> close(false);

  btn.addEventListener('click', ()=> isOpen() ? close(false) : open());
  btn.addEventListener('keydown', e=>{
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp'){
      e.preventDefault();
      if (!isOpen()) return open();
      setActive(active + (k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Home' || k === 'End'){
      if (!isOpen()) return;
      e.preventDefault();
      setActive(k === 'Home' ? 0 : list.children.length - 1);
    } else if (k === 'Enter' || k === ' '){
      e.preventDefault();
      if (!isOpen()) open(); else choose(active);
    } else if (k === 'Escape'){
      if (isOpen()){ e.preventDefault(); close(true); }
    } else if (k === 'Tab'){
      if (isOpen()) close(false);
    } else if (k.length === 1 && /\S/.test(k)){
      // type-ahead: jump to the next option that starts with this letter
      const opts = Array.from(sel.options);
      const from = (isOpen() ? active : sel.selectedIndex) + 1;
      const ch = k.toLowerCase();
      for (let n = 0; n < opts.length; n++){
        const i = (from + n) % opts.length;
        if (opts[i].text.toLowerCase().startsWith(ch)){
          if (isOpen()) setActive(i); else choose(i);
          break;
        }
      }
    }
  });
  // Clicking the list's padding/scrollbar must not trigger the surrounding <label>.
  wrap.addEventListener('click', e=>{ if (!e.target.closest('.co-dd-btn')) e.preventDefault(); });
  document.addEventListener('pointerdown', e=>{ if (isOpen() && !wrap.contains(e.target)) close(false); });
  window.addEventListener('resize', ()=>{ if (isOpen()) close(false); });

  // Keep the custom list in sync when the real <select> is changed from code
  // (options re-filled, or .value assigned).
  new MutationObserver(build).observe(sel, { childList: true });
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get(){ return valueDesc.get.call(sel); },
    set(v){ valueDesc.set.call(sel, v); sync(); }
  });
  sel.addEventListener('change', sync);
  build();
}
function clearOnboardErrors(){
  ['onboardNameField', 'onboardMobileField', 'onboardCityField', 'onboardBusinessField']
    .forEach(id => $(`#${id}`)?.classList.remove('has-error'));
  ['onboardNameError', 'onboardMobileError', 'onboardCityError', 'onboardBusinessError']
    .forEach(id => { const el = $(`#${id}`); if (el) el.hidden = true; });
}
function showOnboardError(message, fieldId, errorId){
  const field = $(`#${fieldId}`);
  if (field) field.classList.add('has-error');
  const error = $(`#${errorId}`);
  if (error){ error.textContent = message; error.hidden = false; }
}
function setOnboardAccountType(type){
  onboardAccountType = type === 'business' ? 'business' : 'residence';
  $$('#onboardTypeTabs .co-tab').forEach(tab=>{
    tab.classList.toggle('active', tab.dataset.accountType === onboardAccountType);
  });
  const bizField = $('#onboardBusinessField');
  if (bizField){
    bizField.hidden = onboardAccountType !== 'business';
    $('#onboardBusinessName').required = onboardAccountType === 'business';
  }
}
function openOnboarding(prefill){
  populateOnboardAtolls();
  onboardWasSignup = !!(prefill && prefill.wasSignup);
  clearOnboardErrors();
  setOnboardAccountType('residence');
  $('#onboardName').value = (prefill && prefill.name) || '';
  $('#onboardMobile').value = (prefill && prefill.mobile ? prefill.mobile : '').replace(/^\+?960/, '');
  $('#onboardCity').value = '';
  $('#onboardBusinessName').value = '';
  $('#onboardAtoll').value = 'Kaafu (K)';
  const submitBtn = $('#onboardSubmit');
  if (submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Continue'; }
  $('#authBackdrop').classList.add('show');
  $('#onboardModal').classList.add('open');
}
function closeOnboarding(){
  $('#authBackdrop').classList.remove('show');
  $('#onboardModal').classList.remove('open');
}
function bindOnboardingEvents(){
  $$('#onboardTypeTabs .co-tab').forEach(tab=>{
    tab.addEventListener('click', ()=> setOnboardAccountType(tab.dataset.accountType));
  });
  $$('#pvTypeTabs .co-tab').forEach(tab=>{
    tab.addEventListener('click', ()=> setPvAccountType(tab.dataset.accountType));
  });
  const form = $('#onboardForm');
  if (!form) return;
  form.addEventListener('submit', e=>{
    e.preventDefault();
    clearOnboardErrors();
    const name = $('#onboardName').value.trim();
    const mobileDigits = $('#onboardMobile').value.trim().replace(/[^0-9]/g, '');
    const atoll = $('#onboardAtoll').value;
    const city = $('#onboardCity').value.trim();
    const businessName = $('#onboardBusinessName').value.trim();
    if (!name){
      showOnboardError('Please enter your name.', 'onboardNameField', 'onboardNameError');
      return;
    }
    if (!/^\d{7}$/.test(mobileDigits)){
      showOnboardError('Enter a valid 7-digit Maldives number.', 'onboardMobileField', 'onboardMobileError');
      return;
    }
    if (!city){
      showOnboardError('Please enter your island or city.', 'onboardCityField', 'onboardCityError');
      return;
    }
    if (onboardAccountType === 'business' && !businessName){
      showOnboardError('Please enter your business name.', 'onboardBusinessField', 'onboardBusinessError');
      return;
    }
    if (!window.MaziAPI || !MaziAPI.updateProfile){
      showToast('Could not save your profile. Please try again.', null, 'error');
      return;
    }
    const mobile = `+960${mobileDigits}`;
    const submitBtn = $('#onboardSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    MaziAPI.updateProfile({
      name,
      mobile,
      atoll,
      city,
      account_type: onboardAccountType,
      business_type: onboardAccountType === 'business' ? 'Wholesale / Trading' : null,
      business_name: onboardAccountType === 'business' ? businessName : null,
      onboarded: true
    }).then(()=>{
      const sess = getSession() || {};
      setSession({ ...sess, name, firstName: name, mobile, atoll, city, accountType: onboardAccountType, businessName: onboardAccountType === 'business' ? businessName : '' });
      closeOnboarding();
      showLoginSuccess(name, onboardWasSignup);
    }).catch(err=>{
      showToast((err && err.message) || 'Could not save your profile. Please try again.', null, 'error');
    }).finally(()=>{
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue';
    });
  });
}

/* ============ Session (login state) ============ */
function getSession(){
  try{ return JSON.parse(localStorage.getItem('mazi_session') || 'null'); }
  catch{ return null; }
}
// Whatever a shopper added to the cart before logging in lives under the
// "guest" bucket. On login/register we fold those items into the account's
// own cart — for any product that's in both, the guest quantity wins and
// overwrites whatever qty was already saved on the account (not added on
// top of it), so nothing picked before signing in gets left behind, but
// old account quantities don't silently inflate.
function mergeGuestCartIntoAccount(){
  const GUEST_KEY = 'mazi_cart_guest';
  const targetKey = cartKey();
  if (targetKey === GUEST_KEY) return; // still on the guest bucket — nothing to merge, and merging into itself would wipe it
  try{
    const guestCart = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}');
    const guestIds = Object.keys(guestCart);
    if (guestIds.length === 0) return;
    const accountCart = JSON.parse(localStorage.getItem(targetKey) || '{}');
    guestIds.forEach(id=>{
      accountCart[id] = guestCart[id]; // overwrite — guest qty wins over whatever qty was already in the account cart for this item
    });
    localStorage.setItem(targetKey, JSON.stringify(accountCart));
    localStorage.removeItem(GUEST_KEY);
  } catch(e){}
}
function setSession(data){
  localStorage.setItem('mazi_session', JSON.stringify(data));
  mergeGuestCartIntoAccount();
  state.recentSearches = loadRecentSearches();
  state.cart = loadCart();
  refreshVisibleCurrency(); // re-renders product grid + open product detail so Add to Cart / Added-to-cart state matches the new account's cart
  updateOrdersNotifBadge();
  syncOrders();      // pull this account's real orders from the server
  startOrdersLive(); // and listen for status changes made by staff
  initOrdersNotifPrompt(); // re-check auth state so the prompt reflects being logged in right away
  refreshOpenSearchPanel();
  renderAuthButton();
}
function clearSession(){
  stopOrdersLive();
  localStorage.removeItem('mazi_session');
  state.recentSearches = loadRecentSearches();
  state.cart = loadCart();
  refreshVisibleCurrency(); // re-renders product grid + open product detail so Add to Cart / Added-to-cart state resets back to the guest cart
  updateOrdersNotifBadge();
  initOrdersNotifPrompt(); // re-check auth state so the "Get notified" prompt/toggle doesn't stay stuck visible after logout
  refreshOpenSearchPanel();
  renderAuthButton();
}
function refreshOpenSearchPanel(){
  const panel = $('#mobileSearchPanel');
  if (panel && panel.classList.contains('open')){
    renderMobileSearchBody($('#mobileSearchInput').value);
  }
}
function renderAuthButton(){
  const session = getSession();
  document.body.classList.toggle('is-authenticated', !!session);
  $$('.js-login-btn').forEach(btn=>{ btn.hidden = !!session; });
  $$('.js-profile-wrap').forEach(wrap=>{ wrap.hidden = !session; });
  // Logged-in desktop shoppers change currency from the profile dropdown,
  // so there is no separate MVR/USD pill in the navbar anymore.
  const mobileCurrencyWrap = $('#navbarCurrencyWrap');
  // The mobile change-currency icon is useful as a visual affordance even
  // for guests; the dropdown itself is gated by CSS until login.
  if (mobileCurrencyWrap) mobileCurrencyWrap.hidden = false;
  if (!session) closeProfileDropdown();
}
function toggleProfileDropdown(dropdown){
  $$('.profile-dropdown').forEach(d=>{
    if (d !== dropdown) d.classList.remove('open');
  });
  dropdown.classList.toggle('open');
  // Re-measure the currency pill inside the dropdown now that it's visible —
  // it may have been rendered while profile-wrap was still [hidden] (logged
  // out), so its thumb position/width wasn't correct until now.
  if (dropdown.classList.contains('open')) positionCurrencyThumbs();
}
function closeProfileDropdown(){
  $$('.profile-dropdown').forEach(d=> d.classList.remove('open'));
}
// Mobile-only currency dropdown (replaces the old hamburger/menu button —
// the "Categories" menu is already reachable from the bottom nav on mobile).
function toggleCurrencyDropdown(){
  const wrap = $('#navbarCurrencyWrap');
  if (!wrap) return;
  const isOpen = wrap.classList.toggle('open');
  const btn = $('#navHamburgerBtn');
  if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}
function closeCurrencyDropdown(){
  const wrap = $('#navbarCurrencyWrap');
  if (!wrap) return;
  wrap.classList.remove('open');
  const btn = $('#navHamburgerBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function openProfileMenu(){
  $('#profileMenuBackdrop').classList.add('show');
  $('#profileMenu').classList.add('open');
}
function closeProfileMenu(){
  $('#profileMenuBackdrop').classList.remove('show');
  $('#profileMenu').classList.remove('open');
}

/* ============ Auth loading (3-dot) ============ */
function showAuthLoading(){
  $('#authLoading').classList.add('show');
}
function hideAuthLoading(){
  $('#authLoading').classList.remove('show');
}
function withAuthLoading(action, delay = 900){
  showAuthLoading();
  setTimeout(()=>{
    hideAuthLoading();
    action();
  }, delay);
}

/* ============ Generic confirm modal ============ */
let _confirmAction = null;
function openConfirmModal({ title, sub, note, confirmLabel = 'Confirm', onConfirm }){
  $('#logoutConfirmModal').querySelector('.confirm-title').textContent = title;
  $('#logoutConfirmModal').querySelector('.confirm-sub').textContent = sub;
  const noteEl = $('#confirmNote');
  if (note){
    noteEl.textContent = note;
    noteEl.hidden = false;
  } else {
    noteEl.textContent = '';
    noteEl.hidden = true;
  }
  $('#logoutConfirmBtn').textContent = confirmLabel;
  _confirmAction = onConfirm;
  $('#logoutConfirmBackdrop').classList.add('show');
  $('#logoutConfirmModal').classList.add('open');
}
function openLogoutConfirm(){
  openConfirmModal({
    title: 'Are you sure you want to log out?',
    sub: "You'll need to log in again to access your account.",
    confirmLabel: 'Log out',
    onConfirm: performLogout,
  });
}
function openDeleteAccountConfirm(){
  openConfirmModal({
    title: 'Are you sure you want to delete your account?',
    sub: 'This will permanently remove your account and cannot be undone.',
    confirmLabel: 'Delete account',
    onConfirm: ()=>{
      withAuthLoading(()=>{
        clearSession();
        showToast('Account deleted');
      }, 800);
    },
  });
}
function closeLogoutConfirm(){
  $('#logoutConfirmBackdrop').classList.remove('show');
  $('#logoutConfirmModal').classList.remove('open');
}
function performLogout(){
  showAuthLoading();
  Promise.resolve(window.MaziAPI && MaziAPI.logout ? MaziAPI.logout() : null)
    .catch(err => showToast(err.message || 'Could not log out from the server', null, 'error'))
    .finally(()=>{
      hideAuthLoading();
      clearSession();
      showToast('Logged out');
    });
}

/* ============ Orders ============ */
const ORDER_STEPS = [
  { key:'placed',     label:'Order Placed' },
  { key:'processing', label:'Processing' },
  { key:'delivery',   label:'Out for Delivery' },
  { key:'delivered',  label:'Delivered' },
];

// Order status is REAL now: it lives in the database (Supabase) and staff change
// it from admin.html. This device only mirrors it. localStorage is just a
// per-account cache so the Orders view opens instantly / works briefly offline.
function getOrders(){
  try{ return JSON.parse(localStorage.getItem(ordersKey()) || '[]'); }
  catch(e){ return []; }
}
function saveOrders(orders){
  localStorage.setItem(ordersKey(), JSON.stringify(orders));
}

function orderStatusIndex(order){
  const i = ORDER_STEPS.findIndex(step => step.key === order.status);
  return i < 0 ? 0 : i;
}

// Old versions saved "orders" only in the customer's own browser (nothing
// ever reached the shop). Those have no server status, so drop them.
function purgeLegacyLocalOrders(){
  try{
    const orders = getOrders();
    const kept = orders.filter(o => o && o.status);
    if (kept.length !== orders.length) saveOrders(kept);
  } catch(e){}
}

// Merge the server's list into the cache, keeping the local-only flags that
// drive popups/badges (notifiedIdx, badgeUnseen).
function mergeServerOrders(serverOrders){
  const prevById = {};
  getOrders().forEach(o => { prevById[o.id] = o; });
  const merged = serverOrders.map(o=>{
    const prev = prevById[o.id];
    const idx = orderStatusIndex(o);
    // First time this device sees an order: don't pop a notification for a
    // status it already had — only for changes from now on.
    o.notifiedIdx = prev && prev.notifiedIdx !== undefined ? prev.notifiedIdx : idx;
    o.badgeUnseen = !!(prev && prev.badgeUnseen);
    if (prev && !prev.cancelled && o.cancelled){
      // Cancelled by staff (a self-cancel is already cached as cancelled)
      o.badgeUnseen = true;
      showToast('Order #' + o.id + ' was cancelled', o.refundStatus === 'pending' ? 'Your refund is being processed.' : '');
    }
    return o;
  });
  saveOrders(merged);
}

let ordersSyncPromise = null;
function syncOrders(){
  if (!getSession() || !window.MaziAPI || !MaziAPI.listOrders) return Promise.resolve();
  if (ordersSyncPromise) return ordersSyncPromise;
  ordersSyncPromise = MaziAPI.listOrders().then(rows=>{
    mergeServerOrders(rows);
    updateOrdersNotifBadge();
    checkOrderUpdates();
    const view = $('#ordersView');
    if (view && view.classList.contains('open')) renderOrdersView();
  }).catch(err=>{
    if (err && err.code === 'NOT_AUTHENTICATED'){
      // Only log the shopper out if the server really has no session for them.
      MaziAPI.getSession().then(sess=>{
        if (!sess){ clearSession(); showToast('Your session expired. Please log in again.', null, 'error'); }
      }).catch(()=>{});
    }
  }).finally(()=>{ ordersSyncPromise = null; });
  return ordersSyncPromise;
}

// Live updates: the moment staff change a status, the shopper's device hears
// about it. (Falls back to the 30-second poll in init() if realtime is off.)
let ordersUnsub = null;
function startOrdersLive(){
  stopOrdersLive();
  if (!getSession() || !window.MaziAPI || !MaziAPI.subscribeOrders) return;
  try{ ordersUnsub = MaziAPI.subscribeOrders(()=> syncOrders()); } catch(e){}
}
function stopOrdersLive(){
  if (ordersUnsub){ try{ ordersUnsub(); } catch(e){} ordersUnsub = null; }
}

function orderStepDotContent(done){
  return done
    ? `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : '';
}

function renderOrderStatus(order){
  const idx = orderStatusIndex(order);
  return ORDER_STEPS.map((step, i)=>{
    const done = i < idx || (i === idx && idx === ORDER_STEPS.length-1);
    const active = i === idx && !done;
    const cls = done ? 'done' : (active ? 'active' : '');
    return `
      <div class="order-step ${cls}">
        <div class="order-step-dot">${done ? orderStepDotContent(true) : (i+1)}</div>
        <div class="order-step-label">${step.label}</div>
      </div>
    `;
  }).join('');
}

function orderStatusBadge(order){
  if (order.cancelled) return `<span class="order-status-badge cancelled">Cancelled</span>`;
  const idx = orderStatusIndex(order);
  const step = ORDER_STEPS[idx];
  const cls = idx===0?'placed':idx===1?'processing':idx===2?'delivery':'delivered';
  return `<span class="order-status-badge ${cls}">${step.label}</span>`;
}

function canCancelOrder(order){
  return !order.cancelled && orderStatusIndex(order) === 0;
}
function showCancelButton(order){
  return !order.cancelled && orderStatusIndex(order) < ORDER_STEPS.length - 1;
}

/* ============ Order notifications (glass popups + Orders badge) ============ */
function isDelivered(order){
  return !order.cancelled && orderStatusIndex(order) === ORDER_STEPS.length - 1;
}
// An order lights up the Orders badge once it's confirmed as "successful"
// (moved past Placed into Processing) and again when it's Delivered.
function getUnseenNotifCount(){
  return getOrders().filter(o => !o.cancelled && o.badgeUnseen).length;
}
function markOrdersSeen(){
  const orders = getOrders();
  let changed = false;
  orders.forEach(o=>{
    if (o.badgeUnseen){ o.badgeUnseen = false; changed = true; }
  });
  if (changed) saveOrders(orders);
  return changed;
}
function updateOrdersNotifBadge(){
  const count = getSession() ? getUnseenNotifCount() : 0;
  const badge = $('#bnOrdersCount');
  if (badge){
    badge.textContent = count;
    badge.hidden = count === 0;
  }
  $$('.js-profile-orders-btn, #pmOrdersBtn').forEach(el=>{
    el.classList.toggle('has-notif', count > 0);
  });
}

const ORDER_NOTIF_ICONS = {
  processing: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  delivery: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 7h11v8H3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 11h4l3 3v1h-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="18" r="1.6" fill="currentColor"/><circle cx="17.5" cy="18" r="1.6" fill="currentColor"/></svg>`,
  delivered: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
const ORDER_NOTIF_SUBS = {
  processing: "We're getting your order ready.",
  delivery: 'Your rider is on the way.',
  delivered: 'Your order has arrived. Enjoy!',
};
function orderNotifClass(idx){
  return idx===1?'processing':idx===2?'delivery':'delivered';
}

// Shows one glass notification card for an order's new status. Cards stack
// in #orderNotifStack, auto-dismiss after 5s, and tapping one opens Orders.
function showOrderNotif(order, idx){
  const stack = $('#orderNotifStack');
  if (!stack) return;
  const step = ORDER_STEPS[idx];
  const cls = orderNotifClass(idx);

  const el = document.createElement('div');
  el.className = 'order-notif';
  el.innerHTML = `
    <span class="order-notif-icon ${cls}">${ORDER_NOTIF_ICONS[cls]}</span>
    <span class="order-notif-body">
      <span class="order-notif-top">
        <span class="order-notif-title">${step.label}</span>
        <button type="button" class="order-notif-close" aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </span>
      <span class="order-notif-sub">${ORDER_NOTIF_SUBS[cls]}</span>
      <span class="order-notif-id">Order #${order.id}</span>
    </span>
  `;

  let timer;
  const remove = ()=>{
    clearTimeout(timer);
    el.classList.remove('show');
    el.classList.add('hide');
    setTimeout(()=>{ if (el.parentNode) el.parentNode.removeChild(el); }, 320);
  };
  el.addEventListener('click', (e)=>{
    if (e.target.closest('.order-notif-close')){ e.stopPropagation(); remove(); return; }
    remove();
    openOrdersView();
  });

  stack.appendChild(el);
  requestAnimationFrame(()=> requestAnimationFrame(()=> el.classList.add('show')));
  timer = setTimeout(remove, 5000);
}

// Polls each order's time-based status against what's already been notified.
// Fires a glass popup the moment an order reaches Processing, Out for
// Delivery, or Delivered — and lights up the Orders badge for the
// "successful" (Processing) and Delivered milestones.
function checkOrderUpdates(){
  if (!getSession()) return;
  const orders = getOrders();
  let changed = false;
  let badgeChanged = false;

  orders.forEach(o=>{
    if (o.cancelled) return;
    if (o.notifiedIdx === undefined) o.notifiedIdx = 0;
    const idx = orderStatusIndex(o);
    if (idx > o.notifiedIdx){
      showOrderNotif(o, idx);
      fireDeviceNotification(o, idx);
      if (idx === 1 || idx === ORDER_STEPS.length - 1){
        o.badgeUnseen = true;
        badgeChanged = true;
      }
      o.notifiedIdx = idx;
      changed = true;
    }
  });

  if (changed) saveOrders(orders);
  if (badgeChanged) updateOrdersNotifBadge();
}

/* ============ Device (OS-level) order notifications ============ */
// These are real notifications from the browser/OS — they can show on a
// phone's lock screen or a desktop's notification tray, even if this tab
// isn't focused, as long as the browser is running.
const NOTIF_ICON = 'img/icon-192.png';   // app icon (large picture in the notification)
const NOTIF_BADGE = 'img/badge-96.png'; // white one-colour icon for the Android status bar

function notifSupported(){
  return typeof window !== 'undefined' && 'Notification' in window;
}

// App-level on/off switch, separate from the browser's own permission.
// Browser permission can only ever be granted once (the "Enable" prompt);
// after that, the user turns notifications on/off for the app itself from
// their Profile page instead of being asked again.
function getNotifPref(){
  return localStorage.getItem('mazi_notif_pref') || 'on';
}
function setNotifPref(val){
  localStorage.setItem('mazi_notif_pref', val);
}

function registerNotifServiceWorker(){
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('sw.js').catch(()=> null);
}

// Must be called from inside a real click/tap so mobile browsers allow the
// permission prompt. Calls back with the resulting permission string
// ('granted' | 'denied' | 'default' | 'unsupported').
function requestDeviceNotifPermission(onDone){
  if (!notifSupported()){ if (onDone) onDone('unsupported'); return; }
  if (Notification.permission !== 'default'){ if (onDone) onDone(Notification.permission); return; }
  registerNotifServiceWorker();
  Notification.requestPermission().then(perm=>{ if (onDone) onDone(perm); });
}

// Fires a real device notification for an order status change. Prefers the
// service worker path (required on Android Chrome — the plain Notification
// constructor is blocked there) and falls back to the constructor directly
// on desktop browsers that support it without a worker.
function fireDeviceNotification(order, idx){
  if (!notifSupported() || Notification.permission !== 'granted') return;
  if (getNotifPref() === 'off') return;
  const step = ORDER_STEPS[idx];
  const cls = orderNotifClass(idx);
  const title = `${step.label} — Order #${order.id}`;
  const options = {
    body: ORDER_NOTIF_SUBS[cls],
    icon: NOTIF_ICON,
    badge: NOTIF_BADGE,
    tag: `mazi-order-${order.id}`,
    renotify: true,
    data: { url: 'index.html?open=orders' },
  };
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.ready.then(reg=> reg.showNotification(title, options))
      .catch(()=>{ try{ new Notification(title, options); } catch(err){} });
  } else {
    try{ new Notification(title, options); } catch(err){}
  }
}

// Inline banner (shown in the Orders view) offering to turn device
// notifications on. Unlike before, it no longer disappears once granted —
// instead it morphs into a persistent on/off toggle right there, so the
// person can turn order + future offer/sale alerts back on or off anytime
// without digging into Profile settings. Only fully hides itself when
// notifications are unsupported or the browser permission was denied.
function initOrdersNotifPrompt(){
  const el = $('#ordersNotifPrompt');
  const action = $('#ordersNotifAction');
  if (!el || !action) return;

  if (!notifSupported() || !getSession() || Notification.permission === 'denied'){
    el.hidden = true;
    return;
  }
  el.hidden = false;

  if (Notification.permission === 'granted'){
    renderNotifToggle(action, 'ordersNotifToggle');
  } else {
    renderNotifEnableButton(action, 'ordersNotifBtn', ()=> renderNotifToggle(action, 'ordersNotifToggle'), el);
  }
}

// Renders the "Enable" button with the add-to-cart-style loading → success
// animation. On success, calls onEnabled() to swap in the toggle.
function renderNotifEnableButton(action, btnId, onEnabled, promptEl){
  action.innerHTML = `
    <button type="button" class="notif-prompt-btn" id="${btnId}">
      <span class="notif-btn-label">Enable</span>
      <span class="notif-btn-dots"><span></span><span></span><span></span></span>
      <span class="notif-btn-success">
        <span class="notif-btn-success-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        Enabled
      </span>
    </button>`;
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', ()=>{
    if (btn.classList.contains('loading') || btn.classList.contains('success')) return;
    btn.classList.add('loading');
    requestDeviceNotifPermission((perm)=>{
      // Keep the loading state on screen briefly (same rhythm as Add to
      // Cart) so the animation reads as real work happening, not a flicker.
      setTimeout(()=>{
        btn.classList.remove('loading');
        if (perm === 'granted'){
          setNotifPref('on');
          btn.classList.add('success');
          setTimeout(onEnabled, 900);
        } else if (perm === 'denied'){
          if (promptEl) promptEl.hidden = true;
        }
        // perm === 'default' (dismissed) — button just resets, user can retry
      }, 900);
    });
  });
}

// Renders the persistent on/off toggle shown once permission is granted.
// Toggling plays the same shrink-to-circle loading animation as Add to Cart:
// tap -> collapses into a small pulsing-dot circle -> expands back showing
// the new On/Off state.
function renderNotifToggle(action, toggleId){
  const on = getNotifPref() !== 'off';
  action.innerHTML = `
    <div class="notif-inline-toggle-wrap" id="${toggleId}Wrap">
      <span class="notif-toggle-caption" id="${toggleId}Caption">${on ? 'On' : 'Off'}</span>
      <label class="pv-toggle-switch" aria-label="Order &amp; offer notifications">
        <input type="checkbox" id="${toggleId}" ${on ? 'checked' : ''}>
        <span class="pv-toggle-slider"></span>
      </label>
    </div>`;
  const wrap = document.getElementById(`${toggleId}Wrap`);
  const toggle = document.getElementById(toggleId);
  if (!toggle) return;
  toggle.addEventListener('change', ()=>{
    const isOn = toggle.checked;
    if (wrap) wrap.innerHTML = `<span class="notif-toggle-dots"><span></span><span></span><span></span></span>`;
    setTimeout(()=>{
      setNotifPref(isOn ? 'on' : 'off');
      showToast(isOn ? "Notifications on — you'll also hear about offers & sales" : 'Notifications turned off');
      renderNotifToggle(action, toggleId);
    }, 700);
  });
}

// Order-notifications toggle shown on the Profile page. Only appears once
// the browser permission has actually been granted (there's nothing to
// toggle before that) — this is where the user turns notifications back
// off if they no longer want them, without needing browser-level settings.
function initProfileNotifToggle(){
  const card = $('#pvNotifCard');
  const toggle = $('#pvNotifToggle');
  if (!card || !toggle) return;

  if (!notifSupported() || Notification.permission !== 'granted'){
    card.hidden = true;
    return;
  }
  card.hidden = false;
  toggle.checked = getNotifPref() !== 'off';

  if (!toggle._wired){
    toggle._wired = true;
    toggle.addEventListener('change', ()=>{
      setNotifPref(toggle.checked ? 'on' : 'off');
      showToast(toggle.checked ? 'Order notifications enabled' : 'Order notifications turned off');
    });
  }
}

/* ============ Install App (PWA) ============ */
// Intentionally no custom install button/modal here — the manifest.json +
// service worker below already make the site installable, and browsers
// that support it (Chrome/Edge desktop & Android) show their own native
// "Install" icon in the address bar / menu automatically. Building a
// custom prompt on top of that used to call preventDefault() on
// beforeinstallprompt, which suppressed that native icon — removed so the
// browser's own install UI is what people see and use.

function cancelOrder(orderId){
  showAuthLoading();
  return MaziAPI.cancelOrder(orderId).then(updated=>{
    const orders = getOrders();
    const i = orders.findIndex(o=> o.id === orderId);
    updated.notifiedIdx = i >= 0 ? (orders[i].notifiedIdx || 0) : 0;
    updated.badgeUnseen = false;
    if (i >= 0) orders[i] = updated; else orders.unshift(updated);
    saveOrders(orders);
    renderOrdersView();
    showToast('Order cancelled');
  }).catch(err=>{
    showToast((err && err.message) || 'Could not cancel this order.', null, 'error');
    return syncOrders(); // staff may already have moved it on
  }).finally(hideAuthLoading);
}

function openCancelOrderConfirm(orderId){
  openConfirmModal({
    title: 'Cancel this order?',
    sub: "This order hasn't been approved yet. Once cancelled, this can't be undone.",
    note: "If you've already sent payment via bank transfer or QR code, it won't be refunded instantly — refunds are processed manually by our team and may take a few business days.",
    confirmLabel: 'Cancel Order',
    onConfirm: ()=> cancelOrder(orderId),
  });
}

function formatOrderDate(ts){
  return new Date(ts).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

let ordersVisibleCount = 10;
const ORDERS_PAGE_SIZE = 10;

function renderOrdersView(){
  markOrdersSeen();
  updateOrdersNotifBadge();
  initOrdersNotifPrompt();

  if (!getSession()){
    $('#ordersCount').textContent = '';
    $('#ordersCardBody').innerHTML = `
      <div class="orders-empty">
        <div class="orders-empty-icon">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM4.5 20.25a7.5 7.5 0 0115 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p>Log in to view your orders</p>
        <a href="#" class="orders-empty-cta" id="ordersEmptyCta">Login / Register</a>
      </div>
    `;
    $('#ordersEmptyCta').addEventListener('click', e=>{
      e.preventDefault();
      closeOrdersView();
      openLogin();
    });
    return;
  }

  const allOrders = getOrders();
  $('#ordersCount').textContent = allOrders.length ? `${allOrders.length} order${allOrders.length!==1?'s':''}` : '';

  if (allOrders.length === 0){
    $('#ordersCardBody').innerHTML = `
      <div class="orders-empty">
        <div class="orders-empty-icon">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16l-1.5 12h-13z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 7a4 4 0 018 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <p>You didn't order anything yet</p>
        <a href="#" class="orders-empty-cta" id="ordersEmptyCta">Start Shopping</a>
      </div>
    `;
    $('#ordersEmptyCta').addEventListener('click', e=>{
      e.preventDefault();
      closeOrdersView();
    });
    return;
  }

  const ORDER_VISIBLE_ITEMS = 3;
  const orderRenderItemRow = (it, order) => `
    <div class="order-item-row">
      <div class="order-item-media"><img src="${productImg(PRODUCTS.find(p=>p.id===it.id) || it)}" alt="${it.name}" onerror="this.classList.add('img-missing')"></div>
      <div class="order-item-info">
        <div class="order-item-name">${it.name}</div>
        <div class="order-item-meta">${it.pack} · Qty ${it.qty}</div>
      </div>
      <div class="order-item-price">${fmtCur(it.price*it.qty, order.currency || 'MVR')}</div>
    </div>
  `;

  const orders = allOrders.slice(0, ordersVisibleCount);
  const remaining = allOrders.length - orders.length;

  $('#ordersCardBody').innerHTML = `
    <div class="orders-list">
      ${orders.map(order => {
        const visibleItems = order.items.slice(0, ORDER_VISIBLE_ITEMS);
        const hiddenItems = order.items.slice(ORDER_VISIBLE_ITEMS);
        return `
        <div class="order-card">
          <div class="order-card-head">
            <div>
              <div class="order-card-id">Order #${order.id}</div>
              <div class="order-card-date">${formatOrderDate(order.placedAt)}</div>
            </div>
            ${orderStatusBadge(order)}
          </div>
          <div class="order-items">
            ${visibleItems.map(it => orderRenderItemRow(it, order)).join('')}
            ${hiddenItems.length ? `
              <div class="order-items-hidden" id="orderItemsHidden-${order.id}">
                ${hiddenItems.map(it => orderRenderItemRow(it, order)).join('')}
              </div>
              <button type="button" class="order-see-more-btn" id="orderSeeMoreBtn-${order.id}" data-order-toggle="${order.id}">
                <span id="orderSeeMoreLabel-${order.id}">See ${hiddenItems.length} more item${hiddenItems.length!==1?'s':''}</span>
                <svg viewBox="0 0 24 24" class="order-see-more-icon"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            ` : ''}
          </div>
          <div class="order-total-row">
            <span class="label">Order Total</span>
            <span class="value">${fmtCur(order.total, order.currency || 'MVR')}</span>
          </div>
          <div class="order-receipt-row">
            <button type="button" class="order-receipt-btn" data-receipt-order="${order.id}">
              <svg viewBox="0 0 24 24"><path d="M6 2h9l3 3v17l-2.5-1.5L13 22l-2.5-1.5L8 22l-2-12.5V2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              View Receipt
            </button>
          </div>
          ${order.cancelled ? `
            <div class="order-cancelled-note">This order was cancelled.${order.refundStatus === 'pending' ? ' Your refund is being processed by our team.' : (order.refundStatus === 'refunded' ? ' Your refund has been sent.' : '')}</div>
          ` : `
            <div class="order-steps">
              ${renderOrderStatus(order)}
            </div>
          `}
          ${showCancelButton(order) ? `
            <div class="order-cancel-row">
              <button type="button" class="order-cancel-btn" data-cancel-order="${order.id}" ${canCancelOrder(order) ? '' : 'disabled'}>Cancel Order</button>
            </div>
          ` : ''}
        </div>
      `;
      }).join('')}
    </div>
    ${remaining > 0 ? `
      <button type="button" class="orders-load-more-btn" id="ordersLoadMoreBtn">
        Load ${Math.min(remaining, ORDERS_PAGE_SIZE)} more order${Math.min(remaining, ORDERS_PAGE_SIZE)!==1?'s':''}
      </button>
    ` : ''}
  `;
  $('#ordersLoadMoreBtn')?.addEventListener('click', ()=>{
    ordersVisibleCount += ORDERS_PAGE_SIZE;
    renderOrdersView();
  });
  $$('[data-order-toggle]').forEach(btn=>{
    btn.addEventListener('click', ()=> toggleOrderItems(btn.dataset.orderToggle));
  });
  $$('[data-cancel-order]').forEach(btn=>{
    btn.addEventListener('click', ()=> openCancelOrderConfirm(btn.dataset.cancelOrder));
  });
  $$('[data-receipt-order]').forEach(btn=>{
    btn.addEventListener('click', ()=> openReceiptModal(btn.dataset.receiptOrder));
  });
}

function toggleOrderItems(orderId){
  const hidden = document.getElementById('orderItemsHidden-'+orderId);
  const btn = document.getElementById('orderSeeMoreBtn-'+orderId);
  const label = document.getElementById('orderSeeMoreLabel-'+orderId);
  if (!hidden || !btn || !label) return;
  const expanded = hidden.classList.toggle('show');
  btn.classList.toggle('expanded', expanded);
  const hiddenCount = hidden.querySelectorAll('.order-item-row').length;
  label.textContent = expanded ? 'See less' : `See ${hiddenCount} more item${hiddenCount!==1?'s':''}`;
}

function openOrdersView(){
  ordersVisibleCount = ORDERS_PAGE_SIZE;
  renderOrdersView();
  syncOrders();
  closeOtherFullScreenViews('ordersView');
  $('#ordersView').classList.add('open');
  document.body.style.overflow = 'hidden';
  clearInterval(openOrdersView._timer);
  openOrdersView._timer = setInterval(renderOrdersView, 15000);
}
function closeOrdersView(){
  $('#ordersView').classList.remove('open');
  document.body.style.overflow = '';
  clearInterval(openOrdersView._timer);
  returnToCheckoutIfNeeded();
}

/* ============ Order Confirmation (shown right after checkout, before admin processes) ============ */
function openOrderConfirmModal(order){
  const session = getSession() || {};
  const customer = order.customer || {};
  const firstName = (customer.name || '').split(' ')[0] || session.firstName || session.name || 'there';
  const itemCount = order.items.reduce((s,it)=> s + it.qty, 0);

  $('#ocSub').textContent = `Hi ${firstName}, your order for ${itemCount} product${itemCount!==1?'s':''} has been received and is now pending confirmation from our team.`;

  const OC_VISIBLE_ITEMS = 4;
  const ocRenderItemRow = (it, idx) => `
    ${idx>0 ? '<div class="oc-item-divider"></div>' : ''}
    <div class="oc-item-row">
      <div class="oc-item-media"><img src="${productImg(PRODUCTS.find(p=>p.id===it.id) || it)}" alt="${it.name}" onerror="this.classList.add('img-missing')"></div>
      <div class="oc-item-info">
        <div class="oc-item-name">${it.name}</div>
        <div class="oc-item-meta">${it.pack} &middot; Qty ${it.qty}</div>
      </div>
      <div class="oc-item-price">${fmtCur(it.price * it.qty, order.currency || 'MVR')}</div>
    </div>
  `;
  const ocVisibleItems = order.items.slice(0, OC_VISIBLE_ITEMS);
  const ocHiddenItems = order.items.slice(OC_VISIBLE_ITEMS);

  $('#ocItems').innerHTML = `
    ${ocVisibleItems.map((it,i)=> ocRenderItemRow(it,i)).join('')}
    ${ocHiddenItems.length ? `
      <div class="oc-items-hidden" id="ocItemsHidden">
        ${ocHiddenItems.map((it,i)=> ocRenderItemRow(it, i + OC_VISIBLE_ITEMS)).join('')}
      </div>
      <button type="button" class="oc-see-more-btn" id="ocSeeMoreBtn" onclick="toggleOcItems()">
        <span id="ocSeeMoreLabel">See ${ocHiddenItems.length} more item${ocHiddenItems.length!==1?'s':''}</span>
        <svg viewBox="0 0 24 24" class="oc-see-more-icon"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    ` : ''}
  `;

  const orderCur = order.currency || 'MVR';
  const subtotal = typeof order.subtotal === 'number' ? order.subtotal : order.total;
  const feeLabel = order.deliveryFee === 0 ? 'Complimentary' : (order.deliveryFee == null ? 'To be confirmed' : fmtCur(order.deliveryFee, orderCur));
  $('#ocTotals').innerHTML = `
    <div class="oc-total-row"><span>Subtotal</span><span>${fmtCur(subtotal, orderCur)}</span></div>
    <div class="oc-total-row"><span>Delivery Fee</span><span>${feeLabel}</span></div>
    <div class="oc-total-row oc-grand"><span>Order Total</span><span>${fmtCur(order.total, orderCur)}</span></div>
  `;

  const contact = customer.mobile || session.mobile || session.email || '—';
  const methodLabels = { pickup:"Showroom Pickup — Male'", delivery:'Home Delivery', boat:'Boat / Dhoni Delivery' };
  const loc = customer.location;
  let locationHtml = '—';
  if (customer.method === 'delivery' && loc && loc.address){
    locationHtml = escapeHtml(loc.address) + (loc.note ? `<br>${escapeHtml(loc.note)}` : '');
  } else if (customer.method === 'boat' && loc && loc.boatDetails){
    locationHtml = `${escapeHtml(loc.boatName)} &middot; ${escapeHtml(loc.boatContact)}${loc.boatDeparture ? `<br>Departs ${new Date(loc.boatDeparture).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}` : ''}<br>${escapeHtml(loc.address)}, ${escapeHtml(loc.islandName)} (${escapeHtml(loc.islandCode)})${loc.note ? `<br>${escapeHtml(loc.note)}` : ''}`;
  } else if (customer.method === 'pickup' && loc){
    locationHtml = `${escapeHtml(loc.store)}${loc.day ? ` &middot; ${escapeHtml(loc.day)}` : ''}${loc.note ? `<br>${escapeHtml(loc.note)}` : ''}`;
  }

  $('#ocDetails').innerHTML = `
    <div><div class="oc-detail-key">Order ID</div><div class="oc-detail-val">${order.id}</div></div>
    <div><div class="oc-detail-key">Order Date</div><div class="oc-detail-val">${formatOrderDate(order.placedAt)}</div></div>
    <div><div class="oc-detail-key">Status</div><div class="oc-detail-val">Pending Confirmation</div></div>
    <div><div class="oc-detail-key">Contact</div><div class="oc-detail-val">${escapeHtml(contact)}</div></div>
    <div><div class="oc-detail-key">${customer.method === 'pickup' ? 'Pickup' : 'Delivery'} Method</div><div class="oc-detail-val">${methodLabels[customer.method] || '—'}</div></div>
    <div><div class="oc-detail-key">${customer.method === 'pickup' ? 'Pickup Details' : 'Delivery To'}</div><div class="oc-detail-val">${locationHtml}</div></div>
  `;

  $('#ocBackdrop').classList.add('show');
  $('#ocModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeOrderConfirmModal(){
  $('#ocBackdrop').classList.remove('show');
  $('#ocModal').classList.remove('open');
  document.body.style.overflow = '';
}
function toggleOcItems(){
  const hidden = $('#ocItemsHidden');
  const btn = $('#ocSeeMoreBtn');
  const label = $('#ocSeeMoreLabel');
  if (!hidden || !btn || !label) return;
  const expanded = hidden.classList.toggle('show');
  btn.classList.toggle('expanded', expanded);
  const hiddenCount = hidden.querySelectorAll('.oc-item-row').length;
  label.textContent = expanded ? 'See less' : `See ${hiddenCount} more item${hiddenCount!==1?'s':''}`;
}

/* ============ Receipt (view / print / save as PDF) ============ */
const RECEIPT_SIZE = { page:'80mm auto', width:'80mm' };
let _receiptOrderId = null;

function receiptStoreInfo(){
  return {
    name: 'MAZI General Trade',
    addr: "Male', Republic of Maldives",
    email: 'mazigeneraltrade@gmail.com',
  };
}

function renderReceiptContent(order){
  const store = receiptStoreInfo();
  return `
    <div class="receipt-store-name">${store.name}</div>
    <div class="receipt-store-addr">${store.addr}</div>
    <div class="receipt-store-addr">${store.email}</div>
    <div class="receipt-divider"></div>
    <div class="receipt-meta-row"><span>Order #</span><span>${order.id}</span></div>
    <div class="receipt-meta-row"><span>Date</span><span>${formatOrderDate(order.placedAt)}</span></div>
    <div class="receipt-meta-row"><span>Status</span><span>${order.cancelled ? 'Cancelled' : ORDER_STEPS[orderStatusIndex(order)].label}</span></div>
    <div class="receipt-divider"></div>
    <div class="receipt-items">
      ${order.items.map(it => `
        <div class="receipt-item">
          <div class="receipt-item-name">${it.name}</div>
          <div class="receipt-item-sub">
            <span>${it.pack} &times; ${it.qty} @ ${fmtCur(it.price, order.currency || 'MVR')}</span>
            <span>${fmtCur(it.price * it.qty, order.currency || 'MVR')}</span>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-total-row">
      <span>Total</span>
      <span>${fmtCur(order.total, order.currency || 'MVR')}</span>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-footer">Thank you for shopping with us!</div>
    <div class="receipt-footer-small">This is a computer-generated receipt.</div>
  `;
}

function fitReceiptPaper(){
  const scroll = $('#receiptPreviewScroll');
  const wrap = $('#receiptPaperWrap');
  const paper = $('#receiptPaper');
  if (!scroll || !paper) return;
  paper.style.transform = 'none';
  const availWidth = scroll.clientWidth - 24; // account for scroll padding
  const naturalWidth = paper.offsetWidth;
  const naturalHeight = paper.offsetHeight;
  // Thermal receipts are physically tiny, so scale them UP to
  // comfortably fill the preview instead of showing true-to-life mm size,
  // capped so it never blows up into blurry oversized text.
  const scale = Math.min(2.4, availWidth / naturalWidth);
  paper.style.transform = `scale(${scale})`;
  wrap.style.height = (naturalHeight * scale) + 'px';
}

function openReceiptModal(orderId){
  const orders = getOrders();
  const order = orders.find(o=> o.id === orderId);
  if (!order) return;
  _receiptOrderId = orderId;
  $('#receiptContent').innerHTML = renderReceiptContent(order);
  requestAnimationFrame(fitReceiptPaper);
  $('#receiptBackdrop').classList.add('show');
  $('#receiptModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeReceiptModal(){
  $('#receiptBackdrop').classList.remove('show');
  $('#receiptModal').classList.remove('open');
  document.body.style.overflow = '';
}

function printReceipt(){
  let styleTag = document.getElementById('receiptPrintStyle');
  if (!styleTag){
    styleTag = document.createElement('style');
    styleTag.id = 'receiptPrintStyle';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = `@page{ size:${RECEIPT_SIZE.page}; margin:2mm; }`;
  window.print();
}

function buildReceiptStandaloneHtml(order){
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt - Order #${order.id}</title>
<style>
  @page{ size:${RECEIPT_SIZE.page}; margin:2mm; }
  *{box-sizing:border-box;}
  body{margin:0;background:#F8F7F2;font-family:'Courier New',Courier,monospace;color:#16211C;display:flex;justify-content:center;padding:24px 12px;}
  .receipt-paper{background:#fff;width:${RECEIPT_SIZE.width};max-width:100%;box-shadow:0 2px 10px rgba(15,58,46,.14);padding:18px 16px;}
  .receipt-store-name{font-size:14px;font-weight:700;text-align:center;letter-spacing:.02em;}
  .receipt-store-addr{font-size:10.5px;text-align:center;color:#5C6B63;margin-top:2px;}
  .receipt-divider{border-top:1px dashed #b9b6a9;margin:10px 0;}
  .receipt-meta-row{display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;}
  .receipt-items{display:flex;flex-direction:column;gap:8px;}
  .receipt-item-name{font-size:11.5px;font-weight:700;}
  .receipt-item-sub{display:flex;justify-content:space-between;font-size:11px;color:#5C6B63;margin-top:1px;}
  .receipt-total-row{display:flex;justify-content:space-between;font-size:13.5px;font-weight:700;}
  .receipt-footer{font-size:11.5px;text-align:center;font-weight:700;margin-top:2px;}
  .receipt-footer-small{font-size:9.5px;text-align:center;color:#5C6B63;margin-top:3px;}
  @media print{ body{background:#fff;padding:0;} .receipt-paper{box-shadow:none;margin:0 auto;} }
</style>
</head>
<body>
  <div class="receipt-paper">${renderReceiptContent(order)}</div>
</body>
</html>`;
}

function downloadReceipt(){
  const orders = getOrders();
  const order = orders.find(o=> o.id === _receiptOrderId);
  if (!order) return;
  const html = buildReceiptStandaloneHtml(order);
  const blob = new Blob([html], { type:'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${order.id}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Receipt downloaded');
}

/* ============ Profile page ============ */
function openProfileView(){
  const session = getSession() || {};
  populateOnboardAtolls();
  populatePvBusinessTypes();
  $('#pvFirstName').value = session.firstName || session.name || '';
  $('#pvLastName').value = session.lastName || '';
  $('#pvEmail').value = session.email || '';
  $('#pvMobile').value = (session.mobile || '').replace('+960', '');
  $('#pvDob').value = session.dob || '';
  $('#pvAtoll').value = session.atoll || 'Kaafu (K)';
  $('#pvCity').value = session.city || '';
  setPvAccountType(session.accountType || 'residence');
  $('#pvBusinessName').value = session.businessName || '';
  $('#pvBusinessType').value = session.businessType || 'Wholesale / Trading';
  $('#pvGstTin').value = session.gstTin || '';
  syncCurrencyToggleUI();
  initProfileNotifToggle();
  closeOtherFullScreenViews('profileView');
  $('#profileView').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeProfileView(){
  $('#profileView').classList.remove('open');
  document.body.style.overflow = '';
  returnToCheckoutIfNeeded();
}
function saveProfileView(){
  const session = getSession() || {};
  const firstName = $('#pvFirstName').value.trim() || session.firstName || 'Account';
  const mobileDigits = $('#pvMobile').value.trim().replace(/[^0-9]/g, '');
  const mobile = mobileDigits ? `+960${mobileDigits}` : (session.mobile || '');
  const lastName = $('#pvLastName').value.trim();
  const email = $('#pvEmail').value.trim();
  const dob = $('#pvDob').value;
  const atoll = $('#pvAtoll').value;
  const city = $('#pvCity').value.trim();
  const businessName = pvAccountType === 'business' ? $('#pvBusinessName').value.trim() : '';
  const businessType = pvAccountType === 'business' ? $('#pvBusinessType').value : '';
  const gstTin = pvAccountType === 'business' ? $('#pvGstTin').value.trim() : '';

  const gstField = $('#pvGstTinField');
  const gstError = $('#pvGstTinError');
  gstField?.classList.remove('has-error');
  if (gstError) gstError.hidden = true;
  if (gstTin && !/^\d{7}GST\d{3}$/i.test(gstTin)){
    gstField?.classList.add('has-error');
    if (gstError) gstError.hidden = false;
    return;
  }

  if (mobile) updateRegisteredAccountName(mobile, firstName);

  const applyLocally = ()=> setSession({
    ...session,
    name: firstName,
    firstName,
    lastName,
    email,
    mobile,
    dob,
    atoll,
    city,
    accountType: pvAccountType,
    businessName,
    businessType,
    gstTin,
    currency: getCurrency(),
  });

  if (!window.MaziAPI || !MaziAPI.updateProfile){
    applyLocally();
    showToast('Profile updated');
    return;
  }
  const saveBtn = $('#pvSaveBtn');
  if (saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  MaziAPI.updateProfile({
    name: firstName,
    last_name: lastName,
    email,
    mobile,
    atoll,
    city,
    account_type: pvAccountType,
    business_type: pvAccountType === 'business' ? (businessType || 'Wholesale / Trading') : null,
    business_name: pvAccountType === 'business' ? (businessName || null) : null,
    gst_tin: pvAccountType === 'business' ? (gstTin || null) : null,
  }).then(()=>{
    applyLocally();
    showToast('Profile updated');
  }).catch(err=>{
    showToast((err && err.message) || 'Could not save your profile. Please try again.', null, 'error');
  }).finally(()=>{
    if (saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save Profile'; }
  });
}

/* ============ Atoll / island data ============ */
const ATOLLS = {
  'HA (Haa Alif)': ['Dhidhdhoo', 'Hoarafushi', 'Kelaa', 'Ihavandhoo'],
  'HDh (Haa Dhaalu)': ['Kulhudhuffushi', 'Nolhivaranfaru', 'Hanimaadhoo'],
  'Sh (Shaviyani)': ['Funadhoo', 'Feydhoo', 'Milandhoo'],
  'N (Noonu)': ['Manadhoo', 'Holhudhoo', 'Velidhoo'],
  'R (Raa)': ['Ungoofaaru', 'Dhuvaafaru', 'Alifushi'],
  'B (Baa)': ['Eydhafushi', 'Thulhaadhoo', 'Dharavandhoo'],
  'Lh (Lhaviyani)': ['Naifaru', 'Hinnavaru'],
  'K (Kaafu)': ["Male'", "Hulhumale'", 'Thulusdhoo', 'Guraidhoo', 'Maafushi'],
  'AA (Alifu Alifu)': ['Rasdhoo', 'Thoddoo', 'Ukulhas'],
  'ADh (Alifu Dhaalu)': ['Mahibadhoo', 'Dhigurah', 'Dhangethi'],
  'V (Vaavu)': ['Felidhoo', 'Keyodhoo'],
  'M (Meemu)': ['Muli', 'Naalaafushi', 'Dhiggaru'],
  'F (Faafu)': ['Nilandhoo', 'Magoodhoo'],
  'Dh (Dhaalu)': ['Kudahuvadhoo', 'Meedhoo'],
  'Th (Thaa)': ['Veymandoo', 'Thimarafushi', 'Guraidhoo'],
  'L (Laamu)': ['Fonadhoo', 'Gan', 'Maabaidhoo'],
  'GA (Gaafu Alifu)': ['Villingili', 'Maamendhoo'],
  'GDh (Gaafu Dhaalu)': ['Thinadhoo', 'Madaveli'],
  'Gn (Gnaviyani)': ['Fuvahmulah'],
  'S (Addu)': ['Hithadhoo', 'Maradhoo', 'Feydhoo', 'Hulhudhoo'],
};

function populateAtollSelect(selectId){
  const sel = $(selectId);
  sel.innerHTML = Object.keys(ATOLLS).map(atoll => `<option value="${atoll}">${atoll}</option>`).join('');
}
function populateIslandSelect(selectId, atoll){
  const sel = $(selectId);
  const cities = ATOLLS[atoll] || [];
  sel.innerHTML = cities.map(c => `<option>${c}</option>`).join('');
}
function ckIsMaleIsland(island){
  return island === "Male'" || island === "Hulhumale'";
}
function renderDeliveryEstimate(){
  const island = $('#cdIsland').value;
  const male = ckIsMaleIsland(island);
  $('#cdEstimateTitle').textContent = male ? "Male' Delivery" : `${island || 'Island'} Delivery`;
  $('#cdEstimateSub').textContent = 'Cargo boat / speedboat / air freight';
  const feeEl = $('#cdEstimateFee');
  const etaEl = $('#cdEstimateEta');
  if (male){
    feeEl.textContent = 'Complimentary';
    feeEl.classList.add('ck-complimentary');
    feeEl.classList.remove('ck-tbc');
    etaEl.textContent = 'Same Day';
  } else {
    feeEl.textContent = 'To be confirmed';
    feeEl.classList.remove('ck-complimentary');
    feeEl.classList.add('ck-tbc');
    etaEl.textContent = '2–4 Working Days';
  }
}

/* ============ Login success animation ============
   Shown right after a successful sign in / sign up (replaces the old
   "Welcome! set up your account" onboarding form). */
let loginSuccessTimer = null;
let loginSuccessLeaveTimer = null;
function buildLoginSuccessParticles(){
  const wrap = $('#lsParticles');
  if (!wrap) return;
  wrap.innerHTML = '';
  const colors = ['#2E8C6C', '#3FA57F', '#164B3B', '#E9C46A', '#BFE3D2'];
  const count = 16;
  for (let i = 0; i < count; i++){
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 56 + Math.random() * 26;
    const p = document.createElement('span');
    p.className = 'ls-particle' + (i % 3 === 0 ? ' is-bar' : '');
    p.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    p.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
    p.style.setProperty('--rot', Math.round(Math.random() * 360) + 'deg');
    p.style.setProperty('--size', (5 + Math.random() * 5).toFixed(1) + 'px');
    p.style.setProperty('--delay', (0.62 + Math.random() * 0.12).toFixed(2) + 's');
    p.style.background = colors[i % colors.length];
    wrap.appendChild(p);
  }
}
function showLoginSuccess(name, isNew){
  const root = $('#loginSuccess');
  if (!root) return;
  clearTimeout(loginSuccessTimer);
  clearTimeout(loginSuccessLeaveTimer);

  const first = String(name || '').trim().split(/\s+/)[0];
  const hasName = first && first !== 'Account' && !first.includes('@');
  $('#lsSub').textContent = isNew
    ? (hasName ? `Welcome to MAZI, ${first}!` : 'Welcome to MAZI!')
    : (hasName ? `Welcome back, ${first}!` : 'Welcome back!');

  buildLoginSuccessParticles();
  root.classList.remove('show', 'leaving');
  void root.offsetWidth; // restart every animation from the top
  root.classList.add('show');
  root.setAttribute('aria-hidden', 'false');

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  loginSuccessTimer = setTimeout(hideLoginSuccess, reduce ? 1400 : 2800);
}
function hideLoginSuccess(){
  const root = $('#loginSuccess');
  if (!root || !root.classList.contains('show') || root.classList.contains('leaving')) return;
  clearTimeout(loginSuccessTimer);
  root.classList.add('leaving');
  loginSuccessLeaveTimer = setTimeout(()=>{
    root.classList.remove('show', 'leaving');
    root.setAttribute('aria-hidden', 'true');
  }, 450);
}

// Smooth height morph used when the auth card switches between the mobile-
// number step and the OTP step (they're different heights) so it resizes
// instead of jumping.
function animateAuthCardHeight(scrollEl, startHeight){
  scrollEl.style.transition = 'none';
  scrollEl.style.overflow = 'hidden';
  scrollEl.style.height = startHeight + 'px';
  // eslint-disable-next-line no-unused-expressions
  void scrollEl.offsetHeight; // force reflow so the browser registers the start height
  const endHeight = scrollEl.scrollHeight;
  scrollEl.style.transition = 'height .38s var(--ease-glass)';
  scrollEl.style.height = endHeight + 'px';

  const cleanup = () => {
    scrollEl.style.height = '';
    scrollEl.style.overflow = '';
    scrollEl.style.transition = '';
    scrollEl.removeEventListener('transitionend', cleanup);
  };
  scrollEl.addEventListener('transitionend', cleanup);
  // Safety fallback in case transitionend doesn't fire (e.g. height didn't change)
  setTimeout(cleanup, 450);
}

/* ============ Search ============ */
let searchDebounceTimer = null;
const SEARCH_LOADING_DELAY = 450; // ms — how long the skeleton shows before results render

function handleSearch(value){
  const query = value.trim().toLowerCase();
  clearTimeout(searchDebounceTimer);

  // Empty query (e.g. clearing the search box) — no need to fake a loading state.
  if (!query){
    state.query = query;
    renderProducts();
    return;
  }

  renderSkeletons();
  searchDebounceTimer = setTimeout(()=>{
    state.query = query;
    renderProducts();
  }, SEARCH_LOADING_DELAY);
}

const MAX_RECENT_SEARCHES = 8;

function addRecentSearch(term){
  term = term.trim();
  if (!term) return;
  state.recentSearches = [term, ...state.recentSearches.filter(t => t.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
  saveRecentSearches();
}

function removeRecentSearch(term){
  state.recentSearches = state.recentSearches.filter(t => t !== term);
  saveRecentSearches();
  renderMobileSearchBody($('#mobileSearchInput').value);
}

function clearAllRecentSearches(){
  state.recentSearches = [];
  saveRecentSearches();
  renderMobileSearchBody($('#mobileSearchInput').value);
}

function commitMobileSearch(term){
  term = term.trim();
  if (!term) return;
  addRecentSearch(term);
  $('#searchInput').value = term;
  handleSearch(term);
  closeMobileSearch();
  $('#productGrid').scrollIntoView({behavior:'smooth', block:'start'});
}

function renderMobileSearchBody(rawValue){
  const value = (rawValue || '').trim().toLowerCase();
  const body = $('#mobileSearchBody');

  if (value){
    const matches = PRODUCTS.filter(p => p.name.toLowerCase().includes(value)).slice(0, 8);
    if (matches.length === 0){
      body.innerHTML = `<p class="ms-empty">No suggestions for "${escapeHtml(rawValue)}"</p>`;
      return;
    }
    body.innerHTML = `
      <div class="ms-section-head"><span>Suggestions</span></div>
      ${matches.map(p => `
        <button class="ms-suggest-row" data-suggest="${p.name.replace(/"/g,'&quot;')}">
          <span class="ms-row-icon"><img src="${productImg(p)}" alt="" onerror="this.classList.add('img-missing')"></span>
          <span class="ms-row-text">${p.name}</span>
        </button>
      `).join('')}
    `;
    $$('[data-suggest]').forEach(btn=>{
      btn.addEventListener('click', ()=> commitMobileSearch(btn.dataset.suggest));
    });
    return;
  }

  if (state.recentSearches.length === 0){
    body.innerHTML = `<p class="ms-empty">No recent searches yet.</p>`;
    return;
  }

  body.innerHTML = `
    <div class="ms-section-head">
      <span>Recent Searches</span>
      <button class="ms-clear-all" id="msClearAll">Clear all</button>
    </div>
    <div class="ms-recent-tags">
      ${state.recentSearches.map(term => `
        <button class="ms-recent-tag" data-recent="${escapeHtml(term)}">
          <span>${escapeHtml(term)}</span>
          <span class="ms-recent-tag-remove" data-remove-recent="${escapeHtml(term)}" aria-label="Remove">&times;</span>
        </button>
      `).join('')}
    </div>
  `;

  $('#msClearAll')?.addEventListener('click', clearAllRecentSearches);
  $$('[data-recent]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      if (e.target.closest('[data-remove-recent]')) return;
      commitMobileSearch(btn.dataset.recent);
    });
  });
  $$('[data-remove-recent]').forEach(el=>{
    el.addEventListener('click', (e)=>{ e.stopPropagation(); removeRecentSearch(el.dataset.removeRecent); });
  });
}

function openMobileSearch(){
  $('#mobileSearchPanel').classList.add('open');
  $('#mobileSearchBackdrop').classList.add('show');
  document.body.style.overflow = 'hidden';
  const current = $('#searchInput').value || '';
  $('#mobileSearchInput').value = current;
  renderMobileSearchBody(current);
  setTimeout(()=> $('#mobileSearchInput').focus(), 100);
}

function closeMobileSearch(){
  $('#mobileSearchPanel').classList.remove('open');
  $('#mobileSearchBackdrop').classList.remove('show');
  document.body.style.overflow = '';
}

/* ============ Navbar hide on scroll + sidebar pin ============ */
// The sidebar card uses `position: sticky; top: var(--nav-offset)` in CSS,
// so the browser handles pinning/unpinning natively (including stopping at
// the bottom of the tall sidebar column) — no manual fixed/bottom class
// juggling needed. We only need to keep --nav-offset in sync with whether
// the navbar is currently shown or hidden, and CSS transitions the `top`
// value smoothly in step with the navbar's own reveal animation so no gap
// ever flashes open above the card.
function initNavScroll(){
  const nav = $('.navbar');
  const root = document.documentElement;
  const gap = 8; // breathing room below the navbar when it's visible
  let lastFullH = 0;

  function setOffset(){
    const hidden = nav.classList.contains('nav-hidden');
    const rawH = hidden ? 0 : nav.offsetHeight;
    const h = hidden ? 20 : rawH + gap;
    root.style.setProperty('--nav-offset', h + 'px');
    root.style.setProperty('--nav-flush', rawH + 'px');
    // Stable "navbar fully shown" height — the sidebar category list sizes
    // itself from this so it only scrolls when it truly can't fit the screen
    // (and doesn't resize every time the navbar hides while scrolling).
    if (!hidden && rawH !== lastFullH){
      lastFullH = rawH;
      root.style.setProperty('--nav-full', rawH + 'px');
      if (typeof updateSidebarRail === 'function') requestAnimationFrame(updateSidebarRail);
    }
    return h;
  }

  let lastY = window.scrollY;
  let ticking = false;

  function tick(){
    const currentY = window.scrollY;

    const wasHidden = nav.classList.contains('nav-hidden');
    const shouldHide = currentY > lastY && currentY > 4;
    if (shouldHide !== wasHidden){
      nav.classList.toggle('nav-hidden', shouldHide);
      // Hiding/showing the navbar only moves it (transform), it doesn't
      // change its own box size, so ResizeObserver never fires for this —
      // update the offset by hand or the sticky categories sidebar is left
      // pinned to where the navbar used to be, leaving a blank gap above it.
      setOffset();
    }

    // Hysteresis on the compact toggle: enter compact only past 60px,
    // exit only once scrolled back under 12px. A single shared threshold
    // caused rapid on/off flapping (and a visible jitter/"explosion")
    // whenever scroll position hovered near it, which happens constantly
    // on touch scroll.
    const wasCompact = nav.classList.contains('nav-compact');
    let isCompact = wasCompact;
    if (!wasCompact && currentY > 60) isCompact = true;
    else if (wasCompact && currentY < 12) isCompact = false;
    if (isCompact !== wasCompact){
      nav.classList.toggle('nav-compact', isCompact);
    }

    lastY = currentY;
    ticking = false;
  }

  setOffset();

  // Keep --nav-offset/--nav-flush glued to the navbar's real, current
  // height at all times, including mid-transition. A ResizeObserver fires
  // on every actual layout change the navbar goes through (each frame of
  // the compact-mode shrink/grow), so the sticky categories bar below it
  // never reads a stale height — no more guessing how long the CSS
  // transition takes.
  if ('ResizeObserver' in window){
    new ResizeObserver(setOffset).observe(nav);
  }

  window.addEventListener('scroll', ()=>{
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  }, { passive:true });

  window.addEventListener('resize', rafDebounce(()=>{
    setOffset();
    updateCategoryHighlights();
  }));
}

/* ============ Init / event wiring ============ */
// Stock labels (In / Low / Out of stock) follow the numbers staff enter in
// /admin -> Stock. Only the status is read; names and prices stay as-is.
function syncStockFromServer(){
  if (!window.MaziAPI || !MaziAPI.listProducts) return;
  MaziAPI.listProducts().then(rows=>{
    let changed = false;
    rows.forEach(r=>{
      const p = PRODUCTS.find(x=> x.id === r.id);
      if (p && r.stock && p.stock !== r.stock){ p.stock = r.stock; changed = true; }
    });
    if (changed) refreshVisibleCurrency();
  }).catch(()=>{});
}

function init(){
  purgeLegacyLocalOrders(); // orders saved only in the browser (old demo flow) were never received by the shop

  renderCategoryNav();
  renderHero();
  renderProducts();
  renderPopularProducts();
  syncCurrencyToggleUI();
  updateCartUI();
  initNavScroll();
  initSidebarRail();
  initBrandsTicker();

  updateOrdersNotifBadge();
  setInterval(updateOrdersNotifBadge, 20000);

  // Live order-status glass notifications: check immediately, then poll,
  // then re-check whenever the tab/app regains focus.
  checkOrderUpdates();
  setInterval(checkOrderUpdates, 5000);
  syncStockFromServer();
  setInterval(syncStockFromServer, 60000);
  syncOrders();
  startOrdersLive();
  setInterval(syncOrders, 30000); // safety net if realtime is not enabled
  document.addEventListener('visibilitychange', ()=>{
    if (!document.hidden){ syncOrders(); checkOrderUpdates(); syncStockFromServer(); }
  });

  // Register the notifications service worker up front (permission is
  // requested separately, via the "Enable" prompt) and listen for taps on
  // a device notification so we can open the Orders view in-app.
  registerNotifServiceWorker();
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', (e)=>{
      if (e.data && e.data.type === 'mazi-open-orders') openOrdersView();
    });
  }


  $('#closeCart').addEventListener('click', closeCart);
  $('#drawerBackdrop').addEventListener('click', closeCart);
  $('#checkoutBtn').addEventListener('click', ()=>{
    if (cartCount()===0){ showToast('Your cart is empty', null, 'info'); return; }
    if (!getSession()){
      closeCart();
      showToast('Please log in to place your order', null, 'info');
      openLogin();
      return;
    }
    document.body.classList.add('is-checkout-leaving');
    $('#checkoutBtn').disabled = true;
    setTimeout(()=> { window.location.href = 'checkout.html'; }, 360);
  });

  $('#closeMenu').addEventListener('click', closeMenu);
  $('#menuBackdrop').addEventListener('click', closeMenu);

  $('#loginBtn').addEventListener('click', openLogin);
  renderAuthButton();

  // Cart, login, offers, search, and profile buttons — bound generically so
  // the same actions work from the main navbar and from the profile/orders/
  // product view topbars.
  $$('.js-cart-btn').forEach(btn=> btn.addEventListener('click', openCart));
  $$('.js-login-btn').forEach(btn=> btn.addEventListener('click', openLogin));
  $$('.js-offers-btn').forEach(btn=> btn.addEventListener('click', ()=> showToast('No offers saved yet', null, 'info')));
  $$('.js-search-btn').forEach(btn=> btn.addEventListener('click', openMobileSearch));
  $$('.js-profile-toggle').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const dropdown = btn.parentElement.querySelector('.profile-dropdown');
      toggleProfileDropdown(dropdown);
    });
  });
  document.addEventListener('click', e=>{
    $$('.js-profile-wrap').forEach(wrap=>{
      if (!wrap.contains(e.target)) wrap.querySelector('.profile-dropdown').classList.remove('open');
    });
  });
  $$('.js-profile-orders-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      closeProfileDropdown();
      openOrdersView();
    });
  });
  $$('.js-profile-profile-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      closeProfileDropdown();
      openProfileView();
    });
  });
  $$('.js-profile-logout-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      closeProfileDropdown();
      openLogoutConfirm();
    });
  });

  $('#closeProfileMenu').addEventListener('click', closeProfileMenu);
  $('#profileMenuBackdrop').addEventListener('click', closeProfileMenu);
  $('#pmProfileBtn').addEventListener('click', ()=>{
    closeProfileMenu();
    openProfileView();
  });
  $('#pmOrdersBtn').addEventListener('click', ()=>{
    closeProfileMenu();
    openOrdersView();
  });
  $('#pmLogoutBtn').addEventListener('click', ()=>{
    closeProfileMenu();
    openLogoutConfirm();
  });
  $('#wishlistBtn').addEventListener('click', ()=> showToast('No offers saved yet', null, 'info'));

  // Footer links
  $$('[data-footer-cat]').forEach(link=>{
    link.addEventListener('click', (e)=>{
      e.preventDefault();
      setCategory(link.dataset.footerCat);
      renderCategoryNav();
      renderProducts();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
  const footerLoginLink = $('#footerLoginLink');
  if (footerLoginLink) footerLoginLink.addEventListener('click', (e)=>{ e.preventDefault(); openLogin(); });
  const footerOrdersLink = $('#footerOrdersLink');
  if (footerOrdersLink) footerOrdersLink.addEventListener('click', (e)=>{ e.preventDefault(); openOrdersView(); });
  const footerCartLink = $('#footerCartLink');
  if (footerCartLink) footerCartLink.addEventListener('click', (e)=>{ e.preventDefault(); openCart(); });

  $('#logoutCancelBtn').addEventListener('click', closeLogoutConfirm);
  $('#logoutConfirmBackdrop').addEventListener('click', closeLogoutConfirm);

  $('#receiptCloseBtn').addEventListener('click', closeReceiptModal);
  $('#receiptBackdrop').addEventListener('click', closeReceiptModal);
  $('#receiptDownloadBtn').addEventListener('click', downloadReceipt);
  $('#receiptPrintBtn').addEventListener('click', printReceipt);

  $('#ocCloseBtn').addEventListener('click', closeOrderConfirmModal);
  $('#ocBackdrop').addEventListener('click', closeOrderConfirmModal);
  $('#ocOrdersBtn').addEventListener('click', ()=>{
    closeOrderConfirmModal();
    openOrdersView();
  });
  window.addEventListener('resize', rafDebounce(()=>{
    if ($('#receiptModal').classList.contains('open')) fitReceiptPaper();
  }));
  $('#logoutConfirmBtn').addEventListener('click', ()=>{
    closeLogoutConfirm();
    if (_confirmAction) _confirmAction();
  });

  $('#profileViewClose').addEventListener('click', closeProfileView);
  $('#productViewClose').addEventListener('click', closeProductView);
  $('#similarPrevBtn').addEventListener('click', ()=> scrollSimilarCarousel(-1));
  $('#similarNextBtn').addEventListener('click', ()=> scrollSimilarCarousel(1));
  $('#similarProductsGrid').addEventListener('scroll', ()=> updateSimilarCarouselArrows(), { passive:true });
  $('#pvSaveBtn').addEventListener('click', saveProfileView);
  $('#ordersViewClose').addEventListener('click', closeOrdersView);
  $('#pvDeleteAccountLink').addEventListener('click', e=>{
    e.preventDefault();
    closeProfileView();
    openDeleteAccountConfirm();
  });
  $('#pvLogoutBtn').addEventListener('click', ()=>{
    closeProfileView();
    openLogoutConfirm();
  });
  $('#catToggleBtn').addEventListener('click', openMenu);

  // ---- Home redesign: hamburger, hero search pill, quick category
  // cards, promo banner, popular products "View All", Viber CTA banner ----
  const hamburgerBtn = $('#navHamburgerBtn');
  if (hamburgerBtn) hamburgerBtn.addEventListener('click', e=>{
    e.stopPropagation();
    toggleCurrencyDropdown();
  });
  document.addEventListener('click', e=>{
    const currencyWrap = $('#navbarCurrencyWrap');
    if (currencyWrap && !currencyWrap.contains(e.target)) closeCurrencyDropdown();
  });
  // Scrolling / sliding the page up or down closes the profile dropdown and
  // the currency pop-up. Scroll events don't bubble, so listen in the capture
  // phase to also catch scrolling inside the Orders / Profile / Product views.
  document.addEventListener('scroll', e=>{
    const t = e.target;
    if (t && t.nodeType === 1 && t.closest && t.closest('.profile-dropdown, .navbar-currency-dropdown')) return;
    if (document.querySelector('.profile-dropdown.open, #navbarCurrencyWrap.open')){
      closeProfileDropdown();
      closeCurrencyDropdown();
    }
  }, { passive:true, capture:true });
  // Tapping MVR/USD inside the mobile currency dropdown switches the
  // currency but must NOT close the dropdown — only tapping the
  // hamburger icon again or tapping outside (handled above) closes it.

  const heroSearchBar = $('#heroSearchBar');
  if (heroSearchBar) heroSearchBar.addEventListener('click', openMobileSearch);

  function scrollToCatalog(){
    const target = $('#sectionTitle');
    if (target) target.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  $$('.quick-cat-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setCategory(btn.dataset.cat);
      renderCategoryNav();
      renderProducts();
      scrollToCatalog();
    });
  });

  const promoShopBtn = $('#promoShopBtn');
  // Same behaviour as the other Offers buttons — no offers exist yet.
  if (promoShopBtn) promoShopBtn.addEventListener('click', ()=> showToast('No offers saved yet', null, 'info'));

  const popularViewAllBtn = $('#popularViewAllBtn');
  if (popularViewAllBtn) popularViewAllBtn.addEventListener('click', ()=>{
    setCategory('all');
    renderCategoryNav();
    renderProducts();
    scrollToCatalog();
  });

  // homeViberCtaBtn is now a direct <a href="viber://..."> link (no popup) —
  // update the href in index.html once you have the real Viber Community link.

  $('#authClose').addEventListener('click', closeLogin);
  $('#authBackdrop').addEventListener('click', closeLogin);
  const authGoogleBtn = $('#authGoogleBtn');
  if (authGoogleBtn) authGoogleBtn.addEventListener('click', ()=>{
    if (!window.MaziAPI || !MaziAPI.signInWithGoogle){
      showToast('Google sign-in is not configured yet.', null, 'error');
      return;
    }
    authGoogleBtn.disabled = true;
    MaziAPI.signInWithGoogle().catch(err=>{
      authGoogleBtn.disabled = false;
      showToast((err && err.message) || 'Could not start Google sign-in. Please try again.', null, 'error');
    });
    // No .then() needed on success — signInWithOAuth redirects the whole
    // page to Google, so this code stops running until the shopper is
    // back on the site already signed in.
  });
  $('#emailAuthForm').addEventListener('submit', e=>{
    e.preventDefault();
    if (authCooldown.left() > 0) return; // still cooling down after a rate-limit
    clearAuthErrors();
    // Honeypot: a hidden field real users never see or fill; bots that
    // auto-fill every input trip it. Fail silently (no error shown) so
    // bots don't learn anything, but stop the request going through.
    const honeypot = $('#authWebsiteHoneypot');
    if (honeypot && honeypot.value.trim() !== '') return;
    const email = $('#authEmailInput').value.trim();
    const password = $('#authPasswordInput').value;
    const mobileDigits = $('#authMobileInput').value.trim().replace(/[^0-9]/g, '');
    if (!isValidEmailFormat(email)){
      showAuthError('Please enter a valid email address.', 'emailField');
      return;
    }
    if (isDisposableEmail(email)){
      showAuthError('Temporary/disposable email addresses are not allowed. Please use your real Gmail or other email.', 'emailField');
      return;
    }
    if (password.length < 6){
      showAuthError('Password must be at least 6 characters.', 'passwordField');
      return;
    }
    if (authMode === 'signup' && !/^\d{7}$/.test(mobileDigits)){
      showAuthError('Enter a valid 7-digit Maldives number.', 'authMobileField');
      return;
    }
    const submitBtn = $('#emailAuthSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = authMode === 'signup' ? 'Creating...' : 'Signing in...';
    showAuthLoading();
    const mobile = mobileDigits ? `+960${mobileDigits}` : '';
    const request = !window.MaziAPI
      ? Promise.reject(new Error('The authentication service is not configured yet.'))
      : authMode === 'signup'
        ? MaziAPI.signUpWithPassword(email, password, mobile)
        : MaziAPI.signInWithPassword(email, password);
    request.then(result=>{
      if (result.needsEmailConfirmation){
        showAuthVerify('sent', email);
        return;
      }
      applyAuthenticatedSession(result);
    }).catch(err=>{
      if (err && err.code === 'EMAIL_NOT_CONFIRMED'){
        showAuthVerify('unconfirmed', email);
        return;
      }
      if (isRateLimitError(err)){
        authRateLimitMsgShown = true;
        showAuthError(err.message, 'emailField');
        authCooldown.start(rateLimitSeconds(err));
        return;
      }
      showAuthError(err.message || 'We could not complete your login. Please try again.', 'emailField');
    }).finally(()=>{
      hideAuthLoading();
      refreshAuthSubmitLabel(); // back to "Sign In" / "Create Account", or the cooldown countdown
    });
  });
  $('#authModeToggle').addEventListener('click', ()=> setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
  bindAuthVerifyEvents();
  bindForgotPasswordEvents();
  bindOnboardingEvents();
  $('#authPasswordToggle').addEventListener('click', ()=>{
    const input = $('#authPasswordInput');
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    $('#authPasswordToggle').classList.toggle('showing', showing);
    $('#authPasswordToggle').setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
  });
  $('#authEmailInput').addEventListener('input', clearAuthErrors);
  $('#authPasswordInput').addEventListener('input', clearAuthErrors);
  $('#authMobileInput').addEventListener('input', clearAuthErrors);
  $$('.pv-currency-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> setCurrency(btn.dataset.currency));
  });
  $$('.currency-toggle-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> setCurrency(btn.dataset.currency));
  });
  $('#loginSuccess').addEventListener('click', hideLoginSuccess);

  $$('[data-eye-toggle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const input = btn.closest('.auth-password-wrap').querySelector('input');
      const willShow = input.type === 'password';
      input.type = willShow ? 'text' : 'password';
      btn.classList.toggle('showing', willShow);
      btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
    });
  });

  $('#searchInput').addEventListener('input', e=> handleSearch(e.target.value));
  $('#searchInput').addEventListener('focus', e=>{
    // On mobile the inline pill is just a trigger — actual typing and live
    // results happen in the full-screen mobile search panel.
    if (window.matchMedia('(max-width: 720px)').matches){
      e.target.blur();
      openMobileSearch();
    }
  });

  $('#mobileSearchBtn').addEventListener('click', openMobileSearch);
  $('#mobileSearchClose').addEventListener('click', closeMobileSearch);
  $('#mobileSearchBackdrop').addEventListener('click', closeMobileSearch);
  $('#mobileSearchInput').addEventListener('input', e=>{
    const value = e.target.value;
    renderMobileSearchBody(value);
    // Mirror the desktop search bar: filter the product grid live (with the
    // same loading-skeleton debounce) as the person types, instead of only
    // updating once they hit Enter or tap a suggestion.
    $('#searchInput').value = value;
    handleSearch(value);
  });
  $('#mobileSearchInput').addEventListener('keydown', e=>{
    if (e.key === 'Enter') commitMobileSearch(e.target.value);
  });

  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>{ updateCategoryHighlights(); updateSidebarRail(); });
  }

  $$('.bn-item[data-action]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const action = btn.dataset.action;
      if (action==='categories'){ openMenu(); return; }  // openMenu() highlights the tab itself
      // If the categories menu is open and another tab is tapped, close it first.
      if ($('#mobileMenu').classList.contains('open')) closeMenu();
      setBottomNavActive(action);
      if (action==='profile'){
        if (getSession()) openProfileMenu();
        else openLogin();
      }
      else if (action==='home') window.scrollTo({top:0, behavior:'smooth'});
      else if (action==='orders') openOrdersView();
    });
  });

  handleOpenParam();
  handleEmailConfirmationLanding();
  bindGoogleAuthLanding();
}

/* Google's "Continue with Google" redirects the whole page away and back;
   supabase-js parses the returned URL and fires SIGNED_IN on its own (see
   MaziAPI.onAuthChange), so that's the hook used to finish the sign-in on
   this end — the click handler in bindOnboardingEvents() above only starts
   the redirect and never runs again once the shopper is back on the site.
   Guarded so it never re-fires the email/password flow's own success UI:
   that path already calls applyAuthenticatedSession() itself and sets the
   local session before this listener's SIGNED_IN event even arrives. */
function bindGoogleAuthLanding(){
  if (!window.MaziAPI || !MaziAPI.onAuthChange) return;
  MaziAPI.onAuthChange((event, session)=>{
    if (event !== 'SIGNED_IN' || !session || !session.user) return;
    if (getSession()) return; // already signed in locally — the email/password flow handled it
    const provider = session.user.app_metadata && session.user.app_metadata.provider;
    if (provider !== 'google') return;
    MaziAPI.getProfile().then(profile=>{
      applyAuthenticatedSession({
        user: session.user,
        profile,
        isNewUser: !profile || !profile.onboarded
      });
    }).catch(()=>{});
  });
}

/* ============ Deep-link actions (from legal pages, etc.) ============ */
function handleOpenParam(){
  const params = new URLSearchParams(window.location.search);
  const open = params.get('open');
  const cat = params.get('cat');
  const from = params.get('from');

  if (from === 'checkout'){
    sessionStorage.setItem('mazi_return_to_checkout', '1');
  }

  if (cat){
    setCategory(cat);
    renderCategoryNav();
    renderProducts();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  if (!open){
    if (cat) history.replaceState(null, '', window.location.pathname + window.location.hash);
    return;
  }

  const isMobile = window.matchMedia('(max-width: 980px)').matches;

  if (open === 'cart'){
    openCart();
  } else if (open === 'login'){
    openLogin();
  } else if (open === 'search'){
    const q = params.get('q') || '';
    if (q){
      if (isMobile){
        openMobileSearch();
        $('#mobileSearchInput').value = q;
        commitMobileSearch(q);
      } else {
        $('#searchInput').value = q;
        handleSearch(q);
        $('#searchInput').focus();
        $('#productGrid')?.scrollIntoView({behavior:'smooth', block:'start'});
      }
    } else if (isMobile){
      openMobileSearch();
    } else {
      $('#searchInput').focus();
    }
  } else if (open === 'offers'){
    showToast('No offers saved yet', null, 'info');
  } else if (open === 'profile'){
    if (getSession()){
      if (from === 'checkout'){
        openProfileView();
      } else if (isMobile){
        openProfileMenu();
      } else {
        toggleProfileDropdown($('#profileDropdown'));
      }
    } else {
      openLogin();
    }
  } else if (open === 'orders'){
    openOrdersView();
  }

  history.replaceState(null, '', window.location.pathname + window.location.hash);
}

/* If the account/profile flow was entered from the checkout page (via the
   checkout header's profile icon), closing it should return the person to
   checkout instead of stranding them on the homepage. */
function returnToCheckoutIfNeeded(){
  if (sessionStorage.getItem('mazi_return_to_checkout')){
    sessionStorage.removeItem('mazi_return_to_checkout');
    window.location.href = 'checkout.html';
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', init);
