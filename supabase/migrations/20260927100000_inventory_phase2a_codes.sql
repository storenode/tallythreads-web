-- Inventory Phase 2A — foundations for SKUs (specs/roadmap/inventory.md v2.0.0 §5, §11).
--
--   1. organizations.org_code       short code, prefix of "unallocated" SKUs (BND-UNA-…)
--   2. organizations.label_settings the org's default label print layout (jsonb, app-defined)
--   3. inventory_categories.code    the {CAT} SKU segment (Sarees → SAR)
--   4. inventory.manage permission  org-only inventory actions (catalogue, price, finalize,
--                                   print, retire/reissue); inventory.write is also held by
--                                   store roles, so it can't gate those.
--
-- Category codes must be CONSISTENT ACROSS AN ORG: one category name ↔ one code in every
-- store ("Sarees" is SAR everywhere), so unallocated stock can later bind to whichever store
-- it is dispatched to. Categories are written offline-first from Dexie, so the database —
-- not the client — is the authority: a BEFORE trigger assigns/normalises the code on every
-- insert or rename. That never rejects a sync push (an offline client can't know every other
-- store's codes); it just corrects the row, which flows back to clients on the next pull.
-- Locking a code once a SKU uses it arrives with SKUs themselves (Phase 2C).

-- ── 1–2. organizations ────────────────────────────────────────────────────────────────────
alter table public.organizations
  add column org_code text
    constraint organizations_org_code_format check (org_code ~ '^[A-Z0-9]{2,6}$'),
  add column label_settings jsonb;

comment on column public.organizations.org_code is
  'Short org code (2–6 of A–Z/0–9, e.g. BND). Prefix of unallocated-stock SKUs '
  '({org_code}-UNA-…). Not globally unique: SKUs are only ever resolved within one org.';
comment on column public.organizations.label_settings is
  'Default barcode-label print layout (thermal / A4 / custom), remembered from the last print.';

-- Backfill a suggestion for existing orgs: the prefix their store codes already share
-- (BND-KDP, BND-NLR → BND), else the name's initials (Vasavi Cloth Store → VCS), else the
-- first letters of the name.
with prefixes as (
  select s.organization_id,
         min(upper(split_part(s.store_code, '-', 1))) as p,
         count(distinct upper(split_part(s.store_code, '-', 1))) as n
  from public.stores s
  where s.deleted_at is null and coalesce(trim(s.store_code), '') <> ''
  group by s.organization_id
), suggested as (
  select o.id,
         case
           when pr.n = 1 and pr.p ~ '^[A-Z0-9]{2,6}$' then pr.p
           else left(
             case
               when array_length(regexp_split_to_array(trim(regexp_replace(upper(o.name), '[^A-Z0-9 ]', '', 'g')), '\s+'), 1) >= 2
                 then (select string_agg(left(w, 1), '' order by ord)
                       from unnest(regexp_split_to_array(trim(regexp_replace(upper(o.name), '[^A-Z0-9 ]', '', 'g')), '\s+'))
                            with ordinality as t(w, ord))
               else regexp_replace(upper(o.name), '[^A-Z0-9]', '', 'g')
             end, 6)
         end as code
  from public.organizations o
  left join prefixes pr on pr.organization_id = o.id
)
update public.organizations o
set org_code = s.code
from suggested s
where o.id = s.id and s.code ~ '^[A-Z0-9]{2,6}$';

-- ── 3. inventory_categories.code ──────────────────────────────────────────────────────────

-- The code an org should use for a category name: its existing code if any store in the org
-- already has that name, else the first 3 letters/digits of the name, suffixed 2,3,… if a
-- DIFFERENT name in the org already uses it.
create or replace function public.inventory_category_code_for(
  p_org_id uuid,
  p_name text,
  p_exclude_id uuid default null
) returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_existing text;
  v_base text;
  v_candidate text;
  v_n int := 1;
begin
  select c.code into v_existing
  from inventory_categories c
  where c.organization_id = p_org_id
    and lower(trim(c.name)) = lower(trim(p_name))
    and c.deleted_at is null
    and c.code is not null
    and (p_exclude_id is null or c.id <> p_exclude_id)
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  v_base := left(regexp_replace(upper(p_name), '[^A-Z0-9]', '', 'g'), 3);
  if length(v_base) < 2 then
    v_base := rpad(coalesce(v_base, ''), 2, 'X');
  end if;

  v_candidate := v_base;
  while exists (
    select 1 from inventory_categories c
    where c.organization_id = p_org_id
      and c.code = v_candidate
      and c.deleted_at is null
      and lower(trim(c.name)) <> lower(trim(p_name))
  ) loop
    v_n := v_n + 1;
    v_candidate := v_base || v_n::text;
  end loop;
  return v_candidate;
end;
$$;

comment on function public.inventory_category_code_for(uuid, text, uuid) is
  'The SKU category code an org uses for a category name (org-wide name↔code consistency). '
  'See 20260927100000_inventory_phase2a_codes.sql.';

alter table public.inventory_categories add column code text;

-- Backfill: one pass per org, name by name, so every store gets the same code for a name.
do $$
declare
  r record;
begin
  for r in
    select organization_id, min(name) as name
    from public.inventory_categories
    where deleted_at is null
    group by organization_id, lower(trim(name))
    order by organization_id, min(name)
  loop
    -- last_modified_at bumped so devices that already synced these rows pull the code
    -- (the sync pull is by last_modified_at > watermark).
    update public.inventory_categories
    set code = public.inventory_category_code_for(r.organization_id, r.name),
        last_modified_at = now()
    where organization_id = r.organization_id
      and lower(trim(name)) = lower(trim(r.name))
      and code is null;
  end loop;
  -- Soft-deleted rows keep a (non-authoritative) code too, so NOT NULL holds.
  update public.inventory_categories
  set code = left(regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') || 'XX', 3),
      last_modified_at = now()
  where code is null;
end $$;

-- Assigns/normalises the code on insert, on rename, or when a code is supplied.
--   insert / rename → the org's code for that name (existing, else generated); a supplied code
--                     is kept only if valid and not used by a different name in the org.
--   code-only edit  → kept if valid and not used by a different name in the org (an org-wide
--                     recode updates every store's row for that name in one statement).
create or replace function public.inventory_categories_assign_code()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_code text := upper(trim(coalesce(new.code, '')));
  v_valid boolean;
begin
  v_valid := v_code ~ '^[A-Z0-9]{2,6}$' and not exists (
    select 1 from inventory_categories c
    where c.organization_id = new.organization_id
      and c.code = v_code
      and c.deleted_at is null
      and c.id <> new.id
      and lower(trim(c.name)) <> lower(trim(new.name))
  );

  if tg_op = 'UPDATE'
     and lower(trim(new.name)) = lower(trim(old.name)) then
    -- Code-only (or unrelated) edit: keep a valid code, otherwise keep the old one.
    new.code := case when v_valid then v_code else old.code end;
    if new.code is distinct from v_code then
      new.last_modified_at := greatest(new.last_modified_at, now()); -- so clients re-pull it
    end if;
    return new;
  end if;

  -- Insert or rename: an existing code for this name in the org wins (consistency), then a
  -- valid supplied code, then a generated one.
  new.code := coalesce(
    (select c.code from inventory_categories c
      where c.organization_id = new.organization_id
        and lower(trim(c.name)) = lower(trim(new.name))
        and c.deleted_at is null
        and c.id <> new.id
      limit 1),
    case when v_valid then v_code end,
    public.inventory_category_code_for(new.organization_id, new.name, new.id)
  );
  if new.code is distinct from v_code then
    -- Corrected server-side: bump the timestamp so the sync pull brings the real code back
    -- to the device that wrote it (pull is by last_modified_at > watermark).
    new.last_modified_at := greatest(new.last_modified_at, now());
  end if;
  return new;
end;
$$;

create trigger inventory_categories_assign_code
  before insert or update on public.inventory_categories
  for each row execute function public.inventory_categories_assign_code();

-- A code edit on one store's row applies org-wide: every other store's category with the same
-- name follows. Done here (not client-side) so it also reaches stores this device hasn't
-- synced. SECURITY DEFINER because the editor's RLS may not cover every store; the UI only
-- offers code editing to inventory.manage holders (org roles).
create or replace function public.inventory_categories_propagate_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.code is distinct from old.code and new.deleted_at is null then
    update inventory_categories c
    set code = new.code, last_modified_at = now()
    where c.organization_id = new.organization_id
      and lower(trim(c.name)) = lower(trim(new.name))
      and c.id <> new.id
      and c.deleted_at is null
      and c.code is distinct from new.code;
  end if;
  return null;
end;
$$;

create trigger inventory_categories_propagate_code
  after update of code on public.inventory_categories
  for each row
  when (pg_trigger_depth() < 1)
  execute function public.inventory_categories_propagate_code();

alter table public.inventory_categories
  alter column code set not null,
  add constraint inventory_categories_code_format check (code ~ '^[A-Z0-9]{2,6}$');

create unique index inventory_categories_store_code_uq
  on public.inventory_categories (store_id, code) where deleted_at is null;

comment on column public.inventory_categories.code is
  'SKU category segment ({CAT}, e.g. SAR). One name ↔ one code across the org, assigned by '
  'the inventory_categories_assign_code trigger. Locked once used by a SKU (Phase 2C).';

-- ── 4. inventory.manage ───────────────────────────────────────────────────────────────────
insert into public.permissions (key, module, is_system)
values ('inventory.manage', 'Inventory', true)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'inventory.manage'
where r.name in ('org_owner', 'org_manager')
on conflict do nothing;
