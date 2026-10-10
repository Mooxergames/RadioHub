import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { getChatMediaCopy } from '@/lib/chat-media-copy';
import { gifConfigured, resolveGif, searchGifs, type ChatGif } from '@/lib/chat-gifs';

const emojis = ['😀','😂','🤣','😍','😘','🥰','😊','😎','🤩','🥺','😢','😭','😤','🤔','🤗','🤫','😴','🤮','🥳','😈','👿','💀','👻','🤡','💩','👍','👎','👏','🙌','🤝','❤️','🧡','💛','💚','💙','💜','🖤','💔','🔥','⭐','🎵','🎶','🎤','🎧','📻','📡','🌍','🌈'];

export function GifPicture({ gif, className = '' }: { gif: ChatGif; className?: string }) {
  return <picture>
    {gif.still && <source media="(prefers-reduced-motion: reduce)" srcSet={gif.still} />}
    <img src={gif.url} alt={gif.title} width={gif.width} height={gif.height} loading="lazy" referrerPolicy="no-referrer" className={className} />
  </picture>;
}

export function MessageGif({ reference, language }: { reference: string; language: string }) {
  const copy = getChatMediaCopy(language);
  const result = useQuery({ queryKey: ['chat-gif', reference], queryFn: ({ signal }) => resolveGif(reference, signal),
    staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false });
  if (result.data) return <GifPicture gif={result.data} className="rounded-xl max-h-64 max-w-full object-contain" />;
  return <div className="chat-gif-status" role="status">
    <span>{result.isPending ? copy.loading : copy.unavailable}</span>
    {result.isError && <button type="button" onClick={() => result.refetch()}>{copy.retry}</button>}
  </div>;
}

export function ChatMediaPicker({ language, disabled, onEmoji, onGif, onClose }: {
  language: string; disabled: boolean; onEmoji: (emoji: string) => void; onGif: (gif: ChatGif) => void; onClose: () => void;
}) {
  const copy = getChatMediaCopy(language);
  const id = useId();
  const gifsAvailable = gifConfigured();
  const [tab, setTab] = useState<'emoji' | 'gif'>('emoji');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ChatGif[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const emojiTab = useRef<HTMLButtonElement>(null);
  const gifTab = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { emojiTab.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (tab !== 'gif') return;
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [query, tab]);
  useEffect(() => {
    if (tab !== 'gif' || query.trim() !== search) return;
    const controller = new AbortController();
    if (page === 1) { setItems([]); resultsRef.current?.scrollTo?.(0, 0); }
    setLoading(true); setError(false);
    if (!gifConfigured()) { setError(true); setLoading(false); return; }
    searchGifs(search, page, language, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setItems(previous => page === 1 ? result.items : [...previous, ...result.items]);
      setHasNext(result.hasNext);
    }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, search, page, language, attempt, query]);

  const changeTab = (next: 'emoji' | 'gif') => {
    if (next === 'gif' && !gifsAvailable) return;
    setTab(next);
    (next === 'gif' ? gifTab : emojiTab).current?.focus({ preventScroll: true });
  };
  const isSearching = loading || query.trim() !== search;

  return <section className="chat-media-picker" aria-label={gifsAvailable ? 'Emoji / GIF' : 'Emoji'} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <div className="chat-media-top">
      <div role="tablist" aria-label={gifsAvailable ? 'Emoji / GIF' : 'Emoji'} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); changeTab(event.key === 'Home' ? 'emoji' : event.key === 'End' ? 'gif' : tab === 'gif' ? 'emoji' : 'gif');
      }}>
        <button ref={emojiTab} type="button" role="tab" id={`${id}-emoji-tab`} aria-controls={`${id}-emoji-panel`} aria-selected={tab === 'emoji'} tabIndex={tab === 'emoji' ? 0 : -1} onClick={() => changeTab('emoji')}>Emoji</button>
        {gifsAvailable && <button ref={gifTab} type="button" role="tab" id={`${id}-gif-tab`} aria-controls={`${id}-gif-panel`} aria-selected={tab === 'gif'} tabIndex={tab === 'gif' ? 0 : -1} onClick={() => changeTab('gif')}>GIF</button>}
      </div>
      <button type="button" className="chat-media-close" aria-label={copy.close} onClick={onClose}><X size={18} /></button>
    </div>
    {tab === 'emoji' ? <div role="tabpanel" id={`${id}-emoji-panel`} aria-labelledby={`${id}-emoji-tab`} className="chat-emoji-grid">
      {emojis.map(emoji => <button key={emoji} type="button" disabled={disabled} aria-label={emoji} onClick={() => onEmoji(emoji)}>{emoji}</button>)}
    </div> : <div role="tabpanel" id={`${id}-gif-panel`} aria-labelledby={`${id}-gif-tab`} className="chat-gif-panel">
      <div className="chat-gif-search"><Search size={17} aria-hidden="true" /><input ref={searchRef} type="search" placeholder="Search KLIPY" aria-label="Search KLIPY" maxLength={100} value={query} onChange={event => { setQuery(event.target.value); }} /></div>
      <div ref={resultsRef} className="chat-gif-results" aria-busy={isSearching}>
        {!isSearching && !error && items.length === 0 && <p className="chat-gif-status" role="status">{copy.empty}</p>}
        {query.trim() === search && <div className="chat-gif-grid">{items.map((gif, index) => <button key={`${gif.slug}-${index}`} type="button" disabled={disabled || isSearching} aria-label={`${copy.preview}: ${gif.title}`} onClick={() => onGif({ ...gif, query: search })}><GifPicture gif={gif} /></button>)}</div>}
        {isSearching && <p className="chat-gif-status" role="status">{copy.loading}</p>}
        {!isSearching && error && <div className="chat-gif-status" role="status"><span>{copy.unavailable}</span><button type="button" onClick={() => setAttempt(n => n + 1)}>{copy.retry}</button></div>}
        {!isSearching && !error && hasNext && <button type="button" className="chat-gif-more" onClick={() => setPage(n => n + 1)}>{copy.more}</button>}
      </div>
      <span className="chat-gif-credit">Powered by <strong>KLIPY</strong></span>
    </div>}
  </section>;
}
