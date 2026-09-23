-- Make workflow ownership a workspace setting, record monthly calendar
-- imports, and add provider-neutral tables for the later Zoho integration.
begin;

create table public.workflow_raci_defaults (
  stage public.pipeline_stage not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assignment_type public.assignment_type not null,
  created_at timestamptz not null default now(),
  primary key (stage, profile_id, assignment_type)
);

insert into public.workflow_raci_defaults (stage, profile_id, assignment_type)
select mapping.stage::public.pipeline_stage, p.id,
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

alter table public.workflow_raci_defaults enable row level security;
revoke all on table public.workflow_raci_defaults from public, anon, authenticated;
grant select on table public.workflow_raci_defaults to authenticated;
create policy workflow_raci_defaults_select
on public.workflow_raci_defaults for select to authenticated
using ((select private.current_user_active()));

create index workflow_raci_defaults_profile_idx
  on public.workflow_raci_defaults (profile_id, stage);

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
  select p_item_id, d.stage, d.profile_id, d.assignment_type
  from public.workflow_raci_defaults d
  on conflict do nothing;
end;
$$;

revoke all on function private.assign_default_raci(uuid)
  from public, anon, authenticated;

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
  if actor is null or not (select private.has_role('admin')) then
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

revoke all on function public.replace_workflow_raci_default(
  public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]
) from public, anon;
grant execute on function public.replace_workflow_raci_default(
  public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]
) to authenticated;

create table public.calendar_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  imported_by uuid not null references public.profiles(id),
  row_count integer not null default 0 check (row_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  window_start date,
  window_end date,
  created_at timestamptz not null default now()
);

alter table public.content_items
  add column import_batch_id uuid references public.calendar_import_batches(id)
    on delete set null;

do $$
declare
  initial_batch_id uuid;
  initial_importer uuid;
begin
  select id into initial_importer
  from public.profiles
  where team_key = 'aditi_owner'
  limit 1;

  if initial_importer is not null and exists (
    select 1 from public.content_items where source_key is not null
  ) then
    insert into public.calendar_import_batches (
      source_name, imported_by, row_count, imported_count,
      skipped_count, window_start, window_end, created_at
    )
    select
      'SMM Master Calendar FY 26-27.xlsx', initial_importer,
      count(*)::integer, count(*)::integer, 0,
      min(due_at)::date, max(due_at)::date, max(created_at)
    from public.content_items
    where source_key is not null
    returning id into initial_batch_id;

    update public.content_items
    set import_batch_id = initial_batch_id
    where source_key is not null and import_batch_id is null;
  end if;
end;
$$;

create index content_items_import_batch_idx
  on public.content_items (import_batch_id)
  where import_batch_id is not null;

alter table public.calendar_import_batches enable row level security;
revoke all on table public.calendar_import_batches from public, anon, authenticated;
grant select on table public.calendar_import_batches to authenticated;
create policy calendar_import_batches_select
on public.calendar_import_batches for select to authenticated
using ((select private.has_role('admin')));

create table public.integration_connections (
  id text primary key,
  provider text not null check (provider in ('zoho_social', 'zoho_analytics')),
  display_name text not null,
  status text not null default 'ready'
    check (status in ('disabled', 'ready', 'connected', 'error')),
  non_secret_settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(non_secret_settings) = 'object')
);

insert into public.integration_connections (id, provider, display_name)
values
  ('zoho_social', 'zoho_social', 'Zoho Social'),
  ('zoho_analytics', 'zoho_analytics', 'Zoho Analytics')
on conflict do nothing;

create table public.external_content_mappings (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  provider text not null check (provider in ('zoho_social', 'zoho_analytics')),
  external_id text not null,
  external_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  unique (content_item_id, provider)
);

create index external_content_mappings_item_idx
  on public.external_content_mappings (content_item_id, provider);

create table public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id text not null references public.integration_connections(id),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  initiated_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_read integer not null default 0 check (records_read >= 0),
  records_written integer not null default 0 check (records_written >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index integration_sync_runs_connection_started_idx
  on public.integration_sync_runs (connection_id, started_at desc);

alter table public.metrics_entries
  drop constraint if exists metrics_entries_source_check;
alter table public.metrics_entries
  add constraint metrics_entries_source_check
    check (source in ('manual', 'zoho_social', 'zoho_analytics')),
  add column external_mapping_id uuid
    references public.external_content_mappings(id) on delete set null,
  add column ingested_at timestamptz not null default now();

alter table public.integration_connections enable row level security;
alter table public.external_content_mappings enable row level security;
alter table public.integration_sync_runs enable row level security;

revoke all on table public.integration_connections,
  public.external_content_mappings,
  public.integration_sync_runs from public, anon, authenticated;
grant select on table public.integration_connections,
  public.integration_sync_runs to authenticated;
grant select on table public.external_content_mappings to authenticated;

create policy integration_connections_select
on public.integration_connections for select to authenticated
using ((select private.has_role('admin')));

create policy external_content_mappings_select
on public.external_content_mappings for select to authenticated
using ((select private.current_user_active()));

create policy integration_sync_runs_select
on public.integration_sync_runs for select to authenticated
using ((select private.has_role('admin')));

create or replace function public.bulk_import_content(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  item_id uuid;
  batch_id uuid;
  initial_stage public.pipeline_stage;
  initial_step text;
  v_imported_count integer := 0;
  v_skipped_count integer := 0;
  actor uuid := (select private.current_profile_id());
  source_name text;
  window_start date;
  window_end date;
begin
  if actor is null or not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can import the master calendar';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'Import must contain an array of at most 1000 rows';
  end if;

  select
    coalesce(nullif(value ->> 'import_source', ''), 'Master calendar'),
    min((value ->> 'due_at')::timestamptz)::date,
    max((value ->> 'due_at')::timestamptz)::date
  into source_name, window_start, window_end
  from jsonb_array_elements(p_items)
  group by 1
  order by count(*) desc
  limit 1;

  insert into public.calendar_import_batches (
    source_name, imported_by, row_count, window_start, window_end
  ) values (
    coalesce(source_name, 'Master calendar'), actor,
    jsonb_array_length(p_items), window_start, window_end
  ) returning id into batch_id;

  for payload in select value from jsonb_array_elements(p_items)
  loop
    item_id := null;
    initial_stage := coalesce(
      (payload ->> 'current_stage')::public.pipeline_stage,
      'idea'::public.pipeline_stage
    );
    if initial_stage not in ('idea', 'upload', 'post_upload_metrics') then
      raise exception 'Imported rows may start only in Idea, Upload or Post-Upload';
    end if;
    initial_step := coalesce(
      nullif(payload ->> 'workflow_step', ''),
      case initial_stage
        when 'upload' then 'Platform scheduling'
        when 'post_upload_metrics' then 'Publish confirmation'
        else 'Topic research'
      end
    );

    insert into public.content_items (
      title, content_type, platform, content_pillar, due_at, workflow_route,
      workflow_step, current_stage, published_at, created_by,
      source_key, source_label, import_batch_id
    ) values (
      trim(payload ->> 'title'), payload ->> 'content_type', payload ->> 'platform',
      (payload ->> 'content_pillar')::public.content_pillar,
      (payload ->> 'due_at')::timestamptz,
      coalesce(payload ->> 'workflow_route', 'design'),
      initial_step, initial_stage,
      case when initial_stage = 'post_upload_metrics'
        then (payload ->> 'due_at')::timestamptz else null end,
      actor, payload ->> 'source_key', payload ->> 'source_label', batch_id
    ) on conflict (source_key) where source_key is not null do nothing
    returning id into item_id;

    if item_id is null then
      v_skipped_count := v_skipped_count + 1;
    else
      perform private.assign_default_raci(item_id);
      insert into public.stage_history (
        content_item_id, to_stage, action, actor_id, note, metadata
      ) values (
        item_id, initial_stage, 'created', actor,
        'Imported from the master calendar',
        jsonb_build_object(
          'source_key', payload ->> 'source_key',
          'initial_stage', initial_stage,
          'import_batch_id', batch_id
        )
      );
      v_imported_count := v_imported_count + 1;
    end if;
  end loop;

  update public.calendar_import_batches set
    imported_count = v_imported_count,
    skipped_count = v_skipped_count
  where id = batch_id;

  return jsonb_build_object(
    'batch_id', batch_id,
    'imported', v_imported_count,
    'skipped', v_skipped_count
  );
end;
$$;

revoke all on function public.bulk_import_content(jsonb) from public, anon;
grant execute on function public.bulk_import_content(jsonb) to authenticated;

create index if not exists stage_history_to_stage_created_idx
  on public.stage_history (to_stage, created_at desc)
  where to_stage is not null;
create index if not exists item_stage_assignments_profile_stage_idx
  on public.item_stage_assignments (profile_id, stage, content_item_id);

commit;
