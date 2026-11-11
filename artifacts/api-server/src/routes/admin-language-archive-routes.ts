import type { Express, RequestHandler, Response } from 'express';
import { LanguageArchiveConflict, PostgresLanguageArchiveStore } from '../data/postgres-language-archive-store';
import CacheManager from '../cache';
import { performanceCache } from '../performance-cache';

export function registerAdminLanguageArchiveRoutes(app: Express, requireAdmin: RequestHandler,
  injectedStore?: PostgresLanguageArchiveStore) {
  const store = () => injectedStore ?? new PostgresLanguageArchiveStore();
  const base = '/api/admin/ui-language-archives';
  const error = (res: Response, cause: unknown) => res.status(cause instanceof LanguageArchiveConflict ? 409 : 503)
    .json({ error: cause instanceof LanguageArchiveConflict ? cause.message : 'Language archive temporarily unavailable' });
  const invalidate = async () => {
    await Promise.allSettled([CacheManager.clearByPattern('translations'), CacheManager.clearByPattern('tv:translations:'),
      Promise.resolve().then(() => { performanceCache.clearTranslations(); performanceCache.clearSeoAndQuickCaches(); })]);
  };
  app.get(base, requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try { res.json(await store().status()); } catch (cause) { error(res, cause); }
  });
  app.get(`${base}/backup`, requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try { res.attachment('megaradio-unused-ui-languages.json').json(await store().backup()); } catch (cause) { error(res, cause); }
  });
  app.get(`${base}/:id/backup`, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try { res.attachment('megaradio-unused-ui-languages.json').json(await store().download(String(req.params.id))); } catch (cause) { error(res, cause); }
  });
  app.post(base, requireAdmin, async (req, res) => {
    if (typeof req.body?.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.checksum)) {
      res.status(400).json({ error: 'A downloaded backup checksum is required' }); return;
    }
    try { const result = await store().archive(req.body.checksum); await invalidate(); res.json(result); } catch (cause) { error(res, cause); }
  });
  app.post(`${base}/:id/restore`, requireAdmin, async (req, res) => {
    try { const result = await store().restore(String(req.params.id)); await invalidate(); res.json(result); } catch (cause) { error(res, cause); }
  });
}
