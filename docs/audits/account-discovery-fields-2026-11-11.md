# Optional Account discovery fields — 2026-11-11

Account now offers optional, self-declared gender and country of residence. The existing Account rows, editor and shared country selector are reused. Labels cover all 14 app languages. Neither value is inferred from names or photos.

Fields are stored as `preferences.profileGender` and `preferences.profileCountryCode` through the existing authenticated profile endpoint. Sparse updates preserve other preferences. The client requires a matching account and confirmed saved response before updating its user state; failures and account switches cannot silently save into a different account. Country can be cleared. Profile country never changes the radio browsing country or requests location permission.

Admin Users' existing user dialog includes read-only declared gender and residence country. The admin list endpoint projects only these validated fields, not the entire preferences object. No database migration is required because preferences already use JSONB. These admin/API code changes require the normal release before they appear in the live admin; no deployment was performed during this task. The existing live profile endpoint accepts preference patches.

Validation: 18 API tests passed, including owner round-trip, invalid values, preservation and admin projection. Mobile profile preference tests and 22 nearby discovery cases passed. Admin TypeScript check passed. Mobile TypeScript diagnostics contain no new errors relative to the existing baseline.

Figma inspection was attempted but blocked by the connected Starter plan's tool limit; existing Account styling was retained. Preview: `output/account-discovery/account-fields.jpg`.
