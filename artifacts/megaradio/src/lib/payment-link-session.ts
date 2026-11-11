import { openPaddlePaymentLink, reserveCheckout, type PaddleEvent } from './paddle-checkout';
import { validPaymentLinkConfig } from './payment-link';

export type PaymentLinkStatus = 'loading' | 'open' | 'submitted' | 'closed' | 'error' | 'busy';
interface Session {
  transactionId: string; owner: symbol; status: PaymentLinkStatus; checkoutId?: string;
  listeners: Set<(status: PaymentLinkStatus) => void>;
}
let session: Session | undefined;

function publish(value: Session, status: PaymentLinkStatus) {
  value.status = status;
  value.listeners.forEach(listener => listener(status));
}

function receive(value: Session, event: PaddleEvent) {
  const data = event.data as { transaction_id?: string; id?: string } | undefined;
  if (data?.transaction_id !== value.transactionId) return;
  if (data.id?.startsWith('che_')) {
    if (value.checkoutId && value.checkoutId !== data.id) return;
    value.checkoutId ??= data.id;
  }
  if (event.name === 'checkout.completed') publish(value, 'submitted');
  if (event.name === 'checkout.closed' && value.status !== 'submitted') publish(value, 'closed');
  if (event.name === 'checkout.error' && value.status !== 'submitted') publish(value, 'error');
}

/** The widget and lease belong to the document, not React's mount lifecycle. */
export function subscribePaymentLink(transactionId: string, listener: (status: PaymentLinkStatus) => void): () => void {
  if (session && session.transactionId !== transactionId) { listener('error'); return () => {}; }
  if (!session) {
    const value: Session = { transactionId, owner: Symbol('payment-document'), status: 'loading', listeners: new Set() };
    session = value;
    if (!reserveCheckout(value.owner, event => receive(value, event))) value.status = 'busy';
    else void (async () => {
      try {
        const response = await fetch(new URL('/api/subscription/paddle/client-config', window.location.origin), {
          credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        });
        if (!response.ok) throw new Error('Payment unavailable');
        const config: unknown = await response.json();
        if (!validPaymentLinkConfig(config)) throw new Error('Payment unavailable');
        await openPaddlePaymentLink(value.owner, config.clientToken, config.environment, value.owner);
        if (value.status === 'loading') publish(value, 'open');
      } catch { publish(value, 'error'); }
    })();
  }
  const value = session;
  value.listeners.add(listener); listener(value.status);
  return () => { value.listeners.delete(listener); };
}
