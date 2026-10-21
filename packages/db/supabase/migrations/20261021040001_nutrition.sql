-- Native nutrition and habits (C-8). Shapes match packages/core/src/nutrition.ts.
-- foods is a shared cache of public food databases (Open Food Facts, USDA): tenant_id is null for
-- cached public foods (like built-in exercises) and set for a trainer's custom foods.

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null default 'macros' check (mode in ('macros', 'portions', 'off')),
  kcal int check (kcal between 0 and 10000),
  protein_g numeric check (protein_g between 0 and 1000),
  carbs_g numeric check (carbs_g between 0 and 1000),
  fat_g numeric check (fat_g between 0 and 1000),
  portions jsonb,                       -- {"protein": palms, "carbs": cupped hands, "fat": thumbs, "veg": fists}
  set_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_id)
);

create table public.foods (
  id text primary key,                  -- '<source>:<source id>', e.g. 'off:3017620422003', 'usda:2345678'
  tenant_id uuid references public.tenants (id) on delete cascade,
  source text not null check (source in ('off', 'usda', 'custom')),
  name text not null,
  brand text,
  barcode text,
  serving_g numeric check (serving_g > 0),
  kcal_100g numeric not null check (kcal_100g >= 0),
  protein_100g numeric not null check (protein_100g >= 0),
  carbs_100g numeric not null check (carbs_100g >= 0),
  fat_100g numeric not null check (fat_100g >= 0),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.foods (barcode) where barcode is not null;
create index on public.foods using gin (to_tsvector('simple', name || ' ' || coalesce(brand, '')));

create table public.food_logs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id text,                         -- not a foreign key: demo/sample and offline foods may not be cached server-side
  name text not null,
  grams numeric check (grams >= 0),
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  portions jsonb,
  logged_at timestamptz not null,
  deleted_at timestamptz,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.food_logs (client_id, date);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete cascade,  -- null = template
  name text not null,
  days jsonb not null,                  -- {"meals": {"breakfast": [{foodId, name, grams, macros}], ...}}
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  done boolean not null,
  checked_at timestamptz not null,
  client_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, date)
);

do $$
declare t text;
begin
  foreach t in array array['nutrition_targets', 'foods', 'food_logs', 'meal_plans', 'habits', 'habit_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Targets, plans and habits: set by a coach who can see the client; read by that client too.
create policy nutrition_targets_read on public.nutrition_targets for select using (public.can_see_client(tenant_id, client_id));
create policy nutrition_targets_coach on public.nutrition_targets for all
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

create policy meal_plans_read on public.meal_plans for select
  using ((client_id is null and public.is_coach(tenant_id)) or (client_id is not null and public.can_see_client(tenant_id, client_id)));
create policy meal_plans_coach on public.meal_plans for all
  using (public.is_coach(tenant_id) and (client_id is null or public.can_see_client(tenant_id, client_id)))
  with check (public.is_coach(tenant_id) and (client_id is null or public.can_see_client(tenant_id, client_id)));

create policy habits_read on public.habits for select using (public.can_see_client(tenant_id, client_id));
create policy habits_coach on public.habits for all
  using (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id))
  with check (public.is_coach(tenant_id) and public.can_see_client(tenant_id, client_id));

-- Logs: the client writes their own; coaches who can see the client read them.
create policy food_logs_read on public.food_logs for select using (public.can_see_client(tenant_id, client_id));
create policy food_logs_client_insert on public.food_logs for insert with check (client_id = auth.uid() and public.is_member(tenant_id));
create policy food_logs_client_update on public.food_logs for update using (client_id = auth.uid()) with check (client_id = auth.uid());

create policy habit_logs_read on public.habit_logs for select using (public.can_see_client(tenant_id, client_id));
create policy habit_logs_client_insert on public.habit_logs for insert with check (
  client_id = auth.uid()
  and exists (select 1 from public.habits h where h.id = habit_id and h.client_id = auth.uid() and h.tenant_id = habit_logs.tenant_id)
);
create policy habit_logs_client_update on public.habit_logs for update using (client_id = auth.uid()) with check (client_id = auth.uid());

-- Food cache: any signed-in user can read public foods; tenant custom foods are tenant-only.
-- Writes to the public cache come only from the food-search Edge Function (service role).
create policy foods_read on public.foods for select
  using (auth.uid() is not null and (tenant_id is null or public.is_member(tenant_id)));
create policy foods_custom_write on public.foods for all
  using (tenant_id is not null and public.is_coach(tenant_id))
  with check (tenant_id is not null and source = 'custom' and public.is_coach(tenant_id));

-- Offline mutations from the client app (see 20261021000001_sync_dispatch.sql).
create or replace function public.sync_handle_nutrition(kind text, p jsonb, uid uuid, mid uuid, client_ip inet)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tenant uuid;
begin
  case kind
    when 'food.log' then
      select m.tenant_id into tenant from memberships m
       where m.profile_id = uid and m.role = 'client' and m.status in ('active', 'paused')
       order by m.created_at desc limit 1;
      if tenant is null then
        raise exception 'You’re not a client of a coach on Spotter.' using errcode = '42501';
      end if;
      insert into food_logs (id, tenant_id, client_id, date, meal, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, portions, logged_at, client_mutation_id)
      values ((p ->> 'logId')::uuid, tenant, uid, (p ->> 'date')::date, p ->> 'meal', p ->> 'foodId', p ->> 'name',
              (p ->> 'grams')::numeric, (p ->> 'kcal')::numeric, (p ->> 'proteinG')::numeric, (p ->> 'carbsG')::numeric,
              (p ->> 'fatG')::numeric, p -> 'portions', (p ->> 'loggedAt')::timestamptz, mid)
      on conflict (id) do nothing;
      return tenant;

    when 'food.delete' then
      update food_logs set deleted_at = (p ->> 'deletedAt')::timestamptz
       where id = (p ->> 'logId')::uuid and client_id = uid
      returning tenant_id into tenant;
      if tenant is null then
        raise exception 'That food entry isn’t on your log any more.' using errcode = 'P0002';
      end if;
      return tenant;

    when 'habit.check' then
      select h.tenant_id into tenant from habits h where h.id = (p ->> 'habitId')::uuid and h.client_id = uid;
      if tenant is null then
        raise exception 'This habit was removed by your coach.' using errcode = 'P0002';
      end if;
      insert into habit_logs (tenant_id, client_id, habit_id, date, done, checked_at, client_mutation_id)
      values (tenant, uid, (p ->> 'habitId')::uuid, (p ->> 'date')::date, (p ->> 'done')::boolean, (p ->> 'checkedAt')::timestamptz, mid)
      on conflict (habit_id, date) do update
        set done = excluded.done, checked_at = excluded.checked_at, client_mutation_id = excluded.client_mutation_id
        where habit_logs.checked_at <= excluded.checked_at;
      return tenant;

    else
      return null;
  end case;
end $$;
