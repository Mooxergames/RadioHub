import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { databaseMaintenanceMiddleware } from "../src/middleware/database-maintenance.ts";
import { PostgresSessionStore } from "../src/data/postgres-session-store.ts";
import { validatePostgresStoreConfiguration } from "../src/data/postgres-store-config.ts";

describe("database migration maintenance middleware", () => {
  it("allows reads and rejects writes with a retryable 503", () => {
    const previous = process.env.DATABASE_MAINTENANCE_READ_ONLY;
    process.env.DATABASE_MAINTENANCE_READ_ONLY = "true";
    let nextCalls = 0;
    const next = () => { nextCalls += 1; };
    databaseMaintenanceMiddleware(
      { method: "GET", path: "/api/stations" } as any,
      {} as any,
      next,
    );
    assert.equal(nextCalls, 1);

    const headers: Record<string, string> = {};
    let status = 0;
    let body: any;
    const response = {
      setHeader: (name: string, value: string) => { headers[name] = value; },
      status: (value: number) => { status = value; return response; },
      json: (value: unknown) => { body = value; },
    };
    databaseMaintenanceMiddleware(
      { method: "POST", path: "/api/user/favorite" } as any,
      response as any,
      next,
    );
    assert.equal(status, 503);
    assert.equal(headers["Retry-After"], "300");
    assert.equal(body.error, "database_maintenance");
    if (previous === undefined) delete process.env.DATABASE_MAINTENANCE_READ_ONLY;
    else process.env.DATABASE_MAINTENANCE_READ_ONLY = previous;
  });
});

describe("PostgreSQL session store", () => {
  it("persists, reads, touches and deletes sessions with parameterized SQL", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const fakePool = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.startsWith("SELECT sess")) return { rows: [{ sess: { cookie: {}, user: { userId: "u1" } } }] };
        return { rows: [], rowCount: 1 };
      },
    };
    const store = new PostgresSessionStore(fakePool as any, 60_000);
    await new Promise<void>((resolve, reject) =>
      store.set("sid-1", { cookie: {} } as any, (error) => error ? reject(error) : resolve()),
    );
    const restored = await new Promise<any>((resolve, reject) =>
      store.get("sid-1", (error, value) => error ? reject(error) : resolve(value)),
    );
    await new Promise<void>((resolve, reject) =>
      store.touch("sid-1", { cookie: {} } as any, (error) => error ? reject(error) : resolve()),
    );
    await new Promise<void>((resolve, reject) =>
      store.destroy("sid-1", (error) => error ? reject(error) : resolve()),
    );
    assert.equal(restored.user.userId, "u1");
    assert.match(calls[0].sql, /INSERT INTO user_sessions/);
    assert.deepEqual(calls[0].values?.slice(0, 2), ["sid-1", JSON.stringify({ cookie: {} })]);
    assert.ok(calls.every((call) => !call.sql.includes("sid-1")));
  });
});

describe("PostgreSQL production migration contract", () => {
  it("rejects unsafe store cutover ordering", () => {
    assert.doesNotThrow(() => validatePostgresStoreConfiguration({}));
    for (const name of ["USER_STORE","AUTH_STORE","ENGAGEMENT_STORE","NOTIFICATION_STORE","MESSAGE_STORE","BILLING_STORE","LOCALIZATION_STORE","SESSION_STORE","STATION_WRITE_MODE","STATION_READ_MODE"]) {
      assert.throws(() => validatePostgresStoreConfiguration({ [name]:"mongo" }),/PostgreSQL-only/);
      assert.throws(() => validatePostgresStoreConfiguration({ [name]:"dual" }),/PostgreSQL-only/);
      assert.doesNotThrow(() => validatePostgresStoreConfiguration({ [name]:"postgres" }));
    }
    assert.throws(() => validatePostgresStoreConfiguration({ STATION_CDC_ENABLED:"true" }),/forbidden/);
    assert.throws(() => validatePostgresStoreConfiguration({ DATABASE_MIGRATION_MODE:"shadow" }),/no longer/);
  });

  it("keeps PostgreSQL migrations ordered with matching journal entries", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
    const migrationDirectory = path.join(repositoryRoot, "lib/db/migrations");
    const files = fs.readdirSync(migrationDirectory)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    const journal = JSON.parse(fs.readFileSync(path.join(migrationDirectory,"meta/_journal.json"),"utf8"));
    assert.deepEqual(files,journal.entries.map((entry: any)=>entry.tag+".sql"));
    assert.ok(files.length >= 13);
    assert.deepEqual(journal.entries.map((entry: any)=>entry.idx),journal.entries.map((_: any,index: number)=>index));
    const cancelledSql = fs.readFileSync(path.join(migrationDirectory, '0025_description_job_cancelled_status.sql'), 'utf8');
    assert.match(cancelledSql, /ALTER TABLE bulk_description_jobs\s+DROP CONSTRAINT bulk_description_jobs_status_check/);
    assert.match(cancelledSql, /CHECK \(status IN \('running', 'paused', 'completed', 'failed', 'cancelled'\)\)/);
    const runtimeSchema = fs.readFileSync(path.join(repositoryRoot, 'lib/db/src/schema/runtime-operations.ts'), 'utf8');
    assert.match(runtimeSchema, /IN \('running','paused','completed','failed','cancelled'\)/);
    const paymentOriginSql = fs.readFileSync(path.join(migrationDirectory, files[4]), "utf8");
    assert.match(paymentOriginSql, /origin text NOT NULL DEFAULT 'runtime'/);
  });

  it("uses PostgreSQL's atomic delivery receipt for Apple webhook completion", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
    const source = fs.readFileSync(
      path.join(repositoryRoot, "artifacts/api-server/src/routes/iap-apple-webhook.ts"),
      "utf8",
    );
    assert.match(source, /await pgApplySubscriptionEvent\(/);
    assert.match(source, /provider: "apple", providerEventId: notificationUUID/);
    assert.doesNotMatch(source, /AppleWebhookEvent|mongo-schemas|mongoose/);
    const store = fs.readFileSync(path.join(repositoryRoot, "artifacts/api-server/src/data/postgres-billing-store.ts"), "utf8");
    assert.match(store, /withLockedSubscription\(userId, async \(client, current\) =>/);
    assert.match(store, /insertBillingEvent\(client, \{ \.\.\.event, userId \}\)/);
    assert.match(store, /if \(recorded === "duplicate"\) return "duplicate"/);
    // Functional rollback/retry/race guarantees are exercised against a real
    // PostgreSQL server by postgres-billing.integration.test.ts.
  });
});
