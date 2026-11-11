import { buildTemplateDescription as buildSharedTemplate, missingEnglishDescriptionPatch as missingSharedPatch,
  type TemplateStationInfo } from '@workspace/seo-shared/station-description-template';
import { getStationCountryName } from '@workspace/seo-shared/seo-config';

export function buildTemplateDescription(station: TemplateStationInfo) {
  return buildSharedTemplate({ ...station, country: getStationCountryName(station, 'en') });
}

export function missingEnglishDescriptionPatch(station: TemplateStationInfo & { descriptions?: any; manualEditFields?: any }) {
  return missingSharedPatch({ ...station, country: getStationCountryName(station, 'en') });
}
export type { TemplateStationInfo } from '@workspace/seo-shared/station-description-template';
