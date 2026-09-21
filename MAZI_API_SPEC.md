# MAZI General Trade — API Contract (for backend developer)

This document is derived from the current frontend (`script.js`, `checkout.js`, `index.html`, `checkout.html`).
Right now **everything is mocked in the browser** (localStorage + hardcoded arrays). The goal of this API is to replace each mock below.

Backend-agnostic: can be built on Supabase (Postgres + Edge Functions + Storage) or any REST server. A Supabase project already exists (`supabase-config.js`) with the schema and 48-product seed loaded; the frontend does not call it yet.

- Base URL: `https://<host>/api/v1`
- Format: JSON (`Content-Type: application/json`), except slip upload (`multipart/form-data`)
- Auth: `Authorization: Bearer <access_token>` (guests can only call public catalog endpoints)
- Money: integers in **MVR** (prices are whole MVR, GST 8% already included). USD is display-only in the frontend (`1 USD = 15.42 MVR`), so expose it via `/config`.
- Timestamps: ISO 8601 UTC
- Errors: `{ "error": { "code": "STRING", "message": "Human readable" } }` with proper HTTP status

---

## What the frontend currently mocks (and must move to the server)

| Current frontend behaviour | Where | Must become |
|---|---|---|
| `PRODUCTS` array (48 items: Daiwa, Sanzoft, Carefor, R-Fresh; id = backend product code), duplicated in `checkout.js` | script.js, checkout.js | `GET /products` |
| OTP code generated in the browser and shown on screen ("Demo mode") | script.js | Real SMS OTP, verified server-side |
| Accounts in `localStorage.mazi_accounts`, session in `mazi_session` | script.js | Real users + JWT |
| Orders in `localStorage` | script.js, checkout.js | `POST/GET /orders` |
| Order status advances by timer (`ORDER_STAGE_MINUTES`) | script.js | Status set by staff/admin only |
| Totals, GST and delivery fee computed in browser | checkout.js | Server computes; client values are ignored |
| Payment slip: only the filename is stored | checkout.js | Real file upload + storage |
| Cancel order = flag in localStorage | script.js | `POST /orders/{id}/cancel` |

---

## 1. Auth (mobile number + SMS OTP)

Accounts are identified by **mobile number** (Maldives, `+960` + 7 digits). Email is optional.

### `POST /auth/otp/send`
```json
{ "mobile": "+9607771234" }
```
`200` → `{ "sent": true, "resend_after_seconds": 30 }`
Rules from the UI: 30 s resend cooldown, rate-limit per number and per IP.

### `POST /auth/otp/verify`
```json
{ "mobile": "+9607771234", "code": "123456" }
```
`200` →
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": { "id": "uuid", "mobile": "+9607771234", "name": null, "email": null, "onboarded": false },
  "is_new_user": true
}
```
Rules from the UI: max **5 wrong attempts**, then a new code must be requested (`429 TOO_MANY_ATTEMPTS`). `is_new_user: true` makes the frontend open the onboarding modal.

### `POST /auth/refresh` · `POST /auth/logout`
Standard.

---

## 2. Account / Profile

### `GET /me`
```json
{
  "id": "uuid",
  "mobile": "+9607771234",
  "name": "Ali Hassan",
  "email": "ali@example.com",
  "account_type": "business",
  "business_type": "Retail Shop",
  "business_name": "Ali Store",
  "gst_tin": "1234567GST501",
  "atoll": "K (Kaafu)",
  "city": "Male'",
  "notifications_enabled": true
}
```

### `PATCH /me`
Partial update of the fields above. Onboarding form sends:
```json
{ "account_type": "business|residence", "business_type": "Retail Shop", "city": "Male'" }
```
- `business_type` is required only when `account_type = business`. Allowed: `Retail Shop`, `Wholesale / Trading`, `Restaurant / Café`, `Guesthouse / Hotel`, `Resort`, `Other`.
- `business_name` and `gst_tin` are listed in the Privacy Policy/Terms but **not yet collected by the UI** (frontend will add them). Business pricing is only for accounts with a valid GST TIN (see Terms §1).

### `DELETE /me`
Deletes the account and personal data (UI has a "Delete account" confirmation). Keep order records that the law requires for accounting, anonymised if needed (Privacy Policy §6).

---

## 3. Catalog (public)

### `GET /config`
```json
{ "usd_per_mvr": 0.0648, "gst_rate": 0.08, "free_delivery_over_mvr": 500, "male_islands": ["Male'", "Hulhumale'"] }
```

### `GET /categories`
```json
[ { "id": "dairy", "name": "Dairy" }, { "id": "tea", "name": "Tea" } ]
```
Current ids: `dairy, tea, coffee, beverages, dried-fruits, grains, confectionary, canned, cooking, personal-care, sauces, household`. For now only `household` has products (Daiwa, Sanzoft, Carefor, R-Fresh); the other categories are empty on purpose.

Product `id` = the code used in the backend/inventory system (e.g. `101DW00008`), and `name` is identical to the backend product name. Products with no price yet are `active = false` and are not returned to the public.

### `GET /products?cat=household&q=air&page=1&limit=50`
```json
{
  "items": [
    {
      "id": "607CF02001",
      "name": "CAREFOR AIR FRESHENER GEL 180 GRAM.- COFFEE, (1 X 24) CTN",
      "category": "household",
      "pack": "Carton",
      "unit": "1 x 24",
      "price": 1180,
      "stock": "in",
      "image_url": "https://.../mz002.jpg"
    }
  ],
  "page": 1, "total": 27
}
```
- `stock` enum: `in | low | out` (out = cannot be added to cart).
- `price` must reflect the caller's **account type** (Business vs Residence) when authenticated; guests get the default price.
- `q` searches name (and ideally category/unit).

### `GET /products/{id}`
Same object as above.

---

## 4. Cart

The cart currently lives in localStorage per account and is merged from guest → account on login. **Recommendation: keep the cart client-side for now** and let the server validate it at order time. If a server cart is wanted later: `GET/PUT /cart` with `{ items:[{product_id, qty}] }`.

---

## 5. Checkout & Orders (main part)

### `POST /orders` (auth required, `multipart/form-data`)

Fields:
- `payload` — JSON string (below)
- `payment_slip` — file (JPG, PNG or PDF, **max 5 MB**, required)

```json
{
  "items": [ { "product_id": "607CF02001", "qty": 2 }, { "product_id": "607CF01001", "qty": 1 } ],
  "currency": "MVR",
  "customer": { "name": "Ali Hassan", "mobile": "+9607771234" },
  "method": "pickup",
  "location": { },
  "terms_accepted": true
}
```

`method` and `location` shapes (from checkout.js):

**`pickup`**
```json
{ "store": "Male' Showroom", "day": "Tue · 22 Sep", "note": "" }
```
**`delivery`** (Male' / Hulhumale' / island courier address)
```json
{ "atoll": "K (Kaafu)", "island": "Male'", "house": "Ma. Example", "landmark": "", "note": "", "address": "Ma. Example, Male', K (Kaafu)" }
```
**`boat`** (inter-island cargo/boat)
```json
{
  "boatName": "", "boatContact": "", "boatDeparture": "",
  "customerName": "", "customerContact": "", "address": "",
  "islandName": "", "islandCode": "", "note": ""
}
```

**Server must ignore any prices/totals from the client** and compute:
- `subtotal` = Σ(current price × qty) using the user's account-type pricing
- `gst` = `subtotal - subtotal / 1.08` (informational; prices already include GST)
- `delivery_fee`: `pickup` → 0. `delivery` in Male'/Hulhumale' → 0 ("Complimentary", same day). Any other island / `boat` → `null` = "To be confirmed" by staff (2–4 working days)
- `total` = `subtotal + (delivery_fee ?? 0)`
- Reject with `409 OUT_OF_STOCK` (list the product ids) if any item is `out`.

`201` →
```json
{
  "id": "MZ20260001",
  "status": "placed",
  "placed_at": "2026-09-19T08:30:00Z",
  "items": [ { "product_id": "607CF02001", "name": "CAREFOR AIR FRESHENER GEL 180 GRAM.- COFFEE, (1 X 24) CTN", "pack": "Carton", "unit": "1 x 24", "price": 1180, "qty": 2 } ],
  "subtotal": 2360, "gst": 174.81, "delivery_fee": 0, "total": 2360,
  "currency": "MVR",
  "method": "pickup", "location": { },
  "customer": { "name": "Ali Hassan", "mobile": "+9607771234" },
  "payment_slip_url": null
}
```
Order id format used by the UI: `MZ` + year + 4-digit sequence (`MZ20260001`). It must be unique and generated server-side (the current client-side counter breaks with multiple devices).

### `GET /orders?page=1&limit=10`
Current user's orders, newest first (UI page size = 10). Same object as above plus `cancelled_at`.

### `GET /orders/{id}`
Owner only (or admin).

### `POST /orders/{id}/cancel`
- Allowed **only while status = `placed`** (the UI only shows Cancel then; Terms §4).
- `409 CANNOT_CANCEL` otherwise.
- If payment was already sent, refunds are **manual** (not automatic) — see Terms §4. Suggest adding `refund_status: none|pending|refunded`.

### Order status (server-controlled)
`placed → processing → delivery → delivered` (+ `cancelled`).
Labels in UI: Order Placed / Processing / Out for Delivery / Delivered.
Status is changed only by staff/admin (see admin section) after verifying the payment slip against the amount received (Terms §3). The frontend currently fakes this with a timer; it must read `status` from the API.

---

## 6. Notifications (order status)

The frontend already has a service worker (`sw.js`) that shows OS notifications and currently fires them by comparing status locally.
- **Phase 1 (simple):** frontend polls `GET /orders` every 30–60 s and fires the notification when `status` changed. No extra backend work.
- **Phase 2:** Web Push. `POST /me/push-subscription` (store the `PushSubscription` JSON), server sends a push on every status change.

---

## 7. Admin / staff endpoints (not used by this frontend, but required to run the shop)

The customer site cannot work without a way for staff to operate it. Minimum:
- `GET /admin/orders?status=placed` — list orders + payment slip URL (signed, private)
- `PATCH /admin/orders/{id}` — `{ "status": "processing|delivery|delivered", "delivery_fee": 150 }` (sets the fee for island/boat orders)
- `POST/PATCH /admin/products` — create/update products, price per account type, stock
- Admin role must be separate from customers. **Never** expose the admin/service key to the browser.

---

## 8. Security requirements (please treat as mandatory)

1. Prices, totals, delivery fee and stock are decided **only** on the server.
2. OTP generated, stored (hashed, with expiry) and verified only on the server; rate-limited.
3. Users can only read/cancel **their own** orders (if Supabase: Row Level Security on every table).
4. Payment slips go in a **private** bucket; only the owner and staff can access them via signed URLs. Validate file type and size (5 MB) on the server, not just in the UI.
5. Enable CORS only for the real site domain.
6. Only the publishable/anon key belongs in the frontend. The `service_role` key stays on the server.

---

## 9. Suggested data model

```
users(id, mobile UNIQUE, name, email, account_type, business_type, business_name, gst_tin,
      atoll, city, notifications_enabled, created_at)
categories(id, name, sort_order)
products(id, name, category_id, pack, unit, price_business, price_residence, stock, image_url, active)
orders(id, user_id, status, method, location JSONB, customer_name, customer_mobile, currency,
       subtotal, gst, delivery_fee NULL, total, payment_slip_path, refund_status,
       placed_at, cancelled_at)
order_items(order_id, product_id, name, pack, unit, price, qty)   -- snapshot price at purchase time
```

## 10. Open questions for the shop owner
- Does Business vs Residence pricing really differ? (Terms/Privacy say yes, the current UI shows a single price.)
- Which SMS provider will send the OTP for Maldives numbers (Dhiraagu / Ooredoo gateway or an international provider)?
- Who sets the delivery fee for island/boat orders, and how does the customer get notified?
- Real bank account numbers and QR code are placeholders in `checkout.html`; should they come from `/config`?
