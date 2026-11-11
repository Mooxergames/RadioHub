export function descriptionLocaleProtected(manual: unknown, language: string): boolean {
  if (!manual || typeof manual !== 'object' || Array.isArray(manual)) return true;
  const flags = manual as Record<string, unknown>;
  return ['descriptions', `descriptions.${language}`, `descriptions.${language}.full`, `descriptions.${language}.meta`]
    .some(key => Object.hasOwn(flags, key) && flags[key] !== false);
}
