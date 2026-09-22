-- Preserve the master calendar's readiness state during import: recent posted
-- rows begin in Post-Upload, ready/scheduled rows begin in Upload, and the
-- remaining planned work begins in Idea.
create or replace function public.bulk_import_content(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  item_id uuid;
  initial_stage public.pipeline_stage;
  initial_step text;
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
      source_key, source_label
    ) values (
      trim(payload ->> 'title'), payload ->> 'content_type', payload ->> 'platform',
      (payload ->> 'content_pillar')::public.content_pillar,
      (payload ->> 'due_at')::timestamptz,
      coalesce(payload ->> 'workflow_route', 'design'),
      initial_step, initial_stage,
      case when initial_stage = 'post_upload_metrics'
        then (payload ->> 'due_at')::timestamptz else null end,
      actor, payload ->> 'source_key', payload ->> 'source_label'
    ) on conflict (source_key) where source_key is not null do nothing
    returning id into item_id;

    if item_id is null then
      skipped_count := skipped_count + 1;
    else
      perform private.assign_default_raci(item_id);
      insert into public.stage_history (
        content_item_id, to_stage, action, actor_id, note, metadata
      ) values (
        item_id, initial_stage, 'created', actor,
        'Imported from the master calendar',
        jsonb_build_object(
          'source_key', payload ->> 'source_key',
          'initial_stage', initial_stage
        )
      );
      imported_count := imported_count + 1;
    end if;
  end loop;
  return jsonb_build_object('imported', imported_count, 'skipped', skipped_count);
end;
$$;

revoke all on function public.bulk_import_content(jsonb) from public, anon;
grant execute on function public.bulk_import_content(jsonb) to authenticated;
