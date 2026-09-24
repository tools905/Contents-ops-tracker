-- Standalone Supabase email/password access requests and private phone contacts.
-- Existing team profiles and RACI responsibilities remain the source of truth.
begin;

alter table public.profiles
  add column if not exists access_status text;

update public.profiles
set access_status = case
  when is_active then 'active'
  when auth_user_id is not null then 'pending'
  else 'preconfigured'
end
where access_status is null;

alter table public.profiles
  alter column access_status set default 'preconfigured',
  alter column access_status set not null;

alter table public.profiles
  drop constraint if exists profiles_access_status_check;
alter table public.profiles
  add constraint profiles_access_status_check
  check (access_status in ('preconfigured', 'pending', 'active', 'paused', 'rejected'));

create index if not exists profiles_access_status_idx
  on public.profiles (access_status, created_at desc);

comment on column public.profiles.access_status is
  'preconfigured team member, pending self-registration, active, paused, or rejected';

create table if not exists public.profile_contacts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  phone text not null,
  updated_at timestamptz not null default now(),
  constraint profile_contacts_phone_check check (
    char_length(phone) between 7 and 30
    and phone ~ '^\\+?[0-9 ()-]+$'
  )
);

alter table public.profile_contacts enable row level security;
revoke all on public.profile_contacts from public, anon;
grant select on public.profile_contacts to authenticated;

drop policy if exists profile_contacts_private_read on public.profile_contacts;
create policy profile_contacts_private_read
on public.profile_contacts
for select
to authenticated
using (
  (select private.current_user_active())
  and (
    profile_id = (select private.current_profile_id())
    or (select private.is_owner())
    or (select private.has_role('admin'))
  )
);

drop trigger if exists profile_contacts_touch on public.profile_contacts;
create trigger profile_contacts_touch
before update on public.profile_contacts
for each row execute function private.touch_updated_at();

create or replace function public.get_my_access_state()
returns table (
  profile_id uuid,
  email text,
  full_name text,
  access_status text,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.full_name, p.access_status, p.is_active
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_my_access_state()
from public, anon;
grant execute on function public.get_my_access_state()
to authenticated;

create or replace function public.save_my_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select private.current_profile_id());
  cleaned text := nullif(trim(coalesce(p_phone, '')), '');
  digits text;
begin
  if actor is null or not (select private.current_user_active()) then
    raise exception 'Active access is required';
  end if;

  if cleaned is null then
    delete from public.profile_contacts where profile_id = actor;
    return;
  end if;

  digits := regexp_replace(cleaned, '[^0-9]', '', 'g');
  if char_length(cleaned) > 30 or char_length(digits) not between 7 and 15
    or cleaned !~ '^\\+?[0-9 ()-]+$' then
    raise exception 'Enter a valid phone number with 7 to 15 digits';
  end if;

  insert into public.profile_contacts (profile_id, phone)
  values (actor, cleaned)
  on conflict (profile_id) do update
  set phone = excluded.phone, updated_at = now();
end;
$$;

revoke all on function public.save_my_phone(text)
from public, anon;
grant execute on function public.save_my_phone(text)
to authenticated;

create or replace function public.approve_profile_access(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select private.current_profile_id());
  target public.profiles%rowtype;
  target_roles public.app_role[];
  target_is_admin boolean;
begin
  if actor is null or not (select private.current_user_active())
    or not ((select private.is_owner()) or (select private.has_role('admin'))) then
    raise exception 'Only an active Owner or Admin can approve access';
  end if;

  select * into target
  from public.profiles
  where id = p_profile_id
  for update;

  if target.id is null then raise exception 'Profile not found'; end if;
  if target.auth_user_id is null then raise exception 'This person has not registered yet'; end if;
  if target.access_status not in ('pending', 'rejected', 'paused') then
    raise exception 'This access request is not awaiting approval';
  end if;
  if exists (select 1 from public.workspace_owners where profile_id = target.id) then
    raise exception 'Owner access cannot be approved here';
  end if;

  select
    coalesce(array_agg(role order by role), '{}'::public.app_role[]),
    coalesce(bool_or(role = 'admin'), false)
  into target_roles, target_is_admin
  from public.user_roles
  where profile_id = target.id;

  if coalesce(cardinality(target_roles), 0) = 0 then
    raise exception 'Aditi must assign at least one responsibility before approval';
  end if;
  if target_is_admin and not (select private.is_primary_owner()) then
    raise exception 'Only Aditi can approve another Admin';
  end if;

  update public.profiles
  set is_active = true, access_status = 'active'
  where id = target.id;

  insert into public.user_access_history (
    actor_id, target_profile_id, target_active, target_roles
  ) values (actor, target.id, true, target_roles);
end;
$$;

revoke all on function public.approve_profile_access(uuid)
from public, anon;
grant execute on function public.approve_profile_access(uuid)
to authenticated;

create or replace function public.reject_profile_access(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select private.current_profile_id());
  target public.profiles%rowtype;
  target_roles public.app_role[];
  target_is_admin boolean;
begin
  if actor is null or not (select private.current_user_active())
    or not ((select private.is_owner()) or (select private.has_role('admin'))) then
    raise exception 'Only an active Owner or Admin can reject access';
  end if;

  select * into target
  from public.profiles
  where id = p_profile_id
  for update;

  if target.id is null then raise exception 'Profile not found'; end if;
  if target.auth_user_id is null then raise exception 'This person has not registered yet'; end if;
  if exists (select 1 from public.workspace_owners where profile_id = target.id) then
    raise exception 'Owner access cannot be rejected here';
  end if;

  select
    coalesce(array_agg(role order by role), '{}'::public.app_role[]),
    coalesce(bool_or(role = 'admin'), false)
  into target_roles, target_is_admin
  from public.user_roles
  where profile_id = target.id;

  if target_is_admin and not (select private.is_primary_owner()) then
    raise exception 'Only Aditi can reject another Admin';
  end if;

  update public.profiles
  set is_active = false, access_status = 'rejected'
  where id = target.id;

  insert into public.user_access_history (
    actor_id, target_profile_id, target_active, target_roles
  ) values (actor, target.id, false, target_roles);
end;
$$;

revoke all on function public.reject_profile_access(uuid)
from public, anon;
grant execute on function public.reject_profile_access(uuid)
to authenticated;

-- Self-registration links to the preconfigured person when the supplied name
-- uniquely matches a team member. Every non-Owner registration remains pending.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  signup_name text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  is_designated_owner boolean := lower(coalesce(new.email, '')) = 'aditi@buildablelabs.com';
begin
  if is_designated_owner then
    select id into target_profile_id
    from public.profiles where team_key = 'aditi_owner' limit 1;
  else
    select id into target_profile_id
    from public.profiles
    where auth_user_id is null
      and email is not null
      and lower(email) = lower(new.email)
    limit 1;

    if target_profile_id is null and signup_name is not null then
      select id into target_profile_id
      from public.profiles
      where auth_user_id is null
        and lower(trim(full_name)) = lower(signup_name)
      order by created_at
      limit 1;
    end if;
  end if;

  if target_profile_id is null then
    insert into public.profiles (
      id, auth_user_id, email, full_name, is_active, access_status
    ) values (
      gen_random_uuid(), new.id, lower(new.email),
      coalesce(signup_name, split_part(new.email, '@', 1)),
      is_designated_owner,
      case when is_designated_owner then 'active' else 'pending' end
    ) returning id into target_profile_id;
  else
    update public.profiles set
      auth_user_id = new.id,
      email = lower(new.email),
      full_name = case
        when public.profiles.team_key is not null then public.profiles.full_name
        else coalesce(signup_name, public.profiles.full_name)
      end,
      is_active = is_designated_owner,
      access_status = case when is_designated_owner then 'active' else 'pending' end
    where id = target_profile_id;
  end if;

  if is_designated_owner then
    insert into public.workspace_owners (slot, profile_id)
    values (1, target_profile_id)
    on conflict (slot) do update set profile_id = excluded.profile_id;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user()
from public, anon, authenticated;

-- Keep access status aligned when Aditi pauses or activates an account.
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
