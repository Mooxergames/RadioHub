import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { translateUrl } from '@workspace/seo-shared/url-translations';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import ProfileRedirect from '../src/pages/profile';

const fixture = vi.hoisted(() => ({ language: 'tr' }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({
  getLocalizedUrl: (path: string) => `/${fixture.language}${translateUrl(path, fixture.language)}`,
}) }));
function Destination() {
  const [location] = useLocation();
  return <output>{location}</output>;
}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s replaces the obsolete page with the single profile without a history loop', language => {
  fixture.language = language;
  const oldPath = `/${language}${translateUrl('/profile', language)}`;
  const target = `/${language}${translateUrl('/profile/settings', language)}`;
  const memory = memoryLocation({ path: `/${language}`, record: true });
  memory.navigate(oldPath);
  window.history.replaceState(null, '', `${oldPath}?source=account#profile-details-title`);
  render(<Router hook={memory.hook}><ProfileRedirect /><Destination /></Router>);
  expect(screen.getByRole('status')).toHaveTextContent(target);
  expect(memory.history).toEqual([`/${language}`, `${target}?source=account#profile-details-title`]);
});
