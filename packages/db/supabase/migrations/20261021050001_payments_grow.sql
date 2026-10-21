-- Payments and client acquisition (K-6, K-7, C-11).
-- Stripe Connect Express: the trainer is merchant of record; Spotter takes an application fee.
-- Stripe is the source of truth for money; these tables mirror it via webhooks (stripe_apply_event).
-- Money is integer minor units (cents).

alter table public.tenants
  add column stripe_charges_enabled boolean not null default false,
  add column currency text not null default 'usd' check (currency in ('usd', 'gbp', 'eur', 'cad', 'aud'));

-- ---------- catalogue ----------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  kind text not null check (kind in ('monthly', 'weekly', 'pay_in_full', 'session_pack')),
  price_cents int not null check (price_cents >= 50),
  currency text not null check (currency in ('usd', 'gbp', 'eur', 'cad', 'aud')),
  duration_weeks int check (duration_weeks between 1 and 104),
  sessions int check (sessions between 1 and 200),
  trial_days int not null default 0 check (trial_days between 0 and 60),
  active boolean not null default true,
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'pay_in_full' or duration_weeks is not null),
  check (kind <> 'session_pack' or sessions is not null),
  -- Trials only make sense on recurring plans.
  check (trial_days = 0 or kind in ('monthly', 'weekly'))
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9-]{3,24}$'),
  percent_off int check (percent_off between 1 and 100),
  amount_off_cents int check (amount_off_cents >= 1),
  duration_months int check (duration_months between 1 and 24),
  expires_at timestamptz,
  max_redemptions int check (max_redemptions >= 1),
  redemptions int not null default 0,
  stripe_coupon_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  check ((percent_off is null) <> (amount_off_cents is null))
);

create table public.storefront_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '',
  price_cents int not null check (price_cents >= 50),
  currency text not null,
  active boolean not null default true,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 20),
  published boolean not null default false,
  published_at timestamptz,
  custom_domain text unique check (custom_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_programs (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  enabled boolean not null default false,
  reward jsonb not null default '{"kind":"free_weeks","value":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z]{1,8}-[A-Z0-9]{4}$'),
  uses int not null default 0,
  rewards_granted int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, referrer_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text not null default '' check (char_length(message) <= 2000),
  source text not null default 'landing_page',
  referral_code text,
  status text not null default 'new' check (status in ('new', 'contacted', 'trial', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.leads (tenant_id, created_at desc);

-- ---------- money (mirrors Stripe; written only by stripe_apply_event) ----------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  buyer_email text,
  plan_id uuid references public.plans (id) on delete set null,
  plan_kind text not null,
  price_cents int not null,
  discount_cents int not null default 0,
  currency text not null,
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired')),
  stripe_subscription_id text not null unique,
  stripe_customer_id text,
  started_at timestamptz not null,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (tenant_id, status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  buyer_email text,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  plan_id uuid references public.plans (id) on delete set null,
  storefront_product_id uuid references public.storefront_products (id) on delete set null,
  amount_cents int not null,
  application_fee_cents int not null default 0,
  currency text not null,
  status text not null check (status in ('succeeded', 'failed', 'refunded')),
  failure_message text,
  stripe_ref text not null unique,          -- invoice or payment intent id
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.payments (tenant_id, created_at desc);

create table public.session_packs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  buyer_email text,
  plan_id uuid references public.plans (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  sessions_total int not null check (sessions_total >= 1),
  sessions_used int not null default 0 check (sessions_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sessions_used <= sessions_total)
);

create table public.session_pack_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pack_id uuid not null references public.session_packs (id) on delete cascade,
  checked_in_by uuid not null references public.profiles (id),
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Webhook idempotency: each Stripe event is applied once.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['plans','coupons','storefront_products','landing_pages','referral_programs','referrals','leads',
    'subscriptions','payments','session_packs','session_pack_checkins']
  loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  alter table public.stripe_events enable row level security;
end $$;

-- ---------- RLS ----------

-- Catalogue: members read (clients see their plan name); only the owner changes it.
create policy plans_read on public.plans for select using (public.is_member(tenant_id));
create policy plans_owner on public.plans for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));
create policy storefront_read on public.storefront_products for select using (public.is_member(tenant_id));
create policy storefront_owner on public.storefront_products for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));

-- Billing settings are owner-only (assistants have no billing access).
create policy coupons_owner on public.coupons for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));
create policy landing_owner on public.landing_pages for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));
create policy referral_programs_read on public.referral_programs for select using (public.is_member(tenant_id));
create policy referral_programs_owner on public.referral_programs for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));
create policy leads_owner on public.leads for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));

-- Money: the client sees their own; the owner sees the tenant's. Nobody writes from the apps.
create policy subscriptions_read on public.subscriptions for select using (client_id = auth.uid() or public.is_owner(tenant_id));
create policy payments_read on public.payments for select using (client_id = auth.uid() or public.is_owner(tenant_id));

-- Session packs: coaches who can see the client (in-person sessions are often run by assistants).
create policy session_packs_read on public.session_packs for select using (
  public.is_owner(tenant_id) or (client_id is not null and public.can_see_client(tenant_id, client_id))
);
create policy session_pack_checkins_read on public.session_pack_checkins for select using (public.is_coach(tenant_id));

create policy referrals_read on public.referrals for select using (referrer_id = auth.uid() or public.is_owner(tenant_id));

-- ---------- RPCs ----------

-- Public, read-only view of a trainer's published page for the website (anon).
create or replace function public.public_landing_page(slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenant', jsonb_build_object('slug', t.slug, 'appName', t.app_name, 'brandColor', t.brand_color, 'coach', t.coach_profile,
                                 'chargesEnabled', t.stripe_charges_enabled),
    'blocks', lp.blocks,
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'kind', p.kind,
                        'priceCents', p.price_cents, 'currency', p.currency, 'durationWeeks', p.duration_weeks, 'sessions', p.sessions,
                        'trialDays', p.trial_days, 'active', p.active) order by p.price_cents)
                       from plans p where p.tenant_id = t.id and p.active), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description,
                        'priceCents', s.price_cents, 'currency', s.currency) order by s.price_cents)
                       from storefront_products s where s.tenant_id = t.id and s.active), '[]'::jsonb)
  )
  from tenants t join landing_pages lp on lp.tenant_id = t.id
  where (t.slug = public_landing_page.slug or lp.custom_domain = public_landing_page.slug) and lp.published
$$;
revoke all on function public.public_landing_page(text) from public;
grant execute on function public.public_landing_page(text) to anon, authenticated;

-- Lead form on the public page. Only for published pages; at most 3 per email per tenant per hour.
create or replace function public.submit_lead(slug text, name text, email text, message text default '',
                                              source text default 'landing_page', referral_code text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  new_id uuid;
begin
  select lp.tenant_id into t from landing_pages lp join tenants tt on tt.id = lp.tenant_id
   where (tt.slug = submit_lead.slug or lp.custom_domain = submit_lead.slug) and lp.published;
  if t is null then
    raise exception 'This page isn’t taking enquiries.' using errcode = 'P0002';
  end if;
  if (select count(*) from leads l where l.tenant_id = t and lower(l.email) = lower(submit_lead.email)
        and l.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Thanks, we already have your message.' using errcode = '54000';
  end if;
  insert into leads (tenant_id, name, email, message, source, referral_code)
  values (t, trim(submit_lead.name), trim(submit_lead.email), coalesce(trim(submit_lead.message), ''), coalesce(submit_lead.source, 'landing_page'),
          nullif(trim(submit_lead.referral_code), ''))
  returning leads.id into new_id;
  if submit_lead.referral_code is not null then
    update referrals set uses = uses + 1 where referrals.code = upper(trim(submit_lead.referral_code)) and referrals.tenant_id = t;
  end if;
  return new_id;
end $$;
revoke all on function public.submit_lead(text, text, text, text, text, text) from public;
grant execute on function public.submit_lead(text, text, text, text, text, text) to anon, authenticated;

-- The signed-in client's referral code, created on first use.
create or replace function public.my_referral_code(t uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
  first text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  tail text;
begin
  if not public.has_role(t, array['client']::public.member_role[]) then
    raise exception 'Only clients have referral links.' using errcode = '42501';
  end if;
  select r.code into c from referrals r where r.tenant_id = t and r.referrer_id = auth.uid();
  if c is not null then return c; end if;
  select upper(left(regexp_replace(split_part(coalesce(p.full_name, ''), ' ', 1), '[^A-Za-z]', '', 'g'), 8)) into first
    from profiles p where p.id = auth.uid();
  if coalesce(first, '') = '' then first := 'FRIEND'; end if;
  loop
    tail := '';
    for i in 1..4 loop
      tail := tail || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    c := first || '-' || tail;
    exit when not exists (select 1 from referrals where code = c);
  end loop;
  insert into referrals (tenant_id, referrer_id, code) values (t, auth.uid(), c);
  return c;
end $$;
grant execute on function public.my_referral_code(uuid) to authenticated;

-- In-person check-in decrements a session pack (K-7). Coaches who can see the client only.
create or replace function public.check_in_session(pack uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  sp session_packs;
begin
  select * into sp from session_packs where id = pack for update;
  if sp.id is null then
    raise exception 'Session pack not found.' using errcode = 'P0002';
  end if;
  if not (public.is_owner(sp.tenant_id) or (sp.client_id is not null and public.is_coach(sp.tenant_id) and public.can_see_client(sp.tenant_id, sp.client_id))) then
    raise exception 'You can’t check in this client.' using errcode = '42501';
  end if;
  if sp.sessions_used >= sp.sessions_total then
    raise exception 'No sessions left on this pack.' using errcode = '22023';
  end if;
  update session_packs set sessions_used = sessions_used + 1 where id = pack;
  insert into session_pack_checkins (tenant_id, pack_id, checked_in_by) values (sp.tenant_id, pack, auth.uid());
  return sp.sessions_total - sp.sessions_used - 1;
end $$;
grant execute on function public.check_in_session(uuid) to authenticated;

-- ---------- Stripe webhook → mirror tables ----------
-- Called by the webhooks-stripe Edge Function (service role) after it verifies the signature.
-- Idempotent per event id. Expects the Stripe event JSON; reads only the fields it needs.
-- Checkout and subscription objects carry metadata {tenant_id, client_id?, plan_id?, product_id?, referral_code?}
-- set by the stripe-checkout function.

create or replace function public.stripe_apply_event(event jsonb, fee_bps int default 0) returns text
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := event -> 'data' -> 'object';
  md jsonb := coalesce(event -> 'data' -> 'object' -> 'metadata', '{}'::jsonb);
  t uuid;
  client uuid;
  pl plans;
  sub_id uuid;
  pay_id uuid;
  amount int;
  new_status text;
begin
  if exists (select 1 from stripe_events where id = event ->> 'id') then
    return 'duplicate';
  end if;
  insert into stripe_events (id, type) values (event ->> 'id', event ->> 'type');

  t := nullif(md ->> 'tenant_id', '')::uuid;
  client := nullif(md ->> 'client_id', '')::uuid;

  case event ->> 'type'
    when 'account.updated' then
      update tenants set stripe_charges_enabled = coalesce((o ->> 'charges_enabled')::boolean, false)
       where stripe_account_id = o ->> 'id';
      return 'account';

    when 'checkout.session.completed' then
      if t is null then return 'ignored'; end if;
      if o ->> 'mode' = 'payment' then
        amount := (o ->> 'amount_total')::int;
        insert into payments (tenant_id, client_id, buyer_email, plan_id, storefront_product_id, amount_cents,
                              application_fee_cents, currency, status, stripe_ref, paid_at)
        values (t, client, o -> 'customer_details' ->> 'email', nullif(md ->> 'plan_id', '')::uuid, nullif(md ->> 'product_id', '')::uuid,
                amount, floor(amount * fee_bps / 10000.0)::int, o ->> 'currency', 'succeeded', coalesce(o ->> 'payment_intent', o ->> 'id'), now())
        on conflict (stripe_ref) do nothing
        returning id into pay_id;
        select * into pl from plans where id = nullif(md ->> 'plan_id', '')::uuid;
        if pl.kind = 'session_pack' and pay_id is not null then
          insert into session_packs (tenant_id, client_id, buyer_email, plan_id, payment_id, sessions_total)
          values (t, client, o -> 'customer_details' ->> 'email', pl.id, pay_id, pl.sessions);
        end if;
      end if;
      if nullif(md ->> 'referral_code', '') is not null then
        update referrals set rewards_granted = rewards_granted + 1 where code = upper(md ->> 'referral_code') and tenant_id = t;
      end if;
      if nullif(md ->> 'coupon_code', '') is not null then
        update coupons set redemptions = redemptions + 1 where code = upper(md ->> 'coupon_code') and tenant_id = t;
      end if;
      return 'checkout';

    when 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted' then
      if t is null then return 'ignored'; end if;
      select * into pl from plans where id = nullif(md ->> 'plan_id', '')::uuid;
      new_status := case when event ->> 'type' = 'customer.subscription.deleted' then 'canceled' else o ->> 'status' end;
      insert into subscriptions (tenant_id, client_id, plan_id, plan_kind, price_cents, discount_cents, currency, status,
                                 stripe_subscription_id, stripe_customer_id, started_at, trial_ends_at, current_period_end, canceled_at)
      values (t, client, pl.id, coalesce(pl.kind, 'monthly'),
              coalesce((o -> 'items' -> 'data' -> 0 -> 'price' ->> 'unit_amount')::int, pl.price_cents, 0),
              coalesce((md ->> 'discount_cents')::int, 0),
              coalesce(o ->> 'currency', pl.currency, 'usd'), new_status, o ->> 'id', o ->> 'customer',
              to_timestamp(coalesce((o ->> 'start_date')::bigint, (o ->> 'created')::bigint)),
              to_timestamp((o ->> 'trial_end')::bigint), to_timestamp((o ->> 'current_period_end')::bigint),
              case when new_status = 'canceled' then coalesce(to_timestamp((o ->> 'canceled_at')::bigint), now()) end)
      on conflict (stripe_subscription_id) do update
        set status = excluded.status, trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end,
            canceled_at = excluded.canceled_at, price_cents = excluded.price_cents, discount_cents = excluded.discount_cents;
      return 'subscription';

    when 'invoice.paid', 'invoice.payment_failed' then
      select s.id, s.tenant_id, s.client_id into sub_id, t, client from subscriptions s where s.stripe_subscription_id = o ->> 'subscription';
      if t is null then return 'ignored'; end if;
      amount := coalesce((o ->> 'amount_paid')::int, (o ->> 'amount_due')::int, 0);
      if event ->> 'type' = 'invoice.paid' then
        insert into payments (tenant_id, client_id, subscription_id, amount_cents, application_fee_cents, currency, status, stripe_ref, paid_at)
        values (t, client, sub_id, amount, floor(amount * fee_bps / 10000.0)::int, o ->> 'currency', 'succeeded', o ->> 'id', now())
        on conflict (stripe_ref) do update
          set status = 'succeeded', failure_message = null, paid_at = now(),
              amount_cents = excluded.amount_cents, application_fee_cents = excluded.application_fee_cents;
        -- A successful payment clears the coach's "Payment failed" flag.
        update triage_items set handled_at = now()
         where tenant_id = t and client_id = client and reason_code = 'payment_failed' and handled_at is null;
        return 'paid';
      else
        insert into payments (tenant_id, client_id, subscription_id, amount_cents, currency, status, failure_message, stripe_ref)
        values (t, client, sub_id, (o ->> 'amount_due')::int, o ->> 'currency', 'failed',
                coalesce(o -> 'last_finalization_error' ->> 'message', 'The card was declined.'), o ->> 'id')
        on conflict (stripe_ref) do update set status = 'failed', failure_message = excluded.failure_message;
        if client is not null and not exists (
          select 1 from triage_items where tenant_id = t and client_id = client and reason_code = 'payment_failed' and handled_at is null
        ) then
          insert into triage_items (tenant_id, client_id, reason_code, priority, detail)
          values (t, client, 'payment_failed', 90, jsonb_build_object('invoice', o ->> 'id', 'attempt', o ->> 'attempt_count'));
        end if;
        return 'failed';
      end if;

    else
      return 'ignored';
  end case;
end $$;
revoke all on function public.stripe_apply_event(jsonb, int) from public, anon, authenticated;
