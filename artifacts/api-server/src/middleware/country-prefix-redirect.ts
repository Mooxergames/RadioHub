import type { RequestHandler } from 'express';
import { COUNTRY_TO_LANGUAGE, SEO_LANGUAGES, getLanguageFromPath, getRetiredLocaleFromPath } from '@workspace/seo-shared/seo-config';
import { buildPublicSeoRouteMatchers, decodePublicSeoPath } from '../seo/public-route-matchers';

const languages = new Set(SEO_LANGUAGES.filter(language => language.enabled).map(language => language.code));
const countryPrefixes = new Map(Object.entries(COUNTRY_TO_LANGUAGE)
  .filter(([country, language]) => !languages.has(country) && languages.has(language)));
const publicRoutes = Object.values(buildPublicSeoRouteMatchers());

export const countryPrefixRedirectMiddleware: RequestHandler = (req, res, next) => {
  const match = req.path.match(/^\/([a-z]{2})(\/.*)?$/i);
  const target = match && countryPrefixes.get(match[1].toLowerCase());
  if (!target) return next();
  if ((req.method === 'GET' || req.method === 'HEAD') && getRetiredLocaleFromPath(req.path)
      && decodePublicSeoPath(req.path) !== null) {
    const matchingPath = `/en${getLanguageFromPath(req.path).cleanPath.replace(/^\/$/, '')}`;
    if (publicRoutes.some(matcher => matcher.test(matchingPath))) return next();
  }
  // Private SPA routes still need their established language prefix: the
  // downstream shape validator deliberately rejects country-only aliases.
  const queryAt = req.originalUrl.indexOf('?');
  res.redirect(301, `/${target}${match?.[2] || ''}${queryAt >= 0 ? req.originalUrl.substring(queryAt) : ''}`);
};
