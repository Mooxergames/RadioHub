import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PaddleEvent, PaddleSdk } from '../src/lib/paddle-checkout';

const txn = 'txn_01h2b0qpjc0xt8k5aw6nsdec4p';
const otherTxn = 'txn_01h2b0qpjc0xt8k5aw6nsdec4q';
const pay = '/pay?_ptxn=' + txn;
const doubleEncoded = '?_ptxn=txn%255F' + txn.slice(4);
const config = { clientToken: 'test_fixture', environment: 'sandbox' } as const;
const fetchMock = vi.fn<typeof fetch>();
let event: (value: PaddleEvent) => void;

function makeSdk() {
  return {
    Environment: { set: vi.fn() },
    Initialize: vi.fn<PaddleSdk['Initialize']>(options => { event = options.eventCallback; }),
    Checkout: { open: vi.fn(), close: vi.fn() },
  };
}
let sdk: ReturnType<typeof makeSdk>;
let shellMarker: HTMLMetaElement;

beforeEach(() => {
  vi.resetModules();
  window.history.replaceState({}, '', pay);
  shellMarker = markShell();
  sdk = makeSdk();
  window.Paddle = sdk;
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset().mockImplementation(async () => Response.json(config));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.Paddle;
  delete window.FlowAlive;
  document.head.querySelectorAll('meta[name="megaradio-payment-shell"],meta[name="referrer"]').forEach(el => el.remove());
});

function markShell() {
  const meta = document.createElement('meta');
  meta.name = 'megaradio-payment-shell';
  meta.content = 'isolated';
  document.head.appendChild(meta);
  return meta;
}
function stubDocumentNavigation() {
  const { href, origin, pathname } = window.location;
  const location = { href, origin, pathname, assign: vi.fn(), replace: vi.fn() };
  const facade = Object.create(window);
  Object.defineProperty(facade, 'location', { value: location });
  vi.stubGlobal('window', facade);
  return location;
}
async function openPage() {
  const { default: Page } = await import('../src/pages/payment-link');
  const view = render(<Page />);
  await view.findByText('Payment window is open.');
  return view;
}

it.each([
  ['/en', pay, false], ['/en', pay, true], [pay, '/en/premium', false], [pay, '/en', true],
] as const)('%s -> %s (replace=%s) uses a fresh document, never SPA history', async (from, to, replace) => {
  if (from === '/en') shellMarker.remove();
  window.history.replaceState({}, '', from);
  const { navigateWithPaymentBoundary } = await import('../src/lib/payment-link-navigation');
  const push = vi.spyOn(window.history, 'pushState'), swap = vi.spyOn(window.history, 'replaceState');
  const location = stubDocumentNavigation();
  navigateWithPaymentBoundary(to, { replace });
  expect(replace ? location.replace : location.assign).toHaveBeenCalledWith(new URL(to, location.origin).href);
  expect(replace ? location.assign : location.replace).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  expect(swap).not.toHaveBeenCalled();
  expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
});

it('ordinary same-origin routes retain SPA push and replace', async () => {
  shellMarker.remove();
  window.history.replaceState({}, '', '/en');
  const { navigateWithPaymentBoundary } = await import('../src/lib/payment-link-navigation');
  const push = vi.spyOn(window.history, 'pushState'), swap = vi.spyOn(window.history, 'replaceState');
  navigateWithPaymentBoundary('/en/premium');
  expect(push).toHaveBeenCalledOnce();
  expect(window.location.pathname).toBe('/en/premium');
  navigateWithPaymentBoundary('/en', { replace: true });
  expect(swap).toHaveBeenCalledOnce();
  expect(window.location.pathname).toBe('/en');
});

it('raw history entry cannot mount a payment session in an already public document', async () => {
  shellMarker.remove();
  window.history.replaceState({}, '', '/en');
  const { PaymentLinkDocument } = await import('../src/components/PaymentLinkDocument');
  window.history.pushState({}, '', pay);
  const location = stubDocumentNavigation();
  const view = render(<PaymentLinkDocument />);
  expect(view.getByRole('link', { name: 'Open secure payment page' })).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(location.replace).toHaveBeenCalledWith(location.href);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(sdk.Initialize).not.toHaveBeenCalled();
});

it('a direct /pay document without the server shell marker does not initialize or loop', async () => {
  shellMarker.remove();
  const { PaymentLinkDocument } = await import('../src/components/PaymentLinkDocument');
  const location = stubDocumentNavigation();
  const view = render(<PaymentLinkDocument />);
  expect(view.getByRole('link', { name: 'Open secure payment page' })).toBeVisible();
  expect(location.replace).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(sdk.Initialize).not.toHaveBeenCalled();
});

it('direct shell requests same-origin config without credentials, referrer, transaction or API-base rewrite', async () => {
  const downstream = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(config));
  fetchMock.mockImplementation((input, init) => {
    // Mirror the relevant main.tsx wrapper: strings/Requests can change origin and acquire cookies.
    const rewrite = typeof input === 'string' && input.startsWith('/api')
      || input instanceof Request && input.url.startsWith(window.location.origin + '/api');
    return rewrite ? downstream('https://api.example.invalid', { ...init, credentials: 'include' }) : downstream(input, init);
  });
  const { PaymentLinkDocument } = await import('../src/components/PaymentLinkDocument');
  const view = render(<PaymentLinkDocument />);
  await view.findByText('Payment window is open.');
  expect(downstream).toHaveBeenCalledOnce();
  const [target, init] = downstream.mock.calls[0];
  expect(target).toBeInstanceOf(URL);
  expect(String(target)).toBe(window.location.origin + '/api/subscription/paddle/client-config');
  expect(init).toEqual({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  expect(sdk.Initialize).toHaveBeenCalledOnce();
  expect(sdk.Initialize).toHaveBeenCalledWith({ token: config.clientToken, eventCallback: expect.any(Function) });
  expect(sdk.Environment.set).toHaveBeenCalledWith('sandbox');
  expect(sdk.Checkout.open).not.toHaveBeenCalled();
  expect(view.container.textContent).not.toContain(txn);
});

it('StrictMode replay and an actual same-URL remount share one pending request, initialization and lease', async () => {
  let resolve!: (value: Response) => void;
  fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { default: Page } = await import('../src/pages/payment-link');
  const { reserveCheckout } = await import('../src/lib/paddle-checkout');
  const mount = () => render(<React.StrictMode><Page /></React.StrictMode>);
  const first = mount(); first.unmount();
  expect(reserveCheckout(Symbol(), vi.fn())).toBe(false);
  const second = mount();
  await act(async () => resolve(Response.json(config)));
  await second.findByText('Payment window is open.');
  second.unmount();
  const third = mount(); await third.findByText('Payment window is open.');
  expect(reserveCheckout(Symbol(), vi.fn())).toBe(false);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(sdk.Initialize).toHaveBeenCalledOnce();
  expect(sdk.Checkout.open).not.toHaveBeenCalled();
  expect(sdk.Checkout.close).not.toHaveBeenCalled();
});

it.each(['checkout.completed', 'checkout.error', 'checkout.closed'])('uncorrelated %s cannot change status, close or release the lease', async name => {
  const view = await openPage();
  const { reserveCheckout } = await import('../src/lib/paddle-checkout');
  act(() => event({ name: 'checkout.loaded', data: { transaction_id: txn, id: 'che_fixture' } }));
  for (const data of [undefined, {}, { id: 'che_unrelated' }, { transaction_id: otherTxn, id: 'che_fixture' }]) {
    act(() => event({ name, data }));
    expect(view.getByRole('status')).toHaveTextContent('Payment window is open.');
    expect(reserveCheckout(Symbol(), vi.fn())).toBe(false);
    expect(sdk.Checkout.close).not.toHaveBeenCalled();
  }
});

it('a terminal event without a transaction cannot report completion from a remembered checkout ID alone', async () => {
  const view = await openPage();
  act(() => event({ name: 'checkout.loaded', data: { transaction_id: txn, id: 'che_fixture' } }));
  act(() => event({ name: 'checkout.completed', data: { id: 'che_fixture' } }));
  expect(view.getByRole('status')).toHaveTextContent('Payment window is open.');
});

it('pins the first checkout ID for a transaction and ignores status events from a second checkout', async () => {
  const view = await openPage();
  const first = { transaction_id: txn, id: 'che_first' };
  const second = { transaction_id: txn, id: 'che_second' };
  act(() => event({ name: 'checkout.loaded', data: first }));
  for (const name of ['checkout.loaded', 'checkout.closed', 'checkout.error', 'checkout.completed']) {
    act(() => event({ name, data: second }));
    expect(view.getByRole('status')).toHaveTextContent('Payment window is open.');
  }
  act(() => event({ name: 'checkout.completed', data: first }));
  expect(view.getByRole('status')).toHaveTextContent('Your payment details were submitted.');
  expect(sdk.Checkout.close).not.toHaveBeenCalled();
});

it('matching completion reports submission only; a later close cannot grant entitlement or undo submission', async () => {
  const view = await openPage();
  const { reserveCheckout } = await import('../src/lib/paddle-checkout');
  act(() => event({ name: 'checkout.completed', data: { transaction_id: txn } }));
  act(() => event({ name: 'checkout.closed', data: { transaction_id: txn } }));
  expect(view.getByRole('status')).toHaveTextContent('Your payment details were submitted.');
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(reserveCheckout(Symbol(), vi.fn())).toBe(false);
  expect(sdk.Checkout.close).not.toHaveBeenCalled();
});

it('a previously initialized normal checkout cannot be reused for a payment link', async () => {
  const { reserveCheckout, releaseCheckout, openPaddleCheckout, openPaddlePaymentLink } = await import('../src/lib/paddle-checkout');
  const previous = Symbol(), next = Symbol();
  expect(reserveCheckout(previous, vi.fn())).toBe(true);
  await openPaddleCheckout(previous, config.clientToken, 'sandbox', { items: [{ priceId: 'pri_fixture', quantity: 1 }] });
  releaseCheckout(previous);
  expect(reserveCheckout(next, vi.fn())).toBe(true);
  await expect(openPaddlePaymentLink(next, config.clientToken, 'sandbox', next)).rejects.toThrow(/reload/i);
  expect(sdk.Initialize).toHaveBeenCalledOnce();
  expect(sdk.Checkout.open).toHaveBeenCalledOnce();
  expect(sdk.Checkout.open).toHaveBeenCalledWith({ items: [{ priceId: 'pri_fixture', quantity: 1 }] });
  expect(sdk.Checkout.close).not.toHaveBeenCalled();
});

it('after awaiting the SDK, a stale owner cannot initialize or close the next owner', async () => {
  const { reserveCheckout, releaseCheckout, openPaddlePaymentLink } = await import('../src/lib/paddle-checkout');
  delete window.Paddle;
  const append = vi.spyOn(document.head, 'appendChild').mockImplementation(node => node);
  const old = Symbol(), current = Symbol();
  expect(reserveCheckout(old, vi.fn())).toBe(true);
  const pending = openPaddlePaymentLink(old, config.clientToken, 'sandbox', old);
  const script = append.mock.calls[0][0] as HTMLScriptElement;
  expect(script.referrerPolicy).toBe('no-referrer');
  releaseCheckout(old);
  expect(reserveCheckout(current, vi.fn())).toBe(true);
  window.Paddle = sdk;
  script.dispatchEvent(new Event('load'));
  await pending;
  releaseCheckout(old, true);
  expect(sdk.Initialize).not.toHaveBeenCalled();
  expect(sdk.Checkout.open).not.toHaveBeenCalled();
  expect(sdk.Checkout.close).not.toHaveBeenCalled();
  expect(reserveCheckout(Symbol(), vi.fn())).toBe(false);
});

it.each(['transaction URL changes', 'shell marker disappears'])(
  'does not initialize if the %s while the SDK is loading', async change => {
    const { reserveCheckout, openPaddlePaymentLink } = await import('../src/lib/paddle-checkout');
    const { isIsolatedPaymentDocument } = await import('../src/lib/payment-link-navigation');
    expect(isIsolatedPaymentDocument()).toBe(true);
    delete window.Paddle;
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation(node => node);
    const owner = Symbol();
    expect(reserveCheckout(owner, vi.fn())).toBe(true);
    const pending = openPaddlePaymentLink(owner, config.clientToken, 'sandbox', owner);
    const script = append.mock.calls[0][0] as HTMLScriptElement;
    if (change === 'transaction URL changes') window.history.pushState({}, '', '/pay?_ptxn=' + otherTxn);
    else shellMarker.remove();
    window.Paddle = sdk;
    script.dispatchEvent(new Event('load'));
    await expect(pending).rejects.toThrow(/reopen/i);
    expect(sdk.Environment.set).not.toHaveBeenCalled();
    expect(sdk.Initialize).not.toHaveBeenCalled();
    expect(sdk.Checkout.open).not.toHaveBeenCalled();
    expect(sdk.Checkout.close).not.toHaveBeenCalled();
  },
);

it('normal checkout rechecks the owner after initialization, immediately before opening', async () => {
  const { reserveCheckout, releaseCheckout, openPaddleCheckout } = await import('../src/lib/paddle-checkout');
  const old = Symbol(), next = Symbol();
  let claimed = false;
  expect(reserveCheckout(old, vi.fn())).toBe(true);
  // Transfer ownership before openPaddleCheckout resumes from await initializePaddle().
  sdk.Initialize.mockImplementationOnce(() => queueMicrotask(() => {
    releaseCheckout(old);
    claimed = reserveCheckout(next, vi.fn());
  }));
  await openPaddleCheckout(old, config.clientToken, 'sandbox', { items: [{ priceId: 'pri_old', quantity: 1 }] });
  expect(claimed).toBe(true);
  expect(sdk.Checkout.open).not.toHaveBeenCalled();
  releaseCheckout(old, true);
  expect(sdk.Checkout.close).not.toHaveBeenCalled();
  const nextOptions = { items: [{ priceId: 'pri_current', quantity: 1 }] };
  await openPaddleCheckout(next, config.clientToken, 'sandbox', nextOptions);
  expect(sdk.Checkout.open).toHaveBeenCalledOnce();
  expect(sdk.Checkout.open).toHaveBeenCalledWith(nextOptions);
  expect(sdk.Initialize).toHaveBeenCalledOnce();
});

it.each(['', '?_ptxn=', '?_ptxn=txn_bad', '?transactionId=' + txn, '?_ptxn=' + txn + '&_ptxn=' + txn, doubleEncoded])(
  'invalid raw link %j never requests config or loads the SDK', async search => {
    window.history.replaceState({}, '', '/pay' + search);
    const { paymentLinkTransaction } = await import('../src/lib/payment-link');
    expect(paymentLinkTransaction(window.location.search)).toBeNull();
    const { default: Page } = await import('../src/pages/payment-link');
    const view = render(<Page />);
    expect(view.getByRole('status')).toHaveTextContent('This payment link is unavailable.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdk.Initialize).not.toHaveBeenCalled();
    expect(sdk.Checkout.open).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="cdn.paddle.com"]')).toBeNull();
  },
);

it('rejects an unavailable or wrong-mode configuration before Paddle initialization', async () => {
  const { validPaymentLinkConfig } = await import('../src/lib/payment-link');
  expect(validPaymentLinkConfig(config)).toBe(true);
  expect(validPaymentLinkConfig({ clientToken: 'live_fixture', environment: 'production' })).toBe(true);
  for (const input of [null, {}, { ...config, environment: 'test' }, { ...config, clientToken: 'live_fixture' }]) {
    expect(validPaymentLinkConfig(input)).toBe(false);
  }
  fetchMock.mockResolvedValue(Response.json({}, { status: 503 }));
  const { default: Page } = await import('../src/pages/payment-link');
  const view = render(<Page />);
  await view.findByRole('button', { name: 'Try again' });
  expect(sdk.Initialize).not.toHaveBeenCalled();
  expect(sdk.Checkout.open).not.toHaveBeenCalled();
});

it('measurement paths never publish the payment reference', async () => {
  const { faTrackPageView } = await import('../src/lib/flowalive');
  const { publicMeasurementUrl } = await import('../src/lib/google-tag-manager');
  const { sanitizeVisitorPagePath } = await import('@workspace/seo-shared/visitor-activity');
  const trackPageView = vi.fn();
  window.FlowAlive = {
    trackPageView, trackEvent: vi.fn(), identify: vi.fn(), startSession: vi.fn(), endSession: vi.fn(),
    setUserProperties: vi.fn(), trackError: vi.fn(), reset: vi.fn(),
  };
  faTrackPageView(pay);
  expect(trackPageView).not.toHaveBeenCalled();
  expect(publicMeasurementUrl(window.location.href, window.location.origin)).toBeNull();
  expect(sanitizeVisitorPagePath(pay)).toBeNull();
});
