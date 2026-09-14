-- Stock Placement: optional palette colour per location, for quick visual identification
-- (colour-coded shelf labels are standard retail/WMS practice). A constrained token set (not
-- hex) so it stays theme-legible and maps to buyable colored labels. Colour is an aid — the
-- code is always shown alongside. See specs/roadmap/stock-placement.md.

alter table public.stock_locations
  add column color text
  check (color in ('red','amber','green','teal','blue','violet','pink','slate'));

comment on column public.stock_locations.color is
  'Optional palette colour token for the location (null = none). Aid for visual identification; '
  'always shown with the code. Constrained set, not hex.';
