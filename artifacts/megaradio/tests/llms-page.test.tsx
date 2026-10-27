import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import LLMsPage from '../src/pages/llms-page';

function showPage(path = '/llms') {
  window.history.replaceState(null, '', path);
  return render(<HelmetProvider><LLMsPage /></HelmetProvider>);
}

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('LLMs helper page', () => {
  it('describes search crawling separately from blocked training bots without granting reuse rights', () => {
    const { container } = showPage();
    expect(screen.getByText(/OAI-SearchBot and bingbot follow the general public crawling rules/)).toBeVisible();
    expect(screen.getByText(/GPTBot and Google-Extended are blocked in robots.txt/)).toBeVisible();
    expect(screen.getByText(/does not grant a content license or additional reuse rights/)).toBeVisible();
    expect(screen.getByText(/Search indexing, ranking, and citations are not guaranteed/)).toBeVisible();
    expect(container).not.toHaveTextContent(/fair use|freely accessible for AI training|explicitly allows and encourages AI crawlers|ChatGPT \/ GPTBot/i);
  });

  it('uses the active sitemap cohort without claiming full localization or unverified catalog counts', async () => {
    const { container } = showPage();
    expect(screen.getByText(new RegExp(`${ACTIVE_SITEMAP_LANGUAGES.length} active sitemap languages; localization varies by language`))).toBeVisible();
    expect(screen.getByText(ACTIVE_SITEMAP_LANGUAGES.join(', '), { selector: 'code' })).toBeVisible();
    expect(container).not.toHaveTextContent(/57 languages|full localization|fully translated|60,000|120\+|100\+/i);
    await waitFor(() => expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content', expect.stringContaining(`${ACTIVE_SITEMAP_LANGUAGES.length} active sitemap languages`),
    ));
  });

  it('links to published English canonical directories instead of unprefixed or noindex trending pages', () => {
    showPage();
    for (const [label, path] of [
      ['Homepage', '/en'], ['All Stations', '/en/stations'], ['Genres', '/en/genres'], ['Regions', '/en/regions'],
      ['About', '/en/about'], ['Contact', '/en/contact'], ['Privacy Policy', '/en/privacy-policy'],
      ['Terms and Conditions', '/en/terms-and-conditions'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', `https://themegaradio.com${path}`);
    }
    expect(screen.queryByRole('link', { name: 'Trending' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://themegaradio.com/llms.txt' })).toHaveAttribute('href', '/llms.txt');
  });

  it('shows station route examples that agree with the current French and Arabic mappings', () => {
    const { container } = showPage();
    expect(URL_TRANSLATIONS.fr.station).toBe('station');
    expect(URL_TRANSLATIONS.ar.station).toBe('mahta');
    expect(screen.getByText(`/fr/${URL_TRANSLATIONS.fr.station}/station-name`)).toBeVisible();
    expect(screen.getByText(`/ar/${URL_TRANSLATIONS.ar.station}/station-name`)).toBeVisible();
    expect(container).not.toHaveTextContent(/\/fr\/radio\/|\/ar\/mahata\/|\/at\/sender\/|\/ch\/sender\/|\/il\/tachana\/|\/br\/estacao\//);
  });

  it.each(['/llms', '/en/llms'])('keeps %s noindex in the client document head', async (path) => {
    showPage(path);
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow'));
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://themegaradio.com/llms');
  });
});
