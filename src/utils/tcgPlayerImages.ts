/**
 * Resolve TCGPlayer CDN art for product-backed cards (tcgcsv-* / Collectr imports)
 * that never received Pokemon TCG API image URLs.
 */
export function extractTcgPlayerProductId(card: {
  id?: string;
  tcgplayer?: { productId?: string | number };
}): string | null {
  const fromMeta = card.tcgplayer?.productId;
  if (fromMeta != null && String(fromMeta).trim() !== '') {
    return String(fromMeta).replace(/\D/g, '') || null;
  }
  const id = card.id ?? '';
  const match = id.match(/^tcgcsv-(\d+)$/i);
  return match?.[1] ?? null;
}

export function tcgPlayerImageUrls(productId: string): { small: string; large: string } {
  const id = productId.replace(/\D/g, '');
  return {
    small: `https://product-images.tcgplayer.com/fit-in/437x437/${id}.jpg`,
    large: `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg`,
  };
}

export function hasUsableCardImage(images?: { small?: string; large?: string } | null): boolean {
  const small = images?.small?.trim() ?? '';
  const large = images?.large?.trim() ?? '';
  return Boolean(small || large);
}

/** Fill empty image slots from TCGPlayer product id when possible. */
export function withResolvedCardImages<
  T extends {
    id?: string;
    images?: { small?: string; large?: string };
    tcgplayer?: { productId?: string | number };
  },
>(card: T): T {
  if (hasUsableCardImage(card.images)) return card;
  const productId = extractTcgPlayerProductId(card);
  if (!productId) return card;
  const urls = tcgPlayerImageUrls(productId);
  return {
    ...card,
    images: {
      small: card.images?.small?.trim() || urls.small,
      large: card.images?.large?.trim() || urls.large,
    },
  };
}
