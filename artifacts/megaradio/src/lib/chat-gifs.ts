// KLIPY requires browser-direct API/media delivery. Persist only a provider slug,
// so reopening a conversation resolves the provider's current, permitted media.
export interface ChatGif {
  slug: string;
  title: string;
  url: string;
  still: string;
  width: number;
  height: number;
  query?: string;
}

export const gifConfigured = () => !!import.meta.env.VITE_KLIPY_API_KEY?.trim();
export const gifReference = (slug: string) => `klipy:${slug}`;
export const gifSlug = (reference: string) => /^klipy:([a-zA-Z0-9_-]{1,200})$/.exec(reference)?.[1] || '';

function endpoint(action: string, params: Record<string, string> = {}) {
  const key = import.meta.env.VITE_KLIPY_API_KEY?.trim();
  if (!key) throw new Error('GIF service unavailable');
  return `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${action}?${new URLSearchParams(params)}`;
}

function mediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && /^static[12]?\.klipy\.com$/.test(url.hostname) && !url.username && !url.password) return value;
  } catch { /* Invalid provider response. */ }
  return '';
}

export function parseGifPage(payload: any): { items: ChatGif[]; hasNext: boolean } {
  if (payload?.result !== true || !Array.isArray(payload.data?.data)) throw new Error('GIF response unavailable');
  const items = payload.data.data.map((item: any): ChatGif => {
    const media = item.file?.sm?.webp || item.file?.sm?.gif || item.file?.md?.gif || item.file?.hd?.gif;
    const url = mediaUrl(media?.url);
    // Fail the page instead of silently reordering/filtering the provider's grid.
    if (!url || !gifSlug(gifReference(item.slug)) || item.type !== 'gif') throw new Error('Unsupported GIF response');
    return { slug: item.slug, title: String(item.title || 'GIF'), url,
      still: mediaUrl(item.file?.sm?.jpg?.url), width: Number(media.width) || 220, height: Number(media.height) || 220 };
  });
  return { items, hasNext: payload.data.has_next === true };
}

async function requestGifs(action: string, params: Record<string, string>, signal?: AbortSignal) {
  const response = await fetch(endpoint(action, params), { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('GIF request failed');
  const payload = await response.json();
  return parseGifPage(payload);
}

export function searchGifs(query: string, page: number, language: string, signal?: AbortSignal) {
  return requestGifs(query ? 'search' : 'trending', {
    page: String(page), per_page: '24', locale: language.split('-')[0],
    format_filter: 'webp,gif,jpg', content_filter: 'high', ...(query ? { q: query } : {}),
  }, signal);
}

export async function resolveGif(reference: string, signal?: AbortSignal) {
  const slug = gifSlug(reference);
  if (!slug) throw new Error('Invalid GIF reference');
  const page = await requestGifs('items', { slugs: slug }, signal);
  // Search slugs can carry a delivery suffix; Items returns the canonical slug.
  // Resolve exactly one requested reference without rewriting either identifier.
  const gif = page.items.length === 1 ? page.items[0] : undefined;
  if (!gif) throw new Error('GIF no longer available');
  return gif;
}

export async function recordGifShare(gif: ChatGif) {
  // No account identifiers, conversation content, or authentication headers leave the app.
  try { await fetch(endpoint(`share/${encodeURIComponent(gif.slug)}`), {
    method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: gif.query || '' }),
  }); } catch { /* Analytics must never cause a message to be retried. */ }
}
