export interface StationEditorialLink {
  label: string;
  href: string;
}

export interface ReviewedStationEditorial {
  kind: 'reviewed';
  path: string;
  stationId: string;
  slug: string;
  language: 'en' | 'de' | 'tr' | 'fr';
  summary: string;
  title?: string;
  metaDescription?: string;
  sections: readonly {
    heading: string;
    paragraphs: readonly string[];
    links?: readonly StationEditorialLink[];
  }[];
  questions: readonly { question: string; answer: string; link?: StationEditorialLink }[];
  relatedLinks: readonly StationEditorialLink[];
  sources: readonly StationEditorialLink[];
  reviewedAt: string;
}

export function getStationEditorialLabels(language: ReviewedStationEditorial['language']) {
  return {
    en: { questions: 'Frequently asked questions', related: 'Explore related radio', sources: 'Publisher sources', reviewed: 'Sources checked on' },
    de: { questions: 'Häufige Fragen', related: 'Weitere Radios entdecken', sources: 'Quellen des Senders', reviewed: 'Quellen geprüft am' },
    tr: { questions: 'Sık sorulan sorular', related: 'İlgili radyoları keşfet', sources: 'Yayıncı kaynakları', reviewed: 'Kaynak kontrol tarihi' },
    fr: { questions: 'Questions fréquentes', related: 'Explorer d’autres radios', sources: 'Sources de la radio', reviewed: 'Sources vérifiées le' },
  }[language];
}

/** Published administrator fields keep precedence over reviewed defaults. */
export function applyReviewedStationMetadata<T extends Record<string, unknown>>(
  tags: T,
  editorial: ReviewedStationEditorial | null,
  administrator: Record<string, unknown> | null = null,
): T {
  if (!editorial) return tags;
  const result = { ...tags };
  if (editorial.title) {
    const title = administrator?.title || editorial.title;
    Object.assign(result, { title, ogTitle: administrator?.ogTitle || title,
      twitterTitle: administrator?.twitterTitle || title });
  }
  if (editorial.metaDescription) {
    const description = administrator?.description || editorial.metaDescription;
    Object.assign(result, { description, ogDescription: administrator?.ogDescription || description,
      twitterDescription: administrator?.twitterDescription || description });
  }
  return result;
}
