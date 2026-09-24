-- Let Aditi add a responsibility to a pending registration without removing
-- it from the approval queue.
begin;

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
  set
    is_active = p_is_active,
    access_status = case
      when p_is_active then 'active'
      when auth_user_id is null then 'preconfigured'
      when target.access_status in ('pending', 'rejected') then target.access_status
      else 'paused'
    end
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
