import { installTvDiagnosticsBoundary } from "../src/lib/tv-diagnostics-boundary";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import express from "express";
import {
  validateTvDiagnosticBatch,
  validBundleVersion,
} from "../src/lib/tv-diagnostics-policy";
import { applyTvDiagnosticsCors } from "../src/lib/tv-diagnostics-cors";
import {
  createTvDiagnosticHandlers,
  registerTvDiagnosticRoutes,
} from "../src/routes/tv-diagnostics-routes";
import { requireAdmin } from "../src/middleware/auth";
const event = {
  event: "js_error",
  code: "type_error",
  route: "settings",
  module: "main",
  line: 123,
  column: 4,
};
const batch = () => ({
  platform: "webos",
  appVersion: "1.0.4",
  bundleVersion: "gha-42366516635-1-b74decb5a90e116fd5ae99f3c412152d454ca14d",
  consent: { diagnostics: true, analytics: false },
  events: [{ ...event }],
});
test("strict contract accepts actual deployed bundle and rejects sensitive fields and missing consent", () => {
  assert.ok(validBundleVersion(batch().bundleVersion));
  assert.ok(validateTvDiagnosticBatch(batch()));
  for (const secret of [
    "message",
    "stack",
    "url",
    "token",
    "email",
    "deviceId",
    "stationName",
    "query",
    "analyticsClientId",
  ]) {
    assert.equal(
      validateTvDiagnosticBatch({ ...batch(), [secret]: "private" }),
      null,
      secret,
    );
    assert.equal(
      validateTvDiagnosticBatch({
        ...batch(),
        events: [{ ...event, [secret]: "private" }],
      }),
      null,
      secret,
    );
  }
  assert.equal(
    validateTvDiagnosticBatch({
      ...batch(),
      consent: { diagnostics: false, analytics: false },
    }),
    null,
  );
  assert.equal(
    validateTvDiagnosticBatch({
      ...batch(),
      events: [{ event: "screen_view", code: "none", route: "discover" }],
    }),
    null,
  );
  assert.ok(
    validateTvDiagnosticBatch({
      ...batch(),
      consent: { diagnostics: false, analytics: true },
      events: [{ event: "screen_view", code: "none", route: "discover" }],
    }),
  );
  for (const changes of [
    { route: "/search?q=private" },
    { code: "Error token=private" },
    { module: "https://private" },
    { line: Infinity },
    { column: -1 },
  ])
    assert.equal(
      validateTvDiagnosticBatch({
        ...batch(),
        events: [{ ...event, ...changes }],
      }),
      null,
    );
  assert.equal(
    validateTvDiagnosticBatch({ ...batch(), events: Array(11).fill(event) }),
    null,
  );
  assert.equal(validBundleVersion("gha-private@example.com"), false);
});
test("exact ingestion CORS exposes only anonymous POST; admin and auth stay private", () => {
  for (const origin of [
    "null",
    "app://com.radiomega.tv",
    "https://cdn.themegaradio.com",
  ]) {
    const headers: any = {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    };
    const output = new Map();
    const res: any = {
      setHeader: (k: any, v: any) => output.set(k, v),
      removeHeader: (k: any) => output.delete(k),
    };
    assert.equal(
      applyTvDiagnosticsCors(
        { path: "/api/tv/telemetry/events", method: "OPTIONS", headers } as any,
        res,
      ),
      true,
    );
    assert.equal(output.get("Access-Control-Allow-Origin"), "*");
    assert.equal(output.has("Access-Control-Allow-Credentials"), false);
    for (const path of [
      "/api/admin/tv-diagnostics",
      "/api/tv/auth/code",
      "/api/tv/telemetry/events/private",
    ])
      assert.equal(
        applyTvDiagnosticsCors(
          { path, method: "OPTIONS", headers } as any,
          res,
        ),
        false,
      );
    for (const key of ["cookie", "authorization", "x-api-key"])
      assert.equal(
        applyTvDiagnosticsCors(
          {
            path: "/api/tv/telemetry/events",
            method: "POST",
            headers: { ...headers, [key]: "redacted" },
          } as any,
          res,
        ),
        false,
      );
  }
});
test("HTTP boundary caps body, rejects cookies, dedupes and throttles; outage does not claim success", async () => {
  const saved: any[] = [];
  let failure = false;
  const h = createTvDiagnosticHandlers({
    record: async (b) => {
      if (failure) throw new Error("private DB detail");
      saved.push(b);
    },
    list: async () => [],
  });
  const app = express();
  installTvDiagnosticsBoundary(app);
  app.post("/api/tv/telemetry/events", h.ingest);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as any;
  const url = `http://127.0.0.1:${address.port}/api/tv/telemetry/events`;
  const send = (body: any, headers: any = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await send(batch(), { cookie: "private" })).status, 403);
    assert.equal(saved.length, 0);
    assert.equal(
      (await send({ ...batch(), padding: "x".repeat(9000) })).status,
      413,
    );
    assert.equal((await send(batch())).status, 204);
    assert.equal((await send(batch())).status, 204);
    assert.equal(saved.length, 1);
    failure = true;
    const changed = { ...batch(), events: [{ ...event, line: 999 }] };
    assert.equal((await send(changed)).status, 503);
    failure = false;
    assert.equal((await send(changed)).status, 204);
    assert.equal(saved.length, 2);
    const usage = {
      ...batch(),
      consent: { diagnostics: false, analytics: true },
      analytics: {
        clientId: "tv-" + "a".repeat(32),
        sessionId: "1794052800",
        engagementTimeMsec: 12,
      },
      events: [{ event: "app_open", code: "none", route: "discover" }],
    };
    assert.equal((await send(usage)).status, 204);
    assert.equal("analytics" in saved.at(-1), false);
    for (let i = 0; i < 15; i++) await send(batch());
    assert.equal((await send(batch())).status, 429);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("reports require actual admin middleware, bounded filters and never claim native crash metrics", async () => {
  const registered: any[] = [];
  registerTvDiagnosticRoutes(
    {
      post: (...x: any[]) => registered.push(x),
      get: (...x: any[]) => registered.push(x),
    } as any,
    requireAdmin as any,
  );
  assert.equal(registered[1][1], requireAdmin);
  const res: any = {
    statusCode: 200,
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    json(x: any) {
      this.body = x;
      return this;
    },
    setHeader() {},
    removeHeader() {},
    header() {},
  };
  await requireAdmin({ headers: {}, session: undefined } as any, res, () =>
    assert.fail("anonymous admin access"),
  );
  assert.equal(res.statusCode, 401);
  const h = createTvDiagnosticHandlers({
    record: async () => {},
    list: async () => [],
  });
  res.statusCode = 200;
  await h.report({ query: { days: 31 } } as any, res, () => {});
  assert.equal(res.statusCode, 400);
  await h.report({ query: { days: 7 } } as any, res, () => {});
  assert.match(
    res.body.measurement,
    /not unique users, native crashes or ANRs/,
  );
});
test("both real entrypoints install boundary before OPTIONS/body parsers; retention and cardinality SQL stay bounded", async () => {
  for (const file of ["index-api.ts", "index-web.ts"]) {
    const s = await readFile(
      new URL("../src/" + file, import.meta.url),
      "utf8",
    );
    assert.ok(
      s.indexOf("installTvDiagnosticsBoundary(app)") <
        s.indexOf("req.method === 'OPTIONS'"),
    );
    assert.ok(
      s.indexOf("installTvDiagnosticsBoundary(app)") <
        s.indexOf("app.use(express.json"),
    );
  }
  const sql = await readFile(
    new URL("../src/data/postgres-tv-diagnostics.ts", import.meta.url),
    "utf8",
  );
  assert.match(sql, /<4096/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /LIMIT 2000/);
  assert.match(sql, /current_date-29/);
  const cleanup = await readFile(
    new URL("../src/data/postgres-tv-store.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    cleanup,
    /DELETE FROM tv_diagnostic_daily WHERE day<current_date-29/,
  );
});
