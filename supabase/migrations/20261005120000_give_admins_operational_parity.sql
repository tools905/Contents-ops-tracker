-- Admins run day-to-day operations alongside the Owner: RACI editing,
-- workflow ownership defaults, requesting changes and reading the access
-- history. Owner-only stays: the Admin role, Owner access, other Admins'
-- accounts, role preview and protected approval overrides.
begin;

create or replace function private.can_operate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_owner()) or (select private.has_role('admin'));
$$;

revoke all on function private.can_operate() from public, anon;
grant execute on function private.can_operate() to authenticated;

create or replace function public.replace_stage_raci(
  p_item_id uuid,
  p_stage public.pipeline_stage,
  p_responsible_ids uuid[],
  p_accountable_ids uuid[],
  p_consulted_ids uuid[] default '{}'::uuid[],
  p_informed_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.can_operate()) then
    raise exception 'Only an Owner or Admin can edit RACI assignments';
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
    'RACI assignments updated',
    jsonb_build_object(
      'responsible_count', cardinality(p_responsible_ids),
      'accountable_count', cardinality(p_accountable_ids),
      'consulted_count', cardinality(p_consulted_ids),
      'informed_count', cardinality(p_informed_ids)
    )
  );
end;
$$;

create or replace function public.replace_workflow_raci_default(
  p_stage public.pipeline_stage,
  p_responsible_ids uuid[],
  p_accountable_ids uuid[],
  p_consulted_ids uuid[] default '{}'::uuid[],
  p_informed_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.can_operate()) then
    raise exception 'Only an Owner or Admin can edit workflow ownership';
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
    'Workspace workflow ownership updated',
    jsonb_build_object('setting', 'workflow_raci_default')
  from public.content_items i
  where i.lifecycle = 'active';
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
    (select private.can_operate())
    or (select private.is_assigned(item.id, 'accountable', item.current_stage))
  ) then
    raise exception 'Only an assigned Accountable person, Owner or Admin can request changes';
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

drop policy if exists assignments_owner_insert on public.item_stage_assignments;
drop policy if exists assignments_owner_update on public.item_stage_assignments;
drop policy if exists assignments_owner_delete on public.item_stage_assignments;
create policy assignments_operator_insert on public.item_stage_assignments
  for insert to authenticated
  with check ((select private.can_operate()));
create policy assignments_operator_update on public.item_stage_assignments
  for update to authenticated
  using ((select private.can_operate()))
  with check ((select private.can_operate()));
create policy assignments_operator_delete on public.item_stage_assignments
  for delete to authenticated
  using ((select private.can_operate()));

drop policy if exists user_access_history_owner_read on public.user_access_history;
create policy user_access_history_operator_read on public.user_access_history
  for select to authenticated
  using ((select private.can_operate()));

commit;
