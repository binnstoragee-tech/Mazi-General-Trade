/* ============================================
   MAZI GENERAL TRADE — checkout page logic
   Standalone page. The cart still lives in localStorage
   (shared with script.js), but the ORDER itself is sent to
   Supabase through MaziAPI.createOrder — the payment slip is
   uploaded to the private "payment-slips" bucket and the
   server works out the prices, so nothing can be tampered with.
============================================ */

/* ---------- Product data (kept in sync with script.js) ---------- */
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
  { id:'501DW30302', name:'DAIWA LIQUID HAND SOAP 3500 ML. - FRAGRANCE RICE , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'out', img:'img/household&cleaning/501DW30302.png' },
  { id:'501DW00101', name:'DAIWA LIQUID HAND SOAP 3500 ML. - FRUITY , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'out', img:'img/household&cleaning/501DW00101.png' },
  { id:'501DW40402', name:'DAIWA LIQUID HAND SOAP 3500 ML. - GENTLE SCENT , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'out', img:'img/household&cleaning/501DW40402.png' },
  { id:'501DW50502', name:'DAIWA LIQUID HAND SOAP 3500 ML. - LAVENDER , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'out', img:'img/household&cleaning/501DW50502.png' },
  { id:'501DW20202', name:'DAIWA LIQUID HAND SOAP 3500 ML. - MELON , (1 X 4) CTN', cat:'household', icon:'🧼', pack:'Carton', unit:'1 x 4', price:0, stock:'out', img:'img/household&cleaning/501DW20202.png' },
  { id:'607CR00101', name:'CLEAREX EUCALYPTUS OIL AIR FRESHENER GEL 180G', cat:'household', icon:'🌸', pack:'Carton', unit:'', price:0, stock:'out', img:'img/household&cleaning/607CR00101.png' },
  { id:'607BN00201', name:'ZLEEP EASY BY BANNE DEEP SLEEP AIR GEL 180 G', cat:'household', icon:'🌸', pack:'Carton', unit:'', price:0, stock:'out', img:'img/household&cleaning/607BN00201.png' },
  { id:'503ZS00101', name:'ZENSI NATURAL CLEANSING SHOWER 450 ML.', cat:'personal-care', icon:'🚿', pack:'Carton', unit:'', price:0, stock:'out', img:'img/household&cleaning/503ZS00101.png' },
];
const ATOLLS = {
  'Haa Alif (HA)': ['Dhidhdhoo', 'Hoarafushi', 'Kelaa', 'Ihavandhoo'],
  'Haa Dhaalu (HDh)': ['Kulhudhuffushi', 'Nolhivaranfaru', 'Hanimaadhoo'],
  'Shaviyani (Sh)': ['Funadhoo', 'Feydhoo', 'Milandhoo'],
  'Noonu (N)': ['Manadhoo', 'Holhudhoo', 'Velidhoo'],
  'Raa (R)': ['Ungoofaaru', 'Dhuvaafaru', 'Alifushi'],
  'Baa (B)': ['Eydhafushi', 'Thulhaadhoo', 'Dharavandhoo'],
  'Lhaviyani (Lh)': ['Naifaru', 'Hinnavaru'],
  'Kaafu (K)': ["Male'", "Hulhumale'", 'Vilingili', 'Dhiffushi', 'Gaafaru', 'Gulhi', 'Guraidhoo', 'Hinmafushi', 'Huraa', 'Kaashidhoo', 'Maafushi', 'Thulusdhoo'],
  'Alif Alif (AA)': ['Rasdhoo', 'Thoddoo', 'Ukulhas'],
  'Alif Dhaalu (ADh)': ['Mahibadhoo', 'Dhigurah', 'Dhangethi'],
  'Vaavu (V)': ['Felidhoo', 'Keyodhoo'],
  'Meemu (M)': ['Muli', 'Naalaafushi', 'Dhiggaru'],
  'Faafu (F)': ['Nilandhoo', 'Magoodhoo'],
  'Dhaalu (Dh)': ['Kudahuvadhoo', 'Meedhoo'],
  'Thaa (Th)': ['Veymandoo', 'Thimarafushi', 'Guraidhoo'],
  'Laamu (L)': ['Fonadhoo', 'Gan', 'Maabaidhoo'],
  'Gaafu Alif (GA)': ['Villingili', 'Maamendhoo'],
  'Gaafu Dhaalu (GDh)': ['Thinadhoo', 'Madaveli'],
  'Gnaviyani (Gn)': ['Fuvahmulah'],
  'Seenu (Addu) (S)': ['Hithadhoo', 'Maradhoo', 'Feydhoo', 'Hulhudhoo'],
};

const GST_RATE = 0.08;

// Maldivian Rufiyaa is pegged to the US Dollar at MVR 15.42 = USD 1 — same
// peg rate used on the main shop page.
const USD_PER_MVR = 1 / 15.42;
// Currency the shopper picked while browsing (mazi_currency, same key the
// shop page's MVR/USD toggle writes to). Checkout carries that currency
// through payment, summary and the bank details instead of forcing MVR.
function getCurrency(){
  return localStorage.getItem('mazi_currency') || 'MVR';
}
// MVR currency icon markup — replaces the plain "MVR" text everywhere a
// price is shown. Returned strings are HTML — call sites must use
// innerHTML, not textContent.
const MVR_ICON = '<img class="cur-icon" src="img/mvr-icon-black.png" alt="MVR">';
function fmtCur(n, cur){
  return (cur === 'USD')
    ? '$' + (n * USD_PER_MVR).toFixed(2)
    : MVR_ICON + n.toFixed(2);
}
const fmt = n => fmtCur(n, getCurrency());
const $ = sel => document.querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

let coMethod = 'pickup';
let coPickupDayIndex = 0;
let coSlipFile = null;
let coSlipPath = null; // path in the storage bucket once the slip is uploaded (lets a retry skip re-uploading)
let coSubmitting = false;

/* Cart and orders are namespaced per account (same scheme as script.js),
   so they're only ever read/written for whoever is currently signed in. */
function getSession(){
  try{ return JSON.parse(localStorage.getItem('mazi_session') || 'null'); }
  catch(e){ return null; }
}
function accountId(){
  const session = getSession();
  if (!session) return 'guest';
  // Must match script.js's accountId() exactly — accounts here are
  // identified by mobile number (OTP login), email is optional/blank
  // until filled in from Profile. Keying this off email alone put every
  // mobile-logged-in shopper back in the "guest" bucket here, so
  // checkout.js read an empty cart and bounced the page back to
  // index.html?open=cart even though the shop page's cart wasn't empty.
  const key = (session.mobile || session.email || '').toLowerCase();
  return key || 'guest';
}
function cartKey(){
  return 'mazi_cart_' + accountId();
}
function ordersKey(){
  return 'mazi_orders_' + accountId();
}
function getCart(){
  try{ return JSON.parse(localStorage.getItem(cartKey()) || '{}'); }
  catch(e){ return {}; }
}
function saveCart(cart){
  localStorage.setItem(cartKey(), JSON.stringify(cart));
}
function getOrders(){
  try{ return JSON.parse(localStorage.getItem(ordersKey()) || '[]'); }
  catch(e){ return []; }
}
function saveOrders(orders){
  localStorage.setItem(ordersKey(), JSON.stringify(orders));
}
function productImg(p){
  // Some products ship with a real photo already placed at a custom path —
  // use that if set on the product (matches script.js's logic).
  if (p.img) return p.img;
  return `img/products/${p.id}.png`;
}

/* ---------- Guard: needs a logged-in user with items in cart ---------- */
let cart = getCart();
const session = getSession();
if (!session){
  window.location.href = 'index.html?open=login';
}
if (Object.keys(cart).length === 0){
  window.location.href = 'index.html?open=cart';
}
// The login mirror in localStorage can outlive the real server session —
// make sure Supabase still knows this shopper before they fill in the form.
if (session && window.MaziAPI){
  MaziAPI.getSession().then(sess=>{
    if (!sess){
      localStorage.removeItem('mazi_session');
      window.location.href = 'index.html?open=login&from=checkout';
    }
  }).catch(()=>{});
}

/* ---------- Contact ---------- */
function renderContact(){
  const s = getSession() || {};
  const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.name || 'there';
  $('#coContactName').textContent = `Signed in as ${name}`;
  $('#coContactMobile').textContent = s.mobile ? `+960${String(s.mobile).replace(/^\+?960/,'')}` : '';
  $('#coName').value = name !== 'there' ? name : '';
  $('#coMobile').value = s.mobile || '';
  renderBusinessInfo();
}

/* Accounts: show every business / extra account of this login in the Contact box
   (name, type, GST TIN, place, approval status). Read-only — managed from Profile → My Accounts.
   Individual logins with no extra accounts see nothing extra. */
function renderBusinessInfo(){
  const box = $('#coContactBusiness');
  if (!box || !window.MaziAPI) return;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const badge = st => {
    const label = st === 'approved' ? 'Approved' : (st === 'rejected' ? 'Not approved' : 'Pending approval');
    return `<span class="co-biz-badge ${st === 'approved' ? 'is-verified' : 'is-pending'}">${label}</span>`;
  };
  const item = a => `<div class="co-biz-item">
      <div class="co-contact-bname">${esc(a.name)}${badge(a.status)}</div>
      ${a.sub ? `<div class="co-contact-btin">${esc(a.sub)}</div>` : ''}
      ${a.gst ? `<div class="co-contact-btin">${esc(a.gst)}</div>` : ''}
      ${a.place ? `<div class="co-contact-btin">${esc(a.place)}</div>` : ''}
    </div>`;
  const show = list => {
    if (!list.length){ box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = list.map(item).join('');
    box.hidden = false;
  };
  const fromProfile = ()=> MaziAPI.getProfile().then(p=>{
    if (!p || p.account_type !== 'business' || !p.business_name) return [];
    return [{ name: p.business_name, status: p.business_verified === false ? 'pending' : 'approved',
              sub: 'Business', gst: p.gst_tin ? `GST TIN: ${p.gst_tin}` : 'GST TIN: not provided', place: [p.city, p.atoll].filter(Boolean).join(', ') }];
  }).catch(()=>[]);

  const shops = MaziAPI.listShops ? MaziAPI.listShops().catch(()=>[]) : Promise.resolve([]);
  shops.then(list=>{
    if (list && list.length){
      show(list.map(x=>({
        name: x.name, status: x.status,
        sub: x.account_type === 'business' ? ('Business' + (x.business_type ? ' · ' + x.business_type : '')) : 'Residence',
        gst: x.account_type === 'business' ? (x.gst_exempt ? 'Not GST registered' : (x.gst_tin ? `GST TIN: ${x.gst_tin}` : '')) : '',
        place: [x.city, x.atoll].filter(Boolean).join(', ')
      })));
    } else {
      fromProfile().then(show);
    }
  });
}

/* ---------- Review items ---------- */
function lineItems(){
  return Object.keys(cart).map(id=>{
    const p = PRODUCTS.find(p=>p.id===id);
    return p ? { p, qty: cart[id] } : null;
  }).filter(Boolean);
}

function renderItems(){
  const items = lineItems();
  const count = items.reduce((s,it)=> s + it.qty, 0);
  $('#coItemCount').textContent = count ? `(${count} unit${count!==1?'s':''})` : '';
  $('#coTitleSub').textContent = count ? `${count} item${count!==1?'s':''} in your order.` : 'Your cart is empty.';

  if (items.length === 0){
    $('#coItems').innerHTML = `<div class="co-items-empty">Your cart is empty.</div>`;
  } else {
    $('#coItems').innerHTML = items.map(({p,qty})=>`
      <div class="co-item-row" data-id="${p.id}">
        <div class="co-item-media"><img src="${productImg(p)}" alt="${p.name}" onerror="this.classList.add('img-missing')"></div>
        <div class="co-item-info">
          <div class="co-item-name">${p.name}</div>
          <div class="co-item-meta">${p.pack}</div>
          <div class="co-item-qty">
            <button type="button" data-minus="${p.id}">&minus;</button>
            <span>${qty}</span>
            <button type="button" data-plus="${p.id}">&plus;</button>
          </div>
        </div>
        <div class="co-item-price">${fmt(p.price * qty)}</div>
      </div>
    `).join('');
  }

  $$('[data-minus]', $('#coItems')).forEach(btn=> btn.addEventListener('click', ()=> changeQty(btn.dataset.minus, -1)));
  $$('[data-plus]', $('#coItems')).forEach(btn=> btn.addEventListener('click', ()=> changeQty(btn.dataset.plus, 1)));
  $$('[data-remove]', $('#coItems')).forEach(btn=> btn.addEventListener('click', ()=> removeItem(btn.dataset.remove)));
}

function changeQty(id, delta){
  const next = (cart[id] || 0) + delta;
  if (next <= 0) delete cart[id];
  else cart[id] = next;
  saveCart(cart);
  refreshCart();
}
function removeItem(id){
  delete cart[id];
  saveCart(cart);
  refreshCart();
}
function refreshCart(){
  if (Object.keys(cart).length === 0){
    window.location.href = 'index.html?open=cart';
    return;
  }
  renderItems();
  renderSummary();
}

/* ---------- Order summary ---------- */
function subtotal(){
  return lineItems().reduce((s,{p,qty})=> s + p.price*qty, 0);
}
function deliveryFee(){
  return coMethod === 'pickup' ? 0 : null; // null = "to be confirmed"
}
function renderSummary(){
  const sub = subtotal();
  const gst = sub - (sub / (1 + GST_RATE));
  const fee = deliveryFee();
  const total = sub + (fee || 0);

  $('#coSubtotal').innerHTML = fmt(sub);
  $('#coGst').innerHTML = fmt(gst);
  const feeEl = $('#coDeliveryFee');
  if (fee === 0){ feeEl.textContent = 'Complimentary'; feeEl.classList.add('co-complimentary'); }
  else { feeEl.textContent = 'To be confirmed'; feeEl.classList.remove('co-complimentary'); }
  $('#coTotal').innerHTML = fmt(total);

  const cur = getCurrency();
  const totalLabelEl = $('#coTotalLabel');
  if (totalLabelEl) totalLabelEl.innerHTML = cur === 'USD' ? `Total (USD)` : `Total (${MVR_ICON})`;
}

/* Highlights whichever bank account matches the shopper's chosen
   currency, so it's obvious which account to pay into. */
function renderBankAccounts(){
  const cur = getCurrency();
  const mvrRow = $('#coBankMVR');
  const usdRow = $('#coBankUSD');
  if (mvrRow) mvrRow.classList.toggle('co-bank-match', cur === 'MVR');
  if (usdRow) usdRow.classList.toggle('co-bank-match', cur === 'USD');
}

/* ---------- Delivery preferences ---------- */
function pickupDayOptions(){
  // The Male' showroom is CLOSED on Fridays, so Fridays are never offered.
  // Labels follow the real calendar (TODAY / TOMORROW only when it is
  // literally today / tomorrow), and we still return 6 open days.
  const out = [];
  for (let i = 0; out.length < 6; i++){
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() === 5) continue; // Friday = closed
    const dateLabel = d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase();
    out.push(i === 0 ? `TODAY &middot; ${dateLabel}`
           : i === 1 ? `TOMORROW &middot; ${dateLabel}`
           : dateLabel);
  }
  return out;
}
function renderPickupDays(){
  const days = pickupDayOptions();
  $('#coPickupDays').innerHTML = days.map((label,i)=>
    `<button type="button" class="co-day${i===coPickupDayIndex?' active':''}" data-day="${i}">${label}</button>`
  ).join('');
  $$('[data-day]', $('#coPickupDays')).forEach(btn=> btn.addEventListener('click', ()=>{
    coPickupDayIndex = Number(btn.dataset.day);
    renderPickupDays();
  }));
}

function setMethod(method){
  coMethod = method;
  $$('.co-tab', $('#coDeliveryTabs')).forEach(tab=> tab.classList.toggle('active', tab.dataset.method === method));
  $('#coPanelPickup').hidden = method !== 'pickup';
  $('#coPanelDelivery').hidden = method !== 'delivery';
  $('#coPanelBoat').hidden = method !== 'boat';
  if (method === 'delivery') renderDeliveryEstimate();
  renderSummary();
}

/* ---------- Custom dropdown (replaces the browser's native <select> pop-up) ----------
   The browser decides by itself whether a native <select> list opens up or
   down, and it often flips UPWARD even when there is plenty of room below.
   This keeps the real <select> in the page (so .value, change events and the
   rest of this file work exactly as before) but shows our own list instead:
   it opens DOWN by default and only flips UP when there really isn't enough
   room below and there is more room above. */
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

function populateAtollSelect(selectId){
  const sel = $(selectId);
  sel.innerHTML = Object.keys(ATOLLS).map(atoll => `<option value="${atoll}">${atoll}</option>`).join('');
}
function populateIslandSelect(selectId, atoll){
  const sel = $(selectId);
  const cities = ATOLLS[atoll] || [];
  sel.innerHTML = cities.map(c => `<option>${c}</option>`).join('');
}
function isMaleIsland(island){
  return island === "Male'" || island === "Hulhumale'";
}
function renderDeliveryEstimate(){
  const island = $('#coIsland').value;
  const male = isMaleIsland(island);
  $('#coEstimateTitle').textContent = male ? "Male' Delivery" : `${island || 'Island'} Delivery`;
  $('#coEstimateSub').textContent = 'Cargo boat / speedboat / air freight';
  const feeEl = $('#coEstimateFee');
  const etaEl = $('#coEstimateEta');
  if (male){
    feeEl.textContent = 'Complimentary';
    feeEl.classList.add('co-complimentary');
    feeEl.classList.remove('co-tbc');
    etaEl.textContent = 'Same Day';
  } else {
    feeEl.textContent = 'To be confirmed';
    feeEl.classList.remove('co-complimentary');
    feeEl.classList.add('co-tbc');
    etaEl.textContent = '2–4 Working Days';
  }
}

/* ---------- Payment ---------- */
function renderSlip(){
  const wrap = $('#coUploadWrap');
  const label = $('#coUploadLabel');
  if (coSlipFile){
    wrap.classList.add('has-file');
    label.textContent = `Selected: ${coSlipFile.name}`;
  } else {
    wrap.classList.remove('has-file');
    label.textContent = 'Tap to upload slip (JPG, PNG, PDF — max 5MB)';
  }
}

/* ---------- Order placement ---------- */
// Sends the order to the server. Resolves with the saved order (normalised by
// MaziAPI, so it has the real order number MZ2026xxxx, status, totals...).
function placeOrder(customer){
  if (!window.MaziAPI) return Promise.reject(new Error('The ordering service is not available. Please refresh and try again.'));
  const ids = Object.keys(cart).filter(id => PRODUCTS.find(p => p.id === id));
  if (ids.length === 0) return Promise.reject(new Error('Your cart is empty.'));
  const items = ids.map(id => ({ product_id: id, qty: cart[id] }));

  // 1) upload the slip once (kept in coSlipPath so a failed order can be retried without re-uploading)
  const slipStep = coSlipPath ? Promise.resolve(coSlipPath)
    : MaziAPI.uploadPaymentSlip(coSlipFile).then(path => { coSlipPath = path; return path; });

  // 2) create the order — the server checks stock + prices and returns the final numbers
  return slipStep.then(path => MaziAPI.createOrder({
    items,
    currency: getCurrency(),
    name: customer.name,
    mobile: MaziAPI.normalizeMobile(customer.mobile),
    method: customer.method,
    location: customer.location,
    slipPath: path,
    termsAccepted: true
  })).then(order => {
    // keep a local copy so "My Orders" shows it instantly
    order.notifiedIdx = 0;
    order.badgeUnseen = false;
    const orders = getOrders().filter(o => o.id !== order.id);
    orders.unshift(order);
    saveOrders(orders);

    cart = {};
    saveCart(cart);
    return order;
  });
}

function showSubmitError(msg){
  const el = $('#coSubmitError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  if (msg) el.scrollIntoView({behavior:'smooth', block:'center'});
}

function showSuccess(order, contactLabel){
  $('#coContent').style.display = 'none';
  document.title = 'Order Placed — MAZI General Trade';

  const s = getSession() || {};
  const customer = order.customer || {};
  const firstName = (customer.name || '').split(' ')[0] || s.firstName || s.name || 'there';
  const itemCount = order.items.reduce((sum,it)=> sum + it.qty, 0);

  $('#coSuccessSub').textContent = `Hi ${firstName}, your order for ${itemCount} product${itemCount!==1?'s':''} has been received and is now pending confirmation from our team.`;
  $('#coSuccessTotal').innerHTML = fmtCur(order.total, order.currency || 'MVR');
  $('#coSuccessOrderId').textContent = order.id;
  const d = new Date(order.placedAt);
  $('#coSuccessDate').textContent = d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}) + ', ' + d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
  $('#coSuccessContact').textContent = contactLabel || '—';

  initNotifPrompt();

  $('#coSuccess').classList.add('show');
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ============ Device (OS-level) order notifications ============ */
// Same mechanism as script.js on the main site — a real browser/OS
// notification, backed by a service worker so it also works on Android
// Chrome (which blocks the plain Notification constructor).
function notifSupported(){
  return typeof window !== 'undefined' && 'Notification' in window;
}
function registerNotifServiceWorker(){
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('sw.js').catch(()=> null);
}
function requestDeviceNotifPermission(onDone){
  if (!notifSupported()){ if (onDone) onDone('unsupported'); return; }
  if (Notification.permission !== 'default'){ if (onDone) onDone(Notification.permission); return; }
  registerNotifServiceWorker();
  Notification.requestPermission().then(perm=>{ if (onDone) onDone(perm); });
}

// App-level on/off preference, shared (same localStorage key) with the
// main site's script.js — so toggling it here or in Profile settings
// stays in sync everywhere.
function getNotifPref(){
  return localStorage.getItem('mazi_notif_pref') || 'on';
}
function setNotifPref(val){
  localStorage.setItem('mazi_notif_pref', val);
}

// Shown on the success screen. Stays visible (not hidden) once permission
// is granted — it morphs into a persistent on/off toggle instead, so the
// person can turn order + future offer/sale alerts back on or off right
// there. Only hides fully when unsupported or the browser permission was
// denied outright.
function initNotifPrompt(){
  const el = $('#coNotifPrompt');
  const action = $('#coNotifAction');
  if (!el || !action) return;

  if (!notifSupported() || Notification.permission === 'denied'){
    el.hidden = true;
    return;
  }
  el.hidden = false;

  if (Notification.permission === 'granted'){
    renderNotifToggle(action, 'coNotifToggle');
  } else {
    renderNotifEnableButton(action, 'coNotifBtn', ()=> renderNotifToggle(action, 'coNotifToggle'), el);
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
      setTimeout(()=>{
        btn.classList.remove('loading');
        if (perm === 'granted'){
          setNotifPref('on');
          btn.classList.add('success');
          setTimeout(onEnabled, 900);
        } else if (perm === 'denied'){
          if (promptEl) promptEl.hidden = true;
        }
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
      renderNotifToggle(action, toggleId);
    }, 700);
  });
}

/* ---------- Init ---------- */
function init(){
  if (!session || Object.keys(cart).length === 0) return;

  renderContact();
  renderItems();
  renderSummary();
  renderBankAccounts();

  coMethod = 'pickup';
  coPickupDayIndex = 0;
  coSlipFile = null;
  coSlipPath = null;
  renderSlip();
  renderPickupDays();

  enhanceSelect($('#coAtoll'));
  enhanceSelect($('#coIsland'));
  populateAtollSelect('#coAtoll');
  $('#coAtoll').value = 'Kaafu (K)';
  populateIslandSelect('#coIsland', $('#coAtoll').value);

  setMethod('pickup');

  const sessionName = [session.firstName, session.lastName].filter(Boolean).join(' ') || session.name || '';
  $('#coBoatCustomerName').value = sessionName;
  $('#coBoatCustomerContact').value = session.mobile || '';

  $$('.co-tab', $('#coDeliveryTabs')).forEach(tab=>{
    tab.addEventListener('click', ()=> setMethod(tab.dataset.method));
  });

  $('#coAtoll').addEventListener('change', ()=>{
    populateIslandSelect('#coIsland', $('#coAtoll').value);
    renderDeliveryEstimate();
  });
  $('#coIsland').addEventListener('change', renderDeliveryEstimate);

  $('#coSlip').addEventListener('change', e=>{
    const file = e.target.files[0];
    coSlipFile = file || null;
    coSlipPath = null; // a different file needs uploading again
    renderSlip();
    if (coSlipFile){
      $('#coUploadWrap').classList.remove('error');
      $('#coSlipError').style.display = 'none';
    }
  });

  $('#coName').addEventListener('input', ()=> $('#coNameField').classList.remove('has-error'));
  $('#coMobile').addEventListener('input', ()=> $('#coMobileField').classList.remove('has-error'));
  $('#coHouse').addEventListener('input', ()=> $('#coHouseField').classList.remove('has-error'));
  [
    'coBoatName','coBoatContact','coBoatDeparture','coBoatCustomerName',
    'coBoatCustomerContact','coBoatAddress','coBoatIslandName','coBoatIslandCode'
  ].forEach(id=>{
    $('#'+id).addEventListener('input', ()=> $('#'+id+'Field').classList.remove('has-error'));
  });

  $('#coTerms').addEventListener('change', ()=>{
    if ($('#coTerms').checked){
      $('#coTermsField').classList.remove('has-error');
      $('#coTermsError').style.display = 'none';
    }
  });

  $('#checkoutForm').addEventListener('submit', e=>{
    e.preventDefault();

    const name = $('#coName').value.trim();
    const nameOk = name.length >= 2;
    $('#coNameField').classList.toggle('has-error', !nameOk);
    const mobile = $('#coMobile').value.trim();
    const mobileOk = /^[0-9+\-\s]{6,}$/.test(mobile);
    $('#coMobileField').classList.toggle('has-error', !mobileOk);

    let deliveryDetails = null;
    let methodOk = true;

    if (coMethod === 'delivery'){
      const atoll = $('#coAtoll').value;
      const island = $('#coIsland').value;
      const house = $('#coHouse').value.trim();
      const landmark = $('#coLandmark').value.trim();
      const note = $('#coDeliveryNote').value.trim();
      const houseOk = house.length >= 2;
      $('#coHouseField').classList.toggle('has-error', !houseOk);
      methodOk = houseOk;
      if (methodOk){
        const address = [house, landmark, island, atoll].filter(Boolean).join(', ');
        deliveryDetails = { atoll, island, house, landmark, note, address };
      }
    } else if (coMethod === 'boat'){
      const boatFields = [
        { id:'coBoatName', min:2 },
        { id:'coBoatContact', min:6 },
        { id:'coBoatDeparture', min:1 },
        { id:'coBoatCustomerName', min:2 },
        { id:'coBoatCustomerContact', min:6 },
        { id:'coBoatAddress', min:5 },
        { id:'coBoatIslandName', min:2 },
        { id:'coBoatIslandCode', min:1 },
      ];
      methodOk = true;
      const boatVals = {};
      boatFields.forEach(f=>{
        const val = $('#'+f.id).value.trim();
        const ok = val.length >= f.min;
        $('#'+f.id+'Field').classList.toggle('has-error', !ok);
        boatVals[f.id] = val;
        if (!ok) methodOk = false;
      });
      if (methodOk){
        deliveryDetails = {
          boatName: boatVals.coBoatName,
          boatContact: boatVals.coBoatContact,
          boatDeparture: boatVals.coBoatDeparture,
          customerName: boatVals.coBoatCustomerName,
          customerContact: boatVals.coBoatCustomerContact,
          address: boatVals.coBoatAddress,
          islandName: boatVals.coBoatIslandName,
          islandCode: boatVals.coBoatIslandCode,
          note: $('#coBoatNote').value.trim(),
        };
      }
    } else {
      deliveryDetails = {
        store: "Male' Showroom",
        day: pickupDayOptions()[coPickupDayIndex].replace(/&middot;/g,'·').replace(/<[^>]+>/g,''),
        note: $('#coPickupNote').value.trim(),
      };
    }

    const slipOk = !!coSlipFile;
    $('#coUploadWrap').classList.toggle('error', !slipOk);
    $('#coSlipError').style.display = slipOk ? 'none' : 'block';

    const termsOk = $('#coTerms').checked;
    $('#coTermsField').classList.toggle('has-error', !termsOk);
    $('#coTermsError').style.display = termsOk ? 'none' : 'block';

    if (!nameOk || !mobileOk || !methodOk || !slipOk || !termsOk){
      const firstError = document.querySelector('.co-field.has-error, .co-upload.error, #coTermsField.has-error');
      if (firstError) firstError.scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }

    if (coSubmitting) return;
    coSubmitting = true;
    showSubmitError('');

    const submitBtn = $('#coSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Placing order…';
    document.getElementById('coPage').classList.add('co-placing');

    const resetBtn = ()=>{
      coSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Place Your Order';
      document.getElementById('coPage').classList.remove('co-placing');
    };

    placeOrder({
      name, mobile,
      method: coMethod,
      location: deliveryDetails
    }).then(order=>{
      coSubmitting = false;
      document.getElementById('coPage').classList.remove('co-placing');
      showSuccess(order, mobile ? `+960${mobile.replace(/^\+?960/,'').replace(/^0+/,'')}` : '');
    }).catch(err=>{
      resetBtn();
      if (err && err.code === 'NOT_AUTHENTICATED'){
        localStorage.removeItem('mazi_session');
        showSubmitError('Your login expired. Please log in again — your cart is saved.');
        setTimeout(()=>{ window.location.href = 'index.html?open=login&from=checkout'; }, 1800);
        return;
      }
      let msg = (err && err.message) || 'We could not place your order. Please try again.';
      if (err && (err.code === 'OUT_OF_STOCK' || err.code === 'INSUFFICIENT_STOCK' || err.code === 'PRODUCT_NOT_FOUND') && err.detail){
        const names = String(err.detail).split(',').map(id=>{
          const p = PRODUCTS.find(p=>p.id===id);
          return p ? p.name : id;
        });
        msg += ' (' + names.join('; ') + ')';
      }
      showSubmitError(msg);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
