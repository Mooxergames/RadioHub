import { navigate, useBrowserLocation, type BrowserLocationHook } from 'wouter/use-browser-location';

export const isPaymentLinkPath = (path: string) => /^\/pay\/?$/.test(path);
const initialDocumentUrl = typeof window === 'undefined' ? '' : window.location.href;

export function protectPaymentReferrer(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'referrer'; document.head.appendChild(meta); }
  meta.content = 'no-referrer';
}

export function isIsolatedPaymentDocument(): boolean {
  return window.location.href === initialDocumentUrl
    && isPaymentLinkPath(window.location.pathname)
    && document.querySelector('meta[name="megaradio-payment-shell"][content="isolated"]') !== null;
}

export function paymentDocumentUrlChanged(): boolean {
  return window.location.href !== initialDocumentUrl;
}

/** Never put a payment query into a document that already loaded measurement. */
export const navigateWithPaymentBoundary: typeof navigate = (to, options) => {
  const target = new URL(to, window.location.href);
  if (target.origin === window.location.origin && (isPaymentLinkPath(target.pathname) || isPaymentLinkPath(window.location.pathname))) {
    protectPaymentReferrer();
    if (options?.replace) window.location.replace(target.href);
    else window.location.assign(target.href);
    return;
  }
  navigate(to, options);
};

export const usePaymentSafeLocation: BrowserLocationHook = options => {
  const [path] = useBrowserLocation(options);
  return [path, navigateWithPaymentBoundary];
};
