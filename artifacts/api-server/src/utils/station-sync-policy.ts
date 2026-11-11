export const STATION_SYNC_POLICY_KEY = 'station-sync-policy';

// Preserve the previous mode until an administrator explicitly pauses intake.
// A malformed stored override must never silently enable catalogue growth.
export function stationIntakeEnabled(setting: { value: unknown } | null): boolean {
  if (!setting) return true;
  return (setting.value as { allowNewStations?: unknown } | null)?.allowNewStations === true;
}
