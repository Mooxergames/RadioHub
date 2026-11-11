import type { Express, RequestHandler } from 'express';
import { getAdminSetting, pgAdminSettings } from '../data/postgres-admin-settings-store';
import { STATION_SYNC_POLICY_KEY, stationIntakeEnabled } from '../utils/station-sync-policy';

export function registerAdminStationSyncPolicyRoutes(app: Express, requireAdmin: RequestHandler) {
  app.get('/api/admin/sync/policy', requireAdmin, async (_req, res) => {
    try {
      const setting = await getAdminSetting(STATION_SYNC_POLICY_KEY);
      res.json({ allowNewStations: stationIntakeEnabled(setting), updatedAt: setting?.updatedAt ?? null });
    } catch {
      res.status(503).json({ error: 'Unable to read station sync policy' });
    }
  });
  app.put('/api/admin/sync/policy', requireAdmin, async (req, res) => {
    if (!req.body || typeof req.body.allowNewStations !== 'boolean' ||
        Object.keys(req.body).some(key => key !== 'allowNewStations')) {
      return void res.status(400).json({ error: 'allowNewStations must be a boolean' });
    }
    try {
      const username = (req.session as any)?.adminAuth?.username;
      const result = await pgAdminSettings().save({ key: STATION_SYNC_POLICY_KEY,
        value: { allowNewStations: req.body.allowNewStations },
        changedBy: typeof username === 'string' ? username : null });
      res.json({ allowNewStations: req.body.allowNewStations, updatedAt: result.changedAt });
    } catch {
      res.status(503).json({ error: 'Unable to save station sync policy' });
    }
  });
}
