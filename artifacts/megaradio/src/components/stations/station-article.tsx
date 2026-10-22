import { useId, useLayoutEffect, useRef, useState } from 'react';

interface StationArticleProps {
  text: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  moreLabel: string;
  lessLabel: string;
}

export function StationArticle({ text, expanded, onExpandedChange, moreLabel, lessLabel }: StationArticleProps) {
  const articleId = useId();
  const articleRef = useRef<HTMLParagraphElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(article).lineHeight);
      // Measure the collapsed height even when open, so a shorter API update
      // or a wider viewport does not leave an unnecessary collapse control.
      if (expanded && !Number.isFinite(lineHeight)) return;
      const collapsedHeight = expanded ? lineHeight * 3 : article.clientHeight;
      setHasOverflow(article.scrollHeight > collapsedHeight + 1);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
    observer?.observe(article);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [text, expanded]);

  return (
    <>
      <p id={articleId} ref={articleRef} className={expanded ? 'leading-normal' : 'leading-normal line-clamp-3'}>{text}</p>
      {hasOverflow && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={articleId}
          onClick={() => onExpandedChange(!expanded)}
          className="text-[#FF4199] hover:underline font-medium"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </>
  );
}
