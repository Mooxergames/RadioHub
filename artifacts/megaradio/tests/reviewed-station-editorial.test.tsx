import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyReviewedStationMetadata, getStationEditorial, REVIEWED_STATION_EDITORIALS,
  type ReviewedStationEditorial } from '@workspace/seo-shared/station-editorial';
import { renderStationEditorialHtml } from '@workspace/seo-shared/station-editorial-html';
import { StationEditorial } from '../src/components/stations/station-editorial';

afterEach(cleanup);
const coverage = JSON.parse(readFileSync(path.resolve('../../docs/content/station-editorial-coverage.json'), 'utf8'));
const fixture: ReviewedStationEditorial = {
  kind: 'reviewed', path: '/en/station/fixture', stationId: 'fixture', slug: 'fixture', language: 'en',
  summary: 'A distinct overview shown beside the player.', title: 'Fixture | Listen Live',
  metaDescription: 'A reviewed description.',
  sections: [{ heading: 'Find a past programme', paragraphs: ['The broadcaster maintains the programme archive.'],
    links: [{ label: 'Programme archive', href: 'https://example.test/archive' }] }],
  questions: [{ question: 'Where is the programme archive?', answer: 'At the broadcaster, not in this live player.',
    link: { label: 'Archive help', href: 'https://example.test/help' } }],
  relatedLinks: [{ label: 'Related station', href: '/en/station/related' }],
  sources: [{ label: 'Publisher', href: 'https://example.test/' }], reviewedAt: '2026-11-11',
};

it('keeps the lower editorial distinct from the overview, with native FAQs and ordinary links', () => {
  const { container } = render(<StationEditorial content={fixture} />);
  expect(container).not.toHaveTextContent(fixture.summary);
  expect(container.querySelector('audio,video,iframe,script,h1,table')).toBeNull();
  expect(container.querySelector('details')?.textContent).toContain(fixture.questions[0].answer);
  expect(container.querySelector('details')?.open).toBe(false);
  expect(screen.getByRole('link', { name: 'Related station' })).toHaveAttribute('href', '/en/station/related');
  expect(screen.getByRole('link', { name: 'Publisher' })).toHaveAttribute('rel', 'noopener noreferrer');
  expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-11-11');
});

it('uses the actual editorial language for headings and does not introduce English fallback copy', () => {
  for (const [language, label] of [['de', 'Häufige Fragen'], ['tr', 'Sık sorulan sorular']] as const) {
    const { container, unmount } = render(<StationEditorial content={{ ...fixture, language }} />);
    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="station-editorial"]')).toHaveAttribute('lang', language);
    unmount();
  }
});

it('keeps published administrator metadata independently authoritative', () => {
  const original = { title: 'old', description: 'old description', ogTitle: 'old OG', ogDescription: 'old OG description',
    twitterTitle: 'old Twitter', twitterDescription: 'old Twitter description', canonical: 'https://example.test/', robots: 'index,follow' };
  const result = applyReviewedStationMetadata(original, fixture, { title: 'Publisher title', ogDescription: 'Social description' });
  expect(result).toMatchObject({ title: 'Publisher title', ogTitle: 'Publisher title', twitterTitle: 'Publisher title',
    description: fixture.metaDescription, ogDescription: 'Social description', twitterDescription: fixture.metaDescription,
    canonical: original.canonical, robots: original.robots });
  expect(original.title).toBe('old');
  const titleOnly = applyReviewedStationMetadata(original, { ...fixture, metaDescription: undefined });
  expect(titleOnly.description).toBe(original.description);
  expect(titleOnly.ogDescription).toBe(original.ogDescription);
  const descriptionOnly = applyReviewedStationMetadata(original, { ...fixture, title: undefined });
  expect(descriptionOnly.title).toBe(original.title);
  expect(descriptionOnly.ogTitle).toBe(original.ogTitle);
  expect(applyReviewedStationMetadata(original, null)).toBe(original);
});

it('covers exactly the reviewed cohort, without enabling aliases, other records or other languages', () => {
  expect(coverage.entries).toHaveLength(118);
  expect(new Set(coverage.entries.map((item: { path: string }) => item.path)).size).toBe(118);
  const tuple = (item: { path: string; language: string; stationId: string; slug: string }) =>
    JSON.stringify([item.path, item.language, item.stationId, item.slug]);
  expect(REVIEWED_STATION_EDITORIALS.map(tuple).sort()).toEqual(coverage.entries
    .filter((item: { decision: string }) => item.decision === 'reviewed').map(tuple).sort());
  expect(REVIEWED_STATION_EDITORIALS).toHaveLength(109);
  expect(new Set(REVIEWED_STATION_EDITORIALS.map(item => item.path)).size).toBe(109);
  expect(Object.fromEntries(['en', 'de', 'tr'].map(language => [language,
    REVIEWED_STATION_EDITORIALS.filter(item => item.language === language).length]))).toEqual({ en: 57, de: 37, tr: 15 });
  for (const item of coverage.entries.filter((entry: { decision: string }) => entry.decision !== 'reviewed')) {
    const content = getStationEditorial({ _id: item.stationId, slug: item.slug }, item.language, item.path);
    expect(content?.kind === 'reviewed', item.path).toBe(false);
    if (item.slug === 'orf-hitradio-o3') expect(content?.kind).toBe('pilot');
    else expect(content).toBeNull();
  }
  for (const item of REVIEWED_STATION_EDITORIALS) {
    const station = { _id: item.stationId, slug: item.slug };
    expect(getStationEditorial(station, item.language, item.path)).toBe(item);
    for (const wrong of [undefined, '/en/stations/' + item.stationId, item.path + '-unreviewed']) {
      expect(getStationEditorial(station, item.language, wrong)).toBeNull();
    }
    expect(getStationEditorial({ ...station, _id: 'different' }, item.language, item.path)).toBeNull();
    expect(getStationEditorial({ ...station, slug: 'different' }, item.language, item.path)).toBeNull();
    expect(getStationEditorial({ ...station, stationPageMode: 'information' }, item.language, item.path)).toBeNull();
    expect(getStationEditorial(station, 'fr', item.path)).toBeNull();
  }
});

it('renders identical reviewed text and links in initial HTML and React for the entire cohort', () => {
  for (const item of REVIEWED_STATION_EDITORIALS) {
    const server = document.createElement('div'), client = document.createElement('div');
    server.innerHTML = renderStationEditorialHtml({ _id: item.stationId, slug: item.slug }, item.language, item.path);
    client.innerHTML = renderToStaticMarkup(<StationEditorial content={item} />);
    const normalize = (node: Element) => node.textContent?.replace(/\s+/g, ' ').trim();
    for (const selector of ['h2', 'h3', 'p', 'summary', 'time']) {
      expect(Array.from(server.querySelectorAll(selector), normalize), `${item.path} ${selector}`)
        .toEqual(Array.from(client.querySelectorAll(selector), normalize));
    }
    expect(Array.from(server.querySelectorAll('a'), node => node.href), item.path)
      .toEqual(Array.from(client.querySelectorAll('a'), node => node.href));
    expect(Array.from(server.querySelectorAll('a'), node => [node.target, node.rel]), item.path)
      .toEqual(Array.from(client.querySelectorAll('a'), node => [node.target, node.rel]));
    expect(server.querySelector('.station-editorial')).toHaveAttribute('lang', item.language);
    expect(server.querySelectorAll('details')).toHaveLength(item.questions.length);
  }
});

it('keeps sourced records free of unsafe links, repeated questions and unstated locale fallback', () => {
  for (const item of REVIEWED_STATION_EDITORIALS) {
    expect(item.stationId, item.path).toMatch(/^[a-f0-9]{24}$/);
    expect(item.path).toBe(`/${item.language}/${item.language === 'de' ? 'sender' : item.language === 'tr' ? 'istasyon' : 'station'}/${item.slug}`);
    expect(item.sections.length, item.path).toBeGreaterThan(0);
    expect(item.sources.length, item.path).toBeGreaterThan(0);
    expect(new Set(item.questions.map(question => question.question)).size).toBe(item.questions.length);
    for (const source of [...item.sources, ...item.sections.flatMap(section => section.links || []),
      ...item.questions.flatMap(question => question.link ? [question.link] : [])]) {
      const url = new URL(source.href);
      expect(url.protocol).toBe('https:');
      expect(url.username || url.password).toBe('');
      expect(source.label.trim()).not.toBe('');
    }
    for (const related of item.relatedLinks) {
      expect(related.href).toMatch(new RegExp(`^/${item.language}/`));
      expect(related.href).not.toContain('//');
    }
  }
});
