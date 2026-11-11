const SEARCH_SYNONYMS: Record<string, string> = {
  // Turkish city names
  viyana: 'vienna', münih: 'munich', londra: 'london', roma: 'rome',
  venedik: 'venice', floransa: 'florence', napoli: 'naples',
  barselona: 'barcelona', brüksel: 'brussels', moskova: 'moscow',
  varşova: 'warsaw', prag: 'prague', budapeşte: 'budapest',
  bükreş: 'bucharest', sofya: 'sofia', atina: 'athens',
  lizbon: 'lisbon', kopenhag: 'copenhagen', stokholm: 'stockholm',
  lahey: 'hague', zürih: 'zurich', cenevre: 'geneva',
  // German city names
  münchen: 'munich', köln: 'cologne', nürnberg: 'nuremberg',
  zürich: 'zurich',
  // Turkish country names
  almanya: 'germany', avusturya: 'austria', ingiltere: 'england',
  fransa: 'france', italya: 'italy', ispanya: 'spain',
  hollanda: 'netherlands', belçika: 'belgium', portekiz: 'portugal',
  lehistan: 'poland', rusya: 'russia', japonya: 'japan',
  çin: 'china', hindistan: 'india', brezilya: 'brazil',
  avustralya: 'australia', kanada: 'canada', meksika: 'mexico',
};

/** Same fold as the immutable indexed PostgreSQL station_search_key function. */
export function stationSearchKey(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]/gu, '');
}

// Expand; never replace the actual station name typed by the listener.
const groups = new Map<string, Set<string>>();
for (const [from,to] of Object.entries({...SEARCH_SYNONYMS,wien:'vienna',radyo:'radio',turkiye:'turkey',türkiye:'turkey'})) {
  const canonical=stationSearchKey(to);
  const group=groups.get(canonical) || new Set([to]); group.add(from); groups.set(canonical,group);
}
const synonyms = new Map<string,string[]>();
for (const group of groups.values()) for (const word of group) synonyms.set(stationSearchKey(word), [...group]);

export function stationSearchTerms(search: string) {
  const text=search.trim().replace(/\s+/g,' ').slice(0,100);
  const words=text.split(' ').filter(Boolean).slice(0,8);
  return {text,key:stationSearchKey(text),words:words.map(word=>{
    const alternatives=[...new Set([word,...(synonyms.get(stationSearchKey(word)) || [])])].slice(0,6);
    return {word,alternatives};
  })};
}

const pattern=(value:string)=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;

/** Indexed candidate matching first, then name relevance before popularity. */
export function stationSearchSql(search:string, bind:(value:unknown)=>string):{where:string;order:string} {
  const {text,key,words}=stationSearchTerms(search);
  if(text.length<2 || !words.length) return {where:'FALSE',order:''};
  // Percent/underscore/backslash are literal search text, never SQL wildcards.
  const literal=/[%_\\]/.test(text);
  const rawPhrase=bind(pattern(text));
  const exact=bind(text);
  const folded=literal || !key ? null : bind(key);
  const originalName:string[]=[];
  const expandedName:string[]=[];
  const candidates=words.map(({word,alternatives})=>{
    const raw=bind(alternatives.map(pattern));
    const original=bind(pattern(word));
    const originalKey=stationSearchKey(word);
    const keys=literal?[]:[...new Set(alternatives.map(stationSearchKey).filter(Boolean))];
    const normalized=keys.length?bind(keys.map(pattern)):null;
    const ownKey=!literal && originalKey?bind(pattern(originalKey)):null;
    const name=`(name ILIKE ANY(${raw}::text[])${normalized?` OR station_search_key(name) LIKE ANY(${normalized}::text[])`:''})`;
    expandedName.push(name);
    originalName.push(`(name ILIKE ${original}${ownKey?` OR station_search_key(name) LIKE ${ownKey}`:''})`);
    // Two-character queries search names only, avoiding unselective country/tag scans.
    return text.length<3?name:`(${name} OR country ILIKE ANY(${raw}::text[]) OR state ILIKE ANY(${raw}::text[]) OR tags_raw ILIKE ANY(${raw}::text[]))`;
  });
  const brand=folded?`station_search_key(regexp_replace(name,'(^[[:space:]]*(radio|radyo)[[:space:][:punct:]]+)|([[:space:][:punct:]]+(fm|am)[[:space:]]*$)','','gi'))=${folded}`:'FALSE';
  return {
    where:`(${candidates.join(' AND ')})`,
    order:`(CASE WHEN lower(btrim(name))=lower(${exact}) THEN 1000
      ${folded?`WHEN station_search_key(name)=${folded} THEN 900 WHEN ${brand} THEN 800`:''}
      WHEN ${originalName.join(' AND ')} THEN 700
      WHEN name ILIKE ${rawPhrase} THEN 650
      WHEN ${expandedName.join(' AND ')} THEN 500 ELSE 100 END) DESC,`,
  };
}
