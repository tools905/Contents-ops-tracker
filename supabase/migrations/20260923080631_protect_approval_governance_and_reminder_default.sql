-- Keep access administration and approval governance separate: Admins can
-- operate the workspace, while only the protected Owner can rewrite RACI or
-- use a documented emergency override.

drop policy if exists assignments_admin_insert on public.item_stage_assignments;
drop policy if exists assignments_admin_update on public.item_stage_assignments;
drop policy if exists assignments_admin_delete on public.item_stage_assignments;

create policy assignments_owner_insert
on public.item_stage_assignments for insert to authenticated
with check ((select private.is_owner()));

create policy assignments_owner_update
on public.item_stage_assignments for update to authenticated
using ((select private.is_owner()))
with check ((select private.is_owner()));

create policy assignments_owner_delete
on public.item_stage_assignments for delete to authenticated
using ((select private.is_owner()));

create or replace function public.replace_workflow_raci_default(
  p_stage public.pipeline_stage,
  p_responsible_ids uuid[],
  p_accountable_ids uuid[],
  p_consulted_ids uuid[] default '{}',
  p_informed_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.is_owner()) then
    raise exception 'Only the protected Owner can edit workflow ownership';
  end if;
  if coalesce(cardinality(p_responsible_ids), 0) = 0
    or coalesce(cardinality(p_accountable_ids), 0) = 0 then
    raise exception 'Every stage requires Responsible and Accountable people';
  end if;
  if exists (
    select 1
    from unnest(
      p_responsible_ids || p_accountable_ids ||
      p_consulted_ids || p_informed_ids
    ) assigned(profile_id)
    where not exists (
      select 1 from public.profiles p where p.id = assigned.profile_id
    )
  ) then
    raise exception 'Workflow ownership must use the team directory';
  end if;

  delete from public.workflow_raci_defaults where stage = p_stage;
  insert into public.workflow_raci_defaults (
    stage, profile_id, assignment_type
  )
  select p_stage, profile_id, assignment_type::public.assignment_type
  from (
    select unnest(p_responsible_ids) profile_id, 'responsible' assignment_type
    union all select unnest(p_accountable_ids), 'accountable'
    union all select unnest(p_consulted_ids), 'consulted'
    union all select unnest(p_informed_ids), 'informed'
  ) assignments
  on conflict do nothing;

  delete from public.item_stage_assignments a
  using public.content_items i
  where a.content_item_id = i.id
    and i.lifecycle = 'active'
    and a.stage = p_stage;

  insert into public.item_stage_assignments (
    content_item_id, stage, profile_id, assignment_type
  )
  select i.id, d.stage, d.profile_id, d.assignment_type
  from public.content_items i
  join public.workflow_raci_defaults d on d.stage = p_stage
  where i.lifecycle = 'active'
  on conflict do nothing;

  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note, metadata
  )
  select i.id, null, null, 'edited', actor,
    'Workspace workflow ownership updated by protected Owner',
    jsonb_build_object('setting', 'workflow_raci_default')
  from public.content_items i
  where i.lifecycle = 'active';
end;
$$;

create or replace function public.replace_stage_raci(
  p_item_id uuid,
  p_stage public.pipeline_stage,
  p_responsible_ids uuid[],
  p_accountable_ids uuid[],
  p_consulted_ids uuid[] default '{}',
  p_informed_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.is_owner()) then
    raise exception 'Only the protected Owner can edit RACI assignments';
  end if;
  if coalesce(cardinality(p_responsible_ids), 0) = 0
    or coalesce(cardinality(p_accountable_ids), 0) = 0 then
    raise exception 'Every stage requires at least one Responsible and one Accountable person';
  end if;
  if exists (
    select 1
    from unnest(
      p_responsible_ids || p_accountable_ids ||
      p_consulted_ids || p_informed_ids
    ) assigned(profile_id)
    where not exists (
      select 1 from public.profiles p where p.id = assigned.profile_id
    )
  ) then raise exception 'RACI assignments must use the team directory'; end if;

  delete from public.item_stage_assignments
  where content_item_id = p_item_id and stage = p_stage;
  insert into public.item_stage_assignments (
    content_item_id, stage, profile_id, assignment_type
  )
  select p_item_id, p_stage, profile_id,
    assignment_type::public.assignment_type
  from (
    select unnest(p_responsible_ids) profile_id, 'responsible' assignment_type
    union all select unnest(p_accountable_ids), 'accountable'
    union all select unnest(p_consulted_ids), 'consulted'
    union all select unnest(p_informed_ids), 'informed'
  ) assignments on conflict do nothing;

  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note, metadata
  ) values (
    p_item_id, p_stage, p_stage, 'edited', actor,
    'RACI assignments updated by protected Owner',
    jsonb_build_object(
      'responsible_count', cardinality(p_responsible_ids),
      'accountable_count', cardinality(p_accountable_ids),
      'consulted_count', cardinality(p_consulted_ids),
      'informed_count', cardinality(p_informed_ids)
    )
  );
end;
$$;

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
declare
  item public.content_items;
  previous_stage public.pipeline_stage;
  next_stage public.pipeline_stage;
  has_second_lens boolean := false;
  is_maker boolean := false;
  is_accountable boolean := false;
  is_owner boolean := (select private.is_owner());
  history_kind public.history_action := 'approved';
  actor uuid := (select private.current_profile_id());
  skipped text[] := '{}';
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  previous_stage := item.current_stage;
  if item.lifecycle <> 'active' or item.stage_status <> 'pending_approval' then
    raise exception 'Stage is not awaiting approval';
  end if;

  select private.is_assigned(
    item.id, 'accountable', item.current_stage
  ) into is_accountable;
  if not is_accountable then
    if not is_owner then
      raise exception 'Only an assigned Accountable person can advance this stage';
    end if;
    if char_length(trim(coalesce(p_override_reason, ''))) < 6 then
      raise exception 'An Owner override reason is required';
    end if;
    history_kind := 'override_advanced';
  end if;

  if item.current_stage in ('script', 'production') then
    select exists (
      select 1 from public.stage_reviews
      where content_item_id = item.id and stage = item.current_stage
        and decision = 'approved'
    ) into has_second_lens;
    if not has_second_lens then
      if not is_owner then
        raise exception 'A second-lens approval is required';
      end if;
      if char_length(trim(coalesce(p_override_reason, ''))) < 6 then
        raise exception 'An Owner override reason is required';
      end if;
      history_kind := 'override_advanced';
    end if;
  end if;

  if item.current_stage = 'upload' then
    select item.created_by = actor or exists (
      select 1 from public.item_stage_assignments a
      where a.content_item_id = item.id and a.profile_id = actor
        and a.assignment_type = 'responsible'
        and a.stage in ('script', 'shoot', 'production', 'upload')
    ) into is_maker;
    if is_maker then
      if not is_owner then
        raise exception 'The maker cannot approve final publishing';
      end if;
      if char_length(trim(coalesce(p_override_reason, ''))) < 6 then
        raise exception 'An Owner override reason is required for self-approval';
      end if;
      history_kind := 'override_advanced';
    end if;
  end if;

  next_stage := case item.workflow_route
    when 'design' then case item.current_stage
      when 'idea' then 'production'::public.pipeline_stage
      when 'production' then 'upload'::public.pipeline_stage
      when 'upload' then 'post_upload_metrics'::public.pipeline_stage
      else null end
    when 'ad_hoc' then case item.current_stage
      when 'production' then 'upload'::public.pipeline_stage
      when 'upload' then 'post_upload_metrics'::public.pipeline_stage
      else null end
    else case item.current_stage
      when 'idea' then 'script'::public.pipeline_stage
      when 'script' then 'shoot'::public.pipeline_stage
      when 'shoot' then 'production'::public.pipeline_stage
      when 'production' then 'upload'::public.pipeline_stage
      when 'upload' then 'post_upload_metrics'::public.pipeline_stage
      else null end
  end;

  if item.workflow_route = 'design' and item.current_stage = 'idea' then
    skipped := array['script', 'shoot'];
  elsif item.workflow_route = 'ad_hoc' and item.current_stage = 'production' then
    skipped := array['idea', 'script', 'shoot'];
  end if;

  if next_stage is null then
    update public.content_items set
      stage_status = 'approved', lifecycle = 'closed', closed_at = now(),
      due_at = null
    where id = item.id returning * into item;
    insert into public.stage_history (
      content_item_id, from_stage, to_stage, action, actor_id, note, metadata
    ) values (
      item.id, previous_stage, null,
      case when history_kind = 'override_advanced'
        then 'override_advanced'::public.history_action
        else 'closed'::public.history_action end,
      actor, p_override_reason,
      jsonb_build_object(
        'workflow_route', item.workflow_route,
        'accountable_assignment', is_accountable
      )
    );
  else
    update public.content_items set
      current_stage = next_stage,
      stage_status = 'in_progress',
      due_at = p_next_due_at,
      workflow_step = case next_stage
        when 'script' then 'Drafting'
        when 'shoot' then 'Shoot brief'
        when 'production' then 'Edit or design'
        when 'upload' then 'Platform scheduling'
        else 'Publish confirmation' end,
      published_at = case when next_stage = 'post_upload_metrics'
        then coalesce(published_at, now()) else published_at end
    where id = item.id returning * into item;
    insert into public.stage_history (
      content_item_id, from_stage, to_stage, action, actor_id, note, metadata
    ) values (
      item.id, previous_stage, next_stage, history_kind, actor,
      p_override_reason,
      jsonb_build_object(
        'second_lens_approved', has_second_lens,
        'maker_self_approval', is_maker,
        'accountable_assignment', is_accountable,
        'workflow_route', item.workflow_route,
        'skipped_stages', to_jsonb(skipped)
      )
    );
  end if;

  if history_kind = 'override_advanced' then
    insert into public.notifications (
      recipient_id, content_item_id, kind, title, body, dedupe_key
    )
    select distinct ur.profile_id, item.id, 'override_used',
      'Owner override: ' || item.title, trim(p_override_reason),
      'override:' || item.id::text || ':' || now()::text || ':' || ur.profile_id::text
    from public.user_roles ur
    where ur.role in ('admin', 'content_approver');
  end if;
  return item;
end;
$$;

create or replace function public.request_stage_changes(
  p_item_id uuid, p_note text
)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.content_items;
  actor uuid := (select private.current_profile_id());
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 2 then
    raise exception 'A change note is required';
  end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null or item.stage_status <> 'pending_approval' then
    raise exception 'Stage is not awaiting approval';
  end if;
  if not (
    (select private.is_owner())
    or (select private.is_assigned(item.id, 'accountable', item.current_stage))
  ) then
    raise exception 'Only an assigned Accountable person can request changes';
  end if;
  update public.content_items set stage_status = 'changes_requested'
  where id = item.id returning * into item;
  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note
  ) values (
    item.id, item.current_stage, item.current_stage,
    'changes_requested', actor, p_note
  );
  return item;
end;
$$;

create or replace function public.set_default_reminder_hours(p_hours smallint)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can change workspace reminders';
  end if;
  if p_hours not between 0 and 720 then
    raise exception 'Reminder lead time must be between 0 and 720 hours';
  end if;
  insert into public.app_settings (key, value, updated_by, updated_at)
  values ('default_reminder_hours', to_jsonb(p_hours), actor, now())
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
  return p_hours;
end;
$$;

create or replace function private.apply_content_item_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare configured_hours smallint;
begin
  select case
    when jsonb_typeof(value) = 'number' then (value #>> '{}')::smallint
    else 24::smallint
  end into configured_hours
  from public.app_settings
  where key = 'default_reminder_hours';
  if new.reminder_hours_before is null or new.reminder_hours_before = 24 then
    new.reminder_hours_before := coalesce(configured_hours, 24);
  end if;
  return new;
end;
$$;

drop trigger if exists content_items_apply_workspace_defaults
on public.content_items;
create trigger content_items_apply_workspace_defaults
before insert on public.content_items
for each row execute function private.apply_content_item_defaults();

revoke all on function private.apply_content_item_defaults()
from public, anon, authenticated;

revoke all on function public.set_default_reminder_hours(smallint)
from public, anon;
grant execute on function public.set_default_reminder_hours(smallint)
to authenticated;

revoke all on function public.replace_workflow_raci_default(
  public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]
) from public, anon;
grant execute on function public.replace_workflow_raci_default(
  public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]
) to authenticated;

revoke all on function public.replace_stage_raci(
  uuid, public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]
) from public, anon;
grant execute on function public.replace_stage_raci(
  uuid, public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]
) to authenticated;

revoke all on function public.advance_content_item(uuid, timestamptz, text)
from public, anon;
grant execute on function public.advance_content_item(uuid, timestamptz, text)
to authenticated;

revoke all on function public.request_stage_changes(uuid, text)
from public, anon;
grant execute on function public.request_stage_changes(uuid, text)
to authenticated;
