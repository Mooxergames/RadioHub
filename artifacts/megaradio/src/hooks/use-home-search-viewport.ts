import { useLayoutEffect, useRef } from 'react';

/** Keep the mobile search inside the visible area when the keyboard pans iOS. */
export function useHomeSearchViewport(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!open || !node) return;

    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      node.style.setProperty('--home-search-viewport-top', `${Math.max(0, viewport?.offsetTop ?? 0)}px`);
      node.style.setProperty('--home-search-viewport-height', `${Math.max(0, viewport?.height ?? window.innerHeight)}px`);
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    viewport?.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      node.style.removeProperty('--home-search-viewport-top');
      node.style.removeProperty('--home-search-viewport-height');
    };
  }, [open]);

  return ref;
}
