-- A second-lens review must be an actual second person. Admin status does not
-- permit someone to record a review as another teammate or review a stage for
-- which they are Responsible/Accountable.

drop policy if exists reviews_create on public.stage_reviews;
create policy reviews_create
on public.stage_reviews for insert to authenticated
with check (
  reviewer_id = (select private.current_profile_id())
  and (
    (select private.has_role('admin'))
    or (select private.has_role('content_approver'))
  )
);

drop policy if exists reviews_update on public.stage_reviews;
create policy reviews_update
on public.stage_reviews for update to authenticated
using (reviewer_id = (select private.current_profile_id()))
with check (reviewer_id = (select private.current_profile_id()));

create or replace function private.ensure_independent_stage_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.item_stage_assignments a
    where a.content_item_id = new.content_item_id
      and a.stage = new.stage
      and a.profile_id = new.reviewer_id
      and a.assignment_type in ('responsible', 'accountable')
  ) then
    raise exception 'Second-lens review must be completed by a different person from the stage Responsible and Accountable owners';
  end if;
  return new;
end;
$$;

drop trigger if exists stage_reviews_require_independent_reviewer
on public.stage_reviews;
create trigger stage_reviews_require_independent_reviewer
before insert or update of reviewer_id, content_item_id, stage, decision
on public.stage_reviews
for each row execute function private.ensure_independent_stage_review();

revoke all on function private.ensure_independent_stage_review()
from public, anon, authenticated;
