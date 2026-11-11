export interface PaddleClientConfig {
  clientToken: string;
  environment: 'sandbox' | 'production';
}

/** Client-side tokens are public; API keys and webhook secrets never leave the server. */
export function paddleClientConfig(env: NodeJS.ProcessEnv = process.env): PaddleClientConfig | null {
  if (env.PAYMENT_PROVIDER !== 'paddle' || !env.PADDLE_API_KEY?.trim() || !env.PADDLE_WEBHOOK_SECRET?.trim()) return null;
  const environment = env.PADDLE_ENVIRONMENT;
  const clientToken = env.PADDLE_CLIENT_TOKEN || env.VITE_PADDLE_CLIENT_TOKEN || '';
  if (!['sandbox', 'production'].includes(environment || '') || /\s/.test(clientToken)) return null;
  if (environment === 'sandbox' && /^test_[a-zA-Z0-9]+$/.test(clientToken)) return { clientToken, environment };
  if (environment === 'production' && /^live_[a-zA-Z0-9]+$/.test(clientToken)) return { clientToken, environment };
  return null;
}
