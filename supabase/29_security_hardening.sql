-- ============================================================
-- MAZI — 29_security_hardening.sql
-- Run in: Supabase Dashboard -> SQL Editor (safe to re-run)
-- Run AFTER 01 ... 28. Walang binabago sa data at walang
-- masisira sa kasalukuyang app flow.
--
--  1. profiles.email hindi na mababago ng customer (spoofing fix)
--  2. Mga bagong function ay hindi na auto-callable ng anon
--  3. Isara ang anon sa lahat ng admin_* / order functions
--  4. Isang payment slip = isang order lang (anti-fraud)
--
-- Ang mga CHECK queries ay nasa pinakababa — patakbuhin ang bawat isa
-- nang hiwalay (ang SQL Editor ay isang result lang ang ipinapakita).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Huwag hayaang palitan ng user ang sarili niyang profiles.email
--
-- Bakit: ang 22/23 migrations at ang README step 5 ay nagha-hanap
-- ng account gamit ang `profiles.email`. Dahil ang column na ito ay
-- editable ng kahit sinong naka-login (01/08 grants), puwedeng ilagay
-- ng attacker ang email ng staff sa profile niya at makasama sa
-- "update ... where email = ..." — kasama ang is_admin = true.
--
-- Trigger (hindi column revoke) ang ginamit para hindi mag-error ang
-- Personal Details form: tahimik lang na hindi napapalitan ang email.
-- Ang SQL Editor / service role (auth.uid() = null) ay puwede pa ring
-- mag-edit, at ang unang pag-fill ng email (null -> value) ay pinapayagan.
-- ------------------------------------------------------------
create or replace function public.profiles_lock_email()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.email is not null
     and new.email is distinct from old.email
     and auth.uid() is not null then
    new.email := old.email;
  end if;
  return new;
end $$;

drop trigger if exists profiles_lock_email_trg on public.profiles;
create trigger profiles_lock_email_trg
  before update on public.profiles
  for each row execute function public.profiles_lock_email();

-- ------------------------------------------------------------
-- 2. Mga bagong function: walang auto-execute para sa anon/authenticated
--
-- Sa Supabase, ang bawat bagong function sa `public` ay awtomatikong
-- nagkakaroon ng EXECUTE para sa anon at authenticated. Baligtarin ito
-- para ang bawat bagong function ay kailangang i-`grant` nang tahasan
-- (tulad na ng ginagawa ng mga migration files mo).
-- ------------------------------------------------------------
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Isara ang anon sa mga function na para lang sa naka-login
--
-- Lahat ng ito ay may sariling permission check sa loob, kaya ito ay
-- "second lock" lang — hindi na makakatawag ang hindi naka-login.
-- Ang list_products, is_admin, is_business_pricing, cfg ay hindi
-- ginagalaw (kailangan ng anon/RLS ang mga iyon).
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%'
           or p.proname in ('create_order', 'cancel_order', 'delete_my_account',
                            'update_my_shop', 'shops_is_admin',
                            'ensure_profile', 'claim_admin_signup'))
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. Isang payment slip = isang order lang
--
-- Ngayon, puwedeng gamitin ng isang customer ang iisang slip sa
-- maraming order (ang create_order ay tumitingin lang na existing at
-- kanya ang file). Ang unique index ay magpapabalik ng error kapag
-- inulit ang slip. Kung may duplicate na sa mga lumang order, lalaktawan
-- ito (may NOTICE) para walang masira.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.orders
             group by payment_slip_path having count(*) > 1) then
    raise notice 'May duplicate payment_slip_path sa orders — nilaktawan ang unique index. Suriin muna (CHECK e).';
  else
    create unique index if not exists orders_payment_slip_unique
      on public.orders (payment_slip_path);
  end if;
end $$;


-- ============================================================
-- CHECKS — patakbuhin ang bawat isa nang hiwalay
-- ============================================================

-- a) Sino ang staff/admin ngayon? Dapat mga kilala mo lang.
-- select p.id, u.email as login_email, p.email as profile_email,
--        p.is_admin, p.is_super_admin, p.signup_source, p.created_at
-- from public.profiles p left join auth.users u on u.id = p.id
-- where p.is_admin or p.is_super_admin
-- order by p.created_at;

-- b) May profile bang iba ang email sa totoong login email? (dapat walang lumabas)
-- select p.id, u.email as login_email, p.email as profile_email
-- from public.profiles p join auth.users u on u.id = p.id
-- where p.email is distinct from u.email;

-- c) Ayusin ang (b) — ibalik sa totoong login email
-- update public.profiles p set email = u.email
-- from auth.users u
-- where u.id = p.id and p.email is distinct from u.email;

-- d) Anong mga function ang puwedeng tawagan ng anon? (dapat list_products,
--    is_admin, is_business_pricing, is_super_admin, cfg lang)
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
-- order by p.proname;

-- e) May duplicate bang slip sa orders?
-- select payment_slip_path, count(*) as n, array_agg(id) as orders
-- from public.orders group by payment_slip_path having count(*) > 1;

-- ------------------------------------------------------------
-- PARA SA HINAHARAP: kapag gagawa ng admin, gamitin ang auth.users,
-- HINDI profiles.email:
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where lower(email) = lower('email-mo@example.com'));
-- ------------------------------------------------------------
