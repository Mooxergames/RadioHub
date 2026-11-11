import assert from "node:assert/strict";
import { mock, test } from "node:test";
const calls: { sql: string; values: any[] }[] = [];
let fail = false,
  released = false;
mock.module("../src/postgres-runtime", {
  namedExports: {
    getPostgresPool: () => ({
      connect: async () => ({
        query: async (sql: string, values: any[] = []) => {
          calls.push({ sql, values });
          if (fail && sql.startsWith("INSERT"))
            throw new Error("database unavailable");
          return { rows: [] };
        },
        release() {
          released = true;
        },
      }),
      query: async (sql: string, values: any[]) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    }),
  },
});
const { recordTvDiagnostics, listTvDiagnostics } =
  await import("../src/data/postgres-tv-diagnostics");
const batch: any = {
  platform: "tizen",
  appVersion: "2.2.9",
  bundleVersion: "local-abcdef1234567",
  consent: { diagnostics: true, analytics: false },
  events: [
    {
      event: "react_error",
      code: "render_error",
      route: "settings",
      module: "main",
      line: 33,
      column: 7,
    },
  ],
};
test("store persists only allowed aggregate dimensions, cardinality-locks transaction and bounds retention/report", async () => {
  await recordTvDiagnostics(batch);
  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[1].sql, /advisory_xact_lock/);
  const insert = calls.find((x) => x.sql.startsWith("INSERT"))!;
  assert.deepEqual(insert.values, [
    "tizen",
    "2.2.9",
    "local-abcdef1234567",
    "react_error",
    "render_error",
    "settings",
    "main",
    33,
    7,
  ]);
  assert.match(insert.sql, /<4096/);
  assert.match(insert.sql, /ON CONFLICT/);
  assert.ok(calls.some((x) => /DELETE.*current_date-29/.test(x.sql)));
  assert.equal(calls.at(-1)?.sql, "COMMIT");
  assert.ok(released);
  await listTvDiagnostics(7, "webos");
  assert.deepEqual(calls.at(-1)?.values, [7, "webos"]);
  assert.match(calls.at(-1)!.sql, /LIMIT 2000/);
});
test("failed write rolls back and releases connection rather than returning fake delivered status", async () => {
  fail = true;
  released = false;
  await assert.rejects(recordTvDiagnostics(batch), /database unavailable/);
  assert.equal(calls.at(-1)?.sql, "ROLLBACK");
  assert.ok(released);
});
