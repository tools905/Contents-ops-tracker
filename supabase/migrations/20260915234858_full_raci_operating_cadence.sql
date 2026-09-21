-- Complete the RACI model and add configurable weekly/monthly operating cadence.
alter type public.assignment_type add value if not exists 'consulted';
alter type public.assignment_type add value if not exists 'informed';
alter type public.notification_kind add value if not exists 'raci_assigned';
alter type public.notification_kind add value if not exists 'cadence_due';

create type public.cadence_frequency as enum ('weekly', 'monthly');
create type public.cadence_run_status as enum ('upcoming', 'complete', 'skipped');

create table public.operating_cadences (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 120),
  purpose text not null check (char_length(trim(purpose)) between 3 and 500),
  frequency public.cadence_frequency not null,
  weekday smallint check (weekday between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 28),
  time_of_day time not null,
  timezone text not null default 'Asia/Kolkata' check (timezone = 'Asia/Kolkata'),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  stage public.pipeline_stage,
  deliverable text not null check (char_length(trim(deliverable)) between 3 and 500),
  reminder_hours_before smallint not null default 24 check (reminder_hours_before between 0 and 720),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operating_cadence_schedule_check check (
    (frequency = 'weekly' and weekday is not null and day_of_month is null)
    or (frequency = 'monthly' and weekday is null and day_of_month is not null)
  )
);

create table public.cadence_participants (
  cadence_id uuid not null references public.operating_cadences(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cadence_id, profile_id)
);

create table public.cadence_runs (
  id bigint generated always as identity primary key,
  cadence_id uuid not null references public.operating_cadences(id) on delete cascade,
  scheduled_for timestamptz not null,
  status public.cadence_run_status not null default 'upcoming',
  notes text,
  completed_by uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cadence_id, scheduled_for),
  constraint cadence_run_completion_check check (
    (status = 'complete' and completed_by is not null and completed_at is not null)
    or (status <> 'complete')
  )
);

create index item_stage_assignments_profile_type_stage_idx
  on public.item_stage_assignments (profile_id, assignment_type, stage);
create index operating_cadences_owner_active_idx
  on public.operating_cadences (owner_id, is_active);
create index operating_cadences_creator_idx
  on public.operating_cadences (created_by);
create index operating_cadences_frequency_idx
  on public.operating_cadences (frequency, weekday, day_of_month)
  where is_active;
create index cadence_participants_profile_idx
  on public.cadence_participants (profile_id, cadence_id);
create index cadence_runs_schedule_idx
  on public.cadence_runs (scheduled_for, status);
create index cadence_runs_completed_by_idx
  on public.cadence_runs (completed_by);
create index cadence_runs_cadence_schedule_idx
  on public.cadence_runs (cadence_id, scheduled_for desc);

create trigger operating_cadences_touch
before update on public.operating_cadences
for each row execute function private.touch_updated_at();

create trigger cadence_runs_touch
before update on public.cadence_runs
for each row execute function private.touch_updated_at();

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
      select 1
      from public.operating_cadences c
      where c.id = p_cadence_id and c.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.cadence_participants p
      where p.cadence_id = p_cadence_id and p.profile_id = (select auth.uid())
    )
  );
$$;

revoke all on function private.can_manage_cadence(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_manage_cadence(uuid) to authenticated;

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
-- A narrow atomic command: authorization is checked before touching assignments
-- or the append-only audit log, which clients cannot write directly.
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can edit RACI assignments';
  end if;
  if coalesce(cardinality(p_responsible_ids), 0) = 0 or coalesce(cardinality(p_accountable_ids), 0) = 0 then
    raise exception 'Every stage requires at least one Responsible and one Accountable person';
  end if;
  if exists (
    select 1 from unnest(p_responsible_ids || p_accountable_ids || p_consulted_ids || p_informed_ids) as assigned(profile_id)
    where not exists (select 1 from public.profiles p where p.id = assigned.profile_id and p.is_active)
  ) then
    raise exception 'RACI assignments must use active team members';
  end if;

  delete from public.item_stage_assignments
  where content_item_id = p_item_id and stage = p_stage;

  insert into public.item_stage_assignments (content_item_id, stage, profile_id, assignment_type)
  select p_item_id, p_stage, profile_id, assignment_type::public.assignment_type
  from (
    select unnest(p_responsible_ids) as profile_id, 'responsible'::text as assignment_type
    union all
    select unnest(p_accountable_ids), 'accountable'::text
    union all
    select unnest(p_consulted_ids), 'consulted'::text
    union all
    select unnest(p_informed_ids), 'informed'::text
  ) assignments
  on conflict do nothing;

  insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id, note, metadata)
  values (
    p_item_id,
    p_stage,
    p_stage,
    'edited',
    (select auth.uid()),
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

revoke all on function public.replace_stage_raci(uuid, public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.replace_stage_raci(uuid, public.pipeline_stage, uuid[], uuid[], uuid[], uuid[]) to authenticated;

alter table public.operating_cadences enable row level security;
alter table public.cadence_participants enable row level security;
alter table public.cadence_runs enable row level security;

revoke all on public.operating_cadences, public.cadence_participants, public.cadence_runs from anon, authenticated;
grant select, insert, update, delete on public.operating_cadences, public.cadence_participants, public.cadence_runs to authenticated, service_role;
grant usage, select on sequence public.cadence_runs_id_seq to authenticated, service_role;

create policy operating_cadences_read
on public.operating_cadences
for select
to authenticated
using ((select private.current_user_active()));

create policy operating_cadences_insert
on public.operating_cadences
for insert
to authenticated
with check ((select private.has_role('admin')) and created_by = (select auth.uid()));

create policy operating_cadences_update
on public.operating_cadences
for update
to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy operating_cadences_delete
on public.operating_cadences
for delete
to authenticated
using ((select private.has_role('admin')));

create policy cadence_participants_read
on public.cadence_participants
for select
to authenticated
using ((select private.current_user_active()));

create policy cadence_participants_insert
on public.cadence_participants
for insert
to authenticated
with check ((select private.has_role('admin')));

create policy cadence_participants_delete
on public.cadence_participants
for delete
to authenticated
using ((select private.has_role('admin')));

create policy cadence_runs_read
on public.cadence_runs
for select
to authenticated
using ((select private.current_user_active()));

create policy cadence_runs_insert
on public.cadence_runs
for insert
to authenticated
with check ((select private.can_manage_cadence(cadence_id)) and (status <> 'complete' or completed_by = (select auth.uid())));

create policy cadence_runs_update
on public.cadence_runs
for update
to authenticated
using ((select private.can_manage_cadence(cadence_id)))
with check ((select private.can_manage_cadence(cadence_id)) and (status <> 'complete' or completed_by = (select auth.uid())));

create policy cadence_runs_delete
on public.cadence_runs
for delete
to authenticated
using ((select private.has_role('admin')));

comment on table public.operating_cadences is 'Configurable weekly and monthly operating rhythms in Asia/Kolkata.';
comment on table public.cadence_runs is 'Dated cadence occurrences and their completion state.';

-- Save the recurrence rule and its membership in one transaction. An invalid
-- participant must never leave a cadence partially updated.
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
declare v_cadence_id uuid;
declare previous public.operating_cadences%rowtype;
begin
  if (select auth.uid()) is null or not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can configure operating cadence';
  end if;
  if p_owner_id is null or exists (
    select 1 from unnest(array[p_owner_id] || coalesce(p_participant_ids, '{}')) as assigned(profile_id)
    where not exists (select 1 from public.profiles p where p.id = assigned.profile_id and p.is_active)
  ) then
    raise exception 'Cadence owners and participants must be active team members';
  end if;

  if p_cadence_id is null then
    insert into public.operating_cadences (
      name, purpose, frequency, weekday, day_of_month, time_of_day,
      owner_id, stage, deliverable, reminder_hours_before, is_active, created_by
    ) values (
      p_name, p_purpose, p_frequency, p_weekday, p_day_of_month, p_time,
      p_owner_id, p_stage, p_deliverable, p_reminder_hours, p_is_active, (select auth.uid())
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
      delete from public.cadence_runs r
      where r.cadence_id = v_cadence_id and r.status = 'upcoming';
    end if;
  end if;

  delete from public.cadence_participants p where p.cadence_id = v_cadence_id;
  insert into public.cadence_participants (cadence_id, profile_id)
  select v_cadence_id, unnest(coalesce(p_participant_ids, '{}')) on conflict do nothing;
  return v_cadence_id;
end;
$$;

revoke all on function public.save_operating_cadence(uuid, text, text, public.cadence_frequency, smallint, smallint, time, uuid, public.pipeline_stage, text, smallint, boolean, uuid[]) from public, anon;
grant execute on function public.save_operating_cadence(uuid, text, text, public.cadence_frequency, smallint, smallint, time, uuid, public.pipeline_stage, text, smallint, boolean, uuid[]) to authenticated;

create or replace function private.queue_raci_assignment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare item_title text;
begin
  select title into item_title from public.content_items where id = new.content_item_id;
  insert into public.notifications (recipient_id, content_item_id, kind, title, body, dedupe_key)
  values (
    new.profile_id,
    new.content_item_id,
    'raci_assigned'::text::public.notification_kind,
    'RACI assignment: ' || item_title,
    'You are ' || new.assignment_type::text || ' for the ' || replace(new.stage::text, '_', ' ') || ' stage.',
    'raci:' || new.id::text
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.queue_raci_assignment_notification() from public, anon, authenticated;
create trigger raci_assignment_notification
after insert on public.item_stage_assignments
for each row execute function private.queue_raci_assignment_notification();

create or replace function public.create_content_with_raci(
  p_title text,
  p_content_type text,
  p_platform text,
  p_pillar public.content_pillar,
  p_due_at timestamptz,
  p_responsible_id uuid,
  p_accountable_ids uuid[],
  p_consulted_ids uuid[] default '{}',
  p_informed_ids uuid[] default '{}',
  p_copy_all_stages boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare item_id uuid;
declare selected_stage public.pipeline_stage;
begin
  if (select auth.uid()) is null or not (
    (select private.has_role('admin')) or (select private.has_role('content_producer'))
  ) then
    raise exception 'This login cannot create content';
  end if;
  if p_responsible_id is null or coalesce(cardinality(p_accountable_ids), 0) = 0 then
    raise exception 'Responsible and Accountable assignments are required';
  end if;
  if exists (
    select 1 from unnest(array[p_responsible_id] || p_accountable_ids || p_consulted_ids || p_informed_ids) as assigned(profile_id)
    where not exists (select 1 from public.profiles p where p.id = assigned.profile_id and p.is_active)
  ) then
    raise exception 'RACI assignments must use active team members';
  end if;

  insert into public.content_items (title, content_type, platform, content_pillar, due_at, created_by)
  values (p_title, p_content_type, p_platform, p_pillar, p_due_at, (select auth.uid()))
  returning id into item_id;

  foreach selected_stage in array (
    case when p_copy_all_stages then enum_range(null::public.pipeline_stage)
    else array['idea'::public.pipeline_stage] end
  ) loop
    insert into public.item_stage_assignments (content_item_id, stage, profile_id, assignment_type)
    select item_id, selected_stage, profile_id, assignment_type::public.assignment_type
    from (
      select p_responsible_id as profile_id, 'responsible'::text as assignment_type
      union all select unnest(p_accountable_ids), 'accountable'::text
      union all select unnest(p_consulted_ids), 'consulted'::text
      union all select unnest(p_informed_ids), 'informed'::text
    ) assignments on conflict do nothing;
  end loop;

  insert into public.stage_history (content_item_id, to_stage, action, actor_id)
  values (item_id, 'idea', 'created', (select auth.uid()));
  return item_id;
end;
$$;

revoke all on function public.create_content_with_raci(text, text, text, public.content_pillar, timestamptz, uuid, uuid[], uuid[], uuid[], boolean) from public, anon;
grant execute on function public.create_content_with_raci(text, text, text, public.content_pillar, timestamptz, uuid, uuid[], uuid[], uuid[], boolean) to authenticated;

create or replace function public.enqueue_cadence_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare queued integer := 0;
declare checkpoint record;
declare recipient uuid;
declare inserted_count integer;
begin
  insert into public.cadence_runs (cadence_id, scheduled_for)
  select c.id, (dates.day::date + c.time_of_day) at time zone c.timezone
  from public.operating_cadences c
  cross join generate_series(
    (now() at time zone 'Asia/Kolkata')::date,
    (now() at time zone 'Asia/Kolkata')::date + 30,
    interval '1 day'
  ) as dates(day)
  where c.is_active and (
    (c.frequency = 'weekly' and extract(dow from dates.day) = c.weekday)
    or (c.frequency = 'monthly' and extract(day from dates.day) = c.day_of_month)
  )
  on conflict (cadence_id, scheduled_for) do nothing;

  for checkpoint in
    select c.id, c.name, c.deliverable, c.owner_id, r.scheduled_for
    from public.operating_cadences c
    join public.cadence_runs r on r.cadence_id = c.id
    where c.is_active and r.status = 'upcoming'
      and r.scheduled_for >= now()
      and r.scheduled_for <= now() + make_interval(hours => c.reminder_hours_before)
  loop
    for recipient in
      select checkpoint.owner_id
      union select profile_id from public.cadence_participants where cadence_id = checkpoint.id
    loop
      insert into public.notifications (recipient_id, kind, title, body, dedupe_key)
      values (
        recipient,
        'cadence_due'::text::public.notification_kind,
        'Upcoming cadence: ' || checkpoint.name,
        to_char(checkpoint.scheduled_for at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST. Deliverable: ' || checkpoint.deliverable,
        'cadence:' || checkpoint.id::text || ':' || checkpoint.scheduled_for::text || ':' || recipient::text
      ) on conflict (dedupe_key) do nothing;
      get diagnostics inserted_count = row_count;
      queued := queued + inserted_count;
    end loop;
  end loop;
  return queued;
end;
$$;

revoke all on function public.enqueue_cadence_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_cadence_reminders() to service_role;
