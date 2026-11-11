import { isIsolatedPaymentDocument } from './payment-link-navigation';

export type PaddleEvent = { name: string; data?: unknown };
export type PaddleOptions = {
  items?: Array<{ priceId: string; quantity: number }>;
  transactionId?: string;
  customData?: Record<string, unknown>;
  settings?: { successUrl?: string; displayMode?: string; locale?: string };
};
export interface PaddleSdk {
  Environment: { set: (env: 'sandbox' | 'production') => void };
  Initialize: (options: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
  Checkout: { open: (options: PaddleOptions) => void; close?: () => void };
}
declare global { interface Window { Paddle?: PaddleSdk } }

let scriptLoading: Promise<PaddleSdk> | undefined;
let initialized: { sdk: PaddleSdk; token: string; environment: string } | undefined;
let active: { owner: symbol; onEvent: (event: PaddleEvent) => void } | undefined;

export function loadPaddle(): Promise<PaddleSdk> {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise<PaddleSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    const timeout = window.setTimeout(() => fail(), 20_000);
    function fail() {
      window.clearTimeout(timeout);
      script.onload = script.onerror = null;
      script.remove();
      reject(new Error('Payment widget could not be loaded. Please try again.'));
    }
    script.onload = () => {
      if (!window.Paddle) return fail();
      window.clearTimeout(timeout);
      resolve(window.Paddle);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { scriptLoading = undefined; throw error; });
  return scriptLoading;
}

export function reserveCheckout(owner: symbol, onEvent: (event: PaddleEvent) => void): boolean {
  if (active) return false;
  active = { owner, onEvent };
  return true;
}

export function releaseCheckout(owner: symbol, close = false): void {
  if (active?.owner !== owner) return;
  active = undefined;
  if (close) window.Paddle?.Checkout.close?.();
}

async function initializePaddle(owner: symbol, token: string, environment: 'sandbox' | 'production', beforeInitialize?: () => boolean) {
  const sdk = await loadPaddle();
  if (active?.owner !== owner) return null;
  if (beforeInitialize && !beforeInitialize()) throw new Error('Please reopen this payment page.');
  const reused = initialized?.sdk === sdk;
  if (initialized?.sdk === sdk) {
    if (initialized.token !== token || initialized.environment !== environment) {
      throw new Error('Payment configuration changed. Please reload this page.');
    }
  } else {
    sdk.Environment.set(environment);
    sdk.Initialize({ token, eventCallback: event => active?.onEvent(event) });
    initialized = { sdk, token, environment };
  }
  return { sdk, reused };
}

export async function openPaddleCheckout(owner: symbol, token: string, environment: 'sandbox' | 'production', options: PaddleOptions): Promise<void> {
  const result = await initializePaddle(owner, token, environment);
  if (result && active?.owner === owner) result.sdk.Checkout.open(options);
}

let handledPaymentVisit: { key: symbol; sdk: PaddleSdk } | undefined;

export async function openPaddlePaymentLink(owner: symbol, token: string, environment: 'sandbox' | 'production', visit: symbol): Promise<void> {
  if (initialized && handledPaymentVisit?.key !== visit) throw new Error('Please reload this payment page.');
  const result = await initializePaddle(owner, token, environment, isIsolatedPaymentDocument);
  if (!result || handledPaymentVisit?.key === visit && handledPaymentVisit.sdk === result.sdk) return;
  if (active?.owner !== owner) return;
  // This isolated document owns one transaction. Initialize consumes _ptxn;
  // retries/new transactions require a new document, never a second open.
  handledPaymentVisit = { key: visit, sdk: result.sdk };
}
