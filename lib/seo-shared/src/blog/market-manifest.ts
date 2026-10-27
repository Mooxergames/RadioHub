import type { BlogLocale, CoreBlogId } from "./types";

const TREND_PUBLISHED = "2026-10-27T07:46:55+01:00";

function edition(
  locale: BlogLocale,
  market: string,
  imageId: CoreBlogId,
  languageTag?: "zh-Hant-HK",
  publishedAt = "2026-10-27T00:00:00+01:00",
) {
  return Object.freeze({
    locale,
    market,
    imageId,
    languageTag,
    publishedAt,
    updatedAt: publishedAt,
  });
}

// Each key is one market-specific article, not a promise of 14 translations.
export const MARKET_BLOG_MANIFEST = Object.freeze({
  "9-plaetze-9-schaetze-2026-radio-oesterreich": edition(
    "de", "AT", "listen-to-radio-online", undefined, TREND_PUBLISHED,
  ),
  "vignette-2027-oesterreich-verkehrsradio": edition(
    "de", "AT", "radio-app-iphone-android", undefined, TREND_PUBLISHED,
  ),
  "vollmond-oktober-2026-radio-wissenschaft": edition(
    "de", "AT", "news-talk-radio-guide", undefined, TREND_PUBLISHED,
  ),
  "ballon-dor-2026-radio-ergebnisse": edition(
    "de", "DE", "news-talk-radio-guide", undefined, TREND_PUBLISHED,
  ),
  "dfb-pokal-2026-27-live-radio": edition(
    "de", "DE", "news-talk-radio-guide", undefined, TREND_PUBLISHED,
  ),
  "changement-heure-hiver-2026-radio-reveil": edition(
    "fr", "FR", "radio-app-iphone-android", undefined, TREND_PUBLISHED,
  ),
  "wind-up-radio-uk-emergency-kit": edition(
    "en", "GB", "listen-to-radio-online", undefined, TREND_PUBLISHED,
  ),
  "world-series-2026-radio-audio": edition(
    "en", "US", "news-talk-radio-guide", undefined, TREND_PUBLISHED,
  ),
  "kral-fm-canli-dinle-sorunlari": edition(
    "tr",
    "TR",
    "radio-app-iphone-android",
  ),
  "trt-turku-nagme-farki": edition("tr", "TR", "listen-to-radio-online"),
  "trt-radyo-tiyatrosu-arkasi-yarin": edition(
    "tr",
    "TR",
    "news-talk-radio-guide",
  ),
  "orf-sound-sendung-nachhoeren": edition(
    "de",
    "AT",
    "radio-app-iphone-android",
  ),
  "deutschlandfunk-kultur-nova-unterschied": edition(
    "de",
    "DE",
    "news-talk-radio-guide",
  ),
  "dab-plus-sender-fehlen": edition("de", "DE", "internet-radio-explained"),
  "npr-local-station-stream": edition("en", "US", "news-talk-radio-guide"),
  "noaa-weather-radio-online-alerts": edition(
    "en",
    "US",
    "news-talk-radio-guide",
  ),
  "bbc-radio-outside-uk": edition("en", "GB", "internet-radio-explained"),
  "premier-league-radio-commentary-uk": edition(
    "en",
    "GB",
    "news-talk-radio-guide",
  ),
  "radio-nacional-radio-5-diferencias": edition(
    "es",
    "ES",
    "news-talk-radio-guide",
  ),
  "conciertos-radio-3-archivo": edition("es", "ES", "rock-radio-guide"),
  "france-bleu-ici-radio-locale": edition("fr", "FR", "news-talk-radio-guide"),
  "fip-tape-direct-differences": edition("fr", "FR", "jazz-radio-guide"),
  "rfi-journal-francais-facile-transcription": edition(
    "fr",
    "FR",
    "news-talk-radio-guide",
  ),
  "raiplay-sound-podcast-offline": edition(
    "it",
    "IT",
    "radio-app-iphone-android",
  ),
  "isoradio-traffico-diretta-podcast": edition(
    "it",
    "IT",
    "news-talk-radio-guide",
  ),
  "nacional-amazonia-ondas-curtas-online": edition(
    "pt",
    "BR",
    "internet-radio-explained",
  ),
  "a-voz-do-brasil-horario-replay": edition(
    "pt",
    "BR",
    "news-talk-radio-guide",
  ),
  "roda-de-choro-radio-mec-albuns": edition("pt", "BR", "jazz-radio-guide"),
  "saudi-quran-reciter-schedule": edition("ar", "SA", "listen-to-radio-online"),
  "gulf-tarab-radio-sessions": edition("ar", "SA", "listen-to-radio-online"),
  "saudi-radio-interview-archive": edition("ar", "SA", "news-talk-radio-guide"),
  "children-radio-serial-stories": edition("ru", "RU", "news-talk-radio-guide"),
  "classical-radio-concert-notes": edition(
    "ru",
    "RU",
    "listen-to-radio-online",
  ),
  "dj-set-tracklists-remixes": edition("ru", "RU", "80s-90s-radio-guide"),
  "rthk-catchup-dates": edition(
    "zh",
    "HK",
    "radio-app-iphone-android",
    "zh-Hant-HK",
  ),
  "cantonese-opera-radio-excerpts": edition(
    "zh",
    "HK",
    "listen-to-radio-online",
    "zh-Hant-HK",
  ),
  "rthk-accessible-player": edition(
    "zh",
    "HK",
    "radio-app-iphone-android",
    "zh-Hant-HK",
  ),
  "radiko-timefree-limits": edition("ja", "JP", "radio-app-iphone-android"),
  "community-fm-simulcast": edition("ja", "JP", "internet-radio-explained"),
  "late-night-radio-dates": edition("ja", "JP", "news-talk-radio-guide"),
  "kbs-radio-song-search": edition("ko", "KR", "listen-to-radio-online"),
  "mbc-visual-radio-replays": edition("ko", "KR", "radio-app-iphone-android"),
  "sbs-radio-story-submissions": edition("ko", "KR", "news-talk-radio-guide"),
  "hindi-radio-drama-discovery": edition("hi", "IN", "news-talk-radio-guide"),
  "akashvani-hindi-bulletin-archive": edition(
    "hi",
    "IN",
    "news-talk-radio-guide",
  ),
  "sangeet-sarita-listening-notes": edition(
    "hi",
    "IN",
    "listen-to-radio-online",
  ),
  "reka-radio-language-slots": edition("he", "IL", "internet-radio-explained"),
  "gimel-editorial-song-selection": edition(
    "he",
    "IL",
    "listen-to-radio-online",
  ),
});
