# MAZI General Trade — Project Guide

Supabase ang backend. **Walang server na kailangang i-host.** Ang website (static files) ay direktang kumakausap sa Supabase gamit ang `js/api.js`.

```
mazi/
├── index.html · checkout.html · privacy.html · terms.html   ← mga page ng shop
├── admin.html                     ← STAFF dashboard: Live Orders · Order History · Stock (js/admin.js)
├── sw.js · manifest.json · .htaccess · .nojekyll             ← dapat nasa root
├── css/style.css
├── js/   script.js  checkout.js  api.js  admin.js  supabase.js  supabase-config.js  …
├── supabase/
│   ├── 01_schema.sql   ← tables, security (RLS), order functions, slip bucket
│   ├── 02_seed.sql     ← produkto, categories, config
│   ├── 07_orders_check_and_admin.sql   ← go-live checklist + gawing admin ang account mo
│   ├── 08_stock.sql                    ← STOCK CONTROL (bilang ng stocks, history)
│   ├── fixes/          ← 03–06: mga ayos sa auth (patakbuhin lang kung kailangan)
│   └── email-templates/
├── docs/MAZI_API_SPEC.md
├── archive/            ← mga lumang file
└── img/
```

## A. Supabase setup (isang beses)

1. **SQL Editor** → i-paste at **Run**: `supabase/01_schema.sql`, tapos `supabase/02_seed.sql` (ang seed ay nire-reset ang presyo/stock kapag inulit).
2. Patakbuhin ang `supabase/fixes/06_ensure_profile.sql` (kailangan ito ng login). Kung may "Database error" sa login/signup, patakbuhin din ang iba pa sa `supabase/fixes/` ayon sa numero (isa lang sa dalawang `04_*`, ang mas bago).
3. I-run ang **`supabase/07_orders_check_and_admin.sql`**. Bubuksan nito ang Realtime para sa orders at magpapakita ng checklist. Dapat `true` ang lahat maliban sa "at least one admin account" (gagawin sa hakbang 5).
4. **Authentication → Providers → Email**: naka-enable. Ang confirmation email ay dumadaan sa Supabase (limitado kada oras). Para sa totoong customers, mag-set up ng sariling SMTP (hal. Resend) sa **Authentication → SMTP**.
4b. I-run ang **`supabase/08_stock.sql`** (para sa Stock page). **Huwag nang i-run ulit ang `02_seed.sql` pagkatapos nito**, dahil buburahin nito ang mga stock na inilagay mo.
5. Mag-sign up sa website gamit ang email ng staff, i-confirm, tapos sa SQL Editor:
   ```sql
   update public.profiles set is_admin = true where email = 'email-mo@example.com';
   ```
6. `js/supabase-config.js` ay dapat may tamang URL at *publishable* key ng project mo (huwag kailanman ilagay ang secret/service_role key).

## B. Paano na gumagana ang order (hindi na demo)

1. Customer: **Place Your Order** → ina-upload ang payment slip sa private bucket `payment-slips` → `create_order` (server ang bumubuo ng presyo, GST, total) → may totoong order number (`MZ2026xxxx`).
2. Staff: buksan ang **`/admin`** → **Live Orders**: makikita ang bagong order (may tunog, toast, at bell na may bilang), ang slip, at ang detalye ng customer. I-click ang isang order para sa detalye, o ang ⋮ para sa mabilis na aksyon. Ang **Order History** ay may date filter at **Summary** (benta at best sellers).
3. Staff ang nagpapalit ng status: **Start processing → Send out for delivery → Mark delivered**. Sa isla/boat, ilagay ang **delivery fee** (nagre-recompute ang total).
4. Customer: ang tracker at ang notification (popup at device notification) ay sumusunod sa **totoong status** sa database, sa pamamagitan ng Realtime, at may 30-segundong polling bilang backup. Wala nang timer.
5. Cancel: ang customer ay puwedeng mag-cancel hanggang `placed` lang. Ang staff ay puwedeng mag-cancel anumang oras. Nagiging **Refund: pending** ito, at i-click ang **Mark refunded** kapag naibalik mo na ang bayad.

> Ang mga lumang "order" na naka-save lang sa browser ng customer (mula sa demo) ay awtomatikong binubura, dahil hindi naman sila nakarating sa shop.

## B2. Stock control (`/admin` → Stock)

- Bawat produkto ay may **bilang ng stock** (`stock_qty`). Sa simula ay **"Not tracked"** (walang bilang) hanggang maglagay ka ng numero.
- **+ Add**: idinadagdag ang bagong dating na stock (hal. `24`). **Set total**: pinapalitan ang kabuuang bilang (para sa bilangan o pagtatama).
- Awtomatikong sumusunod ang label sa shop: **0 = Out of stock · 1–5 = Low stock · 6 pataas = In stock**. Nag-a-update ang shop ng customer nang mga isang minuto (o pagbalik nila sa app).
- Bawat order ay **kumukuha sa stock**. Kapag lumampas sa natitira ang inorder, **tinatanggihan ito** ("Not enough stock"). Kapag na-cancel ang order, **ibinabalik** ang stock.
- Ang "Recent stock activity" sa ilalim ng Stock page ang history: Added, Total set, Sold, Returned.
- Ang mga produktong "Not tracked" ay hindi nababawasan at hindi nagbibigay ng "not enough stock" error.

## C. Mga patakaran na ipinapatupad ng server

- **Presyo, GST, delivery fee, at total ay kinukuwenta ng server.** Binabalewala nito ang anumang presyong ipinadala ng browser.
- Delivery fee: pickup = 0, delivery sa Male'/Hulhumale' = 0, ibang isla o boat = "To be confirmed" (staff ang maglalagay).
- Hindi puwedeng umorder ng `out` na stock o ng inactive/walang produkto.
- Kailangan ng payment slip (JPG/PNG/PDF, max 5 MB) na na-upload ng mismong user.
- Limit na 10 order kada oras kada user.
- Ang user ay makakabasa lang ng sarili niyang orders; hindi siya makakapag-insert/update/delete nang direkta, at hindi niya mapapalitan ang `is_admin`.
- Pag-set ng presyo sa isang produkto: `update public.products set price = 1234, active = true where id = '<code>';` — **kailangan ding tumugma ang presyo at ang `PRODUCTS` list sa `js/script.js` at `js/checkout.js`** (ang server ang masusunod sa total, pero dapat pareho ang ipinapakita sa customer).

## D. Bago tumanggap ng totoong customer — test checklist

1. Mag-sign up bilang customer → umorder (pickup) na may slip → dapat lumabas sa `/admin`.
2. I-click ang **Start processing** → dapat magbago ang tracker ng customer nang hindi nire-refresh.
3. Umorder sa ibang isla → maglagay ng delivery fee sa admin → dapat magbago ang total sa customer.
4. Mag-cancel bilang customer, at mag-cancel din bilang staff → dapat lumabas ang "refund is being processed".
5. Subukan ang parehong flow sa phone (PWA) at may naka-on na notifications.
6. Sa **Storage → payment-slips**, tiyaking hindi public ang bucket.
7. Sa Stock: maglagay ng stock sa isang produkto, umorder ng mas marami kaysa sa natitira (dapat tanggihan), at mag-cancel ng order (dapat bumalik ang stock).

## E. Mga limitasyon na dapat mong malaman

- Ang staff pa rin ang mano-manong nagbe-verify kung talagang pumasok ang bayad (tingnan ang slip sa bank mo). Wala pang awtomatikong payment gateway.
- Nababasa ng kahit sino ang `products` table, kasama ang `price` at `residence_price`.
- Hindi nabubura ang mga lumang slip kapag na-delete ang account (itinatago para sa accounting).
- Ang USD ay display lang (`mvr_per_usd` = 15.42); MVR ang totoong halagang sine-save.
- Ang `/admin` page ay hindi nakatago, pero walang makikita o magagawa ang hindi staff dahil ang database (RLS at ang admin functions) ang nagba-block.
