import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function databaseMaintenanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.DATABASE_MAINTENANCE_READ_ONLY !== "true") {
    next();
    return;
  }
  if (SAFE_METHODS.has(req.method) || req.path === "/healthz" || req.path === "/readyz" || req.path === "/api/health") {
    next();
    return;
  }
  res.setHeader("Retry-After", process.env.DATABASE_MAINTENANCE_RETRY_AFTER || "300");
  res.status(503).json({
    error: "database_maintenance",
    message: "Database migration is in progress. Retry this request shortly.",
  });
}
