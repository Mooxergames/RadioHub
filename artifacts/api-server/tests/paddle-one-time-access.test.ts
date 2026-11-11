import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { subscriptionAccess } from '@workspace/db-shared/subscription-access';
import { formatSubscriptionStatus } from '../src/routes/stripe-subscription-routes';
import { adminSubscriptionPatch } from '../src/utils/admin-subscription-patch';

const now = new Date('2026-11-11T12:00:00Z');
const purchased = {
  plan: 'remove_ads', platform: 'paddle', paddleBillingKind: 'one_time',
  isActive: true, expiresAt: null, paddleSubscriptionId: null,
} as const;
const denied: [string, Record<string, unknown>][] = [
  ['legacy row without a verified billing marker', { paddleBillingKind: undefined }],
  ['recurring billing marker', { paddleBillingKind: 'recurring' }],
  ['unknown billing marker', { paddleBillingKind: 'one-time' }],
  ['another platform', { platform: 'stripe' }],
  ['missing platform', { platform: undefined }],
  ['inactive or refunded purchase', { isActive: false }],
  ['missing active flag', { isActive: undefined }],
  ['monthly premium', { plan: 'premium_monthly' }],
  ['yearly premium', { plan: 'premium_yearly' }],
  ['unknown entitlement', { plan: 'arbitrary_admin' }],
  ['missing expiry is not explicit null', { expiresAt: undefined }],
  ['malformed expiry', { expiresAt: 'invalid' }],
  ['empty expiry', { expiresAt: '' }],
  ['expired finite period', { expiresAt: '2020-01-01T00:00:00Z' }],
  ['recurring subscription identity', { paddleSubscriptionId: 'sub_offline' }],
];

describe('verified one-time Paddle Remove Ads access', () => {
  it('permits the exact active one-time case without mutating billing history', () => {
    const input = { ...purchased };
    assert.deepEqual(subscriptionAccess(input, now.getTime()), { active: true, expired: false, status: 'active' });
    assert.deepEqual(input, purchased);
  });
  for (const [reason, patch] of denied) {
    it('denies indefinite access for ' + reason, () => {
      assert.equal(subscriptionAccess({ ...purchased, ...patch }, now.getTime()).active, false);
    });
  }
  it('keeps existing finite ad-free and premium-lifetime entitlements unchanged', () => {
    for (const platform of ['paddle', 'ios', 'android', 'admin']) {
      assert.equal(subscriptionAccess({
        plan: 'remove_ads', platform, isActive: true, expiresAt: '2099-01-01T00:00:00Z',
      }, now.getTime()).active, true);
    }
    assert.equal(subscriptionAccess({ plan: 'premium_lifetime', isActive: true, expiresAt: null }, now.getTime()).active, true);
  });
});

describe('Remove Ads is ad-free but never premium or renewable', () => {
  it('formats the verified one-time purchase without a provider identity, expiry or renewal promise', () => {
    assert.deepEqual(formatSubscriptionStatus({
      ...purchased, paddleCustomerId: 'ctm_private', transactionId: 'txn_private',
      productId: 'pri_private', renewsAt: '2099-01-01T00:00:00Z',
    }), { tier: 'free', status: 'active', adFree: true });
  });
  for (const [reason, patch] of denied.filter(([, p]) => !['premium_monthly', 'premium_yearly'].includes(String(p.plan)))) {
    it('status does not grant ad-free access to ' + reason, () => {
      assert.equal(formatSubscriptionStatus({ ...purchased, ...patch }).adFree, false);
    });
  }
  it('does not turn monthly or yearly plans without verified expiry into premium', () => {
    for (const plan of ['premium_monthly', 'premium_yearly']) {
      assert.deepEqual(formatSubscriptionStatus({ ...purchased, plan }), { tier: 'free', status: 'active', adFree: false });
    }
  });
});

describe('admin input cannot forge provider-verified indefinite Remove Ads', () => {
  it('rejects a forged marker with null expiry and never accepts caller-owned provider fields', () => {
    assert.ok(adminSubscriptionPatch({ ...purchased }, null, now).error);
    const result = adminSubscriptionPatch({
      ...purchased, expiresAt: '2099-01-01T00:00:00Z',
      paddleCustomerId: 'ctm_forged', transactionId: 'txn_forged',
    }, null, now);
    assert.equal(result.error, undefined);
    assert.equal(result.patch?.platform, 'admin');
    for (const key of ['paddleBillingKind', 'paddleCustomerId', 'paddleSubscriptionId', 'transactionId']) {
      assert.equal(Object.hasOwn(result.patch!, key), false, key);
    }
  });
  it('cannot reactivate a refunded purchase solely by retaining its one-time marker', () => {
    const result = adminSubscriptionPatch({ isActive: true }, { ...purchased, isActive: false }, now);
    assert.ok(result.error);
  });
});
