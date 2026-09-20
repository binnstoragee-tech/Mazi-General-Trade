# MAZI General Trade — Project Guide

Supabase ang backend. **Walang server na kailangang i-host.** Ang website (static files) ay direktang kumakausap sa Supabase gamit ang `api.js`.

```
mazi/
├── index.html · checkout.html · privacy.html · terms.html · admin.html   ← mga page
├── style.css
├── script.js  checkout.js  api.js  admin.js  supabase.js  supabase-config.js  …
├── sw.js · manifest.json · .htaccess · .nojekyll
├── 01_schema.sql   ← tables, security (RLS), order functions, slip bucket
├── 02_seed.sql     ← produkto, categories, config
├── 03–06 *.sql     ← mga ayos sa auth (patakbuhin lang kung kailangan)
├── 07_orders_check_and_admin.sql   ← go-live checklist + gawing admin ang account mo
├── 08_add_profile_last_name_dob.sql
├── confirm-signup-email.html       ← email template para sa Supabase
├── checkout_flow.html              ← lumang file
├── MAZI_API_SPEC.md
├── maintenance/
└── img/
```

## A. Supabase setup (isang beses)

1. **SQL Editor** → i-paste at **Run**: `01_schema.sql`, tapos `02_seed.sql` (ang seed ay nire-reset ang presyo/stock kapag inulit).
2. Patakbuhin ang `06_ensure_profile.sql` (kailangan ito ng login). Kung may "Database error" sa login/signup, patakbuhin din ang iba pang `03`–`06` na SQL file ayon sa numero (isa lang sa dalawang `04_*`, ang mas bago).
3. I-run ang **`07_orders_check_and_admin.sql`**. Bubuksan nito ang Realtime para sa orders at magpapakita ng checklist. Dapat `true` ang lahat maliban sa "at least one admin account" (gagawin sa hakbang 5).
4. **Authentication → Providers → Email**: naka-enable. Ang confirmation email ay dumadaan sa Supabase (limitado kada oras). Para sa totoong customers, mag-set up ng sariling SMTP (hal. Resend) sa **Authentication → SMTP**.
5. Mag-sign up sa website gamit ang email ng staff, i-confirm, tapos sa SQL Editor:
   ```sql
   update public.profiles set is_admin = true where email = 'email-mo@example.com';
   ```
6. `supabase-config.js` ay dapat may tamang URL at *publishable* key ng project mo (huwag kailanman ilagay ang secret/service_role key).

## B. Paano na gumagana ang order (hindi na demo)

1. Customer: **Place Your Order** → ina-upload ang payment slip sa private bucket `payment-slips` → `create_order` (server ang bumubuo ng presyo, GST, total) → may totoong order number (`MZ2026xxxx`).
2. Staff: buksan ang **`/admin`** (`admin.html`) → makikita ang bagong order (may tunog at toast), ang slip, at ang detalye ng customer.
3. Staff ang nagpapalit ng status: **Start processing → Send out for delivery → Mark delivered**. Sa isla/boat, ilagay ang **delivery fee** (nagre-recompute ang total).
4. Customer: ang tracker at ang notification (popup at device notification) ay sumusunod sa **totoong status** sa database, sa pamamagitan ng Realtime, at may 30-segundong polling bilang backup. Wala nang timer.
5. Cancel: ang customer ay puwedeng mag-cancel hanggang `placed` lang. Ang staff ay puwedeng mag-cancel anumang oras. Nagiging **Refund: pending** ito, at i-click ang **Mark refunded** kapag naibalik mo na ang bayad.

> Ang mga lumang "order" na naka-save lang sa browser ng customer (mula sa demo) ay awtomatikong binubura, dahil hindi naman sila nakarating sa shop.

## C. Mga patakaran na ipinapatupad ng server

- **Presyo, GST, delivery fee, at total ay kinukuwenta ng server.** Binabalewala nito ang anumang presyong ipinadala ng browser.
- Delivery fee: pickup = 0, delivery sa Male'/Hulhumale' = 0, ibang isla o boat = "To be confirmed" (staff ang maglalagay).
- Hindi puwedeng umorder ng `out` na stock o ng inactive/walang produkto.
- Kailangan ng payment slip (JPG/PNG/PDF, max 5 MB) na na-upload ng mismong user.
- Limit na 10 order kada oras kada user.
- Ang user ay makakabasa lang ng sarili niyang orders; hindi siya makakapag-insert/update/delete nang direkta, at hindi niya mapapalitan ang `is_admin`.
- Pag-set ng presyo sa isang produkto: `update public.products set price = 1234, active = true where id = '<code>';` — **kailangan ding tumugma ang presyo at ang `PRODUCTS` list sa `script.js` at `checkout.js`** (ang server ang masusunod sa total, pero dapat pareho ang ipinapakita sa customer).

## D. Bago tumanggap ng totoong customer — test checklist

1. Mag-sign up bilang customer → umorder (pickup) na may slip → dapat lumabas sa `/admin`.
2. I-click ang **Start processing** → dapat magbago ang tracker ng customer nang hindi nire-refresh.
3. Umorder sa ibang isla → maglagay ng delivery fee sa admin → dapat magbago ang total sa customer.
4. Mag-cancel bilang customer, at mag-cancel din bilang staff → dapat lumabas ang "refund is being processed".
5. Subukan ang parehong flow sa phone (PWA) at may naka-on na notifications.
6. Sa **Storage → payment-slips**, tiyaking hindi public ang bucket.

## E. Mga limitasyon na dapat mong malaman

- Ang staff pa rin ang mano-manong nagbe-verify kung talagang pumasok ang bayad (tingnan ang slip sa bank mo). Wala pang awtomatikong payment gateway.
- Nababasa ng kahit sino ang `products` table, kasama ang `price` at `residence_price`.
- Hindi nabubura ang mga lumang slip kapag na-delete ang account (itinatago para sa accounting).
- Ang USD ay display lang (`mvr_per_usd` = 15.42); MVR ang totoong halagang sine-save.
- Ang `/admin` page ay hindi nakatago, pero walang makikita o magagawa ang hindi staff dahil ang database (RLS at ang admin functions) ang nagba-block.
