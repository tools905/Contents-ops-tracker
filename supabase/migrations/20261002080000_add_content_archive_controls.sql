-- Archive content without losing its workflow record, feedback or discussion.
alter type public.history_action add value if not exists 'archived';
alter type public.history_action add value if not exists 'restored';

alter table public.content_items
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists content_items_archived_by_idx
  on public.content_items (archived_by)
  where archived_by is not null;

create index if not exists content_items_archived_at_idx
  on public.content_items (archived_at desc)
  where lifecycle = 'archived';

create or replace function public.archive_content_item(p_item_id uuid)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.content_items;
  actor uuid := (select private.current_profile_id());
  previous_lifecycle public.item_lifecycle;
begin
  if actor is null or not (select private.current_user_active()) then
    raise exception 'An active workspace account is required';
  end if;
  if not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can archive content';
  end if;

  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if item.lifecycle = 'archived' then raise exception 'Content is already archived'; end if;
  previous_lifecycle := item.lifecycle;

  update public.content_items set
    lifecycle = 'archived', archived_at = now(), archived_by = actor
  where id = item.id returning * into item;

  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note, metadata
  ) values (
    item.id, item.current_stage, item.current_stage, 'archived', actor,
    'Moved out of the active tracker',
    jsonb_build_object('previous_lifecycle', previous_lifecycle::text)
  );
  return item;
end;
$$;

create or replace function public.restore_content_item(p_item_id uuid)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.content_items;
  actor uuid := (select private.current_profile_id());
  restored_lifecycle public.item_lifecycle;
begin
  if actor is null or not (select private.current_user_active()) then
    raise exception 'An active workspace account is required';
  end if;
  if not (select private.has_role('admin')) then
    raise exception 'Only an Owner or Admin can restore content';
  end if;

  select * into item from public.content_items where id = p_item_id for update;
  if item.id is null then raise exception 'Content item not found'; end if;
  if item.lifecycle <> 'archived' then raise exception 'Only archived content can be restored'; end if;

  restored_lifecycle := case when item.closed_at is null then 'active'::public.item_lifecycle else 'closed'::public.item_lifecycle end;
  update public.content_items set
    lifecycle = restored_lifecycle, archived_at = null, archived_by = null
  where id = item.id returning * into item;

  insert into public.stage_history (
    content_item_id, from_stage, to_stage, action, actor_id, note, metadata
  ) values (
    item.id, item.current_stage, item.current_stage, 'restored', actor,
    'Restored from Archive',
    jsonb_build_object('restored_lifecycle', restored_lifecycle::text)
  );
  return item;
end;
$$;

revoke all on function public.archive_content_item(uuid) from public, anon;
revoke all on function public.restore_content_item(uuid) from public, anon;
grant execute on function public.archive_content_item(uuid) to authenticated;
grant execute on function public.restore_content_item(uuid) to authenticated;
