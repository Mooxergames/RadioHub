import { randomBytes } from "node:crypto";
export type IapEventResult = 'success' | 'replay_blocked' | 'invalid_receipt' | 'expired' | 'apple_error' | 'google_error' | 'missing_credentials' | 'bad_request' | 'persist_error' | 'fatal_error';

export function iapAuditProvider(platform: string): "apple" | "google" {
  // Malformed/unknown platform audit attempts retain their platform in payload;
  // this matches the existing validation audit provider convention.
  return platform === "android" ? "google" : "apple";
}

export function iapAuditEventId(auditId: string): string {
  return `audit:${auditId}`;
}

export function createIapAuditIdentity(platform: string): {
  auditId: string; provider: "apple" | "google"; providerEventId: string;
} {
  const auditId = randomBytes(12).toString("hex");
  return { auditId, provider: iapAuditProvider(platform), providerEventId: iapAuditEventId(auditId) };
}
