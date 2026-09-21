-- Keep discussion, feedback and decisions attributable to the stage where
-- they happened, and make feedback resolution an auditable workflow action.
create type public.comment_kind as enum ('update', 'feedback', 'decision');
alter type public.notification_kind add value if not exists 'feedback_resolved';

alter table public.comments
  add column stage public.pipeline_stage,
  add column kind public.comment_kind not null default 'update',
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.profiles(id) on delete restrict;

update public.comments c
set stage = i.current_stage
from public.content_items i
where i.id = c.content_item_id;

alter table public.comments
  alter column stage set not null,
  add constraint comments_resolution_check check (
    (resolved_at is null and resolved_by is null)
    or (resolved_at is not null and resolved_by is not null)
  );

create index comments_item_stage_created_idx
  on public.comments (content_item_id, stage, created_at);
create index comments_unresolved_feedback_idx
  on public.comments (content_item_id, stage)
  where kind = 'feedback' and resolved_at is null;
create index comments_resolved_by_idx
  on public.comments (resolved_by)
  where resolved_by is not null;

-- Comment changes go through narrow audited commands rather than a broad
-- table UPDATE grant.
revoke update on public.comments from authenticated;

create or replace function public.set_comment_resolution(
  p_comment_id bigint,
  p_resolved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare feedback public.comments%rowtype;
declare item_title text;
begin
  if (select auth.uid()) is null or not (select private.current_user_active()) then
    raise exception 'Active authentication is required';
  end if;
  select * into feedback from public.comments where id = p_comment_id for update;
  if feedback.id is null then raise exception 'Feedback not found'; end if;
  if feedback.kind <> 'feedback' then raise exception 'Only feedback can be resolved'; end if;
  if not (
    (select private.has_role('admin'))
    or feedback.author_id = (select auth.uid())
    or (select private.is_assigned(feedback.content_item_id, null::public.assignment_type, feedback.stage))
  ) then
    raise exception 'You are not assigned to resolve this feedback';
  end if;

  update public.comments set
    resolved_at = case when p_resolved then now() else null end,
    resolved_by = case when p_resolved then (select auth.uid()) else null end
  where id = p_comment_id;

  select title into item_title from public.content_items where id = feedback.content_item_id;
  insert into public.stage_history (content_item_id, from_stage, to_stage, action, actor_id, note, metadata)
  values (
    feedback.content_item_id,
    feedback.stage,
    feedback.stage,
    'edited',
    (select auth.uid()),
    case when p_resolved then 'Feedback resolved' else 'Feedback reopened' end,
    jsonb_build_object('comment_id', feedback.id, 'comment_kind', feedback.kind)
  );

  if p_resolved and feedback.author_id <> (select auth.uid()) then
    insert into public.notifications (recipient_id, content_item_id, kind, title, body, dedupe_key)
    values (
      feedback.author_id,
      feedback.content_item_id,
      'feedback_resolved',
      'Feedback resolved: ' || item_title,
      'Your ' || replace(feedback.stage::text, '_', ' ') || ' feedback was marked resolved.',
      'feedback-resolved:' || feedback.id::text
    ) on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

revoke all on function public.set_comment_resolution(bigint, boolean) from public, anon;
grant execute on function public.set_comment_resolution(bigint, boolean) to authenticated;
