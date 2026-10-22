export interface IndexingPilotProfile {
  id: string;
  slug: string;
  countryCode: 'AT' | 'TR';
  homepage: string;
  full: string;
  meta: string;
  sources: readonly string[];
}

// A bounded editorial cohort, reviewed 2026-10-22. No database writes, new
// station identities or locale exclusions. Remove this module to roll back.
export const INDEXING_PILOT: readonly IndexingPilotProfile[] = [
  {
    id: '68a8c478bd66579311ab1795', slug: 'kronehit', countryCode: 'AT',
    homepage: 'https://www.kronehit.at/',
    full: 'Kronehit is an Austrian music radio station whose main service combines chart music with news, weather and traffic information. It is distinct from the additional themed channels carrying the Kronehit name.\n\nThe station publishes its charts and song search alongside programme information, podcasts and an Austrian frequency finder. Its own website is the primary source for the current schedule and terrestrial reception details.',
    meta: 'Listen to Kronehit from Austria: chart music, news, weather and traffic. Find the main live station and its official website.',
    sources: ['https://www.kronehit.at/'],
  },
  {
    id: '68a8c483bd66579311ab300e', slug: 'orf-radio-wien', countryCode: 'AT',
    homepage: 'https://wien.orf.at/radio/',
    full: 'Radio Wien is the ORF regional radio service for Vienna. Its German-language output connects music with life in the Austrian capital, including local stories, interviews and magazine features.\n\nThe Radio Wien editorial site brings together the programme schedule, expert interviews, event information and audio from the station. This is the Vienna service, rather than the separate ORF stations for other Austrian provinces.',
    meta: 'Radio Wien is ORF regional radio for Vienna. Listen live to its music, local stories, interviews and magazine programming.',
    sources: ['https://wien.orf.at/radio/'],
  },
  {
    id: '68a8c470bd66579311ab01ef', slug: 'fm4-orf', countryCode: 'AT',
    homepage: 'https://fm4.orf.at/',
    full: 'FM4 is the ORF youth and culture radio service, broadcasting in German and English. Its music ranges across hip-hop, indie pop, electronic music, punk and guitar-led styles, with a particular interest in Austrian artists.\n\nBeyond music, FM4 covers pop culture and social developments. Specialist evening programmes explore individual scenes and genres. The main FM4 broadcast is separate from the dedicated FM4 Dance channel.',
    meta: 'Listen to ORF FM4: German- and English-language radio with alternative music, Austrian artists, pop culture and specialist programmes.',
    sources: ['https://fm4.orf.at/story/about-fm4-100'],
  },
  {
    id: '68a8c483bd66579311ab2ffe', slug: 'orf-hitradio-o3-hq', countryCode: 'AT',
    homepage: 'https://oe3.orf.at/',
    full: 'Hitradio Ö3 is an Austrian ORF radio service combining popular music with entertainment, news and traffic coverage. Its programme includes the Ö3-Wecker morning show and the discussion format Frag das ganze Land.\n\nThe broadcaster publishes programme details, music features and traffic information through its own site. This catalogue entry carries the higher-bitrate stream of the main Ö3 service; it is not a separate station with a different schedule.',
    meta: 'Listen to ORF Hitradio Ö3 from Austria: popular music, the Ö3-Wecker morning show, entertainment and traffic information.',
    sources: ['https://oe3.orf.at/'],
  },
  {
    id: '68a8c482bd66579311ab2e38', slug: 'o1-orf-hq', countryCode: 'AT',
    homepage: 'https://oe1.orf.at/',
    full: 'Ö1 is an ORF radio service devoted to journalism, culture, knowledge and music. Its output includes news journals, literature, radio drama, classical music and jazz, rather than a continuous chart-music format.\n\nThe official programme directory includes the Journale news output and the science series Dimensionen, as well as concerts and cultural discussions. This entry provides the higher-bitrate stream of the same Ö1 programme.',
    meta: 'Listen to ORF Ö1: Austrian radio for journalism, culture, science, literature, classical music and jazz, including the Journale.',
    sources: ['https://oe1.orf.at/'],
  },
  {
    id: '68a8c483bd66579311ab3007', slug: 'orf-radio-niederosterreich-hq', countryCode: 'AT',
    homepage: 'https://noe.orf.at/player',
    full: 'Radio Niederösterreich is the ORF regional radio service for Lower Austria. It combines music with regional reporting and interviews, including the Radio NÖ journals and the Nahaufnahme interview series.\n\nIts broadcaster also takes programmes into local communities through Radio 4/4 and Radio NÖ-Frühschoppen. The HQ catalogue entry is an alternative-quality stream of Radio Niederösterreich, not a different editorial service.',
    meta: 'Radio Niederösterreich: ORF radio for Lower Austria, with music, regional journals, interviews and broadcasts from local communities.',
    sources: ['https://noe.orf.at/studio/stories/faq/', 'https://noe.orf.at/magazin/stories/3195644/'],
  },
  {
    id: '68a8c493bd66579311ab59f1', slug: 'radio-vorarlberg', countryCode: 'AT',
    homepage: 'https://vorarlberg.orf.at/radio/',
    full: 'Radio Vorarlberg is the ORF regional radio service for Austria\'s westernmost province. Its editorial offering connects the live radio programme with stories and discussions concerning life in Vorarlberg.\n\nThe official radio site includes the Focus discussion series, gardening features, recipes and programme audio. It is the regional Vorarlberg service, distinct from the national ORF channels Ö1, Ö3 and FM4.',
    meta: 'Listen to ORF Radio Vorarlberg, the regional radio service for western Austria, with local stories, discussions and programme features.',
    sources: ['https://vorarlberg.orf.at/radio/'],
  },
  {
    id: '68a8c483bd66579311ab3015', slug: 'orf-tirol-hq', countryCode: 'AT',
    homepage: 'https://tirol.orf.at/radio/',
    full: 'Radio Tirol is the ORF regional radio service for Tyrol. Its programme sits alongside the broadcaster\'s Tyrolean news coverage, with a separate radio programme directory and audio archive.\n\nThe official Radio Tirol site gathers programmes, podcasts and recordings for listeners interested in the region. The HQ label here identifies the stream quality of Radio Tirol; it does not identify an additional station or a separate programme schedule.',
    meta: 'Listen to ORF Radio Tirol, the regional radio service for Tyrol. Discover its live programme, regional coverage and official radio site.',
    sources: ['https://tirol.orf.at/radio/'],
  },
  {
    id: '68a8c483bd66579311ab300c', slug: 'orf-radio-steiermark-hq', countryCode: 'AT',
    homepage: 'https://steiermark.orf.at/player/',
    full: 'Radio Steiermark is the ORF regional radio service for Styria in Austria. This entry carries the HQ stream of that regional programme, rather than a separately programmed music channel.\n\nThe broadcaster\'s Styrian service provides regional reporting and access to the live radio programme through its official player. It should not be confused with Antenne Steiermark, which is a different broadcaster.',
    meta: 'Listen to ORF Radio Steiermark, the regional service for Styria in Austria. This entry carries the HQ stream of the main programme.',
    sources: ['https://steiermark.orf.at/player/', 'https://steiermark.orf.at/'],
  },
  {
    id: '68a8c483bd66579311ab3004', slug: 'orf-radio-karnten', countryCode: 'AT',
    homepage: 'https://kaernten.orf.at/radio/',
    full: 'Radio Kärnten is the ORF regional radio service for Carinthia. It brings together local subjects, music and discussion, with dedicated editorial sections for the province\'s cultural and musical life.\n\nIts official radio site includes the Schlagerparade, Musiparade and Streitkultur programmes. The station also introduces musicians from the region through its Startup music feature. It is distinct from the commercial Antenne Kärnten service.',
    meta: 'Listen to ORF Radio Kärnten: Carinthian regional radio with local subjects, music, the Schlagerparade and discussion programmes.',
    sources: ['https://kaernten.orf.at/radio/'],
  },
  {
    id: '68a8c478bd66579311ab175d', slug: 'kral-fm', countryCode: 'TR',
    homepage: 'https://www.kralmuzik.com.tr/radyo/kral-fm',
    full: 'Kral FM is a Turkish-language music station in the Kral Müzik radio network. It is a separate service from Kral Pop, with its own live broadcast and presenter-led programme schedule.\n\nThe official Kral FM page brings together the live station, presenter information, music news and broadcast frequencies. The linked Kral Müzik schedule is the authoritative source for current programmes; named shows and broadcast times can change.',
    meta: 'Listen to Kral FM from Turkey, a Turkish-language music station in the Kral Müzik network, distinct from Kral Pop.',
    sources: ['https://www.kralmuzik.com.tr/radyo/kral-fm'],
  },
  {
    id: '68a8c4a1bd66579311ab7b7b', slug: 'virgin-radio-turkiye', countryCode: 'TR',
    homepage: 'https://karnaval.com/radyolar/virginradio',
    full: 'Virgin Radio Türkiye is a music radio service on the Karnaval network. Its publisher identifies the station with rap, hip-hop and R&B, distinguishing it from the other Virgin-branded stations operating in different countries.\n\nThe Turkish service has its own live station page within Karnaval, alongside programme information and reception details. This entry is for Virgin Radio Türkiye, not Virgin Radio UK or another international Virgin Radio feed.',
    meta: 'Listen to Virgin Radio Türkiye on the Karnaval network, with rap, hip-hop and R&B. This is the Turkish Virgin Radio service.',
    sources: ['https://karnaval.com/radyolar/virginradio'],
  },
  {
    id: '68a8c47fbd66579311ab2576', slug: 'metro-fm', countryCode: 'TR',
    homepage: 'https://metrofm.com.tr/',
    full: 'Metro FM is a Turkish radio service focused on international hit music. Its official music output includes a Top 40 chart and a recently played list, with tracks from international pop and dance artists.\n\nMetro FM publishes its programmes and regional FM frequencies on its own site. It is part of the Karnaval radio offering, but has a distinct live feed from the network\'s Turkish-music and easy-listening stations.',
    meta: 'Listen to Metro FM from Turkey: international pop and dance hits, the Metro FM Top 40 and its own live radio programme.',
    sources: ['https://metrofm.com.tr/'],
  },
  {
    id: '68a8c485bd66579311ab34bd', slug: 'power-pop', countryCode: 'TR',
    homepage: 'https://www.powerapp.com.tr/radios/powerpop/',
    full: 'Power POP is a radio channel in the Turkish PowerApp offering. It is listed as a distinct service alongside Power FM and PowerTürk, rather than an alternative name for either of those stations.\n\nThe publisher provides a dedicated Power POP station page and live audio feed. The official page is the source for the channel\'s current output and availability within the wider Power radio catalogue.',
    meta: 'Listen to Power POP, a distinct radio channel in Turkey\'s PowerApp offering, separate from Power FM and PowerTürk.',
    sources: ['https://www.powerapp.com.tr/powerpop/'],
  },
  {
    id: '6a07919fbef34beb9148c9d7', slug: 'ntv-radyo', countryCode: 'TR',
    homepage: 'https://www.ntvradyo.com.tr/',
    full: 'NTV Radyo is a Turkish-language radio service combining current affairs with culture, interviews and specialist spoken-word programmes. Its schedule includes the Pencere arts programme, radio adaptations of fiction and discussions that explore subjects beyond the news headlines.\n\nThe official NTV Radyo site maintains a live broadcast, programme schedule, podcast directory and earlier recordings. This is the radio service, not the separate NTV television stream.',
    meta: 'Listen to NTV Radyo from Turkey: current affairs, culture, interviews, radio drama and specialist spoken-word programmes.',
    sources: ['https://www.ntvradyo.com.tr/'],
  },
  {
    id: '68a8c45fbd66579311aad6ea', slug: 'alem-fm', countryCode: 'TR',
    homepage: 'https://www.alemfm.com/',
    full: 'Alem FM is a Turkish music radio station with presenter-led entertainment. Its official site combines a Turkish-music chart with programme pages, including Serdar Yayında, and recordings from its presenters.\n\nThe station\'s own programme directory and frequency information provide the current broadcast details. Alem FM has a different live programme from the other music and news stations available in Turkey.',
    meta: 'Listen to Alem FM from Turkey: Turkish music, presenter-led entertainment and programmes including Serdar Yayında.',
    sources: ['https://www.alemfm.com/'],
  },
  {
    id: '68a8c45ebd66579311aad2f2', slug: 'a-haber', countryCode: 'TR',
    homepage: 'https://www.ahaber.com.tr/',
    full: 'A Haber is a Turkish news broadcaster covering national and international current affairs, the economy and sport. This catalogue entry provides an audio feed associated with that news service, rather than a music-radio programme.\n\nThe broadcaster\'s official site publishes news coverage, a programme schedule and live television as well as its wider editorial output. Broadcast content follows the live news agenda and can change during developing events.',
    meta: 'Listen to the A Haber news audio feed from Turkey, covering current affairs, the economy and sport. Find the broadcaster\'s official site.',
    sources: ['https://www.ahaber.com.tr/'],
  },
  {
    id: '68a8c495bd66579311ab5da4', slug: 'radyo-fenomen', countryCode: 'TR',
    homepage: 'https://www.radyofenomen.com/',
    full: 'Radyo Fenomen is a Turkish radio service built around contemporary international hit music. Its published charts feature pop and dance tracks, and its editorial site includes music news, new releases and a broadcast schedule.\n\nThe main Fenomen station is separate from Fenomen Türk, which the broadcaster lists as another service. The official Radyo Fenomen site supplies the live station, programme details and current music charts.',
    meta: 'Listen to Radyo Fenomen from Turkey: contemporary international pop and dance hits, distinct from the separate Fenomen Türk service.',
    sources: ['https://www.radyofenomen.com/'],
  },
  {
    id: '6a0791c9bef34beb9148d375', slug: 'radyo-seymen', countryCode: 'TR',
    homepage: 'https://radyoseymen.com.tr/',
    full: 'Radyo Seymen is a Turkish radio station associated with Ankara-style dance music. Its publisher describes a service established in 2010 that brings the Ankara havaları musical tradition to its listeners.\n\nThe station\'s official website provides its own live broadcast and a frequency directory. It is a distinct regional-music offering rather than a general international chart-music station.',
    meta: 'Listen to Radyo Seymen from Turkey, a station associated with Ankara havaları and its regional dance-music tradition.',
    sources: ['https://radyoseymen.com.tr/'],
  },
  {
    id: '68a8c477bd66579311ab11a4', slug: 'joy-turk-turkey', countryCode: 'TR',
    homepage: 'https://karnaval.com/radyolar/joyturk',
    full: 'JoyTürk is a Karnaval radio service focused on Turkish slow music. It is separate from the network\'s Joy FM easy-listening station and the additional JoyTürk Akustik channel.\n\nThe official JoyTürk station page brings together its live broadcast, programme information and frequency options. Its Turkish-language music format distinguishes it from the international hit and rap services in the same radio network.',
    meta: 'Listen to JoyTürk from Turkey: Turkish slow music on the Karnaval network, distinct from Joy FM and JoyTürk Akustik.',
    sources: ['https://karnaval.com/radyolar/joyturk'],
  },
];

const byId = new Map(INDEXING_PILOT.map(profile => [profile.id, profile]));

export function matchingPilotProfile(station: any): IndexingPilotProfile | undefined {
  const profile = byId.get(String(station?._id ?? ''));
  if (!profile || station.slug !== profile.slug || station.countryCode !== profile.countryCode
    || station.noIndex !== false || station.redirectToSlug || station.isListVisible === false) return;
  return profile;
}

// Both SSR and the public detail API use the same immutable presentation.
// Explicit administrator ownership takes precedence; all other locales survive.
export function withPilotEditorial(station: any): any {
  const profile = matchingPilotProfile(station);
  if (!profile) return station;
  const manual = station.manualEditFields || {};
  return {
    ...station,
    ...(!manual.homepage && { homepage: profile.homepage }),
    ...(!manual.descriptions && !manual['descriptions.en'] && {
      descriptions: {
        ...station.descriptions,
        en: { ...station.descriptions?.en, full: profile.full, meta: profile.meta },
      },
    }),
  };
}
