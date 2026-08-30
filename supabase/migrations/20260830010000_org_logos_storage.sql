-- Storage bucket for organization logos, uploaded from the org edit page's
-- "Registration details" section (uploadOrganizationLogo() in organizations.ts).
-- Public bucket: logos aren't sensitive, and serving them as a plain
-- <img src="..."> from a public URL avoids having to mint/refresh signed URLs
-- on every page load. One object per org at a fixed path ({org_id}/logo.{ext},
-- upsert: true) — a re-upload overwrites in place rather than accumulating
-- orphaned files; the client cache-busts by appending ?v=<timestamp> to the
-- public URL it writes into organizations.logo_url.

insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

create policy "public can read org logos"
  on storage.objects for select
  using (bucket_id = 'org-logos');

-- Same authorizer as every other organizations write in this schema.
create policy "platform admins can upload org logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos' and public.is_platform_admin());

create policy "platform admins can replace org logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'org-logos' and public.is_platform_admin())
  with check (bucket_id = 'org-logos' and public.is_platform_admin());

create policy "platform admins can delete org logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'org-logos' and public.is_platform_admin());
