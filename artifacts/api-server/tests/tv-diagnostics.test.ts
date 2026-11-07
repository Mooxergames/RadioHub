import session from "express-session";
import { createHmac, randomBytes } from "node:crypto";
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
  batchId: "b-" + randomBytes(16).toString("hex"),
  platform: "webos",
  appVersion: "1.0.4",
  bundleVersion: "gha-42366516635-1-b74decb5a90e116fd5ae99f3c412152d454ca14d",
  consent: { diagnostics: true, analytics: false },
  events: [{ ...event }],
});
test("strict contract accepts actual deployed bundle and rejects sensitive fields and missing consent", () => {
  assert.ok(validBundleVersion(batch().bundleVersion));
  assert.ok(validateTvDiagnosticBatch(batch()));
  assert.equal(
    validateTvDiagnosticBatch({ ...batch(), batchId: undefined }),
    null,
  );
  assert.equal(
    validateTvDiagnosticBatch({ ...batch(), batchId: "private@example.com" }),
    null,
  );
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
test("HTTP boundary caps body, rejects explicit credentials, dedupes and throttles; outage does not claim success", async () => {
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
    assert.equal((await send(batch(), { authorization: "Bearer test-only" })).status, 403);
    assert.equal(saved.length, 0);
    assert.equal(
      (await send({ ...batch(), padding: "x".repeat(9000) })).status,
      413,
    );
    const request = batch();
    assert.equal((await send(request)).status, 204);
    assert.equal((await send(request)).status, 204);
    assert.equal(saved.length, 1);
    // Same NAT and event shape, distinct flush nonce: count both reports.
    assert.equal((await send(batch())).status, 204);
    assert.equal(saved.length, 2);
    failure = true;
    const changed = { ...batch(), events: [{ ...event, line: 999 }] };
    assert.equal((await send(changed)).status, 503);
    failure = false;
    assert.equal((await send(changed)).status, 204);
    assert.equal(saved.length, 3);
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
    assert.equal("batchId" in saved.at(-1), false);
    for (let i = 0; i < 14; i++) await send(batch());
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
      s.indexOf("app.use(geoBlockMiddleware)") <
        s.indexOf("installTvDiagnosticsBoundary(app)"),
    );
    if (file === "index-api.ts")
      assert.ok(
        s.indexOf("app.use(databaseMaintenanceMiddleware)") <
          s.indexOf("installTvDiagnosticsBoundary(app)"),
      );
    assert.ok(
      s.indexOf("installTvDiagnosticsBoundary(app)") <
        s.indexOf("req.method === 'OPTIONS'"),
    );
    assert.ok(
      s.indexOf("installTvDiagnosticsBoundary(app)") <
        s.indexOf("app.use(express.json"),
    );
    const sessionIndex = s.indexOf("app.use(session(");
    if (sessionIndex >= 0)
      assert.ok(s.indexOf("installTvDiagnosticsBoundary(app)") < sessionIndex);
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

test("concurrent retry is never acknowledged before commit; failed writes remain retryable", async () => {
  let rejectFirst: (e: Error) => void = () => {};
  let attempts = 0,
    commits = 0;
  const h = createTvDiagnosticHandlers({
    record: async () => {
      attempts++;
      if (attempts === 1)
        await new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
      commits++;
    },
    list: async () => [],
  });
  const response = () => ({
    statusCode: 200,
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    json() {
      return this;
    },
    sendStatus(n: number) {
      this.statusCode = n;
      return this;
    },
  });
  const req: any = { headers: {}, ip: "192.0.2.10", body: batch() };
  const first = response();
  const pending = h.ingest(req, first as any, () => {});
  const concurrent = response();
  await h.ingest(req, concurrent as any, () => {});
  assert.equal(concurrent.statusCode, 503);
  assert.equal(commits, 0);
  rejectFirst(new Error("database unavailable"));
  await pending;
  assert.equal(first.statusCode, 503);
  const retry = response();
  await h.ingest(req, retry as any, () => {});
  assert.equal(retry.statusCode, 204);
  assert.equal(commits, 1);
  const completedRetry = response();
  await h.ingest(req, completedRetry as any, () => {});
  assert.equal(completedRetry.statusCode, 204);
  assert.equal(commits, 1);
});

test("native ambient cookies are discarded before session auth only on exact collector path", async () => {
  const secret = "local-fixture-only-secret";
  const sid = "local-fixture-session";
  const signature = createHmac("sha256", secret).update(sid).digest("base64").replace(/=+$/, "");
  const cookie = "connect.sid=" + encodeURIComponent("s:" + sid + "." + signature);
  const store = new session.MemoryStore();
  let gets = 0, sets = 0;
  store.get = (_id, cb) => {
    gets++;
    cb(null, { cookie: { originalMaxAge: 60000, expires: new Date(Date.now() + 60000), httpOnly: true, path: "/" }, adminAuth: { role: "admin" } } as any);
  };
  store.set = (_id, _value, cb) => { sets++; cb?.(); };
  const saved: any[] = [];
  const h = createTvDiagnosticHandlers({ record: async b => { saved.push(b); }, list: async () => [] });
  const app = express();
  installTvDiagnosticsBoundary(app);
  app.use((req, _res, next) => {
    if (req.path === "/api/tv/telemetry/events") {
      assert.equal(req.headers.cookie, undefined);
      assert.equal(req.rawHeaders.some((value, index) => index % 2 === 0 && value.toLowerCase() === "cookie"), false);
      assert.equal(req.headersDistinct.cookie, undefined);
    }
    next();
  });
  app.use(session({ secret, store, resave: false, saveUninitialized: false }));
  app.post("/api/tv/telemetry/events", h.ingest);
  app.get("/api/admin/tv-diagnostics", requireAdmin as any, (_req, res) => res.json({ protected: true }));
  app.get("/api/tv/telemetry/events/private", (req, res) => res.json({ cookiePreserved: !!req.headers.cookie }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  const send = (body: any, headers: any = {}) => fetch(url + "/api/tv/telemetry/events", { method: "POST", headers: { "content-type": "application/json", cookie, ...headers }, body: JSON.stringify(body) });
  try {
    // No Origin header: actual privileged Tizen request shape.
    const accepted = await send(batch());
    assert.equal(accepted.status, 204);
    assert.equal(accepted.headers.get("set-cookie"), null);
    assert.equal(accepted.headers.get("access-control-allow-origin"), "*");
    assert.equal(accepted.headers.get("access-control-allow-credentials"), null);
    assert.equal(gets, 0); assert.equal(sets, 0);
    assert.equal(saved.length, 1);
    assert.equal(JSON.stringify(saved).includes(sid), false);
    assert.equal((await send({ ...batch(), consent: { diagnostics: false, analytics: false } })).status, 400);
    assert.equal((await send({ ...batch(), extra: "x".repeat(9000) })).status, 413);
    for (const name of ["authorization", "proxy-authorization", "x-api-key", "x-api-user-token"])
      assert.equal((await send(batch(), { [name]: "test-only" })).status, 403);
    assert.equal(gets, 0); assert.equal(sets, 0); assert.equal(saved.length, 1);
    assert.equal((await fetch(url + "/api/admin/tv-diagnostics")).status, 401);
    // Adjacent paths retain their existing cookie/session behavior and admin auth.
    assert.equal((await fetch(url + "/api/admin/tv-diagnostics", { headers: { cookie } })).status, 200);
    assert.ok(gets > 0);
    const adjacent = await fetch(url + "/api/tv/telemetry/events/private", { headers: { cookie } });
    assert.equal((await adjacent.json()).cookiePreserved, true);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
