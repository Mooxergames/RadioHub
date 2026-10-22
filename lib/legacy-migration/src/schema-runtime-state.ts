// Migrations 0037, 0038 and 0040 seed these PostgreSQL-only collection boundaries.
// An exact value/updated_at match distinguishes untouched seeds from runtime data.
export const SCHEMA_RUNTIME_STATE_KEYS = [
  "unique-visitor-metrics:v1", "unique-visitor-details:v1", "visitor-activity:v1",
];

export const SCHEMA_RUNTIME_STATE_PREDICATE = `(
  (key IN ('unique-visitor-metrics:v1','visitor-activity:v1')
    AND value=jsonb_build_object('collectionStartedAt',updated_at))
  OR (key='unique-visitor-details:v1'
    AND value=jsonb_build_object('dimensionsStartedAt',updated_at))
)`;

/** Control defaults count as untouched only at their recorded migration instant. */
export function schemaSeedPredicate(table: string): string | null {
  if (table === "runtime_app_state") return SCHEMA_RUNTIME_STATE_PREDICATE;
  if (table === "station_stream_health_control") return `(id=1 AND last_run_at IS NULL AND summary='{}'::jsonb
    AND next_run_at=(SELECT applied_at FROM radiohub_schema_migrations WHERE name='0028_station_stream_health.sql'))`;
  if (table === "station_duplicate_merge_control") return `(id=1 AND last_run_at IS NULL AND summary='{}'::jsonb
    AND lease_owner IS NULL AND lease_until IS NULL
    AND next_cycle_at=(SELECT applied_at FROM radiohub_schema_migrations WHERE name='0031_station_duplicate_jobs.sql')
    AND next_auto_at=next_cycle_at+interval '24 hours')`;
  return null;
}
