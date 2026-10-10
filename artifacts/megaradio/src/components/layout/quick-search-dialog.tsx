import type { ReactNode, RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useHomeSearchViewport } from '@/hooks/use-home-search-viewport';
import '@/pages/home-search.css';
import './quick-search-dialog.css';

interface Props {
  children: ReactNode;
  title: string;
  hint: string;
  inputRef: RefObject<HTMLInputElement | null>;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

// Mount inside the portal so viewport tracking starts with an attached ref.
function SearchSurface({ children, title, hint, inputRef, returnFocusRef, onClose }: Props) {
  const viewportRef = useHomeSearchViewport(true);
  return (
    <Dialog.Content
      ref={viewportRef}
      id="quick-search-dialog"
      data-search-element
      className="home-search-panel home-search-panel--open quick-search-panel"
      onOpenAutoFocus={event => { event.preventDefault(); inputRef.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
      }}
      onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={event => {
        // Do not let the underlying /search page's arrow/Escape handlers
        // steal focus, or let a global player interpret typing as playback.
        event.stopPropagation();
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
          event.preventDefault(); inputRef.current?.focus({ preventScroll: true }); inputRef.current?.select();
        }
      }}
    >
      <Dialog.Title className="sr-only">{title}</Dialog.Title>
      <Dialog.Description className="sr-only">{hint}</Dialog.Description>
      {children}
    </Dialog.Content>
  );
}

/** Loaded only on interaction; no route, history or audio mutations. */
export default function QuickSearchDialog(props: Props) {
  return (
    <Dialog.Root open onOpenChange={open => { if (!open) props.onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="quick-search-backdrop" data-testid="quick-search-overlay" />
        <SearchSurface {...props} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
