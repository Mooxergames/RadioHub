# MegaRadio Facebook Login — Meta kurulumu

Tarih: 2026-11-10. Kullanıcı Meta koşullarını kabul ederek uygulama oluşturmayı açıkça onayladı; Vision Go GmbH projesi olduğunu belirtti.

- Uygulama: MegaRadio – Login
- App ID: 1419039257104266
- İşletme portföyü: Mega Radio App (125095446777428)
- Durum: oluşturuldu, yayınlanmadı; işletme doğrulanmamış.
- Kullanım senaryosu: Facebook Login. Varsayılan public_profile test için hazır. email henüz eklenmedi.
- Marka simgesi: mevcut mobil assets/megaradio-icon.png yüklendi.
- Kategori: Unterhaltung / Entertainment.
- Gizlilik: https://themegaradio.com/en/privacy-policy
- Koşullar: https://themegaradio.com/en/terms-and-conditions
- Kaydedildi bildirimi Meta UI üzerinden doğrulandı.

Şirket bilgileri Mega Radio portföyüne kaydedildi:
Vision Go GmbH, Bäckerstraße 7/7, 1010 Wien, Österreich.
Telefon: +43 676 6440122. Website: https://visiongo.at.
Kaynak: https://www.evi.gv.at/f/644224p ve https://visiongo.at/ueber-uns.html.
Bu kayıt Meta işletme doğrulamasının tamamlandığı anlamına gelmez. DPO alanı atanmış bir kişi doğrulanmadığı için boş bırakıldı.

Aynı portföyde doğrulanan varlıklar:
- Facebook: Mega Radio, Page ID104226179125637.
- Instagram: @mega.radios, portfolio asset107883468620741; Business IG user17841452068686897.
İçerik/mesaj yönetimi izinleri veya ayrı Instagram API ürünü eklenmedi. Normal kullanıcı Facebook Login kurulumu için bu ürünleri eklemek amaç dışıdır. eSIMfo uygulamaları değiştirilmedi.

Kalan gerçek işler:
- Kullanıcı veri silme talimatı veya doğrulanmış callback (mevcut gizlilik sayfasında somut silme adımları yok; rastgele URL girilmedi).
- email izni ve güvenli/strict OAuth callback veya native iOS/Android SDK yapılandırması.
- Mobil Facebook servisi ve backend501 yollarının gerçek token doğrulama, users kaydı ve oturum üretimiyle uygulanması.
- Gerekli app secret yalnızca sunucuda; bu çalışmada gösterilmedi/aktarılmadı.
- Meta testleri, işletme doğrulaması/App Review ve gerçek cihaz uçtan uca doğrulama.

Kanıtlar: output/meta-login/created-dashboard.png, basic-settings.png, vision-go-business.png.

## 2026-11-11 yeniden kontrol

- Canlı Meta ekranı Mega Radio App (125095446777428) için `Nicht verifiziert` ve `Verifizierung starten` gösteriyor. Gönderilmiş/bekleyen bir başvuru doğrulanmadı; yalnızca uygulama ve şirket bilgilerinin kaydedilmesi inceleme başlatmış sayılmaz.
- İşletme doğrulama sihirbazı mevcut Vision Go GmbH bilgileriyle açıldı (Avusturya, GmbH, kayıtlı adres/telefon/website). Resmi başvuru gönderilmedi; reCAPTCHA güvenlik kontrolünde duruldu.
- Facebook Login: public_profile test için hazır, email eklenmemiş; strict HTTPS açık, OAuth callback listesi boş. Mobil servis ve backend giriş/callback uçları hâlâ uygulanmamış. Uygulama kaydı çalışan giriş değildir.
- Kullanıcı, eSIMfo için mevcut doğrulanmış işletme olabileceğini hatırlattı. Yeni doğrulama/portföy değişimi durduruldu. eSIMfo Telecom reklam hesabının bağlı olduğu mevcut business ID 1110692467296397 bulundu. İşletme bilgilerine giriş Meta Authenticator 2FA istiyor; kullanıcıya bırakıldı. Mevcut işletmenin doğrulanma durumu 2FA tamamlanmadan teyit edilmedi.
- Hiçbir uygulama/varlık taşınmadı, izin kapsamı genişletilmedi; eSIMfo reklam/billing ayarları değiştirilmedi.

### Mevcut eSIMfo işletmesi — 2FA sonrası

Kullanıcı 2FA'yı tamamladıktan sonra business_info ekranında eSIMfo (1110692467296397) için işletme doğrulama durumu `Abgelehnt` (reddedildi) olarak doğrulandı. Kayıtlı yasal isim eSIMfo, adres yalnızca Österreich, telefon yok; bu gözlem ret gerekçesinin ispatı değildir. Portföy seçicisinde eSIMfo, Mega Radio App, Kindergruppe Kleine Entdecker, MooxerGames, Taxi Austria Online, Şahin Fatma Yogurtcu var; ayrı Vision Go adında bir portföy görünmüyor. Hiçbir uygulama taşınmadı veya mevcut eSIMfo işletme kaydı değiştirilmedi.

### Ret gerekçesi ve Mega Radio için ilerleme

- eSIMfo Security Center `Mehr dazu` ekranı: sunulan kişisel kimlik belgesinde sorun olduğu, farklı bir kimlik belgesi sunulması gerektiği yazıyor. Eski başvuru `Vision Go GmbH` adına yapılmış; önceki business_info'daki eSIMfo ticari adı bu başvurunun yasal isim alanının kanıtı değildir.
- Mega Radio App doğrulamasında güvenlik adımı sonrasında Meta, `VISION GO GMBH`, `BAECKERSTRASSE 7 /7, WIEN, Wien, 1010, AT` kaydını eşleştirdi. Sonraki bağlantı doğrulama yöntemi yalnızca kişisel kimlik belgesi yüklemeyi sunuyor. Belge yüklenmedi, herhangi bir başvuru gönderimi tamamlandı sayılmadı.

### 2026-11-11 kimlik belgesi gönderildi

Kullanıcı, resmî tek şirket yetkilisinin pasaportunu İndirilenler klasöründen dönüştürerek Meta'ya yükleme ve gerekli işlemi tamamlama talimatını açıkça verdi. Tek sayfalık PDF, içeriği değiştirilmeden PNG'ye dönüştürüldü; dosya repo dışında tutuldu. Reisepass seçili kimlik doğrulama formuna yüklendi ve Senden ile gönderildi. Meta'nın sonuç ekranı `Verifizierung der Identität in Bearbeitung` diyor; normalde 48 saat içinde inceleyip karar bildireceğini belirtiyor. Bu yalnızca kimlik incelemesinin başladığını gösterir, işletme doğrulaması veya Facebook Login yayını tamamlandı demek değildir.

Belgesiz durum kanıtı: `output/meta-login/identity-submitted-2026-11-11.jpg`. Pasaport görüntüsü denetim dosyasına/repo çıktısına eklenmedi.
