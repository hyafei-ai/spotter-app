-- Payments and Grow: owner-only billing settings, public page via RPC only, lead capture,
-- session-pack check-ins, and the Stripe webhook mirror (stripe_apply_event).
\set ON_ERROR_STOP 1

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- ---------- owner A sets up plans, a coupon and a page ----------
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
insert into plans (id, tenant_id, name, kind, price_cents, currency, trial_days) values
  ('a0000000-0000-7000-8000-000000000501', 'a0000000-0000-7000-8000-000000000000', 'Online coaching', 'monthly', 16000, 'usd', 7);
insert into plans (id, tenant_id, name, kind, price_cents, currency, sessions) values
  ('a0000000-0000-7000-8000-000000000502', 'a0000000-0000-7000-8000-000000000000', 'Hybrid · 8 sessions', 'session_pack', 64000, 'usd', 8);
insert into coupons (tenant_id, code, percent_off) values ('a0000000-0000-7000-8000-000000000000', 'NEWYEAR', 20);
insert into landing_pages (tenant_id, blocks, published) values
  ('a0000000-0000-7000-8000-000000000000', '[{"id":"hero","type":"hero","heading":"Strength coaching","subheading":"","ctaLabel":"See plans"}]', false);
select pg_temp.check((select count(*) from plans) = 2, 'owner creates plans');

do $$ begin
  insert into plans (tenant_id, name, kind, price_cents, currency, trial_days, sessions)
  values ('a0000000-0000-7000-8000-000000000000', 'Pack with trial', 'session_pack', 10000, 'usd', 7, 4);
  raise exception 'FAILED: trial on a session pack';
exception when check_violation then raise notice 'ok - trials only on recurring plans';
end $$;

-- ---------- anon: nothing until the page is published, and then only via the RPC ----------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.check(public.public_landing_page('tenant-a') is null, 'unpublished page is not public');
select pg_temp.check((select count(*) from landing_pages) = 0 and (select count(*) from plans) = 0, 'anon cannot read tables directly');
do $$ begin
  perform public.submit_lead('tenant-a', 'Alex', 'alex@example.com', 'Hi');
  raise exception 'FAILED: lead accepted on an unpublished page';
exception when no_data_found then raise notice 'ok - no leads on an unpublished page';
end $$;

reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
update landing_pages set published = true where tenant_id = 'a0000000-0000-7000-8000-000000000000';

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.check((public.public_landing_page('tenant-a') -> 'blocks' -> 0 ->> 'heading') = 'Strength coaching', 'published page is public');
select pg_temp.check(jsonb_array_length(public.public_landing_page('tenant-a') -> 'plans') = 2, 'public page lists active plans');
select pg_temp.check(public.public_landing_page('tenant-a')::text not like '%NEWYEAR%', 'coupons never appear on the public page');
select pg_temp.check(public.submit_lead('tenant-a', 'Alex Moreno', 'alex@example.com', 'Dumbbells only?') is not null, 'visitor can send the lead form');
select public.submit_lead('tenant-a', 'Alex Moreno', 'alex@example.com', 'again');
select public.submit_lead('tenant-a', 'Alex Moreno', 'alex@example.com', 'again');
do $$ begin
  perform public.submit_lead('tenant-a', 'Alex Moreno', 'ALEX@example.com', 'spam');
  raise exception 'FAILED: lead form not rate limited';
exception when program_limit_exceeded then raise notice 'ok - lead form is rate limited per email';
end $$;
select pg_temp.check((select count(*) from leads) = 0, 'anon cannot read leads');
do $$ begin
  perform public.stripe_apply_event('{"id":"evt_x","type":"account.updated","data":{"object":{}}}'::jsonb, 0);
  raise exception 'FAILED: anon called the webhook mirror';
exception when insufficient_privilege then raise notice 'ok - only the service role can apply Stripe events';
end $$;

-- ---------- assistant and client: no billing access ----------
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from leads) = 0 and (select count(*) from coupons) = 0, 'assistant cannot see leads or coupons');
do $$ begin
  update plans set price_cents = 100;
  if found then raise exception 'FAILED: assistant changed prices'; end if;
  raise notice 'ok - assistant cannot change prices';
end $$;

reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from plans) = 2, 'client can read plan names');
select pg_temp.check((select count(*) from coupons) = 0 and (select count(*) from leads) = 0, 'client cannot see coupons or leads');
select pg_temp.check(public.my_referral_code('a0000000-0000-7000-8000-000000000000') ~ '^CLIENT-[A-Z2-9]{4}$', 'client gets a referral code from their first name');
select pg_temp.check(public.my_referral_code('a0000000-0000-7000-8000-000000000000') = (select code from referrals), 'referral code is stable');

-- ---------- Stripe webhook mirror (service role) ----------
reset role;
set role service_role;
select pg_temp.check(public.stripe_apply_event($j${"id":"evt_1","type":"customer.subscription.created","data":{"object":{
  "id":"sub_1","status":"trialing","customer":"cus_1","currency":"usd","start_date":1792540800,"trial_end":1793145600,"current_period_end":1793145600,
  "items":{"data":[{"price":{"unit_amount":16000}}]},
  "metadata":{"tenant_id":"a0000000-0000-7000-8000-000000000000","client_id":"a0000000-0000-7000-8000-0000000000c1","plan_id":"a0000000-0000-7000-8000-000000000501"}}}}$j$::jsonb, 300) = 'subscription', 'subscription created from webhook');
select pg_temp.check(public.stripe_apply_event($j${"id":"evt_1","type":"customer.subscription.created","data":{"object":{}}}$j$::jsonb) = 'duplicate', 'webhook events apply once');

select public.stripe_apply_event($j${"id":"evt_2","type":"invoice.payment_failed","data":{"object":{
  "id":"in_1","subscription":"sub_1","amount_due":16000,"currency":"usd","attempt_count":1}}}$j$::jsonb, 300);
select public.stripe_apply_event($j${"id":"evt_3","type":"invoice.payment_failed","data":{"object":{
  "id":"in_1","subscription":"sub_1","amount_due":16000,"currency":"usd","attempt_count":2}}}$j$::jsonb, 300);
select pg_temp.check((select count(*) from triage_items where reason_code = 'payment_failed' and handled_at is null
                       and client_id = 'a0000000-0000-7000-8000-0000000000c1') = 1, 'failed payment flags the coach once, not per retry');

select public.stripe_apply_event($j${"id":"evt_4","type":"invoice.paid","data":{"object":{
  "id":"in_1","subscription":"sub_1","amount_paid":16000,"currency":"usd"}}}$j$::jsonb, 300);
select pg_temp.check((select status from payments where stripe_ref = 'in_1') = 'succeeded', 'a later success updates the same payment');
select pg_temp.check((select application_fee_cents from payments where stripe_ref = 'in_1') = 480, 'platform fee recorded in basis points');
select pg_temp.check(not exists (select 1 from triage_items where reason_code = 'payment_failed' and handled_at is null
                       and client_id = 'a0000000-0000-7000-8000-0000000000c1'), 'successful payment clears the flag');

-- Session pack bought on the web.
select public.stripe_apply_event($j${"id":"evt_5","type":"checkout.session.completed","data":{"object":{
  "id":"cs_1","mode":"payment","amount_total":51200,"currency":"usd","payment_intent":"pi_1","customer_details":{"email":"client@example.com"},
  "metadata":{"tenant_id":"a0000000-0000-7000-8000-000000000000","client_id":"a0000000-0000-7000-8000-0000000000c1",
              "plan_id":"a0000000-0000-7000-8000-000000000502","coupon_code":"NEWYEAR"}}}}$j$::jsonb, 300);
select pg_temp.check((select sessions_total from session_packs) = 8, 'session pack created on purchase');
select pg_temp.check((select redemptions from coupons where code = 'NEWYEAR') = 1, 'coupon redemption counted');

select public.stripe_apply_event($j${"id":"evt_6","type":"customer.subscription.deleted","data":{"object":{
  "id":"sub_1","status":"canceled","customer":"cus_1","start_date":1792540800,"canceled_at":1793145600,
  "metadata":{"tenant_id":"a0000000-0000-7000-8000-000000000000","client_id":"a0000000-0000-7000-8000-0000000000c1","plan_id":"a0000000-0000-7000-8000-000000000501"}}}}$j$::jsonb, 300);
select pg_temp.check((select status = 'canceled' and canceled_at is not null from subscriptions where stripe_subscription_id = 'sub_1'), 'cancellation mirrored');

-- ---------- reads after the webhook ----------
reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c2');
select pg_temp.check((select count(*) from payments) = 0 and (select count(*) from subscriptions) = 0, 'a client cannot see another client''s payments');

reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000c1');
select pg_temp.check((select count(*) from payments) = 2, 'client sees their own payments');

reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a2');
select pg_temp.check((select count(*) from payments) = 0, 'assistant cannot see payments');
-- Assistant runs in-person sessions for their assigned client (A1).
select pg_temp.check(public.check_in_session((select id from session_packs)) = 7, 'assistant checks in a session; pack decrements');

reset role;
select pg_temp.as_user('b0000000-0000-7000-8000-0000000000b1');
do $$ begin
  perform public.check_in_session((select id from session_packs limit 1));
  raise exception 'FAILED: another tenant checked in a session';
exception when no_data_found or insufficient_privilege then raise notice 'ok - other trainers cannot touch session packs';
end $$;
select pg_temp.check((select count(*) from leads) = 0 and (select count(*) from plans) = 0, 'owner B sees none of tenant A''s Grow data');

reset role;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
update session_packs set sessions_used = sessions_total;
reset role;
update session_packs set sessions_used = sessions_total;
select pg_temp.as_user('a0000000-0000-7000-8000-0000000000a1');
do $$ begin
  perform public.check_in_session((select id from session_packs));
  raise exception 'FAILED: checked in past the end of a pack';
exception when invalid_parameter_value then raise notice 'ok - an empty pack can''t be checked in';
end $$;
select pg_temp.check((select count(*) from leads) = 3, 'owner sees leads');
reset role;
