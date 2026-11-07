import express, { type Express } from "express";
import {
  applyTvDiagnosticsCors,
  TV_DIAGNOSTICS_PATH,
} from "./tv-diagnostics-cors";

/** Install before generic JSON parsing and OPTIONS termination in both entrypoints. */
export function installTvDiagnosticsBoundary(app: Express) {
  app.use((req, res, next) => {
    if (req.path !== TV_DIAGNOSTICS_PATH) return next();
    res.removeHeader("Access-Control-Allow-Credentials");
    if (!applyTvDiagnosticsCors(req, res))
      return void res
        .status(403)
        .json({ error: "Anonymous TV ingestion only" });
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    if (!req.is("application/json"))
      return void res.status(415).json({ error: "Expected JSON" });
    next();
  });
  app.use(
    TV_DIAGNOSTICS_PATH,
    express.json({ limit: "8kb", strict: true }),
    (err: any, _req: any, res: any, next: any) => {
      if (!err) return next();
      res
        .status(err.type === "entity.too.large" ? 413 : 400)
        .json({ error: "Invalid TV diagnostic body" });
    },
  );
}
