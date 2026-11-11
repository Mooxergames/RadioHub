import { beforeEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiFetch: request }));
import { confirmSitemapRebuild, rebuildAdminSitemap } from '../src/lib/admin-sitemap-rebuild';

beforeEach(() => vi.clearAllMocks());
describe('manual sitemap rebuild acknowledgement', () => {
  it.each([
    undefined, {}, { ok: true }, { built: false },
    { built: false, skippedReason: 'build-in-progress' },
    { built: false, skippedReason: 'qualified-languages-unavailable' },
    { built: false, skippedReason: 'fresh' },
    { built: true }, { built: true, qualifiedLanguages: [], activatedCount: 0 },
    { built: true, qualifiedLanguages: ['en'], activatedCount: -1 },
    { built: true, qualifiedLanguages: [''], activatedCount: 0 },
    { built: true, qualifiedLanguages: ['en'], activatedCount: 0.5 },
  ])('rejects incomplete or skipped results instead of claiming freshness: %j', result => {
    expect(() => confirmSitemapRebuild(result)).toThrow();
  });
  it('accepts a completed unchanged build without requiring new sitemap versions', () => {
    const result = { built: true, activatedCount: 0, qualifiedLanguages: ['en'] };
    expect(confirmSitemapRebuild(result)).toBe(result);
  });
  it('validates successful HTTP responses and propagates server failures without retries', async () => {
    request.mockResolvedValueOnce({ ok: true, json: async () => ({ built: false, skippedReason: 'build-in-progress' }) });
    await expect(rebuildAdminSitemap()).rejects.toThrow('tamamlanmadı');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/api/admin/sitemap/rebuild', { method: 'POST' });
    request.mockRejectedValueOnce(new Error('503 unavailable'));
    await expect(rebuildAdminSitemap()).rejects.toThrow('503 unavailable');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('shows structured server messages and rejects non-JSON proxy responses', async () => {
    request.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: 'Another build is running' }) });
    await expect(rebuildAdminSitemap()).rejects.toThrow('Another build is running');
    request.mockResolvedValueOnce({ ok: false, status: 503, json: async () => { throw new SyntaxError('HTML'); } });
    await expect(rebuildAdminSitemap()).rejects.toThrow('HTTP 503');
  });
});
