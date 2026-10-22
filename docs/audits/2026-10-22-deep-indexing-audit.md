# Ikinci Asama: Indeks Secimi ve Icerik Butunlugu

Inceleme tarihi: 22 Ekim 2026. Bu rapor, ilk incelemenin ustune eklenen
canli olcumleri ve tekrar uretilmis hatalari ayirir. Eski raporlardaki iddialar
bugun tekrar dogrulanmadan gecerli kabul edilmedi.

## 1. Kesin Olarak Bildigimiz

Search Console raporu halen 16 Ekim verisiyle11 indeksli URL gosteriyor.
Bugunku yeni canli test bir indeksleme karari degildir.

Google'in en yeni100 "tarandi, dizine eklenmedi" ornegi alindi. Bunlar
10-16 Ekim taramalaridir, tum siteyi temsil eden rastgele bir orneklem degil.
Bugun100/100 adresin son yaniti200;50 tanesi eski bicimden yonleniyor.
Sonuclarda56 farkli nihai adres var. Son adreslerin hepsi tek bir kendine
isaret eden canonical tasiyor, noindex yok, JSON-LD ayrisma hatasi yok.
Unicode adresler URL kodlamasi normalize edilerek karsilastirildi; yuzeysel
Unicode/%-encoding farklari canonical hatasi sayilmadi.

Ek olarak:

| Orneklem | Sonuc |
| --- | --- |
| Kullanicinin eski "tarandi" CSV'sinden24 farkli slug |24 nihai200 |
| Eski404 CSV'sinden24 farkli slug |4 nihai200,20 nihai410 |
|16 teknik/olumsuz URL | Asagidaki iki yeni hata dahil |
| HTTP ve www girisleri | Dogru HTTPS/apex adrese yonleniyor |
|4 URL x tarayici/Googlebot-UA/TR-cerez varyanti | Her URL icin HTML govdesi birebir ayni |
| HTML'nin asil JS ve CSS girdileri | Ikisi de200 ve dogru dosya turu |

Toplam178 baslangic adresi/varyant incelendi. Yonlendirme adimlari ve
asset istekleri buna ek. Iki eszamanli istek, sinirli sure ve govde boyutu
kullanildi. Googlebot UA taklidi gercek Google IP erisiminin kaniti degildir.

Kanita dayali sonuc: bu orneklemde sorunu genel bir robots/noindex/canonical
engeli veya su anki yaygin5xx ile aciklayamiyoruz. Bu, gecmisteki sorunlari
ya da tum katalogda farkli sorunlar olabilecegini dislamaz.

Ham kanit: `2026-10-22-gsc-recent-crawled.json`,
`2026-10-22-indexing-integrity.json`; tekrar araci:
`check-indexing-integrity.mjs`.

## 2. Gercek Google Kaydi ve Mobil Olusturma

`/en/station/radio-caprice-relaxation-music`:

- Kayitli akilli telefon taramasi:16 Ekim03:52:39.
- Tarama izni evet, sayfa getirme basarili, indeks izni evet.
- Kullanici canonical'i incelenen URL; Google'in sectigi de incelenen URL.
- Buna ragmen kayitli karar: tarandi, dizine eklenmedi.
-22 Ekim16:52 canli test:200, Google tarafindan kullanilabilir.
- Mobil ekran goruntusu gercek uygulamayi ve radyo basligini gosteriyor.
- JavaScript konsolu: mesaj yok.89 kaynaktan6'si yuklenememis:5 ilgili
  istasyon/onerilen radyo gorseli ve robots ile korunmasi normal olan
  `/api/auth/me`. Asil JS/CSS hatasi raporlanmiyor.
- Canli test sonrasi tekrar indeksleme istegi gonderilmedi.

Kayitli kanit: `2026-10-22-gsc-caprice-en.txt`. Canli mobil ekran goruntusu
bu gorevin gorsel ciktisinda saklandi. Bu test yayin oncesi canli surume aittir;
yerel yamalarin yayinlandigi seklinde sunulamaz.

## 3. Tekrar Uretilmis Hatalar ve Duzeltmeler

### Yanlis Kitada Ayrica Indekslenebilir Ulke Kopyasi

Canlida `/en/regions/asia/austria`, Avusturya icerigiyle200/index ve kendine
canonical veriyor. Dogru `/en/regions/europe/austria` da ayri200. Kaynak kod
ulkenin varligini denetliyor ama kitasini dogrulamiyordu.

Duzeltme: bilinen ulke/kita referansindan ayni ulkenin dogru yoluna301.
Dil, sehir ve liste eki korunuyor; bilinmeyen ozel katalog ulkesi icin
cografi hedef uydurulmuyor. Gecersiz sehir404 kalir.14 dilde rota testleri
bu davranisi ve istasyon sorgusu yapilmamasini dogruluyor.

### Bilinmeyen Yollarda Basarili Uygulama Kabugu

Canlida `/en/does-not-exist-indexing-audit-20261022`, H1/canonical olmadan
200 uygulama kabugu veriyor. Header zaten noindex; bu sayfanin dizine
girecegi veya indeks dususunun tek nedeni oldugu iddia edilmiyor.

Duzeltme: statik dosyalar ve bilinen SPA aileleri gecildikten sonra
bilinmeyen aile404/no-store/noindex. Giris, profil, mesaj, yonetim, premium,
TV aktivasyonu, gelistirici portali ve cevrilmis yollar korunuyor. Gecici503
asla404'e cevrilmiyor. GET/HEAD ve gercek Express HTTP testleri eklendi.

### React Sonrasi Ana Icerigin Kaybolmasi

Eslestigi dogrulanmis SSR radyo verisi React Query placeholder'i olarak
kullaniliyor; API istegi gecici hata verince placeholder silinebiliyor.
Boylece sunucu200 ve makale vermis olsa bile olusturulmus DOM'da radyo
yerine hata ekrani cikabiliyor. Bu bir reproduksiyonla dogrulandi;16 Ekim
Google taramasinda ayni hatanin oldugunu kanitlamiyoruz.

Duzeltme: ag/408/429/5xx durumunda eslesen SSR makalesini koru; gercek
400/401/403/404/410 sonucunda geri getirme. Veriyi tam API onbellegine
yanlislikla yazma. Yerel/legacy makale secimindeki SSR/React farki da giderildi.

### Devam Butonundan Once Makalenin DOM'dan Kesilmesi

Mobil Google ekran goruntusunde de "more" kontrolu var. Mevcut React kodu
uzun makalenin devamini yalnizca gizlemek yerine DOM'dan tamamen kesiyordu.
Bu, Google'in indeks kaybinin kanitlanmis tek nedeni degil; ama SSR ile
olusturulmus ana icerigin farkli olmasina yol acan somut bir davranis.
Tam metin DOM'da tutulup ayni ac/kapat arayuzu gorsel kirpma ile korunuyor.

### Olcekte Kanitsiz Icerik Ureten Sablon

Yeni orneklemde35 farkli Ingilizce istasyon makalesinin28'inde belirlenen
genel reklam kaliplarindan en az biri bulundu. Bu olcum bir Google kalite
puani, kopya tespit sonucu veya ceza kaniti degil. Bes kaynak makalede
ayrica bastaki koseli parantez kalintisi var; API/SSR temizleme farklari
ham kaynak ile gorunen metin ayrimini gerektiriyor.

`station-description-template.ts` ulke/tur/oy verisinden yerel kultur,
guvenilir yayin, yuksek ses kalitesi veya populerlik gibi kanitsiz iddialar
uretebiliyor. Kullanici tarafindan baslatilan eksik-Ingilizce doldurma
aracinda kullaniliyor; gunluk otomasyonun bunu kesin calistirdigi iddia edilmiyor.

Duzeltme: yalnizca saglanan katalog konumu, etiket, dil, yayin formati ve
gecerli web adresini aktar. Oy sayisindan populerlik uretme. Bilgi yoksa
yazi uretme. Gecmis metinler topluca degistirilmedi ve uretim DB'sine
yazilmadi.20 kaynakli pilot metni ayri olarak korunuyor.

## 4. Neyi Kanitlayamayiz

GSC, Google'in sayfayi secmemesinin tum algoritmik nedenlerini aciklamiyor.
"Tum sorun301", "fazla sayfa otomatik ceza", "sitemap kuculurse kesin
indekslenir" veya "puan95 olunca indeks sorunu cozulur" sonucu cikmaz.
Kullanilan denetim CLI'i kurulu degildi; uydurma bir arac puani verilmedi.

Kalite/farklilasma ve dusuk kesif onceligi mevcut kanitlarla guclu bir
iyilestirme alanidir. Google'in [AI icerik rehberi](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
dogruluk ve kullaniciya deger ister. [Spam politikasindaki](https://developers.google.com/search/docs/essentials/spam-policies)
olcekli uretim suistimali bir sayfa-sayisi esigi degildir; bu siteye ceza
uygulandigini da bu rapor kanitlamaz.

Teknik uygunluk gerekli ama yeterli degildir.
[Google arama isleyisi](https://developers.google.com/search/docs/fundamentals/how-search-works)
indekse secimi ayri bir asama olarak aciklar.

### Dis Baglanti Kaniti

Google Baglantilar raporunda 457 dis baglanti var; gosterilen hedefin tamami
`/en`. En cok baglanti verenler arasinda mxrtoken.com (246), apple.com (134)
ve flixapp.net (44) var. "Dis otorite sifir" eski hipotezi bugunku veriyle
desteklenmiyor. Bu sayilar farkli alan adi sayisi veya baglanti kalitesi
puani degil. Pilot istasyonlara dis baglanti bu ozet tabloda gosterilmiyor.

Ic baglanti raporu yalnizca 15 baglanti gosteriyor. Bu gecikmeli/secili
rapordan sitede gercekte yalnizca 15 HTML baglantisi oldugu sonucu cikmaz;
canli SSR kaynaklarinda cok daha fazlasi olculdu. Hicbir alan adi bu sayilar
nedeniyle "zararli" ilan edilmedi, baglanti reddetme dosyasi gonderilmedi.
Kanita dayali ozet: `2026-10-22-gsc-links.txt`.

## 5. Yayin Kapisi ve Izleme

Yamalar `codex/design` uzerinde PR112'ye eklenecek. Ana surumde de bulunan
eski test sorunlari yoksayilmadan onarildi: schema-bagli index aramasi,
eksik journal kayitlari, tam migration baslangic verilerinin ayrilmasi,
aktif/pasif profil fixture'lari ve guncel font/baslik/ceviri sozlesmeleri.
Migration SQL dosyalari ve mevcut checksum'lari degistirilmedi. Uretim
veritabanina baglanilmadi veya editoriyal toplu is calistirilmadi.

Son yerel tam API kosumu: 2.896 test, 2.885 basarili, 0 hata, 11 atlanan.
Veritabani odakli kosum: 609 basarili, 0 hata; Mongo/PGlite kosullari nedeniyle
4 test yerelde calismadi, testler kapatilmadi.13 SEO/HTTP dosyasinin ilk
203 testi ve ardindan tum referans ulkelerin adres koruma testi de gecti.
Test ortami yalnizca loopback uzerinde
gecici PostgreSQL17.11; Node24.22.0. Son arayuz kontrolu, uretim derlemesi,
GitHub kontrolu ve yayin sonucu eklenmeden "canlida duzeldi" denmemeli.

Arayuz: 148 dosyada 2.259 test basarili. Makale parcasi gercek proje CSS'siyle
390/768/1512 piksel Chrome gorunumlerinde ac/kapat ve boyut degisimiyle test
edildi; bu parcali fixture testi tam canli Safari testinin yerine gecmez.
Ortak kutuphane, API, frontend ve importer dahil tum workspace tip kontrolu
basarili. Frontend, web ve API uretim derlemeleri basarili; mevcut buyuk
frontend chunk uyarilari devam ediyor.

GitHub kosumu `39802406685`, kodu cekmeden once Mongo8 konteynerini
baslatamadi. Gunlukte calisan image `ubuntu-24.04 / 20261018.339.1`;
Mongo kendi kernel6.19+ uyumsuzluk kontroluyle durdu. Bu uygulama testi
hatasiyla veya indeksleme sebebiyle karistirilmamali. Gecici olarak
`ubuntu-22.04` (resmi image belgesinde kernel6.8) secildi. Mongo/PostgreSQL
surumleri, gercek aktarim testleri ve yayin kapisi korunuyor; test atlama
veya Mongo'nun korumasini kapatma yok. Yeni kernel destegi dogrulaninca
runner guncellenmeli. Kaynaklar:
[MongoDB SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912),
[GitHub runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md).

Takip kosumu `39803518886` gercek Mongo/PostgreSQL aktarimi, tam API,
arayuz, tip kontrolu ve tum sunucu derlemelerini gecti. Paketleme asamasinda
`pnpm11.19.0 deploy --prod --legacy`, kaynak workspace durumunu degistirdi;
sonraki build komutu gereksiz bir production-only install tetikleyip
`esbuild` dahil gelistirme araclarini kaldirdi. Bu nedenle son acilis
testleri henuz calismadi ve yayin bekletildi. CI ve dort Dockerfile,
bu kaynak-workspace durum hatasinin duzeltilmis oldugu `pnpm11.28.1`
surumune birlikte sabitlendi. Uygulama bagimliliklari ve lockfile
yeniden uretilmedi. Kaynak: [pnpm11.28.0 duzeltmeleri](https://github.com/pnpm/pnpm/releases/tag/v11.28.0)
(source workspace state, issue15352), [pnpm11.28.1](https://github.com/pnpm/pnpm/releases/tag/v11.28.1).

Pilotun iki olcum sitemap'i korunacak. Diger diller ve mevcut iyi adresler
topluca kapatilmayacak. Yayin sonrasi gercek sayfalar, yeni301/404, tum
pilot makaleleri ve Google mobil olusturmasi tekrar kontrol edilmeli.
Basari olcusu sitemap kabul mesaji degil; yeni gercek taramalar,
URL bazinda indekse giris/kalicilik ve gosterimdir. Index garantisi yoktur.
