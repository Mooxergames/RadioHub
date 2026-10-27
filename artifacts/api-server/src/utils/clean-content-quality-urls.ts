/**
 * Backfill migration for task #17 — Bing ContentQuality cleanup.
 *
 * Scans every Station and:
 *   1. Fills genuinely missing slugs. Published station URLs are stable;
 *      shortening a collision suffix can reassign a deleted station's URL
 *      to a different broadcaster when that suffix becomes available.
 *   2. Evaluates the central junk rules. If the station qualifies as junk,
 *      `noIndex: true` is set so the sitemap/SSR pipeline drops it.
 *   3. Writes a CSV audit report to `attached_assets/task-17-audit-report.csv`
 *      summarising what changed for each affected station.
 *
 * Idempotent: re-running the script only updates stations whose new state
 * differs from what's already on disk.
 *
 *   tsx scripts/clean-content-quality-urls.ts
 *   tsx scripts/clean-content-quality-urls.ts --dry-run
 */

import { getPostgresPool, closePostgres } from '../postgres-runtime';
import fs from 'fs/promises';
import path from 'path';
import { pgCatalog } from '../data/postgres-catalog-store';
import { assessDuplicateGroup } from './station-duplicate-policy';
import {
  slugifyStationName,
  evaluateJunkStation,
  getEligibleLanguages,
  getIndexableLanguagesForStation,
  frequencyPrefixBaseSlug,
  automaticNoIndexPatch,
  automaticNoIndexExpectedFilter,
} from '../seo/junk-station-rules';

const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_REPORT_PATH = path.join(
  process.cwd(),
  'attached_assets',
  'task-17-audit-report.csv',
);

export interface JunkCleanupOptions {
  /** When true, skip every DB write — only produce the audit CSV. */
  dryRun?: boolean;
  /** Where to write the audit CSV. Defaults to attached_assets/task-17-audit-report.csv. */
  reportPath?: string;
  /** When true, this function manages PostgreSQL connection cleanup. When false,
   *  the caller is expected to have already connected (e.g. the app server). */
  manageConnection?: boolean;
  /** Optional logger; defaults to console. */
  log?: (msg: string) => void;
  /** Scheduler fencing check; aborts promptly if the worker lost its PostgreSQL leadership connection. */
  assertOwned?: () => void;
}

export interface JunkCleanupResult {
  processed: number;
  slugRewrites: number;
  junkMarked: number;
  bothChanges: number;
  auditRows: number;
  reportPath: string;
  dryRun: boolean;
}

export async function runJunkCleanup(
  options: JunkCleanupOptions = {},
): Promise<JunkCleanupResult> {
  const dryRun = options.dryRun ?? DRY_RUN;
  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH;
  const manageConnection = options.manageConnection ?? false;
  const log = options.log ?? ((m: string) => console.log(m));

  if (manageConnection) {
    log(`[task-17] Connecting to PostgreSQL (dryRun=${dryRun})…`);
    await getPostgresPool().query('SELECT 1');
  }

  const totalStations = await pgCatalog().count();
  log(`[task-17] Scanning ${totalStations} stations (dryRun=${dryRun})`);

  const auditRows: string[] = [
    '"slug","name","country","action","reason","new_slug","eligible_languages"',
  ];

  let processed = 0;
  let slugRewrites = 0;
  let junkMarked = 0;
  let bothChanges = 0;

  // Stream via cursor — bounded memory for the whole collection.
  const cursor = pgCatalog().iterate({}, { batchSize: 500 });

  // Track in-memory uniqueness of the new slugs we hand out so we don't
  // accidentally collide two stations onto the same slug during the rewrite.
  const reservedSlugs = new Set<string>();

  for await (const station of cursor as any) {
    options.assertOwned?.();
    processed++;
    if (processed % 5000 === 0) {
      log(
        `[task-17] processed=${processed} slugRewrites=${slugRewrites} junkMarked=${junkMarked}`,
      );
    }

    const ops: Record<string, any> = {};
    const updateActions: string[] = [];
    const reasons: string[] = [];

    // ---- 1) Missing slug assignment ---------------------------------------
    const desired = slugifyStationName(station.name || '') || station.slug || '';
    const currentSlug: string = (station.slug || '').toString();

    if (desired && !currentSlug) {
      // Resolve collision by appending a -N counter against existing slugs.
      let candidate = desired;
      let counter = 1;
      // Prefer DB lookup for accuracy; cap iterations.
      // eslint-disable-next-line no-await-in-loop
      while (
        reservedSlugs.has(candidate) ||
        (await pgCatalog().findOne({
          slug: candidate,
          _id: { $ne: station._id },
        }))
      ) {
        candidate = `${desired}-${counter++}`;
        if (counter > 50) break; // safety
      }

      ops.slug = candidate;
      reservedSlugs.add(candidate);
      slugRewrites++;
      updateActions.push('slug-rewrite');
      reasons.push(`old=${currentSlug || '∅'} → new=${candidate}`);
    }

    // ---- 2) Junk evaluation -----------------------------------------------
    const verdict = evaluateJunkStation({
      name: station.name,
      slug: ops.slug ?? currentSlug,
      url: station.url,
      homepage: station.homepage,
      tags: station.tags,
      bitrate: station.bitrate,
      lastCheckOk: station.lastCheckOk,
      lastCheckOkTime: station.lastCheckOkTime,
      lastCheckTime: station.lastCheckTime,
    });

    // Sibling-aware duplicate detection: only mark `slug-N` records as junk
    // when the sibling also has the same broadcaster identity and an actual
    // shared stream. Slug collisions alone are not evidence of duplication.
    let dupeOfBase: string | null = null;
    const finalSlugForDupe = ops.slug ?? currentSlug;
    const dupeMatch = /^(.*)-(\d+)$/.exec(finalSlugForDupe || '');
    if (dupeMatch) {
      const baseSlug = dupeMatch[1];
      const counter = parseInt(dupeMatch[2], 10);
      // Only consider small counters typical of collision suffixes.
      if (counter > 0 && counter <= 10) {
        const sibling = await pgCatalog().findOne({
          slug: baseSlug,
          _id: { $ne: station._id },
        });
        if (sibling && getIndexableLanguagesForStation(sibling).includes('en') &&
            assessDuplicateGroup([station, sibling]).eligible) dupeOfBase = baseSlug;
      }
    }

    // Frequency-prefix sibling check: catches "1046-rtl-luxus-hits" when
    // "rtl-luxus-hits" already exists. Same noindex strategy as the -N suffix
    // branch above. Skipped if we already flagged the record as a -N dupe.
    if (!dupeOfBase) {
      const freqBase = frequencyPrefixBaseSlug(finalSlugForDupe || '');
      if (freqBase) {
        const sibling = await pgCatalog().findOne({
          slug: freqBase,
          _id: { $ne: station._id },
        });
        if (sibling && getIndexableLanguagesForStation(sibling).includes('en') &&
            assessDuplicateGroup([station, sibling]).eligible) dupeOfBase = freqBase;
      }
    }

    // Duplicates must never acquire health-only provenance that a later
    // successful stream check could reverse. Preserve manual/unknown flags.
    const policyVerdict = dupeOfBase ? { isJunk: true, reason: `duplicate-of:${dupeOfBase}` } : verdict;
    const policyPatch = automaticNoIndexPatch({ ...station, slug: ops.slug ?? currentSlug }, policyVerdict);
    Object.assign(ops, policyPatch);
    if (policyPatch.noIndex === true) {
      junkMarked++;
      updateActions.push('mark-noindex');
      reasons.push(`junk:${policyVerdict.reason}`);
    } else if (policyPatch.noIndex === false) {
      updateActions.push('clear-noindex');
      reasons.push('retired-owned-health-only-seo-exclusion');
    }

    if (Object.keys(ops).length === 0) continue;

    if (updateActions.includes('slug-rewrite') && (updateActions.includes('mark-noindex') || updateActions.includes('clear-noindex'))) {
      bothChanges++;
    }

    // ---- 3) Audit row ------------------------------------------------------
    const eligible = getEligibleLanguages(station).join('|');
    auditRows.push(
      [
        currentSlug,
        (station.name || '').replace(/"/g, "'"),
        station.country || '',
        updateActions.join('+'),
        reasons.join(' ; ').replace(/"/g, "'"),
        ops.slug ?? currentSlug,
        eligible,
      ]
        .map((v) => `"${v}"`)
        .join(','),
    );

    // ---- 4) Write -----------------------------------------------------------
    if (!dryRun) {
      options.assertOwned?.();
      await pgCatalog().update({ _id: station._id, ...automaticNoIndexExpectedFilter(station),
        ...(ops.slug !== undefined ? { slug: { $eq: station.slug ?? null } } : {}) }, { $set: ops }, { respectManualFields: true });
    }
  }

  options.assertOwned?.();
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, auditRows.join('\n'), 'utf8');

  log('[task-17] ──────────── summary ────────────');
  log(`[task-17] processed:         ${processed}`);
  log(`[task-17] slug rewrites:     ${slugRewrites}`);
  log(`[task-17] junk marked:       ${junkMarked}`);
  log(`[task-17] slug+junk both:    ${bothChanges}`);
  log(`[task-17] audit rows:        ${auditRows.length - 1}`);
  log(`[task-17] report:            ${reportPath}`);
  if (dryRun) log('[task-17] DRY RUN — no DB writes performed');

  if (manageConnection) {
    await closePostgres();
  }

  return {
    processed,
    slugRewrites,
    junkMarked,
    bothChanges,
    auditRows: auditRows.length - 1,
    reportPath,
    dryRun,
  };
}

// Allow legacy CLI invocation: `tsx scripts/clean-content-quality-urls.ts`
// Detects script-mode by comparing the entrypoint to this file. When imported
// from the cron processor it does NOT auto-run.
const isDirectInvocation =
  !!process.argv[1] && process.argv[1].endsWith('clean-content-quality-urls.ts');

if (isDirectInvocation) {
  runJunkCleanup({ manageConnection: true })
    .catch(async (err) => {
      console.error('[task-17] migration failed:', err);
      try {
        await closePostgres();
      } catch {}
      process.exit(1);
    });
}
