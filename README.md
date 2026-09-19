# MAZI API — Setup Guide

Supabase ang backend. **Walang server na kailangang i-host.** Ang API ay mga table + function sa database mo, at tinatawag ito ng website gamit ang `api.js`.

```
mazi-api/
├── supabase/01_schema.sql   ← tables, security rules (RLS), API functions, storage bucket
├── supabase/02_seed.sql     ← 48 produkto (Daiwa, Sanzoft, Carefor, R-Fresh; ID = code ng backend) + 12 categories + config
└── frontend/api.js          ← window.MaziAPI, ang gagamitin ng site
```

## A. I-set up ang Supabase (mga 10 minuto)

1. Buksan ang Supabase project mo → **SQL Editor** → New query.
2. I-paste ang buong `01_schema.sql` → **Run**. (Puwede itong i-run ulit, hindi ito magdo-duplicate.)
3. I-paste ang `02_seed.sql` → **Run**. Isang beses lang ito, dahil ire-reset nito ang presyo/stock ng mga produkto kapag inulit.
4. Pumunta sa **Table Editor** at tingnan kung may `products` (48 rows; 27 active, 21 nakatago dahil wala pang presyo), `categories`, at `app_config`.
5. **Authentication → Providers → Phone** → i-enable at pumili ng SMS provider (Twilio, MessageBird, Vonage, atbp.) at ilagay ang credentials. *Kailangan mong tiyakin na sinusuportahan ng provider ang mga numerong +960.* Habang nagde-develop, puwede kang maglagay ng test phone numbers + fixed OTP sa parehong page para hindi ka gumastos sa SMS.
6. Gawin ang sarili mong staff account: mag-login sa site gamit ang numero mo, tapos sa SQL Editor:
   ```sql
   update public.profiles set is_admin = true where mobile = '+9607XXXXXXX';
   ```

## B. Ikonekta ang website

Sa `index.html`, ilagay ang `api.js` pagkatapos ng `supabase-config.js`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="supabase-config.js"></script>
<script src="api.js"></script>
```
Ganoon din sa `checkout.html` (idagdag ang tatlong script na iyan bago ang `checkout.js`).

### Kung anong mock ang papalitan ng anong API call

| Ngayon (localStorage/demo) | Palitan ng |
|---|---|
| `const PRODUCTS = [...]` (script.js at checkout.js) | `MaziAPI.listProducts()` |
| `supabaseClient = window.supabase.createClient(...)` (script.js, taas) | `supabaseClient = window.MaziAPI.client` |
| Mobile step: `generateOtpCode()` + "Demo mode" hint | `MaziAPI.sendOtp(mobile)` |
| OTP form submit (`saveRegisteredAccount`, `setSession`) | `MaziAPI.verifyOtp(mobile, code)` → `{ user, profile, isNewUser }` |
| Onboarding form submit | `MaziAPI.completeOnboarding({ accountType, businessType, city })` |
| `performLogout` | `MaziAPI.logout()` |
| Delete account | `MaziAPI.deleteAccount()` |
| `placeOrder()` (checkout.js) | `MaziAPI.createOrder({...})` |
| `getOrders()` | `MaziAPI.listOrders()` |
| `orderStatusIndex(order)` (timer) | `order.statusIndex` (galing sa server) |
| `cancelOrder()` | `MaziAPI.cancelOrder(id)` |
| `checkOrderUpdates()` (timer) | `MaziAPI.subscribeOrders(order => ...)` |

### Mga halimbawa

**Produkto** — ang `PRODUCTS` ay `const`, kaya punan mo ito imbes na palitan:
```js
MaziAPI.listProducts().then(rows => {
  PRODUCTS.length = 0;
  PRODUCTS.push(...rows);        // parehong shape: {id, name, cat, icon, pack, unit, price, stock, img}
  renderProducts();
});
```

**Login:**
```js
// mobile form
await MaziAPI.sendOtp(mobileInput);                 // nagpapadala ng totoong SMS
// otp form
const { user, profile, isNewUser } = await MaziAPI.verifyOtp(pendingMobile, code);
setSession({ name: profile.name || 'Account', mobile: profile.mobile, email: profile.email || '' });
if (isNewUser) openOnboarding();
```

**Checkout** — palitan ang laman ng `setTimeout(...)` sa submit handler ng `checkout.js`:
```js
try {
  const order = await MaziAPI.createOrder({
    cart: getCart(),                      // { 607CF02001: 2, ... }
    currency: getCurrency(),
    name, mobile,
    method: coMethod,                     // 'pickup' | 'delivery' | 'boat'
    location: deliveryDetails,            // parehong object na binubuo mo na
    slipFile: coSlipFile,                 // ang mismong File, hindi ang filename
    termsAccepted: $('#coTerms').checked
  });
  saveCart({});                           // ubos na ang cart
  showSuccess(order, `+960${mobile.replace(/^\+?960/, '')}`);
} catch (err) {
  // err.code, err.message (friendly), err.detail (hal. "607RF01001" kapag out of stock)
  alert(err.message);                     // walang showToast sa checkout.js; palitan ng sarili mong message box
  submitBtn.disabled = false; submitBtn.textContent = 'Place Your Order';
}
```
Ang `order` na ibinabalik ay may parehong shape na ginagamit ng UI mo (`id`, `placedAt`, `items`, `subtotal`, `deliveryFee`, `total`, `customer`) at may dagdag na `status` at `statusIndex`.

## C. Mga patakaran na ipinapatupad ng server

- **Presyo, GST, delivery fee, at total ay kinukuwenta ng server.** Binabalewala nito ang anumang presyong ipinadala ng browser.
- Delivery fee: pickup = 0, delivery sa Male'/Hulhumale' = 0 (Complimentary), ibang isla o boat = `null` ("To be confirmed"). Ang staff ang maglalagay ng fee sa `admin_set_order_status`.
- Hindi puwedeng umorder ng `out` na stock, at hindi rin ng produktong wala o inactive.
- Kailangan ng payment slip (JPG/PNG/PDF, max 5 MB) na na-upload **ng mismong user** sa private bucket.
- Cancel: hanggang `placed` lang. Nagiging `refund_status = 'pending'` ito para manual na i-review ng staff (Terms §4).
- Order number: `MZ` + taon + 4 na digit (`MZ20260001`), ligtas kahit sabay-sabay ang order.
- Limit na 10 order kada oras kada user.
- Ang user ay makakabasa lang ng sarili niyang orders. Hindi siya makakapag-insert, update, o delete ng order nang direkta, at hindi niya mapapalitan ang `is_admin` o `business_verified`.

**Business vs Residence na presyo:** may `residence_price` column sa `products`. Kapag `NULL`, pareho ang presyo ng lahat (kagaya ngayon). Kapag nilagyan mo, ang Residence ang makakakuha nito, at ang Business na presyo ay sa mga account lang na `business_verified = true` (i-verify ng staff ang GST TIN, gamit ang `MaziAPI.adminSetBusinessVerified`).

## D. Staff / admin

Ang mga admin function ay nasa `MaziAPI` na: `adminListOrders('placed')`, `getSlipUrl(path)` (5-minutong link para makita ang slip), at `adminSetOrderStatus(id, 'processing', { deliveryFee: 150 })`. Wala pang admin *page* na ginawa. Sa ngayon, puwede mong gamitin ang Supabase Table Editor para makita ang orders, at ang SQL Editor o Storage tab para sa slips. Kaya kong gumawa ng simpleng admin page kapag gusto mo.

## E. Ano ang nasubukan ko at ano ang hindi

**Nasubukan** (sa lokal na PostgreSQL 16 na may ginaya kong `auth` at `storage` ng Supabase): pag-load at pag-re-run ng schema at seed; awtomatikong pagbuo ng profile; catalog para sa guest; paggawa ng order sa pickup, delivery (Male' at ibang isla), at boat; pag-ignore sa peke na presyo; out-of-stock, maling slip, at walang slip; pag-cancel; paghihiwalay ng data ng bawat user; hindi makapagpalit ng `is_admin`; admin flow; presyo ng Business vs Residence; at pag-delete ng account. Sinubukan din ang `api.js` gamit ang mock na client.

**Hindi ko pa nasubukan sa totoong Supabase mo**: ang aktwal na SMS OTP (nakadepende sa provider mo), ang Storage policies, Realtime, at ang pag-delete ng auth user. Kaya i-test ang buong flow sa staging bago mag-launch: mag-register → umorder → mag-upload ng slip → i-cancel → i-delete ang account.

## F. Mga limitasyon na dapat mong malaman

- Nababasa ng kahit sino ang `products` table, kasama ang `price` at `residence_price`. Kung kailangang lihim ang Business na presyo, kailangan itong higpitan (sabihin mo at gagawin ko).
- Hindi nabubura ang mga lumang payment slip kapag na-delete ang account (itinatago para sa accounting, pero naka-anonymize na ang order).
- Kapag pumalya ang order (hal. out of stock) pagkatapos ma-upload ang slip, may matitirang slip file. Ipasa ang `slipPath` sa susunod na `createOrder` para hindi na mag-upload ulit.
- Ang ipapakita sa customer na halaga sa USD ay ginagawa pa rin sa browser (`mvr_per_usd` sa `app_config`). MVR lang ang totoong halagang sine-save.
