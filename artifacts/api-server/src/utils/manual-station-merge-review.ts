import { createHash } from 'node:crypto';
import { assessDuplicateMerge } from './station-duplicate-policy';

type Station = Record<string, any>;
export type ManualStationMergeReview = { expectedFingerprint: string; confirmIdentityOverride?: boolean };
export type ManualStationMergeSelection = {
  primaryStationId: string; duplicateStationIds: string[]; changes: Record<string, string>;
  review?: ManualStationMergeReview;
};
export class ManualStationMergeError extends Error {
  constructor(message: string, public readonly status: 400 | 409 | 422, public readonly code: string) { super(message); }
}
const invalid = (message: string): never => { throw new ManualStationMergeError(message, 400, 'INVALID_MANUAL_MERGE'); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isCatalogId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const patchLimits: Record<string, number> = { name: 512, url: 8192, homepage: 8192, favicon: 8192, country: 200, language: 256, genre: 256 };

export function parseManualStationMerge(body: unknown, apply = false): ManualStationMergeSelection {
  if (!object(body)) return invalid('A primary station and distinct duplicate IDs are required');
  const { primaryStationId, duplicateStationIds } = body;
  if (!isCatalogId(primaryStationId) || !Array.isArray(duplicateStationIds) || duplicateStationIds.length < 1 || duplicateStationIds.length > 49
    || !duplicateStationIds.every(isCatalogId) || new Set(duplicateStationIds).size !== duplicateStationIds.length || duplicateStationIds.includes(primaryStationId)) {
    return invalid('Select 2 to 50 distinct catalog station IDs, including one primary');
  }
  const changes: Record<string, string> = {};
  if (body.mergeData !== undefined) {
    if (!object(body.mergeData)) return invalid('mergeData must be an object of approved string fields');
    for (const field of Object.keys(body.mergeData).sort()) {
      const value = body.mergeData[field];
      if (!Object.hasOwn(patchLimits, field) || typeof value !== 'string' || value.length > patchLimits[field]
        || /[\u0000-\u001f\u007f]/.test(value)) return invalid(`Invalid mergeData field: ${Object.hasOwn(patchLimits, field) ? field : 'unsupported'}`);
      // Match the native store: blank values do not clear existing fields.
      if (value.trim()) changes[field] = value.trim();
    }
  }
  let review: ManualStationMergeReview | undefined;
  if (apply) {
    if (body.confirm !== true || typeof body.expectedFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedFingerprint)
      || (body.confirmIdentityOverride !== undefined && typeof body.confirmIdentityOverride !== 'boolean')) {
      return invalid('A preview fingerprint and explicit confirmation are required');
    }
    review = { expectedFingerprint: body.expectedFingerprint, confirmIdentityOverride: body.confirmIdentityOverride === true };
  }
  return { primaryStationId, duplicateStationIds: [...duplicateStationIds].sort(), changes, ...(review ? { review } : {}) };
}

const identityFields = ['_id', 'stationuuid', 'name', 'slug', 'slugAliases', 'url', 'urlResolved', 'country', 'countryCode',
  'city', 'state', 'noIndex', 'redirectToSlug', 'manualEditFields'] as const;
const cardFields = ['_id', 'name', 'slug', 'url', 'urlResolved', 'country', 'countryCode', 'noIndex', 'redirectToSlug'] as const;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value === undefined ? null : value;
}
const card = (station: Station) => Object.fromEntries(cardFields.map(field => [field, station[field] ?? null]));

export function buildManualStationMergePreview(selection: ManualStationMergeSelection, documents: readonly Station[], expectedFingerprint?: string) {
  const ids = [selection.primaryStationId, ...selection.duplicateStationIds];
  const byId = new Map(documents.map(station => [station._id, station]));
  if (documents.length !== ids.length || byId.size !== ids.length || ids.some(id => !byId.has(id))) {
    throw new ManualStationMergeError('A selected station is missing; preview the current group again', 409, 'MANUAL_MERGE_STALE_REVIEW');
  }
  const snapshots = [...ids].sort().map(id => Object.fromEntries(identityFields.map(field => [field, byId.get(id)![field] ?? null])));
  // An optimistic concurrency token, not an authorization signature. Only
  // current catalog documents supply the snapshots, never caller-supplied data.
  const fingerprint = createHash('sha256').update(JSON.stringify(stable({ version: 1, primaryStationId: selection.primaryStationId,
    members: snapshots, changes: selection.changes }))).digest('hex');
  if (expectedFingerprint !== undefined && fingerprint !== expectedFingerprint) {
    throw new ManualStationMergeError('Selected station identity changed; preview the group again', 409, 'MANUAL_MERGE_STALE_REVIEW');
  }
  const primary = byId.get(selection.primaryStationId)!;
  if (primary.noIndex === true || (typeof primary.redirectToSlug === 'string' && primary.redirectToSlug.trim())) {
    throw new ManualStationMergeError('Choose an indexable primary without an existing redirect', 422, 'MANUAL_MERGE_INVALID_PRIMARY');
  }
  const identity = assessDuplicateMerge(ids.map(id => byId.get(id)!));
  const warnings = ['Donor records will be archived and references reassigned; this is not a full undo operation.'];
  if (!identity.eligible) warnings.push(identity.reason);
  if (Object.keys(selection.changes).length) warnings.push('Approved field changes will be marked as manual edits.');
  return { primaryStationId: selection.primaryStationId, duplicateStationIds: selection.duplicateStationIds,
    primaryStation: card(primary), duplicateStations: selection.duplicateStationIds.map(id => card(byId.get(id)!)),
    fingerprint, identity, requiresIdentityConfirmation: !identity.eligible, changes: selection.changes, warnings };
}

export function validateManualStationMergeReview(selection: ManualStationMergeSelection, documents: readonly Station[], review: ManualStationMergeReview): void {
  const preview = buildManualStationMergePreview(selection, documents, review.expectedFingerprint);
  if (preview.requiresIdentityConfirmation && review.confirmIdentityOverride !== true) {
    throw new ManualStationMergeError('Explicit identity override confirmation is required', 422, 'MANUAL_MERGE_IDENTITY_CONFIRMATION_REQUIRED');
  }
}
