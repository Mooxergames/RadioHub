interface WebAnalyticsCopy {
  readonly direction: 'ltr' | 'rtl';
  readonly privacySettings: string;
  readonly noticeTitle: string;
  readonly noticeDescription: string;
  readonly description: string;
  readonly analyticsLabel: string;
  readonly advertisingDisabled: string;
  readonly allow: string;
  readonly continueWithout: string;
  readonly settings: string;
  readonly save: string;
  readonly close: string;
  readonly adsSettings: string;
  readonly saveError: string;
  readonly nextLoad: string;
}

// Local, immutable consent copy must also be available before translations load.
export const WEB_ANALYTICS_COPY = Object.freeze({
  en: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Privacy and cookie settings',
    noticeTitle: 'Optional website analytics',
    noticeDescription: 'Allow Google Analytics to measure visits to this website? This is optional.',
    description: 'Choose whether Google Analytics may measure visits to this website. This preference is separate from advertising settings.',
    analyticsLabel: 'Google Analytics website visits',
    advertisingDisabled: 'Advertising personalization and remarketing in Google Analytics are disabled.',
    allow: 'Allow', continueWithout: 'Continue without', settings: 'Settings', save: 'Save', close: 'Close',
    adsSettings: 'Advertising settings',
    saveError: 'Your preference could not be saved. Please try again. No saved change is confirmed.',
    nextLoad: 'This preference will apply on the next full page load. You do not need to reload now.',
  }),
  de: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Datenschutz- und Cookie-Einstellungen',
    noticeTitle: 'Optionale Website-Analyse',
    noticeDescription: 'Darf Google Analytics Besuche auf dieser Website messen? Dies ist freiwillig.',
    description: 'Wählen Sie, ob Google Analytics Besuche auf dieser Website messen darf. Diese Auswahl ist unabhängig von den Werbeeinstellungen.',
    analyticsLabel: 'Website-Besuche mit Google Analytics',
    advertisingDisabled: 'Personalisierte Werbung und Remarketing in Google Analytics sind deaktiviert.',
    allow: 'Erlauben', continueWithout: 'Ohne fortfahren', settings: 'Einstellungen', save: 'Speichern', close: 'Schließen',
    adsSettings: 'Werbeeinstellungen',
    saveError: 'Ihre Auswahl konnte nicht gespeichert werden. Bitte versuchen Sie es erneut. Eine gespeicherte Änderung ist nicht bestätigt.',
    nextLoad: 'Diese Auswahl gilt beim nächsten vollständigen Laden der Seite. Sie müssen jetzt nicht neu laden.',
  }),
  tr: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Gizlilik ve çerez ayarları',
    noticeTitle: 'İsteğe bağlı web sitesi analitiği',
    noticeDescription: 'Google Analytics bu web sitesine yapılan ziyaretleri ölçsün mü? Bu isteğe bağlıdır.',
    description: 'Google Analytics bu web sitesine yapılan ziyaretleri ölçebilsin mi, siz seçin. Bu tercih reklam ayarlarından bağımsızdır.',
    analyticsLabel: 'Google Analytics ile web sitesi ziyaretleri',
    advertisingDisabled: 'Google Analytics reklam kişiselleştirmesi ve yeniden pazarlaması kapalıdır.',
    allow: 'İzin ver', continueWithout: 'İzin vermeden devam et', settings: 'Ayarlar', save: 'Kaydet', close: 'Kapat',
    adsSettings: 'Reklam ayarları',
    saveError: 'Tercihiniz kaydedilemedi. Lütfen tekrar deneyin. Kaydedilmiş bir değişiklik doğrulanmadı.',
    nextLoad: 'Bu tercih, sayfa bir sonraki kez tamamen yüklendiğinde geçerli olacak. Şimdi yeniden yüklemeniz gerekmez.',
  }),
  es: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Configuración de privacidad y cookies',
    noticeTitle: 'Análisis web opcional',
    noticeDescription: '¿Permitir que Google Analytics mida las visitas a este sitio web? Es opcional.',
    description: 'Elige si Google Analytics puede medir las visitas a este sitio web. Esta preferencia es independiente de la configuración publicitaria.',
    analyticsLabel: 'Visitas al sitio web con Google Analytics',
    advertisingDisabled: 'La personalización publicitaria y el remarketing de Google Analytics están desactivados.',
    allow: 'Permitir', continueWithout: 'Continuar sin permitir', settings: 'Configuración', save: 'Guardar', close: 'Cerrar',
    adsSettings: 'Configuración publicitaria',
    saveError: 'No se pudo guardar tu preferencia. Inténtalo de nuevo. No se ha confirmado ningún cambio guardado.',
    nextLoad: 'Esta preferencia se aplicará la próxima vez que la página se cargue por completo. No es necesario recargar ahora.',
  }),
  fr: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Paramètres de confidentialité et des cookies',
    noticeTitle: 'Analyse facultative du site',
    noticeDescription: 'Autoriser Google Analytics à mesurer les visites sur ce site ? Ce choix est facultatif.',
    description: 'Choisissez si Google Analytics peut mesurer les visites sur ce site. Ce choix est indépendant des paramètres publicitaires.',
    analyticsLabel: 'Visites du site avec Google Analytics',
    advertisingDisabled: 'La personnalisation publicitaire et le remarketing dans Google Analytics sont désactivés.',
    allow: 'Autoriser', continueWithout: 'Continuer sans autoriser', settings: 'Paramètres', save: 'Enregistrer', close: 'Fermer',
    adsSettings: 'Paramètres publicitaires',
    saveError: 'Votre choix n’a pas pu être enregistré. Réessayez. Aucun changement enregistré n’est confirmé.',
    nextLoad: 'Ce choix prendra effet au prochain chargement complet de la page. Il n’est pas nécessaire de recharger maintenant.',
  }),
  pt: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Definições de privacidade e cookies',
    noticeTitle: 'Análise opcional do site',
    noticeDescription: 'Permitir que o Google Analytics meça as visitas a este site? É opcional.',
    description: 'Escolha se o Google Analytics pode medir as visitas a este site. Esta preferência é independente das definições de publicidade.',
    analyticsLabel: 'Visitas ao site com o Google Analytics',
    advertisingDisabled: 'A personalização de publicidade e o remarketing no Google Analytics estão desativados.',
    allow: 'Permitir', continueWithout: 'Continuar sem permitir', settings: 'Definições', save: 'Guardar', close: 'Fechar',
    adsSettings: 'Definições de publicidade',
    saveError: 'Não foi possível guardar a sua preferência. Tente novamente. Nenhuma alteração guardada foi confirmada.',
    nextLoad: 'Esta preferência será aplicada no próximo carregamento completo da página. Não precisa de recarregar agora.',
  }),
  it: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Impostazioni di privacy e cookie',
    noticeTitle: 'Analisi facoltativa del sito',
    noticeDescription: 'Consentire a Google Analytics di misurare le visite a questo sito? È facoltativo.',
    description: 'Scegli se Google Analytics può misurare le visite a questo sito. Questa preferenza è separata dalle impostazioni pubblicitarie.',
    analyticsLabel: 'Visite al sito con Google Analytics',
    advertisingDisabled: 'La personalizzazione pubblicitaria e il remarketing in Google Analytics sono disattivati.',
    allow: 'Consenti', continueWithout: 'Continua senza consentire', settings: 'Impostazioni', save: 'Salva', close: 'Chiudi',
    adsSettings: 'Impostazioni pubblicitarie',
    saveError: 'Impossibile salvare la preferenza. Riprova. Nessuna modifica salvata è stata confermata.',
    nextLoad: 'Questa preferenza sarà applicata al prossimo caricamento completo della pagina. Non occorre ricaricare ora.',
  }),
  ru: Object.freeze({
    direction: 'ltr',
    privacySettings: 'Настройки конфиденциальности и файлов cookie',
    noticeTitle: 'Необязательная веб-аналитика',
    noticeDescription: 'Разрешить Google Analytics измерять посещения этого сайта? Это необязательно.',
    description: 'Выберите, может ли Google Analytics измерять посещения этого сайта. Этот выбор не зависит от настроек рекламы.',
    analyticsLabel: 'Посещения сайта в Google Analytics',
    advertisingDisabled: 'Персонализация рекламы и ремаркетинг в Google Analytics отключены.',
    allow: 'Разрешить', continueWithout: 'Продолжить без разрешения', settings: 'Настройки', save: 'Сохранить', close: 'Закрыть',
    adsSettings: 'Настройки рекламы',
    saveError: 'Не удалось сохранить ваш выбор. Повторите попытку. Сохранение изменений не подтверждено.',
    nextLoad: 'Этот выбор вступит в силу при следующей полной загрузке страницы. Сейчас перезагружать её не нужно.',
  }),
  ar: Object.freeze({
    direction: 'rtl',
    privacySettings: 'إعدادات الخصوصية وملفات تعريف الارتباط',
    noticeTitle: 'تحليلات اختيارية للموقع',
    noticeDescription: 'هل تسمح لخدمة Google Analytics بقياس زيارات هذا الموقع؟ هذا اختياري.',
    description: 'اختر ما إذا كان بإمكان Google Analytics قياس زيارات هذا الموقع. هذا الخيار مستقل عن إعدادات الإعلانات.',
    analyticsLabel: 'زيارات الموقع عبر Google Analytics',
    advertisingDisabled: 'تخصيص الإعلانات وإعادة التسويق في Google Analytics معطلان.',
    allow: 'السماح', continueWithout: 'المتابعة دون السماح', settings: 'الإعدادات', save: 'حفظ', close: 'إغلاق',
    adsSettings: 'إعدادات الإعلانات',
    saveError: 'تعذر حفظ اختيارك. يرجى المحاولة مجددًا. لم يتم تأكيد حفظ أي تغيير.',
    nextLoad: 'سيُطبق هذا الخيار عند تحميل الصفحة بالكامل في المرة القادمة. لا تحتاج إلى إعادة تحميلها الآن.',
  }),
  zh: Object.freeze({
    direction: 'ltr',
    privacySettings: '隐私和 Cookie 设置',
    noticeTitle: '可选的网站分析',
    noticeDescription: '是否允许 Google Analytics 衡量本网站的访问情况？此项为可选。',
    description: '请选择是否允许 Google Analytics 衡量本网站的访问情况。此偏好与广告设置相互独立。',
    analyticsLabel: 'Google Analytics 网站访问分析',
    advertisingDisabled: 'Google Analytics 的广告个性化和再营销已停用。',
    allow: '允许', continueWithout: '不允许并继续', settings: '设置', save: '保存', close: '关闭',
    adsSettings: '广告设置',
    saveError: '无法保存您的偏好，请重试。尚未确认任何更改已保存。',
    nextLoad: '此偏好将在下次完整加载页面时生效，无需现在重新加载。',
  }),
  ja: Object.freeze({
    direction: 'ltr',
    privacySettings: 'プライバシーと Cookie の設定',
    noticeTitle: '任意のウェブサイト分析',
    noticeDescription: 'Google Analytics によるこのサイトへの訪問の測定を許可しますか？許可は任意です。',
    description: 'Google Analytics によるこのサイトへの訪問の測定を許可するか選択してください。この設定は広告設定とは別です。',
    analyticsLabel: 'Google Analytics によるサイト訪問の測定',
    advertisingDisabled: 'Google Analytics の広告のパーソナライズとリマーケティングは無効です。',
    allow: '許可する', continueWithout: '許可せずに続行', settings: '設定', save: '保存', close: '閉じる',
    adsSettings: '広告設定',
    saveError: '設定を保存できませんでした。もう一度お試しください。変更の保存は確認されていません。',
    nextLoad: 'この設定は次回ページを完全に読み込んだ際に適用されます。今すぐ再読み込みする必要はありません。',
  }),
  ko: Object.freeze({
    direction: 'ltr',
    privacySettings: '개인정보 및 쿠키 설정',
    noticeTitle: '선택적 웹사이트 분석',
    noticeDescription: 'Google Analytics가 이 웹사이트 방문을 측정하도록 허용하시겠습니까? 선택 사항입니다.',
    description: 'Google Analytics가 이 웹사이트 방문을 측정할 수 있는지 선택하세요. 이 설정은 광고 설정과 별개입니다.',
    analyticsLabel: 'Google Analytics 웹사이트 방문 측정',
    advertisingDisabled: 'Google Analytics의 광고 개인 최적화 및 리마케팅은 사용 중지되어 있습니다.',
    allow: '허용', continueWithout: '허용 없이 계속', settings: '설정', save: '저장', close: '닫기',
    adsSettings: '광고 설정',
    saveError: '설정을 저장하지 못했습니다. 다시 시도하세요. 변경 사항이 저장되었는지 확인되지 않았습니다.',
    nextLoad: '이 설정은 다음에 페이지를 완전히 불러올 때 적용됩니다. 지금 새로고침할 필요는 없습니다.',
  }),
  hi: Object.freeze({
    direction: 'ltr',
    privacySettings: 'निजता और कुकी सेटिंग',
    noticeTitle: 'वैकल्पिक वेबसाइट विश्लेषण',
    noticeDescription: 'क्या Google Analytics को इस वेबसाइट की विज़िट मापने की अनुमति दें? यह वैकल्पिक है।',
    description: 'चुनें कि Google Analytics इस वेबसाइट की विज़िट माप सकता है या नहीं। यह पसंद विज्ञापन सेटिंग से अलग है।',
    analyticsLabel: 'Google Analytics से वेबसाइट विज़िट का मापन',
    advertisingDisabled: 'Google Analytics में विज्ञापन वैयक्तिकरण और रीमार्केटिंग बंद हैं।',
    allow: 'अनुमति दें', continueWithout: 'बिना अनुमति जारी रखें', settings: 'सेटिंग', save: 'सहेजें', close: 'बंद करें',
    adsSettings: 'विज्ञापन सेटिंग',
    saveError: 'आपकी पसंद सहेजी नहीं जा सकी। फिर से कोशिश करें। किसी बदलाव के सहेजे जाने की पुष्टि नहीं हुई है।',
    nextLoad: 'यह पसंद अगली बार पेज पूरी तरह लोड होने पर लागू होगी। अभी फिर से लोड करना ज़रूरी नहीं है।',
  }),
  he: Object.freeze({
    direction: 'rtl',
    privacySettings: 'הגדרות פרטיות וקובצי Cookie',
    noticeTitle: 'ניתוח אופציונלי של האתר',
    noticeDescription: 'לאפשר ל-Google Analytics למדוד ביקורים באתר הזה? הבחירה אינה חובה.',
    description: 'בחרו אם לאפשר ל-Google Analytics למדוד ביקורים באתר הזה. בחירה זו נפרדת מהגדרות הפרסום.',
    analyticsLabel: 'מדידת ביקורים באתר באמצעות Google Analytics',
    advertisingDisabled: 'התאמה אישית של מודעות ושיווק מחדש ב-Google Analytics מושבתים.',
    allow: 'לאפשר', continueWithout: 'להמשיך ללא אישור', settings: 'הגדרות', save: 'שמירה', close: 'סגירה',
    adsSettings: 'הגדרות פרסום',
    saveError: 'לא ניתן לשמור את ההעדפה. נסו שוב. לא אושר ששינוי כלשהו נשמר.',
    nextLoad: 'העדפה זו תחול בטעינה המלאה הבאה של הדף. אין צורך לטעון אותו מחדש עכשיו.',
  }),
} satisfies Record<string, WebAnalyticsCopy>);

export function getWebAnalyticsCopy(language: string): WebAnalyticsCopy {
  return Object.hasOwn(WEB_ANALYTICS_COPY, language)
    ? WEB_ANALYTICS_COPY[language as keyof typeof WEB_ANALYTICS_COPY]
    : WEB_ANALYTICS_COPY.en;
}
