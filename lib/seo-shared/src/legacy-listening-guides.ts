import type { LegacyStationGuide } from './legacy-station-guides';
import { LEGACY_COMBINED_GENRE_SLUG } from './legacy-station-guide-routes';

export const LEGACY_LISTENING_GUIDES: readonly LegacyStationGuide[] = [
  {
    id: 'color-bars-test', path: '/hu/radio/1-21', sourcePaths: ['/hu/radio/1-21', '/hu/radios/1-21'],
    language: 'en', kind: 'audio-test', publishedAt: '2026-11-11',
    title: 'Colour bars and a stereo audio check',
    seoTitle: 'Colour bars and left/right audio test | MegaRadio',
    description: 'Understand the former colour-bar test listing and check left, right and stereo sound locally before troubleshooting an online radio stream.',
    intro: 'The old listing at this address was labelled 彩条测试1: a colour-bar test, not a named radio broadcaster. The illustration below is a local example, not a recording of that feed. A separate left/right audio check helps distinguish a sound-output problem from a problem with a radio stream.',
    scopeNote: 'The old video feed is not replayed here. The colour bars are illustrative RGB blocks, not a calibrated broadcast pattern. The short audio test generates its own tone in your browser; it is not audio recovered from the former signal.',
    sections: [
      { heading: 'A test signal is not a radio programme', paragraphs: [
        'A picture of coloured bars identifies a test rather than a presenter, programme or station schedule. The archived label is the useful clue in this case; the number in this address does not identify a broadcaster. No claim is made that the former signal included sound or used the same colours as this illustration.',
        'A successful local tone only checks the path from this browser to your selected output. It cannot prove that a remote station is on air, that its stream is reachable, or that your display is correctly calibrated.',
      ] },
      { heading: 'Compare the two audio channels', paragraphs: [
        'Begin with your device volume low. A left-only result should come from the left channel, and a right-only result from the right. Stereo places the same test in both channels. A mono accessibility setting, a single speaker or a Bluetooth device can change what you hear; compare the result with that output’s settings before assuming a speaker fault.',
        'The tone is a 440 Hz sine wave, routed with the browser’s stereo panner and limited to 1.2 seconds. Its digital gain is capped at 0.03; this does not guarantee a particular loudness at your headphones or speakers. It does not measure hearing or certify equipment.',
      ] },
      { heading: 'If the tone works but the station does not', paragraphs: [
        'Try a second station on the same output. If that station plays, the first stream may be unavailable, restricted or incompatible with the browser. Check the broadcaster’s own listening page and current notices rather than turning the volume up repeatedly.',
        'If no sound is heard from either channel, check the tab mute control, operating-system output choice and the connection to your headphones or speakers. A browser can also require a click before it starts audio. The test uses no microphone and sends no test recording to a server.',
      ] },
    ],
    sources: [
      { label: 'MDN: how a stereo panner routes left and right', url: 'https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode' },
      { label: 'MDN: oscillators generate periodic tones', url: 'https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode' },
      { label: 'MDN: Web Audio autoplay and user control', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices' },
    ],
    faq: [
      { question: 'Is this the original test broadcast?', answer: 'No. The image and tone are generated locally for illustration and output checking. Neither is a recording or reconstruction of the old stream.' },
      { question: 'Will the radio start again after the test?', answer: 'No. Starting a test pauses a radio already playing in MegaRadio. Resume your radio yourself when you are ready; a test does not select another station.' },
    ],
    relatedLinks: [{ label: 'Choose a radio station to compare with the local test', path: '/en/stations' }],
  },
  {
    id: 'radio-labels', path: `/ar/anwaa/${LEGACY_COMBINED_GENRE_SLUG}`,
    sourcePaths: [`/ar/genres/${LEGACY_COMBINED_GENRE_SLUG}`, `/ar/anwaa/${LEGACY_COMBINED_GENRE_SLUG}`],
    language: 'ar', kind: 'article', publishedAt: '2026-11-11',
    title: 'كيف تختار إذاعة من النوع الموسيقي والعقد وقوائم الأغاني؟',
    seoTitle: 'دليل تصنيفات الراديو: النوع والعقد والقوائم | MegaRadio',
    description: 'افهم الفرق بين تسميات مثل house و90s وTop 40 وlivestream، ثم اختر صفحات الراديو المناسبة بدلاً من التعامل معها كلها كنوع موسيقي واحد.',
    intro: 'إذا أردت موسيقى هاوس من التسعينيات، فأنت تصف نوعًا موسيقيًا وفترة زمنية معًا. وإذا طلبت Top 40 فأنت قد تقصد قائمة أغنيات أو صيغة محطة، لا إيقاعًا بعينه. فصل هذه المعاني يجعل اختيار إذاعة أقرب إلى ذوقك أسهل من جمع عشرات الكلمات في تصنيف واحد.',
    scopeNote: 'هذا دليل لفهم التسميات واختيار صفحات الاستماع، وليس اسمًا لنوع يجمع كل الكلمات في عنوان الرابط. لا توجد طريقة واحدة متفق عليها عالميًا لتقسيم الموسيقى؛ راجع وصف المحطة وبرامجها أيضًا.',
    sections: [
      { heading: 'النوع الواسع والأسلوب الأكثر تحديدًا', paragraphs: [
        'في تصنيف Discogs، تُستخدم تسميات واسعة مثل Electronic وRock، ثم أساليب أكثر تحديدًا؛ ويورد الدليل Drum And Bass مثالاً لأسلوب تحت Electronic. ويمكن للعمل أن يحمل أكثر من تصنيف. لهذا لا يلزم أن تتطابق تسميات متجر موسيقي مع ما تكتبه محطة عن برنامجها.',
        'ابدأ بكلمة قريبة مما تريد سماعه، مثل house أو reggae أو hip-hop. ثم اقرأ وصف المحطة: هل تعرض برنامجًا متنوعًا أم قناة متخصصة؟ إضافة deep house إلى طلبك تضيق الاختيار أكثر من الاكتفاء بكلمة electronic؛ لكنها لا تضمن سرعة ثابتة أو قائمة تشغيل واحدة في جميع المحطات.',
      ] },
      { heading: '80s و90s و00s تشير إلى الزمن', paragraphs: [
        'هذه التسميات تحيل عادة إلى الثمانينيات والتسعينيات والألفينيات. يمكن لمحطة تسعينيات أن تخلط البوب والروك والموسيقى الراقصة. إذا كان الأهم عندك هو الفترة، فابدأ بصفحة العقد؛ وإذا كان الأسلوب أهم، فابدأ بصفحة النوع ثم تحقق من العصور التي تركز عليها المحطة.',
        'في مثال «هاوس التسعينيات»، قارن وصف محطة house بمحطة 90s. ابحث عن برنامج أو قناة يذكران الشرطين صراحة؛ ظهور كلمة واحدة لا يثبت الشرط الآخر. هذه طريقة اختيار عملية، وليست تأكيدًا بأن كل محطة في صفحة عقد معين متخصصة في house.',
      ] },
      { heading: 'Top 40 وTop 100 ليستا نوعًا موسيقيًا ثابتًا', paragraphs: [
        'تجمع قائمة Official Singles Chart البريطانية الأغنيات بحسب بيانات الاستماع والمبيعات ضمن أسبوع محدد. إنها مثال لقائمة لها بلد وفترة ومنهجية، وليست تعريفًا لكل محطات Top 40 في العالم. وقد تستخدم محطة العبارة للدلالة على صيغة تركز على الأغاني الرائجة.',
        'إذا أردت ترتيب الأسبوع في بلد معين، فراجع تاريخ القائمة ومصدرها. أما إذا أردت محطة للأغاني الشائعة فاقرأ وصفها وجدول برامجها. لا تعتبر كلمات Top 100 أو Top 200 في بيانات محطة دليلاً على أنها تبث القائمة البريطانية أو تقدم ترتيبًا رسميًا.',
      ] },
      { heading: 'بعض الكلمات تصف طريقة الاستماع لا الموسيقى', paragraphs: [
        'livestream وlive radio يصفان بثًا مباشرًا عبر الإنترنت؛ ولا يحددان ما إذا كانت الموسيقى بوب أو هاوس أو غير ذلك. وDJ وremix قد يصفان تقديمًا أو نسخة من تسجيل. أما lounge وchillout فهما إشارتان لاختيار أهدأ عند كثير من الناشرين؛ يبقى وصف الناشر والبرنامج هو المرجع للاختيار.',
        'توضح MusicBrainz أن الأنواع تُدار ضمن نظام الوسوم، وأن جزءًا من الوسوم فقط يُعرض كأنواع، مع إمكانية تصويت المستخدمين عليها. لذلك لا يلزم التعامل مع كل كلمة مستوردة في بيانات محطة على أنها تصنيف مستقل يستحق صفحة منفصلة.',
      ] },
    ],
    sources: [
      { label: 'Discogs: الفرق بين الأنواع والأساليب في قاعدة بياناته', url: 'https://support.discogs.com/hc/en-us/articles/360005055213-Database-Guidelines-9-Genres-Styles' },
      { label: 'MusicBrainz: الأنواع ضمن نظام الوسوم', url: 'https://musicbrainz.org/doc/Genre' },
      { label: 'Official Charts: مثال لقائمة أسبوعية بريطانية', url: 'https://www.officialcharts.com/charts/singles-chart/' },
    ],
    faq: [
      { question: 'هل محطة 90s تبث موسيقى house فقط؟', answer: 'لا. العقد يصف الفترة، ويمكن أن يشمل أنماطًا كثيرة. ابحث عن ذكر house في وصف المحطة أو اسم البرنامج إذا كان هذا ما تريده.' },
      { question: 'هل البث المباشر يعني الأغاني الرائجة؟', answer: 'لا. البث المباشر يصف وصول البرنامج إليك في وقته؛ ويمكن أن يكون موسيقى قديمة أو حديثة أو حديثًا إذاعيًا.' },
    ],
    relatedLinks: [
      { label: 'محطات house: ابدأ بالأسلوب الموسيقي', path: '/ar/anwaa/house' },
      { label: 'محطات التسعينيات: ابدأ بالفترة', path: '/ar/anwaa/90s' },
      { label: 'محطات pop: قارن وصف كل محطة', path: '/ar/anwaa/pop' },
      { label: 'دليل أنواع الراديو الكامل', path: '/ar/anwaa' },
    ],
  },
  {
    id: 'dfm-radio-rwanda', path: '/no/station/dfm-radio-rwanda', sourcePaths: ['/no/station/dfm-radio-rwanda'],
    language: 'en', kind: 'article', publishedAt: '2026-11-11',
    title: 'DFM Radio: the publisher profile and the country label',
    seoTitle: 'DFM Radio: publisher profile and country label | MegaRadio',
    description: 'Identify DFM Radio through its own publisher profile, understand the old Rwanda label and find the official pages without assuming a change of ownership.',
    intro: 'DFM Radio’s current publisher profile lists Tanzania, with Swahili and English language labels. The older MegaRadio entry used Rwanda. The two records share the same Zeno publisher-profile identifier, but that connection does not establish that the station moved between countries.',
    scopeNote: 'This is a source-reviewed profile, not a claim that a live stream has been restored. The country shown by the publisher today is distinguished from the label in the older directory entry.',
    sections: [
      { heading: 'What the publisher actually provides', paragraphs: [
        'The Zeno page identifies the service as DFM Radio, assigns the category General, and carries a short Swahili introduction. Its linked broadcaster page repeats the same name, country, languages and profile identifier. These are the available identity clues; General is not a detailed description of a music format.',
        'Neither of these publisher pages provides enough information to establish a founding date, a city, an FM frequency or a programme schedule. Those details are therefore not supplied here. The official profile is the appropriate place to check for later announcements or changes.',
      ] },
      { heading: 'Checking listening availability', paragraphs: [
        'In MegaRadio’s browser check on 11 November 2026, the official Zeno player displayed a playback error. That is a dated observation, not proof of permanent closure. A profile can remain online while its audio is unavailable or access differs between listening environments.',
        'Open the publisher profile below to check its present state. If the player does not start, do not assume that another station with DFM in its name is the same service. Compare the publisher identity and its own linked website before relying on a new stream address.',
      ] },
    ],
    sources: [
      { label: 'Open DFM Radio’s publisher profile on Zeno', url: 'https://zeno.fm/radio/dfm-radio-ksy7/' },
      { label: 'Open the broadcaster page linked by that profile', url: 'https://dfm-radio-ksy7.mdn.live/' },
    ],
    faq: [
      { question: 'Does the old Rwanda label prove where DFM broadcasts from?', answer: 'No. It describes the older directory entry. The current publisher profile lists Tanzania; the available sources do not establish a move, broadcast location or licence history.' },
      { question: 'Does a playback error mean DFM has closed?', answer: 'Not by itself. The check documents what the official player returned at that time. A new announcement or a successful later listening check would be separate evidence.' },
    ],
    relatedLinks: [{ label: 'Browse radio stations listed in Tanzania', path: '/en/regions/africa/tanzania' }],
  },
  {
    id: 'radio-dil-se-dil-tak', path: '/am/station/radio-dil-se-dil-tak', sourcePaths: ['/am/station/radio-dil-se-dil-tak'],
    language: 'en', kind: 'article', publishedAt: '2026-11-11',
    title: 'Radio Dil: recognising the slogan and programmes',
    seoTitle: 'Radio Dil: slogan, identity and programme guide | MegaRadio',
    description: 'Recognise Radio Dil through its Dil se dil tak slogan, US diaspora background and named programmes, while separating it from an unverified older India listing.',
    intro: 'Radio Dil uses the slogan “Dil se… dil tak” and describes itself as a US-born service for the Indian diaspora. Its ownership of the older India-labelled entry at this address has not been established. The slogan and programme clues below help identify the documented service without treating the two records as interchangeable.',
    scopeNote: 'The US service is described on its own terms. It is not presented as a successor, a rebrand or a verified new stream for the former India-labelled listing.',
    sections: [
      { heading: 'The history the broadcaster tells', paragraphs: [
        'Radio Dil’s own About page dates its start to 2010 and describes a transition from terrestrial radio to internet streaming. Its musical remit includes older Bollywood favourites, newer songs, devotional content and talk shows. These are the broadcaster’s descriptions, rather than an independently established history of the former directory record.',
        'The Indian diaspora is an audience, not the same thing as a transmitter being in India. A name, language or Bollywood selection alone is therefore insufficient to establish that two directory entries belong to the same broadcaster.',
      ] },
      { heading: 'Marathi Vaibhav: language and community clues', paragraphs: [
        'Snehal Vaze’s broadcaster profile identifies Marathi Vaibhav as a weekly programme built around themed Marathi songs. It also describes community topics connected with New Jersey and New York. If you remember that presenter, language and local context together, these are more specific clues than the short name Radio Dil.',
        'For a particular edition, use the broadcaster’s current programme and presenter pages. This guide does not convert schedule times into another time zone or assume that a weekly slot will remain unchanged.',
      ] },
      { heading: 'Swaranjali: another way to recognise the service', paragraphs: [
        'Sanjeev Rambhadran’s Radio Dil profile associates him with Swaranjali, a programme exploring Indian classical-music traditions through popular music. That gives a listener a different identifying clue from a general Bollywood playlist: the presenter and the approach to the music can be checked against what you remember hearing.',
        'The sources below lead to Radio Dil’s own website and presenter information. They document that service; they do not verify a publisher or replacement stream for every similarly named Radio Dil or Dil Se Dil Tak entry elsewhere.',
      ] },
    ],
    sources: [
      { label: 'Radio Dil: publisher website and slogan', url: 'https://radiodil.com/' },
      { label: 'Radio Dil: the broadcaster’s own history', url: 'https://radiodil.com/about-us' },
      { label: 'Snehal Vaze and Marathi Vaibhav', url: 'https://radiodil.com/radio-jockey/snehal-vaze' },
      { label: 'Sanjeev Rambhadran and Swaranjali', url: 'https://radiodil.com/radio-jockey/sanjeev-rambhadran' },
    ],
    faq: [
      { question: 'Does Indian music make this an India-based broadcaster?', answer: 'No. The documented Radio Dil service describes its US origins and diaspora audience. Musical language or subject matter does not establish a broadcasting location.' },
      { question: 'Is the old Dil Se Dil Tak stream restored?', answer: 'No such restoration is claimed here. This page supplies sourced identity and programme clues; the original entry has not been linked to a verified replacement stream.' },
    ],
    relatedLinks: [
      { label: 'Radio stations listed in India', path: '/en/regions/asia/india' },
      { label: 'Radio stations listed in the United States', path: '/en/regions/north-america/united-states' },
    ],
  },
  {
    id: 'wxb-loud-1023-fm-pampanga', path: '/it/stazione/wxb-loud-1023-fm-pampanga',
    sourcePaths: ['/it/station/wxb-loud-1023-fm-pampanga', '/it/stazione/wxb-loud-1023-fm-pampanga'],
    language: 'en', kind: 'article', publishedAt: '2026-11-11',
    title: 'WXB102 and Pampanga 102.3: separating the radio clues',
    seoTitle: 'WXB102 and Pampanga 102.3: identity guide | MegaRadio',
    description: 'Compare a first-person account of WXB102’s online revival with a Pampanga report naming KISS FM 102.3, without treating them as the same broadcaster.',
    intro: 'The former label “WXB Loud 102.3 FM Pampanga” combines a name, a frequency and a place. Two historical sources help separate those clues: a first-person account of WXB102’s online revival, and a Pampanga cooperative report naming KISS FM 102.3. Neither establishes that these were one service.',
    scopeNote: 'The sources do not connect the word Loud to either broadcaster, identify the old listing’s owner or verify a current Pampanga 102.3 stream. This is a guide to the evidence, not a restored live station.',
    sections: [
      { heading: 'The WXB102 online revival', paragraphs: [
        'In a forum post dated 21 January 2007, Michael Sutton, writing as WXB102’s general manager, described bringing the Manila new-wave name back online on 10 September 2005. His account discussed a broad alternative selection rather than a narrowly repeated set of new-wave hits.',
        'The same 2007 account named returning presenters including George Frederick and The Ghost. Its description of the staff at that time should not be read as a list of the people who made the 2005 launch. This is a signed participant’s account on a forum, not a current broadcast-licensing document.',
      ] },
      { heading: 'What the Pampanga report actually names', paragraphs: [
        'On printed page 32 of Pampanga II Electric Cooperative’s annual-report booklet, the cooperative describes informing customers about power interruptions and other public matters through radio. It names Lou–Chrigrod Broadcasting, identified as KISS FM 102.3, alongside Radioworld’s RW 95.1.',
        'That is a concrete historical link between the KISS name and 102.3 in the cooperative’s communications work. It does not establish a WXB relationship, a later rebrand or the present licensee. A frequency can be a useful listening clue without proving a shared station identity.',
      ] },
      { heading: 'Following the separately identified WXB102 service', paragraphs: [
        'WXB102 has a broadcaster-managed Mixlr page describing its alternative-music identity. Use that page when it is specifically WXB102 you want to follow. Availability there should be checked with its publisher; it is not confirmation that the former Pampanga listing has returned.',
        'If your memory is of a local FM service, keep the place, on-air name and approximate date together. Substituting a Manila online service solely because WXB appears in an old link would discard the Pampanga and 102.3 parts of the original label.',
      ] },
    ],
    sources: [
      { label: 'Michael Sutton’s signed account, 21 January 2007', url: 'https://spiritofradio.ca/forum/viewtopic.php?t=394' },
      { label: 'PELCO II annual-report booklet, printed page 32', url: 'https://gocloudasia.net/pelcoII/assets/downloads/Annual_Report_2016.pdf#page=38' },
      { label: 'WXB102’s Mixlr page', url: 'https://wxb102.mixlr.com/' },
    ],
    faq: [
      { question: 'Does the KISS FM reference establish a WXB rebrand?', answer: 'No. It documents the name used in that report. It does not provide a chain of ownership or a rebranding announcement connecting KISS and WXB.' },
      { question: 'Is the Mixlr link a verified Pampanga 102.3 broadcast?', answer: 'No. It is a listening destination for the separately identified WXB102 online service. It is not used as an alias or a replacement stream for the old listing.' },
    ],
    relatedLinks: [{ label: 'Browse radio stations listed in the Philippines', path: '/en/regions/asia/philippines' }],
  },
  {
    id: 'disco-2', path: '/am/station/disco-2', sourcePaths: ['/am/station/disco-2'],
    language: 'en', kind: 'article', publishedAt: '2026-11-11',
    title: 'Disco or Discoradio? Choose by era and programme',
    seoTitle: 'Disco and Discoradio: music and programme guide | MegaRadio',
    description: 'Distinguish classic Disco on laut.fm from Italy’s Discoradio, with musical eras, named programmes and publisher links rather than an assumed station match.',
    intro: 'A search for disco radio can mean a classic-disco selection or a broadcaster whose name is Discoradio. They are not interchangeable. Disco on laut.fm and Italy’s Discoradio provide useful, specific programme clues; neither is identified here as the owner of the former “Disco 2” directory record.',
    scopeNote: 'The number 2 in the old address is not evidence of a second official channel. The comparisons below describe separately identifiable services and do not assign a replacement stream to the old entry.',
    sections: [
      { heading: 'Start with the musical era', paragraphs: [
        'Disco on laut.fm identifies Hannover as its location and describes a personal selection of favourites from the 1970s through the mid-1980s. That description is a useful starting point if the disco era itself is what you want, rather than a contemporary dance station.',
        'Discoradio describes a different selection: rhythm-led hits from the 1990s to today. Its About page also connects the service with local content in Lombardy and Piedmont. A programme with dance records from the 1990s can therefore fit its identity without being a classic-1970s disco format.',
      ] },
      { heading: 'Recognising Rhythmic History', paragraphs: [
        'Discoradio’s Rhythmic History is a more specific clue for a listener who remembers 1990s and 2000s dance music. The broadcaster names artists such as Technotronic, Corona, La Bouche, Eiffel65 and Gigi D’Agostino, and identifies Alessio Aloisi with the selections.',
        'Use the programme page to recognise that musical focus, then check the current schedule with the broadcaster. This guide does not copy a time slot that could change or assume that every hour of the station follows that programme’s format.',
      ] },
      { heading: 'A different direction: RAP’N’DROP', paragraphs: [
        'The station’s RAP’N’DROP page describes Don Cash combining Italian rap and dance within PARTYSET. The presenter and the blend of styles distinguish that selection from both a classic-disco stream and a retrospective dance programme.',
        'Discoradio’s website offers Milan and Turin listening choices. Its legal notice identifies Ritzland Records as operator of the site and app. Those publisher details help identify the documented service; they do not establish ownership of a similarly labelled listing in another directory.',
      ] },
    ],
    sources: [
      { label: 'Disco on laut.fm: publisher profile and listening page', url: 'https://laut.fm/disco' },
      { label: 'Discoradio: its own format description', url: 'https://www.discoradio.it/chi-siamo/' },
      { label: 'Discoradio: Rhythmic History', url: 'https://www.discoradio.it/conduttori/rhythmic-history/' },
      { label: 'Discoradio: RAP’N’DROP', url: 'https://www.discoradio.it/conduttori/discoradio-rap-n-drop/' },
      { label: 'Discoradio: site and app operator notice', url: 'https://www.discoradio.it/note-legali/' },
    ],
    faq: [
      { question: 'Does a disco label always mean 1970s music?', answer: 'No. Compare the publisher’s own format and named programmes. The two services in this guide explicitly describe different musical eras and selections.' },
      { question: 'Which service was the old Disco 2 listing?', answer: 'That identity has not been established. These publisher and programme clues help you choose knowingly; no automatic match or successor is claimed.' },
    ],
    relatedLinks: [
      { label: 'Browse stations tagged disco', path: '/en/genres/disco' },
      { label: 'Compare stations tagged dance', path: '/en/genres/dance' },
    ],
  },
];
