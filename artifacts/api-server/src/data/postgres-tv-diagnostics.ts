import { getPostgresPool } from "../postgres-runtime";
import type { TvCounterBatch } from "../lib/tv-diagnostics-policy";
let lastPruned = 0;
export async function recordTvDiagnostics(
  batch: TvCounterBatch,
): Promise<void> {
  const db = await getPostgresPool().connect();
  try {
    await db.query("BEGIN");
    // Cross-process cardinality budget, not an unbounded free-form log table.
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('tv-diagnostics'),hashtext(current_date::text))",
    );
    for (const e of batch.events) {
      const values = [
        batch.platform,
        batch.appVersion,
        batch.bundleVersion,
        e.event,
        e.code,
        e.route,
        e.module,
        e.line,
        e.column,
      ];
      await db.query(
        `INSERT INTO tv_diagnostic_daily(day,platform,app_version,bundle_version,event,code,route,module,line_no,column_no,count)
        SELECT current_date,$1,$2,$3,$4,$5,$6,$7,$8,$9,1 WHERE
        (SELECT count(*) FROM tv_diagnostic_daily WHERE day=current_date)<4096 OR EXISTS
        (SELECT 1 FROM tv_diagnostic_daily WHERE day=current_date AND platform=$1 AND app_version=$2 AND bundle_version=$3 AND event=$4 AND code=$5 AND route=$6 AND module=$7 AND line_no=$8 AND column_no=$9)
        ON CONFLICT(day,platform,app_version,bundle_version,event,code,route,module,line_no,column_no) DO UPDATE SET count=LEAST(tv_diagnostic_daily.count::bigint+1,2147483647)::integer`,
        values,
      );
    }
    if (Date.now() - lastPruned > 3_600_000) {
      await db.query(
        "DELETE FROM tv_diagnostic_daily WHERE day<current_date-29",
      );
      lastPruned = Date.now();
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function listTvDiagnostics(
  days: number,
  platform?: string,
): Promise<any[]> {
  return (
    await getPostgresPool().query(
      `SELECT day::text,platform,app_version AS "appVersion",bundle_version AS "bundleVersion",event,code,route,module,line_no AS line,column_no AS column,count
    FROM tv_diagnostic_daily WHERE day>=current_date-($1::int-1) AND ($2::text IS NULL OR platform=$2)
    ORDER BY day DESC,count DESC LIMIT 2000`,
      [days, platform || null],
    )
  ).rows;
}
