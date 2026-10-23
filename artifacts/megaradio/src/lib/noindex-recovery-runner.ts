export interface NoindexBatchPreview {
  previewId: string;
  totalCandidates: number;
  candidates: Array<{ id: string }>;
}

export interface NoindexBatchResult {
  restored: number;
  restoredIds: string[];
  skipped: number;
}

/** Each batch uses a new server snapshot. Never retry an uncertain write. */
export async function runNoindexRecovery<P extends NoindexBatchPreview>(options: {
  initial: P;
  preview: () => Promise<P>;
  apply: (preview: P, ids: string[]) => Promise<NoindexBatchResult>;
  shouldStop: () => boolean;
  onProgress: (restored: number, batches: number) => void;
}) {
  let preview = options.initial;
  let restored = 0;
  let batches = 0;
  const seen = new Set<string>();
  const maxBatches = Math.ceil(preview.totalCandidates / 100) + 1;
  while (preview.candidates.length && !options.shouldStop()) {
    if (batches >= maxBatches) throw new Error('Aday sayısı değişti. Yeni inceleme gerekli.');
    const ids = preview.candidates.map(row => row.id);
    if (ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => seen.has(id))) {
      throw new Error('Önizleme ilerlemiyor. Yeni inceleme gerekli.');
    }
    const result = await options.apply(preview, ids);
    if (result.restored !== ids.length || result.skipped !== 0 || result.restoredIds.length !== ids.length ||
        new Set(result.restoredIds).size !== ids.length || result.restoredIds.some(id => !ids.includes(id))) {
      throw new Error('Son parti doğrulanamadı. Yeniden uygulamadan önce güncel kayıtları inceleyin.');
    }
    ids.forEach(id => seen.add(id));
    restored += result.restored;
    batches++;
    options.onProgress(restored, batches);
    if (options.shouldStop()) break;
    preview = await options.preview();
  }
  return { restored, batches, stopped: options.shouldStop() };
}
