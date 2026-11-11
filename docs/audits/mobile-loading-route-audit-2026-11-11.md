# Mobile loading and route audit — 2026-11-11

Scope: active iOS/Android React frontend and the localhost mobile review catalogue. Main web/TV apps were not modified.

## Loading

- Shared-ring audit: 48 consumers. Contextual loading audit: 21 consumers. No independent native ActivityIndicator imports in active UI.
- Shared motion test: 40 skeletons share one shimmer clock, rings a second clock; one accessibility/background listener pair. Background/reduced-motion changes stop animation and cleanup removes listeners.
- Notification cache test: deduplicated requests, warm-cache revisit, refresh after invalidation, account isolation and request cancellation passed.
- Loading review now covers all 13 MegaLoadingState layouts, adding genre-strip and user-cards. FlatList mounts a window of examples instead of the whole long gallery.
- The chat-preview user profile now uses the same station-list skeleton as real user profiles.
- The review-only back arrow now uses the existing SVG and has a home fallback for direct entry.

## Route coverage

The table lists every screen file in app/, excluding layouts and platform routing handlers. A file not referenced by a literal navigation string is not automatically dead: dynamic panels, deep links and redirects were checked separately.

| Source | State | Review coverage / handling |
|---|---|---|
| `app/(tabs)/favorites.tsx` | Active | Favoriler, Favoriler · arama, Favoriler · sıralama, Favoriler · boş |
| `app/(tabs)/genres.tsx` | Active | Müzik türleri |
| `app/(tabs)/index.tsx` | Active | Home |
| `app/(tabs)/profile.tsx` | Active | Profil, Profil fotoğrafı · eğitim, Fotoğraf yükleniyor, Fotoğraf güncellendi, Fotoğraf yükleme hatası, Takipçiler, Takip edilenler, Profil paylaş, Hesap, E-posta değiştir, Şifre değiştir, Telefon bildirimi tercihi, Gizli profil bildirimi, Açık profil bildirimi, Bizi değerlendir, Çıkış onayı, Hesap silme onayı, Telefon bildirimi kapalı · kısa mesaj |
| `app/(tabs)/records.tsx` | Retired | Discover redirect; legacy interface removed in this audit. |
| `app/all-stations.tsx` | Active | Tüm istasyonlar |
| `app/auth-options.tsx` | Active | Giriş seçenekleri |
| `app/followers.tsx` | Alias | Profile followers panel; represented by Followers in review. |
| `app/follows.tsx` | Alias | Profile following panel; represented by Following in review. |
| `app/forgot-password.tsx` | Active | Şifremi unuttum |
| `app/genre-detail.tsx` | Active | Tür içindeki radyolar |
| `app/group-chat.tsx` | Active | Grup sohbeti, Grup daveti |
| `app/group-new.tsx` | Active | Yeni grup · katılımcılar, Yeni grup · Grup bilgileri |
| `app/languages.tsx` | Active | Dil |
| `app/link-error.tsx` | Active | Geçersiz paylaşım bağlantısı |
| `app/loading-preview.tsx` | Review only | Yükleme durumları · ortak sistem |
| `app/login.tsx` | Active | E-posta ile giriş |
| `app/messages.tsx` | Active | Konuşmalar, Birebir sohbet |
| `app/notifications.tsx` | Active | Bildirim merkezi |
| `app/onboarding.tsx` | Active | Onboarding · 1, Onboarding · 2, Onboarding · 3 |
| `app/open-link.tsx` | Active | Paylaşılan içerik açılamıyor |
| `app/play-at-login.tsx` | Active | Girişte çal |
| `app/player.tsx` | Active | Radyo çalma, İstasyon seçilmemiş, Car mode, Uyku zamanlayıcısı, Diğer işlemler, Ekran kilidi, Radyo paylaş, Çalmayan radyo, Çevrimdışı, Premium |
| `app/public-profiles.tsx` | Alias | Redirects to the renewed users directory. |
| `app/remove-ads.tsx` | Active | Reklamları kaldır |
| `app/search.tsx` | Active | Arama |
| `app/signup.tsx` | Active | Kayıt ol |
| `app/song-history.tsx` | Retired | Profile redirect; unused legacy screen implementation removed. |
| `app/splash-preview.tsx` | Review only | Splash, Açılış akışı |
| `app/static-page.tsx` | Active | Hakkımızda, Gizlilik politikası, Kullanım koşulları |
| `app/station-country.tsx` | Active | Ülke |
| `app/statistics.tsx` | Active | İstatistikler |
| `app/user-profile.tsx` | Active | Kullanıcı profili |
| `app/users.tsx` | Active | Kullanıcılar · yenilenen liste |

- `+not-found.tsx`: unmatched screen addresses recover to Discover.
- `+native-intent.tsx`: incoming-link routing bridge, not a product screen.
- Records was hidden in the tab bar but its legacy interface was still directly routable. It now redirects to Discover.
- Song-history already redirected to Profile; its unused exported UI was removed while preserving that route.
- public-profiles, followers and follows are compatibility aliases and remain intact.
- Loading and splash preview routes are development-web-only; production entry redirects.
- No other unrepresented product screen route was found in this audit. This does not assert that every unimported utility/component in the repository is unused.
- User final review marks were not changed.

## Verification

- All 34 screen source files mapped; review catalogue contains 69 entries (including modal/state variants).
- Browser: Records direct entry returned to Discover; song-history direct entry returned to Profile. Loading gallery scrolled through inbox, notification, conversation, country, statistics and text states.
- Three existing loading/motion/cache checks passed. TypeScript diagnostics unchanged from baseline (no new errors; existing repository errors remain).
