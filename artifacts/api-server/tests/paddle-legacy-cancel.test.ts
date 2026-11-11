import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, it, mock } from 'node:test';
import express, { type RequestHandler } from 'express';

const userId = 'cancel-fixture';
const findUser = mock.fn(async (_id: string) => ({ _id: userId }));
let subscription: {
  platform: string; plan: string; isActive: boolean;
  paddleCustomerId?: string; paddleSubscriptionId?: string;
  stripeCustomerId?: string; stripeSubscriptionId?: string;
};
const readSubscription = mock.fn(async (_id: string) => subscription);
const writeSubscription = mock.fn(async (_id: string, _patch: Record<string, unknown>) => {});
mock.module('../src/data/postgres-user-store', { namedExports: {
  pgFindUserById: findUser, pgDeleteUser: mock.fn(), pgListAdminUsers: mock.fn(),
  pgUpdateUser: mock.fn(), pgUserFavoriteCount: mock.fn(),
} });
mock.module('../src/data/postgres-billing-store', { namedExports: {
  pgGetSubscription: readSubscription, pgUpsertSubscription: writeSubscription,
  pgFindSubscriptionUser: mock.fn(),
} });

let server: Server;
let url: string;
before(async () => {
  const { registerMiscRoutes } = await import('../src/routes/misc-routes');
  const app = express();
  const requireAuth: RequestHandler = (req, res, next) => {
    if (req.get('x-fixture-user') !== userId) {
      res.status(401).json({ error: 'fixture_auth_required' });
      return;
    }
    Object.assign(req, { session: { user: { userId } } });
    next();
  };
  registerMiscRoutes(app, { requireAuth, requireAdmin: requireAuth }, { apiOnly: true });
  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/user/subscription/cancel`;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});
beforeEach(() => {
  for (const fn of [findUser, readSubscription, writeSubscription]) fn.mock.resetCalls();
});

function cancel(authenticated = true) {
  return fetch(url, { method: 'POST', headers: authenticated ? { 'x-fixture-user': userId } : {} });
}

it('requires authentication before reading or changing billing state', async () => {
  const res = await cancel(false);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'fixture_auth_required' });
  for (const fn of [findUser, readSubscription, writeSubscription]) assert.equal(fn.mock.callCount(), 0);
});

for (const [platform, name] of [['paddle', 'Paddle'], ['stripe', 'Stripe']] as const) {
  for (const [plan, linkedIds] of [
    ['premium_monthly', { [platform + 'CustomerId']: 'fixture-customer', [platform + 'SubscriptionId']: 'fixture-recurring' }],
    ['premium_lifetime', { [platform + 'CustomerId']: 'fixture-customer' }],
    ['premium_yearly', {}],
  ] as const) {
    it(`directs ${name} ${plan} to the authenticated portal without cancelling locally`, async () => {
      subscription = Object.freeze({ platform, plan, isActive: true, ...linkedIds });
      const res = await cancel();
      assert.equal(res.status, 409);
      assert.deepEqual(await res.json(), {
        error: `Manage this purchase in the ${name} customer portal. No changes were made.`,
        code: 'manage_in_portal', actionRequired: 'open_billing_portal', platform,
        portalEndpoint: '/api/subscription/portal', portalMethod: 'POST',
      });
      assert.deepEqual(readSubscription.mock.calls[0].arguments, [userId]);
      assert.equal(writeSubscription.mock.callCount(), 0);
    });
  }
}

for (const platform of ['ios', 'macos', 'tvos', 'android']) {
  it(`retains the existing ${platform} store-management contract`, async () => {
    subscription = { platform, plan: 'premium_monthly', isActive: true };
    const res = await cancel();
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'manage_in_store');
    assert.equal(body.actionRequired, 'open_store_subscriptions');
    assert.equal(body.platform, platform);
    assert.equal(body.manageUrl, platform === 'android'
      ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions');
    assert.equal(writeSubscription.mock.callCount(), 0);
  });
}

for (const [platform, plan] of [['admin', 'premium_monthly'], ['ios', 'premium_lifetime']]) {
  it(`preserves legacy local cancellation for ${platform} ${plan}`, async () => {
    subscription = { platform, plan, isActive: true };
    const res = await cancel();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true, plan: 'none', isActive: false, features: [] });
    assert.equal(writeSubscription.mock.callCount(), 1);
    const [owner, patch] = writeSubscription.mock.calls[0].arguments;
    assert.equal(owner, userId);
    assert.ok(patch.cancelledAt instanceof Date);
    assert.deepEqual(patch, { plan: 'none', isActive: false, cancelledAt: patch.cancelledAt });
  });
}
