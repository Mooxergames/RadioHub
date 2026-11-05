import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ManualMergePreview } from '@/lib/admin-station-merge';

interface Props {
  review: ManualMergePreview | null;
  isApplying: boolean;
  error: string | null;
  identityConfirmed: boolean;
  onIdentityChange: (confirmed: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ManualStationMergeDialog(props: Props) {
  const { review, isApplying, error } = props;
  return <AlertDialog open={review !== null} onOpenChange={open => { if (!open && !isApplying) props.onClose(); }}>
    <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>Review manual merge</AlertDialogTitle>
        <AlertDialogDescription>
          Retain the selected primary and transfer supported references and aliases before removing duplicate records.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {review && <div className="min-w-0 space-y-3 text-sm">
        <div className="break-words"><strong>Keep: {review.primaryStation.name}</strong>
          <p>{review.primaryStation.country} · {review.primaryStationId}</p>
          <p className="break-all text-xs text-muted-foreground">{review.primaryStation.url}</p>
        </div>
        <div>
          <p className="font-medium">Merge and remove ({review.duplicateStations.length})</p>
          <ul className="mt-1 divide-y border-y">
            {review.duplicateStations.map(station => <li key={station._id} className="py-2 break-words">
              {station.name} · {station.country}
              <p className="text-xs text-muted-foreground break-all">{station._id}<br />{station.url}</p>
            </li>)}
          </ul>
        </div>
        <p className="break-words">{review.identity.reason}</p>
        {review.warnings.map((warning, index) => <p key={index} className="break-words text-amber-700 dark:text-amber-400">{warning}</p>)}
        {review.requiresIdentityConfirmation && <label className="flex items-start gap-2">
          <Checkbox checked={props.identityConfirmed} disabled={isApplying || !!error}
            onCheckedChange={value => props.onIdentityChange(value === true)} />
          <span>I verified these records are the same broadcast</span>
        </label>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      </div>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isApplying}>Close</AlertDialogCancel>
        <Button onClick={props.onConfirm} disabled={isApplying || !!error || (!!review?.requiresIdentityConfirmation && !props.identityConfirmed)}>
          {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm manual merge
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
