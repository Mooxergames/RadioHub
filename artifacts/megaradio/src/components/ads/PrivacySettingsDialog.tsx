import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { Content as DialogContent } from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { isGoogleMeasurementLocked } from '@/lib/google-tag-manager';
import { getWebAnalyticsConsent, setWebAnalyticsConsent, subscribeWebAnalyticsConsent } from '@/lib/web-analytics-consent';
import { getWebAnalyticsCopy } from '@/lib/web-analytics-copy';

interface PrivacySettingsDialogProps {
  language: string;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: () => void;
  onAdvertisingSettings?: () => void;
}

const getServerConsent = () => 'unknown' as const;

export default function PrivacySettingsDialog({ language, onOpenChange, onCloseAutoFocus, onAdvertisingSettings }: PrivacySettingsDialogProps) {
  const copy = getWebAnalyticsCopy(language);
  const choice = useSyncExternalStore(subscribeWebAnalyticsConsent, getWebAnalyticsConsent, getServerConsent);
  const [enabled, setEnabled] = useState(choice === 'granted');
  const [saveFailed, setSaveFailed] = useState(false);
  const switchId = useId();
  const advertisingId = useId();
  useEffect(() => { setEnabled(choice === 'granted'); }, [choice]);

  const save = () => {
    if (!setWebAnalyticsConsent(enabled ? 'granted' : 'denied')) {
      setSaveFailed(true);
      return;
    }
    setSaveFailed(false);
    onOpenChange(false);
  };

  return <Dialog open onOpenChange={onOpenChange}>
    <DialogPortal>
    <DialogOverlay />
    <DialogContent lang={language} dir={copy.direction}
      className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%_-_2rem)] max-w-lg max-h-[calc(100dvh_-_2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-white/15 bg-[#151515] p-5 text-start text-white shadow-lg sm:p-6"
      onCloseAutoFocus={event => { event.preventDefault(); onCloseAutoFocus(); }}>
      {/* Use the existing Radix primitives with a localized close action. */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <DialogTitle className="min-w-0 text-base leading-6 tracking-normal [overflow-wrap:anywhere]">{copy.privacySettings}</DialogTitle>
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={copy.close} title={copy.close}
            className="h-11 w-11 shrink-0 text-white hover:bg-white/10 hover:text-white">
            <X aria-hidden="true" />
          </Button>
        </DialogClose>
      </div>
      <DialogDescription className="text-start text-sm leading-6 text-[#c5c5cb]">{copy.description}</DialogDescription>
      <div className="flex min-w-0 items-center justify-between gap-4 border-y border-white/10 py-4">
        <label htmlFor={switchId} className="min-w-0 cursor-pointer text-sm font-medium leading-6 [overflow-wrap:anywhere]">{copy.analyticsLabel}</label>
        <Switch id={switchId} dir={copy.direction} checked={enabled} onCheckedChange={setEnabled}
          aria-describedby={advertisingId}
          className={`data-[state=checked]:bg-[#FF4199] data-[state=unchecked]:bg-[#555] focus-visible:ring-[#FF4199] ${copy.direction === 'rtl' ? '[&>span[data-state=checked]]:-translate-x-5' : ''}`} />
      </div>
      <p id={advertisingId} className="text-sm leading-6 text-[#c5c5cb]">{copy.advertisingDisabled}</p>
      {choice === 'granted' && isGoogleMeasurementLocked() && <p role="status" className="text-sm leading-6 text-[#c5c5cb]">{copy.nextLoad}</p>}
      {saveFailed && <p role="alert" className="text-sm leading-6 text-[#ff9fc8]">{copy.saveError}</p>}
      <div className="flex min-w-0 flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {onAdvertisingSettings && <Button type="button" variant="link" onClick={() => {
          onAdvertisingSettings();
          onOpenChange(false);
        }} className="h-auto min-h-11 min-w-0 whitespace-normal px-0 text-start text-sm text-[#c5c5cb] hover:text-[#FF4199] [overflow-wrap:anywhere]">{copy.adsSettings}</Button>}
        <Button type="button" onClick={save}
          className="h-auto min-h-11 min-w-0 whitespace-normal bg-[#FF4199] px-6 py-2 text-black hover:bg-[#ff70b2] sm:ms-auto [overflow-wrap:anywhere]">{copy.save}</Button>
      </div>
    </DialogContent>
    </DialogPortal>
  </Dialog>;
}
