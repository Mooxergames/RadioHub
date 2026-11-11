export function paymentLinkTransaction(search: string): string | null {
  const values = new URLSearchParams(search).getAll('_ptxn');
  return values.length === 1 && /^txn_[a-z0-9]{26}$/.test(values[0]) ? values[0] : null;
}

export function validPaymentLinkConfig(value: unknown): value is { clientToken: string; environment: 'sandbox' | 'production' } {
  if (!value || typeof value !== 'object') return false;
  const { clientToken, environment } = value as Record<string, unknown>;
  return typeof clientToken === 'string' && (environment === 'sandbox' && /^test_[a-zA-Z0-9]+$/.test(clientToken)
    || environment === 'production' && /^live_[a-zA-Z0-9]+$/.test(clientToken));
}
