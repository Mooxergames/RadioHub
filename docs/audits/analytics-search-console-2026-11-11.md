# Analytics ve Search Console kontrolü — 11 Kasım 2026

## Doğrulanan Google kayıtları

- Başlangıç hesabı Vision go GmbH (`342743268`) idi. Kullanıcı onayıyla mevcut GA4 mülkü `530834250`, yeni **Mega Radio** hesabına (`415895122`) taşındı; görünen mülk adı **Mega Radio — Web & Apps** oldu. Veri alan mülk/akış kimlikleri değişmedi.
- MegaRadio Web: akış `16263898669`, ölçüm kimliği `G-3X2WGQC0J3`, URL `https://themegaradio.com`. Son 48 saatte veri alıyor. Enhanced measurement kapalı; SPA sayfa ölçümü elle yapılıyor.
- `com.megaradio` Android akışı `14288778040` ve `com.visiongo.megaradio` iOS akışı `14288752994` son 48 saatte veri alıyor.
- Eski `14288702752` akışı ve paket adı `om.visiongo.megaradio` yazılmış `14288799332` akışı son 48 saatte veri almıyor. Geçmiş veriyi korumak için silinmedi.
- Kontrol anında son 28 günlük görünüm: 201 etkin kullanıcı, yaklaşık 6,3 bin görüntüleme ve 16 bin olay. Realtime kontrol anında 0 kullanıcı gösteriyordu; üretime yapay test olayı gönderilmedi.

## Bulunan ve düzeltilen ölçüm eksikleri

Mobilde sayfa takibi merkezi değildi, Expo web Analytics servisi boştu ve bazı radyo olayları kapalı FlowAlive servisine gidiyordu. Webde Analytics yüklemesi etkileşime/uzun gecikmeye bağlıydı; ilk sayfa ve erken olaylar kaçabiliyordu.

İki uygulamaya aynı saf `AnalyticsSession` davranışı eklendi. Mobilde Expo Router ekranları ve önemli modal durumları ortak gözlemciye bağlandı. Webde ilk ziyaret dahil rota değişimleri tek `page_view` gönderiyor; aynı rota için ayrıca `screen_view` gönderilerek görüntüleme ikiye katlanmıyor. Partytown yüklemesi korunup erken olay kuyruğu ve dinamik script için `ptupdate` eklendi.

- `station_play` yalnızca gerçek playing durumundan üretilir. Radyoyu seçmek, buffering ve hata çalma sayılmaz.
- Duraklama, hata, istasyon değiştirme ve temizlemede oynatma durumu güncellenir.
- `listening_time.duration_seconds` gerçek çalma aralıklarını toplar; pause süresi eklenmez. Ön planda tek 60 saniyelik heartbeat bulunur. Arka planda sahte ekran/aktif heartbeat gönderilmez; arka planda gerçekten süren sesin dinleme aralığı korunur.
- Oturumdaki kalıcı dahili kullanıcı kimliği kullanılır; çıkışta temizlenir. Kimlik ve olay sırası kuyrukla korunur.
- E-posta, profil adı, sohbet içeriği ve serbest arama metni gönderilmez. URL query/hash parametreleri gönderilmez.
- Yerel önizleme ölçüm dışıdır. Native geliştirme varsayılan olarak kapalıdır; açık QA isteğiyle `EXPO_PUBLIC_ANALYTICS_DEBUG=1` kullanılabilir.
- Favori, arama sonuç sayısı, tür, giriş/kayıt ve mevcut paywall olayları ortak servise bağlandı. Kapalı FlowAlive SDK yeniden açılmadı.

Mobil ek ekran kapsamı: açılış splash, onboarding adımları, grup kurma adımları, premium/reklamları kaldır/legal, uyku zamanlayıcısı, oynatıcı seçenekleri, radyo/profil paylaşımı, car mode, değerlendirme, ülke seçici, hesap düzenleme, cast, grup/birebir keşif, tür seçici, grup bilgileri, hesap silme ve çıkış onayı. Yeni ekranlarda ayrı Analytics SDK çağrısı yerine ortak rota/overlay yapısı kullanılmalı.

## Google panelinde kaydedilen alanlar

Mevcut mülke kaydedilip yeniden okunarak doğrulandı:

| Tür | Görünen ad | Parametre |
| --- | --- | --- |
| Kullanıcı boyutu | Current screen | `current_screen` |
| Kullanıcı boyutu | Current station | `current_station` |
| Kullanıcı boyutu | Playback state | `playback_state` |
| Olay boyutu | Station name | `station_name` |
| Olay boyutu | Station country | `station_country` |
| Özel metrik, saniye | Listening seconds | `duration_seconds` |

`Current station` dahili radyo kimliğidir; istasyon adını olay ayrıntılarındaki `Station name` verir. Kullanıcı özelliği son bilinen bağlamdır: sadece `playing` durumuyla birlikte dinleyen olarak değerlendirilmelidir. Yüksek sayıda benzersiz kimlik GA raporlarında yüksek kardinalite oluşturabilir. GA4 kesin canlı presence/veritabanı yerine kullanılmamalıdır.

## Search Console bulguları

- `sc-domain:themegaradio.com` doğrulanmış; Vision go GmbH sahipliği mevcut. Robots dosyaları geçerli görünüyor.
- 32 sitemap kaydı mevcut. Örnek başarılı kayıtlar: `/sitemap-index.xml`, `/sitemap-stations-en-1.xml` (10 bin URL), Türkçe shard'lar ve blog sitemap'i. Index sitemap'indeki 0, tek başına bağlantı arızası olarak yorumlanmadı.
- İlk kontrolde Analytics ilişkisi eski `mega-bb8c0` mülkündeki “Mega Radio” akışına aitti ve güncel mülke bağlantıyı engelliyordu. Aşağıdaki onaylı taşıma ile düzeltildi.
- Android uygulama ilişkisi `com.megaradio` için mevcut.
- Kullanıcının açık onayı sonrasında eski ilişki kaldırıldı ve `megaradio-276c6` (`530834250`) → MegaRadio Web (`16263898669`) ile `sc-domain:themegaradio.com` bağlantısı 11 Kasım 2026 tarihinde oluşturuldu. Analytics başarı sonucu ve Search Console ilişki listesi iki taraftan doğrulandı. Eski mülk/akış/geçmiş veriler silinmedi. Android uygulama ilişkisi korundu.
- Genel görünümde 205.100 dizine eklenmemiş ve 12 dizine eklenmiş sayfa gösteriliyordu. Bu ayrı bir indeksleme araştırması gerektirir; bağlantının çalışması bütün URL'lerin indekslendiği anlamına gelmez. Bu görevde SEO yönlendirmesi/sitemap kapsamı değiştirilmedi.

## Doğrulama ve kalan sınırlar

- Mobil Analytics davranış testi geçti: rota/overlay, decoder kaynaklı play, çift sayım, pause süresi, arka plan, istasyon değişimi, logout sırası ve özel arama metninin gönderilmemesi.
- Web hedefli testler: 2 dosyada 10/10 geçti (`analytics-collection`, `station-availability`).
- Web TypeScript ve üretim build geçti. Mobil Expo web export geçti. Son küçük observer/çıkış kapsamı değişiminden sonra TypeScript kontrolünde yeni tanı yok.
- Mobil tüm proje TypeScript kontrolü hâlihazırdaki TV/desktop preview alias/modül hataları nedeniyle temiz değil; yeni Analytics hatası yok.
- Geniş web test çalışmasında bağımsız `station-control-localization` testinin `getQueryFn` mock hatası kaldı. Analytics değişikliği için hedefli testler temiz.
- Premium yerel önizlemesi açıldı; localhost iframe'inde Google Tag Manager script sayısı 0 doğrulandı.
- Yeni native build ve üretim web yayını yapılmadı. Gerçek cihaz DebugView/Realtime teslimatı henüz doğrulanmadı. Eski sürümün veri alması yeni kodun teslim edildiğinin kanıtı değildir.
- TV/desktop uygulamalarına bu görevde yeni SDK kurulmadı; aktif web ve mobil yolları düzeltildi. Bu yüzeyler için ayrıca cihaz/ürün yayını doğrulaması gerekir.
- Yeni sürüm çıktığında: iOS/Android DebugView'da ekran → play → pause → ekran değişimi → logout zinciri; webde ilk sayfa ve SPA geçişi kontrol edilmeli. Tek gerçek olayla akış kimliği ve kullanıcı kimliğinin çıkışta temizlendiği teyit edilmeli.

## Kanıt ve kaynaklar

- [GA4 alanları](../../output/analytics/ga4-live-fields.png)
- [Search Console ilk ilişki](../../output/analytics/search-console-current-association.png)
- [Onaylı taşıma sonrası doğrulanan ilişki](../../output/analytics/search-console-migrated.png)
- [Google Realtime — son 30 dakika](https://support.google.com/analytics/answer/9271392)
- [Firebase ekran ölçümü](https://firebase.google.com/docs/analytics/screenviews)
- [Firebase User-ID](https://firebase.google.com/docs/analytics/userid?platform=android)
- [Analytics kişisel veri politikası](https://developers.google.com/analytics/policy)
- [RNFirebase Analytics yapılandırması](https://rnfirebase.io/analytics/usage)
- [Partytown dinamik script yükleme](https://partytown.qwik.dev/partytown-scripts/)


## Ayrı Mega Radio hesabına taşıma — aynı gün tamamlandı

- Hesap `415895122`, mülk `530834250`. Mevcut mülk izinleri korunarak taşıma yapıldı. Vision go GmbH hesabının adı ve diğer projeleri değiştirilmedi.
- Hesap ülkesi Avusturya. Google ürün/hizmet geliştirme, modelleme katkısı, teknik destek erişimi ve işletme önerileri için isteğe bağlı veri paylaşımı kapalı; kayıttan sonra yeniden okunarak doğrulandı.
- Mülkün Avusturya raporlama saat dilimi ve mevcut USD gösterim para birimi korundu. Ürün fiyatlarının para birimi değiştirilmedi. Görünen sektör Sanat ve Eğlence; hedefler trafik ve kullanıcı etkileşimi/elde tutma. Zorunlu işletme boyutu küçük (1–10) seçildi; kuruluş büyüdüğünde düzeltilebilir.
- Google hesap oluştururken zorunlu boş mülk açtırdı: `563814054` (Mega Radio — Kurulum). Hiç veri akışı/etiket kurulmadı; asıl mülk taşındıktan sonra yalnızca bu boş mülk çöp kutusuna gönderildi. Çöp kutusunda 11 Kasım kaydı doğrulandı; kalıcı silme yapılmadı.
- Yeni hesapta web/iOS/Android akış kimlikleri, Search Console `themegaradio.com` bağlantısı ve Firebase `megaradio-276c6` / `957628580421` bağlantısı korunduğu arayüzden doğrulandı.
- [Taşıma sonrası akış kanıtı](../../output/analytics/mega-radio-moved-streams.png).
- Güncel Analytics: https://analytics.google.com/analytics/web/?authuser=1#/a415895122p530834250/realtime/overview

## Yeni cihazları bağlama sözleşmesi

**Tek marka hesabı → tek üretim mülkü → desteklenen platform akışları.** Samsung/LG/Mac için peşinen ayrı Analytics hesabı veya boş mülk açılmaz. Her uygulama gerçek SDK/runtime kabiliyeti ve cihaz testiyle sırayla eklenir. Şu anda bu cihazlara yeni entegrasyon tamamlandığı iddia edilmez.

| Yüzey | Planlanan ölçüm yolu | Durum |
| --- | --- | --- |
| Web / MacBook tarayıcısı | Mevcut web akışı; OS/device boyutları | Mevcut akış korunuyor; yeni kodun yayın doğrulaması bekliyor |
| iOS / Android | Mevcut Firebase uygulama akışları | Yeni native derleme/DebugView kontrolü bekliyor |
| Samsung Tizen / LG webOS | Gerçek TV runtime'ında etiket desteği kontrolü; ortak olay sözlüğü ve açık platform alanı | Henüz bağlanmadı |
| Yerel macOS uygulaması | Paket/runtime/SDK desteğine göre aynı üretim mülküne bağlanır | Henüz bağlanmadı |

Gelecek entegrasyonlarda `client_surface` için tutarlı değerler: `web`, `mobile_web`, `ios`, `android`, `samsung_tizen`, `lg_webos`, `macos`. Bu tablo bir uygulama planıdır; hepsi şu anda olaylarda gönderiliyor varsayılmaz. Radyo olay adları, `station_id`, `playback_state`, `duration_seconds` ve dahili kullanıcı kimliği mantığı bütün yüzeylerde aynı kalır. Cihazlar arası kimlik sadece oturum açmış kullanıcı ID'siyle bağlanır; oturumsuz cihazlar zorla tek kullanıcıya birleştirilmez.

Measurement Protocol, otomatik SDK/etiket ölçümünün yerini tam olarak tutmaz; TV runtime'ında gerekirse sunucu üzerinden tamamlayıcı olarak kullanılır, API secret uygulama paketine gömülmez. Web/native izin tercihlerinin uygulanması ayrıca doğrulanır; DNT/GPC filtresi kullanıcı onayının yerine geçmez. Geliştirme/önizleme verisi üretim raporlarına gönderilmez. Satın alma geliri tek yetkili kaynaktan, işlem ID'siyle çift sayımı önlenerek bağlanır; istemci butonuna basmak satın alma sayılmaz.

Kaynaklar: [Google hesap/mülk yapısı](https://support.google.com/analytics/answer/9679158?hl=en), [mülk taşıma](https://support.google.com/analytics/answer/9305872?hl=en), [Measurement Protocol sınırları](https://developers.google.com/analytics/devguides/collection/protocol/ga4).
