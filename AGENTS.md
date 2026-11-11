# Mega Radio tasarım çalışması

## Amaç ve kapsam

- Kaynak repo: https://github.com/mumiix58/RadioHub
- Bu çalışma için branch: `codex/design`.
- Kullanıcı ile Türkçe iletişim kur. Mega Radio Figma tasarımını kullanıcının
  belirlediği sayfa sırasıyla mevcut uygulamaya uygula.
- Mega Radio Figma dosyası: `Jf3ZOklsARouzh5Mop0rRz`, Web sayfası `517:1695`.
  İlk çalışılan ekran: favoriler `2035:6194`; profil referansı `2035:9624`.
  Her yeni sayfa için ilgili frame'i doğrula; kod yorumlarını Figma'nın güncel
  hali olarak kabul etme.
- Hazırlık ve dosya haritası: [docs/DESIGN_WORKFLOW.md](docs/DESIGN_WORKFLOW.md).

## Sayfa bazında çalışma

1. İstenen ekranın Figma frame'ini, cihaz boyutunu ve durumunu belirle.
2. İlgili Figma skill'ini okuyarak tasarım bağlamını ve ekran görüntüsünü al.
3. Mevcut ekranı aynı genişlik, dil, kullanıcı durumu ve veri durumuyla karşılaştır.
4. Yerleşim, boşluk, tipografi, renk, ikon, görsel ve etkileşim farklarını çıkar.
5. Mevcut bileşenleri kullanarak istenen sayfayı uygula. Ortak bileşen değişiyorsa
   onu kullanan diğer ekranlardaki etkisini kontrol et.
6. İlgili kontrolleri ve masaüstü/mobil görsel karşılaştırmayı yap. Sonuçta
   değişenleri, doğrulamayı ve kalan gerçek kısıtları kısaca belirt.

## Kodun organizasyonu

- Asıl web uygulaması: `artifacts/megaradio`; mockup-sandbox uygulamasını değiştirme
  (kullanıcı özellikle o uygulamayı istemedikçe).
- Sayfa yönlendirmesi: `src/App.tsx`, `src/components/lazy-routes.tsx` ve
  `src/lib/initial-home-components.ts` (bu yollar web uygulamasına göredir).
- Ortak görsel temel: `src/index.css`, `tailwind.config.ts`,
  `src/components/ui/`, `src/components/layout/`.
- Veri erişimi: `src/lib/queryClient.ts`; çok dilli yollar:
  `src/hooks/useSeoRouting.ts`; çeviriler: `src/hooks/useTranslation.ts`.
- Görsel düzenlemelerde oynatıcı yaşam döngüsünü, oturum açmayı, favorileri,
  yerelleştirmeyi, SEO yollarını ve erişilebilirlik davranışını koru.
- `public/sw.js` ve lazy oynatıcı yüklemesi özel davranış içerir; tasarım işi
  nedeniyle bunları yeniden kurma.
- Repo pnpm kullanır. npm/yarn lock dosyası oluşturma.
- `CLAUDE.md` ve `replit.md` içindeki bazı mimari notlar eskidir: mevcut frontend
  React 19.1, backend PostgreSQL kullanır. Kaynak kod ve package manifestlerini
  esas al. MongoDB uygulaması geçmiş/migrasyon bağlamındadır.
- Mevcut repo kuralına göre bir branch push edildiğinde açık PR kontrol edilir;
  yoksa PR açılır. Gerçek `origin` sahibini kullan; eski belgelerdeki başka repo
  sahibi örneklerini kopyalama. Main'e merge/deploy hazırlık işinin parçası değildir.

## Doğrulama komutları

Node.js 24 ve pnpm PATH üzerinde olmalıdır. Komutlar repo kökünden çalıştırılır.

```sh
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/megaradio run typecheck
pnpm --filter @workspace/megaradio run test
PORT=22507 BASE_PATH=/ pnpm --filter @workspace/megaradio run build
PORT=22507 BASE_PATH=/ pnpm --filter @workspace/megaradio run dev
```

`PORT` ve `BASE_PATH`, Vite config yüklenirken zorunludur; build için de verilir.
Frontend sunucusunun açılması API'nin çalıştığı anlamına gelmez. Veri içeren
ekranlar için uygun geliştirme API'si veya açıkça belirtilen test fixture'ları
gerekir. Üretim veritabanını varsayılan geliştirme ortamı olarak kullanma.

## Sohbetlerde zorunlu davranış birliği

- Birebir sohbet ile grup sohbeti aynı mesaj etkileşimlerini ve aynı ortak
  bileşenleri kullanır. Kullanıcı ayrıca söylemeden, birinde tamamlanan mesaj
  davranışını diğerinde de uygula; yeni tasarım varyasyonu üretme.
- Ortak kapsam: akıcı geçmiş kaydırma ve tutulabilir kaydırma göstergesi,
  son mesaja dönme oku, basılı tutma menüsü (Cevapla, Kopyala, Sabitle/Kaldır,
  Sil), cevap önizlemesi, sabit mesaj bandı, çoklu seçim ve silme onayı.
- Benden sil yalnızca ilgili kullanıcıyı etkiler. Herkesten sil, normal sohbetle
  aynı şekilde kullanıcının kendi mesajlarına uygulanır; karışık seçimlerde
  bu seçenek verilmez. Yetki ve sohbet üyeliği sunucuda doğrulanır.
- Görsel eklemek yeterli değildir: gerçek servis, kalıcılık, socket güncellemesi,
  önizleme verileri ve gerekli şema değişiklikleri de davranışla birlikte ele alınır.
- Bu ortak sözleşme korunmadan yeni bir sohbet ekranı tamamlanmış sayılmaz.

- Sohbet mini player yalnızca çalan radyo kartı görüş alanında değilken görünür;
  karta dönünce gizlenir. Birebir ve grup sohbeti ortak görünürlük kancasını kullanır.
  Serbest taşıma korunur; zemin ve ince çerçeve logonun baskın renginden türetilir.

- Sohbet keşfinde varsayılan/eksik/yüklenmeyen logoyu ve canlı decoder
  kontrolünü geçmeyen yayını sonuç olarak paylaşma. Kontrol tüm kataloğa
  uygulanmaz: en fazla iki sessiz ön aday, kısa geçerli sonuç önbelleği ve
  geçici bozuk-yayın karantinası kullanılır. Ana oynatıcı gerçekten çalmadan
  paylaşımı açma; iptal/arka plan durumunda kontrolleri temizle.

- Konuşma listesinde birebir ve grup satırları aynı sola kaydırma bileşenini
  kullanır: Diğer + Arşivle/Çıkar. Yatay hareketin sonundaki tıklama sohbeti
  açmaz; dikey liste kaydırması korunur. Diğer menüsü basılı tutmayla da açılır.
- Arşiv, sessize alma ve okunmadı işareti kullanıcıya özeldir. Temizle ve sil
  başka katılımcıların geçmişini değiştirmez. Grupta sohbeti silmeden önce
  ayrılmak gerekir; ayrıldıktan sonraki mesajlara erişim verilmez. Gerçek
  hesaplarda kalıcılık chat_inbox_state üzerinden sunucudadır; önizleme
  aynı davranışı ayrı kullanıcı anahtarıyla yerelde saklar.

- Sabitlenen içerik radyo ise ortak sabit bant play/pause ve canlı dinleyici
  fotoğraf şeridi kullanır; metin sabitlemesi aynı kompakt görünümü korur.
  Kart ve bant aynı oynatma kancasını kullanır. Dinleyiciler aynı stationId,
  gerçek playing durumu ve süresi dolmamış sohbet/grup presence verisiyle
  belirlenir; demo dinleyiciler gerçek sohbete eklenmez. Sabit radyo kontrolü
  görünürken aynı radyonun mini player'ını ayrıca gösterme.

- Sohbet mini player'ı duraklatılmış eski bir istasyonla girişte açılmaz.
  Çalan radyoyla giriş veya ziyaret sırasında gerçek playing durumu gerekir.
  Bu ziyaret içinde pause edilirse devam kontrolü kalır; sohbet/istasyon
  değişimi, blur, idle ve error eski görünürlük hakkını sıfırlar. Ortak
  useChatMiniPlayerEligibility birebir ve grupta zorunludur.

## İşlem geri bildirimi tasarım sözleşmesi

- Kullanıcının onayladığı profil fotoğrafı bildirimi, kısa başarı/hata geri
  bildirimlerinin ortak referansıdır. Ekran başına farklı stil üretme.
- Aktif mobil kaynak: src/components/ProfilePhotoFeedback.tsx. #000000 zemin,
  1px #292929 çerçeve, radius6, Ubuntu-Medium15/20, ortalı metin,302px/max90%,
  düğmesiz; akış dışında tab/mini player dock'unun üstünde16px, premium bandını
  örtmeden. Başarı7s/hata9s; erişilebilirlik süresi uzatabilir.
- Yeni ekranlarda aynı bileşeni yeniden kullan/ortaklaştır; işlem onayı isteyen
  modal ile geçici geri bildirimleri birbirine dönüştürme.

- Profilde telefon bildirimi (pushEnabled) uygulama içi zil listesinden ayrıdır.
  Master kapalıyken sunucu mobile/web push göndermez; zil kayıtları korunur.
  Bildirim tercihi cache'i hesap bazlıdır. Sistem izniyle uygulama tercihini
  karıştırma; sessiz başlangıç, açık kullanıcı eylemiyle izin ve hata rollback
  için aktif mobil usePushPreferences/notificationPreferences yapısını kullan.
