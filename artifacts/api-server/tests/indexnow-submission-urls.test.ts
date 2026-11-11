import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { indexNowSubmissionUrls } from '@workspace/db/schema';
import { INDEXNOW_SUBMISSION_URLS_RETENTION_DAYS } from '../src/data/postgres-seo-indexing-store';

test('IndexNow URL audit uses the native PostgreSQL fields and log identity', () => {
  const config = getTableConfig(indexNowSubmissionUrls);
  assert.equal(config.name, 'indexnow_submission_urls');
  const fields = new Map(config.columns.map(column => [column.name, column]));
  for (const name of ['log_id', 'timestamp', 'host', 'trigger', 'urls', 'url_count', 'expires_at']) {
    assert.ok(fields.get(name)?.notNull, name);
  }
  assert.equal(fields.get('log_id')?.isUnique, true);
  assert.equal(fields.get('log_id')?.dataType, 'string');
  assert.equal(fields.get('urls')?.dataType, 'array');
  assert.equal(config.foreignKeys.length, 1);
  assert.equal(config.foreignKeys[0].onDelete, 'cascade');
});

test('IndexNow URL expiry is indexed and its retention window is bounded', () => {
  const config = getTableConfig(indexNowSubmissionUrls);
  const expiry = config.indexes.find(index => index.config.name === 'indexnow_submission_urls_expiry');
  assert.ok(expiry);
  assert.equal((expiry.config.columns[0] as { name: string }).name, 'expires_at');
  assert.ok(INDEXNOW_SUBMISSION_URLS_RETENTION_DAYS >= 7);
  assert.ok(INDEXNOW_SUBMISSION_URLS_RETENTION_DAYS <= 90);
});
