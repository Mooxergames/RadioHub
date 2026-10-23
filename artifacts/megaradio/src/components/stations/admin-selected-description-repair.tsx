import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ReviewRow {
  id: string; name: string; reason: string; englishSample: string;
  changes: Array<{ language: string; fields: string[] }>; protectedLanguages: string[];
}
export default function AdminSelectedDescriptionRepair({ busy, onStarted }: {
  busy: boolean; onStarted: (jobId: string, total: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [source, setSource] = useState<'en' | 'auto'>('en');
  const [consent, setConsent] = useState(false);
  const { toast } = useToast();
  const ids = [...new Set(input.trim().split(/[\s,;]+/).filter(Boolean))];
  const valid = ids.length > 0 && ids.length <= 100 && ids.every(id => /^[0-9a-f]{24}$/i.test(id));
  const key = JSON.stringify({ ids, source });
  const sourceBody = source === 'en' ? { sourceLanguage: 'en' } : {};
  const review = useMutation({ retry: false, mutationFn: async () => {
    if (!valid || busy) throw new Error('Select 1-100 station IDs before reviewing.');
    const response = await apiRequest('POST', '/api/admin/stations/review-selected-description-repairs', {
      body: { selectedStationIds: ids, ...sourceBody },
    });
    const result = await response.json();
    if (!Array.isArray(result.rows) || result.rows.length !== ids.length ||
        new Set(result.rows.map((row: ReviewRow) => row.id)).size !== ids.length ||
        result.rows.some((row: ReviewRow) => !row || !ids.includes(row.id) || typeof row.name !== 'string' ||
          typeof row.reason !== 'string' || typeof row.englishSample !== 'string' || !Array.isArray(row.protectedLanguages) ||
          !Array.isArray(row.changes) || row.changes.some(change => !change || typeof change.language !== 'string' ||
            !Array.isArray(change.fields) || change.fields.some(field => !['full', 'meta'].includes(field))))) {
      throw new Error('The review did not return the exact selection. No generation started.');
    }
    return { key, rows: result.rows as ReviewRow[] };
  } });
  const current = review.data?.key === key ? review.data : undefined;
  const eligible = current?.rows.filter(row => row.reason === 'eligible-for-content-repair' && row.changes.length) || [];
  const start = useMutation({ retry: false, mutationFn: async () => {
    if (busy || !current || !consent || !eligible.length) throw new Error('Review and confirm the current selection first.');
    const response = await apiRequest('POST', '/api/admin/stations/repair-selected-descriptions', {
      body: { selectedStationIds: eligible.map(row => row.id), ...sourceBody },
    });
    const result = await response.json();
    if (result.success && (typeof result.jobId !== 'string' || !result.jobId || !Number.isInteger(result.total) || result.total < 1 || result.total > eligible.length)) {
      throw new Error('The server did not return a valid repair job. Check progress before retrying.');
    }
    if (!result.success && result.total !== 0) throw new Error('Could not confirm the selected repair job. Check progress before retrying.');
    return result;
  }, onSuccess: result => {
    setOpen(false); setConsent(false);
    if (result.success) onStarted(result.jobId, result.total);
    else toast({ title: 'No selected repairs needed', description: result.message });
  } });
  const pending = review.isPending || start.isPending;
  const resetReview = () => { review.reset(); start.reset(); setConsent(false); };
  const fieldCount = eligible.reduce((total, row) => total + row.changes.reduce((count, change) => count + change.fields.length, 0), 0);
  return <>
    <Button type="button" variant="outline" disabled={busy || pending} onClick={() => { resetReview(); setOpen(true); }}>
      <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />Selected AI repair
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle className="tracking-normal">Selected description repair</DialogTitle>
          <DialogDescription>All 14 languages · full descriptions and SEO metadata</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><label htmlFor="selected-repair-ids" className="text-sm font-medium">Station IDs</label>
            <Textarea id="selected-repair-ids" value={input} disabled={busy || pending} maxLength={21000}
              className="h-28 resize-y font-mono text-xs" onChange={event => { setInput(event.target.value); resetReview(); }} />
            <p className="text-xs tabular-nums text-muted-foreground">{ids.length}/100 selected</p>
          </div>
          <div className="space-y-2"><label htmlFor="selected-repair-source" className="text-sm font-medium">Source text</label>
            <select id="selected-repair-source" value={source} disabled={busy || pending}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={event => { setSource(event.target.value as 'en' | 'auto'); resetReview(); }}>
              <option value="en">Reviewed English source</option><option value="auto">Available source language</option>
            </select>
          </div>
          <Button type="button" variant="outline" disabled={!valid || busy || pending} onClick={() => { setConsent(false); review.mutate(); }}>
            <Search className="mr-2 h-4 w-4" aria-hidden="true" />{review.isPending ? 'Reviewing selection…' : 'Review selection'}
          </Button>
          {current && <>
            <p className="text-sm tabular-nums">{eligible.length} eligible stations · {fieldCount} fields · 14 languages</p>
            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-left text-xs"><caption className="sr-only">Selected content repair review</caption>
                <thead className="sticky top-0 bg-muted"><tr><th className="p-2">Station</th><th className="p-2">Fields / status</th></tr></thead>
                <tbody>{current.rows.map(row => <tr key={row.id} className="border-t align-top">
                  <td className="max-w-48 break-words p-2">{row.name || row.id}
                    {row.englishSample && <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">English source</summary><p className="mt-1 whitespace-pre-wrap break-words">{row.englishSample}</p></details>}
                  </td><td className="max-w-64 break-words p-2">{row.changes.length ? row.changes.map(change => `${change.language.toUpperCase()}: ${change.fields.join(', ')}`).join(' · ') : row.reason}
                    {row.protectedLanguages.length > 0 && <p className="mt-1 text-muted-foreground">Protected: {row.protectedLanguages.join(', ')}</p>}
                  </td>
                </tr>)}</tbody>
              </table>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy || pending || !eligible.length}
              className="mt-1 h-4 w-4 shrink-0" onChange={event => setConsent(event.target.checked)} />Use existing AI service credits. API charges may apply.</label>
          </>}
          {(review.error || start.error) && <p role="alert" className="text-sm text-destructive">{(review.error || start.error)?.message}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={busy || pending || !current || !consent || !eligible.length} onClick={() => start.mutate()}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />{start.isPending ? 'Starting repair…' : 'Start selected repair'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
