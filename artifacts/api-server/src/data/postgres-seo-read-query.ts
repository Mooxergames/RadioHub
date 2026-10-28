import type pg from 'pg';
import { getPostgresPool } from '../postgres-runtime';
import { getSeoReadDeadline } from '../utils/seo-read-deadline';
import { logger } from '../utils/logger';

type ReadKind = 'catalog' | 'metadata' | 'genre';
type ReadPhase = 'checkout' | 'begin' | 'setup' | 'query' | 'commit' | 'rollback';
let lastDiagnosticAt = -Infinity;

/** SSR queries must not inherit the 60-second maintenance-query budget.
 * SET LOCAL is transaction-scoped, so pooled connections cannot leak this limit
 * into background imports. PostgreSQL itself cancels a slow query after 4s. */
export function boundedSeoReadQuery(text: string, values?: any[], kind: ReadKind = 'catalog'): Promise<pg.QueryResult> {
  const startedAt = Date.now();
  const context = getSeoReadDeadline();
  const expiresAt = Math.min(context?.expiresAt ?? Infinity, startedAt + 4000);
  const timeoutError = () => Object.assign(new Error('SEO database read budget exceeded'), { code: 'SEO_READ_TIMEOUT' });
  const abortError = () => new DOMException('Aborted', 'AbortError');
  if (context?.signal?.aborted) return Promise.reject(abortError());
  if (expiresAt <= Date.now()) return Promise.reject(timeoutError());

  return new Promise((resolve, reject) => {
    let client: pg.PoolClient | undefined;
    let released = false;
    let settled = false;
    let failure: unknown;
    let pool: pg.Pool | undefined;
    let phase: ReadPhase = 'checkout';
    let phaseStartedAt = startedAt;
    const timings: Partial<Record<ReadPhase, number>> = {};
    const move = (next: ReadPhase) => {
      timings[phase] = (timings[phase] ?? 0) + Math.max(0, Date.now() - phaseStartedAt);
      phase = next;
      phaseStartedAt = Date.now();
    };
    const release = (discard = false) => {
      if (!client || released) return;
      released = true;
      client.removeListener('error', onClientError);
      client.release(discard || undefined);
    };
    const finish = (error?: unknown, result?: pg.QueryResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      context?.signal?.removeEventListener('abort', onAbort);
      const now = Date.now();
      if ((error || now - startedAt >= 1000) && now - lastDiagnosticAt >= 10000) {
        lastDiagnosticAt = now;
        timings[phase] = (timings[phase] ?? 0) + Math.max(0, now - phaseStartedAt);
        // Fixed phases only: never log SQL, parameters, payloads or raw errors.
        logger.warn('[seo-read]', { kind, outcome: error ? 'failed' : 'slow', phase,
          elapsedMs: Math.max(0, now - startedAt), timings,
          poolTotal: pool?.totalCount, poolIdle: pool?.idleCount, poolWaiting: pool?.waitingCount });
      }
      if (error) reject(error); else resolve(result!);
    };
    const abandon = (error: Error) => {
      release(true);
      finish(failure ?? error);
    };
    const onAbort = () => abandon(abortError());
    const onClientError = (error: Error) => {
      failure ??= error;
      abandon(error);
    };
    const timer = setTimeout(() => abandon(timeoutError()), Math.max(1, expiresAt - Date.now()));
    timer.unref();
    context?.signal?.addEventListener('abort', onAbort, { once: true });
    const check = () => {
      if (context?.signal?.aborted) throw abortError();
      if (settled || Date.now() >= expiresAt) throw timeoutError();
    };
    const rollback = async () => {
      const remaining = Math.min(100, expiresAt - Date.now());
      if (remaining <= 0) { release(true); return; }
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        move('rollback');
        await Promise.race([
          client!.query('ROLLBACK'),
          new Promise<never>((_, cleanupReject) => {
            cleanupTimer = setTimeout(() => cleanupReject(timeoutError()), remaining);
          }),
        ]);
      } catch { release(true); }
      finally { clearTimeout(cleanupTimer); }
    };

    const work = async () => {
      // pg cannot cancel an individual pool waiter. Reclaim a late checkout
      // without starting SQL, even after the caller has already timed out.
      pool = getPostgresPool();
      const acquired = await pool.connect();
      if (settled || context?.signal?.aborted || Date.now() >= expiresAt) {
        acquired.release();
        check();
      }
      client = acquired;
      client.on('error', onClientError);
      let began = false;
      try {
        check();
        move('begin');
        await client.query('BEGIN READ ONLY');
        began = true;
        check();
        // Leave a small part of the same deadline for a completed query's
        // rollback/response; SET LOCAL cannot leak into a reused connection.
        const statementMs = Math.max(1, Math.floor(expiresAt - Date.now() - 100));
        move('setup');
        await client.query(`SET LOCAL statement_timeout = '${statementMs}ms'`);
        check();
        move('query');
        const result = await client.query(text, values);
        check();
        move('commit');
        await client.query('COMMIT');
        check();
        return result;
      } catch (error) {
        failure = error;
        if (!released) {
          const serverError = error as { code?: unknown; severity?: unknown } | null;
          const recoverable = typeof serverError?.code === 'string' && /^[A-Z0-9]{5}$/.test(serverError.code)
            && !serverError.code.startsWith('08') && !['57P01', '57P02', '57P03'].includes(serverError.code)
            && serverError.severity !== 'FATAL' && serverError.severity !== 'PANIC';
          if (recoverable && began && !settled && !context?.signal?.aborted && Date.now() < expiresAt) await rollback();
          else release(true);
        }
        throw error;
      } finally { release(); }
    };
    work().then(result => finish(undefined, result), error => finish(error));
    if (context?.signal?.aborted) onAbort();
  });
}
