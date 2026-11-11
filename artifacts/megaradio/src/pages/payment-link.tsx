import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, RotateCw } from 'lucide-react';
import { getBrowserLanguage } from '@/lib/browser-language';
import { subscriptionCopy } from '@/lib/subscription-copy';
import { paymentLinkTransaction } from '@/lib/payment-link';
import { subscribePaymentLink, type PaymentLinkStatus } from '@/lib/payment-link-session';

export default function PaymentLinkPage() {
  const [transactionId] = useState(() => paymentLinkTransaction(window.location.search));
  const [status, setStatus] = useState<PaymentLinkStatus>('loading');
  const language = getBrowserLanguage('/pay');
  const copy = subscriptionCopy(language);

  useEffect(() => {
    if (!transactionId) return;
    return subscribePaymentLink(transactionId, setStatus);
  }, [transactionId]);

  const retry = () => window.location.reload();
  const message = !transactionId ? 'This payment link is unavailable.' : status === 'error' ? copy.unavailable
    : status === 'busy' ? 'A payment window is already open.' : status === 'submitted' ? 'Your payment details were submitted.'
    : status === 'closed' ? 'Payment window closed.' : status === 'open' ? 'Payment window is open.' : 'Opening secure checkout...';
  return <main className="min-h-screen bg-[#0E0E0E] px-5 py-10 text-white">
    <div className="mx-auto max-w-lg">
      <a href={`/${language}`} className="mb-10 inline-flex items-center gap-3 text-2xl font-bold"><img src="/logo-icon.webp" alt="" width="44" height="44" />MegaRadio</a>
      <section className="rounded-lg border border-white/15 p-6 sm:p-8" aria-labelledby="payment-title">
        <h1 id="payment-title" className="mb-5 text-2xl font-semibold">Payment details</h1>
        <p role="status" aria-live="polite" className="flex items-start gap-3 text-base leading-7 text-white/75">{transactionId && status === 'loading' && <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />}{message}</p>
        {transactionId && status !== 'loading' && status !== 'submitted' && <button type="button" onClick={retry} className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#FF4199] px-4 py-2 text-sm font-semibold text-white"><RotateCw size={16} aria-hidden="true" />{copy.retry}</button>}
        <a href={`/${language}/premium`} className="mt-8 flex items-center gap-2 text-sm text-white/65 hover:text-white"><ArrowLeft size={16} aria-hidden="true" />Premium</a>
      </section>
    </div>
  </main>;
}
