import { useEffect, useRef, useState } from 'react';
import { Check, Flag, LoaderCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/useTranslation';

type Props = { stationId: string; stationName: string };
type Status = 'idle' | 'pending' | 'success' | 'error';

export function StationPlaybackReportButton(props: Props) {
  return <ReportSubmission key={props.stationId} {...props} />;
}

function ReportSubmission({ stationId, stationName }: Props) {
  const { language, localeTranslations } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
  const request = useRef<AbortController | null>(null);
  const german = language === 'de';
  const label = (key: string, fallback: string) => localeTranslations?.[key]?.trim() || fallback;
  const action = label('station_report_action', german ? 'Problem melden' : 'Report problem');
  const pending = label('station_report_pending', german ? 'Wird gesendet' : 'Sending');
  const saved = label('station_report_saved', german ? 'Meldung gespeichert' : 'Report saved');
  const failure = label('station_report_unconfirmed', german
    ? 'Die Meldung konnte nicht bestätigt werden. Bitte erneut versuchen.'
    : 'The report could not be confirmed. Please try again.');

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  const submit = async () => {
    if (request.current || status === 'success') return;
    const controller = new AbortController();
    request.current = controller;
    setStatus('pending');
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      // Only the deliberate click submits a report; no stream tokens or listening history.
      const response = await apiRequest('POST', '/api/stations/report-error', {
        signal: controller.signal,
        body: { stationId, stationName, errorType: 'USER_REPORTED_PLAYBACK',
          errorMessage: 'Listener reported a playback connection failure.' },
      });
      const result = await response.json();
      if (result?.success !== true || typeof result.errorId !== 'string' || !result.errorId.trim()) {
        throw new Error('No saved report was confirmed');
      }
      if (controller.signal.aborted) throw new Error('Report confirmation timed out');
      if (request.current === controller) setStatus('success');
    } catch {
      if (request.current === controller) setStatus('error');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  };
  const Icon = status === 'success' ? Check : status === 'pending' ? LoaderCircle : Flag;
  return <div className="flex max-w-sm flex-col items-center gap-2">
    <button type="button" onClick={submit} disabled={status === 'pending' || status === 'success'}
      aria-busy={status === 'pending'}
      className="inline-flex min-h-[42px] max-w-full items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium text-white bg-[#FF4199] hover:opacity-90 disabled:cursor-default disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${status === 'pending' ? 'animate-spin' : ''}`} />
      {status === 'pending' ? pending : status === 'success' ? saved : action}
    </button>
    <p role={status === 'error' ? 'alert' : 'status'} aria-atomic="true" className={status === 'error' ? 'max-w-xs text-center text-xs leading-relaxed text-white' : 'sr-only'}>
      {status === 'error' ? failure : status === 'success' ? saved : ''}
    </p>
  </div>;
}
