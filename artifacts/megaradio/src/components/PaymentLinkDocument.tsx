import { lazy, Suspense, useEffect } from 'react';
import { useLocationProperty } from 'wouter/use-browser-location';
import { isIsolatedPaymentDocument, paymentDocumentUrlChanged, protectPaymentReferrer } from '@/lib/payment-link-navigation';

const PaymentLinkPage = lazy(() => import('@/pages/payment-link'));

export function PaymentLinkDocument() {
  const url = useLocationProperty(() => window.location.href);
  const isolated = isIsolatedPaymentDocument();
  useEffect(() => {
    if (isolated) return;
    protectPaymentReferrer();
    // A raw history/back entry bypassed the normal full-document navigation.
    // One replacement obtains the server's private shell before its lazy chunk.
    if (paymentDocumentUrlChanged()) window.location.replace(window.location.href);
  }, [isolated, url]);
  if (!isolated) return <main className="min-h-screen bg-[#0E0E0E] p-8 text-white"><a href={window.location.href} referrerPolicy="no-referrer">Open secure payment page</a></main>;
  return <Suspense fallback={<div className="min-h-screen bg-[#0E0E0E]" />}><PaymentLinkPage /></Suspense>;
}
