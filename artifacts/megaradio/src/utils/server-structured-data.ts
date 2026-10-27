export interface ServerStructuredData {
  global: Record<string, unknown>[];
  page: Record<string, unknown>[];
}

const selector = 'script[type="application/ld+json"][data-managed="seo-structured-data"]';

function hasType(schema: Record<string, unknown>, type: string) {
  return schema['@type'] === type || (Array.isArray(schema['@type']) && schema['@type'].includes(type));
}

function withoutStationList(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  if (hasType(schema, 'ItemList')) return undefined;
  const mainEntity = schema.mainEntity;
  if (hasType(schema, 'CollectionPage') && mainEntity && typeof mainEntity === 'object'
    && !Array.isArray(mainEntity) && hasType(mainEntity as Record<string, unknown>, 'ItemList')) {
    const { mainEntity: _stationList, ...collection } = schema;
    return collection;
  }
  return schema;
}

/** The genre UI owns its filtered/paginated stations, not the server's popular list. */
export function withoutGenreStationLists(data: ServerStructuredData): ServerStructuredData {
  if (!Array.isArray(data?.page) || !data.page.every(schema =>
    schema && typeof schema === 'object' && !Array.isArray(schema))) return data;
  return { ...data, page: data.page.flatMap(schema => {
    const retained = withoutStationList(schema);
    return retained ? [retained] : [];
  }) };
}

export function clearGenreStationLists() {
  document.querySelectorAll(`${selector}[data-schema-scope="page"]`).forEach(script => {
    try {
      const schema = JSON.parse(script.textContent || '{}');
      if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
      const retained = withoutStationList(schema);
      if (!retained) script.remove();
      else if (retained !== schema) script.textContent = JSON.stringify(retained);
    } catch { /* Leave unrelated or malformed markup untouched. */ }
  });
}

export function clearPageStructuredData() {
  document.querySelectorAll(`${selector}[data-schema-scope="page"]`).forEach(script => script.remove());
}

/** Apply only server-owned JSON-LD; preserve organization/site nodes and any third-party markup. */
export function applyServerStructuredData(data: ServerStructuredData) {
  if (!Array.isArray(data?.global) || !Array.isArray(data?.page)) return;
  const isSchema = (schema: unknown): schema is Record<string, unknown> =>
    !!schema && typeof schema === 'object' && !Array.isArray(schema);
  if (![...data.global, ...data.page].every(isSchema)) return;

  const append = (schema: Record<string, unknown>, scope: 'global' | 'page') => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.managed = 'seo-structured-data';
    script.dataset.schemaScope = scope;
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  };

  // Reuse the same global nodes while updating localized descriptions/search
  // URLs on a language change. Do not delete unrelated global entities.
  for (const schema of data.global) {
    const existing = [...document.querySelectorAll(`${selector}[data-schema-scope="global"]`)].find(script => {
      try { return schema['@id'] && JSON.parse(script.textContent || '{}')['@id'] === schema['@id']; }
      catch { return false; }
    });
    if (existing) existing.textContent = JSON.stringify(schema);
    else append(schema, 'global');
  }
  clearPageStructuredData();
  data.page.forEach(schema => append(schema, 'page'));
}
