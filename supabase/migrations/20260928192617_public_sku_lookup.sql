-- Public barcode lookup — the header Scan button (features/inventory/BarcodeLookup.tsx).
--
--   lookup_sku(sku)  anyone, signed in or not, scans a price tag and sees what it is: name,
--                    colour, size, category, MRP, the organization and the allocated store, and
--                    how many pieces of the same product each store holds (a product dispatched
--                    to several stores has one SKU per store: siblings share the invoice line,
--                    colour and size).
--
-- READ-ONLY and PRICE-FREE: never the landed cost, never quantities at the org or in transit.
-- SKUs are unique per org, not globally, so a SKU can match more than one organization:
-- the result is a list. Drafts (no SKU yet) and deleted rows are never returned.

create or replace function public.lookup_sku(p_sku text) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with arg as (
    select upper(regexp_replace(coalesce(p_sku, ''), '\s', '', 'g')) as sku
  ),
  hit as (
    select i.*
    from inventory_items i
    join arg on i.sku = arg.sku
    join organizations o on o.id = i.organization_id and o.deleted_at is null
    where i.deleted_at is null and i.status <> 'draft'
    limit 5
  ),
  product as (
    select h.id as hit_id, s.id as item_id
    from hit h
    join inventory_items s
      on s.organization_id = h.organization_id and s.deleted_at is null
     and (s.id = h.id
          or (h.source_invoice_item_id is not null
              and s.source_invoice_item_id = h.source_invoice_item_id
              and s.color = h.color and s.size = h.size))
  ),
  lv as (
    select p.hit_id, l.store_id, sum(l.quantity)::int as q
    from product p
    join stock_levels l on l.item_id = p.item_id
    where l.loc_kind = 'store'
    group by 1, 2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sku', h.sku,
    'name', h.name,
    'color', h.color,
    'size', h.size,
    'category_code', h.category_code,
    'category_name', c.name,
    'mrp_paise', h.mrp_paise,
    'retired', h.status = 'retired',
    'organization_name', o.name,
    'store_name', st.name,
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object('name', s2.name, 'city', s2.city, 'quantity', lv.q)
                       order by lv.q desc, s2.name)
      from lv
      join stores s2 on s2.id = lv.store_id and s2.deleted_at is null
      where lv.hit_id = h.id and lv.q > 0), '[]'::jsonb)
  )), '[]'::jsonb)
  from hit h
  join organizations o on o.id = h.organization_id
  left join inventory_categories c on c.id = h.category_id
  left join stores st on st.id = h.store_id;
$$;

comment on function public.lookup_sku(text) is
  'Public, price-free barcode lookup for the header Scan button: item details + pieces per store '
  'for the same product. Callable without signing in.';

revoke execute on function public.lookup_sku(text) from public;
grant execute on function public.lookup_sku(text) to anon, authenticated;
