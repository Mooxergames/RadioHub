import { useState, useEffect, useRef } from 'react';
import { apiFetch } from "@/lib/queryClient";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AdminDuplicateMergePanel from '@/components/stations/admin-duplicate-merge-panel';
import ManualStationMergeDialog from '@/components/stations/manual-station-merge-dialog';
import { confirmedManualMergeBody, parseManualMergePreview, type ManualMergePreview } from '@/lib/admin-station-merge';
import { readAdminMergeJob } from '@/hooks/useAdminDuplicateMerge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Merge, AlertTriangle, CheckCircle, Trash2, Crown, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DuplicateStation {
  _id: string;
  name: string;
  url: string;
  urlResolved?: string;
  votes: number;
  playbackSuccessCount: number;
  lastCheckOk: boolean;
  favicon?: string;
  localImagePath?: string;
  hasLogo?: boolean;
  country: string;
}

interface DuplicateGroup {
  name: string;
  country: string;
  duplicateCount: number;
  totalVotes: number;
  stations: DuplicateStation[];
}

interface DuplicatesResponse {
  duplicateGroups: DuplicateGroup[];
  totalGroups: number;
  potentialMerges: number;
  message?: string;
  totalStations?: number;
}



export default function AdminDuplicates() {
  const { toast, dismiss } = useToast();
  const [duplicates, setDuplicates] = useState<DuplicatesResponse | null>(null);
  const [bulkActionTarget, setBulkActionTarget] = useState<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mergeResults, setMergeResults] = useState<string[]>([]);
  const [processingMerge, setProcessingMerge] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<Set<string>>(new Set());
  const [jobProgress, setJobProgress] = useState<{[jobId: string]: {step: string, percentage: number, groupsProcessed?: number, totalGroups?: number}}>({});
  
  // Selection state for deleting stations
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingStations, setIsDeletingStations] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [mergeReview, setMergeReview] = useState<ManualMergePreview | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [mergeReviewError, setMergeReviewError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const actionController = useRef<AbortController | null>(null);
  const candidateController = useRef<AbortController | null>(null);
  const [isApplyingMerge, setIsApplyingMerge] = useState(false);
  
  // Track manually selected primary stations per group (key: group name + country)
  const [selectedPrimaryStations, setSelectedPrimaryStations] = useState<{[groupKey: string]: string}>({});

  // Frequency-format duplicate dedup (e.g. classical-95-9-wcri vs classical-959-wcri)
  const [freqLoading, setFreqLoading] = useState(false);
  const [freqResult, setFreqResult] = useState<{
    confirm: boolean;
    clustersFound: number;
    rowsRedirected: number;
    message: string;
    sampleClusters: Array<{ canonical: string; losers: string[] }>;
    skippedClusters?: number;
    sampleSkipped?: Array<{ ids?: string[]; reason: string }>;
  } | null>(null);

  const actionsDisabled = isLoading || isDeletingStations || processingMerge !== null || freqLoading;

  const activeIntervalsRef = useRef<Map<string, { timer?: ReturnType<typeof setTimeout>; controller: AbortController }>>(new Map());
  const [pollingFailures, setPollingFailures] = useState<Record<string, { groupName?: string; message: string }>>({});

  useEffect(() => {
    return () => {
      activeIntervalsRef.current.forEach(entry => { if (entry.timer) clearTimeout(entry.timer); entry.controller.abort(); });
      activeIntervalsRef.current.clear();
      actionController.current?.abort();
      candidateController.current?.abort();
    };
  }, []);

  const detectDuplicates = async (clearResults = true) => {
    candidateController.current?.abort();
    const controller = new AbortController();
    candidateController.current = controller;
    const timer = setTimeout(() => controller.abort(), 20_000);
    setIsLoading(true);
    if (clearResults) setMergeResults([]);
    setMergeReview(null);
    setPendingDeleteIds([]);
    setShowDeleteConfirm(false);
    setSelectedStations(new Set()); // Clear selections when detecting new duplicates
    try {
      const response = await apiFetch('/api/admin/stations/duplicates', { signal: controller.signal });
      const data = await response.json();
      if (candidateController.current !== controller) return;
      
      // Check for API errors
      if (!response.ok || data.error) {
        console.error('Duplicates API error:', data.error || response.statusText);
        toast({
          title: 'Error detecting duplicates',
          description: data.error || `HTTP ${response.status}: ${response.statusText}. Make sure you are logged in as an admin.`,
          variant: 'destructive'
        });
        setDuplicates(null);
        return;
      }
      
      // Transform the response to match our expected format
      const transformedData: DuplicatesResponse = {
        duplicateGroups: (data.duplicates || []).map((dup: any) => {
          // Handle both name-based groups (with _id.name and _id.country) and URL-based groups (with _id as URL string)
          const isUrlGroup = typeof dup._id === 'string';
          const name = isUrlGroup ? dup._id : (dup._id?.name || '');
          const country = isUrlGroup ? '' : (dup._id?.country || '');
          
          return {
            name: name || '',
            country: country || '',
            duplicateCount: dup.count || 0,
            totalVotes: (dup.stations || []).reduce((sum: number, s: any) => sum + (s.votes || 0), 0),
            stations: dup.stations || []
          };
        }),
        totalGroups: data.total || 0,
        potentialMerges: (data.duplicates || []).reduce((sum: number, group: any) => sum + Math.max(0, (group.stations?.length || 0) - 1), 0),
        totalStations: data.totalStations
      };
      
      // Sort stations within each group: image-having first, then by votes
      const sortedData: DuplicatesResponse = {
        ...transformedData,
        duplicateGroups: transformedData.duplicateGroups.map(group => ({
          ...group,
          stations: sortStationsImageFirst(group.stations)
        }))
      };
      
      setDuplicates(sortedData);
      
      // Show success message
      if (sortedData.duplicateGroups.length > 0) {
        toast({
          title: 'Duplicates found',
          description: `Found ${sortedData.totalGroups} candidate groups to inspect. Matching names alone do not prove they are the same broadcast.`
        });
      }
    } catch (error) {
      if (candidateController.current !== controller) return;
      setDuplicates(null);
      console.error('Failed to detect duplicates:', error);
      toast({
        title: 'Error',
        description: `Failed to detect duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      });
    } finally {
      clearTimeout(timer);
      if (candidateController.current === controller) {
        candidateController.current = null;
        setIsLoading(false);
      }
    }
  };

  // Returns true if a station has any displayable image
  const stationHasImage = (s: DuplicateStation): boolean => {
    if (s.hasLogo) return true;
    if (s.favicon && s.favicon.trim() && s.favicon !== 'null' && s.favicon !== 'undefined') return true;
    if (s.localImagePath && s.localImagePath.trim() && s.localImagePath !== 'null' && s.localImagePath !== 'undefined') return true;
    return false;
  };

  // Sort stations: image+votes first, then votes only, then by id for stability
  const sortStationsImageFirst = (stations: DuplicateStation[]): DuplicateStation[] =>
    [...stations].sort((a, b) => {
      const aImg = stationHasImage(a) ? 1 : 0;
      const bImg = stationHasImage(b) ? 1 : 0;
      if (bImg !== aImg) return bImg - aImg;             // image-having first
      const vDiff = (b.votes || 0) - (a.votes || 0);
      if (vDiff !== 0) return vDiff;                      // then highest votes
      return String(a._id).localeCompare(String(b._id)); // stable tie-break
    });

  // Get the group key for accessing selected primary stations
  const getGroupKey = (group: DuplicateGroup) => JSON.stringify([group.name, group.country]);

  // Get the primary station (manually selected, or image+votes-first default)
  const getPrimaryStationForGroup = (group: DuplicateGroup) => {
    const groupKey = getGroupKey(group);
    const selectedId = selectedPrimaryStations[groupKey];
    if (selectedId) {
      return group.stations.find(s => s._id === selectedId) || sortStationsImageFirst(group.stations)[0];
    }
    return sortStationsImageFirst(group.stations)[0];
  };

  const actionRequest = async (path: string, options: RequestInit, requireSuccess = true) => {
    const controller = new AbortController();
    actionController.current = controller;
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await apiFetch(path, { ...options, signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data.error || (requireSuccess && !data.success)) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
      return data;
    } finally {
      clearTimeout(timer);
      if (actionController.current === controller) actionController.current = null;
    }
  };

  const requestManualMerge = async (group: DuplicateGroup) => {
    if (actionLock.current || actionsDisabled) return;
    dismiss?.();
    actionLock.current = true;
    setProcessingMerge(getGroupKey(group));
    setMergeReviewError(null);
    setIdentityConfirmed(false);
    const primaryStationId = getPrimaryStationForGroup(group)._id;
    const duplicateStationIds = group.stations.filter(s => s._id !== primaryStationId).map(s => s._id);
    try {
      const data = await actionRequest('/api/admin/stations/merge-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryStationId, duplicateStationIds }),
      });
      const review = parseManualMergePreview(data.preview, { primaryStationId, duplicateStationIds });
      setMergeReview(review);
    } catch (error) {
      toast({ title: 'Merge preview failed', description: error instanceof Error ? error.message : 'Refresh candidates and try again.', variant: 'destructive' });
    } finally {
      setProcessingMerge(null);
      actionLock.current = false;
    }
  };

  const confirmManualMerge = async () => {
    if (!mergeReview || mergeReviewError || actionLock.current ||
      (mergeReview.requiresIdentityConfirmation && !identityConfirmed)) return;
    actionLock.current = true;
    setIsApplyingMerge(true);
    setProcessingMerge('applying');
    try {
      const result = await actionRequest('/api/admin/stations/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmedManualMergeBody(mergeReview, identityConfirmed)),
      });
      setMergeResults(previous => [...previous,
        `Merged into ${result.mergedStation?.name || mergeReview.primaryStation.name}: ${result.deletedCount} duplicate record(s) removed.`,
        ...(result.cacheInvalidated === false ? ['Merge completed. Some caches could not be refreshed immediately; cached responses may remain briefly.'] : []),
      ]);
      setMergeReview(null);
      void detectDuplicates(false);
    } catch (error) {
      setMergeReviewError(`${error instanceof Error ? error.message : 'Request failed'}. Do not retry this preview. Close and refresh candidates to check the current records before a new review.`);
    } finally {
      setIsApplyingMerge(false);
      setProcessingMerge(null);
      actionLock.current = false;
    }
  };

  // Toggle station selection
  const toggleStationSelection = (stationId: string) => {
    if (actionsDisabled || duplicates?.duplicateGroups.some(group => getPrimaryStationForGroup(group)._id === stationId)) return;
    setSelectedStations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stationId)) {
        newSet.delete(stationId);
      } else {
        newSet.add(stationId);
      }
      return newSet;
    });
  };

  // Toggle selection of all duplicates in a group (except the image-first primary)
  const toggleSelectAllInGroup = (group: DuplicateGroup) => {
    if (actionsDisabled) return;
    const primary = getPrimaryStationForGroup(group);
    const duplicateIds = new Set(group.stations.filter(s => s._id !== primary._id).map(s => s._id));
    setSelectedStations(prev => {
      const newSet = new Set(prev);
      const allSelected = Array.from(duplicateIds).every(id => newSet.has(id));
      
      if (allSelected) {
        // Deselect all duplicates in this group
        duplicateIds.forEach(id => newSet.delete(id));
      } else {
        // Select all duplicates in this group
        duplicateIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Check if all duplicates in a group are selected (primary excluded)
  const areAllDuplicatesSelected = (group: DuplicateGroup): boolean => {
    const primary = getPrimaryStationForGroup(group);
    const duplicateIds = group.stations.filter(s => s._id !== primary._id).map(s => s._id);
    return duplicateIds.length > 0 && duplicateIds.every(id => selectedStations.has(id));
  };

  // Select all duplicates across ALL groups (excluding the image-first primary in each group)
  const selectAllDuplicates = () => {
    if (actionsDisabled || !duplicates?.duplicateGroups) return;

    const allDuplicateIds = new Set<string>();
    duplicates.duplicateGroups.forEach(group => {
      const primary = getPrimaryStationForGroup(group);
      group.stations.forEach(station => {
        if (station._id !== primary._id) allDuplicateIds.add(station._id);
      });
    });
    setSelectedStations(allDuplicateIds);
    toast({
      title: 'Duplicates selected',
      description: `Selected ${allDuplicateIds.size} duplicate stations across all groups`,
    });
  };

  // Deselect all stations
  const deselectAll = () => {
    if (actionsDisabled) return;
    setSelectedStations(new Set());
    toast({
      title: 'Selection cleared',
      description: 'All stations have been deselected',
    });
  };

  const safeDeleteIds = (ids: string[]) => {
    const groups = duplicates?.duplicateGroups || [];
    const loadedIds = new Set(groups.flatMap(group => group.stations.map(s => s._id)));
    const primaryIds = new Set(groups.map(group => getPrimaryStationForGroup(group)._id));
    return [...new Set(ids)].filter(id => loadedIds.has(id) && !primaryIds.has(id));
  };

  const requestDelete = (group?: DuplicateGroup) => {
    if (actionsDisabled || actionLock.current) return;
    const ids = safeDeleteIds([...selectedStations]).filter(id => !group || group.stations.some(s => s._id === id));
    if (!ids.length) return;
    dismiss?.();
    setPendingDeleteIds(ids);
    setShowDeleteConfirm(true);
  };

  // Freeze deletion scope at confirmation; never delete a selected primary.
  const deleteSelectedStations = async () => {
    if (actionLock.current) return;
    const stationIds = safeDeleteIds(pendingDeleteIds);
    if (!stationIds.length || stationIds.length !== pendingDeleteIds.length) {
      setShowDeleteConfirm(false);
      setPendingDeleteIds([]);
      toast({
        title: 'Selection changed',
        description: 'Review the remaining records and confirm a new deletion.',
        variant: 'destructive'
      });
      return;
    }

    actionLock.current = true;
    setIsDeletingStations(true);
    try {
      // Helper: true if URL is a valid non-empty non-sentinel string
      const isValidUrl = (url: string | null | undefined): boolean => {
        if (!url) return false;
        const t = url.trim();
        return t !== '' && t !== 'null' && t !== 'undefined';
      };

      // SMART IMAGE COPYING: before deleting, ensure the surviving station keeps an image
      if (duplicates?.duplicateGroups) {
        for (const group of duplicates.duplicateGroups) {
          const groupStationIds = new Set(group.stations.map(s => s._id));
          const selectedInGroup = stationIds.filter(id => groupStationIds.has(id));

          if (selectedInGroup.length === 0) continue;

          // Best remaining station: image-first, then votes
          const remainingStations = sortStationsImageFirst(
            group.stations.filter(s => !selectedInGroup.includes(s._id))
          );
          const bestRemaining = remainingStations[0];

          // Only copy if the best remaining station has no image at all
          if (bestRemaining && !stationHasImage(bestRemaining)) {
            const stationsBeingDeleted = group.stations.filter(s => selectedInGroup.includes(s._id));
            const faviconSource = stationsBeingDeleted.find(s => isValidUrl(s.favicon) || isValidUrl(s.localImagePath));
            const sourceFaviconUrl = isValidUrl(faviconSource?.favicon)
              ? faviconSource!.favicon!
              : isValidUrl(faviconSource?.localImagePath)
                ? faviconSource!.localImagePath!
                : '';

            if (sourceFaviconUrl) {
              try {
                await actionRequest(`/api/admin/stations/${bestRemaining._id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ favicon: sourceFaviconUrl }),
                }, false);
                toast({
                  title: 'Image preserved',
                  description: `Copied image from "${faviconSource!.name}" to "${bestRemaining.name}"`,
                });
              } catch (error) {
                console.error('Failed to copy favicon:', error);
                // Continue with deletion even if favicon copy fails
              }
            }
          }
        }
      }

      // Now delete the selected stations
      const result = await actionRequest('/api/admin/delete-stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationIds })
      });

      if (result.success) {
        toast({
          title: 'Stations deleted',
          description: `Successfully deleted ${result.deletedCount} station(s)`,
        });
        setSelectedStations(new Set());
        setShowDeleteConfirm(false);
        // Refresh duplicates list
        void detectDuplicates(false);
      } else {
        toast({
          title: 'Delete failed',
          description: result.error || 'Failed to delete stations',
          variant: 'destructive'
        });
      }
    } catch (error) {
      setShowDeleteConfirm(false);
      setPendingDeleteIds([]);
      setSelectedStations(new Set());
      setDuplicates(null);
      toast({
        title: 'Check deletion status',
        description: 'The request did not complete cleanly. Refresh candidates before retrying; some records may already have been deleted.',
        variant: 'destructive'
      });
    } finally {
      setIsDeletingStations(false);
      actionLock.current = false;
    }
  };



  const pollJobStatus = (jobId: string, groupName?: string) => {
    if (activeIntervalsRef.current.has(jobId)) return;
    const entry: { timer?: ReturnType<typeof setTimeout>; controller: AbortController } = { controller: new AbortController() };
    activeIntervalsRef.current.set(jobId, entry);
    setPollingFailures(previous => { const next = { ...previous }; delete next[jobId]; return next; });
    setActiveJobs(previous => new Set([...Array.from(previous), jobId]));
    const finish = () => {
      if (entry.timer) clearTimeout(entry.timer);
      activeIntervalsRef.current.delete(jobId);
      setActiveJobs(previous => { const next = new Set(previous); next.delete(jobId); return next; });
      setJobProgress(previous => { const next = { ...previous }; delete next[jobId]; return next; });
    };
    const poll = async () => {
      try {
        const job = await readAdminMergeJob(jobId, entry.controller.signal);
        if (entry.controller.signal.aborted) return;
        setJobProgress(previous => ({ ...previous, [jobId]: {
          step: job.progress.currentStep, percentage: job.progress.percentage,
          groupsProcessed: job.progress.groupsProcessed, totalGroups: job.progress.totalGroups,
        } }));
        if (job.status === 'running') {
          // Schedule after the response, so slow requests never overlap.
          entry.timer = setTimeout(() => void poll(), 3000);
          return;
        }
        finish();
        if (job.status === 'completed') {
          await detectDuplicates();
          if (entry.controller.signal.aborted) return;
          setMergeResults(previous => [...previous,
            `Merge completed${groupName ? ` for ${groupName}` : ''}: ${job.results.mergedGroups} groups merged; ${job.results.skippedGroups} skipped.`,
            ...job.results.errors,
          ]);
        } else {
          setMergeResults(previous => [...previous, `Merge failed: ${job.errorMessage || 'See server job details before retrying.'}`, ...job.results.errors]);
        }
      } catch (error) {
        if (entry.controller.signal.aborted) return;
        finish();
        setPollingFailures(previous => ({ ...previous, [jobId]: { groupName,
          message: error instanceof Error ? error.message : 'Status request failed',
        } }));
      }
    };
    void poll();
  };


  // Frequency-format dedup: collapse station records whose slugs differ only in
  // frequency punctuation (classical-95-9-wcri vs classical-959-wcri) onto one
  // canonical URL via a 301. Dry-run first (confirm=false), then apply.
  const runFreqDedup = async (confirm: boolean) => {
    if (actionLock.current || actionsDisabled) return;
    actionLock.current = true;
    setFreqLoading(true);
    try {
      const data = await actionRequest(
        `/api/admin/stations/dedup-frequency${confirm ? '?confirm=true' : ''}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }, false,
      );
      setFreqResult(data);
      toast({
        title: confirm ? 'Frequency duplicates redirected' : 'Dry run complete',
        description: confirm
          ? `Redirected ${data.rowsRedirected} duplicate stations to their canonical URL.`
          : `Found ${data.clustersFound} frequency-duplicate clusters. Review below, then Apply.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Frequency dedup error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setFreqLoading(false);
      actionLock.current = false;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 space-y-5 sm:space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl sm:text-3xl font-bold">Station Duplicate Management</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Detect and merge duplicate radio stations across the entire database
        </p>
      </div>

      <AdminDuplicateMergePanel bulkActionTarget={bulkActionTarget} onApplied={() => { if (duplicates) void detectDuplicates(); }} />
      {Object.entries(pollingFailures).map(([jobId, failure]) => (
        <Alert key={jobId} variant="destructive"><AlertDescription>
          Status checking stopped{failure.groupName ? ` for ${failure.groupName}` : ''}: {failure.message}. The server job may still be running.
          <Button size="sm" variant="outline" className="ml-3" onClick={() => pollJobStatus(jobId, failure.groupName)}>Retry job status</Button>
        </AlertDescription></Alert>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Review candidate groups individually</CardTitle>
          <CardDescription>
            Matching names and countries are candidates, not proof of duplicate broadcasts.
            Inspect streams and content before choosing a primary station.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void detectDuplicates()} disabled={actionsDisabled} size="sm" variant="outline">
            {isLoading ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle aria-hidden="true" className="mr-2 h-4 w-4" />}
            Detect candidates for manual review
          </Button>
        </CardContent>
      </Card>

      {/* Frequency-Format Duplicates (SEO) */}
      <Card className="border-blue-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-blue-600" />
            Frequency-Format Duplicates (SEO)
          </CardTitle>
          <CardDescription>
            Collapses station records whose slugs differ only in frequency punctuation
            (e.g. <code>classical-95-9-wcri</code> vs <code>classical-959-wcri</code>) onto a single
            canonical URL with a 301 when broadcast identity checks pass. Records are retained;
            unsafe clusters are skipped. Consolidation does not guarantee search indexing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => runFreqDedup(false)}
              disabled={actionsDisabled}
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
              data-testid="button-freq-dryrun"
            >
              {freqLoading ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <AlertTriangle className="h-4 w-4 sm:mr-2" />}
              Preview (Dry Run)
            </Button>
            <Button
              onClick={() => {
                if (window.confirm(
                  'Apply redirects for verified frequency-duplicate clusters?\n\nUnsafe clusters are skipped. Duplicate records are retained and redirected to an indexable primary.'
                )) {
                  runFreqDedup(true);
                }
              }}
              disabled={actionsDisabled || !freqResult || freqResult.clustersFound === 0}
              variant="default"
              size="sm"
              className="text-xs sm:text-sm bg-blue-600 hover:bg-blue-700"
              data-testid="button-freq-apply"
              title={!freqResult ? 'Run a dry run first' : undefined}
            >
              {freqLoading ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <CheckCircle className="h-4 w-4 sm:mr-2" />}
              Apply Redirects
            </Button>
          </div>

          {freqResult && (
            <div className="space-y-3">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <span className="text-sm">{freqResult.message}</span>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Clusters: <strong>{freqResult.clustersFound}</strong>
                    {' · '}Skipped: <strong>{freqResult.skippedClusters || 0}</strong>
                    {freqResult.confirm && (
                      <> · Redirected: <strong>{freqResult.rowsRedirected}</strong></>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {!!freqResult.sampleSkipped?.length && (
                <Alert variant="destructive"><AlertDescription>
                  <p className="font-medium">Skipped clusters</p>
                  <ul className="mt-2 space-y-1 text-xs break-words">
                    {freqResult.sampleSkipped.map((cluster, index) => <li key={index}>{cluster.reason}</li>)}
                  </ul>
                </AlertDescription></Alert>
              )}

              {freqResult.sampleClusters.length > 0 && (
                <div className="rounded border divide-y">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/50">
                    Sample clusters (kept → redirected)
                  </div>
                  {freqResult.sampleClusters.map((c, i) => (
                    <div key={i} className="px-3 py-2 text-xs font-mono break-all">
                      <span className="text-green-600 dark:text-green-400">👑 {c.canonical}</span>
                      {c.losers.map((l) => (
                        <div key={l} className="text-muted-foreground pl-5">↳ 301 ← {l}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      {duplicates && (
        <Alert>
          <CheckCircle className="h-4 w-4 hidden sm:block" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 sm:gap-0">
                <CheckCircle className="h-4 w-4 sm:hidden flex-shrink-0" />
                <span className="text-sm sm:text-base">
                  {duplicates.message || (
                    <>
                      Found <strong>{duplicates.totalGroups.toLocaleString()}</strong> candidate groups containing{' '}
                      <strong>{duplicates.duplicateGroups.reduce((sum, group) => sum + group.stations.length, 0).toLocaleString()}</strong> station records
                    </>
                  )}
                </span>
              </div>
              {duplicates.totalStations && (
                <div className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  Total: {duplicates.totalStations.toLocaleString()} stations
                  {' · '}{duplicates.potentialMerges.toLocaleString()} extra records to review
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div ref={setBulkActionTarget} />
              <Button
                onClick={selectAllDuplicates}
                size="sm"
                variant="outline"
                disabled={actionsDisabled || duplicates.potentialMerges === 0}
                data-testid="button-select-all-duplicates"
                className="text-xs"
              >
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Select All</span>
                <span className="sm:hidden">All</span>
              </Button>
              {selectedStations.size > 0 && (
                <>
                  <Button
                    onClick={deselectAll}
                    disabled={actionsDisabled}
                    size="sm"
                    variant="outline"
                    data-testid="button-deselect-all"
                    className="text-xs"
                  >
                    <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Deselect</span>
                  </Button>
                  <Button
                    onClick={() => requestDelete()}
                    size="sm"
                    variant="destructive"
                    disabled={actionsDisabled}
                    data-testid="button-delete-selected-global"
                    className="text-xs"
                  >
                    {isDeletingStations ? (
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    )}
                    ({selectedStations.size})
                  </Button>
                </>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Active Jobs Status with Progress */}
      {activeJobs.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Active Merge Jobs ({activeJobs.size})
            </CardTitle>
            <CardDescription>
              Jobs are running in background. You can safely close this tab - merging will continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from(activeJobs).map(jobId => {
              const progress = jobProgress[jobId];
              return (
                <div key={jobId} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Job {jobId.substring(0, 8)}...</span>
                    <span className="text-sm text-muted-foreground">
                      {progress?.percentage || 0}%
                    </span>
                  </div>
                  <Progress value={progress?.percentage || 0} className="h-2" />
                  <div className="text-xs text-muted-foreground">
                    {progress?.step || 'Initializing...'}
                    {progress?.groupsProcessed && progress?.totalGroups && (
                      <span className="ml-2">
                        ({progress.groupsProcessed}/{progress.totalGroups} groups)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Merge Results */}
      {mergeResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Merge Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 font-mono text-sm">
              {mergeResults.map((result, index) => (
                <div key={index} className="p-2 bg-muted rounded">
                  {result}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duplicate Groups */}
      {duplicates?.duplicateGroups.map((group, index) => (
        <Card key={index}>
          <CardHeader className="p-3 sm:p-6">
            <div className="space-y-3">
              {/* Group Header - Mobile Responsive */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-1 sm:gap-2 text-sm sm:text-base">
                    <span className="truncate max-w-[200px] sm:max-w-none">"{group.name}"</span>
                    <span className="hidden sm:inline">-</span>
                    <Badge variant="secondary" className="text-xs">{group.country}</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm mt-1">
                    {group.duplicateCount} duplicate stations found
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    disabled={actionsDisabled}
                    checked={areAllDuplicatesSelected(group)}
                    onCheckedChange={() => toggleSelectAllInGroup(group)}
                    data-testid="checkbox-select-all-group"
                  />
                  <label className="text-xs sm:text-sm font-medium cursor-pointer whitespace-nowrap" onClick={() => toggleSelectAllInGroup(group)}>
                    Select All
                  </label>
                </div>
              </div>
              {/* Action Buttons - Mobile Grid */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:justify-end">
                <Button
                  onClick={() => void requestManualMerge(group)}
                  disabled={actionsDisabled}
                  size="sm"
                  variant="default"
                  className="flex items-center justify-center gap-1 sm:gap-2 bg-amber-600 hover:bg-amber-700 text-xs sm:text-sm"
                  data-testid="button-keep-highest"
                  title="Review a merge retaining the selected primary station"
                >
                  {processingMerge === getGroupKey(group) ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  <span>Keep Primary</span>
                </Button>
                <Button
                  onClick={() => void requestManualMerge(group)}
                  disabled={actionsDisabled}
                  size="sm"
                  variant="outline"
                  className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  data-testid="button-merge-group"
                >
                  {processingMerge === getGroupKey(group) ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <Merge className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  Merge
                </Button>
                <Button
                  onClick={() => requestDelete(group)}
                  disabled={actionsDisabled || !group.stations.some(s => selectedStations.has(s._id))}
                  size="sm"
                  variant="destructive"
                  className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  data-testid="button-delete-group-selected"
                  title="Delete selected stations from this group"
                >
                  {isDeletingStations ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  <span className="hidden sm:inline">Delete Selected</span>
                  <span className="sm:hidden">Delete</span>
                </Button>
                <Button
                  onClick={() => requestDelete()}
                  disabled={selectedStations.size === 0 || actionsDisabled}
                  size="sm"
                  variant="outline"
                  className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm border-destructive text-destructive hover:bg-destructive/10"
                  data-testid="button-delete-selected"
                >
                  {isDeletingStations ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  <span className="hidden sm:inline">Global</span> ({selectedStations.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-6">
            <div className="space-y-2 sm:space-y-3">
              {/* Auto-select note */}
              {(() => {
                const autoP = sortStationsImageFirst(group.stations)[0];
                const hasImg = stationHasImage(autoP);
                return hasImg ? (
                  <p className="text-xs text-green-600 dark:text-green-400 mb-2">
                    ✓ Auto-selected primary has an image
                  </p>
                ) : null;
              })()}
              <RadioGroup
                disabled={actionsDisabled}
                value={selectedPrimaryStations[getGroupKey(group)] || getPrimaryStationForGroup(group)._id}
                onValueChange={(value) => {
                  if (actionsDisabled) return;
                  setSelectedPrimaryStations(prev => ({
                    ...prev,
                    [getGroupKey(group)]: value,
                  }));
                  setSelectedStations(previous => {
                    const next = new Set(previous);
                    next.delete(value);
                    return next;
                  });
                }}
              >
                {group.stations.map((station) => {
                  const primary = getPrimaryStationForGroup(group);
                  const isSelected = station._id === primary._id;
                  const hasImage = stationHasImage(station);

                  return (
                    <div key={station._id}>
                      {/* Station Row */}
                      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 sm:p-3 rounded border hover:bg-muted/50 transition-colors gap-2 ${isSelected ? 'border-amber-500/60 bg-amber-500/5' : ''}`}>
                        {/* Left Side: Controls + Station Info */}
                        <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          {/* Radio + Checkbox + Image */}
                          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                            <RadioGroupItem
                              value={station._id}
                              id={`primary-${station._id}`}
                              data-testid={`radio-primary-${station._id}`}
                              className="h-4 w-4"
                            />
                            {isSelected && <Crown className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600" />}
                            {!isSelected && (
                              <Checkbox
                                disabled={actionsDisabled}
                                checked={selectedStations.has(station._id)}
                                onCheckedChange={() => toggleStationSelection(station._id)}
                                data-testid={`checkbox-station-${station._id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4"
                              />
                            )}
                            {/* Image preview — show favicon if available */}
                            {station.favicon ? (
                              <img
                                src={station.favicon}
                                alt={`${station.name} logo`}
                                className="w-6 h-6 sm:w-8 sm:h-8 rounded flex-shrink-0 object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex-shrink-0 flex items-center justify-center text-[8px] font-bold ${hasImage ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                                {hasImage ? '✓' : '?'}
                              </div>
                            )}
                          </div>
                          {/* Station Name + URL */}
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="font-medium text-sm sm:text-base truncate">{station.name}</div>
                            <div className="text-xs sm:text-sm text-muted-foreground truncate max-w-full">
                              {station.url}
                            </div>
                          </div>
                        </div>
                        {/* Right Side: Badges + Status */}
                        <div className="flex items-center justify-between sm:justify-end gap-2 sm:flex-col sm:items-end ml-6 sm:ml-0">
                          <div className="flex gap-1 sm:gap-2 flex-wrap">
                            {isSelected ? (
                              <Badge variant="default" className="bg-amber-600 hover:bg-amber-700 text-[10px] sm:text-xs px-1 sm:px-2">
                                👑 <span className="hidden sm:inline">PRIMARY</span>
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 sm:px-2">
                                DUP
                              </Badge>
                            )}
                            {hasImage && (
                              <Badge className="bg-green-600 text-white hover:bg-green-700 text-[10px] sm:text-xs px-1 sm:px-2">
                                🖼 <span className="hidden sm:inline">Image</span>
                              </Badge>
                            )}
                            <Badge className="bg-blue-600 text-white hover:bg-blue-700 text-[10px] sm:text-xs px-1 sm:px-2">
                              {station.votes} votes
                            </Badge>
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                            {station.lastCheckOk ? '✅' : '⚠'} <span className="hidden sm:inline">{station.lastCheckOk ? 'Source reports working' : 'Source reports offline'}</span>
                          </div>
                        </div>
                      </div>
                      {group.stations.indexOf(station) < group.stations.length - 1 && <Separator className="my-1" />}
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Empty State */}
      {duplicates && duplicates.duplicateGroups.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No Duplicates Found</h3>
            <p className="text-muted-foreground">
              No matching name-and-country candidate groups were found. This is not a guarantee that every station is unique.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={open => {
        if (isDeletingStations) return;
        setShowDeleteConfirm(open);
        if (!open) setPendingDeleteIds([]);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Stations?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {pendingDeleteIds.length} selected station(s)? Unlike merging, deletion does not
              combine favorites or listening history. This action cannot be undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingStations} data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={deleteSelectedStations}
              disabled={isDeletingStations}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {isDeletingStations ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManualStationMergeDialog review={mergeReview} isApplying={isApplyingMerge} error={mergeReviewError}
        identityConfirmed={identityConfirmed} onIdentityChange={setIdentityConfirmed}
        onConfirm={() => void confirmManualMerge()} onClose={() => setMergeReview(null)} />
    </div>
  );
}
