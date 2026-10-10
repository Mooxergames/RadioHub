# Mega Radio — Figma tasarım çalışma notları

## Başlangıç

- İnceleme tarihi: 5 Ekim 2026.
- Kaynak: https://github.com/mumiix58/RadioHub
- Başlangıç commit'i: `add2ba492dd2eb450a706fcb8440dba6262cbbbd` (`origin/main`).
- Tasarım branch'i: `codex/design` (yerel).
- Hedef: Kullanıcının seçtiği sayfaları Mega Radio Figma tasarımıyla karşılaştırıp
  farkları mevcut web uygulamasına aşamalı olarak uygulamak.
- Figma dosyası: [Mega Radio](https://www.figma.com/design/Jf3ZOklsARouzh5Mop0rRz/Mega-Radio?node-id=2035-6194).
  İlk sayfa favoriler; uygulanan kapsam aşağıdaki çalışma kaydında açıklanıyor.
  Sonraki sayfaların sırasını kullanıcı belirleyecek.

## Güncel yapı

Proje bir pnpm monoreposudur. Ana arayüz `artifacts/megaradio` içinde React 19.1,
TypeScript, Vite 7, Tailwind CSS 3, Wouter ve TanStack Query 5 kullanır. Radix UI
primitifleri, Lucide ikonları ve bazı Heroicons bileşenleri vardır.

API, `artifacts/api-server` içindeki Express 5 uygulamasıdır. Güncel
`src/index-api.ts`, `src/postgres-runtime.ts` ve `scripts/start-postgres.mjs`
PostgreSQL kullanır. Eski `CLAUDE.md` / `replit.md` belgelerindeki MongoDB'nin ana
veritabanı olduğu bilgisi bu commit için güncel değildir.

`lib/db-shared` ortak tipleri/şemaları, `lib/seo-shared` yerelleştirilmiş SEO ve
URL yardımcılarını, `lib/api-client-react` API istemcisini içerir. Investor deck
ve mockup sandbox ayrı uygulamalardır.

## Ekran ve dosya haritası

Aşağıdaki yollar `artifacts/megaradio/src` klasörüne göredir. URL'ler İngilizce
kanonik örneklerdir; dil önekleri ve çevrilmiş yollar `useSeoRouting` ile çözülür.

| Ekran | URL örneği | Temel dosya |
| --- | --- | --- |
| Ana sayfa | `/` | `pages/radio-frontend.tsx` |
| Radyo listesi | `/radios`, `/stations` | `pages/radios.tsx` |
| Radyo detayı | `/station/:slug` | `pages/stations/[id].tsx` |
| Arama | `/search` | `pages/search.tsx` |
| Türler | `/genres` | `pages/genres.tsx` |
| Tür açılışı / detayı | `/genres/:slug` ve alt yollar | `pages/genres/genre-landing.tsx`, `pages/genres/[slug].tsx` |
| Bölgeler / ülkeler / şehirler | `/regions` ve alt yollar | `pages/RegionsPage.tsx`, `RegionCountriesPage.tsx`, `CountryCitiesPage.tsx`, `RegionStationsPage.tsx` |
| Öneriler / trendler | `/recommendations`, `/trending` | `pages/recommendations.tsx`, `pages/TrendingStations.tsx` |
| Giriş / kayıt | `/login`, `/signup` | `pages/login.tsx`, `pages/signup.tsx` |
| Alternatif auth ekranları | `/auth/login`, `/auth/signup` | `pages/auth/login.tsx`, `pages/auth/signup.tsx` |
| Profil | `/profile` | `pages/profile.tsx`, `components/layout/ProfileLayout.tsx` |
| Favoriler / keşfet | `/profile/favorites`, `/profile/discover` | `pages/favorites.tsx`, `pages/profile-discover.tsx` |
| Profil ayarları / bildirimler | `/profile/settings`, `/profile/notifications` | `pages/profile-settings.tsx`, `pages/notifications-view.tsx` |
| Mesajlar | `/profile/messages` | `pages/messages.tsx` |
| Topluluk / kullanıcı | `/users`, `/users/:id` | `pages/users/index.tsx`, `pages/UserProfile.tsx` |
| Premium | `/premium` | `pages/premium.tsx` |
| Bilgi sayfaları | `/about`, `/contact`, `/applications`, `/faq` | İlgili `pages/*.tsx` dosyaları |

Benzer isimli eski/alternatif ekranlar bulunduğundan dosya seçerken önce
`App.tsx` içindeki `renderByCleanPath` ve lazy import eşleşmesini kontrol et.

## Paylaşılan tasarım alanları

| Alan | Dosyalar (`artifacts/megaradio` altında) |
| --- | --- |
| Üst menü / marka | `src/components/layout/radio-header.tsx`, `header-brand.tsx`, `header-brand.css` |
| Mobil gezinme / hızlı arama | `src/components/layout/mobile-navigation.tsx`, `quick-search-dialog.tsx`, `quick-search-dialog.css` |
| Alt bölüm | `src/components/layout/footer.tsx` |
| Radyo kartı / logo / ızgara | `src/components/ui/station-card.tsx`, `station-logo.tsx`, `stations-grid.tsx` |
| Ana sayfa başlığı ve görseli | `src/components/HomeHeroCopy.tsx`, `HomeHeroPicture.tsx` |
| Global oynatıcı | `src/components/global-player.tsx`, `src/hooks/useGlobalPlayer.tsx`, `useGlobalPlayer.shell.tsx`, `LazyGlobalPlayerProvider.tsx` |
| Tema / tipografi | `src/index.css`, `tailwind.config.ts`, `src/lib/theme-provider.tsx` |
| Statik varlıklar | `public/fonts`, `public/icons`, `public/images`, repo kökündeki `attached_assets` |

Kodda görülen mevcut görsel temel: Ubuntu, pembe vurgu `#FF4199`, koyu yüzey
`#0E0E0E`. Tailwind container ayarlarında 1512 px ve geniş ekranlarda 153 px yatay
padding referansı var. Bunlar mevcut uygulamanın değerleridir; güncel Figma
tasarımının doğrulanmış ölçüleri olarak kabul edilmemelidir. Bazı stiller global
CSS, bazıları sayfa içi Tailwind sınıflarında bulunduğundan ikisini birlikte incele.

## Yerel çalışma

Node.js 24 ve pnpm ile, repo kökünden:

```sh
pnpm install --frozen-lockfile
PORT=22507 BASE_PATH=/ pnpm --filter @workspace/megaradio run dev
```

Vite adresi: `http://localhost:22507`. Bu yalnızca frontend sunucusudur.
Mevcut Vite config'inde `/api` proxy'si yoktur. Repo geliştirme düzeninde ayrı
reverse proxy, `/api` isteklerini backend'e yönlendirir. Ortak API yardımcıları
`VITE_API_BASE_URL` destekler; kaynakta doğrudan `/api` fetch çağrıları da vardır,
bu yüzden bu değişken tek başına bütün ekranların bağlantısını garanti etmez.

Tam veriyle çalışmak için geliştirme API'si ve PostgreSQL kurulumu gerekir.
API başlangıç betiği şema migrasyonlarını uyguladığından veri kaynağı belirlenmeden
çalıştırılmamalıdır. Bu hazırlık sırasında API/veritabanı başlatılmadı.

Mac'te ilk build, `@rollup/rollup-darwin-arm64` bulunamadığı için durdu.
`pnpm-workspace.yaml` içindeki esbuild, Rollup, Lightning CSS ve Tailwind Oxide
Darwin hariç tutmaları kaldırıldı; lockfile aynı sürümlerin macOS bağımlılıklarını
içerecek şekilde yenilendi. Linux ve Windows destekleri korundu.

## Hazırlık doğrulaması

5 Ekim 2026, Node.js 24.19.0 / pnpm 11.19.0 / macOS arm64:

- `pnpm install --frozen-lockfile`: başarılı; güncellenmiş lockfile ile tekrar doğrulandı.
- `pnpm run typecheck:libs`: başarılı.
- `pnpm --filter @workspace/megaradio run typecheck`: başarılı.
- Frontend production build: başarılı. Mevcut büyük chunk uyarıları devam ediyor.
- Frontend Vitest: 139 test dosyası, 2.010 test başarılı.
- Vite geliştirme sunucusu: başlangıç başarılı; `/` ve `/src/main.tsx` HTTP 200.
- Tam API/veritabanı entegrasyonu ve tarayıcıda Figma karşılaştırması yapılmadı.
- Backend testleri ve bütün workspace build'i bu hazırlığın doğrulamasına dahil değil.
- Branch ve hazırlık değişiklikleri yereldir; commit/push/PR oluşturulmadı.

## Her sayfa için izlenecek kayıt

- Figma bağlantısı ve frame/node kimliği.
- Uygulama URL'si, dil, ekran genişliği ve oturum/veri durumu.
- Tespit edilen farklar ve değiştirilen dosyalar.
- Masaüstü/mobil karşılaştırma sonucu ve çalıştırılan ilgili testler.
- Kalan farklar veya gerçekten eksik bağımlılıklar.

## 5 Ekim 2026 — Profil / Favoriler

- Referans: Web / `your-favorites` (`2035:6194`), ortak profil shell'i
  `2035:9624`; mesaj ikonu `1339:6118`.
- Ekran: `/tr/profil/favoriler`, giriş yapılmış kullanıcı.
- Kullanıcı kapsamı: sol profil menü ikonları ve seçili ikon rengi, sol logo
  hizası, breadcrumb'ın Favorileriniz başlığıyla hizası.
- Figma Vuesax bold ikonları `public/icons/profile/` altına orijinal SVG olarak
  alındı. 24 px maskeler ikon rengini uyguluyor; yalnız aktif menü ikonu
  `#FF4199`, diğerleri beyaz. Seçili satırın gri arka planı korundu.
- Figma'da Records olan menü yerine uygulamadaki Mesajlar işlevi korundu ve
  Figma dosyasının mesaj ikonu kullanıldı. Yeni kayıt özelliği eklenmedi.
- Masaüstü profil header'ı tam genişlikte, logo soldan 30 px. Sidebar 250 px;
  breadcrumb ve içerik aynı inset'i kullanıyor (250 + 30 = 280 px).
  Oynatıcının profil sidebar'ı için görsel offset'i de 250 px'e uyarlandı.
- 1512 px genişlikte DOM ölçümü: logo x=30, breadcrumb x=280, başlık x=280.
  Seçili ikon `rgb(255, 65, 153)`, diğer beş ikon beyaz, ikon slotları 24×24 px.
- 390 px mobil kontrolde breadcrumb ve başlık x=8; yatay taşma yok.
- Figma'daki diğer header menü öğeleri, logo boyutu, radyo kartları ve
  oynatıcı içeriği bu talebin dışında bırakıldı.
- Görsel inceleme için `.local/profile-preview.config.mts` gerçek uygulamayı
  salt okunur örnek API yanıtlarıyla başlatır. Üretim build'ine dahil değildir;
  gerçek kullanıcı oturumu veya veritabanı kullanmaz. Yeniden başlatma:

```sh
PORT=22508 BASE_PATH=/ pnpm --filter @workspace/megaradio exec vite --config ../../.local/profile-preview.config.mts
```

Önizleme: `http://127.0.0.1:22508/tr/profil/favoriler`. Örnek hesap ve radyo
isimleri kullanır. Standart geliştirme sunucusu 22507 portunda ayrı kalır.
Ekran görüntüleri `.local/design-checks/profile-desktop.jpg` ve
`.local/design-checks/profile-mobile.jpg` içinde tutulur.

Doğrulama: frontend TypeScript kontrolü, production build ve 139 dosyadaki
2.010 test başarılı. Masaüstü/mobil görsel kontrol örnek API verileriyle yapıldı;
gerçek hesap işlemleri ve yayın oynatma bu tasarım kontrolünde denenmedi.

### Tarayıcı yorumları — logo yazısı ve başlık sırası

- Figma wordmark referansı: `2035:9858`. Profil header'ında 1024 px ve üzerinde
  `megaradio` yazısı görünür; Ubuntu 20.384 px, mega 700 / radio 400 ağırlığında,
  ikon ile yazı arasında 11 px boşluk kullanılır.
- Favoriler başlığı, adet ve sıralama aynı üst satıra alındı. Breadcrumb bu
  satırın 8 px altında, başlıkla aynı sol hizada gösterilir. App seviyesindeki
  breadcrumb bu sayfa için kaldırıldı; diğer sayfalardaki konumu korunur.
- İçeriğin üst boşluğu 20 px, adet rozeti 32 px, breadcrumb sonrası boşluk
  20 px olarak sıkılaştırıldı.
- 1218 px genişlikte başlık y=110, breadcrumb y=150; ikisi de x=280.
  1512 px genişlikte logo x=30, başlık ve breadcrumb x=280. 390 px mobilde
  başlık ve breadcrumb x=8; üç genişlikte de yatay taşma yok.
- Sıralama menüsünün açılması ve seçim değişimi örnek verili önizlemede
  doğrulandı. Kontrol sonunda başlangıç seçimine dönüldü.
- TypeScript kontrolü, production build ve 139 dosyadaki 2.010 test başarılı.
  Mevcut build chunk boyutu uyarıları sürüyor.
- Ekran görüntüleri: `.local/design-checks/profile-comments-final.jpg` ve
  `.local/design-checks/profile-comments-mobile.jpg`.

## 6 Ekim 2026 — Profil / Keşfet

- Figma referansı: Web / `discover` (`2035:8058`), başlık `2035:8319`.
  Başlık Ubuntu Bold 24 px, 28 px satır yüksekliği; masaüstü sol hizası 280 px.
- Kullanıcının istediği sıra: günün saatine göre karşılama, Keşfet başlığı,
  breadcrumb. Breadcrumb sayfa içeriğine taşındı; App seviyesindeki kopyası
  kaldırıldı. Favoriler ile aynı 20 px üst boşluk kullanılıyor.
- Figma'da bulunmayan mevcut "Beni şaşırt" eylemi, kullanıcının son geri
  bildirimiyle çerçevesiz metin ve küçük analog radyo kadranı olarak tasarlandı.
  Yaklaşık 107×36 px kontrolün 28 px kadranında tek pembe ibre bulunuyor;
  hover/klavye odağında dönüyor, seçim sırasında tarama hareketi yapıyor.
  Mobilde de Keşfet başlığının yanında. İşlev açıklaması title ve erişilebilir
  açıklamada mevcut; metin ve ölçü sabit. İstasyon seçme/oynatma akışı korundu.
- Gün mesajı ve eylem metinleri 14 dil için yerel fallback içeriyor; mevcut
  dilin özel çevirileri öncelikli. Türkçe ekranda İngilizce gün mesajı önlendi.
- Masaüstünde gün mesajı, başlık ve breadcrumb aynı x=280 sol hizasında.
  390 px mobilde buton 107×36 px ve başlıkla aynı satırda. Yatay taşma yok.
  Klavye odağı 2 px pembe dış çizgiyle görünür; görünür 36 px butonun
  dokunma alanı 44 px yüksekliğe genişletildi. Kadran hareketi azaltılmış
  hareket tercihine saygı gösteriyor.
- TypeScript, frontend build ve 139 dosyadaki 2.010 test başarılı. Mevcut
  build sourcemap/chunk uyarıları devam ediyor. Görsel kontrol yalnız yerel,
  örnek API verileriyle yapıldı; bu değişiklik henüz yayımlanmadı.
- Önizleme: `http://127.0.0.1:22508/tr/profil/ke%C5%9Ffet`.
  Ekran görüntüleri: `.local/design-checks/discover-desktop.jpg` ve
  `.local/design-checks/discover-mobile.jpg`. Kompakt revizyonun görselleri
  `discover-compact-desktop.jpg` ve `discover-compact-mobile.jpg`; bu revizyon
  TypeScript ve masaüstü/mobil görsel kontrolle doğrulandı.

- Son kadran denemesi: `discover-tuner-desktop.jpg` ve
  `discover-tuner-mobile.jpg`. TypeScript, klavye odağı ve mobil taşma
  kontrolü başarılı; henüz canlıya yayımlanmadı.

## 7 Ekim 2026 — Ana sayfa / header araması

- Ana sayfadaki header merceği ve Ctrl+K / Cmd+K, mevcut hero aramasını
  doğrudan sonuçları açık ve yazmaya odaklanmış durumda açar. Boş sorguda,
  ana sayfa için yüklenen popüler istasyonların ilk altısı gösterilir;
  iki karakterden itibaren mevcut arama servisi kullanılır.
- Hero alanına doğrudan tıklama davranışı korunur: yazmaya başlamadan
  sonuç listesi açılmaz. Diğer sayfalarda header'ın mevcut arama penceresi
  kullanılır; hero henüz yüklenmemişse aynı pencereye geri dönülür.
- Escape, kapatma düğmesi ve dış alan tıklaması aramayı kapatır ve odağı
  açan kontrole döndürür. Ok tuşları ve Enter ile istasyon seçilebilir.
  Temizlenen sorgunun gecikmiş yanıtları iptal edilerek sonuçlara karışması
  önlendi. Mobilde açık arama ekranın üstünden 16 px boşluk bırakır;
  sonuç listesinin yüksekliği görünür ekranla sınırlandırılır.
- TypeScript kontrolü, production build ve 140 dosyadaki 2.021 test başarılı.
  Ana sayfa/header arama davranışlarını doğrulayan 11 entegrasyon testi eklendi.
  Masaüstünde fare, Ctrl+K, yazıp sonuç alma ve kapatma; 390 px mobilde
  açık sonuçlar, giriş odağı ve yatay taşma yerel tarayıcıda doğrulandı.
- Önizleme: `http://127.0.0.1:22508/tr`. Ekran görüntüleri:
  `.local/design-checks/home-header-search-desktop.jpg` ve
  `.local/design-checks/home-header-search-mobile.jpg`.
  Önizleme örnek API verileri kullanır; bu değişiklik henüz yayımlanmadı.

## 10 Ekim 2026 — Arama panelinin Figma eşleştirmesi

- Referans: Web / home (`1711:5258`), açık arama instance'ı `1711:7199`,
  `search` varyantı `591:4887`. Figma tasarım bağlamı ve görseli incelendi.
- Panel 614×393 px, 20 px köşe, 2 px beyaz kenarlık, tek katman %20 beyaz
  dolgu ve 10,5 px arka plan bulanıklığı kullanır. Tam sayfa karartma/bulanıklık,
  sonuç satırlarının ayraçları ve ek dolgu katmanları kaldırıldı. Panelin
  açılması hero başlığını veya arama girişini yukarı kaydırmaz.
- Figma'nın 24 px mercek ve daire içindeki kapatma ikonları ile 615×2 px
  ayırıcı SVG'si `public/icons/home-search/` altında yerel olarak saklandı.
  Giriş ve istasyon adı 20 px Ubuntu Medium; sayaç 14 px, %50 beyaz.
  Dinamik istasyon görselleri, ülke adı/bayrağı ve beğeni sayısı korunur.
- Mevcut Radix ScrollArea bileşeni kullanıldı. 263 px sonuç alanında
  taşma olduğunda 10 px beyaz ray ve gri sürüklenebilir tutamak kalıcı
  görünür; fare ayrıldığında kaybolmaz. Kaydırma panel içinde kalır.
- Masaüstünde boyut, cam değerleri ve yerel SVG'lerin yüklenmesi doğrulandı.
  Kaydırma çubuğunu sürüklemek listeyi 121 px kaydırırken sayfa y=0 kaldı.
  X ile kapatma ve Ctrl+K ile yeniden açma çalışıyor. 390 px mobilde panel
  x=16, y=16, genişlik=358 px; yatay taşma yok, giriş odağı korunuyor.
- Önizleme örnek API verileriyle `http://127.0.0.1:22508/tr` adresinde.
  Bu görsel düzenleme henüz canlıya yayımlanmadı.
- Son kullanıcı tercihi: yalnız sonuç sayacı canlı sürümdeki tamamlayıcı
  şerit görünümüne döndürüldü: %20 beyaz dolgu, ince alt ayraç,
  12 px beyaz büyük harfli metin. Diğer Figma düzenlemeleri korundu.

## 10 Ekim 2026 — Web ve mobil alt-player

- Figma'nın iki ayrı `alt-player` bileşeni doğrudan incelendi: web
  `856:2842` (1512×110), mobil `1711:10123` (375×104). Canlı ana sayfada
  oynatıcı açılarak mevcut görünümle karşılaştırıldı; inceleme sonunda yayın durduruldu.
- Mini oynatıcıda önceki/sonraki, duraklatma, kalp, ses ve müzik servisi ikonları
  Figma SVG'leriyle eşleştirildi (`public/icons/mini-player/`). Dinamik radyo
  logosu ve bayrak, mevcut oy verme/paylaşma işlemleri ve küçültme oku korundu.
- Radyo adı Ubuntu Medium 15 px, şarkı Ubuntu Light 14 px. Eksik 300 ağırlığı
  Google Fonts'un Ubuntu Light dosyası ve Ubuntu Font Licence ile yerel eklendi.
  Şarkı satırı webde en fazla 200 px, mobilde 174 px; tam metin title niteliğinde.
- Web yükseklik 110 px, mobil 104 px; mobil kenar boşluğu 16 px ve üst boşluk
  12 px. Ok ayrı bir alanda hizalanır. Mobil güvenli alt alan hesaba katılır.
  Container query, profil yan menüsünden kalan alanı da dikkate alır.
- Ses göstergesi sabit %43 yerine oynatıcıdaki gerçek volume değerini kullanır;
  değişiklik doğrudan sağlayıcının setVolume işlevinden geçer.
- TypeScript ve production build başarılı. Mevcut 140 dosya/2.021 test geçti;
  ardından ses, küçültme, tam metin ve ortak kontrol davranışı için eklenen
  dört regresyon dahil ilgili iki dosyada 56 test geçti.
- Tarayıcıda 320/375 px mobil, 800 px web, 1280 px profil alanı ve 1512 px web
  kontrol edildi: yatay taşma yok, SVG ölçüleri korunuyor, metinler kontrollere
  taşmıyor; küçült/aç, durdur/çal ve klavyeden ses ayarı çalışıyor.
- Yerel ve sessiz oynatma fixture'ı: `http://127.0.0.1:22508/tr?player-preview=1`.
  Önizleme giriş noktası ve örnek veriler yalnız `.local/` altında; üretim
  paketine dahil değildir. Bu değişiklikler henüz canlıya yayımlanmadı.
  Görseller: `.local/design-checks/mini-player-desktop.png`,
  `.local/design-checks/mini-player-mobile.png`.
- Yayın öncesi kullanıcı tercihi: şarkı metninin yeni 200/174 px sınırları ve
  metadata alanının ek genişlik kısıtı kaldırıldı. Metin kullanılabilir alanı
  doldurur; yalnız kontrollere taşmasını önleyen doğal ellipsis korunur.
  Önceki Keşfet, header/hero arama ve alt-player güncellemeleriyle birlikte
  yayın talep edildi. 140 dosyada 2.025 test, TypeScript ve build geçti.

## 10 Ekim 2026 — Yayın sonrası mini player ayrıntıları

- Önceki tasarım paketi PR #106 / `7bbb45b5f` ile yayımlandı. Bu bölümdeki
  son düzenlemeler kullanıcı isteğiyle canlıya alınacak ek düzeltmelerdir.
- Kullanıcının Chrome'unda 1512 px genişlikte Power POP ile karşılaştırıldı.
  Kısa şarkı metninin `flex-grow` davranışı servis ikonlarını gereksiz yere
  sağa itiyordu. Metin doğal genişliğini kullanır; ikonlar 12 px ardından
  gelir. Uzun metin için sabit bir genişlik sınırı eklenmedi.
- Web `856:2842` ve mobil `1711:10123` tasarım bağlamları yeniden alındı.
  Figma'nın %85 siyah altlığı Web sayfasındaki `#e5e5e5` tuval üzerinde
  yaklaşık `#222` görünür. Koyu web zemininin aynı görünümü vermesi için
  altlık `rgb(38 38 38 / 85%)` olarak ayarlandı; 6 px CSS arka plan blur'u
  korundu. Siyah kontrol yüzeyleri böylece ayırt edilir.
- Masaüstü kontrol aralığı 20'den 12 px'e, ses grubu aralığı 19'dan 16 px'e
  indi. 1512 px genişlikte kontrol grubunun başlangıcı x=698'den x=733'e
  taşındı. Dar alan/mobil aralıkları CSS değişkeniyle 10/6 px kalır.
- TypeScript, production build ve ilgili 56 test geçti. Chrome'da kısa/uzun
  metin, 320/375/800/1512 px genişlikler, SVG ölçüleri ve küçült/aç kontrolü
  doğrulandı; yatay taşma veya kontrollerle çakışma yok.
- Kısa metin önizlemesi: `http://127.0.0.1:22508/tr?player-preview=1&short-title=1`.
  Örnek metadata yalnız `.local/mini-player-preview.tsx` içindedir.

## 10 Ekim 2026 — Ana sayfa kayıt alanı ve footer ayrıntıları

- Figma Web ana sayfa `1711:5258`, kayıt alanı `1711:7192`, footer
  `1711:7200` ve mobil footer `2392:9506` güncel tasarımdan incelendi.
- Kayıt alanının eksik kişi görseli Figma'dan yerel dosyaya alındı.
  1206×298 px masaüstü ölçüsü, yeşil/mavi geçiş, 20 px köşeler, gölge,
  Ubuntu tipografi ve görselin darken karışımı eşleştirildi. Mobilde metin
  ve kayıt düğmesini kapatmayan duyarlı bir yerleşim uygulandı.
- Facebook, Instagram ve Twitter Figma SVG'leri özgün 48×48 ölçüleriyle
  `public/icons/footer/` altında tutulur. Aktif platformlar ve adresler
  mevcut API'den gelir; YouTube gibi ek platformlar korunur. MXRTOKEN
  bağlantısı kaldırıldı.
- Dil seçicinin küre ikonu yerine etkin dilin kodunu gösteren küçük bir
  rozet, daha belirgin grafit yüzey ve kısa açılış animasyonu eklendi.
  Arama, Escape/odak dönüşü, dil yönlendirmesi ve reduced-motion korundu.
- TypeScript, production build ve footer/dil geçişine ait dört dosyada
  57 test başarılı. 320/375 px mobil, 768 px tablet ve 1512 px masaüstü
  görünümleri kontrol edildi; yatay taşma yok.
- İzole yerel önizleme: `http://127.0.0.1:22508/tr?footer-preview=1`.
  Fixture yalnız `.local/` içindedir. Bu bölümün değişiklikleri henüz
  canlıya yayımlanmadı.

## 10 Ekim 2026 — Arama sonucu satırları ve kaydırma alanı

- Kullanıcının canlı arama ekranındaki yorumu üzerine `591:4887` yeniden
  incelendi. Mevcut sayaç şeridi, cam yüzey, ülke/bayrak ve beğeni bilgileri korundu.
- Listenin 23 px yan ve 28 px alt dış boşlukları kaldırıldı; satır içeriğine
  yatay/dikey padding verildi. Fare ve klavye vurgusu artık tüm satırı kaplar.
  Sonuç alanı panelin alt köşesine kadar uzanır.
- Kaydırma rayı sağdan 10 px, üstten/alttan 16 px içeride; beğeni sayısı için
  ayrı boşluk bırakılır. Radix içerik tablosunun uzun adlarla listeyi genişletmesi
  engellendi; metin doğal ellipsis kullanır.
- 1431 px masaüstü, 375/320 px mobilde 20 sonuç, uzun radyo adı, ilk/son
  satıra klavyeyle geçiş kontrol edildi. Yalnız sonuç listesi kaydı; sayfa y=0
  kaldı ve yatay taşma görülmedi. İlgili 29 arama testi ve production build geçti.
- Görseller `.local/design-checks/search-layout-desktop.png` ve
  `search-layout-mobile.png`; önizleme verileri yalnız `.local/` içindedir.
  Bu düzeltme henüz canlıya yayımlanmadı.
- Takip yorumu sonrası 16 px üst/alt boşluk kaydırılan içeriğin dışına
  taşındı: sayaç şeridine göre sabit kalır. 320 px sonuç alanında dört adet
  72 px satır tam görünür. Masaüstü ve 375 px mobilde, listenin başında ve
  sonunda eşit 16 px boşluk ölçüldü; 29 arama testi ve build tekrar geçti.
  Son görseller: `search-insets-desktop.png`, `search-insets-mobile.png`.

### Yayın sonrası — satır vurgusunun kaydırma alanına taşması

- Önceki arama, kayıt banner'ı ve footer düzeltmeleri PR #108 ile yayımlandı.
- Son kullanıcı yorumundaki taşma için kaydırma çubuğunun 10 px genişliği ve
  sağdaki 10 px boşluğu, satır viewport'unun dışında bırakıldı. Satırın sağ
  padding'i aynı miktarda azaltılarak beğeni sayılarının hizası korundu.
- 1431 px masaüstü ve 375 px mobilde vurgulu satırın sağ kenarı kaydırma
  çubuğunun sol kenarında bitiyor; çubuğun arkasına veya sağına taşmıyor.
  Üst/alt 16 px boşluk, uzun adların kısaltılması ve son satıra klavyeyle
  erişim korundu. İlgili 29 arama testi ve production build başarılı.
- Bu son düzeltme yereldir; görseller `search-hover-gutter-desktop.png` ve
  `search-hover-gutter-mobile.png` dosyalarında (`.local/design-checks/`).

### Mobil klavye — arama çerçevesinin üstten kesilmesi

- Kullanıcının iPhone ekran görüntülerinde klavye açıkken panelin üst kenarı
  görünür alan dışında kalıyordu. Açık arama artık `visualViewport.offsetTop`
  ve `height` değişikliklerini izler; mobil üst konum ve maksimum panel
  yüksekliği bu alanı ve güvenli ekran boşluklarını kullanır.
- Giriş/sayaç satırları sabit kalırken sonuç listesi kalan yüksekliğe küçülür.
  Header'dan mobil arama açılırken hero'ya ayrıca `scrollIntoView` uygulanmaz.
  Dinleyiciler arama kapanınca veya bileşen kaldırılınca temizlenir.
- Klavye açılış/kapanış ve kayma olaylarının simülasyonunda metin/odak korundu;
  31 arama testi, frontend TypeScript ve production build başarılı.
- Tarayıcıda 375×360 alanda panel y=16–344, 375×812 alanda y=16–427;
  kısa listede son sonuca klavyeyle erişim ve masaüstü düzeni doğrulandı.
  Gerçek iPhone klavyesi bu ortamda çalıştırılmadı. Görseller:
  `search-keyboard-short-viewport.png`, `search-keyboard-full-viewport.png`.
- Önceki satır vurgusu düzeltmesiyle birlikte yerelde hazır; henüz yayımlanmadı.


### İstasyon oynatma ikonları — yerel çalışma

- Figma Web `playing-section` referansları: `1339:3468` (istasyon sayfası),
  `1339:3643` (ayrı bileşen). 50 px yuvarlak düğmeler, 30 px önceki/sonraki/pause
  ikonları ve 20 px masaüstü aralığı doğrulandı.
- Figma MCP okuma kotası dolu olduğu için açık Figma dosyası native UI üzerinden
  incelendi; SVG'ler Export üzerinden alındı. `1339:3654` pause çıktısının path'leri
  mevcut mini-player SVG'siyle aynı. Play için Web `2390:8935` (adı
  `vuesax/bold/next`, görünür şekli yuvarlatılmış play üçgeni) 26 px orijinal SVG
  kullanıldı; `public/icons/playing-section/play.svg` değiştirilmeden kaydedildi.
- `1339:3671` Deezer grubu (Figma katman adı `spotify-logo`) 26 px; işaret
  16 × 10.45 px, x=5/y=7. YouTube/Spotify/Deezer için mevcut Figma vektörleri
  ortak `MusicServiceIcon` üzerinden istasyon sayfası ve mini oynatıcıda kullanılıyor.
- İstasyon sayfası `playing-section` görünümünü kullanır; oynat/duraklat/önceki/sonraki
  ve kalp SVG'leri yuvarlatılmış Figma ailesiyle tutarlıdır. Mobilde mevcut küçük
  kontrol boyutu kullanılarak 375 px ekranın sağında düğmelerin kesilmesi giderildi.
- Yerel gerçek sayfa önizlemesi: `/tr/istasyon/metro-fm?station-preview=1`;
  sadece `.local` fixture'ı, simüle oynatma ve sahte API verisi. Üretime dahil olmaz.
- Oynatma/oy verme/yerelleştirme davranış testleri dahil frontend 140 dosya /
  2032 test geçti; TypeScript kontrolü ve üretim derlemesi geçti. Masaüstü ve 375 px mobilde ikonların
  ölçüleri, oynat/duraklat geçişi ve servis görselleri kontrol edildi.
- Bu çalışma, önceki arama hover ve mobil klavye düzeltmeleriyle birlikte lokalde;
  henüz push/merge/deploy yapılmadı.
