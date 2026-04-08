"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pokemonCatalogProvider = exports.PokemonCatalogProvider = void 0;
const pokemonApiClient_1 = require("../pokemonApiClient");
class PokemonCatalogProvider {
    getSets() {
        return __awaiter(this, arguments, void 0, function* (limit = 250) {
            const sets = yield pokemonApiClient_1.pokemonApiClient.getSets(limit);
            return sets.map((set) => ({
                id: set.id,
                name: set.name,
                releaseDate: set.releaseDate,
            }));
        });
    }
    getCardsForSet(setId) {
        return __awaiter(this, void 0, void 0, function* () {
            const cards = yield pokemonApiClient_1.pokemonApiClient.searchCardsBulk({
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
        });
    }
}
exports.PokemonCatalogProvider = PokemonCatalogProvider;
exports.pokemonCatalogProvider = new PokemonCatalogProvider();
