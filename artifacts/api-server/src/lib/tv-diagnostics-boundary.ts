import express, { type Express } from "express";
import {
  applyTvDiagnosticsCors,
  TV_DIAGNOSTICS_PATH,
} from "./tv-diagnostics-cors";

/** Install before generic JSON parsing and OPTIONS termination in both entrypoints. */
export function installTvDiagnosticsBoundary(app: Express) {
  app.use((req, res, next) => {
    if (req.path !== TV_DIAGNOSTICS_PATH) return next();
    // Packaged TV engines can attach ambient host cookies even when XHR sets
    // withCredentials=false. This collector never authenticates a caller:
    // discard cookies before any downstream cookie/session middleware sees them.
    // Keep explicit authorization/API-key rejection in the CORS/handler guard.
    // Materialize Node's distinct-header cache before shortening rawHeaders:
    // its lazy getter retains the original raw-header count.
    const distinctHeaders = req.headersDistinct;
    delete distinctHeaders.cookie;
    delete req.headers.cookie;
    for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
      if (req.rawHeaders[i].toLowerCase() === "cookie")
        req.rawHeaders.splice(i, 2);
    }
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
