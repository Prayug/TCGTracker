/**
 * Stable identity for pack-shop pulls. The same physical card is often stored
 * under both a Pokemon API id (pop3-1) and a TCGCSV id (tcgcsv-83891).
 */

export function normalizePackToken(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizePackNumber(value: string | undefined | null): string {
  const raw = normalizePackToken(value);
  const stripped = raw.replace(/^0+/, '');
  return stripped || raw || '';
}

export function packCardIdentity(card: {
  id?: string;
  name?: string;
  number?: string;
  uniqueIdentifier?: string;
  set?: { id?: string; name?: string };
}): string {
  const name = normalizePackToken(card.name);
  const setName = normalizePackToken(card.set?.name);
  const number = normalizePackNumber(card.number);
  if (name && setName) {
    return `${setName}|${number}|${name}`;
  }
  return (
    card.id ||
    card.uniqueIdentifier ||
    `${normalizePackToken(card.set?.id)}|${number}|${name}`
  );
}
