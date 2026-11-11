import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isAdFreeSubscription } from '../src/lib/premium';
import { usePremiumStatus } from '../src/hooks/usePremiumStatus';

const auth = vi.hoisted(() => ({ user: null as any, isLoading: false, error: null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
const oneTime = { plan: 'remove_ads', platform: 'paddle', paddleBillingKind: 'one_time', isActive: true, expiresAt: null, paddleSubscriptionId: null };
const now = Date.parse('2026-11-11T12:00:00Z');

beforeEach(() => { auth.user = null; localStorage.clear(); });
afterEach(cleanup);

it('accepts a verified one-time Remove Ads entitlement without upgrading it to Premium', () => {
  expect(isAdFreeSubscription(oneTime, now)).toBe(true);
  auth.user = { subscription: oneTime };
  const { result } = renderHook(usePremiumStatus);
  expect(result.current).toMatchObject({ isActive: true, isPremium: false, isLifetime: false, plan: 'remove_ads' });
  expect(localStorage.getItem('_mrt_is_premium')).toBeNull();
});

it.each([
  { platform: 'admin' }, { platform: 'stripe' }, { isActive: false }, { paddleBillingKind: undefined },
  { paddleBillingKind: 'recurring' }, { expiresAt: undefined }, { expiresAt: '' }, { expiresAt: 'bad-date' },
  { paddleSubscriptionId: 'sub_fixture' }, { plan: 'premium_monthly' }, { plan: 'premium_yearly' },
])('does not turn incomplete or conflicting metadata into indefinite access: %j', patch => {
  expect(isAdFreeSubscription({ ...oneTime, ...patch }, now)).toBe(false);
});

it('recurring ad-free access expires at the real provider period', () => {
  const recurring = { ...oneTime, paddleBillingKind: 'recurring', paddleSubscriptionId: 'sub_fixture', expiresAt: '2026-12-01T00:00:00Z' };
  expect(isAdFreeSubscription(recurring, now)).toBe(true);
  expect(isAdFreeSubscription({ ...recurring, expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe(false);
});

it('full Premium and its hint expire without affecting the one-time ad-free distinction', () => {
  auth.user = { subscription: { plan: 'premium_monthly', isActive: true, expiresAt: '2099-01-01T00:00:00Z' } };
  const { result, rerender } = renderHook(usePremiumStatus);
  expect(result.current.isPremium).toBe(true);
  expect(localStorage.getItem('_mrt_is_premium')).toBe('1');
  act(() => { auth.user = { subscription: oneTime }; }); rerender();
  expect(result.current.isActive).toBe(true);
  expect(result.current.isPremium).toBe(false);
  expect(localStorage.getItem('_mrt_is_premium')).toBeNull();
});
