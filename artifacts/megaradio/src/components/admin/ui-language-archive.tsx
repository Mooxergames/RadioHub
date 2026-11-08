import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type ArchiveStatus = {
  checksum: string; languages: { code: string; name: string }[]; translations: number;
  archives: { id: string; checksum: string; created_at: string; restored_at: string | null; languages: number; translations: number }[];
};
const endpoint = '/api/admin/ui-language-archives';

export function UiLanguageArchive() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [downloaded, setDownloaded] = useState('');
  const status = useQuery<ArchiveStatus>({ queryKey: [endpoint], queryFn: async () => {
    const response = await apiFetch(endpoint);
    if (!response.ok) throw new Error('Language archive could not load');
    return response.json();
  } });
  const download = useMutation({ mutationFn: async (id?: string) => {
    const response = await apiFetch(id ? `${endpoint}/${id}/backup` : `${endpoint}/backup`);
    if (!response.ok) throw new Error('Backup download failed');
    const backup = await response.json();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `megaradio-unused-ui-languages-${backup.checksum.slice(0, 12)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (!id) setDownloaded(backup.checksum);
  }, onError: (error: Error) => toast({ title: 'Backup failed', description: error.message, variant: 'destructive' }) });
  const change = useMutation({ mutationFn: async (id?: string) => {
    const response = await apiRequest('POST', id ? `${endpoint}/${id}/restore` : endpoint,
      { body: id ? {} : { checksum: downloaded } });
    return response.json();
  }, onSuccess: async (_result, id) => {
    setDownloaded('');
    await client.invalidateQueries({ predicate: query => String(query.queryKey[0]).includes('translation') || query.queryKey[0] === endpoint });
    toast({ title: id ? 'Archived languages restored' : 'Unused UI languages archived' });
  }, onError: (error: Error) => toast({ title: 'No changes completed', description: error.message, variant: 'destructive' }) });

  if (status.isPending) return <p role="status">Loading language archive...</p>;
  if (status.isError) return <p role="alert">Language archive unavailable. <Button variant="outline" onClick={() => status.refetch()}>Retry</Button></p>;
  const data = status.data;
  const hasUnused = data.languages.length > 0 || data.translations > 0;
  return <section className="space-y-3 border-y py-4" aria-labelledby="language-archive-title">
    <h2 id="language-archive-title" className="text-lg font-semibold">Unused UI languages</h2>
    <p className="text-sm text-muted-foreground">{data.languages.length} unused languages, {data.translations.toLocaleString()} translation values. The 14 published languages, radio records and legacy URLs are preserved.</p>
    {hasUnused && <>
      <p className="text-sm break-words">{data.languages.map(l => l.code).join(', ')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => download.mutate(undefined)} disabled={download.isPending || change.isPending}><Download className="mr-2 h-4 w-4" />Download backup</Button>
        <Button onClick={() => {
          if (window.confirm(`Archive ${data.languages.length} unused UI languages and ${data.translations} translation values? The backup remains downloadable and can be restored below.`)) change.mutate(undefined);
        }} disabled={downloaded !== data.checksum || change.isPending || download.isPending}><Archive className="mr-2 h-4 w-4" />Archive unused languages</Button>
      </div>
      {downloaded && <p className="break-all text-xs text-muted-foreground">Backup SHA-256: {downloaded}</p>}
    </>}
    {data.archives.map(archive => <div key={archive.id} className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
      <span>{new Date(archive.created_at).toLocaleDateString()}: {archive.languages} languages, {archive.translations.toLocaleString()} values{archive.restored_at ? ' (restored)' : ' (archived)'}</span>
      <Button variant="outline" size="sm" aria-label={`Download archive ${archive.id}`} title="Download archive" disabled={download.isPending} onClick={() => download.mutate(archive.id)}><Download className="h-4 w-4" /></Button>
      {!archive.restored_at && <Button variant="outline" size="sm" disabled={change.isPending} onClick={() => {
        if (window.confirm('Restore the archived UI language records and translations? Existing values will not be overwritten. Publishing remains limited to the current 14 languages.')) change.mutate(archive.id);
      }}><RotateCcw className="mr-2 h-4 w-4" />Restore archive</Button>}
    </div>)}
  </section>;
}
