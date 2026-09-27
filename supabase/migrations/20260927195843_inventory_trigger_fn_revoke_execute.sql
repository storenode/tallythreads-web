-- Trigger-only functions must not be callable through the API (/rest/v1/rpc/...).
-- inventory_categories_propagate_code is SECURITY DEFINER (org-wide category recode), so the
-- Supabase linter flags it as executable by anon/authenticated. Postgres already refuses to run
-- a trigger function outside a trigger, but revoke EXECUTE so it isn't exposed at all.
-- Triggers still fire: trigger execution doesn't check EXECUTE on the function.
revoke execute on function public.inventory_categories_propagate_code() from public, anon, authenticated;
revoke execute on function public.inventory_categories_assign_code() from public, anon, authenticated;
revoke execute on function public.inventory_items_guard() from public, anon, authenticated;
