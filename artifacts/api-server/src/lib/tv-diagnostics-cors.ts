import type { Request, Response } from "express";
export const TV_DIAGNOSTICS_PATH = "/api/tv/telemetry/events";
export function credentiallessTvRequest(
  req: Pick<Request, "headers">,
): boolean {
  return !["cookie", "authorization", "proxy-authorization", "x-api-key", "x-api-user-token"].some(
    (k) => req.headers[k] !== undefined,
  );
}
/** Exact public ingestion path only; opaque packaged-TV origins need anonymous CORS. */
export function applyTvDiagnosticsCors(
  req: Pick<Request, "path" | "method" | "headers">,
  res: Pick<Response, "setHeader" | "removeHeader">,
): boolean {
  if (req.path !== TV_DIAGNOSTICS_PATH || !credentiallessTvRequest(req))
    return false;
  const preflight = req.method === "OPTIONS";
  if (
    (preflight ? req.headers["access-control-request-method"] : req.method) !==
    "POST"
  )
    return false;
  if (
    preflight &&
    String(req.headers["access-control-request-headers"] || "")
      .split(",")
      .some(
        (h) =>
          h.trim() &&
          !["content-type", "accept"].includes(h.trim().toLowerCase()),
      )
  )
    return false;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.removeHeader("Access-Control-Allow-Credentials");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Cache-Control", "no-store");
  return true;
}
