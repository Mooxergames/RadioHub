# Mega Radio: dizine ekleme ve kesif incelemesi

Inceleme: 22 Ekim 2026, `sc-domain:themegaradio.com`.
Sayfa dizine ekleme raporunun veri tarihi **16 Ekim**, tarama istatistiklerinin
veri tarihi **20 Ekim**. Bunlar canli sayac degil.

## Sonuc

Tek bir 301 veya genel robots engeli bulunmadi. Uc ayri konu var:

1. **Duzeltilen teknik hata:** genel istasyon `updatedAt` alani, gercek sayfa
   icerigi degismese de site haritasinda yeni icerik tarihi olarak sunuluyor.
   Ayni alan ana/ulke sayfalarinin tarihlerine de yayiliyor. Bu yanlis sinyal
   kaldirildi; URL'ler, diller, indexability ve gerekli yonlendirmeler korundu.
2. **Olculen kesif sorunu:** Google taramalarinin %98'i yenileme, %2'si kesif.
   190.426 URL kesfedilmis ama dizine alinmamis. Site haritalari okunuyor;
   sorun sadece "Google site haritasini bulamiyor" degil.
3. **Secim/icerik sorunu:** Google bazi onemli sayfalari basariyla taramis,
   kendi standart adreslerini kabul etmis, yine de dizine secmemis. Genel
   tanitim metinleri ve cok sayida dil varyanti bir kalite/oncelik hipotezi;
   Search Console bunun kesin algoritmik nedenini aciklamiyor.

Bu duzeltme, Google'in dizine ekleyeceginin garantisi degildir. Kod yerelde
hazir; bu incelemede commit, push, merge veya uretim yayini yapilmadi.

## 1. Dususun Gercek Zaman Cizelgesi

Kaynak: Search Console'dan indirilen
`themegaradio.com-Coverage-2026-10-22.zip`, `Grafik.csv`.

| Rapor tarihi | Dizindeki URL |
| --- | ---: |
| 22 Eylul - 4 Ekim | 29 |
| 5 Ekim | 14 |
| 10 Ekim | 13 |
| 13 - 16 Ekim | 11 |

Dususu dogruladim. Fakat eski 29 URL'nin tam listesi elimizde yok; hangi 18
adresin hangi gerekceyle ciktigini bu toplam grafikten cikaramayiz.
Bugun eski URL'nin yonlenmesi ile gecmiste indeksin azalmasi arasinda tek
basina nedensellik kurulamaz.

16 Ekim'de bilinen tum URL'ler icin haric tutma dagilimi:

| Durum | URL |
| --- | ---: |
| Kesfedildi, su anda dizine eklenmis degil | 190.426 |
| Tarandi, su anda dizine eklenmis degil | 12.540 |
| Bulunamadi (404) | 736 |
| noindex nedeniyle haric | 511 |
| Soft 404 | 174 |
| Uygun standart etiketi olan alternatif | 102 |
| Google farkli standart secti | 64 |
| Yonlendirme hatasi | 61 |
| Standart belirtilmemis kopya | 54 |
| Yonlendirmeli sayfa | 27 |
| Sunucu hatasi (5xx) | 1 |
| **Toplam haric** | **204.696** |

"Tarandi" dogrulamasi 25 Eylul'de baslamis, 5 Ekim'de basarisiz olmus;
828 basarisiz, 11.712 bekleyen kayit gorunuyor. Tekrar tekrar dogrulama
baslatmak kok nedeni ortadan kaldirmaz.

## 2. Site Haritalari Gercekten Okunuyor

GSC'deki 29 gonderimin tamamini inceledim. Ana dizinin son okuma tarihi
20 Eylul ve kesfedilen sayfa sayisi 0 gorunuyor. Ancak alt haritalar Ekim'de
basariyla okunmus: `en/de/it/tr` icin 20 istasyon dosyasi toplam **200.000
dil bazli URL** bildiriyor. Bu, 200.000 farkli radyo demek degil.
Tur/ana sayfa dosyalari da basarili. Bazi alt dosyalar 20-22 Ekim'de okunmus.

Dolayisiyla ana dizindeki 0 degerinden "hic URL bulunmuyor" sonucu cikmaz.
Canli ana dizin ayrica 14 dili sunuyor; GSC'ye ayri ayri gonderilen dort dil,
sitenin toplam dil kapsami degil.

Canli `/sitemap-stations-en-1.xml` incelemesi:

- XML gecerli; 10.000 URL, 31.779.078 sikistirilmamis bayt.
- 23 hreflang etiketi var; bolgesel kodlar ve x-default dahil. Bunlar
  23 farkli dil sayfasi degil; 14 benzersiz dil hedefi var.
- 8.827 URL'nin `lastmod` tarihi 22 Ekim. Bu kadar sayfanin gercek ana
  iceriginin o gun degistigini gosteren bir editoryal kayit yok.
- Bu tek dosyanin dogrulanmasi tum site haritalarinin hatasiz oldugunu kanitlamaz.

Google, `lastmod` icin anlamli sayfa degisikligini yansitan guvenilir tarihler
kullanilmasini istiyor; site haritasi gonderimi dizine alma garantisi degil.
[Google site haritasi rehberi](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

## 3. Tarama ve Sunucu Sagligi

Son 90 gunde ana host icin 70.830 istek, ortalama 218 ms yanit suresi:

- Amac: %98 yenileme, %2 kesif.
- Yanit: %87 HTTP200, %8 HTTP404, %4 HTTP301, <%1 HTTP5xx.
- Dosya: %46 JSON, %16 JavaScript, %14 HTML.

Bu sayilar 70.830 farkli dizine alinabilir sayfa anlamina gelmez. Kaynak
yuklemeleri ve farkli bot turleri de dahil. JSON/JS dosyalarini korlemesine
engellemek sayfa olusturmayi bozabilir; boyle bir engel eklenmedi.

Host durumunun CSV ihracinda sunucu baglanti hatalari 6 Eylul'de %10,69,
7 Eylul'de %4,22. Sonraki sifir olmayan gunlerde oran %0,19 veya altinda.
5 Ekim'de, indeks sayisinin 29'dan 14'e dustugu gun, baglanti hatasi %0.
Bu yuzden gecmis sunucu problemini Ekim dususunun kanitlanmis nedeni
olarak sunamayiz. DNS ve robots getirme grafigi bu aralikta %0 hata.

Manuel islemler ve guvenlik sorunlari raporlarinda sorun algilanmadi.
Bu, algoritmik kalite/indeks secimi sorunu olmadiginin kaniti degildir.

Google'in kesif/yenileme oranini bizim atayabilecegimiz bir ayar yok.
URL envanterini tutarli tutmak, gereksiz tekrar taramalarini azaltmak ve
ozgun degeri guclendirmek uygulanabilir kaldiraclardir.
[Google tarama butcesi rehberi](https://developers.google.com/crawling/docs/crawl-budget)

## 4. Tekil URL Denetimleri

| Adres | Google'in kaydi |
| --- | --- |
| `/en/station/kronehit` | URL bilinmiyor; kayitli tarama yok |
| `/en/station/kral-fm` | URL bilinmiyor; kayitli tarama yok |
| `/de/sender/kronehit` | 22 Eylul 01:54:35 akilli telefon taramasi basarili; tarama ve indeks izni evet; Google standardi incelenen URL; yine de dizinde degil |
| `/tr/istasyon/kral-fm` | 7 Ekim 16:03:05 akilli telefon taramasi basarili; tarama ve indeks izni evet; Google standardi incelenen URL; yine de dizinde degil |

Ingilizce iki ornek bugun HTTP200, self-canonical ve indexable. Yalnizca
dil degistirmenin indekslemeyi cozecegini gosteren bir kanit yok.
KRAL FM denetiminde "site haritalari: gecici isleme hatasi" de gorunuyor;
bu alan tek basina bugunku XML'in bozuk oldugunu gostermiyor. Alt sitemap
basari kayitlari ve dogrudan XML kontroluyle birlikte degerlendirilmeli.

Daha once bildirilen `/ar/station/psy-trance`, ayni radyonun
`/ar/mahta/psy-trance` adresine tek 301 ile gidiyor; hedef HTTP200 ve
self-canonical. GSC'deki eski 5xx kaydi 7 Eylul taramasina ait. Bugunku
basarili canli test tarihsel hatayi silmez veya indeks secimini garanti etmez.
[URL Denetimi aciklamasi](https://support.google.com/webmasters/answer/9012289?hl=tr)

## 5. 301 Karari

GSC'nin mevcut **11 indexed orneginin tamami** bugun test edildi:
11/11 nihai HTTP200; noindex ve istek hatasi yok. Yedi eski adres tek
301 ile ayni radyonun Ingilizce standart adresine gidiyor. Dort adres
dogrudan HTTP200. Indeks raporu ile bugunku sunucu yaniti farkli zamanlari
gosteriyor; indeks sayaci henuz eski adresleri icerebilir.

Ana sayfa, Ingilizce Kronehit, Ingilizce KRAL FM ve Arapca PSY Trance
SSR HTML'inden ilk 60 benzersiz site ici baglanti da kontrol edildi:
**60 dogrudan HTTP200, 0 yonlendirme, 0 hata**. Bu sinirli bir orneklem;
tum site genelinde gereksiz yonlendirme olmadigi iddiasi degil.

Bu orneklerde kaldirilmasi gereken gereksiz 301 bulunmadi. Eski slug/dil
adreslerini tekrar 200 acmak kopyalari geri getirir; 404'e cevirmek eski
baglantilari kirar. Bu nedenle gerekli yonlendirmeler korundu. Rastgele
radyo veya ana sayfaya yonlendirme eklenmedi.

## 6. Icerik Miktari Hipotezi ve Kucuk Deney

Sorun "cok sayfa var, otomatik ceza var" diye aciklanamaz. Ancak mevcut
indeks secimine gore cok buyuk dil/URL envanteri, zayif farklilasma ile
birlesince kesfi ve onceliklendirmeyi zorlastirabilir. Bu bir hipotezdir.

Somut editoryal bulgular: Ingilizce Kronehit ve KRAL FM metinleri agirlikla
genel ovgu/tanitim paragraflari. Kronehit'te "resmi site" baglantisi bir
MP3 yayin adresine gidiyor. Radyo kimligi, dogru resmi adres, yayin dili,
program/format gibi dogrulanmis ve istasyona ozgu bilgiler daha faydali bir
iyilestirme alani. Bunlari uydurarak veya daha cok benzer metin ureterek
tamamlamak dogru degil. Uretim katalog verisi bu incelemede degistirilmedi.

Onerilen deney, butun dilleri kapatmak degil:

1. Mevcut adreslerden 10 Avusturya + 10 Turkiye Ingilizce sayfasi sec.
   Ornek adaylar Kronehit ve KRAL FM; kalite kontrolunu gecmeden pilotu
   "hazir" sayma. Katalog kaydi, yayin ve resmi kaynak dogrulanmali.
2. Her sayfada gercekten ozgun, dogrulanmis bilgi; calisan oynatici;
   dogru resmi site; tek standart adres ve tutarli hreflang sagla.
3. Mevcut ulke merkezlerinden ve ilgili sayfalardan dogrudan HTML
   baglantisi ver. Sadece XML'e yazip sayfalari yetim birakma.
4. Pilot icin ayri kucuk bir sitemap ile GSC olcumunu ayristir; mevcut
   saglam URL'leri topluca silme, robots ile kapatma veya noindex'e alma.
   Sitemap'i kucultmek Google'in bildigi diger URL'leri unutturmaz.
5. Yayin tarihindeki URL bazli durumu kaydet. 4-6 hafta boyunca kesfedilme,
   gercek tarama tarihi, secilen standart, indeksin korunmasi ve gosterim
   degisimini olc; bu sure bir indeksleme vaadi degil, deney penceresidir.
6. Anlamli ilerleme yoksa ayni sablonu yuz binlerce sayfaya genisletme.

Pilot bu incelemede uretimde etkinlestirilmedi; genel dil/ulke politikasi
degistirilmedi ve toplu isler durdurulmadi.

## 7. Uygulanan Kod Duzeltmesi

`artifacts/api-server/src/routes/seo-sitemap-routes.ts`:

- Istasyon ve ana/ulke sitemap URL'lerinden guvenilmez `lastmod` kaldirildi.
- Ayni yanlis tarih, ana ve dil bazli sitemap dizinlerinde de sunulmuyor.
- Istasyon/ana XML yanitlari operasyonel tarihten `Last-Modified` uretmiyor.
- Gercek XML govdesinin ETag'i korunuyor: operasyonel tarih degisip XML
  ayni kalirsa ayni ETag/304; URL kaldirilir veya gercek XML degisirse yeni
  ETag/200. Tarih tek basina degismis govdeyi gizleyemiyor.
- XML onbellek surumu v3 oldu; onceki sahte tarihli XML tekrar kullanilmiyor.
- Tur ve editoriyal blog tarihleri, URL uyeligi, diller, hreflang, sitemap
  saglik kapilari ve tum 301 davranisi korundu.

Kok veri baglantisi: `postgres-catalog-store.ts` genel guncellemelerde
`sourcePatch.updatedAt` ve `updated_at=now()` yaziyor. Manifest bunu
`maxUpdatedAt` olarak topluyor. Guvenilir ayri bir icerik revizyon tarihi
olmadan bunu "ana icerik degisti" diye yayinlamamak daha durust.
Gelecekte editoriyal `contentUpdatedAt` eklenirse dogrulanmis tarihler
yeniden sunulabilir; bu yamada veritabani migrasyonu yok.

Dogrulamalar:

- Yedi ilgili SEO test dosyasinda **117/117** gecti.
- API TypeScript kontrolu gecti.
- Varsayilan, web ve API sunucusu uretim derlemeleri gecti.
- `git diff --check` temiz.
- Node 25'in dot raporlayicisinda bir denemede test-verisi cozumleme hatasi
  oldu; spec raporlayicisi ile son surumun tum 117 testi basarili.
- Onceki Safari/ilk modul yukleme kurtarma duzeltmeleri ayni calisma
  alaninda korundu; bu yamayla Google indeks sorunu tamamen cozuldu
  seklinde sunulmuyor.

## 8. Yayin Sonrasi Gerekli Kontrol

Bu yerel yama onayli yayin akisindan gecmeden canli site degismez.
Yayin sonrasinda CDN TTL/onbellek durumu dikkate alinarak ana, dil ve
istasyon sitemap'leri tekrar alinmali; eski sahte tarihler kalmamali.
ETag/304 davranisi ve degisen URL uyeliginin HTTP200 ile sunulmasi tekrar
kontrol edilmeli. Sonra GSC'nin yeni tarama kayitlariyla etki olculmeli.
Google'in daha fazla kesif yapacagi veya sayfalari kesin indeksleyecegi
yayindan once soylenemez.

## Kanit Dosyalari

- `2026-10-22-indexed-source.json`, `2026-10-22-indexed-live.json`
- `2026-10-22-gsc-sitemaps.json`
- `2026-10-22-gsc-crawl-stats.txt`, `2026-10-22-gsc-host-status.txt`
- `2026-10-22-gsc-manual-actions.txt`, `2026-10-22-gsc-security-issues.txt`
- `2026-10-22-gsc-kronehit-en.txt`, `2026-10-22-gsc-kronehit-de.txt`
- `2026-10-22-gsc-kral-en.txt`, `2026-10-22-gsc-kral-tr.txt`
- `2026-10-22-internal-link-sample.json`

Uzak kod durumu inceleme basinda kontrol edildi: yerel HEAD ve origin/main
`0803430be` idi. Yeni uzak degisiklik olmadigindan pull/merge gerekmedi;
mevcut yerel duzeltmeler geri alinmadi.
