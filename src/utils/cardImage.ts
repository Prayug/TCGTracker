/**
 * Where to look for a card's artwork, best first. Every candidate is for the
 * same card: the URLs it already carries (through our image proxy, then the
 * original host in case the proxy is down), and for Pokémon TCG ids the
 * image path that pokemontcg.io derives from that exact id. Nothing here
 * guesses from a card's name, so a similar card's art is never shown.
 */

import { extractTcgPlayerProductId, tcgPlayerImageUrls } from './tcgPlayerImages';

/** Known placeholder/back images that must never be shown as a card front. */
const CARD_BACK_PATTERNS = [
  /card-?back/i,
  /cardback/i,
  /op-leader-back/i,
  /\/back\.(png|jpe?g|webp)/i,
];

export function isCardBackImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return CARD_BACK_PATTERNS.some((re) => re.test(url));
}

const PTCG_HOST = 'https://images.pokemontcg.io';
const PTCG_PROXY = '/images/pokemontcg';

/** Pokémon TCG ids look like `swsh7-215`, `sv3pt5-199`, `swsh12pt5gg-GG44`, `base1-4`. */
const PTCG_ID = /^([a-z][a-z0-9.]*?\d[a-z0-9.]*)-([A-Za-z]*\d+[A-Za-z]*)$/;

export interface ImageSource {
  id?: string | null;
  /** TCGplayer product id, when the card is product-backed. */
  tcgplayer?: { productId?: string | number } | null;
  images?: { small?: string | null; large?: string | null } | null;
}

function proxied(url: string): string {
  return url.startsWith(PTCG_HOST) ? PTCG_PROXY + url.slice(PTCG_HOST.length) : url;
}

function direct(url: string): string {
  return url.startsWith(PTCG_PROXY) ? PTCG_HOST + url.slice(PTCG_PROXY.length) : url;
}

/** The pokemontcg.io image paths for an id, or null when the id is not a Pokémon TCG id. */
export function ptcgImagesForId(
  id: string | null | undefined
): { small: string; large: string } | null {
  if (!id) return null;
  const m = PTCG_ID.exec(id.trim());
  if (!m) return null;
  const [, set, number] = m;
  return {
    small: `${PTCG_HOST}/${set}/${number}.png`,
    large: `${PTCG_HOST}/${set}/${number}_hires.png`,
  };
}

export function cardImageCandidates(
  card: ImageSource,
  size: 'small' | 'large' = 'small',
  isBack: (u: string) => boolean = isCardBackImage
): string[] {
  const own =
    size === 'large'
      ? [card.images?.large, card.images?.small]
      : [card.images?.small, card.images?.large];
  const derived = ptcgImagesForId(card.id);
  const fromId = derived
    ? size === 'large'
      ? [derived.large, derived.small]
      : [derived.small, derived.large]
    : [];
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    if (!u || isBack(u)) return;
    for (const v of [proxied(u), direct(u)]) if (!out.includes(v)) out.push(v);
  };
  own.forEach(push);
  fromId.forEach(push);
  // Product-backed cards (tcgcsv-*, Collectr imports): the CDN image for that exact product.
  const productId = extractTcgPlayerProductId({
    id: card.id ?? undefined,
    tcgplayer: card.tcgplayer ?? undefined,
  });
  if (productId) {
    const urls = tcgPlayerImageUrls(productId);
    (size === 'large' ? [urls.large, urls.small] : [urls.small, urls.large]).forEach(push);
  }
  return out;
}
