import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  createNativePostgresFixture,
  type NativePostgresFixture,
} from "./helpers/native-postgres-fixture";
import {
  recordTvDiagnostics,
  listTvDiagnostics,
} from "../src/data/postgres-tv-diagnostics";
import { cleanupTvState } from "../src/data/postgres-tv-store";
const url = process.env.PG_TEST_DATABASE_URL;
describe(
  "TV diagnostics real SQL in disposable loopback test schema",
  { skip: !url },
  () => {
    let fixture: NativePostgresFixture;
    const batch: any = {
      platform: "webos",
      appVersion: "1.0.4",
      bundleVersion: "local-abcdef1234567",
      consent: { diagnostics: true, analytics: false },
      events: [
        {
          event: "js_error",
          code: "type_error",
          route: "settings",
          module: "main",
          line: 12,
          column: 3,
        },
      ],
    };
    before(async () => {
      const parsed = new URL(url!);
      assert.equal(parsed.hostname, "127.0.0.1");
      assert.equal(parsed.pathname, "/radiohub_test");
      assert.equal(parsed.search, "");
      fixture = await createNativePostgresFixture("tvdiagnostics");
    });
    after(async () => {
      await fixture?.close();
    });
    test("real migration and upsert count events without identifier/payload columns", async () => {
      await recordTvDiagnostics(batch);
      await recordTvDiagnostics(batch);
      const rows = await listTvDiagnostics(7, "webos");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].count, 2);
      assert.equal(rows[0].line, 12);
      const columns = (
        await fixture.pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='tv_diagnostic_daily'",
          [fixture.schema],
        )
      ).rows.map((r) => r.column_name);
      for (const forbidden of [
        "device_id",
        "client_id",
        "session_id",
        "user_id",
        "ip",
        "payload",
        "logs",
        "message",
        "stack",
      ])
        assert.equal(columns.includes(forbidden), false);
      await assert.rejects(
        fixture.pool.query(
          "INSERT INTO tv_diagnostic_daily(day,platform,app_version,bundle_version,event,code,route,module) VALUES(current_date,'webos','1.0.4','unknown','js_error','private text','settings','main')",
        ),
      );
    });
    test("30-day cleanup removes expired counters while keeping in-window aggregates", async () => {
      await fixture.pool.query(
        "INSERT INTO tv_diagnostic_daily(day,platform,app_version,bundle_version,event,code,route,module) VALUES(current_date-30,'webos','1.0.4','unknown','js_error','type_error','settings','main'),(current_date-29,'webos','1.0.4','unknown','js_error','type_error','settings','main')",
      );
      await cleanupTvState();
      const dates = (
        await fixture.pool.query(
          "SELECT current_date-day AS age FROM tv_diagnostic_daily ORDER BY age",
        )
      ).rows.map((r) => r.age);
      assert.deepEqual(dates, [0, 29]);
    });
    test("cross-process SQL budget drops new groups at cap but existing counters still increment", async () => {
      await fixture.pool.query("TRUNCATE tv_diagnostic_daily");
      await fixture.pool.query(
        "INSERT INTO tv_diagnostic_daily(day,platform,app_version,bundle_version,event,code,route,module,line_no,column_no,count) SELECT current_date,'webos','99.0.'||n,'unknown','js_error','type_error','settings','main',0,0,1 FROM generate_series(0,4095)n",
      );
      await Promise.all([
        recordTvDiagnostics(batch),
        recordTvDiagnostics(batch),
      ]);
      assert.equal(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM tv_diagnostic_daily WHERE day=current_date",
          )
        ).rows[0].count,
        4096,
      );
      await recordTvDiagnostics({
        ...batch,
        appVersion: "99.0.0",
        bundleVersion: "unknown",
        events: [{ ...batch.events[0], line: 0, column: 0 }],
      });
      assert.equal(
        (
          await fixture.pool.query(
            "SELECT count FROM tv_diagnostic_daily WHERE app_version='99.0.0'",
          )
        ).rows[0].count,
        2,
      );
    });
  },
);
