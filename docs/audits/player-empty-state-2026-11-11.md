# Empty player recovery

- Active mobile source: `app/player.tsx`. Replaced hardcoded English copy, legacy icon and blue Go Back button with localized text, existing SVG artwork and the SharedLinkState design values.
- Uniform #1B1C1E safe-area surface; black card, 6px corners and Mega pink action.
- Discover returns directly to /(tabs). Header back preserves normal history behavior.
- Review Home now targets an explicit home route and each selection creates a fresh iframe context.
- The reported Home-to-player transition could not be reproduced before the change. Its original cause remains unconfirmed. Home and the recovery action were verified in the browser after the change.
- Added a separate station-not-selected state to the playback review flow without changing user final marks or playback state.
- Preview JavaScript syntax checks passed. Mobile TypeScript diagnostics match the prior baseline; no new diagnostics.
