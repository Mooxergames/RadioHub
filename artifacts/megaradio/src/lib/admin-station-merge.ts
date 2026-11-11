import { apiFetch } from '@/lib/queryClient';

interface ReviewStation { _id: string; name: string; country: string; url: string }
export interface ManualMergePreview {
  primaryStationId: string;
  duplicateStationIds: string[];
  primaryStation: ReviewStation;
  duplicateStations: ReviewStation[];
  fingerprint: string;
  identity: { eligible: boolean; reason: string };
  requiresIdentityConfirmation: boolean;
  changes: Record<string, string>;
  warnings: string[];
}
export interface ManualMergeSelection { primaryStationId: string; duplicateStationIds: string[] }

export function parseManualMergePreview(review: any, selection: ManualMergeSelection): ManualMergePreview {
  const sameIds = (left: unknown, right: string[]) => Array.isArray(left) && left.length === right.length &&
    [...left].sort().every((id, i) => id === [...right].sort()[i]);
  const validStation = (station: any) => station && ['_id', 'name', 'url'].every(key => typeof station[key] === 'string') &&
    (station.country === null || typeof station.country === 'string');
  if (!review || review.primaryStationId !== selection.primaryStationId ||
    !sameIds(review.duplicateStationIds, selection.duplicateStationIds) ||
    !validStation(review.primaryStation) || review.primaryStation._id !== selection.primaryStationId ||
    !Array.isArray(review.duplicateStations) || !review.duplicateStations.every(validStation) ||
    !sameIds(review.duplicateStations.map((s: ReviewStation) => s._id), selection.duplicateStationIds) ||
    !/^[a-f0-9]{64}$/.test(review.fingerprint) || typeof review.requiresIdentityConfirmation !== 'boolean' ||
    typeof review.identity?.eligible !== 'boolean' || typeof review.identity?.reason !== 'string' ||
    (!review.identity.eligible && !review.requiresIdentityConfirmation) ||
    !review.changes || typeof review.changes !== 'object' || Array.isArray(review.changes) ||
    !Object.values(review.changes).every(value => typeof value === 'string') ||
    !Array.isArray(review.warnings) || !review.warnings.every((warning: unknown) => typeof warning === 'string')) {
    throw new Error('Invalid merge preview. Refresh candidates and review again.');
  }
  return review;
}

export async function requestManualMerge(path: 'merge-preview' | 'merge', body: unknown, signal: AbortSignal) {
  const response = await apiFetch(`/api/admin/stations/${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
  return data;
}

export function confirmedManualMergeBody(review: ManualMergePreview, identityConfirmed: boolean) {
  if (review.requiresIdentityConfirmation && !identityConfirmed) throw new Error('Broadcast identity confirmation is required');
  return { primaryStationId: review.primaryStationId, duplicateStationIds: review.duplicateStationIds,
    mergeData: review.changes, expectedFingerprint: review.fingerprint, confirm: true,
    ...(review.requiresIdentityConfirmation ? { confirmIdentityOverride: true } : {}),
  };
}
