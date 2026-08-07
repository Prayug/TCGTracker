"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSetImages = exports.sortSetsForDisplay = exports.compareSetsByEraAndRelease = exports.parseReleaseDate = exports.getEraLabel = exports.classifySetEra = exports.ERA_GROUPS = void 0;
exports.ERA_GROUPS = [
    { id: 'mega', label: 'Mega Evolution', sortOrder: 0 },
    { id: 'sv', label: 'Scarlet & Violet', sortOrder: 1 },
    { id: 'swsh', label: 'Sword & Shield', sortOrder: 2 },
    { id: 'sm', label: 'Sun & Moon', sortOrder: 3 },
    { id: 'xy', label: 'XY', sortOrder: 4 },
    { id: 'bw', label: 'Black & White', sortOrder: 5 },
    { id: 'col', label: 'Call of Legends', sortOrder: 6 },
    { id: 'hgss', label: 'HeartGold & SoulSilver', sortOrder: 7 },
    { id: 'dp', label: 'Diamond & Pearl', sortOrder: 8 },
    { id: 'ex', label: 'EX Series', sortOrder: 9 },
    { id: 'ecard', label: 'e-Card', sortOrder: 10 },
    { id: 'neo', label: 'Neo', sortOrder: 11 },
    { id: 'gym', label: 'Gym', sortOrder: 12 },
    { id: 'base', label: 'Base', sortOrder: 13 },
    { id: 'promo', label: 'Promos & Special', sortOrder: 14 },
    { id: 'other', label: 'Other', sortOrder: 15 },
];
const eraSortIndex = new Map(exports.ERA_GROUPS.map((g) => [g.id, g.sortOrder]));
/** Official Black Star / era promo set ids → parent era (not a separate Promos bucket). */
const PROMO_SET_ERA = {
    mep: 'mega',
    svp: 'sv',
    swshp: 'swsh',
    smp: 'sm',
    xyp: 'xy',
    bwp: 'bw',
    hsp: 'hgss',
    dpp: 'dp',
    np: 'neo', // Nintendo Black Star Promos (Neo → e-Card window)
    basep: 'base',
};
/** Infer parent era from promo / special-set naming when the set id isn't a known promo code. */
function eraFromPromoLabel(name, series, id) {
    const blob = `${id} ${name} ${series}`;
    if (/\bmep\b|mega evolution/.test(blob))
        return 'mega';
    if (/\bsvp\b|scarlet|violet/.test(blob))
        return 'sv';
    if (/\bswshp?\b|sword|shield|\bpgo\b|celebrations/.test(blob))
        return 'swsh';
    if (/\bsmp\b|sun\s*(&|and)?\s*moon|\bsm\b/.test(blob))
        return 'sm';
    if (/\bxyp\b|\bxy\b|generations|evolutions/.test(blob))
        return 'xy';
    if (/\bbwp\b|black\s*(&|and)?\s*white|\bbw\b/.test(blob))
        return 'bw';
    if (/\bhsp\b|heartgold|soulsilver|\bhgss\b/.test(blob))
        return 'hgss';
    if (/\bdpp\b|diamond|pearl|platinum|\bdp\b|\bpl\b/.test(blob))
        return 'dp';
    if (/\bex\b|delta species/.test(blob))
        return 'ex';
    if (/\becard\b|e-card|skyridge|aquapolis|expedition/.test(blob))
        return 'ecard';
    if (/\bnp\b|\bneo\b/.test(blob))
        return 'neo';
    if (/\bgym\b/.test(blob))
        return 'gym';
    if (/\bbasep?\b|wizards black star|base set/.test(blob))
        return 'base';
    return null;
}
const classifySetEra = (input) => {
    var _a;
    const id = input.id.toLowerCase();
    const name = input.name.toLowerCase();
    const series = (input.series || '').toLowerCase();
    // Known promo set codes first so they never land in the Promos catch-all.
    if (PROMO_SET_ERA[id])
        return PROMO_SET_ERA[id];
    if (series.includes('mega') || /^me\d|^me-|^me_|^mep$/.test(id) || name.includes('mega evolution')) {
        return 'mega';
    }
    // zsv/rsv = SV-era special sets (Black Bolt / White Flare); sve = energies; svp = SV promos
    if (series.includes('scarlet') ||
        series.includes('violet') ||
        /^(z|r)?sv\d|^sv-|^svp$|^sve$|^sv[a-z]/.test(id) ||
        name === 'black bolt' ||
        name === 'white flare') {
        return 'sv';
    }
    if (series.includes('sword') ||
        series.includes('shield') ||
        /^swsh\d|^swshp$|^pgo|^cel\d/.test(id)) {
        return 'swsh';
    }
    if (series.includes('sun') || series.includes('moon') || /^sm\d|^sm-|^smp$/.test(id)) {
        return 'sm';
    }
    if (series.includes(' xy') ||
        series === 'xy' ||
        series.startsWith('xy') ||
        /^xy\d|^xy-|^xyp$|^dc1|^g1|^k1/.test(id)) {
        return 'xy';
    }
    // Prefer series/id — do not use set name "black"/"white" (Black Bolt / White Flare are SV).
    if (series.includes('black & white') ||
        series.includes('black and white') ||
        /^bw\d|^bw-|^bwp$/.test(id)) {
        return 'bw';
    }
    if (id === 'col1' || name.includes('call of legends'))
        return 'col';
    if (series.includes('heartgold') ||
        series.includes('soulsilver') ||
        /^hgss\d|^hgss-|^hsp$/.test(id)) {
        return 'hgss';
    }
    if (series.includes('diamond') ||
        series.includes('pearl') ||
        /^dp\d|^pl\d|^pl-|^dp-|^dpp$/.test(id)) {
        return 'dp';
    }
    if (series.includes('ex') || /^ex\d|^ex-/.test(id))
        return 'ex';
    if (series.includes('ecard') || series.includes('e-card') || /^ecard\d/.test(id))
        return 'ecard';
    if (series.includes('neo') || /^neo\d|^neo-|^np$/.test(id))
        return 'neo';
    if (series.includes('gym') || /^gym\d/.test(id))
        return 'gym';
    if (series.includes('base') || /^base\d|^base-|^basep$/.test(id))
        return 'base';
    // Promos / specials: fold into the parent era when we can tell which one.
    if (name.includes('promo') ||
        id.includes('promo') ||
        series.includes('promo') ||
        name.includes('black star') ||
        name.includes('prize pack') ||
        name.includes('deck exclusive')) {
        return (_a = eraFromPromoLabel(name, series, id)) !== null && _a !== void 0 ? _a : 'promo';
    }
    return 'other';
};
exports.classifySetEra = classifySetEra;
const getEraLabel = (eraId) => { var _a, _b; return (_b = (_a = exports.ERA_GROUPS.find((g) => g.id === eraId)) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : 'Other'; };
exports.getEraLabel = getEraLabel;
const parseReleaseDate = (value) => {
    if (!value)
        return 0;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? 0 : ts;
};
exports.parseReleaseDate = parseReleaseDate;
const compareSetsByEraAndRelease = (a, b) => {
    var _a, _b;
    const eraA = (_a = eraSortIndex.get(a.era)) !== null && _a !== void 0 ? _a : 99;
    const eraB = (_b = eraSortIndex.get(b.era)) !== null && _b !== void 0 ? _b : 99;
    if (eraA !== eraB)
        return eraA - eraB;
    const dateDiff = (0, exports.parseReleaseDate)(b.releaseDate) - (0, exports.parseReleaseDate)(a.releaseDate);
    if (dateDiff !== 0)
        return dateDiff;
    return a.releaseDate.localeCompare(b.releaseDate);
};
exports.compareSetsByEraAndRelease = compareSetsByEraAndRelease;
const sortSetsForDisplay = (sets) => [...sets].sort(exports.compareSetsByEraAndRelease);
exports.sortSetsForDisplay = sortSetsForDisplay;
/** Use API image URLs when present; otherwise build standard pokemontcg.io paths. */
const resolveSetImages = (apiImages, setId) => {
    const logo = (apiImages === null || apiImages === void 0 ? void 0 : apiImages.logo) || '';
    const symbol = (apiImages === null || apiImages === void 0 ? void 0 : apiImages.symbol) || '';
    if (logo || symbol) {
        return { logo, symbol };
    }
    const id = (setId || '').trim();
    if (!id)
        return { logo: '', symbol: '' };
    return {
        logo: `https://images.pokemontcg.io/${id}/logo.png`,
        symbol: `https://images.pokemontcg.io/${id}/symbol.png`,
    };
};
exports.resolveSetImages = resolveSetImages;
