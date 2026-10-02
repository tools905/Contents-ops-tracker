-- Covers the archive actor foreign key and the Archive sheet's actor lookup.
create index if not exists content_items_archived_by_idx
  on public.content_items (archived_by)
  where archived_by is not null;
