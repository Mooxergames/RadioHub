# Google Tag Manager: MegaRadio

## Hazırlık Durumu

GTM web konteyneri `GTM-WRF32ZCN`, mevcut `visiongo` şirket hesabında
`themegaradio.com` için oluşturuldu. Yalnız analitik içeren 2. sürüm yayımlandı;
bu, sitenin build aktivasyonundan ayrıdır.
Başka projelerin etiketleri ve kullanıcı izinleri değiştirilmedi.

Mevcut GA4 `megaradio-276c6` mülkü `530834250` içinde bu site için ayrı web
akışı oluşturuldu: akış kimliği `16263898669`, ölçüm kimliği `G-3X2WGQC0J3`,
adres `https://themegaradio.com`. Bu web akışında enhanced measurement
**kapalıdır**. Mobil uygulama akışları ve başka sitelerin ölçüm kimlikleri
bu web kurulumu için kullanılmaz.

Kod varsayılan olarak **kapalıdır**. Konteynerin oluşturulması, sitenin ölçüm
yaptığı veya bu dalın canlıya alındığı anlamına gelmez. GTM kurulumu Google
indekslemesini veya AI görünürlüğünü doğrudan artıran bir SEO düzeltmesi değildir.
Native getter tabanlı GTM kapısı Astra kod incelemesinden geçti. Aktivasyon
öncesinde ve dağıtım sonrasında aşağıdaki yayın kapıları doğrulanmalıdır.

## Bağımsız Web Analitiği İzni

- Google Analytics web sitesi ziyaretleri için ayrı, açık opt-in kullanılır.
  Yetkili kaynak `web-analytics-consent.ts` içindeki `unknown`, `denied` veya
  `granted` tercihidir. Google CMP/TCF sonucu, `CONSENT_MODE_DATA_READY` veya
  `analyticsStoragePurposeConsentStatus` analitik izni vermez. CMP'nin yokluğu
  da tek başına bu bağımsız opt-in arayüzünü engellemez.
- Tercih bu tarayıcıda `megaradio:web-analytics-consent:v1` localStorage
  anahtarında tutulur. Kayıt `version: 1`, `granted`/`denied` seçimi ve geçerli
  `updatedAt` zamanını içermelidir. Gelecekteki zamanlar, bozuk/bilinmeyen sürüm
  ve 180 günü doldurmuş kayıtlar geçerli izin değildir. Okuma, sürenin yeniden
  başlamasına veya eski olayların gönderilmesine yol açmaz.
- Başarılı kaydetme, yazılan kaydın geri okunarak aynen doğrulanmasını
  gerektirir. Kayıtlı grant okunurken ayrı probe anahtarıyla yazma/geri okuma
  kontrolü de yapılır; probe asıl tercihi değiştirmez veya süresini uzatmaz.
  Depolama hatası mevcut belgede fail-closed `denied` sonucuna gider.
- Ret/geri çekme önce bellekte uygulanır ve abonelere senkron bildirilir;
  runtime ölçümü kilitler. Bu, localStorage erişiminden ve kalıcı yazma
  denemesinden **önce** olur. Kalıcı kayıt başarısız olsa da mevcut belgedeki
  ölçüm kapalı kalır; arayüz kaydetme hatasını gösterir, başarı iddia etmez.
- **Kalıcı kayıt hatasının sınırı:** daha önce diske yazılmış geçerli bir
  grant silinememiş veya değiştirilememiş olabilir. Sonraki tam sayfa yüklemede
  depolama yeniden çalışırsa, henüz 180 günü dolmamış bu eski grant tekrar
  geçerli olabilir. Mevcut belgeyi durdurmak, gelecekteki belgeler için kalıcı
  ret garantisi değildir.
- Footer gizlilik girişi, Google ölçümü yapılandırılmışsa `googlefc` hazır
  olmasa da kullanılabilir. İlk tercih `unknown` iken yalnız uygun public
  sayfalarda footer ana gridinden önce mütevazı, tam genişlikte satır içi
  bildirim bulunur. İzin verme ve izin vermeden devam etme eylemleri eşittir;
  otomatik modal, sabit overlay veya oynatıcıyı örten ilk ziyaret bildirimi yoktur.
- Diyalog yalnız açık kullanıcı eyleminde lazy yüklenir. Ayrı analitik switch'i
  ve Kaydet eylemi vardır; reklam kişiselleştirmesi ve remarketing'in bu GA
  kurulumunda kapalı olduğu belirtilir. Metinler `en`, `de`, `tr`, `es`, `fr`,
  `pt`, `it`, `ru`, `ar`, `zh`, `ja`, `ko`, `hi`, `he` için yereldir;
  Arapça ve İbranice RTL kullanır. Bu tercih diğer mevcut izleyiciler için
  toplu bir izin veya ret değildir.
- Reklam ayarları ayrı bir eylemdir ve yalnız Google CMP revocation API'si
  hazırsa sunulur. Önce `suspendGoogleMeasurement()`, ardından desteklenen
  `CONSENT_API_READY` kuyruğunda `showRevocationMessage()` çalışır. Google
  ölçümü yapılandırılmamışsa mevcut, hazır CMP footer girişi korunur.
  Analitik switch'i reklam izni vermez ve TCF izni türetmez.

## Kodun Sınırları

- `main.tsx`, React reklam bileşenleri mount olmadan önce idempotent runtime'ı
  başlatır. Aktif ve geçerli yapılandırmada dört Google consent default'u denied
  olarak kuyruğa alınır: `analytics_storage`, `ad_storage`, `ad_user_data`,
  `ad_personalization`. Bağımsız opt-in yalnız `analytics_storage` günceller.
  Bu GA kurulumu reklam consent'i, Google Signals, remarketing, reklam dönüşümü,
  user-id veya enhanced user data etkinleştirmez.
- Basic consent yaklaşımı: yapılandırma açık, URL uygun ve kendi geçerli
  tercihimiz `granted` olmadan GTM script'i yüklenmez. CMP callback'leri
  grant/start kaynağı değildir; yalnız konservatif durdurma sinyallerini
  kaydedebilir. İzin öncesi dinleme/arama olayları biriktirilip sonradan gönderilmez.
- Ret/geri çekme, iznin kaybı veya süresinin dolması, ölçüm başladıktan sonra
  TCF panel/karar/hata sinyali ya da uygun olmayan rotaya giriş mevcut belgeyi
  kilitler. GA disable bayrağı etkinleşir ve başlatılmış runtime'da
  `analytics_storage: denied` güncellemesi yapılır. Kilit sonrası yeniden grant
  yalnız sonraki **tam sayfa yüklemesinde** değerlendirilebilir; SPA navigasyonu
  kilidi açmaz. Zorunlu reload veya oynatıcı reset'i yapılmaz. Önceden
  gönderilmiş istekler geri alınamaz.
- Askıya almada yalnız tam adlı GA çerezleri `_ga` ve yapılandırılan akışın
  `_ga_<ölçüm-kimliği-soneki>` çerezi temizlenmeye çalışılır; bu web akışı için
  ikinci ad `_ga_3X2WGQC0J3` olur. Erişilebilir host/üst alan adı ve mevcut yol
  varyantları denenir. `_ga_*` wildcard temizliği yapılmaz; diğer akışların
  çerezleri, reklam/CMP çerezleri ve ilgisiz depolama anahtarları silinmez.
  Bu işlem önceki sunucu verilerini silmez veya tüm Google çerezlerinin
  temizlendiği garantisini vermez.
- Runtime GTM/GA'nın bütün iç işleyişini kontrol etmez. Her yayınlanacak etiket
  hem canlı kapıyı hem `analytics_storage` şartını kullanmalı; gerçek boşta
  kalma/unload/geri çekme ağ testleri geçmeden etkinleştirme yapılmamalı.
- `megaradio_page_view` tek uygulama sayfa görüntüleme kaynağıdır. Tekrar
  render aynı URL'yi yinelemez; A-B-A navigasyonu üç görüntülemedir.
- `megaradio_event` yalnız sabit allowlist olay adını ve sınırlı sayısal
  `value` alanını taşır. Ham arama, e-posta, kullanıcı kimliği, istasyon etiketi,
  sayfa başlığı, query ve fragment Google payload'ına eklenmez.
- Özel/token/hesap/arama rotaları dışlanır. `publicMeasurementUrl` desteklenen
  dil önekini ve public path allowlist'ini gerektirir. Hassas token/password/
  email/oauth/code query anahtarları olan URL reddedilir; kabul edilen URL'den
  tüm query ve fragment atılır. `/radios` temiz public path olarak yalnız tam
  eşleşmeyle kabul edilir; `/radios/*` alt yolları açılmaz.
- Aynı-origin referrer aynı public URL filtresinden geçer. Dış referrer yalnız
  `https://bing.com` veya `https://www.bing.com` ise **origin** olarak kullanılır;
  Bing path/query/fragment veya arama metni gönderilmez. HTTP, diğer dış
  origin'ler ve kullanıcı bilgisi içeren referrer reddedilir. Ham browser URL'sine
  fallback yoktur. Bu konservatif tercih attribution bilgisini sınırlar.
- Partytown yalnız Clarity'yi yönlendirir. Eski worker gtag.js yükleyicisi ve
  `config` tabanlı tekrar pageview yolu kaldırıldı. Devre dışıyken fallback yok.
- FlowAlive, visitor-activity, Clarity, reklam ve Cast davranışı bu Google
  değişikliğinin dışındadır. Tüm site için “Google'a sıfır trafik” sözü verilmez.

## Aktivasyon Kapıları

1. Bu web akışının `530834250` / `16263898669` / `G-3X2WGQC0J3` kimlikleri
   yayınlanacak GTM export'uyla eşleşmeli. Akışın oluşturulmuş olması etiket
   yayını, build aktivasyonu veya başarılı gerçek ağ doğrulaması değildir.
2. Bağımsız opt-in, kayıt doğrulaması ve 14 dilli footer/diyalog akışı
   kullanılmalı. CMP analitik grant otoritesi olarak bağlanmamalı. Bu görev
   sırf Analytics için AdSense'i tüm sayfalara yaymaz, yeni CMP satın almaz
   veya tüm siteleri etkileyen Privacy & messaging ayarlarını değiştirmez.
3. Konteynerde Google tag `send_page_view:false` ile ayarlanmalı. GA4 enhanced
   history/pageview, GTM history trigger ve ikinci all-pages pageview kaynağı
   kapalı tutulmalı. Web akışında enhanced measurement kapalı kalmalı;
   form/search gibi otomatik toplama yolları eklenmemeli.
4. Google tag ve event tag'leri, ek consent `analytics_storage` VE aşağıdaki
   canlı kapının boolean `true` şartını birlikte kullanmalı. Runtime'ın
   `__MEGARADIO_GOOGLE_ALLOWED__` kapısı geçerli tercih, public rota ve belge
   kilidini her ölçümde değerlendirmeli; başlangıçta alınmış sabit true yeterli
   değildir. GTM native JavaScript değişkeni `__MEGARADIO_GOOGLE_ALLOWED_VALUE__`
   read-only getter'ını okur; setter veya dataLayer true snapshot'ı kullanılmaz.
   Runtime/export sözleşmesi birlikte doğrulanmadan yayın yapılmamalı. Bu
   kurulum Custom JavaScript değişkeni veya CSP'ye `unsafe-eval` eklenmesini
   gerektirmez; önceki Custom JS fonksiyon örneği uygulanmamalı. Ads consent
   analitik izninden türetilmez; reklam/Signals/remarketing kapalı kalır.
5. Google tag başlangıç ayarları ve olay parametreleri sanitizasyonu yapılmış
   `page_location` ve `page_referrer` değerlerini kullanmalı; browser URL'sine
   fallback olmamalı. `page_title`, DOM'dan değil sabit `MegaRadio` değerinden
   alınır. İlk kurulum yalnız `megaradio_page_view` özel olayını gönderir;
   allowlist'li `megaradio_event` için etiket açılmadı. Yapılandırma etiketi setup
   sırasıyla hazır olmalı; undefined parametreyle otomatik ilk view açılmamalı.
6. Tag Assistant/DebugView ve gerçek ağ üzerinden ilk unknown/ret/grant,
   kayıtlı ve süresi dolmuş tercih, kapalı/bozuk depolama, yazma/geri okuma
   hatası, grant-ret-regrant, tam yükleme, sekmeler arası değişim, ayrı reklam
   paneli, SPA public-private, doğrudan FAQ/blog girişleri, geciken script ve
   idle/visibility/unload doğrulanmalı. Partytown ve CSP'nin çalıştığı
   prod-benzeri hostname üzerinde ilk izin öncesi ölçüm script'i/isteği
   olmaması ve ret/kilit sonrası yeni GA ölçümü gönderilmemesi gözlenmeli.
   Yerel üretim derlemesinde gerçek CSP ve yayımlanmış GTM ile unknown/ret için
   sıfır Google ölçüm isteği, grant için tek ilk view, SPA A-B-A, ret/idle/unload,
   yeniden grant kilidi, kayıtlı grant ve private-public kilidi doğrulandı.
   Toplama yanıtı 204; query/fragment yok, title sabit. Storage/süre/eşzamanlılık
   uç durumları ayrıca unit testlerindedir. Yerel ağ testi canlı dağıtım ve
   Realtime doğrulamasının yerine geçmez.
7. Ancak bu kapılar ve ayrı yayın yetkisi tamamlandığında build girdileriyle
   aktivasyon yapılabilir. Railway runtime env tek başına Vite bundle'ını
   değiştirmez. `Dockerfile.web` varsayılan argümanları kapalı/boştur:

   ```text
   VITE_GTM_ENABLED=false
   VITE_GTM_CONTAINER_ID=GTM-WRF32ZCN
   VITE_GA_MEASUREMENT_ID=
   ```

## Kaynaklar

- [Google consent kurulumu](https://developers.google.com/tag-platform/security/guides/consent)
- [Google Privacy & messaging API](https://developers.google.com/funding-choices/fc-api-docs)
- [GA4 SPA ölçümü](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
- [Google veri toplama gizlilik kontrolleri](https://developers.google.com/tag-platform/security/guides/privacy)
