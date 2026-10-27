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
- Mevcut frontend React 19.1, backend yalnızca PostgreSQL kullanır. Kaynak kod
  ve package manifestlerini esas al. Eski veritabanı aktarım araçları kaldırılmıştır;
  uygulanmış PostgreSQL migration dosyalarını ve mevcut veri kimliklerini koru.
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
