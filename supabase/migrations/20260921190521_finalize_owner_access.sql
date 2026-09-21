-- Final production access model for the Content Ops Tracker.
-- Aditi is the sole protected access owner. Operational Admins may run the
-- content system but cannot promote, demote, activate or deactivate people.

delete from public.workspace_owners where slot <> 1;

alter table public.workspace_owners
  drop constraint if exists workspace_owners_slot_check;

alter table public.workspace_owners
  add constraint workspace_owners_single_slot_check check (slot = 1);

comment on table public.workspace_owners is
  'One protected access owner. The owner can preview roles without changing this stored identity.';

create table public.user_access_history (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  target_active boolean not null,
  target_roles public.app_role[] not null default '{}',
  created_at timestamptz not null default now()
);

create index user_access_history_target_created_idx
  on public.user_access_history (target_profile_id, created_at desc);
create index user_access_history_actor_created_idx
  on public.user_access_history (actor_id, created_at desc);

alter table public.user_access_history enable row level security;
revoke all on public.user_access_history from public, anon, authenticated;
grant select on public.user_access_history to authenticated;

create policy user_access_history_owner_read
on public.user_access_history
for select
to authenticated
using ((select private.is_owner()));

-- Direct profile and role writes would bypass the audit trail. All access
-- changes therefore go through manage_user_access below.
drop policy if exists profiles_owner_write on public.profiles;
drop policy if exists roles_owner_insert on public.user_roles;
drop policy if exists roles_owner_delete on public.user_roles;
revoke insert, update, delete on public.profiles, public.user_roles from authenticated;

create or replace function public.manage_user_access(
  p_profile_id uuid,
  p_is_active boolean,
  p_roles public.app_role[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare normalized_roles public.app_role[];
begin
  if (select auth.uid()) is null or not (select private.is_owner()) then
    raise exception 'Only Aditi, the workspace Owner, can manage access';
  end if;

  if exists (
    select 1 from public.workspace_owners where profile_id = p_profile_id
  ) then
    raise exception 'Owner access is protected and cannot be changed here';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profile not found';
  end if;

  select coalesce(array_agg(distinct selected_role), '{}'::public.app_role[])
  into normalized_roles
  from unnest(coalesce(p_roles, '{}'::public.app_role[])) selected_role;

  if p_is_active and coalesce(cardinality(normalized_roles), 0) = 0 then
    raise exception 'An active user needs at least one responsibility';
  end if;

  update public.profiles
  set is_active = p_is_active
  where id = p_profile_id;

  delete from public.user_roles where profile_id = p_profile_id;

  if p_is_active then
    insert into public.user_roles (profile_id, role)
    select p_profile_id, selected_role
    from unnest(normalized_roles) selected_role;
  end if;

  insert into public.user_access_history (
    actor_id, target_profile_id, target_active, target_roles
  ) values (
    (select auth.uid()), p_profile_id, p_is_active,
    case when p_is_active then normalized_roles else '{}'::public.app_role[] end
  );
end;
$$;

revoke all on function public.manage_user_access(uuid, boolean, public.app_role[])
  from public, anon;
grant execute on function public.manage_user_access(uuid, boolean, public.app_role[])
  to authenticated;

-- Creating the Auth identity for the agreed owner email automatically creates
-- and activates the matching profile and binds it to the protected owner slot.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare is_designated_owner boolean :=
  lower(coalesce(new.email, '')) = 'aditi@buildablelabs.com';
begin
  insert into public.profiles (id, email, full_name, is_active)
  values (
    new.id,
    lower(new.email),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      case when is_designated_owner then 'Aditi Chourasia'
        else split_part(new.email, '@', 1) end
    ),
    is_designated_owner
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    is_active = public.profiles.is_active or excluded.is_active;

  if is_designated_owner then
    insert into public.workspace_owners (slot, profile_id)
    values (1, new.id)
    on conflict (slot) do update set profile_id = excluded.profile_id;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user()
  from public, anon, authenticated, service_role;

-- Manual social-performance entry is intentionally disabled. Zoho remains
-- the source of truth; this table is reserved for a later automated import.
drop policy if exists metrics_create on public.metrics_entries;
drop policy if exists metrics_update on public.metrics_entries;
revoke insert, update, delete on public.metrics_entries from authenticated;
comment on table public.metrics_entries is
  'Read-only social performance snapshots imported from Zoho Social or Zoho Analytics.';

-- The publish handoff cannot be approved by its maker. Only the protected
-- Owner may override this rule, and the reason is preserved in stage history.
create or replace function public.advance_content_item(
  p_item_id uuid,
  p_next_due_at timestamptz default null,
  p_override_reason text default null
)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare item public.content_items;
declare next_stage public.pipeline_stage;
declare has_second_lens boolean;
declare is_maker boolean := false;
declare history_kind public.history_action := 'approved';
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if item.lifecycle <> 'active' or item.stage_status <> 'pending_approval' then
    raise exception 'Stage is not awaiting approval';
  end if;
  if not (
    (select private.has_role('admin'))
    or (select private.is_assigned(item.id, 'accountable', item.current_stage))
  ) then
    raise exception 'Only an accountable owner can advance this stage';
  end if;

  if item.current_stage in ('script', 'production') then
    select exists (
      select 1 from public.stage_reviews
      where content_item_id = item.id
        and stage = item.current_stage
        and decision = 'approved'
    ) into has_second_lens;

    if not has_second_lens then
      if not (select private.is_owner()) then
        raise exception 'A second-lens approval is required';
      end if;
      if char_length(trim(coalesce(p_override_reason, ''))) < 6 then
        raise exception 'An Owner override reason is required';
      end if;
      history_kind := 'override_advanced';
    end if;
  end if;

  if item.current_stage = 'upload' then
    select item.created_by = (select auth.uid()) or exists (
      select 1
      from public.item_stage_assignments a
      where a.content_item_id = item.id
        and a.profile_id = (select auth.uid())
        and a.assignment_type = 'responsible'
        and a.stage in ('script', 'shoot', 'production', 'upload')
    ) into is_maker;

    if is_maker then
      if not (select private.is_owner()) then
        raise exception 'The maker cannot approve final publishing';
      end if;
      if char_length(trim(coalesce(p_override_reason, ''))) < 6 then
        raise exception 'An Owner override reason is required for self-approval';
      end if;
      history_kind := 'override_advanced';
    end if;
  end if;

  next_stage := case item.current_stage
    when 'idea' then 'script'
    when 'script' then 'shoot'
    when 'shoot' then 'production'
    when 'production' then 'upload'
    when 'upload' then 'post_upload_metrics'
    else null
  end;

  if next_stage is null then
    update public.content_items
    set stage_status = 'approved', lifecycle = 'closed', closed_at = now(), due_at = null
    where id = item.id returning * into item;

    insert into public.stage_history (
      content_item_id, from_stage, to_stage, action, actor_id, note
    ) values (
      item.id, item.current_stage, null, 'closed', (select auth.uid()), p_override_reason
    );
  else
    update public.content_items
    set current_stage = next_stage,
        stage_status = 'in_progress',
        due_at = p_next_due_at,
        workflow_step = case next_stage
          when 'script' then 'Drafting'
          when 'shoot' then 'Shoot brief'
          when 'production' then 'Edit or design'
          when 'upload' then 'Platform scheduling'
          else 'Publish confirmation'
        end,
        published_at = case
          when next_stage = 'post_upload_metrics' then coalesce(published_at, now())
          else published_at
        end
    where id = item.id returning * into item;

    insert into public.stage_history (
      content_item_id, from_stage, to_stage, action, actor_id, note, metadata
    ) values (
      item.id,
      case next_stage
        when 'script' then 'idea'
        when 'shoot' then 'script'
        when 'production' then 'shoot'
        when 'upload' then 'production'
        else 'upload'
      end,
      next_stage,
      history_kind,
      (select auth.uid()),
      p_override_reason,
      jsonb_build_object(
        'second_lens_approved', coalesce(has_second_lens, false),
        'maker_self_approval', is_maker
      )
    );
  end if;

  return item;
end;
$$;

revoke all on function public.advance_content_item(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.advance_content_item(uuid, timestamptz, text)
  to authenticated;

create or replace function public.update_workflow_step(
  p_item_id uuid,
  p_workflow_step text
)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare item public.content_items;
declare allowed_steps text[];
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if not (
    (select private.has_role('admin'))
    or (select private.is_assigned(item.id, 'responsible', item.current_stage))
  ) then
    raise exception 'Not authorized to update this checkpoint';
  end if;

  allowed_steps := case item.current_stage
    when 'idea' then array['Topic research', 'HOD input', 'Calendar slot']
    when 'script' then array['Drafting', 'Subject-matter validation', 'Financial compliance']
    when 'shoot' then array['Shoot brief', 'Recording']
    when 'production' then array['Edit or design', 'Harshit quality check', 'Priya final approval']
    when 'upload' then array['Platform scheduling', 'Publishing']
    else array['Publish confirmation', 'Live link captured', 'Learning note']
  end;

  if not (p_workflow_step = any(allowed_steps)) then
    raise exception 'Checkpoint does not belong to the current stage';
  end if;

  update public.content_items
  set workflow_step = p_workflow_step
  where id = item.id returning * into item;

  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note
  ) values (
    item.id, item.current_stage, item.current_stage, 'edited',
    (select auth.uid()), 'Checkpoint moved to ' || p_workflow_step
  );

  return item;
end;
$$;

revoke all on function public.update_workflow_step(uuid, text)
  from public, anon;
grant execute on function public.update_workflow_step(uuid, text)
  to authenticated;
