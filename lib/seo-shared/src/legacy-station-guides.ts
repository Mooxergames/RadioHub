import type { SeoMetaTags } from './seo-config';
import { translateUrl } from './url-translations';
import { getLegacyStationGuideRoute } from './legacy-station-guide-routes';

export interface LegacyStationGuide {
  id: string;
  path: string;
  sourcePaths: readonly string[];
  language: 'en' | 'ar';
  title: string;
  seoTitle: string;
  description: string;
  intro: string;
  scopeNote: string;
  choices: readonly {
    name: string;
    place: string;
    copy: string;
    officialListen: { label: string; url: string };
    sources: readonly { label: string; url: string }[];
  }[];
  faq: readonly { question: string; answer: string }[];
}

export const LEGACY_GUIDE_REVIEWED_AT = '2026-11-11';

// These documents do not identify a successor for an unbound station record.
// The server may publish them only after every real station ownership lookup misses.
export const LEGACY_STATION_GUIDES: readonly LegacyStationGuide[] = [
  {
    id: 'radar-4',
    path: '/af/station/radar-4',
    sourcePaths: ['/af/station/radar-4'],
    language: 'en',
    title: 'RADAR in Lisbon or RadaR in Darmstadt?',
    seoTitle: 'RADAR Lisbon or Radio Darmstadt? | MegaRadio',
    description: 'Compare RADAR 97.8 in Lisbon with Radio Darmstadt: identify the station by place, frequency and programme, then choose its official listening page.',
    intro: 'A frequency is a better clue than the capital letters. If you remember 97.8 on a radio near Lisbon, look at the Portuguese station. If your preset said 103.4 in Darmstadt, that points to the German community station, but that FM dial setting is now historical.',
    scopeNote: 'These are distinct broadcasters; the name in this link does not identify one of them.',
    choices: [
      {
        name: 'RADAR 97.8 FM',
        place: 'Lisbon / Almada, Portugal',
        copy: 'Look for RADAR at 97.8 FM. The Portuguese broadcasters’ association lists Almada as its municipality and gives a Lisbon contact address. The station calls its programme archive “Podcasts RADAR”; use that for a past item or the broadcaster’s listening page for its radio service.',
        officialListen: { label: 'Open RADAR Lisboa’s listening page', url: 'https://radarlisboa.fm/links-emissao/' },
        sources: [
          { label: 'RADAR: programmes and podcasts', url: 'https://radarlisboa.fm/' },
          { label: 'Portuguese broadcasters’ association: Radio Radar', url: 'https://apradiodifusao.pt/directories/radio-radar/' },
        ],
      },
      {
        name: 'RadaR / Radio Darmstadt',
        place: 'Darmstadt, Germany',
        copy: 'This is the local station run by RadaR e.V. in Darmstadt. Its schedule includes community affairs, culture and music. The broadcaster directs former 103.4 FM listeners to DAB+ or the web. On its website, choose “Jetzt Radio hören”; the Mediathek is for programmes you missed.',
        officialListen: { label: 'Open Radio Darmstadt’s web player', url: 'https://radiodarmstadt.de/' },
        sources: [
          { label: 'Radio Darmstadt: FM distribution notice', url: 'https://radiodarmstadt.de/ukw-abschaltung-bei-radio-darmstadt/' },
        ],
      },
    ],
    faq: [{
      question: 'My Darmstadt preset is silent. Did RadaR move to Lisbon’s 97.8?',
      answer: 'No. They are separate stations. Radio Darmstadt says its FM distribution ended on 30 June 2026. For the Darmstadt programme, look for Radio Darmstadt on DAB+ or use its website; 97.8 identifies the Portuguese station.',
    }],
  },
  {
    id: 'rock-fm-23',
    path: '/ar/mahta/rock-fm-23',
    sourcePaths: ['/ar/station/rock-fm-23', '/ar/mahta/rock-fm-23'],
    language: 'ar',
    title: 'أي إذاعة Rock FM تقصد؟ دليل بوخارست وموسكو وألمانيا',
    seoTitle: 'Rock FM: دليل رومانيا وروسيا وألمانيا | MegaRadio',
    description: 'ميّز بين محطات Rock FM في بوخارست وموسكو وألمانيا بحسب المدينة والتردد والبرامج، واختر صفحة الاستماع الرسمية للمحطة التي تقصدها.',
    intro: 'اسم Rock FM على شاشة المذياع لا يحدد المحطة بمفرده. ابحث أولاً عن المدينة التي كنت فيها أو عن اسم برنامج تتذكره. وعند فتح موقع المحطة، انتبه إلى الفرق بين بثها الرئيسي والقنوات التي خصصتها لنوع موسيقي أو لعقد معين.',
    scopeNote: 'هذه أمثلة لثلاث محطات مستقلة تحمل الاسم نفسه، وليست إحداها اختيارًا تلقائيًا لهذا العنوان.',
    choices: [
      {
        name: 'Rock FM România',
        place: 'بوخارست، رومانيا',
        copy: 'تسجّل الإذاعة تردد 100.6 FM لبوخارست، وتذكر SC Canet Radio SRL بوصفها الجهة التي تقدم برنامج Rock FM. ومن علامات هذه المحطة البرنامج الروماني Morning Glory مع Răzvan Exarhu. يحمل مدخل الاستماع الرئيسي اسم «Ascultă Rock FM».',
        officialListen: { label: 'افتح مشغّل Rock FM الرومانية', url: 'https://www.rockfm.ro/' },
        sources: [
          { label: 'Rock FM: تردد بوخارست', url: 'https://www.rockfm.ro/vreau-reclama/contact/1/bucuresti' },
          { label: 'Rock FM: بيانات الجهة المقدمة للبرنامج', url: 'https://www.rockfm.ro/pagini/5/date-furnizor-de-servicii-de-programe' },
        ],
      },
      {
        name: 'ROCK FM Москва',
        place: 'موسكو، روسيا',
        copy: 'إذا كنت تتذكر 95.2 FM في موسكو، فهذا هو التردد الذي تسجّله المحطة الروسية للمدينة. ويعرض موقعها، إلى جانب ROCK FM الرئيسية، خيارات حسب الحقبة مثل 70s و80s. اختر اسم المحطة من المشغّل إذا أردت البرنامج الرئيسي.',
        officialListen: { label: 'افتح مشغّل ROCK FM الروسية', url: 'https://www.rockfm.ru/' },
        sources: [{ label: 'ROCK FM: المدن والترددات', url: 'https://www.rockfm.ru/towns' }],
      },
      {
        name: 'ROCK FM Deutschland',
        place: 'فاينهايم ومنطقة الراين ونيكار، ألمانيا',
        copy: 'في منطقة الراين ونيكار تذكر المحطة الألمانية 106.1 FM، وفي مدينة فاينهايم تذكر 107.7 FM. وإذا كنت تستخدم مذياعًا رقميًا في بادن فورتمبيرغ، تدرج صفحة الاستقبال القناة 11B على DAB+. يتيح لك الموقع الاختيار بين ROCK FM وقنوات موسيقية متخصصة.',
        officialListen: { label: 'افتح مشغّل ROCK FM الألمانية', url: 'https://www.rockfm.de/' },
        sources: [{ label: 'ROCK FM: الاستقبال عبر FM وDAB+', url: 'https://www.rockfm.de/service/empfang' }],
      },
    ],
    faq: [{
      question: 'وجدت عدة قنوات في مشغّل المحطة. كيف أرجع إلى البرنامج الرئيسي؟',
      answer: 'في الموقع الروماني اختر «Ascultă Rock FM» لا «Rock Românesc». وفي الموقع الروسي اختر ROCK FM نفسها، لا إحدى قنوات 70s أو 80s. الخيار الأول في كل مثال هو مدخل المحطة الرئيسية، أما القنوات الأخرى فخيارات موسيقية مميزة بالاسم.',
    }],
  },
];

export function getLegacyStationGuide(path: string): LegacyStationGuide | null {
  const route = getLegacyStationGuideRoute(path);
  return route ? LEGACY_STATION_GUIDES.find(guide => guide.id === route.id) ?? null : null;
}

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);

function safeSource(value: string): boolean {
  try {
    if (!value.startsWith('https://') || /[\s\\]/.test(value)) return false;
    const url = new URL(value);
    return !url.username && !url.password && url.protocol === 'https:';
  } catch { return false; }
}

export function buildLegacyStationGuideSeo(guide: LegacyStationGuide): SeoMetaTags {
  const canonical = `https://themegaradio.com${guide.path}`;
  return {
    title: guide.seoTitle, description: guide.description, canonical,
    robots: 'index, follow, max-image-preview:large', noIndex: false,
    hreflangs: [], ogLocaleAlternates: [],
    ogTitle: guide.seoTitle, ogDescription: guide.description, ogType: 'website', ogUrl: canonical,
    ogLocale: guide.language === 'ar' ? 'ar_AR' : 'en_US',
    twitterTitle: guide.seoTitle, twitterDescription: guide.description,
    language: guide.language,
  };
}

export function buildLegacyStationGuideSchema(guide: LegacyStationGuide): unknown[] {
  const url = `https://themegaradio.com${guide.path}`;
  const home = guide.language === 'ar' ? 'الرئيسية' : 'Home';
  return [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: home, item: `https://themegaradio.com/${guide.language}` },
      { '@type': 'ListItem', position: 2, name: guide.title, item: url },
    ],
  }, {
    '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${url}#webpage`,
    url, name: guide.title, description: guide.description, inLanguage: guide.language,
    dateModified: LEGACY_GUIDE_REVIEWED_AT, isAccessibleForFree: true,
    mainEntity: {
      '@type': 'ItemList', itemListElement: guide.choices.map((choice, index) => ({
        '@type': 'ListItem', position: index + 1, name: choice.name,
        ...(safeSource(choice.officialListen.url) ? { url: choice.officialListen.url } : {}),
      })),
    },
  }];
}

export function renderLegacyStationGuideHtml(guide: LegacyStationGuide): string {
  const ar = guide.language === 'ar';
  const sourceLink = (source: { label: string; url: string }) => safeSource(source.url)
    ? `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)}</a>` : esc(source.label);
  return `<main class="radio-journal radio-legacy-guide" lang="${guide.language}" dir="${ar ? 'rtl' : 'ltr'}" data-legacy-guide-id="${esc(guide.id)}">
    <nav aria-label="breadcrumb"><ol class="radio-journal-crumbs"><li><a href="/${guide.language}">${ar ? 'الرئيسية' : 'Home'}</a></li><li><span aria-current="page">${esc(guide.title)}</span></li></ol></nav>
    <article><header class="radio-journal-heading"><span class="radio-journal-eyebrow">${ar ? 'دليل المحطات' : 'Station guide'}</span><h1>${esc(guide.title)}</h1><p class="radio-journal-intro">${esc(guide.intro)}</p><div class="radio-journal-byline"><span>MegaRadio</span><span>${ar ? 'آخر مراجعة للمصادر' : 'Sources reviewed'} <time datetime="${LEGACY_GUIDE_REVIEWED_AT}">${LEGACY_GUIDE_REVIEWED_AT}</time></span></div></header>
    <div class="radio-journal-prose"><p>${esc(guide.scopeNote)}</p>${guide.choices.map(choice => `<section><h2>${esc(choice.name)}</h2><p><strong>${esc(choice.place)}</strong></p><p>${esc(choice.copy)}</p><p>${sourceLink(choice.officialListen)}</p><ul>${choice.sources.map(source => `<li>${sourceLink(source)}</li>`).join('')}</ul></section>`).join('')}
    <section><h2>${ar ? 'أسئلة شائعة' : 'Questions about these stations'}</h2>${guide.faq.map(item => `<h3>${esc(item.question)}</h3><p>${esc(item.answer)}</p>`).join('')}</section>
    <section class="radio-journal-explore"><h2>${ar ? 'اكتشف محطات أخرى' : 'Explore more stations'}</h2><a href="/${guide.language}">${ar ? 'دليل MegaRadio' : 'MegaRadio directory'}</a><a href="/${guide.language}${translateUrl('/search', guide.language)}">${ar ? 'ابحث عن محطة بالاسم' : 'Search for a station by name'}</a></section></div></article>
  </main>`;
}
