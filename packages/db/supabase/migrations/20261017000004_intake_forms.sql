-- Editable intake forms (C-2). The trainer's questions live in intake_forms.schema
-- ({"questions": [...]}, validated by IntakeForm in packages/core). The PAR-Q block is not stored
-- here: the apps always append it, so it can't be removed by editing the form.

alter table public.intake_forms
  add column version int not null default 1 check (version >= 1),
  add constraint intake_forms_schema_shape check (jsonb_typeof(schema -> 'questions') = 'array'
    and jsonb_array_length(schema -> 'questions') <= 30);

-- One live form per tenant.
create unique index intake_forms_one_default on public.intake_forms (tenant_id) where is_default;

-- Each response records which version of the form it answered.
alter table public.intake_responses add column form_version int;

-- Saving bumps the version so responses stay tied to the questions that were asked.
create or replace function public.bump_intake_form_version() returns trigger
language plpgsql as $$
begin
  if new.schema is distinct from old.schema then
    new.version := old.version + 1;
  end if;
  return new;
end $$;
create trigger bump_intake_form_version before update on public.intake_forms
  for each row execute function public.bump_intake_form_version();
