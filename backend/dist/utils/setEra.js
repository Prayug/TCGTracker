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
const classifySetEra = (input) => {
    const id = input.id.toLowerCase();
    const name = input.name.toLowerCase();
    const series = (input.series || '').toLowerCase();
    if (series.includes('mega') || /^me\d|^me-|^me_/.test(id) || name.includes('mega evolution')) {
        return 'mega';
    }
    if (series.includes('scarlet') || series.includes('violet') || /^sv\d|^sv-/.test(id)) {
        return 'sv';
    }
    if (series.includes('sword') || series.includes('shield') || /^swsh\d|^pgo|^cel\d/.test(id)) {
        return 'swsh';
    }
    if (series.includes('sun') || series.includes('moon') || /^sm\d|^sm-/.test(id)) {
        return 'sm';
    }
    if (series.includes(' xy') || series === 'xy' || series.startsWith('xy') || /^xy\d|^xy-|^dc1|^g1|^k1/.test(id)) {
        return 'xy';
    }
    if (series.includes('black') || series.includes('white') || /^bw\d|^bw-/.test(id)) {
        return 'bw';
    }
    if (id === 'col1' || name.includes('call of legends'))
        return 'col';
    if (series.includes('heartgold') || series.includes('soulsilver') || /^hgss\d|^hgss-/.test(id)) {
        return 'hgss';
    }
    if (series.includes('diamond') || series.includes('pearl') || /^dp\d|^pl\d|^pl-|^dp-/.test(id)) {
        return 'dp';
    }
    if (series.includes('ex') || /^ex\d|^ex-/.test(id))
        return 'ex';
    if (series.includes('ecard') || series.includes('e-card') || /^ecard\d/.test(id))
        return 'ecard';
    if (series.includes('neo') || /^neo\d|^neo-/.test(id))
        return 'neo';
    if (series.includes('gym') || /^gym\d/.test(id))
        return 'gym';
    if (series.includes('base') || /^base\d|^base-/.test(id))
        return 'base';
    if (name.includes('promo') ||
        id.includes('promo') ||
        series.includes('promo') ||
        name.includes('prize pack') ||
        name.includes('deck exclusive')) {
        return 'promo';
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
/** Use image URLs returned by the set API when available. */
const resolveSetImages = (apiImages) => {
    if ((apiImages === null || apiImages === void 0 ? void 0 : apiImages.logo) || (apiImages === null || apiImages === void 0 ? void 0 : apiImages.symbol)) {
        return {
            logo: apiImages.logo || '',
            symbol: apiImages.symbol || '',
        };
    }
    return { logo: '', symbol: '' };
};
exports.resolveSetImages = resolveSetImages;
