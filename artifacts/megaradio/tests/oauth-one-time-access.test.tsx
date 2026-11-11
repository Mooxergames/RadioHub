import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '../src/lib/queryClient';
import { initOAuthTokenExchange } from '../src/lib/oauth-token-exchange';
import { usePremiumStatus } from '../src/hooks/usePremiumStatus';

afterEach(() => {
  cleanup(); queryClient.clear(); vi.unstubAllGlobals();
  delete window.__oauthExchangeStarted; sessionStorage.clear(); localStorage.clear();
});

it('hydrates verified one-time ad-free access directly after OAuth without a /me refetch or page reload', async () => {
  queryClient.clear();
  window.history.replaceState({}, '', '/en?auth_token=local-oauth-fixture#saved');
  const user = { _id: 'paid-listener', subscription: {
    plan: 'remove_ads', platform: 'paddle', paddleBillingKind: 'one_time', isActive: true, expiresAt: null,
  } };
  const network = vi.fn(async (url: RequestInfo | URL) => {
    expect(url).toBe('/api/auth/token-session');
    return Response.json({ user });
  });
  vi.stubGlobal('fetch', network);
  initOAuthTokenExchange();
  const { result } = renderHook(usePremiumStatus, {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
  await waitFor(() => expect(result.current.isActive).toBe(true));
  expect(result.current.isPremium).toBe(false);
  expect(result.current.isLoading).toBe(false);
  expect(network).toHaveBeenCalledOnce();
  expect(queryClient.getQueryData(['/api/auth/me'])).toEqual({ user, authenticated: true });
  expect(window.location.search).toBe('');
  expect(window.location.hash).toBe('#saved');
});
