-- Cover foreign keys used for joins and delete/update checks.
create index app_settings_updated_by_idx
  on public.app_settings (updated_by)
  where updated_by is not null;
create index content_links_created_by_idx
  on public.content_links (created_by);
create index department_requests_created_by_idx
  on public.department_requests (created_by);

-- Avoid overlapping permissive SELECT policies while preserving the same
-- operational Admin write access.
drop policy if exists settings_admin_write on public.app_settings;

create policy settings_admin_insert
on public.app_settings
for insert
to authenticated
with check ((select private.has_role('admin')));

create policy settings_admin_update
on public.app_settings
for update
to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy settings_admin_delete
on public.app_settings
for delete
to authenticated
using ((select private.has_role('admin')));

-- Reminder queue commands are server-only. Be explicit even though PUBLIC
-- execution was already revoked by the base migration.
revoke execute on function public.enqueue_due_date_reminders()
  from authenticated;
revoke execute on function public.enqueue_cadence_reminders()
  from authenticated;
