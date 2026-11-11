# Google login audit — 11 November 2026

## Scope and live checks

Read-only inspection of Google Auth Platform/Firebase, live web OAuth entry, main backend and the active mobile frontend (`megaradioIOSAndroidReact/frontend`). No production user was created, no Google account was selected in the consent/account chooser, and no deployment or native release was performed.

- Firebase project `megaradio-276c6` / project number `957628580421` matches native configuration.
- Google Auth Platform audience is External / In production.
- Live `themegaradio.com/api/auth/google` reaches Google's account chooser; client ends `1gj9mmbq20o9jva6olb28t2un6vb6jqh`, callback is `https://themegaradio.com/api/auth/google/callback`, scopes profile/email. No redirect URI error at entry. This is not a completed live callback test.
- Native SDK web client ends `ob14qeft7j83apkdjqfn48o3961qk7ti`, iOS client ends `664s6dft9n8kp91futrnpsugd4fcsonn`; these are registered clients and match bundled configuration. iOS bundle is `com.visiongo.megaradio`; Android package is `com.megaradio`.
- Cloud has a separate Android “MegaRadio Google Play” client, last used 9 November 2026, with release SHA-1 beginning CA:38:14:B6. Firebase general settings also has development SHA-1 beginning 5a:59:88:e0. Do not mistake the latter for proof that release OAuth is absent. Actual distributed binary/certificate compatibility still requires a device release test.

## Fixes

1. Native Google login permits only one pending SDK flow. Cancellation does not request cached tokens or create a backend session.
2. Application logout clears the Google SDK session without revoking consent, allowing account switching on next login. Logout keeps auth hydration complete so observers can clear user identity.
3. Session persistence errors now reject login, wait for both storage writes, remove partial state, and leave the app unauthenticated. Auxiliary favorite loading failures do not undo an otherwise stored session.
4. Removed an unused legacy mobile Google login method which submitted client-supplied profile fields to a different endpoint. Active login uses the verified ID-token endpoint.
5. Shared Google identity policy requires provider-verified email. Existing-account auto-linking permits Google-authoritative Gmail/Workspace addresses, rejects conflicting Google IDs, and avoids auto-linking a third-party mailbox to an existing password account without an account verification step. Existing matching Google subject IDs remain the primary lookup.
6. Web Google strategy now blocks inactive/suspended accounts, matching the mobile route. New users and updates use the shared PostgreSQL user store used by administration.
7. Removed token-prefix logging from the web Google callback.

## Validation

- 22 backend tests passed: signed JWT signature/audience/issuer/expiry and unverified-email rejection, shared account-link policy, actual Passport strategy with fixture persistence, OAuth callback/error/cancellation and return-path/TV pairing handling.
- 12 mobile tests passed: cancellation, SDK initialization and response handling, duplicate taps, provider logout, session save/restore/delete, secure-storage failure, plus existing Apple/email regressions.
- Backend TypeScript passes.
- Mobile TypeScript diagnostics were identical to `/tmp/mega-analytics-mobile-final3-tsc.log` (532 lines of pre-existing diagnostics); no diagnostics in changed auth modules. Whole mobile typecheck is not clean due to existing unrelated errors.
- Tests use mocked persistence/provider keys. They do not contact production PostgreSQL or claim to prove an admin record was written live.

## Remaining release verification

Deploy backend changes and build updated native apps before judging these fixes on production devices. Complete login, cancel, logout/account switch and relaunch on physical iOS and Google Play-signed Android; confirm the resulting user in administration with the same stable Google subject. Live callback/session-cookie completion and actual device certificate compatibility are not verified by the account chooser check alone.

## References

- Google backend verification and authoritative email policy: https://developers.google.com/identity/sign-in/web/backend-auth
- Native Google SDK APIs: https://react-native-google-signin.github.io/docs/original
