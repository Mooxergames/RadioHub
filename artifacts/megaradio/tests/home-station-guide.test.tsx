import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import HomeStationGuide from '../src/components/HomeStationGuide';
import { HOME_STATION_GUIDE } from '@workspace/seo-shared/home-station-guide';
import { getStationEditorial } from '@workspace/seo-shared/station-editorial';
import { renderHomeStationGuideBody } from '../../api-server/src/seo/home-station-guide-body';

vi.mock('@/hooks/useSeoRouting', () => ({
  useSeoRouting: () => ({ currentLanguage: window.location.pathname.split('/')[1] }),
}));
afterEach(cleanup);

it('links the English home to the actual German editorial pilot in both HTML and React', () => {
  window.history.replaceState({}, '', '/en');
  const view = render(<HomeStationGuide />);
  const link = screen.getByRole('link', { name: HOME_STATION_GUIDE.label });
  expect(link).toHaveAttribute('href', '/de/sender/orf-hitradio-o3');
  expect(link).toHaveAttribute('hreflang', 'de');
  expect(link).not.toHaveAttribute('rel', expect.stringContaining('nofollow'));
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(HOME_STATION_GUIDE.heading);
  const server = document.createElement('div');
  server.innerHTML = renderHomeStationGuideBody('en');
  const content = (root: Element) => [...root.querySelectorAll('h2, p, a')].map(node => node.textContent);
  expect(content(server)).toEqual(content(view.container));
  expect(server.querySelector('a')?.getAttribute('href')).toBe(link.getAttribute('href'));
  expect(getStationEditorial({ _id: '68a8c483bd66579311ab2ffa', slug: 'orf-hitradio-o3' }, 'de')).not.toBeNull();
});

it.each(['de', 'tr', 'es', 'fr', 'pt', 'it', 'ru', 'ar', 'zh', 'ja', 'ko', 'hi', 'he'])(
  'keeps the existing %s homepage unchanged', language => {
    window.history.replaceState({}, '', `/${language}`);
    const view = render(<HomeStationGuide />);
    expect(view.container).toBeEmptyDOMElement();
    expect(renderHomeStationGuideBody(language)).toBe('');
  },
);
