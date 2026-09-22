-- Restore the submitted operating team independently of login identities,
-- repair seeded RACI ownership, add route-aware handoffs, and support the
-- master-calendar import without deleting discussion or history.
begin;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column email drop not null;
alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists responsibility text,
  add column if not exists team_key text;

update public.profiles
set auth_user_id = id
where auth_user_id is null
  and exists (select 1 from auth.users u where u.id = public.profiles.id);

create unique index if not exists profiles_auth_user_id_key
  on public.profiles (auth_user_id) where auth_user_id is not null;
create unique index if not exists profiles_team_key_key
  on public.profiles (team_key) where team_key is not null;

update public.profiles set
  team_key = 'aditi_owner',
  full_name = 'Aditi Chourasia',
  responsibility = 'Protected workspace Owner; access and role governance',
  is_active = true
where lower(email) = 'aditi@buildablelabs.com';

insert into public.profiles (
  id, email, full_name, is_active, responsibility, team_key
) values
  (gen_random_uuid(), null, 'Priya', false,
    'Strategy, calendar supervision and final brand approval', 'priya'),
  (gen_random_uuid(), null, 'Chhahal', false,
    'Publishing, calendar coordination and post-upload follow-through', 'chhahal'),
  (gen_random_uuid(), null, 'Harshit', false,
    'Content, scripts, creatives, recording and quality control', 'harshit'),
  (gen_random_uuid(), null, 'Piyush', false,
    'Reels, podcasts and short-form production', 'piyush'),
  (gen_random_uuid(), null, 'Kapil', false,
    'Static creatives, LinkedIn posts and carousels', 'kapil'),
  (gen_random_uuid(), null, 'Jai', false,
    'Video shoots, equipment, course videos and testimonials', 'jai'),
  (gen_random_uuid(), null, 'Pawas', false,
    'Technical accuracy and financial compliance', 'pawas'),
  (gen_random_uuid(), null, 'KM', false,
    'Technical accuracy and financial compliance', 'km'),
  (gen_random_uuid(), null, 'Department HODs', false,
    'Topic research and subject-matter inputs', 'department_hods')
on conflict (team_key) where team_key is not null do update set
  full_name = excluded.full_name,
  responsibility = excluded.responsibility;

insert into public.user_roles (profile_id, role)
select p.id, planned.role::public.app_role
from (
  values
    ('priya', 'admin'), ('priya', 'content_approver'),
    ('chhahal', 'content_producer'), ('chhahal', 'monitoring'),
    ('harshit', 'content_producer'), ('harshit', 'content_approver'),
    ('piyush', 'content_producer'),
    ('kapil', 'content_producer'),
    ('jai', 'content_producer'),
    ('pawas', 'content_approver'),
    ('km', 'content_approver'),
    ('department_hods', 'content_producer')
) as planned(team_key, role)
join public.profiles p on p.team_key = planned.team_key
on conflict do nothing;

alter table public.content_items
  add column if not exists workflow_route text not null default 'full',
  add column if not exists source_key text,
  add column if not exists source_label text;

alter table public.content_items
  drop constraint if exists content_items_content_type_check,
  drop constraint if exists content_items_platform_check,
  drop constraint if exists content_items_check,
  drop constraint if exists content_items_workflow_route_check;

alter table public.content_items
  add constraint content_items_content_type_check
    check (content_type in ('Reel', 'Post', 'Carousel', 'Short', 'Video')),
  add constraint content_items_platform_check
    check (platform in ('Instagram', 'YouTube', 'LinkedIn', 'Facebook', 'X', 'Multi-platform')),
  add constraint content_items_platform_type_check check (
    (platform = 'Instagram' and content_type in ('Reel', 'Post', 'Carousel'))
    or (platform = 'YouTube' and content_type in ('Short', 'Video'))
    or (platform in ('LinkedIn', 'Facebook', 'Multi-platform') and content_type in ('Post', 'Carousel'))
    or (platform = 'X' and content_type = 'Post')
  ),
  add constraint content_items_workflow_route_check
    check (workflow_route in ('full', 'design', 'ad_hoc')),
  add constraint content_items_source_key_length_check
    check (source_key is null or char_length(source_key) <= 500);

create unique index if not exists content_items_source_key_key
  on public.content_items (source_key) where source_key is not null;

update public.content_items
set workflow_route = case
  when content_type in ('Post', 'Carousel') then 'design'
  else 'full'
end;

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.current_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_user_id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_owners o
    where o.profile_id = (select private.current_profile_id())
  );
$$;

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
      select 1 from public.user_roles r
      where r.profile_id = (select private.current_profile_id())
        and r.role = required_role
    )
  );
$$;

create or replace function private.is_assigned(
  item_id uuid,
  assignment public.assignment_type default null,
  item_stage public.pipeline_stage default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.item_stage_assignments a
    where a.content_item_id = item_id
      and a.profile_id = (select private.current_profile_id())
      and (assignment is null or a.assignment_type = assignment)
      and (item_stage is null or a.stage = item_stage)
  );
$$;

create or replace function private.can_manage_cadence(p_cadence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_user_active()) and (
    (select private.has_role('admin'))
    or exists (
      select 1 from public.operating_cadences c
      where c.id = p_cadence_id
        and c.owner_id = (select private.current_profile_id())
    )
    or exists (
      select 1 from public.cadence_participants p
      where p.cadence_id = p_cadence_id
        and p.profile_id = (select private.current_profile_id())
    )
  );
$$;

revoke all on function private.current_profile_id() from public, anon;
grant execute on function private.current_profile_id() to authenticated, service_role;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  is_designated_owner boolean := lower(coalesce(new.email, '')) = 'aditi@buildablelabs.com';
begin
  if is_designated_owner then
    select id into target_profile_id
    from public.profiles where team_key = 'aditi_owner' limit 1;
  else
    select id into target_profile_id
    from public.profiles
    where email is not null and lower(email) = lower(new.email)
    limit 1;
  end if;

  if target_profile_id is null then
    insert into public.profiles (
      id, auth_user_id, email, full_name, is_active
    ) values (
      gen_random_uuid(), new.id, lower(new.email),
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      is_designated_owner
    ) returning id into target_profile_id;
  else
    update public.profiles set
      auth_user_id = new.id,
      email = lower(new.email),
      full_name = coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        public.profiles.full_name
      ),
      is_active = public.profiles.is_active or is_designated_owner
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

drop policy if exists items_create on public.content_items;
create policy items_create on public.content_items for insert to authenticated
with check (
  (select private.has_role('admin'))
  or (
    (select private.has_role('content_producer'))
    and created_by = (select private.current_profile_id())
  )
);

drop policy if exists reviews_create on public.stage_reviews;
create policy reviews_create on public.stage_reviews for insert to authenticated
with check (
  (select private.has_role('admin'))
  or (
    (select private.has_role('content_approver'))
    and reviewer_id = (select private.current_profile_id())
  )
);

drop policy if exists reviews_update on public.stage_reviews;
create policy reviews_update on public.stage_reviews for update to authenticated
using (
  (select private.has_role('admin'))
  or reviewer_id = (select private.current_profile_id())
)
with check (
  (select private.has_role('admin'))
  or reviewer_id = (select private.current_profile_id())
);

drop policy if exists comments_create on public.comments;
create policy comments_create on public.comments for insert to authenticated
with check (
  author_id = (select private.current_profile_id())
  and (select private.can_view_item(content_item_id))
  and not (select private.has_role('read_only_stakeholder'))
);

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
using (author_id = (select private.current_profile_id()))
with check (author_id = (select private.current_profile_id()));

drop policy if exists requests_create on public.department_requests;
create policy requests_create on public.department_requests for insert to authenticated
with check (
  created_by = (select private.current_profile_id())
  and (
    (select private.has_role('content_producer'))
    or (select private.has_role('admin'))
  )
);

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
using (recipient_id = (select private.current_profile_id()));

drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated
using (recipient_id = (select private.current_profile_id()))
with check (recipient_id = (select private.current_profile_id()));

drop policy if exists operating_cadences_insert on public.operating_cadences;
create policy operating_cadences_insert on public.operating_cadences for insert to authenticated
with check (
  (select private.has_role('admin'))
  and created_by = (select private.current_profile_id())
);

drop policy if exists cadence_runs_insert on public.cadence_runs;
create policy cadence_runs_insert on public.cadence_runs for insert to authenticated
with check (
  (select private.can_manage_cadence(cadence_id))
  and (status <> 'complete' or completed_by = (select private.current_profile_id()))
);

drop policy if exists cadence_runs_update on public.cadence_runs;
create policy cadence_runs_update on public.cadence_runs for update to authenticated
using ((select private.can_manage_cadence(cadence_id)))
with check (
  (select private.can_manage_cadence(cadence_id))
  and (status <> 'complete' or completed_by = (select private.current_profile_id()))
);

create or replace function private.assign_default_raci(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.item_stage_assignments where content_item_id = p_item_id;
  insert into public.item_stage_assignments (
    content_item_id, stage, profile_id, assignment_type
  )
  select p_item_id, mapping.stage::public.pipeline_stage, p.id,
    mapping.assignment::public.assignment_type
  from (
    values
      ('idea','chhahal','responsible'), ('idea','harshit','responsible'),
      ('idea','priya','accountable'),
      ('idea','department_hods','consulted'),
      ('idea','aditi_owner','informed'),
      ('script','harshit','responsible'), ('script','piyush','responsible'),
      ('script','priya','accountable'), ('script','pawas','accountable'), ('script','km','accountable'),
      ('script','department_hods','consulted'),
      ('script','chhahal','informed'),
      ('shoot','jai','responsible'), ('shoot','harshit','responsible'),
      ('shoot','priya','accountable'),
      ('shoot','piyush','consulted'),
      ('shoot','chhahal','informed'), ('shoot','aditi_owner','informed'),
      ('production','piyush','responsible'), ('production','kapil','responsible'),
      ('production','harshit','accountable'), ('production','priya','accountable'),
      ('production','pawas','consulted'), ('production','km','consulted'),
      ('production','chhahal','informed'),
      ('upload','chhahal','responsible'),
      ('upload','priya','accountable'),
      ('upload','harshit','consulted'),
      ('upload','aditi_owner','informed'),
      ('post_upload_metrics','chhahal','responsible'),
      ('post_upload_metrics','priya','accountable'),
      ('post_upload_metrics','harshit','consulted'),
      ('post_upload_metrics','aditi_owner','informed')
  ) as mapping(stage, team_key, assignment)
  join public.profiles p on p.team_key = mapping.team_key
  on conflict do nothing;
end;
$$;

revoke all on function private.assign_default_raci(uuid)
  from public, anon, authenticated;

create or replace function public.create_content_item(
  p_title text,
  p_content_type text,
  p_platform text,
  p_pillar public.content_pillar,
  p_due_at timestamptz,
  p_workflow_route text,
  p_accountable_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_id uuid;
  initial_stage public.pipeline_stage;
  actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (
    (select private.has_role('admin')) or (select private.has_role('content_producer'))
  ) then raise exception 'This login cannot create content'; end if;
  if p_workflow_route not in ('full', 'design', 'ad_hoc') then
    raise exception 'Choose a valid workflow route';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_accountable_ids, '{}')) assigned(profile_id)
    where not exists (select 1 from public.profiles p where p.id = assigned.profile_id)
  ) then raise exception 'Choose accountable people from the team directory'; end if;

  initial_stage := case when p_workflow_route = 'ad_hoc'
    then 'production'::public.pipeline_stage else 'idea'::public.pipeline_stage end;

  insert into public.content_items (
    title, content_type, platform, content_pillar, due_at, workflow_route,
    workflow_step, current_stage, created_by
  ) values (
    trim(p_title), p_content_type, p_platform, p_pillar, p_due_at,
    p_workflow_route,
    case when p_workflow_route = 'ad_hoc' then 'Ad hoc publish check' else 'Topic research' end,
    initial_stage, actor
  ) returning id into item_id;

  perform private.assign_default_raci(item_id);
  if coalesce(cardinality(p_accountable_ids), 0) > 0 then
    delete from public.item_stage_assignments
    where content_item_id = item_id and stage = initial_stage
      and assignment_type = 'accountable';
    insert into public.item_stage_assignments (
      content_item_id, stage, profile_id, assignment_type
    ) select item_id, initial_stage, unnest(p_accountable_ids), 'accountable';
  end if;

  insert into public.stage_history (
    content_item_id, to_stage, action, actor_id, note, metadata
  ) values (
    item_id, initial_stage, 'created', actor,
    case when p_workflow_route = 'ad_hoc'
      then 'Ad hoc item entered at the publish-readiness checkpoint'
      else 'Content item created' end,
    jsonb_build_object('workflow_route', p_workflow_route)
  );
  return item_id;
end;
$$;

revoke all on function public.create_content_item(
  text, text, text, public.content_pillar, timestamptz, text, uuid[]
) from public, anon;
grant execute on function public.create_content_item(
  text, text, text, public.content_pillar, timestamptz, text, uuid[]
) to authenticated;

create or replace function public.bulk_import_content(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  item_id uuid;
  imported_count integer := 0;
  skipped_count integer := 0;
  actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can import the master calendar';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'Import must contain an array of at most 1000 rows';
  end if;

  for payload in select value from jsonb_array_elements(p_items)
  loop
    item_id := null;
    insert into public.content_items (
      title, content_type, platform, content_pillar, due_at, workflow_route,
      workflow_step, current_stage, created_by, source_key, source_label
    ) values (
      trim(payload ->> 'title'), payload ->> 'content_type', payload ->> 'platform',
      (payload ->> 'content_pillar')::public.content_pillar,
      (payload ->> 'due_at')::timestamptz,
      coalesce(payload ->> 'workflow_route', 'design'),
      'Topic research', 'idea', actor,
      payload ->> 'source_key', payload ->> 'source_label'
    ) on conflict (source_key) where source_key is not null do nothing
    returning id into item_id;

    if item_id is null then
      skipped_count := skipped_count + 1;
    else
      perform private.assign_default_raci(item_id);
      insert into public.stage_history (
        content_item_id, to_stage, action, actor_id, note, metadata
      ) values (
        item_id, 'idea', 'created', actor, 'Imported from the master calendar',
        jsonb_build_object('source_key', payload ->> 'source_key')
      );
      imported_count := imported_count + 1;
    end if;
  end loop;
  return jsonb_build_object('imported', imported_count, 'skipped', skipped_count);
end;
$$;

revoke all on function public.bulk_import_content(jsonb) from public, anon;
grant execute on function public.bulk_import_content(jsonb) to authenticated;

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
  if actor is null or not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can edit RACI assignments';
  end if;
  if coalesce(cardinality(p_responsible_ids), 0) = 0
    or coalesce(cardinality(p_accountable_ids), 0) = 0 then
    raise exception 'Every stage requires at least one Responsible and one Accountable person';
  end if;
  if exists (
    select 1
    from unnest(p_responsible_ids || p_accountable_ids || p_consulted_ids || p_informed_ids) assigned(profile_id)
    where not exists (select 1 from public.profiles p where p.id = assigned.profile_id)
  ) then raise exception 'RACI assignments must use the team directory'; end if;

  delete from public.item_stage_assignments
  where content_item_id = p_item_id and stage = p_stage;
  insert into public.item_stage_assignments (
    content_item_id, stage, profile_id, assignment_type
  )
  select p_item_id, p_stage, profile_id, assignment_type::public.assignment_type
  from (
    select unnest(p_responsible_ids) profile_id, 'responsible' assignment_type
    union all select unnest(p_accountable_ids), 'accountable'
    union all select unnest(p_consulted_ids), 'consulted'
    union all select unnest(p_informed_ids), 'informed'
  ) assignments on conflict do nothing;

  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note, metadata
  ) values (
    p_item_id, p_stage, p_stage, 'edited', actor, 'RACI assignments updated',
    jsonb_build_object(
      'responsible_count', cardinality(p_responsible_ids),
      'accountable_count', cardinality(p_accountable_ids),
      'consulted_count', cardinality(p_consulted_ids),
      'informed_count', cardinality(p_informed_ids)
    )
  );
end;
$$;

create or replace function public.submit_current_stage(p_item_id uuid)
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
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if item.lifecycle <> 'active' then raise exception 'Only active items can be submitted'; end if;
  if item.stage_status not in ('in_progress', 'changes_requested') then
    raise exception 'This stage is already awaiting approval';
  end if;
  if not (
    (select private.has_role('admin'))
    or (select private.is_assigned(item.id, 'responsible', item.current_stage))
    or (select private.is_assigned(item.id, 'accountable', item.current_stage))
  ) then raise exception 'You are not assigned to submit this stage'; end if;

  update public.content_items set stage_status = 'pending_approval'
  where id = item.id returning * into item;
  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id
  ) values (item.id, item.current_stage, item.current_stage, 'submitted', actor);
  insert into public.notifications (
    recipient_id, content_item_id, kind, title, body, dedupe_key
  )
  select a.profile_id, item.id, 'approval_needed', 'Approval needed: ' || item.title,
    'The ' || replace(item.current_stage::text, '_', ' ') || ' stage is ready for your approval.',
    'approval:' || item.id::text || ':' || item.current_stage::text || ':' || a.profile_id::text
  from public.item_stage_assignments a
  where a.content_item_id = item.id and a.stage = item.current_stage
    and a.assignment_type = 'accountable'
  on conflict (dedupe_key) do update set created_at = now(), read_at = null;
  return item;
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
  if not (
    (select private.has_role('admin'))
    or (select private.is_assigned(item.id, 'accountable', item.current_stage))
  ) then raise exception 'Only an accountable owner can advance this stage'; end if;

  if item.current_stage in ('script', 'production') then
    select exists (
      select 1 from public.stage_reviews
      where content_item_id = item.id and stage = item.current_stage
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
    select item.created_by = actor or exists (
      select 1 from public.item_stage_assignments a
      where a.content_item_id = item.id and a.profile_id = actor
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
      stage_status = 'approved', lifecycle = 'closed', closed_at = now(), due_at = null
    where id = item.id returning * into item;
    insert into public.stage_history (
      content_item_id, from_stage, to_stage, action, actor_id, note, metadata
    ) values (
      item.id, previous_stage, null, 'closed', actor, p_override_reason,
      jsonb_build_object('workflow_route', item.workflow_route)
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
      item.id, previous_stage, next_stage, history_kind, actor, p_override_reason,
      jsonb_build_object(
        'second_lens_approved', has_second_lens,
        'maker_self_approval', is_maker,
        'workflow_route', item.workflow_route,
        'skipped_stages', to_jsonb(skipped)
      )
    );
  end if;
  return item;
end;
$$;

create or replace function public.request_stage_changes(p_item_id uuid, p_note text)
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
    (select private.has_role('admin'))
    or (select private.is_assigned(item.id, 'accountable', item.current_stage))
  ) then raise exception 'Only an accountable owner can request changes'; end if;
  update public.content_items set stage_status = 'changes_requested'
  where id = item.id returning * into item;
  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note
  ) values (
    item.id, item.current_stage, item.current_stage, 'changes_requested', actor, p_note
  );
  return item;
end;
$$;

create or replace function public.update_content_item_metadata(
  p_item_id uuid, p_title text, p_content_type text, p_platform text,
  p_due_at timestamptz, p_reminder_hours smallint
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
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if not (
    (select private.has_role('admin'))
    or (select private.is_assigned(item.id, 'responsible', item.current_stage))
  ) then raise exception 'Not authorized to edit this item'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then raise exception 'A title is required'; end if;
  if p_reminder_hours not between 0 and 720 then
    raise exception 'Reminder lead time must be between 0 and 720 hours';
  end if;
  update public.content_items set
    title = trim(p_title), content_type = p_content_type, platform = p_platform,
    due_at = p_due_at, reminder_hours_before = p_reminder_hours
  where id = item.id returning * into item;
  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note
  ) values (
    item.id, item.current_stage, item.current_stage, 'edited', actor, 'Item details updated'
  );
  return item;
end;
$$;

create or replace function public.update_workflow_step(
  p_item_id uuid, p_workflow_step text
)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.content_items;
  allowed_steps text[];
  actor uuid := (select private.current_profile_id());
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if not (
    (select private.has_role('admin'))
    or (select private.is_assigned(item.id, 'responsible', item.current_stage))
  ) then raise exception 'Not authorized to update this checkpoint'; end if;
  allowed_steps := case item.current_stage
    when 'idea' then array['Topic research', 'HOD input', 'Calendar slot']
    when 'script' then array['Drafting', 'Subject-matter validation', 'Financial compliance']
    when 'shoot' then array['Shoot brief', 'Recording']
    when 'production' then case when item.workflow_route = 'ad_hoc'
      then array['Ad hoc publish check']
      else array['Edit or design', 'Harshit quality check', 'Priya final approval'] end
    when 'upload' then array['Platform scheduling', 'Publishing']
    else array['Publish confirmation', 'Live link captured', 'Learning note']
  end;
  if not (p_workflow_step = any(allowed_steps)) then
    raise exception 'Checkpoint does not belong to the current route and stage';
  end if;
  update public.content_items set workflow_step = p_workflow_step
  where id = item.id returning * into item;
  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note
  ) values (
    item.id, item.current_stage, item.current_stage, 'edited', actor,
    'Checkpoint moved to ' || p_workflow_step
  );
  return item;
end;
$$;

create or replace function public.set_comment_resolution(
  p_comment_id bigint, p_resolved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  feedback public.comments%rowtype;
  item_title text;
  actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.current_user_active()) then
    raise exception 'Active authentication is required';
  end if;
  select * into feedback from public.comments where id = p_comment_id for update;
  if feedback.id is null then raise exception 'Feedback not found'; end if;
  if feedback.kind <> 'feedback' then raise exception 'Only feedback can be resolved'; end if;
  if not (
    (select private.has_role('admin')) or feedback.author_id = actor
    or (select private.is_assigned(feedback.content_item_id, null::public.assignment_type, feedback.stage))
  ) then raise exception 'You are not assigned to resolve this feedback'; end if;
  update public.comments set
    resolved_at = case when p_resolved then now() else null end,
    resolved_by = case when p_resolved then actor else null end
  where id = p_comment_id;
  select title into item_title from public.content_items where id = feedback.content_item_id;
  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note, metadata
  ) values (
    feedback.content_item_id, feedback.stage, feedback.stage, 'edited', actor,
    case when p_resolved then 'Feedback resolved' else 'Feedback reopened' end,
    jsonb_build_object('comment_id', feedback.id, 'comment_kind', feedback.kind)
  );
  if p_resolved and feedback.author_id <> actor then
    insert into public.notifications (
      recipient_id, content_item_id, kind, title, body, dedupe_key
    ) values (
      feedback.author_id, feedback.content_item_id, 'feedback_resolved',
      'Feedback resolved: ' || item_title,
      'Your ' || replace(feedback.stage::text, '_', ' ') || ' feedback was marked resolved.',
      'feedback-resolved:' || feedback.id::text
    ) on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

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
  if actor is null or not (select private.is_owner()) then
    raise exception 'Only Aditi, the workspace Owner, can manage access';
  end if;
  if exists (select 1 from public.workspace_owners where profile_id = p_profile_id) then
    raise exception 'Owner access is protected and cannot be changed here';
  end if;
  select * into target from public.profiles where id = p_profile_id for update;
  if target.id is null then raise exception 'Profile not found'; end if;
  if p_is_active and target.auth_user_id is null then
    raise exception 'Invite this person before activating app access';
  end if;
  select coalesce(array_agg(distinct role), '{}'::public.app_role[])
  into normalized_roles from unnest(coalesce(p_roles, '{}')) role;
  if p_is_active and coalesce(cardinality(normalized_roles), 0) = 0 then
    raise exception 'An active user needs at least one responsibility';
  end if;
  update public.profiles set is_active = p_is_active where id = p_profile_id;
  delete from public.user_roles where profile_id = p_profile_id;
  insert into public.user_roles (profile_id, role)
  select p_profile_id, role from unnest(normalized_roles) role;
  insert into public.user_access_history (
    actor_id, target_profile_id, target_active, target_roles
  ) values (actor, p_profile_id, p_is_active, normalized_roles);
end;
$$;

create or replace function public.save_operating_cadence(
  p_cadence_id uuid,
  p_name text,
  p_purpose text,
  p_frequency public.cadence_frequency,
  p_weekday smallint,
  p_day_of_month smallint,
  p_time time,
  p_owner_id uuid,
  p_stage public.pipeline_stage,
  p_deliverable text,
  p_reminder_hours smallint,
  p_is_active boolean,
  p_participant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cadence_id uuid;
  previous public.operating_cadences%rowtype;
  actor uuid := (select private.current_profile_id());
begin
  if actor is null or not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can configure operating cadence';
  end if;
  if p_owner_id is null or exists (
    select 1 from unnest(array[p_owner_id] || coalesce(p_participant_ids, '{}')) assigned(profile_id)
    where not exists (select 1 from public.profiles p where p.id = assigned.profile_id)
  ) then raise exception 'Cadence people must come from the team directory'; end if;
  if p_cadence_id is null then
    insert into public.operating_cadences (
      name, purpose, frequency, weekday, day_of_month, time_of_day,
      owner_id, stage, deliverable, reminder_hours_before, is_active, created_by
    ) values (
      p_name, p_purpose, p_frequency, p_weekday, p_day_of_month, p_time,
      p_owner_id, p_stage, p_deliverable, p_reminder_hours, p_is_active, actor
    ) returning id into v_cadence_id;
  else
    select * into previous from public.operating_cadences
    where id = p_cadence_id for update;
    if not found then raise exception 'Cadence does not exist'; end if;
    v_cadence_id := p_cadence_id;
    update public.operating_cadences set
      name = p_name, purpose = p_purpose, frequency = p_frequency,
      weekday = p_weekday, day_of_month = p_day_of_month, time_of_day = p_time,
      owner_id = p_owner_id, stage = p_stage, deliverable = p_deliverable,
      reminder_hours_before = p_reminder_hours, is_active = p_is_active
    where id = v_cadence_id;
    if not p_is_active or previous.frequency is distinct from p_frequency
      or previous.weekday is distinct from p_weekday
      or previous.day_of_month is distinct from p_day_of_month
      or previous.time_of_day is distinct from p_time then
      delete from public.cadence_runs
      where cadence_id = v_cadence_id and status = 'upcoming';
    end if;
  end if;
  delete from public.cadence_participants where cadence_id = v_cadence_id;
  insert into public.cadence_participants (cadence_id, profile_id)
  select v_cadence_id, unnest(coalesce(p_participant_ids, '{}'))
  on conflict do nothing;
  return v_cadence_id;
end;
$$;

-- Repair only the seeded walkthrough items. User-created records, comments and
-- append-only history remain intact.
do $$
declare
  seeded_item uuid;
  priya_id uuid;
  chhahal_id uuid;
  harshit_id uuid;
  jai_id uuid;
  pawas_id uuid;
begin
  for seeded_item in
    select distinct h.content_item_id from public.stage_history h
    where h.metadata ->> 'seeded_demo' = 'true'
  loop
    perform private.assign_default_raci(seeded_item);
  end loop;

  select id into priya_id from public.profiles where team_key = 'priya';
  select id into chhahal_id from public.profiles where team_key = 'chhahal';
  select id into harshit_id from public.profiles where team_key = 'harshit';
  select id into jai_id from public.profiles where team_key = 'jai';
  select id into pawas_id from public.profiles where team_key = 'pawas';

  update public.operating_cadences set owner_id = case
    when lower(name) like '%planning%' then priya_id
    when lower(name) like '%script%' then harshit_id
    when lower(name) like '%shoot%' then jai_id
    when lower(name) like '%approval%' then priya_id
    when lower(name) like '%publishing%' then chhahal_id
    else owner_id end
  where created_by in (select profile_id from public.workspace_owners);

  update public.stage_reviews r set reviewer_id = case r.stage
    when 'script' then pawas_id else harshit_id end
  where r.content_item_id in (
    select h.content_item_id from public.stage_history h
    where h.metadata ->> 'seeded_demo' = 'true'
  );

  update public.comments c set author_id = case c.stage
    when 'script' then pawas_id
    when 'production' then harshit_id
    when 'upload' then priya_id
    else c.author_id end
  where c.content_item_id in (
    select h.content_item_id from public.stage_history h
    where h.metadata ->> 'seeded_demo' = 'true'
  );

  delete from public.notifications n
  where n.content_item_id in (
    select h.content_item_id from public.stage_history h
    where h.metadata ->> 'seeded_demo' = 'true'
  ) and n.kind = 'raci_assigned';
end;
$$;

commit;
