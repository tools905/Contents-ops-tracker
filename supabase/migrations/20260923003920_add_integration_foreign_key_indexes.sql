-- Cover the foreign keys added for calendar imports and future provider syncs.
create index calendar_import_batches_imported_by_idx
  on public.calendar_import_batches (imported_by);

create index integration_connections_created_by_idx
  on public.integration_connections (created_by)
  where created_by is not null;

create index integration_connections_updated_by_idx
  on public.integration_connections (updated_by)
  where updated_by is not null;

create index integration_sync_runs_initiated_by_idx
  on public.integration_sync_runs (initiated_by)
  where initiated_by is not null;

create index metrics_entries_external_mapping_idx
  on public.metrics_entries (external_mapping_id)
  where external_mapping_id is not null;
