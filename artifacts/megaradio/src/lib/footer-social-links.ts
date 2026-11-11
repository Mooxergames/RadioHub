const platformDomains = [
  'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'whatsapp.com', 'wa.me', 'telegram.org', 'telegram.me', 't.me',
  'reddit.com', 'pinterest.com', 'pin.it', 'youtube.com', 'youtu.be', 'tiktok.com',
];

const genericPaths = new Set([
  '/', '/home', '/home.php', '/index.php', '/login', '/login.php',
  '/signin', '/sign-in', '/accounts/login', '/i/flow/login',
]);

/** Checks configured destinations, not profile ownership or availability. */
export function isRenderableFooterSocialLink(link: { isActive: boolean; url: string }): boolean {
  if (link.isActive !== true || typeof link.url !== 'string') return false;
  // Require an explicit web URL; do not let URL normalization repair malformed input.
  if (!/^https?:\/\/[^/\\\s]/i.test(link.url) || /[\s\\]/u.test(link.url)) return false;

  try {
    const url = new URL(link.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'themegaradio.com' || host === 'www.themegaradio.com') {
      const path = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase() || '/';
      if (path === '/' || /^\/[a-z]{2}$/.test(path)) return false;
    }
    const knownPlatform = platformDomains.some(domain => host === domain || host.endsWith(`.${domain}`));
    // Custom social hosts need not follow the major platforms' path conventions.
    if (!knownPlatform) return true;

    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase() || '/';
    // wa.me supports a real share action at its root, unlike a platform home URL.
    if (host === 'wa.me' && path === '/' && url.searchParams.get('text')?.trim()) return true;
    return !genericPaths.has(path);
  } catch {
    return false;
  }
}
