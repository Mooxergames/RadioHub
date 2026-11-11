import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StationArticle } from '../src/components/stations/station-article';

const distinctive = 'The distinctive final programme detail remains in the original article.';
const full = `${'Programme information from the station. '.repeat(20)}${distinctive}`;
let naturalHeight: number;
let resized: () => void;
let disconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  naturalHeight = 240;
  disconnect = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => naturalHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('line-clamp-3') ? Math.min(72, naturalHeight) : naturalHeight;
  });
  const computeStyle = window.getComputedStyle.bind(window);
  vi.stubGlobal('getComputedStyle', (element: Element) => {
    const style = computeStyle(element);
    style.lineHeight = '24px';
    return style;
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect = disconnect;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Fixture({ text = full }: { text?: string }) {
  const [expanded, setExpanded] = useState(false);
  return <StationArticle text={text} expanded={expanded} onExpandedChange={setExpanded}
    moreLabel="more" lessLabel="less" />;
}

it('keeps the complete tail in a single CSS-clamped paragraph before More is clicked', () => {
  render(<Fixture />);
  expect(full.indexOf(distinctive)).toBeGreaterThan(470);
  const article = screen.getByText(full);
  expect(article.textContent).toBe(full);
  expect(article).toHaveClass('line-clamp-3');
  expect(article).not.toHaveAttribute('hidden');
  expect(article).not.toHaveAttribute('aria-hidden');
  expect(document.querySelectorAll('p')).toHaveLength(1);
  const button = screen.getByRole('button', { name: 'more', expanded: false });
  expect(document.getElementById(button.getAttribute('aria-controls')!)).toBe(article);
  expect(button).toHaveAttribute('type', 'button');
  expect(button).toHaveClass('text-[#FF4199]', 'hover:underline', 'font-medium');
});

it('expands and collapses repeatedly without replacing, duplicating or slicing the article', () => {
  render(<Fixture />);
  const article = screen.getByText(full);
  const id = article.id;
  for (let count = 0; count < 2; count++) {
    fireEvent.click(screen.getByRole('button', { name: 'more', expanded: false }));
    expect(screen.getByRole('button', { name: 'less', expanded: true })).toHaveAttribute('aria-controls', id);
    expect(article).not.toHaveClass('line-clamp-3');
    expect(screen.getByText(full)).toBe(article);
    fireEvent.click(screen.getByRole('button', { name: 'less', expanded: true }));
    expect(screen.getByRole('button', { name: 'more', expanded: false })).toHaveAttribute('aria-controls', id);
    expect(article).toHaveClass('line-clamp-3');
    expect(screen.getByText(full)).toBe(article);
  }
  expect(document.querySelectorAll('p')).toHaveLength(1);
  expect(article.textContent).toBe(full);
});

it('does not offer unnecessary controls for a short article', () => {
  naturalHeight = 48;
  render(<Fixture text="A short station article." />);
  expect(screen.getByText('A short station article.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('responds to mobile/desktop width changes without creating another paragraph', () => {
  render(<Fixture />);
  const article = screen.getByText(full);
  expect(screen.getByRole('button', { name: 'more' })).toBeInTheDocument();
  naturalHeight = 48;
  act(() => resized());
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  naturalHeight = 168;
  act(() => resized());
  expect(screen.getByRole('button', { name: 'more', expanded: false })).toBeInTheDocument();
  expect(screen.getByText(full)).toBe(article);
  expect(document.querySelectorAll('p')).toHaveLength(1);
});

it('removes a needless collapse control when an expanded article is replaced by short text', () => {
  const view = render(<Fixture />);
  fireEvent.click(screen.getByRole('button', { name: 'more' }));
  naturalHeight = 24;
  view.rerender(<Fixture text="Updated short article." />);
  expect(screen.getByText('Updated short article.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText(full)).not.toBeInTheDocument();
});

it('uses a resize-event fallback without ResizeObserver and cleans up its subscriptions', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  const view = render(<Fixture />);
  naturalHeight = 48;
  fireEvent(window, new Event('resize'));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  const remove = vi.spyOn(window, 'removeEventListener');
  view.unmount();
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
});

it('disconnects the paragraph observer on unmount', () => {
  const view = render(<Fixture />);
  view.unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});
