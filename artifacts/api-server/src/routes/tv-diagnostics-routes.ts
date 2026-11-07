import { relayTvUsage } from "../services/tv-ga4-relay";
import { type Express, type RequestHandler } from "express";
import {
  credentiallessTvRequest,
  TV_DIAGNOSTICS_PATH,
} from "../lib/tv-diagnostics-cors";
import {
  validateTvDiagnosticBatch,
  type TvDiagnosticBatch,
} from "../lib/tv-diagnostics-policy";
import {
  recordTvDiagnostics,
  listTvDiagnostics,
} from "../data/postgres-tv-diagnostics";

type Store = {
  record: (batch: TvDiagnosticBatch) => Promise<void>;
  list: (days: number, platform?: string) => Promise<any[]>;
};
export function createTvDiagnosticHandlers(
  store: Store = { record: recordTvDiagnostics, list: listTvDiagnostics },
  now = Date.now,
) {
  // Addresses exist only in a bounded short-lived memory throttle; never persist or log them.
  const recent = new Map<
    string,
    { expires: number; count: number; seen: Set<string> }
  >();
  const expiry = setInterval(() => {
    const time = now();
    for (const [key, value] of recent)
      if (value.expires <= time) recent.delete(key);
  }, 60000);
  expiry.unref();
  let pending = 0;
  const ingest: RequestHandler = async (req, res) => {
    if (!credentiallessTvRequest(req))
      return void res
        .status(403)
        .json({ error: "Anonymous TV ingestion only" });
    const batch = validateTvDiagnosticBatch(req.body);
    if (!batch)
      return void res
        .status(400)
        .json({ error: "Invalid or unconsented TV diagnostic batch" });
    const time = now(),
      address = req.ip || req.socket?.remoteAddress || "unknown";
    let bucket = recent.get(address);
    if (!bucket || bucket.expires <= time) {
      if (recent.size >= 10000)
        for (const [k, v] of recent) if (v.expires <= time) recent.delete(k);
      if (recent.size >= 10000 && !bucket) return void res.sendStatus(429);
      bucket = { expires: time + 60000, count: 0, seen: new Set() };
      recent.set(address, bucket);
    }
    if (++bucket.count > 20 || pending >= 32) return void res.sendStatus(429);
    const events = batch.events.filter((e) => {
      const signature = JSON.stringify([
        batch.platform,
        batch.appVersion,
        batch.bundleVersion,
        e,
      ]);
      if (bucket!.seen.has(signature)) return false;
      bucket!.seen.add(signature);
      return true;
    });
    if (!events.length) return void res.sendStatus(204);
    pending++;
    try {
      // Keep pseudonymous GA4 metadata out of persistence, even the store boundary.
      const { analytics, ...anonymous } = batch;
      await store.record({ ...anonymous, events });
      if (analytics) relayTvUsage({ ...batch, events });
      res.sendStatus(204);
    } catch {
      // A failed write is not a delivered report; allow the client's bounded retry.
      for (const e of events)
        bucket!.seen.delete(
          JSON.stringify([
            batch.platform,
            batch.appVersion,
            batch.bundleVersion,
            e,
          ]),
        );
      res.status(503).json({ error: "TV diagnostics temporarily unavailable" });
    } finally {
      pending--;
    }
  };
  const report: RequestHandler = async (req, res) => {
    const days = Number(req.query.days ?? 7),
      platform = req.query.platform;
    if (
      !Number.isInteger(days) ||
      days < 1 ||
      days > 30 ||
      (platform !== undefined && platform !== "tizen" && platform !== "webos")
    )
      return void res.status(400).json({ error: "Invalid diagnostic filter" });
    try {
      res.json({
        days,
        retentionDays: 30,
        ga4: relayTvUsage.status(),
        measurement:
          "Opt-in event counts, not unique users, native crashes or ANRs",
        rows: await store.list(days, platform as string | undefined),
      });
    } catch {
      res.status(503).json({ error: "TV diagnostics temporarily unavailable" });
    }
  };
  return { ingest, report };
}
export function registerTvDiagnosticRoutes(
  app: Express,
  requireAdmin: RequestHandler,
) {
  const handlers = createTvDiagnosticHandlers();
  app.post(TV_DIAGNOSTICS_PATH, handlers.ingest);
  app.get("/api/admin/tv-diagnostics", requireAdmin, handlers.report);
}
