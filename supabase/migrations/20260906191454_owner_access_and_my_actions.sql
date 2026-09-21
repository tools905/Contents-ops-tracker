-- Two protected workspace owners sit above operational roles. The slots are
-- intentionally empty until the two real AFM India auth users are chosen.
create table public.workspace_owners (
  slot smallint primary key check (slot between 1 and 2),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.workspace_owners is 'Exactly two protected full-access IDs, configured after the real auth users are created.';

alter table public.workspace_owners enable row level security;
revoke all on public.workspace_owners from anon, authenticated;
grant select on public.workspace_owners to authenticated;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.workspace_owners
    where profile_id = (select auth.uid())
  );
$$;

revoke all on function private.is_owner() from public, anon, authenticated, service_role;
grant execute on function private.is_owner() to authenticated;

create or replace function private.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_user_active()) and (
    (required_role = 'admin' and (select private.is_owner()))
    or exists (
      select 1
      from public.user_roles
      where profile_id = (select auth.uid()) and role = required_role
    )
  );
$$;

drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists roles_admin_insert on public.user_roles;
drop policy if exists roles_admin_delete on public.user_roles;

create policy owners_active_read
on public.workspace_owners
for select
to authenticated
using ((select private.current_user_active()));

create policy profiles_owner_write
on public.profiles
for update
to authenticated
using ((select private.is_owner()))
with check ((select private.is_owner()));

create policy roles_owner_insert
on public.user_roles
for insert
to authenticated
with check ((select private.is_owner()));

create policy roles_owner_delete
on public.user_roles
for delete
to authenticated
using ((select private.is_owner()));

create or replace function public.manage_user_access(
  p_profile_id uuid,
  p_is_active boolean,
  p_roles public.app_role[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_owner()) then
    raise exception 'Only a workspace Owner can manage access';
  end if;

  if exists (select 1 from public.workspace_owners where profile_id = p_profile_id) then
    raise exception 'Owner access is protected and cannot be changed here';
  end if;

  if p_is_active and coalesce(cardinality(p_roles), 0) = 0 then
    raise exception 'An active user needs at least one role';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set is_active = p_is_active
  where id = p_profile_id;

  delete from public.user_roles
  where profile_id = p_profile_id;

  if p_is_active then
    insert into public.user_roles (profile_id, role)
    select p_profile_id, selected_role
    from (select distinct unnest(p_roles) as selected_role) selected;
  end if;
end;
$$;

revoke all on function public.manage_user_access(uuid, boolean, public.app_role[]) from public, anon;
grant execute on function public.manage_user_access(uuid, boolean, public.app_role[]) to authenticated;

-- Owners are notified when any second-lens exception is recorded, including
-- when the operational approver is not one of the two protected accounts.
create or replace function private.queue_owner_override_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare item_title text;
begin
  select title into item_title from public.content_items where id = new.content_item_id;
  insert into public.notifications (recipient_id, content_item_id, kind, title, body, dedupe_key)
  select owner.profile_id, new.content_item_id, 'override_used', 'Second-lens override: ' || item_title,
    coalesce(new.note, 'No reason supplied'), 'owner-override:' || new.id::text || ':' || owner.profile_id::text
  from public.workspace_owners owner
  where owner.profile_id <> new.actor_id
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.queue_owner_override_notifications() from public, anon, authenticated, service_role;

create trigger owner_override_notifications
after insert on public.stage_history
for each row
when (new.action = 'override_advanced')
execute function private.queue_owner_override_notifications();
