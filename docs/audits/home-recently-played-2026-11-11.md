# Home — Son Çalınanlar audit

The existing layout stays unchanged (phone: six visible artworks, history bounded to twelve; shared grid loading state and cached-content behavior retained).

Findings and fixes in the active mobile frontend:
- Selection previously added unplayed/failed stations. The common player store now records history after confirmed `playing`, once per station session; buffering recovery, pause/resume and duplicate playing events do not create additional writes. Native main/fallback paths and player-screen effects no longer record separately. Web and native share the same store transition.
- Device history previously used one unowned storage key. Signed-in accounts now have separate keys and clear visible history on owner changes; legacy device history is guest-only. Late API responses cannot populate a different account.
- Slow local hydration could overwrite a new play, and uncoordinated writes could persist stale order. Hydration merges current records, cold writes wait for hydration, and writes are serialized.
- Home previously always preferred local order over newer server history. Shared merging uses playedAt descending, unique station IDs, validates stored records and caps history at twelve.
- Native audio initialization reads the shared local history instead of duplicating Home's authenticated recent-history API request.

Validation: recently-played.test.cjs covers actual store transitions, account switching, hydration races, late responses, persistence, newest-first merge, bounds and duplicate suppression. web-audio-toggle and home-query-performance also pass. TypeScript compared with the preceding baseline has no new diagnostics; the project still has unrelated existing diagnostics. No native-device end-to-end or FPS claim is made.
