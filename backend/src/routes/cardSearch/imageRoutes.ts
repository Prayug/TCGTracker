import { Router, Response } from 'express';
import { getDb } from '../../db/database';
import { logger } from '../../utils/logger';
import {
  pokemonApiClient,
  CardImageMatchResult,
  PokemonApiCard,
} from '../../services/pokemonApiClient';
import { generateUniqueIdentifier } from '../../services/cardIdentifier';
import {
  cardImageCache,
  CACHE_TTL,
  getCacheKey,
} from '../../services/cardCache';
import { getCardMappingImages } from '../../services/cardImageBackfillService';

const router = Router();

function persistMatchedCardRarity(card: any): void {
  const db = getDb();
  const setIdNormalized = card.set?.id || '';
  const cardNumber = card.number || '';
  const resolvedCardName = card.name || '';
  const uniqueIdentifier = generateUniqueIdentifier(setIdNormalized, cardNumber, resolvedCardName);

  db.run(
    'UPDATE card_mappings SET rarity = ? WHERE uniqueIdentifier = ?',
    [card.rarity, uniqueIdentifier],
    (err) => {
      if (err) {
        logger.warn(`Failed to update rarity for ${resolvedCardName}:`, err);
      } else {
        logger.info(`Updated rarity for ${resolvedCardName}: ${card.rarity}`);
      }
    }
  );
}

function lookupMappedImageRow(cardName: string, setId: string): Promise<any> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT imageSmall, imageLarge, cardNumber FROM card_mappings
       WHERE cardName = ? AND setId = ?
         AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
       LIMIT 1`,
      [cardName.trim(), setId.trim()],
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
}

function lookupSearchPokemonCache(
  cardName: string,
  setId: unknown,
  cardNumber: unknown,
  setName: unknown
) {
  const cacheKey = getCacheKey(
    cardName,
    typeof setId === 'string' && setId.trim().length > 0
      ? setId
      : (setName as string) || 'unknown',
    cardNumber as string | undefined
  );
  const cached = cardImageCache.get(cacheKey);
  const hit =
    cached && Date.now() - cached.timestamp < CACHE_TTL ? cached : undefined;
  return { cacheKey, hit };
}

function missingPokemonImageJson(
  searchResult: CardImageMatchResult,
  searched: { cardName: unknown; setId: unknown; setName: unknown; cardNumber: unknown }
) {
  return {
    error: `Card not found or missing images`,
    searched,
    attempts: searchResult.attempts,
    availableCards: searchResult.candidates.slice(0, 5).map((card) => ({
      name: card.name,
      set: card.set?.id,
      number: card.number,
    })),
  };
}

function buildAndCacheImageMatch(
  cacheKey: string,
  card: PokemonApiCard,
  searchResult: CardImageMatchResult
) {
  const responsePayload = {
    card,
    images: {
      small: card.images!.small as string,
      large: card.images!.large as string,
    },
    id: card.id,
    matchedSet: card.set?.name,
    matchedNumber: card.number,
    rarity: card.rarity,
    cached: false,
    attempts: searchResult.attempts,
    usedFallback: searchResult.usedFallback,
  };
  cardImageCache.set(cacheKey, {
    ...responsePayload,
    timestamp: Date.now(),
  });
  return responsePayload;
}

function mappingImagesPayload(row: {
  imageSmall?: string | null;
  imageLarge?: string | null;
  cardNumber?: string | null;
}) {
  return {
    images: {
      small: row.imageSmall || row.imageLarge || '',
      large: row.imageLarge || row.imageSmall || '',
    },
    cardNumber: row.cardNumber,
    source: 'card_mappings',
  };
}

function cachedSearchPokemonBody(cached: {
  card: any;
  images: { small: string; large: string };
  id: string;
  matchedSet: string;
  matchedNumber: string;
}) {
  return {
    card: cached.card,
    images: cached.images,
    id: cached.id,
    matchedSet: cached.matchedSet,
    matchedNumber: cached.matchedNumber,
    cached: true,
  };
}

async function respondUncachedSearchPokemon(
  res: Response,
  cacheKey: string,
  cardName: string,
  setId: unknown,
  setName: unknown,
  cardNumber: unknown
): Promise<void> {
  const searchResult: CardImageMatchResult = await pokemonApiClient.findBestImageMatch({
    cardName,
    setId: typeof setId === 'string' ? setId.trim() : undefined,
    setName: typeof setName === 'string' ? setName.trim() : undefined,
    cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
  });

  if (!searchResult.card || !searchResult.card.images?.small || !searchResult.card.images?.large) {
    res.status(404).json(
      missingPokemonImageJson(searchResult, { cardName, setId, setName, cardNumber })
    );
    return;
  }

  const responsePayload = buildAndCacheImageMatch(cacheKey, searchResult.card, searchResult);

  logger.info(
    `✅ Matched card: ${searchResult.card.name} from ${searchResult.card.set?.name} (#${searchResult.card.number})`
  );

  // Update rarity in database if available
  if (searchResult.card?.rarity && searchResult.card.rarity.trim()) {
    persistMatchedCardRarity(searchResult.card);
  }

  res.json(responsePayload);
}

/**
 * Read persisted card images from card_mappings (populated by the image backfill pipeline).
 */
router.get('/resolve-image', async (req, res) => {
  try {
    const { cardId, cardName, setId } = req.query;

    if (cardId && typeof cardId === 'string') {
      const stored = await getCardMappingImages(cardId);
      if (stored?.imageSmall || stored?.imageLarge) {
        return res.json(mappingImagesPayload(stored));
      }
    }

    if (!cardName || typeof cardName !== 'string' || !setId || typeof setId !== 'string') {
      return res.status(400).json({
        error: 'Provide cardId, or both cardName and setId',
      });
    }

    const row: any = await lookupMappedImageRow(cardName, setId);

    if (!row) {
      return res.status(404).json({
        error: 'No persisted image found for this card',
        searched: { cardId, cardName, setId },
      });
    }

    res.json(mappingImagesPayload(row));
  } catch (error) {
    logger.error('Error reading card image:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', async (req, res) => {
  try {
    const { cardName, setId, cardNumber, setName } = req.query;

    if (!cardName || typeof cardName !== 'string') {
      return res.status(400).json({
        error: 'cardName query parameter is required',
      });
    }

    const { cacheKey, hit: cached } = lookupSearchPokemonCache(
      cardName,
      setId,
      cardNumber,
      setName
    );

    if (cached) {
      logger.info(`💾 Cache hit for ${cardName} from ${setId || setName || 'unknown set'}`);
      return res.json(cachedSearchPokemonBody(cached));
    }

    await respondUncachedSearchPokemon(res, cacheKey, cardName, setId, setName, cardNumber);
  } catch (error) {
    logger.error('Error searching Pokemon API:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

export default router;
