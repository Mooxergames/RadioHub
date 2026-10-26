import { truncateAtWordBoundary } from '@workspace/seo-shared/seo-config';

const slugs = ['mangoradio', 'a1', 'iran-international', 'reyfm-original'] as const;

// Translations of the same bounded facts, reviewed against the cited source records.
// Do not infer schedules, popularity, terrestrial reception or studio locations.
const copy: Record<string, readonly [string, string, string, string]> = {
  en: [
    'MANGORADIO is an online radio station. Its catalogue entry is tagged for music and variety and lists an MP3 stream at 128 kbps.',
    'A1 is an audio-stream entry in the Mega Radio catalogue. It lists the MP3 format but does not specify a homepage, genre tags or a bitrate.',
    'Iran International is a Persian-language news service covering Iran and world affairs. This catalogue entry lists an MP3 audio stream associated with the service.',
    "REYFM - #original is a web-radio entry linked to REYFM's official website. This catalogue entry lists an MP3 stream at 192 kbps.",
  ],
  de: [
    'MANGORADIO ist ein Internetradiosender. Der Katalogeintrag nennt Musik und Vielfalt als Schlagwörter und einen MP3-Stream mit 128 kbps.',
    'A1 ist ein Audiostream-Eintrag im Mega Radio-Katalog. Als Format ist MP3 angegeben; eine Website, Genre-Tags und eine Bitrate sind nicht angegeben.',
    'Iran International ist ein persischsprachiger Nachrichtendienst über Iran und das Weltgeschehen. Dieser Katalogeintrag führt einen zugehörigen MP3-Audiostream auf.',
    'REYFM - #original ist ein Webradio-Eintrag mit einem Link zur offiziellen REYFM-Website. Der Katalogeintrag führt einen MP3-Stream mit 192 kbps auf.',
  ],
  tr: [
    'MANGORADIO bir internet radyosudur. Katalog kaydında müzik ve çeşitlilik etiketleri ile 128 kbps MP3 ses akışı listelenir.',
    'A1, Mega Radio kataloğunda bir ses akışı kaydıdır. MP3 biçimi belirtilmiştir; web sitesi, tür etiketleri ve bit hızı belirtilmemiştir.',
    'Iran International, İran ve dünya gündemini ele alan Farsça bir haber hizmetidir. Bu katalog kaydında hizmetle ilişkili bir MP3 ses akışı listelenir.',
    'REYFM - #original, REYFM’nin resmî web sitesine bağlantı içeren bir internet radyosu kaydıdır. Katalog kaydında 192 kbps MP3 ses akışı listelenir.',
  ],
  es: [
    'MANGORADIO es una emisora de radio por internet. Su ficha incluye las etiquetas música y variedad y una transmisión MP3 de 128 kbps.',
    'A1 es una entrada de audio en el catálogo de Mega Radio. Indica el formato MP3, pero no especifica sitio web, etiquetas de género ni tasa de bits.',
    'Iran International es un servicio de noticias en persa sobre Irán y la actualidad mundial. Esta ficha incluye una transmisión de audio MP3 asociada al servicio.',
    'REYFM - #original es una entrada de radio por internet con un enlace al sitio oficial de REYFM. La ficha indica una transmisión MP3 de 192 kbps.',
  ],
  fr: [
    'MANGORADIO est une radio sur internet. Sa fiche porte les étiquettes musique et variété et indique un flux MP3 à 128 kbps.',
    'A1 est une entrée de flux audio du catalogue Mega Radio. Le format MP3 est indiqué, mais le site web, les genres et le débit ne sont pas précisés.',
    'Iran International est un service d’information en persan sur l’Iran et l’actualité mondiale. Cette fiche indique un flux audio MP3 associé au service.',
    'REYFM - #original est une entrée de webradio liée au site officiel de REYFM. Sa fiche indique un flux MP3 à 192 kbps.',
  ],
  pt: [
    'MANGORADIO é uma rádio na internet. A sua ficha inclui as etiquetas música e variedade e indica um fluxo MP3 de 128 kbps.',
    'A1 é uma entrada de áudio no catálogo Mega Radio. Indica o formato MP3, mas não especifica site, etiquetas de género ou taxa de bits.',
    'Iran International é um serviço de notícias em persa sobre o Irão e a atualidade mundial. Esta ficha indica um fluxo de áudio MP3 associado ao serviço.',
    'REYFM - #original é uma entrada de rádio na internet com ligação ao site oficial da REYFM. A ficha indica um fluxo MP3 de 192 kbps.',
  ],
  it: [
    'MANGORADIO è una radio online. La scheda riporta le etichette musica e varietà e un flusso MP3 a 128 kbps.',
    'A1 è una voce audio del catalogo Mega Radio. È indicato il formato MP3, ma non sono specificati sito web, generi o bitrate.',
    'Iran International è un servizio di notizie in persiano sull’Iran e sull’attualità mondiale. Questa scheda riporta un flusso audio MP3 associato al servizio.',
    'REYFM - #original è una voce di web radio collegata al sito ufficiale di REYFM. La scheda riporta un flusso MP3 a 192 kbps.',
  ],
  ru: [
    'MANGORADIO — интернет-радиостанция. В каталоге указаны теги «музыка» и «разнообразие», а также поток MP3 с битрейтом 128 kbps.',
    'A1 — запись аудиопотока в каталоге Mega Radio. Указан формат MP3; сайт, жанровые теги и битрейт не указаны.',
    'Iran International — новостная служба на персидском языке об Иране и мировых событиях. В этой записи каталога указан связанный с ней аудиопоток MP3.',
    'REYFM - #original — запись интернет-радио со ссылкой на официальный сайт REYFM. В каталоге указан поток MP3 с битрейтом 192 kbps.',
  ],
  ar: [
    'MANGORADIO محطة إذاعية عبر الإنترنت. يتضمن سجلها في الدليل وسمي الموسيقى والتنوع، ويسرد بثًا صوتيًا بصيغة MP3 بمعدل 128 kbps.',
    'A1 سجل لبث صوتي في دليل Mega Radio. يحدد صيغة MP3، لكنه لا يحدد موقعًا إلكترونيًا أو وسومًا للأنواع أو معدل بت.',
    'Iran International خدمة إخبارية باللغة الفارسية تغطي إيران والشؤون العالمية. يسرد هذا السجل في الدليل بثًا صوتيًا بصيغة MP3 مرتبطًا بالخدمة.',
    'REYFM - #original سجل لإذاعة عبر الإنترنت يتضمن رابطًا إلى موقع REYFM الرسمي. يسرد السجل بثًا بصيغة MP3 بمعدل 192 kbps.',
  ],
  zh: [
    'MANGORADIO 是一家网络电台。目录条目列有音乐和多样化标签，并注明提供码率为 128 kbps 的 MP3 音频流。',
    'A1 是 Mega Radio 目录中的音频流条目。条目注明格式为 MP3，但未注明网站、类型标签或码率。',
    'Iran International 是报道伊朗及全球时事的波斯语新闻服务。此目录条目列有与该服务相关的 MP3 音频流。',
    'REYFM - #original 是链接到 REYFM 官方网站的网络电台条目。目录注明其音频流为 192 kbps 的 MP3 格式。',
  ],
  ja: [
    'MANGORADIO はインターネットラジオ局です。カタログには音楽と多様性のタグ、および 128 kbps の MP3 ストリームが記載されています。',
    'A1 は Mega Radio カタログの音声ストリーム項目です。形式は MP3 と記載されていますが、ウェブサイト、ジャンルタグ、ビットレートは未記載です。',
    'Iran International はイランと世界の時事を扱うペルシャ語のニュースサービスです。このカタログ項目には、同サービスに関連する MP3 音声ストリームが記載されています。',
    'REYFM - #original は REYFM の公式サイトにリンクするウェブラジオの項目です。カタログには 192 kbps の MP3 ストリームが記載されています。',
  ],
  ko: [
    'MANGORADIO는 인터넷 라디오 방송국입니다. 카탈로그 항목에는 음악과 다양성 태그 및 128 kbps MP3 스트림이 기재되어 있습니다.',
    'A1은 Mega Radio 카탈로그의 오디오 스트림 항목입니다. MP3 형식은 기재되어 있지만 웹사이트, 장르 태그, 비트레이트는 명시되어 있지 않습니다.',
    'Iran International은 이란과 세계 시사를 다루는 페르시아어 뉴스 서비스입니다. 이 카탈로그 항목에는 해당 서비스와 관련된 MP3 오디오 스트림이 기재되어 있습니다.',
    'REYFM - #original은 REYFM 공식 웹사이트로 연결되는 인터넷 라디오 항목입니다. 카탈로그에는 192 kbps MP3 스트림이 기재되어 있습니다.',
  ],
  hi: [
    'MANGORADIO एक इंटरनेट रेडियो स्टेशन है। इसकी कैटलॉग प्रविष्टि में संगीत और विविधता के टैग तथा 128 kbps की MP3 स्ट्रीम दी गई है।',
    'A1, Mega Radio कैटलॉग की एक ऑडियो स्ट्रीम प्रविष्टि है। इसमें MP3 प्रारूप दिया गया है, लेकिन वेबसाइट, शैली के टैग और बिटरेट नहीं बताए गए हैं।',
    'Iran International ईरान और विश्व की समसामयिक घटनाओं पर फ़ारसी भाषा की समाचार सेवा है। इस कैटलॉग प्रविष्टि में सेवा से संबंधित MP3 ऑडियो स्ट्रीम दी गई है।',
    'REYFM - #original एक इंटरनेट रेडियो प्रविष्टि है, जो REYFM की आधिकारिक वेबसाइट से जुड़ी है। कैटलॉग में 192 kbps की MP3 स्ट्रीम दी गई है।',
  ],
  he: [
    'MANGORADIO היא תחנת רדיו באינטרנט. ברשומת הקטלוג מופיעות תגיות מוזיקה ומגוון וכן הזרמת MP3 בקצב 128 kbps.',
    'A1 היא רשומת הזרמת שמע בקטלוג Mega Radio. מצוין פורמט MP3, אך לא מצוינים אתר, תגיות ז’אנר או קצב סיביות.',
    'Iran International הוא שירות חדשות בשפה הפרסית המסקר את איראן ואת ענייני העולם. רשומת קטלוג זו מציינת הזרמת שמע MP3 הקשורה לשירות.',
    'REYFM - #original היא רשומת רדיו באינטרנט עם קישור לאתר הרשמי של REYFM. בקטלוג מצוינת הזרמת MP3 בקצב 192 kbps.',
  ],
};

const englishMeta = [
  'Listen to MANGORADIO online. This music-and-variety catalogue entry lists an MP3 stream at 128 kbps.',
  'A1 on Mega Radio: an MP3 audio-stream entry with no homepage, genre tags or specified bitrate in the catalogue.',
  'Listen to the Iran International audio stream, associated with the Persian-language news service covering Iran and world affairs.',
  'Listen to REYFM - #original online. This catalogue entry lists an MP3 stream at 192 kbps.',
];

export function getReviewedDescriptionCopy(slug: string, language: string): { full: string; meta: string } | undefined {
  const index = slugs.findIndex(value => value === slug);
  const full = copy[language]?.[index];
  if (!full) return;
  return { full, meta: language === 'en' ? englishMeta[index] : truncateAtWordBoundary(full, 160) };
}

export const REVIEWED_DESCRIPTION_SOURCES: Readonly<Record<string, readonly string[]>> = {
  mangoradio: ['https://mangoradio.de/', 'https://themegaradio.com/api/station/68a8c47dbd66579311ab228c'],
  a1: ['https://themegaradio.com/api/station/68a8c45ebd66579311aad313'],
  'iran-international': ['https://www.iranintl.com/', 'https://www.iranintl.com/en/202309250985'],
  'reyfm-original': ['https://rey.fm/', 'https://themegaradio.com/api/station/68a8c496bd66579311ab6165'],
};
