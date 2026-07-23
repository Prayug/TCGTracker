import { pokemonApiClient } from '../pokemonApiClient';
import { CatalogCardSummary, CatalogProvider, CatalogSetSummary } from './contracts';

export class PokemonCatalogProvider implements CatalogProvider {
  async getSets(limit = 250): Promise<CatalogSetSummary[]> {
    const sets = await pokemonApiClient.getSets(limit);
    return sets.map((set) => ({
      id: set.id,
      name: set.name,
      releaseDate: set.releaseDate,
    }));
  }

  async getCardsForSet(setId: string): Promise<CatalogCardSummary[]> {
    const cards = await pokemonApiClient.searchCardsBulk({
      rawQuery: `set.id:${setId}`,
      pageSize: 250,
      fetchAll: true,
      maxPages: 10,
    });

    return cards.cards.map((card) => ({
      cardId: card.id,
      cardName: card.name,
      setId: card.set.id,
      setName: card.set.name,
      setReleaseDate: card.set.releaseDate,
      cardNumber: card.number,
      rarity: card.rarity,
      artist: (card as { artist?: string }).artist,
      // Elemental types (Fire/Water/…) — not subtypes (Basic/V)
      types: card.types,
      imageSmall: card.images?.small,
      imageLarge: card.images?.large,
      tcgplayerProductId:
        card.tcgplayer?.productId !== undefined && card.tcgplayer?.productId !== null
          ? String(card.tcgplayer.productId)
          : undefined,
      tcgplayerPrices: card.tcgplayer?.prices,
    }));
  }
}

export const pokemonCatalogProvider = new PokemonCatalogProvider();
