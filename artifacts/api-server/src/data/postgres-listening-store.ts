import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { getPostgresPool } from '../postgres-runtime';
import { lockStationIdentity } from './station-identity-store';

type Reader = Pick<Pool | PoolClient, 'query'>;
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

async function totalSeconds(userId: string, source: any, reader: Reader): Promise<number> {
  if (typeof source?.listeningTotalSeconds === 'number' && Number.isFinite(source.listeningTotalSeconds) && source.listeningTotalSeconds >= 0) {
    return source.listeningTotalSeconds;
  }
  const history = await reader.query(`SELECT COALESCE(sum(listen_duration),0) AS seconds
    FROM listening_history WHERE user_id=$1 AND interaction_type='listen'`, [userId]);
  // Imported totals and legacy history may overlap. Use the larger known total
  // as the one-time baseline, never add both representations of old listening.
  // Recommendation interactions are not independent listening sessions.
  return Math.max(nonnegative(source?.totalListeningTime) * 60, Number(history.rows[0].seconds));
}

/** Public account contract remains minutes; storage and telemetry use seconds. */
export async function pgListeningTotalMinutes(userId: string): Promise<number> {
  const pool = getPostgresPool();
  const result = await pool.query('SELECT source FROM users WHERE id=$1', [userId]);
  if (!result.rows[0]) return 0;
  return (await totalSeconds(userId, result.rows[0].source, pool)) / 60;
}

export interface ListeningRecord {
  userId: string;
  stationId: string;
  stationName?: string;
  listenDuration: number;
  country?: string;
  genre?: string;
  recordId?: string;
}

export async function pgRecordListening(input: ListeningRecord): Promise<{ recorded: boolean; totalListeningTime: number }> {
  if (!Number.isFinite(input.listenDuration) || input.listenDuration <= 0 || input.listenDuration > 2147483647) throw new Error('Invalid listen duration');
  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    // Preserve station-merge lock order: station before user/history writes.
    const stationId = await lockStationIdentity(input.stationId, client, 'KEY SHARE') ?? input.stationId;
    const user = await client.query('SELECT source FROM users WHERE id=$1 FOR UPDATE', [input.userId]);
    const previous = await totalSeconds(input.userId, user.rows[0]?.source, client);
    const id = input.recordId
      ? `listen-${createHash('sha256').update(JSON.stringify([input.userId, input.recordId])).digest('hex')}`
      : randomBytes(12).toString('hex'); // Existing mobile clients remain compatible.
    const seconds = Math.max(1, Math.round(input.listenDuration));
    const inserted = await client.query(`INSERT INTO listening_history(id,user_id,session_id,station_id,station_name,listen_duration,country,genre,interaction_type,listened_at)
      VALUES ($1,$2,$2,$3,$4,$5,$6,$7,'listen',now()) ON CONFLICT(id) DO NOTHING RETURNING id`,
    [id,input.userId,stationId,input.stationName || 'Unknown',seconds,input.country || 'Unknown',input.genre || 'Unknown']);
    const total = previous + (inserted.rowCount ? seconds : 0);
    // The row lock serializes concurrent tabs/devices; history and total commit
    // together. A retried record cannot increment either of them twice.
    await client.query(`UPDATE users SET source=COALESCE(source,'{}'::jsonb) || $2::jsonb WHERE id=$1`,
      [input.userId, JSON.stringify({ listeningTotalSeconds: total, totalListeningTime: total / 60 })]);
    await client.query('COMMIT');
    return { recorded: !!inserted.rowCount, totalListeningTime: total / 60 };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
