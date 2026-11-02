import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRenderableFooterSocialLink } from '../src/lib/footer-social-links';

type SocialLink = { _id: string; platform: string; url: string; isActive: boolean };
const state = vi.hoisted(() => ({ links: [] as SocialLink[] }));
vi.mock('@/hooks/useGlobalPlayer', () => ({ useGlobalPlayer: () => ({ currentStation: null }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  t: (_key: string, fallback: string) => fallback, isLoading: false,
}) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({
  currentLanguage: 'en', changeLanguage: vi.fn(), getLocalizedUrl: (path: string) => `/en${path}`,
}) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.links }) }));
vi.mock('@/components/ads/DeferredAdSenseUnit', () => ({ default: () => null }));
vi.mock('@/components/ads/PrivacySettingsButton', () => ({ default: () => <button>Privacy settings</button> }));
import Footer from '../src/components/layout/footer';

beforeEach(() => { state.links = []; });

describe('configured footer social destinations', () => {
  it.each([
    'https://themegaradio.com', 'https://www.themegaradio.com/',
    'https://themegaradio.com/?ref=footer#social', 'https://themegaradio.com/tr',
    'https://themegaradio.com/EN/', 'https://www.themegaradio.com/de/?utm_source=facebook',
    'https://THEMEGARADIO.com./%65n#top',
  ])('does not present the site homepage as a social profile: %s', url => {
    expect(isRenderableFooterSocialLink({ isActive: true, url })).toBe(false);
  });

  it.each([
    'https://themegaradio.com/en/faq', 'https://themegaradio.com/go/facebook',
    'https://not-themegaradio.com/', 'https://themegaradio.com.example/',
    'https://social.example/%ZZ',
  ])('keeps custom-host behavior and non-home destinations unchanged: %s', url => {
    expect(isRenderableFooterSocialLink({ isActive: true, url })).toBe(true);
  });

  it.each([
    'https://facebook.com', 'https://www.facebook.com/',
    'https://www.facebook.com/?ref=footer#social', 'https://facebook.com/#profile',
    'https://m.facebook.com/', 'https://FACEBOOK.com./',
    'https://instagram.com/', 'https://twitter.com/?lang=en', 'https://x.com/',
    'https://linkedin.com/', 'https://whatsapp.com/', 'https://wa.me/',
    'https://telegram.org/', 'https://t.me/', 'https://reddit.com/',
    'https://pinterest.com/', 'https://youtube.com/', 'https://tiktok.com/',
    'https://www.facebook.com/home.php?ref=footer', 'https://x.com/home#top',
    'https://www.linkedin.com/login?next=/company/example',
    'https://instagram.com/accounts/login/', 'https://x.com/i/flow/login',
    'https://facebook.com/%6cogin/',
  ])('omits generic platform destinations: %s', url => {
    expect(isRenderableFooterSocialLink({ isActive: true, url })).toBe(false);
  });

  it.each([
    'https://www.facebook.com/example-radio?ref=footer#posts',
    'https://facebook.com/profile.php?id=12345',
    'https://instagram.com/example.radio/', 'https://x.com/example_radio',
    'https://linkedin.com/company/example-radio/', 'https://youtube.com/@example-radio',
    'https://t.me/example_radio', 'https://wa.me/43123456789',
    'https://social.example/@radio', 'https://social.example/',
    'https://social.example/home', 'https://notfacebook.com/',
    'https://facebook.com.custom.example/', 'http://social.example:8080/@radio',
    'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com',
    'https://facebook.com/share.php?u=https%3A%2F%2Fexample.com',
    'https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.com',
    'https://x.com/share?text=Radio',
    'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fexample.com',
    'https://api.whatsapp.com/send?text=Radio', 'https://wa.me/?text=Radio',
    'https://t.me/share/url?url=https%3A%2F%2Fexample.com',
    'https://reddit.com/submit?url=https%3A%2F%2Fexample.com',
    'https://pinterest.com/pin/create/button/?url=https%3A%2F%2Fexample.com',
  ])('keeps configured profile/custom URLs and share actions without asserting ownership: %s', url => {
    expect(isRenderableFooterSocialLink({ isActive: true, url })).toBe(true);
  });

  it.each([
    '', 'not a URL', '/example-radio', '//facebook.com/example-radio',
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hello',
    'ftp://facebook.com/example-radio', 'mailto:radio@example.com',
    'https://name:password@facebook.com/example-radio',
    'https://name@social.example/@radio', 'https://:password@social.example/@radio',
    'https://', 'https:///facebook.com/example-radio', 'https://[invalid',
    'https://face book.com/example-radio', 'https://face\nbook.com/example-radio',
    'https:\\facebook.com\\example-radio', 'https://facebook.com/%ZZ',
  ])('rejects unsafe or malformed URLs: %s', url => {
    expect(isRenderableFooterSocialLink({ isActive: true, url })).toBe(false);
  });

  it('requires an explicitly active configuration', () => {
    for (const isActive of [false, undefined, null, 0, 'true']) {
      expect(isRenderableFooterSocialLink({ isActive: isActive as boolean, url: 'https://facebook.com/example-radio' })).toBe(false);
    }
  });
});

describe('footer social rendering', () => {
  it('omits the three live placeholders while keeping normal footer controls', () => {
    state.links = [
      { _id: 'facebook', platform: 'facebook', url: 'https://themegaradio.com', isActive: true },
      { _id: 'instagram', platform: 'instagram', url: 'https://themegaradio.com', isActive: true },
      { _id: 'youtube', platform: 'youtube', url: 'https://youtube.com', isActive: true },
    ];
    render(<Footer />);
    for (const platform of ['facebook', 'instagram', 'youtube']) {
      expect(screen.queryByRole('link', { name: platform })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Share Mega Radio')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About Us' })).toHaveAttribute('href', '/en/about');
    expect(screen.getByTestId('footer-language-selector')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Privacy settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Your Station' })).toBeInTheDocument();
  });

  it('keeps original hrefs, icons, order and styling for allowed links only', () => {
    const profile = 'https://www.facebook.com/example-radio?ref=footer#posts';
    const share = 'https://twitter.com/intent/tweet?text=Radio&url=https%3A%2F%2Fexample.com';
    state.links = [
      { _id: 'placeholder', platform: 'facebook', url: 'https://www.facebook.com/?ref=footer', isActive: true },
      { _id: 'profile', platform: 'facebook', url: profile, isActive: true },
      { _id: 'share', platform: 'twitter', url: share, isActive: true },
      { _id: 'inactive', platform: 'instagram', url: 'https://instagram.com/example.radio', isActive: false },
      { _id: 'unsafe', platform: 'youtube', url: 'javascript:alert(1)', isActive: true },
    ];
    const original = structuredClone(state.links);
    render(<Footer />);
    expect(screen.getByText('Share Mega Radio')).toBeVisible();
    const links = screen.getAllByRole('link').filter(link => link.getAttribute('target') === '_blank');
    expect(links.map(link => link.getAttribute('href'))).toEqual([profile, share]);
    expect(links[0]).toHaveClass('w-12', 'h-12', 'rounded-full', 'hover:opacity-80');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(links[0].querySelector('img')).toHaveAttribute('src', '/icons/footer/facebook.svg');
    expect(screen.queryByRole('link', { name: 'instagram' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'youtube' })).not.toBeInTheDocument();
    expect(state.links).toEqual(original);
  });

  it.each(['empty', 'filtered'])('omits the entire social block when %s, keeping other footer controls', mode => {
    if (mode === 'filtered') state.links = [
      { _id: 'root', platform: 'facebook', url: 'https://facebook.com/', isActive: true },
      { _id: 'inactive', platform: 'instagram', url: 'https://instagram.com/example.radio', isActive: false },
    ];
    const { container } = render(<Footer />);
    expect(screen.queryByText('Share Mega Radio')).not.toBeInTheDocument();
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
    expect(container.querySelector('img[src^="/icons/footer/"]')).toBeNull();
    expect(container.querySelector('.md\\:justify-end')).toBeNull();
    expect(screen.getByTestId('footer-language-selector')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Privacy settings' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Your Station' })).toBeVisible();
  });
});
