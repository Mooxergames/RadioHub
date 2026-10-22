# Search Console filtre incelemesi - 2026-10-22

## Kapsam ve kesin bulgular

Search Console `themegaradio.com` mulkundeki Sayfayi dizine ekleme acilir
menusunun 32 secenegi gercek arayuzden ayri ayri secilip kaydedildi: uc genel
grup, bir sitemap indexi, dort ana sitemap, dort tur sitemap'i ve yirmi
istasyon parcasi. Raporun Google tarafindaki son guncellemesi 2026-10-16;
2026-10-22 yayinlarinin sonucu degildir.

| Filtre | Dizine eklenmedi | Dizine eklendi |
| --- | ---: | ---: |
| Bilinen tum sayfalar | 204696 | 11 |
| Gonderilen tum sayfalar | 191820 | 2 |
| Yalnizca gonderilmemis sayfalar | 12876 | 9 |

Ham sayilar ve her filtrenin neden satirlari:
`2026-10-22-gsc-filter-comparison.json`. Hesap bilgileri ve oturum verileri bu
dosyaya aktarilmadi.

Gonderilen grupta 190426 URL kesfedilmis ancak henuz taranarak dizine
alinmamis, 1392 URL taranmis ancak secilmemis, iki URL ise eski noindex
durumundadir. Bu grupta 404, soft 404 veya 5xx satiri bulunmuyor. Eski hata
ornekleri gonderilmemis grupta yogunlasiyor.

Index sitemap filtresinin kendisi 191820/2 sayilarini gosteriyor. Dolayisiyla
sitemap listesindeki ana index icin bir yerde gorulen sifir, Google'in butun
sitemap agacini okuyamadiginin kaniti degildir. Acilir menu yalnizca raporu
filtreler; tarama veya dizine ekleme ayari degildir.

## Yanlis yorumlanmamasi gerekenler

- Dogrulamanin basarili olmasi URL'lerin dizine alindigi anlamina gelmez.
- Guncelleme/refresh taramasi, Google'in daha once bildigi URL'yi yeniden
  taramasidir. Yuzde 98 refresh, icerigin yuzde 98'inin degistigi anlamina gelmez.
- Gercek degisiklik olmayan operasyonel tarihler artik ortak sitemap
  kodundan lastmod olarak yayilmiyor. Bu duzeltme yalnizca pilotlara ait degil.
  Ancak Google'i zorunlu olarak kesif moduna geciren bir anahtar yoktur.
- Mevcut diger dillerin sitemap'leri kapatilmadi. Yirmi Ingilizce Avusturya ve
  Turkiye profili kontrollu icerik piloti; tek indexlenebilir envanter degil.
- Eski sitemap kaydini Search Console'dan silmek, Google'in eski URL'leri
  unutmasini veya indexleme hizlanmasini saglamaz.
- Tek bir sitenin tum URL'lerinin dizine alinmasi garanti edilemez. Kapsam ve
  icerik kalitesi, tarama talebi, sunucu sagligi ve tekillik birlikte etkilidir.

## Hata orneklerinin canli denetimi

Eski 404 grubunun export ettigi 736 URL'nin tamami anonim HTTP ile kontrol
edildi: 195 sonuc 200, 541 sonuc 410; halen 404 veya 5xx sonuc ve istek hatasi
yok. 720 URL'de yonlendirme var. 200 sonuclardan 28'inde kasitli kalite/noindex
karari korunuyor; bunlari sadece rapor temizlensin diye indexlenebilir yapmadik.
Indexlenebilir 200 sonuclarin tamami tek ve kendini gosteren canonical tasiyor.
410, gercekten kaldirilmis icerigin normal cevabi; 200'e cevrilmemelidir.

Ayrintili cevap zincirleri: `2026-10-22-gsc-404-recheck.json`.
Arac: `check-gsc-exclusions.mjs` (iki eszamanli istek, sinirli boyut/zaman,
yalnizca kendi alan adlari, kimlik bilgisi veya oturum cerezleri olmadan).
Google export'u ornek listesidir; her buyuk gruptaki tum URL'leri garanti etmez.
Bu test gercek Googlebot cekimi veya Google'in soft-404/kalite karari degildir.

Gonderilen gruptaki eski noindex iki ornek:

- https://themegaradio.com/en/station/3ne-wangaratta-1566-am
- https://themegaradio.com/en/station/radio-fabro

Ikisi de canlida dogrudan 200, HTTP ve HTML robots `index, follow`, tek
kendi canonical'i ve dogru H1 ile tekrar dogrulandi. Kullanici onayiyla
2026-10-22'de bu iki URL'nin grubu icin Google duzeltme dogrulamasi baslatildi;
arayuzde `Dogrulama basladi` durumu goruldu. Devam eden 5xx dogrulamasi
yeniden baslatilmadi. Normal 301'ler bir hata gibi topluca kaldirilmadi.

## Uygulama duzeltmeleri ve sinirlar

Istasyon detayinin Similar Radios ve More from Country bolumlerinde station
adlari JavaScript dugmesiydi. Gercek, yerellestirilmis `a[href]` baglantilarina
cevrildi. Normal tiklamada mevcut oynat-ve-git davranisi korunuyor;
Ctrl/Cmd/Shift/Alt ve orta tiklama tarayiciya birakiliyor. Oynatma ve favori
dugmeleri baglantinin icine yerlestirilmedi. SSR zaten ilgili baglantilari
sunuyordu: bu iyilestirme tek basina yillik index kaybinin kanitlanmis nedeni
olarak sunulmamalidir.

MongoDB suruculeri, eski cevrimdisi aktarici, Mongo test servisi, aktarici
Docker/Railway dosyalari ve kullanicinin acik onay verdigi `.migration-backup`
kaldirildi. PostgreSQL migration dosyalari byte-byte korunuyor; mevcut
public kimlikler ve tarihsel veri kokeni alanlari degistirilmiyor. Tarihsel
SQL kaniti bir Mongo baglantisi degildir. Guvenlik icin engellenen veritabani
portlari da korunuyor. Yeni guard testleri Mongo paketlerinin manifest,
lockfile, CI ve kurulmus API bagimliliklarina geri donmesini engelliyor.

Gercek production sureclerinin yerel kontrolunde ortaya cikan macOS
`reusePort` ENOTSUP sorunu da duzeltildi. Linux production davranisi ayni;
bu yerel platform sorunu Google'in Linux'taki indeksleme sebebi degildir.

## Yayin oncesi dogrulama

- Tum API: 2757 test, 2748 basarili, sifir hata, dokuz mevcut kosullu atlama.
- Frontend: 148 dosyada 2268 testin tamami basarili.
- Tum workspace TypeScript kontrolleri ve frontend production build basarili.
- API/web/proxy/monolit girisleri derlendi; production API/web paketleri
  gercek gecici PostgreSQL ile ve dis ag erisimi kapaliyken calistirildi.
  Iki pakette Mongo bagimliligi sifir.
- pnpm frozen kurulum gecti; yalnizca kullanilmayan Mongo paketleri cikti,
  baska paket surumleri yukseltilmedi. Uygulanmis SQL migration'larda diff yok.

Kodun yayin oncesi dogrulamasi, yayin tamamlandi veya Google indexlemeyi
duzeltti anlamina gelmez. Son yayin ve ek export denetim sonuclari ayri
release kanitiyla dogrulanmalidir.

## Resmi kaynaklar

- [Google Page Indexing report](https://support.google.com/webmasters/answer/7440203?hl=en)
- [Google crawl budget](https://developers.google.com/crawling/docs/crawl-budget)
- [Crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Sitemap lastmod](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
