import React from 'react';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import HomeSignupBanner from '../src/components/HomeSignupBanner';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({ getLocalizedUrl: (path: string) => `/tr${path}` }) }));

it('keeps banner geometry, decorative PNG fallback and lazy loading with responsive WebP sources', () => {
  const view = render(<HomeSignupBanner />);
  expect(screen.getByRole('heading', { level: 2 })).toHaveClass('home-signup-banner__title');
  expect(screen.getByTestId('signup-banner-button')).toHaveAttribute('href', '/tr/signup');
  const image = view.container.querySelector('img')!;
  expect(image).toHaveAttribute('width', '1312');
  expect(image).toHaveAttribute('height', '1592');
  expect(image).toHaveAttribute('src', '/images/signup-listener.png');
  expect(image).toHaveAttribute('alt', '');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('decoding', 'async');
  expect(image).toHaveClass('home-signup-banner__image');
  const source = view.container.querySelector('picture source')!;
  expect(source).toHaveAttribute('type', 'image/webp');
  expect(source.getAttribute('sizes')).toContain('(max-width: 639px) 210px');
  expect(source.getAttribute('sizes')).toMatch(/372px$/);
  for (const width of [420, 840, 1312]) {
    expect(source.getAttribute('srcset')).toContain(`/images/signup-listener-${width}w.webp ${width}w`);
    const file = resolve(process.cwd(), `public/images/signup-listener-${width}w.webp`);
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
    expect(statSync(file).size).toBeLessThan(statSync(resolve(process.cwd(), 'public/images/signup-listener.png')).size / 10);
  }
});
