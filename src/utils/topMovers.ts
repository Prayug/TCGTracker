import type { PokemonCard } from '../types/pokemon';
import type { TopMoverEntry } from '../services/priceHistoryApi';

/** Normalize price_history finishes (reverseholofoil) to tcgplayer-style keys (reverseHolofoil). */
export const toVariantKey = (subType?: string | null): string => {
  if (!subType) return 'normal';
  const cleaned = subType.replace(/[\s_-]+/g, '').toLowerCase();
  const known: Record<string, string> = {
    normal: 'normal',
    holofoil: 'holofoil',
    reverseholofoil: 'reverseHolofoil',
    '1stedition': '1stEdition',
    '1steditionholofoil': '1stEditionHolofoil',
    unlimited: 'unlimited',
    unlimitedholofoil: 'unlimitedHolofoil',
  };
  if (known[cleaned]) return known[cleaned];
  return subType.replace(/([a-z])([A-Z])/g, '$1$2');
};

export const formatVariantLabel = (subType?: string | null): string => {
  if (!subType) return '';
  return toVariantKey(subType)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
};

export const moverSubtitle = (entry: TopMoverEntry): string => {
  const parts: string[] = [];
  const setLabel = entry.setName || entry.groupName;
  if (setLabel) {
    parts.push(entry.cardNumber ? `${setLabel} #${entry.cardNumber}` : setLabel);
  } else if (entry.cardNumber) {
    parts.push(`#${entry.cardNumber}`);
  }
  const variant = formatVariantLabel(entry.subTypeName);
  if (variant && variant.toLowerCase() !== 'normal') {
    parts.push(variant);
  }
  return parts.join(' · ');
};

export const moverKey = (e: TopMoverEntry): string =>
  e.uniqueIdentifier || `${e.cardId || 'prod'}-${e.subTypeName || e.productId}`;

export const moverToCard = (entry: TopMoverEntry): PokemonCard => {
  let parsedPrices:
    | Record<string, { market?: number; mid?: number; high?: number; low?: number }>
    | undefined;
  try {
    if (entry.tcgplayerPrices) {
      parsedPrices = JSON.parse(entry.tcgplayerPrices);
    }
  } catch {
    /* ignore */
  }

  const preferredVariant = toVariantKey(entry.subTypeName);
  if (!parsedPrices) parsedPrices = {};
  if (!parsedPrices[preferredVariant]) {
    parsedPrices[preferredVariant] = { market: entry.currentPrice };
  } else {
    parsedPrices[preferredVariant] = {
      ...parsedPrices[preferredVariant],
      market: entry.currentPrice,
    };
  }

  return {
    id: entry.cardId || `prod-${entry.productId}`,
    name: entry.productName,
    uniqueIdentifier: entry.uniqueIdentifier || undefined,
    preferredVariant,
    images: {
      small: entry.imageSmall || entry.imageLarge || '',
      large: entry.imageLarge || entry.imageSmall || '',
    },
    set: {
      id: entry.setId || '',
      name: entry.setName || entry.groupName || '',
      releaseDate: '',
      total: 0,
    },
    number: entry.cardNumber || '',
    rarity: entry.rarity || undefined,
    marketPrice: entry.currentPrice,
    tcgplayer: {
      productId: entry.tcgplayerProductId || undefined,
      prices: parsedPrices,
    },
  };
};
