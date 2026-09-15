create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'content_producer', 'content_approver', 'monitoring', 'read_only_stakeholder');
create type public.pipeline_stage as enum ('idea', 'script', 'shoot', 'production', 'upload', 'post_upload_metrics');
create type public.stage_status as enum ('in_progress', 'pending_approval', 'changes_requested', 'approved');
create type public.item_lifecycle as enum ('active', 'closed', 'archived');
create type public.assignment_type as enum ('responsible', 'accountable');
create type public.review_decision as enum ('pending', 'approved', 'changes_requested');
create type public.history_action as enum ('created', 'submitted', 'approved', 'changes_requested', 'override_advanced', 'closed', 'reopened', 'edited');
create type public.link_kind as enum ('script', 'raw_footage', 'edited_video', 'published_post', 'brief', 'other');
create type public.notification_kind as enum ('approval_needed', 'due_soon', 'overdue', 'new_comment', 'override_used');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');
create type public.content_pillar as enum ('knowledge', 'promotional', 'aafm_india_insider');
create type public.request_status as enum ('new', 'accepted', 'scheduled');
create type public.request_priority as enum ('normal', 'urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 180),
  content_type text not null check (content_type in ('Reel', 'Post', 'Carousel', 'Short', 'Video')),
  platform text not null check (platform in ('Instagram', 'YouTube', 'LinkedIn', 'Facebook', 'Multi-platform')),
  content_pillar public.content_pillar not null default 'knowledge',
  workflow_step text not null default 'Topic research',
  current_stage public.pipeline_stage not null default 'idea',
  stage_status public.stage_status not null default 'in_progress',
  lifecycle public.item_lifecycle not null default 'active',
  due_at timestamptz,
  reminder_hours_before smallint not null default 24 check (reminder_hours_before between 0 and 720),
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (platform = 'Instagram' and content_type in ('Reel', 'Post', 'Carousel'))
    or (platform = 'YouTube' and content_type in ('Short', 'Video'))
    or (platform in ('LinkedIn', 'Facebook', 'Multi-platform') and content_type in ('Post', 'Carousel'))
  )
);

create table public.item_stage_assignments (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  stage public.pipeline_stage not null,
  profile_id uuid not null references public.profiles(id),
  assignment_type public.assignment_type not null,
  created_at timestamptz not null default now(),
  unique (content_item_id, stage, profile_id, assignment_type)
);

create table public.content_links (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  kind public.link_kind not null,
  label text not null,
  url text not null check (url ~* '^https?://'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.stage_reviews (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  stage public.pipeline_stage not null check (stage in ('script', 'production')),
  reviewer_id uuid not null references public.profiles(id),
  decision public.review_decision not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stage_history (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  from_stage public.pipeline_stage,
  to_stage public.pipeline_stage,
  action public.history_action not null,
  actor_id uuid not null references public.profiles(id),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.comments (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  parent_id bigint references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  mentioned_profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.metrics_entries (
  id bigint generated always as identity primary key,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  platform text not null,
  content_url text,
  views bigint not null default 0 check (views >= 0),
  reach bigint not null default 0 check (reach >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  likes bigint not null default 0 check (likes >= 0),
  comments bigint not null default 0 check (comments >= 0),
  shares bigint not null default 0 check (shares >= 0),
  saves bigint not null default 0 check (saves >= 0),
  watch_time_seconds bigint not null default 0 check (watch_time_seconds >= 0),
  follower_change bigint not null default 0,
  notes text check (notes is null or char_length(notes) <= 4000),
  recorded_on date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'zoho_analytics')),
  external_snapshot_id text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (source <> 'manual' or recorded_by is not null),
  unique (content_item_id, platform, recorded_on, source)
);

create table public.department_requests (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  requester_name text not null,
  request_text text not null check (char_length(trim(request_text)) between 2 and 2000),
  priority public.request_priority not null default 'normal',
  needed_by date not null,
  status public.request_status not null default 'new',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text not null,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.email_outbox (
  id bigint generated always as identity primary key,
  notification_id bigint not null unique references public.notifications(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  html_body text not null,
  status public.delivery_status not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('timezone', '"Asia/Kolkata"'::jsonb),
  ('default_reminder_hours', '24'::jsonb),
  ('content_mix_targets', '{"knowledge":60,"promotional":20,"aafm_india_insider":20}'::jsonb),
  ('platforms', '["Instagram", "YouTube", "LinkedIn", "Facebook"]'::jsonb),
  ('content_types', '["Instagram Reel", "Instagram Post", "YouTube Video", "YouTube Short", "LinkedIn Post", "Carousel"]'::jsonb);

create index user_roles_role_profile_idx on public.user_roles (role, profile_id);
create index content_items_stage_status_idx on public.content_items (current_stage, stage_status) where lifecycle = 'active';
create index content_items_due_at_idx on public.content_items (due_at) where lifecycle = 'active' and due_at is not null;
create index content_items_created_by_idx on public.content_items (created_by);
create index assignments_profile_stage_idx on public.item_stage_assignments (profile_id, stage, assignment_type);
create index assignments_item_idx on public.item_stage_assignments (content_item_id);
create index content_links_item_idx on public.content_links (content_item_id);
create index stage_reviews_item_stage_idx on public.stage_reviews (content_item_id, stage, decision);
create index stage_reviews_reviewer_idx on public.stage_reviews (reviewer_id);
create index stage_history_item_created_idx on public.stage_history (content_item_id, created_at desc);
create index stage_history_actor_idx on public.stage_history (actor_id);
create index comments_item_created_idx on public.comments (content_item_id, created_at);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;
create index comments_author_idx on public.comments (author_id);
create index metrics_item_date_idx on public.metrics_entries (content_item_id, recorded_on desc);
create index metrics_recorded_by_idx on public.metrics_entries (recorded_by);
create index department_requests_status_needed_idx on public.department_requests (status, needed_by);
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_item_idx on public.notifications (content_item_id) where content_item_id is not null;
create index email_outbox_pending_idx on public.email_outbox (status, created_at) where status in ('pending', 'failed');

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.current_user_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and is_active);
$$;

create or replace function private.has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.current_user_active()) and exists (
    select 1 from public.user_roles where profile_id = (select auth.uid()) and role = required_role
  );
$$;

create or replace function private.is_assigned(item_id uuid, assignment public.assignment_type default null, item_stage public.pipeline_stage default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.item_stage_assignments a
    where a.content_item_id = item_id
      and a.profile_id = (select auth.uid())
      and (assignment is null or a.assignment_type = assignment)
      and (item_stage is null or a.stage = item_stage)
  );
$$;

create or replace function private.can_view_item(item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.current_user_active()) and (
    (select private.has_role('admin'))
    or (select private.has_role('read_only_stakeholder'))
    or (select private.is_assigned(item_id))
    or exists (
      select 1 from public.content_items i
      where i.id = item_id and (
        ((select private.has_role('content_approver')) and i.current_stage in ('script', 'production'))
        or ((select private.has_role('monitoring')) and (i.published_at is not null or i.current_stage = 'post_upload_metrics'))
      )
    )
  );
$$;

revoke all on function private.current_user_active() from public, anon;
revoke all on function private.has_role(public.app_role) from public, anon;
revoke all on function private.is_assigned(uuid, public.assignment_type, public.pipeline_stage) from public, anon;
revoke all on function private.can_view_item(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_user_active() to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_assigned(uuid, public.assignment_type, public.pipeline_stage) to authenticated;
grant execute on function private.can_view_item(uuid) to authenticated;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger content_items_touch before update on public.content_items for each row execute function private.touch_updated_at();
create trigger stage_reviews_touch before update on public.stage_reviews for each row execute function private.touch_updated_at();
create trigger comments_touch before update on public.comments for each row execute function private.touch_updated_at();
create trigger department_requests_touch before update on public.department_requests for each row execute function private.touch_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_auth_user();

create or replace function private.queue_notification_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare destination text;
begin
  select email into destination from public.profiles where id = new.recipient_id and is_active;
  if destination is not null then
    insert into public.email_outbox (notification_id, recipient_email, subject, html_body)
    values (new.id, destination, new.title, '<p>' || replace(new.body, '<', '&lt;') || '</p>');
  end if;
  return new;
end;
$$;
create trigger notification_email_outbox after insert on public.notifications for each row execute function private.queue_notification_email();

create or replace function private.queue_comment_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid;
declare item_title text;
begin
  select title into item_title from public.content_items where id = new.content_item_id;
  for target in
    select distinct profile_id from public.item_stage_assignments
    where content_item_id = new.content_item_id and profile_id <> new.author_id
    union select unnest(new.mentioned_profile_ids)
  loop
    insert into public.notifications (recipient_id, content_item_id, kind, title, body, dedupe_key)
    values (target, new.content_item_id, 'new_comment', 'New comment on ' || item_title, left(new.body, 240), 'comment:' || new.id::text || ':' || target::text)
    on conflict (dedupe_key) do nothing;
  end loop;
  return new;
end;
$$;
create trigger comment_notifications after insert on public.comments for each row execute function private.queue_comment_notifications();

create or replace function public.submit_current_stage(p_item_id uuid)
returns public.content_items language plpgsql security definer set search_path = '' as $$
declare item public.content_items;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if item.lifecycle <> 'active' then raise exception 'Only active items can be submitted'; end if;
  if item.stage_status not in ('in_progress', 'changes_requested') then raise exception 'This stage is already awaiting approval'; end if;
  if not ((select private.has_role('admin')) or (select private.is_assigned(item.id, 'responsible', item.current_stage)) or (select private.is_assigned(item.id, 'accountable', item.current_stage))) then raise exception 'You are not assigned to submit this stage'; end if;

  update public.content_items set stage_status = 'pending_approval' where id = item.id returning * into item;
  insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id)
  values (item.id, item.current_stage, item.current_stage, 'submitted', (select auth.uid()));
  insert into public.notifications (recipient_id, content_item_id, kind, title, body, dedupe_key)
  select a.profile_id, item.id, 'approval_needed', 'Approval needed: ' || item.title,
    'The ' || replace(item.current_stage::text, '_', ' ') || ' stage is ready for your approval.',
    'approval:' || item.id::text || ':' || item.current_stage::text || ':' || a.profile_id::text
  from public.item_stage_assignments a
  where a.content_item_id = item.id and a.stage = item.current_stage and a.assignment_type = 'accountable'
  on conflict (dedupe_key) do update set created_at = now(), read_at = null;
  return item;
end;
$$;

create or replace function public.advance_content_item(p_item_id uuid, p_next_due_at timestamptz default null, p_override_reason text default null)
returns public.content_items language plpgsql security definer set search_path = '' as $$
declare item public.content_items;
declare next_stage public.pipeline_stage;
declare has_second_lens boolean;
declare history_kind public.history_action := 'approved';
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if item.lifecycle <> 'active' or item.stage_status <> 'pending_approval' then raise exception 'Stage is not awaiting approval'; end if;
  if not ((select private.has_role('admin')) or (select private.is_assigned(item.id, 'accountable', item.current_stage))) then raise exception 'Only an accountable owner can advance this stage'; end if;

  if item.current_stage in ('script', 'production') then
    select exists (select 1 from public.stage_reviews where content_item_id = item.id and stage = item.current_stage and decision = 'approved') into has_second_lens;
    if not has_second_lens then
      if char_length(trim(coalesce(p_override_reason, ''))) < 6 then raise exception 'An override reason is required without second-lens approval'; end if;
      history_kind := 'override_advanced';
    end if;
  end if;

  next_stage := case item.current_stage
    when 'idea' then 'script' when 'script' then 'shoot' when 'shoot' then 'production'
    when 'production' then 'upload' when 'upload' then 'post_upload_metrics' else null end;

  if next_stage is null then
    update public.content_items set stage_status = 'approved', lifecycle = 'closed', closed_at = now(), due_at = null where id = item.id returning * into item;
    insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id, note)
    values (item.id, item.current_stage, null, 'closed', (select auth.uid()), p_override_reason);
  else
    update public.content_items set current_stage = next_stage, stage_status = 'in_progress', due_at = p_next_due_at,
      workflow_step = case next_stage when 'script' then 'Drafting' when 'shoot' then 'Shoot brief' when 'production' then 'Edit or design' when 'upload' then 'Platform scheduling' else 'Performance snapshot' end,
      published_at = case when next_stage = 'post_upload_metrics' then coalesce(published_at, now()) else published_at end
    where id = item.id returning * into item;
    insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id, note, metadata)
    values (item.id, case next_stage when 'script' then 'idea' when 'shoot' then 'script' when 'production' then 'shoot' when 'upload' then 'production' else 'upload' end,
      next_stage, history_kind, (select auth.uid()), p_override_reason, jsonb_build_object('second_lens_approved', coalesce(has_second_lens, false)));
  end if;

  if history_kind = 'override_advanced' then
    insert into public.notifications (recipient_id, content_item_id, kind, title, body, dedupe_key)
    select ur.profile_id, item.id, 'override_used', 'Second-lens override: ' || item.title, p_override_reason,
      'override:' || item.id::text || ':' || now()::text || ':' || ur.profile_id::text
    from public.user_roles ur where ur.role in ('admin', 'content_approver');
  end if;
  return item;
end;
$$;

create or replace function public.request_stage_changes(p_item_id uuid, p_note text)
returns public.content_items language plpgsql security definer set search_path = '' as $$
declare item public.content_items;
begin
  if char_length(trim(coalesce(p_note, ''))) < 2 then raise exception 'A change note is required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null or item.stage_status <> 'pending_approval' then raise exception 'Stage is not awaiting approval'; end if;
  if not ((select private.has_role('admin')) or (select private.is_assigned(item.id, 'accountable', item.current_stage))) then raise exception 'Only an accountable owner can request changes'; end if;
  update public.content_items set stage_status = 'changes_requested' where id = item.id returning * into item;
  insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id, note)
  values (item.id, item.current_stage, item.current_stage, 'changes_requested', (select auth.uid()), p_note);
  return item;
end;
$$;

create or replace function public.enqueue_due_date_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare inserted_count integer;
begin
  with candidates as (
    select distinct a.profile_id, i.id, i.title, i.due_at, i.reminder_hours_before,
      case when i.due_at < now() then 'overdue'::public.notification_kind else 'due_soon'::public.notification_kind end as kind
    from public.content_items i join public.item_stage_assignments a on a.content_item_id = i.id and a.stage = i.current_stage
    where i.lifecycle = 'active' and i.due_at is not null
      and i.due_at <= now() + make_interval(hours => i.reminder_hours_before)
      and a.assignment_type in ('responsible', 'accountable')
  ), inserted as (
    insert into public.notifications (recipient_id, content_item_id, kind, title, body, dedupe_key)
    select profile_id, id, kind,
      case when kind = 'overdue' then 'Overdue: ' else 'Due soon: ' end || title,
      case when kind = 'overdue' then 'This stage is overdue.' else 'This stage is approaching its due date.' end,
      kind::text || ':' || id::text || ':' || profile_id::text || ':' || current_date::text
    from candidates on conflict (dedupe_key) do nothing returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;

create or replace function public.update_content_item_metadata(
  p_item_id uuid,
  p_title text,
  p_content_type text,
  p_platform text,
  p_due_at timestamptz,
  p_reminder_hours smallint
)
returns public.content_items language plpgsql security definer set search_path = '' as $$
declare item public.content_items;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if not ((select private.has_role('admin')) or (select private.is_assigned(item.id, 'responsible', item.current_stage))) then raise exception 'Not authorized to edit this item'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then raise exception 'A title is required'; end if;
  if p_reminder_hours not between 0 and 720 then raise exception 'Reminder lead time must be between 0 and 720 hours'; end if;
  update public.content_items set title = trim(p_title), content_type = p_content_type, platform = p_platform,
    due_at = p_due_at, reminder_hours_before = p_reminder_hours
  where id = item.id returning * into item;
  insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id, note)
  values (item.id, item.current_stage, item.current_stage, 'edited', (select auth.uid()), 'Item details updated');
  return item;
end;
$$;

create or replace function public.update_workflow_step(p_item_id uuid, p_workflow_step text)
returns public.content_items language plpgsql security definer set search_path = '' as $$
declare item public.content_items;
declare allowed_steps text[];
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if not ((select private.has_role('admin')) or (select private.is_assigned(item.id, 'responsible', item.current_stage))) then raise exception 'Not authorized to update this checkpoint'; end if;
  allowed_steps := case item.current_stage
    when 'idea' then array['Topic research', 'HOD input', 'Calendar slot']
    when 'script' then array['Drafting', 'Subject-matter validation', 'Financial compliance']
    when 'shoot' then array['Shoot brief', 'Recording']
    when 'production' then array['Edit or design', 'Harshit quality check', 'Priya final approval']
    when 'upload' then array['Platform scheduling', 'Publishing']
    else array['Performance snapshot', 'Weekly or monthly reporting', 'Learning notes']
  end;
  if not (p_workflow_step = any(allowed_steps)) then raise exception 'Checkpoint does not belong to the current stage'; end if;
  update public.content_items set workflow_step = p_workflow_step where id = item.id returning * into item;
  insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id, note)
  values (item.id, item.current_stage, item.current_stage, 'edited', (select auth.uid()), 'Checkpoint moved to ' || p_workflow_step);
  return item;
end;
$$;

revoke all on function public.submit_current_stage(uuid) from public, anon;
revoke all on function public.advance_content_item(uuid, timestamptz, text) from public, anon;
revoke all on function public.request_stage_changes(uuid, text) from public, anon;
revoke all on function public.enqueue_due_date_reminders() from public, anon;
revoke all on function public.update_content_item_metadata(uuid, text, text, text, timestamptz, smallint) from public, anon;
revoke all on function public.update_workflow_step(uuid, text) from public, anon;
grant execute on function public.submit_current_stage(uuid) to authenticated;
grant execute on function public.advance_content_item(uuid, timestamptz, text) to authenticated;
grant execute on function public.request_stage_changes(uuid, text) to authenticated;
grant execute on function public.update_content_item_metadata(uuid, text, text, text, timestamptz, smallint) to authenticated;
grant execute on function public.update_workflow_step(uuid, text) to authenticated;
grant execute on function public.enqueue_due_date_reminders() to service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.content_items enable row level security;
alter table public.item_stage_assignments enable row level security;
alter table public.content_links enable row level security;
alter table public.stage_reviews enable row level security;
alter table public.stage_history enable row level security;
alter table public.comments enable row level security;
alter table public.metrics_entries enable row level security;
alter table public.department_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
alter table public.app_settings enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.user_roles, public.content_items, public.item_stage_assignments, public.content_links, public.stage_reviews, public.stage_history, public.comments, public.metrics_entries, public.department_requests, public.notifications, public.app_settings to authenticated;
grant insert on public.content_items to authenticated;
grant insert, update, delete on public.item_stage_assignments, public.content_links to authenticated;
grant insert, update on public.stage_reviews, public.comments, public.metrics_entries to authenticated;
grant insert, update on public.department_requests to authenticated;
grant update on public.notifications to authenticated;
grant select, insert, update, delete on public.profiles, public.user_roles, public.app_settings to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy profiles_read on public.profiles for select to authenticated using ((select private.current_user_active()));
create policy profiles_admin_write on public.profiles for update to authenticated using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));
create policy roles_read on public.user_roles for select to authenticated using ((select private.current_user_active()));
create policy roles_admin_insert on public.user_roles for insert to authenticated with check ((select private.has_role('admin')));
create policy roles_admin_delete on public.user_roles for delete to authenticated using ((select private.has_role('admin')));
create policy settings_read on public.app_settings for select to authenticated using ((select private.current_user_active()));
create policy settings_admin_write on public.app_settings for all to authenticated using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));

create policy items_read on public.content_items for select to authenticated using ((select private.can_view_item(id)));
create policy items_create on public.content_items for insert to authenticated with check ((select private.has_role('admin')) or ((select private.has_role('content_producer')) and created_by = (select auth.uid())));

create policy assignments_read on public.item_stage_assignments for select to authenticated using ((select private.can_view_item(content_item_id)));
create policy assignments_admin_insert on public.item_stage_assignments for insert to authenticated with check ((select private.has_role('admin')));
create policy assignments_admin_update on public.item_stage_assignments for update to authenticated using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));
create policy assignments_admin_delete on public.item_stage_assignments for delete to authenticated using ((select private.has_role('admin')));

create policy links_read on public.content_links for select to authenticated using ((select private.can_view_item(content_item_id)));
create policy links_write on public.content_links for insert to authenticated with check ((select private.has_role('admin')) or (select private.is_assigned(content_item_id)));
create policy links_update on public.content_links for update to authenticated using ((select private.has_role('admin')) or (select private.is_assigned(content_item_id))) with check ((select private.has_role('admin')) or (select private.is_assigned(content_item_id)));
create policy links_delete on public.content_links for delete to authenticated using ((select private.has_role('admin')) or (select private.is_assigned(content_item_id)));

create policy reviews_read on public.stage_reviews for select to authenticated using ((select private.can_view_item(content_item_id)));
create policy reviews_create on public.stage_reviews for insert to authenticated with check ((select private.has_role('admin')) or ((select private.has_role('content_approver')) and reviewer_id = (select auth.uid())));
create policy reviews_update on public.stage_reviews for update to authenticated using ((select private.has_role('admin')) or reviewer_id = (select auth.uid())) with check ((select private.has_role('admin')) or reviewer_id = (select auth.uid()));
create policy history_read on public.stage_history for select to authenticated using ((select private.can_view_item(content_item_id)));

create policy comments_read on public.comments for select to authenticated using ((select private.can_view_item(content_item_id)));
create policy comments_create on public.comments for insert to authenticated with check (author_id = (select auth.uid()) and (select private.can_view_item(content_item_id)) and not (select private.has_role('read_only_stakeholder')));
create policy comments_update on public.comments for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy metrics_read on public.metrics_entries for select to authenticated using ((select private.can_view_item(content_item_id)));
create policy metrics_create on public.metrics_entries for insert to authenticated with check (recorded_by = (select auth.uid()) and ((select private.has_role('monitoring')) or (select private.has_role('admin'))));
create policy metrics_update on public.metrics_entries for update to authenticated using ((select private.has_role('monitoring')) or (select private.has_role('admin'))) with check ((select private.has_role('monitoring')) or (select private.has_role('admin')));

create policy requests_read on public.department_requests for select to authenticated using ((select private.current_user_active()));
create policy requests_create on public.department_requests for insert to authenticated with check (created_by = (select auth.uid()) and ((select private.has_role('content_producer')) or (select private.has_role('admin'))));
create policy requests_update on public.department_requests for update to authenticated using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));

create policy notifications_own_read on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy email_outbox_service_only on public.email_outbox for all to service_role using (true) with check (true);

grant usage on schema public to authenticated;
