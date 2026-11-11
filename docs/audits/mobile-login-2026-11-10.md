# Mobil giriş denetimi — 2026-11-10

Kapsam: mobil frontend → mevcut yerel API kaynak kodu → PostgreSQL users → admin kullanıcı listesi. Admin ekranı değiştirilmedi. Üretim veritabanına yazılmadı; gerçek OAuth hesabıyla giriş yapılmadı. Canlı API dağıtımı ve cihazdaki sertifika/provider-console ayarları bu denetimle kesinleşmez.

| Yol | Bulgular |
| --- | --- |
| Apple | expo-apple-authentication; iOS usesAppleSignIn/plugin ve com.visiongo.megaradio audience eşleşiyor. POST /api/auth/apple kimlik JWT'sini doğrular; pgCreateUser/pgUpdateUser ve generateAuthToken kullanır. iOS cihaz E2E henüz doğrulanmadı; Android/web bu native SDK ile desteklenmiyor. |
| Google | Native Google SDK ve web/iOS client audience sunucu allowlist'iyle eşleşiyor. POST /api/auth/google doğrulama, mevcut hesap bağlantısı/yeni users kaydı ve token üretir. Web önizlemede native SDK yok; cihaz E2E henüz doğrulanmadı. |
| Facebook | ÇALIŞMIYOR. Mobil signInWithFacebook doğrudan unavailable döndürür. Sunucu GET /api/auth/facebook yapılandırma olsa bile TODO/501, callback de tamamlanmamış. Gerçek SDK/OAuth ve Meta uygulama yapılandırması gerekli; düğmenin görünmesi çalışan entegrasyon değildir. |
| E-posta | /api/auth/signup PostgreSQL pgCreateUser kullanır; /api/auth/mobile/login bcrypt kontrolü, pgUpdateUser(lastLoginAt), token üretimi. Mobil kayıt sonrası mobileLogin çağrılır. Signup emailVerificationRequired:true döndürür ama mobil akış otomatik login yapar; doğrulama politikası ayrıca netleştirilmeli. |

Admin bağlantısı: /api/admin/users → pgListAdminUsers → aynı users tablosu. Provider kimlikleri google_id/apple_id/facebook_id kolonlarında; admin authProvider eşlemesi bu kolonlardan türetilir. Kayıt admin paneline ayrı gönderilmez. Giriş mevcut hesabı günceller, her giriş yeni kullanıcı değildir. Sosyal e-posta eşlemesi mevcut hesaba provider bağlayabilir; Apple Hide My Email farklı adresse farklı hesap oluşabilir.

Doğrulama: yerel fixture OAuth/account route testlerinde 21/21, gerçek imza/issuer/audience/expiry doğrulayan mobile-social-verification testlerinde 4/4 geçti. Bu testler canlı provider ve gerçek DB yazımının E2E kanıtı değildir.

Sonraki kabul kapıları: Facebook gerçek entegrasyon; iOS Apple/Google ve Android Google test cihazında kullanıcı kontrollü giriş; ilk kaydın/admin listesi ve tekrar girişte tek kimliğin doğrulanması; e-posta doğrulama politikasının tamamlanması. Admin görsel işi daha sonra kalabilir.
