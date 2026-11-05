import { performance } from 'node:perf_hooks';
import { getPostgresPool } from '../postgres-runtime';
import { DUPLICATE_MERGE_FAILURE_BACKOFF_MS, PostgresDuplicateJobsStore } from '../data/postgres-duplicate-jobs-store';
import CacheManager from '../cache';
import { performanceCache } from '../performance-cache';
import { logger } from '../utils/logger';
import { triggerGenreStationCountsRecompute } from './genre-station-counts';

export const duplicateMergeEnabled = () => process.env.DUPLICATE_MERGE_ENABLED !== 'false'
  && process.env.BACKGROUND_JOBS_ENABLED !== 'false' && process.env.NODE_ENV !== 'development';

function failureDetails(phase: 'cycle' | 'cache_invalidation' | 'cache_refresh', error: unknown) {
  const code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
  return { phase, ...(typeof code === 'string' && code.length === 5 && /^[A-Z0-9]{5}$/.test(code) ? { code } : {}) };
}

export class ScheduledDuplicateMerge {
  private initialized = false;
  private running = false;
  private retryAfter = 0;
  private utilization = performance.eventLoopUtilization();
  initialize(): void {
    if (this.initialized || !duplicateMergeEnabled()) return;
    this.initialized = true;
    const timer = setInterval(() => void this.runOnce(), 15_000);
    timer.unref();
  }
  async runOnce(): Promise<void> {
    if (this.running || !duplicateMergeEnabled() || performance.now() < this.retryAfter) return;
    const utilization = performance.eventLoopUtilization(this.utilization);
    this.utilization = performance.eventLoopUtilization();
    const pool = getPostgresPool();
    if (pool.waitingCount || utilization.utilization > 0.7) return;
    this.running = true;
    try {
      let result;
      try {
        result = await new PostgresDuplicateJobsStore(pool).runCycle();
      } catch (error) {
        // Also throttle locally when the database could not persist a cooldown.
        this.retryAfter = performance.now() + DUPLICATE_MERGE_FAILURE_BACKOFF_MS;
        logger.warn('[duplicate-merge] bounded cycle deferred; durable queue retained', failureDetails('cycle', error));
        return;
      }
      if (result.deleted) {
        // One bounded invalidation per committed cycle, never per station/language.
        const invalidations = await Promise.allSettled(['popular_stations','stations','community_favorites','station:detail:','similar:'].map(pattern => CacheManager.clearByPattern(pattern)));
        performanceCache.clearSeoAndQuickCaches();
        performanceCache.clearSimilarStationPools();
        for (const invalidation of invalidations) {
          if (invalidation.status === 'rejected') logger.warn('[duplicate-merge] committed cycle cache invalidation failed', failureDetails('cache_invalidation', invalidation.reason));
        }
      }
      if (result.refreshCounts) triggerGenreStationCountsRecompute('durable-duplicate-merge');
    } catch (error) {
      logger.warn('[duplicate-merge] committed cycle cache refresh failed', failureDetails('cache_refresh', error));
    } finally { this.running = false; }
  }
}
export const scheduledDuplicateMerge = new ScheduledDuplicateMerge();
