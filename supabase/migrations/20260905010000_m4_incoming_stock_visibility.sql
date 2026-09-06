-- M4 visibility split (specs/roadmap/purchase-trips.md §10): store sales staff must see
-- WHAT stock is coming and WHEN, so they can tell customers — but never the money
-- (cost, landed cost, MRP, margin, budget, expenses, forecast). Owner/Manager keep the
-- full financial view via trip.read (already gated on the purchase_* tables).
--
-- Enforced server-side, not by hiding columns in the UI: store staff read a PRICE-FREE
-- view (`incoming_stock`) that simply does not contain any financial column, so there is
-- nothing to leak. The view runs security-definer (bypasses the trip.read RLS on the base
-- tables) and gates each row by has_incoming_visibility(org) instead.
--
-- Phase 1 scope: the incoming list is ORG-WIDE (every incoming trip for the staff's org).
-- Per-store "coming to MY store" needs trip→store allocation, which is M1c.

-- 1. New permission + grants to the store-scoped roles (+ store_manager).
insert into permissions (key, module, is_system)
values ('trip.view_incoming', 'trip', true)
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = 'trip.view_incoming'
where r.name in ('store_sales_staff', 'store_temp_staff', 'store_manager')
on conflict do nothing;

-- 2. Visibility helper: can the caller see incoming stock for this org?
--    Owner/Manager (trip.read) yes; a store member of a store in this org whose role
--    grants trip.view_incoming yes; an org-scoped trip.view_incoming grant yes; platform
--    admin yes.
create or replace function public.has_incoming_visibility(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or public.has_org_permission(target_org, 'trip.read')
    or exists (
      select 1
      from memberships m
      join roles r on r.id = m.role_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      join stores s on s.id = m.store_id
      where m.member_id = auth.uid()
        and m.deleted_at is null
        and s.organization_id = target_org
        and p.key = 'trip.view_incoming'
    )
    or exists (
      select 1
      from memberships m
      join roles r on r.id = m.role_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where m.member_id = auth.uid()
        and m.deleted_at is null
        and m.organization_id = target_org
        and p.key = 'trip.view_incoming'
    );
$$;

revoke all on function public.has_incoming_visibility(uuid) from public;
grant execute on function public.has_incoming_visibility(uuid) to authenticated;

-- 3. Price-free view. NO cost / landed / mrp / margin / budget / expense columns exist
--    here — only what stock is coming and when. security_invoker=false so it can read the
--    base tables past their trip.read RLS; per-row access is the WHERE gate below.
create or replace view public.incoming_stock
with (security_invoker = false) as
  select
    t.id            as trip_id,
    t.organization_id,
    t.status,
    t.title         as trip_title,
    t.end_date      as expected_by,
    i.id            as item_id,
    i.description,
    i.quantity
  from purchase_trips t
  join purchase_invoices pi
    on pi.trip_id = t.id and pi.deleted_at is null
  join purchase_invoice_items i
    on i.invoice_id = pi.id and i.deleted_at is null
  where t.deleted_at is null
    and t.status in ('active', 'completed')
    and public.has_incoming_visibility(t.organization_id);

grant select on public.incoming_stock to authenticated;

comment on view public.incoming_stock is
  'Price-free incoming-stock feed for store staff (trip.view_incoming). Deliberately '
  'excludes every financial column; per-row access gated by has_incoming_visibility().';
