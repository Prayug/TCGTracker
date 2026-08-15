"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const onePiecePriceCharting_1 = require("../onePiecePriceCharting");
const priceChartingClient_1 = require("../priceChartingClient");
const priceChartingResolver_1 = require("../priceChartingResolver");
(0, globals_1.describe)('One Piece name / family parsing', () => {
    (0, globals_1.it)('strips collector-number and variant parentheses', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.stripOpNameDecorators)('Monkey.D.Luffy (003) (Parallel)')).toBe('Monkey.D.Luffy');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.stripOpNameDecorators)('Shanks (Parallel) (Manga) (Alternate Art)')).toBe('Shanks');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.stripOpNameDecorators)('Sabo (120) (SP)')).toBe('Sabo');
    });
    (0, globals_1.it)('maps OPTCG variant tags onto PriceCharting families', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({ cardName: 'Monkey.D.Luffy (003)', cardImageId: 'OP01-003' })).toBe('standard');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({
            cardName: 'Monkey.D.Luffy (003) (Parallel)',
            cardImageId: 'OP01-003_p1',
        })).toBe('parallel');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({
            cardName: 'Shanks (Parallel) (Manga) (Alternate Art)',
            cardImageId: 'OP01-120_p2',
        })).toBe('manga');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({
            cardName: 'Sabo (120) (Red Super Alternate Art)',
            cardImageId: 'OP13-120_p3',
        })).toBe('redmanga');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({
            cardName: 'Sabo (120) (Wanted Poster)',
            cardImageId: 'OP13-120_p4',
        })).toBe('wanted');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({ cardName: 'Sabo (120) (SP)', cardImageId: 'OP13-120' })).toBe('standard');
    });
    (0, globals_1.it)('keeps anniversary reprints distinct from the cheap base and from each other', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({
            cardName: 'Monkey.D.Luffy (English Version 1st Anniversary Set)',
            cardImageId: 'ST10-006_pr3',
        })).toBe('anniversary');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({
            cardName: 'Monkey.D.Luffy (3rd Anniversary Treasure Campaign Pack)',
            cardImageId: 'ST10-006_pr1',
        })).toBe('anniversary3');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({ cardName: 'Monkey.D.Luffy', cardImageId: 'ST10-006' })).toBe('standard');
    });
    (0, globals_1.it)('does not treat OPTCG _pr3 promo reprints as red manga (_p3)', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({
            cardName: 'Monkey.D.Luffy (English Version 1st Anniversary Set)',
            cardImageId: 'ST10-006_pr3',
        })).not.toBe('redmanga');
    });
    (0, globals_1.it)('detects families from PriceCharting titles', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Monkey.D.Luffy OP01-003', '')).toBe('standard');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Monkey.D.Luffy [Alt Art] OP01-003', '')).toBe('parallel');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Shanks [Manga Alternate Art] OP01-120', '')).toBe('manga');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Sabo [Red Manga] OP13-120', '')).toBe('redmanga');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Sabo [Wanted] OP13-120', '')).toBe('wanted');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('', 'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alt-art-op01-003')).toBe('parallel');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Monkey.D.Luffy [Anniversary] ST10-006', 'https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-anniversary-st10-006')).toBe('anniversary');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Monkey.D.Luffy [3rd Anniversary] ST10-006', 'https://www.pricecharting.com/game/one-piece-promo/monkeydluffy-3rd-anniversary-st10-006')).toBe('anniversary3');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.detectOpPrintFamily)('Monkey.D.Luffy ST10-006', '')).toBe('standard');
    });
    (0, globals_1.it)('does not treat manga alt art as a cheap parallel', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.opPrintFamiliesMatch)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({ cardName: 'Shanks (Parallel) (Manga) (Alternate Art)' }), (0, onePiecePriceCharting_1.detectOpPrintFamily)('Shanks [Alternate Art] OP01-120', ''))).toBe(false);
        (0, globals_1.expect)((0, onePiecePriceCharting_1.opPrintFamiliesMatch)((0, onePiecePriceCharting_1.expectedOpPrintFamily)({ cardName: 'Shanks (Parallel) (Manga) (Alternate Art)' }), (0, onePiecePriceCharting_1.detectOpPrintFamily)('Shanks [Manga Alternate Art] OP01-120', ''))).toBe(true);
    });
});
(0, globals_1.describe)('One Piece collector numbers', () => {
    (0, globals_1.it)('normalizes hyphenated codes without dropping the set prefix', () => {
        (0, globals_1.expect)((0, priceChartingClient_1.normalizeCardNumber)('OP01-003')).toBe('op01003');
        (0, globals_1.expect)((0, priceChartingClient_1.normalizeCardNumber)('#OP01-003')).toBe('op01003');
        (0, globals_1.expect)((0, priceChartingClient_1.normalizeCardNumber)('ST01-016')).toBe('st01016');
    });
    (0, globals_1.it)('extracts OP01-003 from PriceCharting titles and slugs', () => {
        (0, globals_1.expect)((0, priceChartingClient_1.extractCardNumbers)('Monkey.D.Luffy [Alt Art] OP01-003')).toContain('op01003');
        (0, globals_1.expect)((0, priceChartingClient_1.extractCardNumbers)('Monkey.D.Luffy #OP01-003')).toContain('op01003');
        (0, globals_1.expect)((0, priceChartingClient_1.extractCardNumbers)('https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alt-art-op01-003')).toContain('op01003');
    });
    (0, globals_1.it)('matches OP numbers without treating 003 as a hit inside OP01-003', () => {
        (0, globals_1.expect)((0, priceChartingClient_1.titleIncludesNumber)('Monkey.D.Luffy #OP01-003', 'OP01-003', 'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-op01-003')).toBe(true);
        (0, globals_1.expect)((0, priceChartingClient_1.titleIncludesNumber)('Monkey.D.Luffy #OP01-024', 'OP01-003')).toBe(false);
    });
});
(0, globals_1.describe)('One Piece product matching', () => {
    const base = {
        productId: '6235261',
        url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-op01-003',
        title: 'Monkey.D.Luffy OP01-003',
        setName: 'One Piece Romance Dawn',
    };
    const alt = {
        productId: '6235243',
        url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alt-art-op01-003',
        title: 'Monkey.D.Luffy [Alt Art] OP01-003',
        setName: 'One Piece Romance Dawn',
    };
    const manga = {
        productId: '1',
        url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/shanks-manga-alternate-art-op01-120',
        title: 'Shanks [Manga Alternate Art] OP01-120',
        setName: 'One Piece Romance Dawn',
    };
    (0, globals_1.it)('accepts the base print and rejects the alt art for a standard leader', () => {
        const input = {
            cardName: 'Monkey.D.Luffy (003)',
            setName: 'Romance Dawn',
            cardNumber: 'OP01-003',
            game: 'onepiece',
            cardImageId: 'OP01-003',
        };
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(base, input)).toBe(true);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(alt, input)).toBe(false);
    });
    (0, globals_1.it)('accepts alt art for Parallel and rejects the cheap base', () => {
        var _a;
        const input = {
            cardName: 'Monkey.D.Luffy (003) (Parallel)',
            setName: 'Romance Dawn',
            cardNumber: 'OP01-003',
            game: 'onepiece',
            cardImageId: 'OP01-003_p1',
        };
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(alt, input)).toBe(true);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(base, input)).toBe(false);
        (0, globals_1.expect)((_a = (0, priceChartingClient_1.selectBestProductMatch)([base, alt], input)) === null || _a === void 0 ? void 0 : _a.row.productId).toBe('6235243');
    });
    (0, globals_1.it)('does not match a Pokemon product to a One Piece request', () => {
        const pikachu = {
            productId: 'x',
            url: 'x',
            title: 'Pikachu ex #276',
            setName: 'Pokemon Ascended Heroes',
        };
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(pikachu, {
            cardName: 'Monkey.D.Luffy (003)',
            setName: 'Romance Dawn',
            cardNumber: 'OP01-003',
            game: 'onepiece',
        })).toBe(false);
    });
    (0, globals_1.it)('does not match a One Piece product to a Pokemon request', () => {
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(base, {
            cardName: 'Monkey.D.Luffy',
            setName: 'Romance Dawn',
            cardNumber: 'OP01-003',
        })).toBe(false);
    });
    (0, globals_1.it)('keeps manga distinct from alternate art', () => {
        const altShanks = {
            ...manga,
            productId: '2',
            title: 'Shanks [Alternate Art] OP01-120',
            url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/shanks-alternate-art-op01-120',
        };
        const input = {
            cardName: 'Shanks (Parallel) (Manga) (Alternate Art)',
            setName: 'Romance Dawn',
            cardNumber: 'OP01-120',
            game: 'onepiece',
            cardImageId: 'OP01-120_p2',
        };
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(manga, input)).toBe(true);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(altShanks, input)).toBe(false);
    });
});
(0, globals_1.describe)('One Piece same-number reprint matching', () => {
    const baseSt10 = {
        productId: '6239262',
        url: 'https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-st10-006',
        title: 'Monkey.D.Luffy ST10-006',
        setName: 'One Piece Ultra Deck: The Three Captains',
    };
    const anniversary = {
        productId: '7574931',
        url: 'https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-anniversary-st10-006',
        title: 'Monkey.D.Luffy [Anniversary] ST10-006',
        setName: 'One Piece Ultra Deck: The Three Captains',
    };
    const anniversary3 = {
        productId: '11355191',
        url: 'https://www.pricecharting.com/game/one-piece-promo/monkeydluffy-3rd-anniversary-st10-006',
        title: 'Monkey.D.Luffy [3rd Anniversary] ST10-006',
        setName: 'One Piece Promo',
    };
    const firstAnniversaryInput = {
        cardName: 'Monkey.D.Luffy (English Version 1st Anniversary Set)',
        setName: 'One Piece Promotion Cards',
        cardNumber: 'ST10-006',
        game: 'onepiece',
        cardImageId: 'ST10-006_pr3',
    };
    (0, globals_1.it)('does not treat two One Piece sets as the same just because they share One Piece', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.opSetNamesMatch)('One Piece Ultra Deck: The Three Captains', 'One Piece Promotion Cards')).toBe(false);
        (0, globals_1.expect)((0, onePiecePriceCharting_1.opSetNamesMatch)('One Piece Promo', 'One Piece Promotion Cards')).toBe(true);
        (0, globals_1.expect)((0, onePiecePriceCharting_1.opSetNamesMatch)('One Piece Romance Dawn', 'Romance Dawn')).toBe(true);
    });
    (0, globals_1.it)('maps the English 1st Anniversary reprint to [Anniversary], not the $10 base or 3rd Anniversary', () => {
        var _a;
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(anniversary, firstAnniversaryInput)).toBe(true);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(baseSt10, firstAnniversaryInput)).toBe(false);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(anniversary3, firstAnniversaryInput)).toBe(false);
        (0, globals_1.expect)((_a = (0, priceChartingClient_1.selectBestProductMatch)([baseSt10, anniversary, anniversary3], firstAnniversaryInput)) === null || _a === void 0 ? void 0 : _a.row.productId).toBe('7574931');
    });
    (0, globals_1.it)('keeps the Ultra Deck base ST10-006 off anniversary SKUs', () => {
        const input = {
            cardName: 'Monkey.D.Luffy',
            setName: 'Ultra Deck: The Three Captains',
            cardNumber: 'ST10-006',
            game: 'onepiece',
            cardImageId: 'ST10-006',
        };
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(baseSt10, input)).toBe(true);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(anniversary, input)).toBe(false);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(anniversary3, input)).toBe(false);
    });
    (0, globals_1.it)('maps 3rd Anniversary Treasure Campaign to the Promo console SKU', () => {
        const input = {
            cardName: 'Monkey.D.Luffy (3rd Anniversary Treasure Campaign Pack)',
            setName: 'One Piece Promotion Cards',
            cardNumber: 'ST10-006',
            game: 'onepiece',
            cardImageId: 'ST10-006_pr1',
        };
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(anniversary3, input)).toBe(true);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(anniversary, input)).toBe(false);
        (0, globals_1.expect)((0, priceChartingClient_1.isAcceptableMatch)(baseSt10, input)).toBe(false);
    });
});
(0, globals_1.describe)('One Piece console + slug', () => {
    (0, globals_1.it)('guesses One Piece console names without the Pokemon prefix', () => {
        (0, globals_1.expect)((0, priceChartingResolver_1.guessConsoleName)('Romance Dawn', 'en', 'onepiece')).toBe('One Piece Romance Dawn');
        (0, globals_1.expect)((0, onePiecePriceCharting_1.guessOnePieceConsoleName)('Starter Deck 1: Straw Hat Crew')).toBe('One Piece Starter Deck 1: Straw Hat Crew');
        (0, globals_1.expect)((0, priceChartingResolver_1.guessConsoleName)('Ascended Heroes', 'en')).toBe('Pokemon Ascended Heroes');
    });
    (0, globals_1.it)('strips periods so Monkey.D.Luffy hits monkeydluffy', () => {
        (0, globals_1.expect)((0, onePiecePriceCharting_1.stripOpPeriodsForSlug)('Monkey.D.Luffy')).toBe('MonkeyDLuffy');
        (0, globals_1.expect)((0, priceChartingClient_1.buildDirectProductUrl)('One Piece Romance Dawn', 'Monkey.D.Luffy (003) (Parallel)', 'OP01-003', 'parallel', { game: 'onepiece' })).toBe('https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alternate-art-op01-003');
        (0, globals_1.expect)((0, priceChartingClient_1.buildDirectProductUrl)('One Piece Ultra Deck: The Three Captains', 'Monkey.D.Luffy (English Version 1st Anniversary Set)', 'ST10-006', undefined, { game: 'onepiece' })).toBe('https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-anniversary-st10-006');
    });
});
