import { describe, expect, it, vi } from 'vitest';
import { runNoindexRecovery, type NoindexBatchPreview } from '../src/lib/noindex-recovery-runner';

const snapshot = (ids: string[], totalCandidates = ids.length): NoindexBatchPreview => ({
  previewId: `preview-${ids.join('-')}`, totalCandidates, candidates: ids.map(id => ({ id })),
});
const success = async (_preview: NoindexBatchPreview, ids: string[]) => ({ restored: ids.length, restoredIds: ids, skipped: 0 });

describe('bounded noindex recovery batches', () => {
  it('re-previews after every confirmed batch and stops when no eligible rows remain', async () => {
    const preview = vi.fn().mockResolvedValueOnce(snapshot(['c'])).mockResolvedValueOnce(snapshot([]));
    const apply = vi.fn(success), onProgress = vi.fn();
    expect(await runNoindexRecovery({ initial: snapshot(['a', 'b'], 3), preview, apply,
      shouldStop: () => false, onProgress })).toEqual({ restored: 3, batches: 2, stopped: false });
    expect(apply.mock.calls.map(call => call[1])).toEqual([['a', 'b'], ['c']]);
    expect(onProgress.mock.calls).toEqual([[2, 1], [3, 2]]);
  });
  it('does not retry uncertain writes or continue past a failed rescan', async () => {
    const failedApply = vi.fn().mockRejectedValue(new Error('Response lost'));
    const preview = vi.fn();
    await expect(runNoindexRecovery({ initial: snapshot(['a']), preview, apply: failedApply,
      shouldStop: () => false, onProgress: vi.fn() })).rejects.toThrow('Response lost');
    expect(failedApply).toHaveBeenCalledTimes(1); expect(preview).not.toHaveBeenCalled();
    const onProgress = vi.fn();
    await expect(runNoindexRecovery({ initial: snapshot(['a']), preview: async () => { throw new Error('Scan unavailable'); },
      apply: success, shouldStop: () => false, onProgress })).rejects.toThrow('Scan unavailable');
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });
  it('stops between batches without cancelling an in-flight write', async () => {
    let stop = false;
    const preview = vi.fn();
    const result = await runNoindexRecovery({ initial: snapshot(['a']), preview, apply: success,
      shouldStop: () => stop, onProgress: () => { stop = true; } });
    expect(result).toEqual({ restored: 1, batches: 1, stopped: true });
    expect(preview).not.toHaveBeenCalled();
  });
  it('rejects repeated IDs, oversized batches, and mismatched receipts', async () => {
    const apply = vi.fn(success);
    for (const initial of [snapshot(['a', 'a']), snapshot(Array.from({ length: 101 }, (_, i) => String(i)))]) {
      await expect(runNoindexRecovery({ initial, preview: vi.fn(), apply, shouldStop: () => false, onProgress: vi.fn() })).rejects.toThrow();
    }
    expect(apply).not.toHaveBeenCalled();
    for (const result of [{ restored: 1, restoredIds: ['other'], skipped: 0 }, { restored: 0, restoredIds: [], skipped: 1 }]) {
      const preview = vi.fn();
      await expect(runNoindexRecovery({ initial: snapshot(['a']), preview, apply: async () => result,
        shouldStop: () => false, onProgress: vi.fn() })).rejects.toThrow('Son parti');
      expect(preview).not.toHaveBeenCalled();
    }
    await expect(runNoindexRecovery({ initial: snapshot(['a']), preview: async () => snapshot(['a']),
      apply: success, shouldStop: () => false, onProgress: vi.fn() })).rejects.toThrow('ilerlemiyor');
  });
});
