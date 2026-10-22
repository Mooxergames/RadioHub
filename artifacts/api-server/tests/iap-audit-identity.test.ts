import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIapAuditIdentity, iapAuditEventId, iapAuditProvider } from '../src/data/iap-audit-identity';

test('native purchase audit IDs retain the public format and provider event identity', () => {
  for (const platform of ['ios', 'android', 'unknown']) {
    const identity = createIapAuditIdentity(platform);
    assert.match(identity.auditId, /^[a-f0-9]{24}$/);
    assert.equal(identity.providerEventId, `audit:${identity.auditId}`);
    assert.equal(identity.provider, platform === 'android' ? 'google' : 'apple');
    assert.equal(Object.hasOwn(identity, 'mongoId'), false);
  }
  assert.equal(iapAuditEventId('existing-public-id'), 'audit:existing-public-id');
  assert.equal(iapAuditProvider('android'), 'google');
});

test('independent purchase audit attempts use different identities', () => {
  const identities = Array.from({ length: 100 }, () => createIapAuditIdentity('ios').providerEventId);
  assert.equal(new Set(identities).size, identities.length);
});
