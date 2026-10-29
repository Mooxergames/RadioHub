# Google Tag Manager: MegaRadio

## Hazırlık Durumu

GTM web konteyneri `GTM-WRF32ZCN`, mevcut `visiongo` şirket hesabında
`themegaradio.com` için oluşturuldu. Konteynerde ölçüm etiketi yayınlanmadı.
Başka projelerin etiketleri ve kullanıcı izinleri değiştirilmedi.

Mevcut GA4 `megaradio-276c6` mülkü `530834250` içinde yalnızca mobil veri
akışları doğrulandı. Web akışı oluşturulması için açık kullanıcı onayı
bekleniyor. Mobil uygulama kimlikleri veya başka sitelerin ölçüm kimlikleri
web ölçümü için kullanılmamalı.

Kod varsayılan olarak **kapalıdır**. Konteynerin oluşturulması, sitenin ölçüm
yaptığı veya bu dalın canlıya alındığı anlamına gelmez. GTM kurulumu Google
indekslemesini veya AI görünürlüğünü doğrudan artıran bir SEO düzeltmesi değildir.

## Kodun Sınırları

- `main.tsx`, React reklam bileşenleri mount olmadan önce idempotent runtime'ı
  başlatır. Aktif ve geçerli yapılandırmada dört Google consent default'u denied
  olarak kuyruğa alınır; sonraki consent güncellemeleri mevcut Google CMP'ye aittir.
- Basic consent yaklaşımı: `CONSENT_MODE_DATA_READY` ve gerçek
  `analyticsStoragePurposeConsentStatus` 1 (GRANTED) veya 3 (NOT_APPLICABLE)
  olmadan GTM yüklenmez. 3 kullanıcı onayı demek değildir. 0/2/4, eksik veya
  hatalı CMP ölçümü kapalı tutar. NOT_CONFIGURED izin sayılmaz.
- Hazır olma callback'i sürekli abonelik varsayılmaz. İlk ret sonrası izin
  değişimi, yeni sayfa görüntüleme çağrısında güncel getter'dan yeniden
  değerlendirilebilir. Eski dinleme/arama olayları daha sonra gönderilmez.
- İzin geri çekme düğmesi, TCF panel/karar sinyali, sonradan ret/hata veya özel
  rotaya giriş aynı belge boyunca kilit koyar. GA disable bayrağı etkinleşir.
  Yeni izin sonraki normal tam sayfa açılışında değerlendirilir; oynatıcıyı
  kesen zorunlu reload yapılmaz. Önceden gönderilmiş istekler geri alınamaz.
- Runtime GTM/GA'nın bütün iç işleyişini kontrol etmez. Her yayınlanacak etiket
  hem canlı kapıyı hem `analytics_storage` şartını kullanmalı; gerçek boşta
  kalma/unload/geri çekme ağ testleri geçmeden etkinleştirme yapılmamalı.
- `megaradio_page_view` tek uygulama sayfa görüntüleme kaynağıdır. Tekrar
  render aynı URL'yi yinelemez; A-B-A navigasyonu üç görüntülemedir.
- `megaradio_event` yalnız sabit allowlist olay adını ve sınırlı sayısal
  `value` alanını taşır. Ham arama, e-posta, kullanıcı kimliği, istasyon etiketi,
  sayfa başlığı, query ve fragment Google payload'ına eklenmez.
- Özel/token/hesap/arama rotaları dışlanır. Kaynak URL/referrer yalnız uygun
  aynı-origin public path ise kullanılır. Bu konservatif tercih dış kaynak
  attribution bilgisini sınırlayabilir; değiştirmek ayrı gizlilik incelemesidir.
- Partytown yalnız Clarity'yi yönlendirir. Eski worker gtag.js yükleyicisi ve
  `config` tabanlı tekrar pageview yolu kaldırıldı. Devre dışıyken fallback yok.
- FlowAlive, visitor-activity, Clarity, reklam ve Cast davranışı bu Google
  değişikliğinin dışındadır. Tüm site için “Google'a sıfır trafik” sözü verilmez.

## Aktivasyon Kapıları

1. Açık onayla mevcut MegaRadio GA4 mülküne web akışı eklenmeli ve alan adı
   `https://themegaradio.com` üzerinden ölçüm kimliği doğrulanmalı.
2. Mevcut Privacy & messaging ayarlarında analytics-purpose gerçekten etkin
   olmalı. Tüm siteleri etkileyen CMP ayarları ayrı onay olmadan değiştirilmez.
   AdSense olmayan doğrudan FAQ/blog girişlerinde veya reklam loader'ı
   çalışmayan oturumlarda CMP yoksa ölçüm kapalı kalır. Bu görev sırf Analytics
   için AdSense'i tüm sayfalara yaymaz ve yeni CMP satın almaz.
3. Konteynerde Google tag `send_page_view:false` ile ayarlanmalı. GA4 enhanced
   history/pageview, GTM history trigger ve ikinci all-pages pageview kaynağı
   kapalı tutulmalı. Web akışının enhanced measurement seçeneği de bilinçli
   yapılandırılmalı; form/search gibi otomatik PII riskleri eklenmemeli.
4. Google tag ve event tag'leri, ek consent `analytics_storage` VE aşağıdaki
   canlı kapı boolean true şartını kullanmalı. Google'ın ads consent ayarları
   analytics izninden türetilmemeli. Reklam dönüşümü/remarketing/signals/user-id
   veya enhanced user data bu kurulumun kapsamında değil.

   ```js
   function () {
     return typeof window.__MEGARADIO_GOOGLE_ALLOWED__ === 'function'
       && window.__MEGARADIO_GOOGLE_ALLOWED__() === true;
   }
   ```

5. Google tag başlangıç ayarları ve olay parametreleri sanitizasyonu yapılmış
   `page_location` ve `page_referrer` değerlerini kullanmalı; browser URL'sine
   fallback olmamalı. Event tag'leri yalnız `megaradio_page_view` ve allowlist'li
   `megaradio_event` özel olaylarından tetiklenmeli. Yapılandırma etiketi setup
   sırasıyla hazır olmalı; undefined parametreyle otomatik ilk view açılmamalı.
6. Tag Assistant/DebugView'da ilk ret, ilk grant, kayıtlı consent, panel açma,
   grant-ret, SPA public-private, geciken script, idle/visibility/unload ve
   Partytown çalışan prod-benzeri hostname üzerinde ağ doğrulaması yapılmalı.
   Testler olmadan “tamamlandı/canlıda çalışıyor” denmemeli.
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
