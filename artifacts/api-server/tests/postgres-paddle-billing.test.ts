import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it, type TestContext } from 'node:test';
import pg from 'pg';
import express from 'express';
import { subscriptionAccess } from '@workspace/db-shared/subscription-access';

const connectionString = process.env.PG_TEST_DATABASE_URL;

describe('one-time Paddle Remove Ads PostgreSQL roundtrip and public projections', { skip: !connectionString }, async () => {
  if (!connectionString) return;
  const target = new URL(connectionString);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.equal(target.hostname, '127.0.0.1', 'only the explicit disposable local fixture is allowed');
  assert.ok(['5432', '55361'].includes(target.port || '5432'), 'only disposable local and CI fixture ports are allowed');
  assert.equal(target.pathname, '/radiohub_test');
  assert.equal(target.search, '', 'connection overrides are not allowed');
  assert.equal(target.hash, '');
  const schema = `paddle_once_${process.pid}_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Pool({ connectionString, ssl: false, max: 1, connectionTimeoutMillis: 1500, statement_timeout: 4500 });
  target.searchParams.set('options', `-c search_path=${schema},public`);
  process.env.DATABASE_URL = target.toString();
  process.env.POSTGRES_SSL = 'disable';
  process.env.POSTGRES_CONNECT_TIMEOUT_MS = '1500';
  process.env.POSTGRES_STATEMENT_TIMEOUT_MS = '4500';
  process.env.USER_STORE = 'postgres';
  process.env.BILLING_STORE = 'postgres';
  const { getPostgresPool, closePostgres } = await import('../src/postgres-runtime');
  const { pgGetSubscription, pgUpsertSubscription } = await import('../src/data/postgres-billing-store');
  const { pgFindUserById, pgListAdminUsers } = await import('../src/data/postgres-user-store');
  const { createAuthToken } = await import('../src/data/auth-token-store');
  const { processPaddleEvent, signedPaddleCustomData } = await import('../src/services/paddle-billing');
  const pool = getPostgresPool();
  const secret = 'offline-one-time-binding-secret';
  const onePrice = { id: 'pri_once_fixture', type: 'standard', status: 'active', billing_cycle: null };
  const monthlyPrice = { id: 'pri_recurring_fixture', type: 'standard', status: 'active', billing_cycle: { interval: 'month', frequency: 1 } };
  const options = { secret, getPriceId: async (plan: string) => plan === 'remove_ads' ? onePrice.id : null };
  const purchased = { plan: 'remove_ads', platform: 'paddle', paddleBillingKind: 'one_time', isActive: true, expiresAt: null, paddleSubscriptionId: null };
  let created = false, server: Server | undefined, base: string;
  before(async () => {
    assert.match(schema, /^paddle_once_\d+_[a-f0-9]{12}$/);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const migrations = path.resolve(import.meta.dirname, '../../../lib/db/migrations');
    for (const name of (await readdir(migrations)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      await pool.query(await readFile(path.join(migrations, name), 'utf8'));
    }
    const { registerUserAuthRoutes } = await import('../src/routes/user-auth-routes');
    const { registerMiscRoutes } = await import('../src/routes/misc-routes');
    const { registerStripeSubscriptionRoutes } = await import('../src/routes/stripe-subscription-routes');
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const userId = req.headers['x-fixture-user'];
      req.session = { user: { userId }, userId, save: (done: () => void) => done() };
      req.userId = userId;
      next();
    });
    const auth: express.RequestHandler = (req, res, next) => req.headers['x-fixture-user'] ? next() : void res.sendStatus(401);
    registerUserAuthRoutes(app, { requireAuth: auth, requireAdmin: auth, generateAuthToken: async () => 'unused-offline-token', passport: {} });
    registerMiscRoutes(app, { requireAuth: auth, requireAdmin: auth }, { apiOnly: true });
    registerStripeSubscriptionRoutes(app, { requireAuth: auth, requireAdmin: auth });
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server!.close(err => err ? reject(err) : resolve()));
    }
    await closePostgres();
    try {
      if (created) {
        assert.match(schema, /^paddle_once_\d+_[a-f0-9]{12}$/);
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally { await admin.end(); }
  });
  async function user(t: TestContext) {
    const id = 'paddle-once-' + randomUUID();
    await pool.query("INSERT INTO users(id,username,email,full_name,status) VALUES($1,$1,$2,'One-time fixture','active')", [id, id + '@example.invalid']);
    t.after(async () => {
      await pool.query('DELETE FROM payment_events WHERE user_id=$1', [id]);
      await pool.query('DELETE FROM users WHERE id=$1', [id]);
    });
    return id;
  }
  function transaction(userId: string, occurredAt = '2026-11-11T12:00:00Z') {
    return {
      event_id: 'evt_' + randomUUID(), event_type: 'transaction.completed', occurred_at: occurredAt,
      data: {
        id: 'txn_' + randomUUID(), customer_id: 'ctm_' + randomUUID(), subscription_id: null, status: 'completed', origin: 'web',
        items: [{ price: onePrice, quantity: 1 }], billing_period: null,
        custom_data: signedPaddleCustomData(secret, { userId, plan: 'remove_ads', priceId: onePrice.id }),
      },
    };
  }
  async function json(url: string, id: string, method = 'GET', body?: unknown): Promise<any> {
    const response = await fetch(base + url, {
      method, headers: { 'x-fixture-user': id, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200, url + ': ' + await response.clone().text());
    return response.json();
  }

  it('persists the accepted price marker in provider_data and returns it through both native readers', async t => {
    const id = await user(t);
    await pgUpsertSubscription(id, { auditFixture: 'preserve-unrelated-provider-data' });
    const input = transaction(id);
    assert.equal((await processPaddleEvent(input, options)).outcome, 'applied');
    const raw = (await pool.query('SELECT provider_data,paddle_subscription_id,expires_at FROM subscriptions WHERE user_id=$1', [id])).rows[0];
    assert.equal(raw.provider_data.paddleBillingKind, 'one_time');
    assert.equal(raw.provider_data.auditFixture, 'preserve-unrelated-provider-data');
    assert.equal(raw.paddle_subscription_id, null);
    assert.equal(raw.expires_at, null);
    const native = await pgGetSubscription(id);
    assert.equal(native?.paddleBillingKind, 'one_time');
    assert.equal(subscriptionAccess(native).active, true);
    assert.equal((await pgFindUserById(id))?.subscription?.paddleBillingKind, 'one_time');
  });

  it('auth/me exposes only safe access fields; generic and TV contracts remain ad-free, non-premium and non-renewing', async t => {
    const id = await user(t);
    await pgUpsertSubscription(id, {
      ...purchased, paddleCustomerId: 'ctm_private', transactionId: 'txn_private', productId: 'pri_private',
      originalTransactionId: 'original_private', purchaseToken: 'purchase_private', receipt: 'receipt_private',
      renewsAt: new Date('2099-01-01'), providerSecret: 'secret_private',
    });
    const me = await json('/api/auth/me', id);
    assert.equal(me.authenticated, true);
    assert.deepEqual(me.user.subscription, {
      plan: 'remove_ads', platform: 'paddle', isActive: true, expiresAt: null, paddleBillingKind: 'one_time',
    });
    const safe = JSON.stringify(me);
    assert.doesNotMatch(safe, /ctm_private|txn_private|pri_private|original_private|purchase_private|receipt_private|secret_private/);
    assert.deepEqual(await json('/api/subscription/status', id), { tier: 'free', status: 'active', adFree: true });
    const tv = await json('/api/user/subscription', id);
    assert.equal(tv.plan, 'remove_ads');
    assert.equal(tv.isActive, true);
    assert.equal(tv.expiryDate, null);
    assert.deepEqual(tv.features, ['remove_ads']);
    assert.equal(Object.hasOwn(tv, 'renewsAt'), false);
  });

  it('OAuth token-session seeds the same safe subscription projection as auth/me without exposing tokens or provider history', async t => {
    const id = await user(t);
    await pgUpsertSubscription(id, {
      ...purchased, paddleCustomerId: 'ctm_oauth_private', transactionId: 'txn_oauth_private',
      productId: 'pri_oauth_private', originalTransactionId: 'original_oauth_private',
      purchaseToken: 'purchase_oauth_private', receipt: 'receipt_oauth_private', providerSecret: 'secret_oauth_private',
    });
    const token = await createAuthToken(id, 'web');
    const response = await fetch(base + '/api/auth/token-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.authenticated, true);
    const expected = { plan: 'remove_ads', platform: 'paddle', isActive: true, expiresAt: null, paddleBillingKind: 'one_time' };
    assert.deepEqual(body.user.subscription, expected);
    assert.deepEqual(body.user.subscription, (await json('/api/auth/me', id)).user.subscription);
    const publicJson = JSON.stringify(body);
    assert.equal(publicJson.includes(token), false);
    assert.doesNotMatch(publicJson, /ctm_oauth_private|txn_oauth_private|pri_oauth_private|original_oauth_private|purchase_oauth_private|receipt_oauth_private|secret_oauth_private/);
    await pgUpsertSubscription(id, { isActive: false, subscriptionStatus: 'canceled' });
    const revoked = await json('/api/auth/token-session', id, 'POST', { token });
    assert.equal(revoked.user.subscription.isActive, false);
    assert.deepEqual(revoked.user.subscription, (await json('/api/auth/me', id)).user.subscription);
    assert.equal(JSON.stringify(revoked).includes(token), false);
  });

  it('a refund remains revoked across read projections, replay and stale one-time delivery', async t => {
    const id = await user(t);
    const initial = transaction(id);
    await processPaddleEvent(initial, options);
    const refund = {
      event_id: 'evt_' + randomUUID(), event_type: 'adjustment.updated', occurred_at: '2026-11-11T12:00:02Z',
      data: { id: 'adj_' + randomUUID(), customer_id: initial.data.customer_id, transaction_id: initial.data.id,
        action: 'refund', type: 'full', status: 'approved' },
    };
    assert.equal((await processPaddleEvent(refund, options)).outcome, 'applied');
    assert.equal((await processPaddleEvent(initial, options)).outcome, 'duplicate');
    // A distinct same-time receipt may be applied with its access held revoked.
    assert.ok(['applied', 'stale'].includes((await processPaddleEvent({ ...initial, event_id: 'evt_' + randomUUID() }, options)).outcome));
    assert.equal((await pgGetSubscription(id))?.isActive, false);
    assert.equal((await processPaddleEvent({
      ...initial, event_id: 'evt_' + randomUUID(), occurred_at: '2026-11-11T11:59:59Z',
    }, options)).outcome, 'stale');
    const sub = await pgGetSubscription(id);
    assert.equal(sub?.isActive, false);
    assert.equal(sub?.paddleBillingKind, 'one_time');
    assert.equal(subscriptionAccess(sub).active, false);
    assert.equal((await json('/api/auth/me', id)).user.subscription.isActive, false);
    assert.equal((await json('/api/subscription/status', id)).adFree, false);
    assert.equal((await json('/api/user/subscription', id)).isActive, false);
  });

  it('corrects one-time provider history to recurring and never treats the correction as indefinite', async t => {
    const id = await user(t);
    const initial = transaction(id);
    await processPaddleEvent(initial, options);
    const recurringPrice = { ...monthlyPrice, id: onePrice.id };
    const correction = {
      ...initial, event_id: 'evt_' + randomUUID(), occurred_at: '2026-11-11T12:00:03Z',
      data: { ...initial.data, id: 'txn_' + randomUUID(), subscription_id: 'sub_' + randomUUID(),
        items: [{ price: recurringPrice, quantity: 1 }], billing_period: null },
    };
    assert.equal((await processPaddleEvent(correction, options)).outcome, 'applied');
    const sub = await pgGetSubscription(id);
    assert.equal(sub?.paddleBillingKind, 'recurring');
    assert.equal(sub?.paddleSubscriptionId, correction.data.subscription_id);
    assert.equal(sub?.isActive, false);
    assert.equal(subscriptionAccess(sub).active, false);
    assert.equal((await pool.query("SELECT provider_data->>'paddleBillingKind' kind FROM subscriptions WHERE user_id=$1", [id])).rows[0].kind, 'recurring');
  });

  it('admin SQL remove_ads, none and premium filters match the same native access decisions', async t => {
    const fixtures = [
      purchased,
      { ...purchased, paddleBillingKind: null },
      { ...purchased, platform: 'stripe' },
      { ...purchased, paddleBillingKind: 'recurring' },
      { ...purchased, paddleSubscriptionId: 'sub_recurring' },
      { ...purchased, isActive: false },
      { ...purchased, plan: 'premium_monthly' },
      { ...purchased, plan: 'premium_yearly' },
      { ...purchased, expiresAt: new Date('2020-01-01') },
      { ...purchased, expiresAt: new Date('2099-01-01'), paddleBillingKind: 'recurring', paddleSubscriptionId: 'sub_paid' },
      { plan: 'premium_lifetime', platform: 'ios', isActive: true, expiresAt: null },
    ];
    const expected = new Map<string, Record<string, any>>();
    for (const fixture of fixtures) {
      const id = await user(t);
      await pgUpsertSubscription(id, fixture);
      const sub = (await pgGetSubscription(id))!;
      expected.set(id, sub);
      const active = subscriptionAccess(sub).active;
      assert.equal((await json('/api/auth/me', id)).user.subscription.isActive, active);
      const status = await json('/api/subscription/status', id);
      assert.equal(status.adFree, active);
      assert.equal(status.tier, active && sub.plan.startsWith('premium_') ? 'premium' : 'free');
      if (sub.plan === 'remove_ads') assert.equal(Object.hasOwn(status, 'renewsAt'), false);
      const tv = await json('/api/user/subscription', id);
      assert.equal(tv.isActive, active);
      assert.equal(tv.plan, active ? sub.plan : 'none');
    }
    for (const plan of ['remove_ads', 'none', 'any_premium']) {
      const result = await pgListAdminUsers({ plan, page: 1, limit: 100 });
      const want = [...expected].filter(([, sub]) => {
        const active = subscriptionAccess(sub).active;
        return plan === 'none' ? !active : active && (plan === 'remove_ads' ? sub.plan === plan : sub.plan.startsWith('premium_'));
      }).map(([id]) => id).sort();
      assert.deepEqual(result.users.map(row => row._id).sort(), want, plan);
      assert.equal(result.total, want.length, plan);
    }
  });

  it('admin HTTP input cannot manufacture an indefinite provider purchase or overwrite its marker', async t => {
    const id = await user(t);
    await pgUpsertSubscription(id, { plan: 'none', isActive: false });
    const body = { ...purchased, paddleCustomerId: 'ctm_forged', transactionId: 'txn_forged' };
    const denied = await fetch(base + '/api/admin/users/' + id + '/subscription', {
      method: 'PATCH', headers: { 'x-fixture-user': id, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(denied.status, 400);
    assert.equal((await pgGetSubscription(id))?.isActive, false);
    await json('/api/admin/users/' + id + '/subscription', id, 'PATCH', { ...body, expiresAt: '2099-01-01T00:00:00Z' });
    const saved = await pgGetSubscription(id);
    assert.equal(saved?.platform, 'admin');
    assert.equal(saved?.paddleBillingKind, undefined);
    assert.equal(saved?.paddleCustomerId, null);
    assert.equal(saved?.transactionId, null);
  });
});
