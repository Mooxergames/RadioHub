# Opening and authentication loading audit

Scope: active mobile React frontend, loading and readiness behavior. This is not a new OAuth-provider or backend login certification.

## Official references

- Apple Loading: https://developer.apple.com/design/human-interface-guidelines/loading
- Android splash lifecycle: https://developer.android.com/develop/ui/views/launch/splash-screen
- Expo SplashScreen: https://docs.expo.dev/versions/latest/sdk/splash-screen/
- Expo authentication startup: https://docs.expo.dev/router/advanced/authentication/
- Material progress indicators: https://m2.material.io/components/progress-indicators

These references recommend meaningful progress feedback, consistent indicators, and dismissing launch screens once the application is ready. Applying those principles here means using real local artwork/forms immediately; skeletons belong to unknown remote content, not the fixed login form.

| Flow | Treatment checked |
|---|---|
| Splash | Original branded artwork while local startup is pending; no skeleton. Native splash handoff remains intact. |
| Onboarding 1–3 | Bundled artwork, preloaded images, pre-mounted slides; no skeleton. Shared ring only while the local onboarding status is being checked. |
| Apple / Google / Facebook | Shared ring in the selected provider button while pending; all provider choices disabled until completion/cancellation. |
| Email login | Immediate form, shared submit ring, common inline error notice. |
| Signup | Immediate form, shared submit ring, common inline error notice. |
| Forgot password | Immediate form, shared submit ring and existing success/error states. |

## Corrections

- Removed the artificial three-second minimum from BrandSplash; the existing short fade is retained. The dedicated held splash review still remains on screen for visual review.
- Launch readiness now checks local fonts, country restore, authentication restore, initial routing and local translations. Remote language-list refresh does not block launch. Existing launch safety timeout is retained.
- Email login, signup, password reset and social entry now share a synchronous submission lock, preventing repeated calls before React can render the disabled state. Success and failure both release the lock.
- Pending submit/provider buttons expose disabled/busy accessibility state.
- Inactive pre-mounted onboarding slides are excluded from pointer input and accessibility; only the active slide can be used. Browser DOM verified inactive slides have aria-hidden=true.
- No skeletons added to fixed forms or onboarding.

## Verification

- All 32 local readiness combinations tested; only the fully-ready combination reveals the app.
- Duplicate submissions, completion, failure/retry and separate-form locks tested.
- Existing shared-loading audit passed: 48 ring consumers and 21 contextual consumers.
- TypeScript has no new semantic diagnostics compared with the existing baseline. The baseline still contains unrelated errors.
- Browser review checked auth options, email login, signup, reset form and onboarding rendering without submitting real account/email requests.
- Native iOS/Android launch timing still needs a release-build/device check. Expo documents that development/web previews cannot reproduce the full native splash lifecycle.
