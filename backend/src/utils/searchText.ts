/**
 * Search text normalisation shared by the catalog SQL and the live Pokemon TCG API query.
 *
 * Users type "ho oh", "mr mime", "breakpoint"; the catalog stores "Ho-Oh", "Mr. Mime",
 * "BREAKpoint". Matching on a compact form (lowercase, ASCII letters and digits only)
 * makes those line up without a full-text index.
 */

const stripDiacritics = (value: string): string =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/** "Ho-Oh" → "hooh", "Flabébé" → "flabebe", "Mr. Mime" → "mrmime". */
export const compactSearchText = (value: string | null | undefined): string =>
  stripDiacritics(String(value ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** "ho-oh ex" → ["ho", "oh", "ex"]. */
export const searchTokens = (value: string | null | undefined): string[] =>
  stripDiacritics(String(value ?? ''))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Characters stripped by `compactSqlExpr`. SQLite has no regex replace, so this is a
 * fixed list of the punctuation that appears in Pokemon card and set names.
 */
const SQL_STRIPPED_CHARS = [
  ' ',
  '-',
  '.',
  "'",
  '’',
  ':',
  '&',
  '(',
  ')',
  ',',
  '!',
  '?',
  '/',
  '♀',
  '♂',
];

/** SQL expression equivalent to `compactSearchText` for card and set name columns. */
export const compactSqlExpr = (column: string): string => {
  let expr = `lower(IFNULL(${column}, ''))`;
  for (const ch of SQL_STRIPPED_CHARS) {
    expr = `replace(${expr}, '${ch.replace(/'/g, "''")}', '')`;
  }
  return `replace(replace(${expr}, 'é', 'e'), 'É', 'e')`;
};

/**
 * pokemontcg.io query for a free-text name search. An unquoted space ends the term,
 * so `name:*ho oh*` was sent as two broken clauses; each word becomes its own wildcard
 * clause instead (clauses are ANDed by the API).
 */
export const buildPokemonTcgNameQuery = (value: string): string | undefined => {
  const tokens = searchTokens(value);
  if (tokens.length === 0) return undefined;
  return tokens.map((token) => `name:*${token}*`).join(' ');
};
