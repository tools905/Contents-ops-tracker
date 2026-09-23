-- Allow Aditi to grant or remove the one optional secondary Owner: Akhil.
-- Akhil keeps his operational roles when secondary Owner access is removed.
begin;

alter table public.workspace_owners
  drop constraint if exists workspace_owners_single_slot_check;

alter table public.workspace_owners
  add constraint workspace_owners_slot_check check (slot between 1 and 2);

comment on table public.workspace_owners is
  'Slot 1 is the protected primary Owner (Aditi). Slot 2 is the optional secondary Owner (Akhil), controlled only by Aditi.';

update public.profiles
set team_key = 'akhil_owner'
where lower(coalesce(email, '')) = 'akhil@buildablelabs.com'
  and team_key is null;

alter table public.user_access_history
  add column if not exists owner_enabled boolean;

create or replace function private.is_primary_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.workspace_owners owner
    where owner.slot = 1
      and owner.profile_id = (select private.current_profile_id())
  );
$$;

revoke all on function private.is_primary_owner()
from public, anon, authenticated, service_role;
grant execute on function private.is_primary_owner()
to authenticated, service_role;

create or replace function private.enforce_workspace_owner_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  select lower(coalesce(profile.email, ''))
  into target_email
  from public.profiles profile
  where profile.id = new.profile_id;

  if new.slot = 1 and target_email is distinct from 'aditi@buildablelabs.com' then
    raise exception 'The primary Owner slot is reserved for Aditi';
  end if;

  if new.slot = 2 and target_email is distinct from 'akhil@buildablelabs.com' then
    raise exception 'The secondary Owner slot is reserved for Akhil';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_owners_identity_guard
on public.workspace_owners;
create trigger workspace_owners_identity_guard
before insert or update on public.workspace_owners
for each row execute function private.enforce_workspace_owner_identity();

revoke all on function private.enforce_workspace_owner_identity()
from public, anon, authenticated, service_role;

create or replace function public.set_akhil_owner(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select private.current_profile_id());
  target public.profiles%rowtype;
  target_roles public.app_role[];
begin
  if actor is null or not (select private.is_primary_owner()) then
    raise exception 'Only Aditi can change Akhil Owner access';
  end if;

  select * into target
  from public.profiles
  where lower(coalesce(email, '')) = 'akhil@buildablelabs.com'
  for update;

  if target.id is null then
    raise exception 'Akhil profile not found';
  end if;

  if p_enabled and (target.auth_user_id is null or not target.is_active) then
    raise exception 'Akhil must have active app access before becoming an Owner';
  end if;

  if p_enabled then
    insert into public.workspace_owners (slot, profile_id)
    values (2, target.id)
    on conflict (slot) do update set profile_id = excluded.profile_id;
  else
    delete from public.workspace_owners where slot = 2;
  end if;

  select coalesce(array_agg(role), '{}'::public.app_role[])
  into target_roles
  from public.user_roles
  where profile_id = target.id;

  insert into public.user_access_history (
    actor_id, target_profile_id, target_active, target_roles, owner_enabled
  ) values (
    actor, target.id, target.is_active, target_roles, p_enabled
  );
end;
$$;

revoke all on function public.set_akhil_owner(boolean)
from public, anon;
grant execute on function public.set_akhil_owner(boolean)
to authenticated;

-- Secondary Owner status grants operational Owner capabilities, but access
-- administration remains exclusively with Aditi in the primary slot.
create or replace function public.manage_user_access(
  p_profile_id uuid, p_is_active boolean, p_roles public.app_role[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_roles public.app_role[];
  target public.profiles%rowtype;
  actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.is_primary_owner()) then
    raise exception 'Only Aditi, the primary Owner, can manage access';
  end if;

  if exists (
    select 1 from public.workspace_owners where profile_id = p_profile_id
  ) then
    raise exception 'Remove Owner access before changing this person''s operational access';
  end if;

  select * into target
  from public.profiles
  where id = p_profile_id
  for update;

  if target.id is null then raise exception 'Profile not found'; end if;
  if p_is_active and target.auth_user_id is null then
    raise exception 'Invite this person before activating app access';
  end if;

  select coalesce(array_agg(distinct role), '{}'::public.app_role[])
  into normalized_roles
  from unnest(coalesce(p_roles, '{}')) role;

  if p_is_active and coalesce(cardinality(normalized_roles), 0) = 0 then
    raise exception 'An active user needs at least one responsibility';
  end if;

  update public.profiles
  set is_active = p_is_active
  where id = p_profile_id;

  delete from public.user_roles where profile_id = p_profile_id;
  insert into public.user_roles (profile_id, role)
  select p_profile_id, role
  from unnest(normalized_roles) role;

  insert into public.user_access_history (
    actor_id, target_profile_id, target_active, target_roles
  ) values (actor, p_profile_id, p_is_active, normalized_roles);
end;
$$;

revoke all on function public.manage_user_access(
  uuid, boolean, public.app_role[]
) from public, anon;
grant execute on function public.manage_user_access(
  uuid, boolean, public.app_role[]
) to authenticated;

commit;
