import type pg from 'pg';
import { getPostgresPool } from '../postgres-runtime';
import { lockStationIdentity, resolveStationId } from './station-identity-store';

/** Caller holds the canonical station lock in its transaction. */
export async function recordStationVote(client: pg.PoolClient, stationId: string, userId: string) {
  const inserted = await client.query(
    `INSERT INTO station_votes(station_id,user_id) VALUES ($1,$2)
     ON CONFLICT (station_id,user_id) DO NOTHING RETURNING station_id`, [stationId,userId]);
  if (inserted.rowCount) await client.query('UPDATE stations SET votes=votes+1 WHERE id=$1', [stationId]);
  const total = await client.query<{votes:number}>('SELECT votes FROM stations WHERE id=$1', [stationId]);
  return { success: true as const, votes: total.rows[0].votes, hasVoted: true, alreadyVoted: !inserted.rowCount };
}

export async function voteForStation(stationId: string, userId: string) {
  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const canonical = await lockStationIdentity(stationId,client);
    if (!canonical) { await client.query('COMMIT'); return null; }
    const result = await recordStationVote(client,canonical,userId);
    await client.query('COMMIT');
    return result;
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function stationVoteState(stationId: string, userId?: string) {
  const pool = getPostgresPool();
  const canonical = await resolveStationId(stationId,pool);
  if (!canonical) return null;
  const result = await pool.query<{votes:number;hasVoted:boolean}>(
    `SELECT votes,EXISTS(SELECT 1 FROM station_votes v WHERE v.station_id=s.id AND v.user_id=$2) AS "hasVoted"
     FROM stations s WHERE s.id=$1`, [canonical,userId || null]);
  return result.rows[0] || null;
}
