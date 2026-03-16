"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pokemonCatalogProvider = exports.PokemonCatalogProvider = void 0;
const pokemonApiClient_1 = require("../pokemonApiClient");
class PokemonCatalogProvider {
    async getSets(limit = 250) {
        const sets = await pokemonApiClient_1.pokemonApiClient.getSets(limit);
        return sets.map((set) => ({
            id: set.id,
            name: set.name,
            releaseDate: set.releaseDate,
        }));
    }
    async getCardsForSet(setId) {
        const cards = await pokemonApiClient_1.pokemonApiClient.searchCardsBulk({
            rawQuery: `set.id:${setId}`,
            pageSize: 250,
            fetchAll: true,
            maxPages: 10,
        });
        return cards.cards.map((card) => {
            var _a, _b, _c, _d, _e;
            return ({
                cardId: card.id,
                cardName: card.name,
                setId: card.set.id,
                setName: card.set.name,
                setReleaseDate: card.set.releaseDate,
                cardNumber: card.number,
                rarity: card.rarity,
                artist: card.artist,
                types: card.subtypes,
                imageSmall: (_a = card.images) === null || _a === void 0 ? void 0 : _a.small,
                imageLarge: (_b = card.images) === null || _b === void 0 ? void 0 : _b.large,
                tcgplayerProductId: ((_c = card.tcgplayer) === null || _c === void 0 ? void 0 : _c.productId) !== undefined && ((_d = card.tcgplayer) === null || _d === void 0 ? void 0 : _d.productId) !== null
                    ? String(card.tcgplayer.productId)
                    : undefined,
                tcgplayerPrices: (_e = card.tcgplayer) === null || _e === void 0 ? void 0 : _e.prices,
            });
        });
    }
}
exports.PokemonCatalogProvider = PokemonCatalogProvider;
exports.pokemonCatalogProvider = new PokemonCatalogProvider();
