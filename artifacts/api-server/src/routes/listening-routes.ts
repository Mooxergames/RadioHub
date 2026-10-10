import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { pgRecordListening } from '../data/postgres-listening-store';
import { logger } from '../utils/logger';

export function registerListeningRoutes(app: Express): void {
  app.post('/api/listening/record', requireAuth, async (req, res) => {
    const { stationId, stationName, listenDuration, country, genre, recordId, userId: ownerId } = req.body || {};
    const userId = String((req as any).user._id);
    // A queued record belongs to the account that actually listened, even if
    // the cookie changed in another tab while this request was in flight.
    if (ownerId !== undefined && ownerId !== userId) {
      return void res.status(409).json({ error: 'Listening account changed' });
    }
    const text = (value: unknown, max: number) => value === undefined || (typeof value === 'string' && value.length <= max);
    if (typeof stationId !== 'string' || !stationId.trim() || stationId.length > 256
      || typeof listenDuration !== 'number' || !Number.isFinite(listenDuration) || listenDuration <= 0 || listenDuration > 2147483647
      || !text(stationName, 512) || !text(country, 256) || !text(genre, 512)
      || (recordId !== undefined && (typeof recordId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(recordId)))) {
      return void res.status(400).json({ error: 'Invalid listening record' });
    }
    try {
      const result = await pgRecordListening({ userId, stationId, stationName, listenDuration, country, genre, recordId });
      res.json({ success: true, totalTime: listenDuration, ...result });
    } catch (error) {
      logger.error('Error recording listening session:', error);
      res.status(503).json({ error: 'Failed to record listening session' });
    }
  });
}
