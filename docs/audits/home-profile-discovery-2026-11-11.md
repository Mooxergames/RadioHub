# Home — Kullanıcı Favorileri discovery

Existing API rules: publicly visible active users with at least one visible favorite station; ranked by most recent favorite activity, no photo requirement. The mobile Home formerly fetched ten and displayed the first six, including the current owner.

Changes: Home fetches a bounded forty-profile pool and uses an independent persistent per-viewer rotation (six phone/eight tablet). Own account, explicitly private/inactive records, empty favorites and duplicate IDs are excluded; avatar-free profiles remain eligible. Home focus, app restart and pull-to-refresh advance the local deck without adding per-focus network requests. API reorder alone does not reset progress. Background responses update current eligibility/metadata without arbitrarily moving cards. Query/disk caches distinguish profile limits. Profile links include the canonical slug and all supported avatar fields; pointer-down prefetch still shares the destination request/cache. All Users directory remains unchanged.

Live response: forty profiles; no declared-gender field is exposed. No gender was inferred from names/photos and no gender preference was implemented. The user's follow-up proposes optional self-declared gender and profile country in Account; these are separate from the browsing-country setting and have not yet been added by this change.

Validation: home-profile-discovery, home-profile-prefetch and home-query-performance tests pass. Cases include 36 distinct people over six visits, restart continuity, per-viewer isolation, a photo-free profile, owner/private/inactive/empty filtering, catalog reorder/removal and a small pool. No new TypeScript diagnostics.

## Follow-up: optional Account fields

The subsequent Account task added optional self-declared gender and country of residence, plus read-only admin user details. See `account-discovery-fields-2026-11-11.md`. This does not introduce gender inference or change the Home discovery ranking.
