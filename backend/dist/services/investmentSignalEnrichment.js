"use strict";
/**
 * Enriches scraped external_market_signals rows into actionable investment
 * signal cards with market metrics, scoring, and human-readable interpretation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSignalCategory = mapSignalCategory;
exports.parseReleaseDaysAgo = parseReleaseDaysAgo;
exports.staleReleasePenalty = staleReleasePenalty;
exports.hasMarketConfirmation = hasMarketConfirmation;
exports.resolveSignalEntity = resolveSignalEntity;
exports.buildEntityLabel = buildEntityLabel;
exports.buildSignalTitle = buildSignalTitle;
exports.buildSourceSummary = buildSourceSummary;
exports.buildWhyItMatters = buildWhyItMatters;
exports.classifySignalTier = classifySignalTier;
exports.boostSourceOnlyScore = boostSourceOnlyScore;
exports.collectibilityWeight = collectibilityWeight;
exports.economicMoveScore = economicMoveScore;
exports.dedupeInvestmentSignals = dedupeInvestmentSignals;
exports.sourceThumbnailUrl = sourceThumbnailUrl;
exports.computeSignalDirection = computeSignalDirection;
exports.computeOpportunityScore = computeOpportunityScore;
exports.computeSignalConfidence = computeSignalConfidence;
exports.enrichInvestmentSignal = enrichInvestmentSignal;
exports.buildMarketPulse = buildMarketPulse;
exports.partitionSignalsByTier = partitionSignalsByTier;
exports.sortInvestmentSignals = sortInvestmentSignals;
const liquidityScore_1 = require("./liquidityScore");
const opportunityBulkScoring_1 = require("./opportunityBulkScoring");
function computeChange(current, prev) {
    const changeAbs = round2(current - prev);
    const changePct = prev > 0 ? round2(((current - prev) / prev) * 100) : 0;
    return { changeAbs, changePct };
}
const getDb = () => {
    const { getDb: db } = require('../db/database');
    return db();
};
const all = (sql, params = []) => new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve((rows || []));
    });
});
function round1(n) {
    return Math.round(n * 10) / 10;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
const CATEGORY_LABELS = {
    set_release: 'Set Release',
    buyout: 'Buyout',
    tournament: 'Tournament',
    reddit: 'Reddit',
    youtube: 'YouTube',
    news: 'News',
    supply: 'Supply',
    price_movement: 'Price Movement',
    reprint: 'Reprint',
    rotation: 'Rotation',
    grading: 'Grading',
    ban_list: 'Ban List',
};
const DIRECTION_LABELS = {
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
    watch: 'Watching',
    high_risk: 'High Risk',
};
const HORIZON_BY_CATEGORY = {
    tournament: '1–4 weeks',
    reddit: '1–2 weeks',
    youtube: '1–3 weeks',
    news: '2–6 weeks',
    set_release: '1–3 months',
    ban_list: '3–6 months',
    buyout: '1–4 weeks',
    reprint: '2–6 months',
    supply: '1–3 months',
    price_movement: '2–8 weeks',
};
function mapSignalCategory(sourceType, riskType) {
    const src = (sourceType !== null && sourceType !== void 0 ? sourceType : '').toLowerCase();
    const risk = (riskType !== null && riskType !== void 0 ? riskType : '').toLowerCase();
    if (src === 'social')
        return 'reddit';
    if (src === 'youtube')
        return 'youtube';
    if (src === 'news')
        return 'news';
    if (src === 'tournament')
        return 'tournament';
    if (src === 'ban_list')
        return 'ban_list';
    if (src === 'set_release' || risk === 'set_release' || risk === 'upcoming_set')
        return 'set_release';
    if (/buyout/i.test(risk))
        return 'buyout';
    if (/supply|listing/i.test(risk))
        return 'supply';
    if (/reprint/i.test(risk))
        return 'reprint';
    if (/rotation|format/i.test(risk))
        return 'rotation';
    if (/grad/i.test(risk))
        return 'grading';
    if (/price|spike|move/i.test(risk))
        return 'price_movement';
    return 'news';
}
function parseReleaseDaysAgo(eventDetail) {
    const m = /Released (\d+) days ago/i.exec(eventDetail);
    return m ? parseInt(m[1], 10) : null;
}
function staleReleasePenalty(days, category) {
    if (category !== 'set_release' || days == null)
        return 0;
    if (days > 365)
        return 42;
    if (days > 180)
        return 28;
    if (days > 90)
        return 14;
    if (days > 45)
        return 6;
    return 0;
}
const ENTITY_TYPE_LABELS = {
    set: 'Set',
    card: 'Card',
    sealed: 'Sealed',
    theme: 'Trend',
};
const SOURCE_TYPE_LABELS = {
    youtube: 'YouTube',
    social: 'Reddit',
    reddit: 'Reddit',
    news: 'News',
    tournament: 'Tournament',
    set_release: 'Set Release',
    ban_list: 'Ban List',
};
function hasMarketConfirmation(metrics, sparkline) {
    return (metrics.price30dPct != null ||
        metrics.price7dPct != null ||
        (metrics.volumeChangePct != null && metrics.liquidityLabel != null) ||
        sparkline.length >= 4);
}
function extractSetFromContent(title, summary) {
    var _a;
    const text = `${title !== null && title !== void 0 ? title : ''} ${summary !== null && summary !== void 0 ? summary : ''}`.trim();
    if (!text)
        return null;
    const fromMatch = /\bfrom\s+([A-Za-z0-9][A-Za-z0-9\s&':-]{2,42}?)(?:\s*[!?.#]|$)/i.exec(text);
    if (fromMatch === null || fromMatch === void 0 ? void 0 : fromMatch[1]) {
        const name = fromMatch[1].trim().replace(/\s+(Set|SET)$/i, '').trim();
        if (name.length >= 3 && !/^(the|this|pokemon|tcg|revealing)$/i.test(name))
            return name;
    }
    const patterns = [
        /(?:recent|upcoming)\s+set:\s*(.+)$/i,
        /set\s+"([^"]+)"/i,
        /([\w\s&':-]+?)\s+(?:booster box|elite trainer box|\betb\b|booster bundle)/i,
        /(?:new|huge)\s+([A-Za-z0-9][\w\s&':-]{2,32})\s+set\b/i,
    ];
    for (const re of patterns) {
        const m = re.exec(text);
        const candidate = (_a = m === null || m === void 0 ? void 0 : m[1]) === null || _a === void 0 ? void 0 : _a.trim().replace(/^["']|["']$/g, '');
        if (candidate && candidate.length >= 3 && !/^(the|this|a|an|pokemon|tcg|revealing)$/i.test(candidate)) {
            return candidate.replace(/\s+(Set|SET)$/i, '').trim();
        }
    }
    return null;
}
function detectSealedProduct(text) {
    if (/booster box/i.test(text))
        return 'Booster Box';
    if (/elite trainer box|\betb\b/i.test(text))
        return 'ETB';
    if (/booster bundle/i.test(text))
        return 'Booster Bundle';
    if (/collection box|ultra premium/i.test(text))
        return 'Collection Box';
    if (/sealed|booster pack/i.test(text))
        return 'Sealed Product';
    return null;
}
function resolveSignalEntity(input) {
    var _a, _b, _c, _d;
    const text = `${(_a = input.title) !== null && _a !== void 0 ? _a : ''} ${(_b = input.summary) !== null && _b !== void 0 ? _b : ''}`;
    const setFromFields = extractSetName(input.title, input.summary, input.setName);
    const setFromContent = extractSetFromContent(input.title, input.summary);
    const resolvedSet = setFromFields !== null && setFromFields !== void 0 ? setFromFields : setFromContent;
    const sealed = detectSealedProduct(text);
    if (sealed) {
        return {
            entityType: 'sealed',
            entityName: resolvedSet ? `${resolvedSet} ${sealed}` : sealed,
        };
    }
    if (input.cardName && input.category !== 'set_release') {
        return { entityType: 'card', entityName: input.cardName };
    }
    if (resolvedSet) {
        return { entityType: 'set', entityName: resolvedSet };
    }
    const themeMatch = (_d = /(?:new|huge|best)\s+(mega\s+[\w]+|[\w\s&'-]{3,30})\s+set/i.exec((_c = input.title) !== null && _c !== void 0 ? _c : '')) !== null && _d !== void 0 ? _d : /(mega\s+[\w]+)\s+(?:set|theme|hype)/i.exec(text);
    if (themeMatch === null || themeMatch === void 0 ? void 0 : themeMatch[1]) {
        return { entityType: 'theme', entityName: themeMatch[1].trim() };
    }
    const fallback = cleanEventTitle(input.title, null);
    return {
        entityType: 'theme',
        entityName: fallback.length > 48 ? `${fallback.slice(0, 45)}…` : fallback,
    };
}
function buildEntityLabel(entityType, entityName) {
    return `${entityName} (${ENTITY_TYPE_LABELS[entityType]})`;
}
function buildSignalTitle(input) {
    const { entityName, entityType, direction, category, hasMarketConfirmation, metrics } = input;
    if (hasMarketConfirmation && metrics.price30dPct != null) {
        const verb = metrics.price30dPct >= 0 ? 'rising' : 'softening';
        if (entityType === 'sealed')
            return `${entityName} prices ${verb}`;
        if (entityType === 'set')
            return `${entityName} market ${verb}`;
        return `${entityName} price ${verb}`;
    }
    if (category === 'youtube' || category === 'reddit') {
        if (direction === 'bullish')
            return `${entityName} content momentum rising`;
        if (direction === 'bearish')
            return `${entityName} negative sentiment building`;
        return `${entityName} early content interest detected`;
    }
    if (category === 'set_release') {
        if (direction === 'bullish')
            return `${entityName} release demand strengthening`;
        return `${entityName} post-release price discovery`;
    }
    if (direction === 'bullish')
        return `${entityName} demand signals strengthening`;
    if (direction === 'bearish')
        return `${entityName} facing market headwinds`;
    if (direction === 'high_risk')
        return `${entityName} elevated volatility`;
    if (direction === 'watch')
        return `${entityName} — signal forming`;
    return `${entityName} — monitoring`;
}
function buildSourceSummary(byType, sources = []) {
    var _a;
    const counts = { ...byType };
    if (Object.keys(counts).length === 0 && sources.length > 0) {
        for (const s of sources) {
            counts[s.type] = ((_a = counts[s.type]) !== null && _a !== void 0 ? _a : 0) + 1;
        }
    }
    const parts = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => { var _a; return `${(_a = SOURCE_TYPE_LABELS[k]) !== null && _a !== void 0 ? _a : k.replace(/_/g, ' ')} (${v})`; });
    return parts.length ? parts.join(' · ') : 'No corroborating sources yet';
}
function buildWhyItMatters(input) {
    var _a, _b, _c, _d;
    const bullets = [];
    const { metrics, evidence, hasMarketConfirmation, category, direction, eventDetail } = input;
    const yt = (_a = evidence.byType.youtube) !== null && _a !== void 0 ? _a : 0;
    const social = ((_b = evidence.byType.social) !== null && _b !== void 0 ? _b : 0) + ((_c = evidence.byType.reddit) !== null && _c !== void 0 ? _c : 0);
    const news = (_d = evidence.byType.news) !== null && _d !== void 0 ? _d : 0;
    if (yt >= 1) {
        bullets.push(yt >= 2
            ? `${yt} YouTube videos referencing this in recent coverage`
            : 'YouTube coverage detected in the last analysis window');
    }
    if (social >= 1) {
        bullets.push(`${social} Reddit/social mention${social > 1 ? 's' : ''} contributing to signal`);
    }
    if (news >= 1) {
        bullets.push(`${news} news source${news > 1 ? 's' : ''} flagged this theme`);
    }
    if (metrics.price30dPct != null && Math.abs(metrics.price30dPct) >= 3) {
        bullets.push(`30-day price ${metrics.price30dPct >= 0 ? 'up' : 'down'} ${Math.abs(round1(metrics.price30dPct))}%`);
    }
    else if (metrics.price7dPct != null && Math.abs(metrics.price7dPct) >= 2) {
        bullets.push(`7-day price move of ${formatSignedPct(metrics.price7dPct)}`);
    }
    if (metrics.volumeChangePct != null && Math.abs(metrics.volumeChangePct) >= 5) {
        bullets.push(`Sales volume ${metrics.volumeChangePct >= 0 ? 'above' : 'below'} baseline (${formatSignedPct(metrics.volumeChangePct)})`);
    }
    if (!hasMarketConfirmation && (category === 'youtube' || category === 'reddit')) {
        bullets.push('No reliable market follow-through yet — treat as early source signal');
    }
    if (category === 'set_release' && /released/i.test(eventDetail)) {
        bullets.push(`Release timing: ${eventDetail.toLowerCase()}`);
    }
    if (direction === 'high_risk') {
        bullets.push('Elevated timing risk — size positions carefully');
    }
    return bullets.slice(0, 4);
}
function formatSignedPct(n) {
    return `${n >= 0 ? '+' : ''}${round1(n)}%`;
}
function classifySignalTier(input) {
    if (input.opportunityScore <= 0 || input.direction === 'neutral')
        return 'monitor';
    if (input.hasMarketConfirmation &&
        input.opportunityScore >= 38 &&
        input.confidence >= 42) {
        return 'actionable';
    }
    if (input.opportunityScore >= 52 && input.confidence >= 55)
        return 'actionable';
    if (input.opportunityScore >= 18 || input.confidence >= 28)
        return 'emerging';
    return 'monitor';
}
function boostSourceOnlyScore(score, category, relevance, sentiment) {
    if (score >= 18)
        return score;
    if (!['youtube', 'reddit', 'news'].includes(category))
        return score;
    if (relevance < 0.25)
        return score;
    const boosted = Math.round(relevance * 35 + Math.abs(sentiment) * 25 + 12);
    return clamp(Math.max(score, boosted), 0, 100);
}
function summarizeDirectionInsight(signals, direction) {
    var _a;
    const subset = signals.filter((s) => s.direction === direction);
    if (subset.length === 0)
        return null;
    const categories = new Map();
    for (const s of subset) {
        categories.set(s.entityType, ((_a = categories.get(s.entityType)) !== null && _a !== void 0 ? _a : 0) + 1);
    }
    const top = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top)
        return null;
    const typeLabel = top[0] === 'sealed'
        ? 'sealed product'
        : top[0] === 'set'
            ? 'set release'
            : top[0] === 'card'
                ? 'single-card'
                : 'content-driven trend';
    if (direction === 'bullish')
        return `Strongest in ${typeLabel} signals`;
    if (direction === 'watch')
        return `Mostly early YouTube or Reddit trend detections`;
    if (direction === 'high_risk')
        return `${subset.length} flagged with elevated volatility`;
    if (direction === 'bearish')
        return `Headwinds concentrated in ${typeLabel} signals`;
    return null;
}
/** Prefer chase cards over commons when picking a set's showcase card. */
function collectibilityWeight(rarity, cardName, psaPrice) {
    const r = (rarity !== null && rarity !== void 0 ? rarity : '').toLowerCase();
    const name = cardName.toLowerCase();
    if (/secret|hyper rare|special illustration|sir\b/i.test(r + ' ' + name))
        return 1.6;
    if (/double rare|ultra rare|illustration rare|rare holo/i.test(r))
        return 1.35;
    if (/ex\b|gx\b|vmax|vstar|\sv\b|radiant|prism star/i.test(name))
        return 1.25;
    if (r === 'rare' || r.includes('holo'))
        return 1.1;
    if (r === 'uncommon')
        return 0.35;
    if (r === 'common')
        return 0.12;
    // Missing rarity: use PSA price tier + name shape.
    if (!r.trim()) {
        if (psaPrice != null && psaPrice >= 250)
            return 1.2;
        if (/ex\b|gx\b|vmax|vstar|\sv\b/i.test(name))
            return 1.2;
        if (psaPrice != null && psaPrice < 80)
            return 0.15;
        return 0.45;
    }
    return 0.75;
}
function economicMoveScore(changePct, psaPrice) {
    const absGain = Math.abs((psaPrice * changePct) / 100);
    // Favor dollar impact; tiny PSA prices still down-ranked.
    return absGain * clamp(psaPrice / 40, 0.25, 2.5);
}
function dedupeInvestmentSignals(signals) {
    const byKey = new Map();
    for (const s of signals) {
        const key = `${s.entityType}:${s.entityLabel.trim().toLowerCase()}`;
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, s);
            continue;
        }
        const mergedSources = mergeSignalSources(prev.sources, s.sources);
        const mergedByType = countSourcesByType(mergedSources);
        const keep = s.opportunityScore > prev.opportunityScore ? s : prev;
        const drop = keep === s ? prev : s;
        byKey.set(key, {
            ...keep,
            sources: mergedSources,
            sourceSummary: buildSourceSummary(mergedByType, mergedSources),
            evidence: {
                totalSources: mergedSources.length,
                byType: mergedByType,
                sources: mergedSources,
            },
            whyItMatters: [...new Set([...keep.whyItMatters, ...drop.whyItMatters])].slice(0, 5),
        });
    }
    return [...byKey.values()];
}
function countSourcesByType(sources) {
    var _a;
    const byType = {};
    for (const s of sources) {
        byType[s.type] = ((_a = byType[s.type]) !== null && _a !== void 0 ? _a : 0) + 1;
    }
    return byType;
}
function mergeSignalSources(a, b) {
    const seen = new Set();
    const out = [];
    for (const s of [...a, ...b]) {
        if (seen.has(s.url))
            continue;
        seen.add(s.url);
        out.push(s);
    }
    return out.slice(0, 12);
}
function sourceThumbnailUrl(url) {
    if (!url)
        return null;
    const match = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(url);
    if (match)
        return `https://i.ytimg.com/vi/${match[1]}/mqdefault.jpg`;
    return null;
}
const ENTITY_SEARCH_STOP = new Set([
    'pokemon',
    'cards',
    'best',
    'invest',
    'opening',
    'the',
    'this',
    'that',
    'what',
    'should',
    'from',
    'with',
    'your',
    '2025',
    '2026',
    'tcg',
]);
function buildEntitySearchTerms(entityName, entityType) {
    if (entityType === 'set' || entityType === 'sealed') {
        const base = entityName
            .replace(/\s+(Booster Box|ETB|Booster Bundle|Collection Box|Sealed Product)$/i, '')
            .trim();
        return base.length >= 3 ? [base] : [];
    }
    if (entityType === 'card')
        return [entityName];
    const words = entityName
        .split(/[\s?!.,"']+/)
        .filter((w) => w.length >= 5 && !ENTITY_SEARCH_STOP.has(w.toLowerCase()));
    return words.slice(0, 3);
}
async function fetchSignalSources(input) {
    var _a;
    const seenUrls = new Set();
    const sources = [];
    const pushRow = (row) => {
        var _a, _b, _c, _d, _e;
        const url = (_a = row.source_url) === null || _a === void 0 ? void 0 : _a.trim();
        if (!url || seenUrls.has(url))
            return;
        seenUrls.add(url);
        const cat = mapSignalCategory(row.source_type, null);
        sources.push({
            id: row.id,
            url,
            title: ((_b = row.title) !== null && _b !== void 0 ? _b : 'Source').slice(0, 200),
            type: cat,
            typeLabel: (_c = SOURCE_TYPE_LABELS[cat]) !== null && _c !== void 0 ? _c : cat.replace(/_/g, ' '),
            thumbnailUrl: sourceThumbnailUrl(url),
            summary: (_e = (_d = row.summary) === null || _d === void 0 ? void 0 : _d.slice(0, 160)) !== null && _e !== void 0 ? _e : null,
            publishedAt: row.created_at,
        });
    };
    if (input.primaryUrl) {
        pushRow({
            id: input.primaryId,
            source_url: input.primaryUrl,
            source_type: input.primarySourceType,
            title: input.primaryTitle,
            summary: input.primarySummary,
            created_at: input.primaryCreatedAt,
        });
    }
    const terms = buildEntitySearchTerms(input.entityName, input.entityType);
    const conditions = [];
    const params = [];
    const useCardId = input.cardId &&
        input.category !== 'set_release' &&
        input.entityType === 'card';
    if (useCardId) {
        conditions.push('card_id = ?');
        params.push(input.cardId);
    }
    if (input.setName) {
        if (input.entityType === 'set' || input.category === 'set_release') {
            // Title only — summaries include series name (e.g. "Mega Evolution") for unrelated sets.
            conditions.push('(set_name = ? OR title LIKE ?)');
            params.push(input.setName, `%${input.setName}%`);
        }
        else {
            conditions.push('(set_name = ? OR title LIKE ? OR summary LIKE ?)');
            params.push(input.setName, `%${input.setName}%`, `%${input.setName}%`);
        }
    }
    for (const term of terms) {
        if (input.setName && term.toLowerCase() === input.setName.toLowerCase())
            continue;
        if (input.entityType === 'set' || input.category === 'set_release') {
            conditions.push('(title LIKE ? OR set_name LIKE ?)');
            params.push(`%${term}%`, `%${term}%`);
        }
        else {
            conditions.push('(title LIKE ? OR summary LIKE ? OR set_name LIKE ?)');
            params.push(`%${term}%`, `%${term}%`, `%${term}%`);
        }
    }
    if (conditions.length > 0) {
        const rows = await all(`SELECT id, source_url, source_type, title, summary, created_at
       FROM external_market_signals
       WHERE (expires_at IS NULL OR expires_at >= datetime('now'))
         AND source_url IS NOT NULL
         AND source_url != ''
         AND (${conditions.join(' OR ')})
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 14`, params);
        for (const row of rows)
            pushRow(row);
    }
    const byType = {};
    for (const s of sources) {
        byType[s.type] = ((_a = byType[s.type]) !== null && _a !== void 0 ? _a : 0) + 1;
    }
    return { sources, byType };
}
function computeSignalDirection(input) {
    var _a, _b, _c, _d;
    const risk = ((_a = input.riskType) !== null && _a !== void 0 ? _a : '').toLowerCase();
    if (/buyout|supply_shock|ban/i.test(risk) || input.category === 'ban_list') {
        if (input.sentiment < -0.2 || ((_b = input.price30dPct) !== null && _b !== void 0 ? _b : 0) > 25)
            return 'high_risk';
    }
    const priceBlend = input.price7dPct != null || input.price30dPct != null
        ? ((_c = input.price7dPct) !== null && _c !== void 0 ? _c : 0) * 0.35 + ((_d = input.price30dPct) !== null && _d !== void 0 ? _d : 0) * 0.65
        : null;
    // Source-only signals default to "watching" — not neutral padding.
    if (priceBlend == null && (input.category === 'youtube' || input.category === 'reddit' || input.category === 'news')) {
        if (input.sentiment >= 0.22)
            return 'bullish';
        if (input.sentiment <= -0.22)
            return 'bearish';
        return 'watch';
    }
    let combined = input.sentiment;
    if (priceBlend != null) {
        const priceNorm = clamp(priceBlend / 25, -1, 1);
        combined = input.sentiment * 0.45 + priceNorm * 0.55;
    }
    if (combined >= 0.22)
        return 'bullish';
    if (combined <= -0.22)
        return 'bearish';
    if (Math.abs(combined) < 0.08 && (priceBlend == null || Math.abs(priceBlend) < 4))
        return 'neutral';
    return 'watch';
}
function computeOpportunityScore(input) {
    const rel = clamp(input.relevance, 0, 1) * 100;
    const sentMag = Math.abs(input.sentiment) * 100;
    const dirBonus = input.direction === 'bullish'
        ? 18
        : input.direction === 'bearish'
            ? 12
            : input.direction === 'high_risk'
                ? 14
                : input.direction === 'watch'
                    ? 8
                    : 4;
    const priceBonus = input.price30dPct != null ? clamp(Math.abs(input.price30dPct) * 1.2, 0, 18) : 0;
    const volBonus = input.volumeChangePct != null && input.volumeChangePct > 5
        ? clamp(input.volumeChangePct / 4, 0, 12)
        : 0;
    const srcBonus = clamp(input.sourceCount * 4, 0, 16);
    const dataBonus = input.hasMarketData ? 10 : 0;
    return clamp(Math.round(rel * 0.22 + sentMag * 0.18 + dirBonus + priceBonus + volBonus + srcBonus + dataBonus), 0, 100);
}
function computeSignalConfidence(input) {
    let c = 32;
    if (input.hasCardMetrics)
        c += 22;
    if (input.hasSetMetrics)
        c += 14;
    if (input.volumeChangePct != null)
        c += 12;
    if (input.sourceCount >= 2)
        c += 10;
    if (input.sourceCount >= 5)
        c += 8;
    if (input.sparkPoints >= 6)
        c += 8;
    return clamp(c, 28, 94);
}
function normalizeSparkline(points) {
    if (points.length < 2)
        return [];
    const prices = points.map((p) => p.price).filter((p) => p > 0);
    if (prices.length < 2)
        return [];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;
    return prices.map((p) => round2((p - min) / span));
}
function extractSetName(title, summary, setName) {
    var _a;
    const fromTitle = (() => {
        if (!title)
            return null;
        const recent = /(?:Recent|Upcoming) Set:\s*(.+)$/i.exec(title);
        if (recent === null || recent === void 0 ? void 0 : recent[1])
            return recent[1].trim();
        return null;
    })();
    let name = (_a = fromTitle !== null && fromTitle !== void 0 ? fromTitle : setName === null || setName === void 0 ? void 0 : setName.trim()) !== null && _a !== void 0 ? _a : null;
    if (!name && summary) {
        const quoted = /set "([^"]+)"/i.exec(summary);
        if (quoted === null || quoted === void 0 ? void 0 : quoted[1])
            name = quoted[1].trim();
    }
    if (!name)
        return null;
    // Strip redundant wrappers like `Pitch Black Set "Pitch Black"`.
    name = name.replace(/\s+Set\s+"([^"]+)"\s*$/i, ' $1').replace(/^Set\s+"([^"]+)"\s*$/i, '$1');
    name = name.replace(/^["']|["']$/g, '').trim();
    return name || null;
}
function cleanEventTitle(title, setName) {
    if (setName)
        return setName;
    if (!title)
        return 'Market signal';
    return title
        .replace(/^(Recent|Upcoming) Set:\s*/i, '')
        .replace(/^Release calendar:\s*/i, '')
        .trim();
}
function parseEventDetail(title, summary, category) {
    var _a;
    const text = (_a = summary !== null && summary !== void 0 ? summary : title) !== null && _a !== void 0 ? _a : '';
    const daysMatch = /released (\d+) days ago/i.exec(text);
    if (daysMatch)
        return `Released ${daysMatch[1]} days ago`;
    const untilMatch = /releasing in (\d+) days/i.exec(text);
    if (untilMatch)
        return `Releases in ${untilMatch[1]} days`;
    if (/hype period/i.test(text))
        return 'Post-release hype window';
    if (/settling/i.test(text))
        return 'Market normalization phase';
    if (category === 'tournament')
        return 'Competitive meta shift';
    if (category === 'ban_list')
        return 'Format restriction update';
    const created = title === null || title === void 0 ? void 0 : title.slice(0, 80);
    return created && created.length > 10 ? created : 'External market event detected';
}
function buildInterpretation(input) {
    var _a;
    const { metrics, direction, category, sentiment } = input;
    const parts = [];
    if (metrics.price30dPct != null) {
        parts.push(`Prices are ${metrics.price30dPct >= 0 ? 'up' : 'down'} ${Math.abs(round1(metrics.price30dPct))}% over 30 days`);
    }
    else if (metrics.price7dPct != null) {
        parts.push(`Prices moved ${metrics.price7dPct >= 0 ? '+' : ''}${round1(metrics.price7dPct)}% over 7 days`);
    }
    if (metrics.volumeChangePct != null) {
        const volDir = metrics.volumeChangePct >= 0 ? 'above' : 'below';
        parts.push(`sales volume remains ${Math.abs(round1(metrics.volumeChangePct))}% ${volDir} baseline`);
    }
    const observed = parts.length > 0
        ? parts.join(', while ') + '.'
        : sentiment > 0.15
            ? 'External sentiment skews positive without confirmed price follow-through yet.'
            : sentiment < -0.15
                ? 'External sentiment is negative; price impact may be developing.'
                : 'No strong price or volume divergence detected yet.';
    let interpretation = 'Signal is still forming — monitor for confirmation.';
    if (direction === 'bullish' && metrics.price30dPct != null && metrics.price30dPct < 0 && ((_a = metrics.volumeChangePct) !== null && _a !== void 0 ? _a : 0) > 0) {
        interpretation = 'Price compression is slowing while demand holds above baseline.';
    }
    else if (direction === 'bullish') {
        interpretation = 'Demand signals and market behavior align toward upside.';
    }
    else if (direction === 'bearish') {
        interpretation = 'Supply or sentiment headwinds outweigh near-term demand.';
    }
    else if (direction === 'high_risk') {
        interpretation = 'Volatility elevated — timing risk dominates the thesis.';
    }
    else if (category === 'set_release') {
        interpretation = 'Post-release price discovery is still underway.';
    }
    let opportunity = 'Wait for clearer entry — signal not actionable yet.';
    if (direction === 'bullish' && category === 'set_release') {
        opportunity = 'Higher-rarity singles may be approaching accumulation range.';
    }
    else if (direction === 'bullish') {
        opportunity = 'Consider building exposure on pullbacks if liquidity supports exits.';
    }
    else if (direction === 'bearish') {
        opportunity = 'Reduce chase risk; favor liquidity over speculative holds.';
    }
    else if (direction === 'high_risk') {
        opportunity = 'Treat as tactical only — size small or wait for stabilization.';
    }
    else if (direction === 'watch') {
        opportunity = 'Add to watchlist; enter after price/volume confirmation.';
    }
    const explanation = parts.length >= 2
        ? `${parts[0]}, while ${parts.slice(1).join(', ')}.`
        : `${interpretation} ${opportunity}`.trim();
    return { observed, interpretation, opportunity, explanation };
}
function buildDrivers(input) {
    const drivers = [];
    const sentLevel = input.sentiment > 0.35 ? 'up_strong' : input.sentiment > 0.1 ? 'up' : input.sentiment < -0.1 ? 'down' : 'flat';
    drivers.push({ key: 'sentiment', label: 'Sentiment', level: sentLevel });
    if (input.metrics.price30dPct != null) {
        drivers.push({
            key: 'price',
            label: 'Price',
            level: input.metrics.price30dPct > 8 ? 'up_strong' : input.metrics.price30dPct > 2 ? 'up' : input.metrics.price30dPct < -2 ? 'down' : 'flat',
        });
    }
    if (input.metrics.volumeChangePct != null) {
        drivers.push({
            key: 'volume',
            label: 'Volume',
            level: input.metrics.volumeChangePct > 15 ? 'up_strong' : input.metrics.volumeChangePct > 3 ? 'up' : input.metrics.volumeChangePct < -3 ? 'down' : 'flat',
        });
    }
    if (input.metrics.liquidityTier) {
        const liqLevel = input.metrics.liquidityTier === 'strong' || input.metrics.liquidityTier === 'ok'
            ? 'up'
            : input.metrics.liquidityTier === 'illiquid'
                ? 'down'
                : 'flat';
        drivers.push({ key: 'liquidity', label: 'Liquidity', level: liqLevel });
    }
    if (input.sourceCount >= 3) {
        drivers.push({ key: 'social', label: 'Social interest', level: input.sourceCount >= 6 ? 'up_strong' : 'up' });
    }
    return drivers.slice(0, 5);
}
async function resolveSetNameVariants(setName) {
    const rows = await all(`SELECT DISTINCT setName FROM card_mappings
     WHERE setName = ? OR setName LIKE '%' || ? || '%'
     ORDER BY CASE WHEN setName = ? THEN 0 ELSE 1 END, LENGTH(setName) ASC
     LIMIT 12`, [setName, setName, setName]);
    const names = rows.map((r) => r.setName).filter(Boolean);
    return names.length ? names : [setName];
}
async function fetchRawPrice(cardId) {
    var _a, _b;
    const row = await all(`SELECT c.price AS rawPrice
     FROM card_mappings cm
     INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
     WHERE cm.cardId = ? AND c.rowid = (
       SELECT c2.rowid FROM canonical_price_history c2
       WHERE c2.uniqueIdentifier = cm.uniqueIdentifier
       ORDER BY c2.date DESC LIMIT 1
     ) AND c.price > 0
     LIMIT 1`, [cardId]);
    return (_b = (_a = row[0]) === null || _a === void 0 ? void 0 : _a.rawPrice) !== null && _b !== void 0 ? _b : null;
}
async function fetchCardSeries(cardId, days) {
    return all(`SELECT date, price FROM graded_price_history
     WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
       AND price > 0 AND date >= date('now', ?)
     ORDER BY date ASC`, [cardId, `-${days} days`]);
}
async function fetchCardMarketSnapshot(cardId) {
    var _a;
    const row = await all(`SELECT gp.price, gp.soldListings, gp.fetchedAt, cm.cardName, cm.imageSmall, cm.rarity
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE gp.cardId = ? AND UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
     LIMIT 1`, [cardId]);
    const series30 = await fetchCardSeries(cardId, 30);
    const series7 = series30.length >= 2 ? series30.filter((p) => p.date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)) : series30;
    let price7dPct = null;
    let price30dPct = null;
    if (series30.length >= 2) {
        const first = series30[0].price;
        const last = series30[series30.length - 1].price;
        price30dPct = computeChange(last, first).changePct;
    }
    if (series7.length >= 2) {
        const first = series7[0].price;
        const last = series7[series7.length - 1].price;
        price7dPct = computeChange(last, first).changePct;
    }
    else if (series30.length >= 2) {
        const slice = series30.slice(-Math.min(7, series30.length));
        price7dPct = computeChange(slice[slice.length - 1].price, slice[0].price).changePct;
    }
    let volumeChangePct = null;
    const volSeries = await all(`SELECT date, soldListings FROM graded_price_history
     WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
       AND date >= date('now', '-30 days') AND soldListings IS NOT NULL
     ORDER BY date ASC`, [cardId]);
    if (volSeries.length >= 4) {
        const mid = Math.floor(volSeries.length / 2);
        const early = volSeries.slice(0, mid);
        const late = volSeries.slice(mid);
        const avg = (arr) => arr.reduce((s, r) => { var _a; return s + ((_a = r.soldListings) !== null && _a !== void 0 ? _a : 0); }, 0) / Math.max(arr.length, 1);
        const earlyAvg = avg(early);
        const lateAvg = avg(late);
        if (earlyAvg > 0)
            volumeChangePct = round1(((lateAvg - earlyAvg) / earlyAvg) * 100);
    }
    const current = row[0];
    let liquidityTier = null;
    let liquidityLabel = null;
    if (current) {
        const liq = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: (_a = current.soldListings) !== null && _a !== void 0 ? _a : 0,
            verified: true,
            stale: false,
            ageHours: null,
            matchScore: null,
            historyPoints: series30.length,
        });
        liquidityTier = liq.tier;
        liquidityLabel =
            liq.tier === 'strong' ? 'High' : liq.tier === 'ok' ? 'Moderate' : liq.tier === 'thin' ? 'Thin' : 'Low';
    }
    const sparkline = normalizeSparkline(series30.slice(-14));
    let topAffectedCard = null;
    if ((current === null || current === void 0 ? void 0 : current.cardName) && current.price >= 35) {
        const rawPrice = await fetchRawPrice(cardId);
        const collectWeight = collectibilityWeight(current.rarity, current.cardName, current.price);
        if (collectWeight >= 0.4) {
            topAffectedCard = {
                cardId,
                cardName: current.cardName,
                imageSmall: current.imageSmall,
                change7dPct: price7dPct,
                changeAbs: price7dPct != null && current.price > 0
                    ? round2((current.price * price7dPct) / 100)
                    : null,
            };
        }
    }
    return {
        metrics: { price7dPct, price30dPct, volumeChangePct, liquidityTier, liquidityLabel },
        sparkline,
        topAffectedCard,
    };
}
async function fetchSetMarketSnapshot(setName) {
    var _a;
    const variants = await resolveSetNameVariants(setName);
    const placeholders = variants.map(() => '?').join(', ');
    const cards = await all(`SELECT gp.cardId, cm.cardName, cm.imageSmall, cm.rarity, gp.price, gp.soldListings
     FROM graded_prices gp
     INNER JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE cm.setName IN (${placeholders})
       AND UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND COALESCE(gp.verified, 0) = 1 AND gp.price >= 25
     ORDER BY gp.price DESC
     LIMIT 14`, variants);
    if (cards.length === 0) {
        return {
            metrics: { price7dPct: null, price30dPct: null, volumeChangePct: null, liquidityTier: null, liquidityLabel: null },
            sparkline: [],
            topAffectedCard: null,
        };
    }
    const cardStats = [];
    let aggSpark = [];
    let totalVolEarly = 0;
    let totalVolLate = 0;
    let volSamples = 0;
    for (const card of cards) {
        const series = await fetchCardSeries(card.cardId, 30);
        if (series.length < 2)
            continue;
        const c30 = computeChange(series[series.length - 1].price, series[0].price).changePct;
        const slice7 = series.slice(-Math.min(7, series.length));
        const c7 = slice7.length >= 2
            ? computeChange(slice7[slice7.length - 1].price, slice7[0].price).changePct
            : c30;
        const weight = clamp(card.price / 100, 0.3, 3);
        cardStats.push({ card, c7, c30, weight, volChange: null });
        if (aggSpark.length === 0 && series.length >= 3 && card.price >= 80) {
            aggSpark = normalizeSparkline(series.slice(-14));
        }
        const volSeries = await all(`SELECT soldListings FROM graded_price_history
       WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
         AND date >= date('now', '-30 days') AND soldListings IS NOT NULL
       ORDER BY date ASC`, [card.cardId]);
        if (volSeries.length >= 4) {
            const mid = Math.floor(volSeries.length / 2);
            const early = volSeries.slice(0, mid);
            const late = volSeries.slice(mid);
            const avg = (arr) => arr.reduce((s, r) => { var _a; return s + ((_a = r.soldListings) !== null && _a !== void 0 ? _a : 0); }, 0) / Math.max(arr.length, 1);
            totalVolEarly += avg(early);
            totalVolLate += avg(late);
            volSamples += 1;
        }
    }
    let price7dPct = null;
    let price30dPct = null;
    if (cardStats.length > 0) {
        const wSum = cardStats.reduce((s, x) => s + x.weight, 0);
        price7dPct = round1(cardStats.reduce((s, x) => s + x.c7 * x.weight, 0) / wSum);
        price30dPct = round1(cardStats.reduce((s, x) => s + x.c30 * x.weight, 0) / wSum);
    }
    let volumeChangePct = null;
    if (volSamples > 0 && totalVolEarly > 0) {
        volumeChangePct = round1(((totalVolLate / volSamples - totalVolEarly / volSamples) / (totalVolEarly / volSamples)) * 100);
    }
    const soldNow = cards.reduce((s, c) => { var _a; return s + ((_a = c.soldListings) !== null && _a !== void 0 ? _a : 0); }, 0);
    const liq = (0, liquidityScore_1.scoreLiquidity)({
        soldListings: soldNow,
        verified: true,
        stale: false,
        ageHours: null,
        matchScore: null,
        historyPoints: cardStats.length,
    });
    let bestMover = null;
    let bestScore = -1;
    for (const stat of cardStats) {
        if (!stat.card.cardName)
            continue;
        const collectScore = economicMoveScore(stat.c7, stat.card.price) *
            collectibilityWeight(stat.card.rarity, stat.card.cardName, stat.card.price);
        if (collectScore > bestScore && stat.card.price >= 50 && collectibilityWeight(stat.card.rarity, stat.card.cardName, stat.card.price) >= 0.35) {
            bestScore = collectScore;
            bestMover = {
                cardId: stat.card.cardId,
                cardName: stat.card.cardName,
                imageSmall: stat.card.imageSmall,
                change7dPct: round1(stat.c7),
                changeAbs: round2((stat.card.price * stat.c7) / 100),
            };
        }
    }
    // Fallback: highest-value chase card in set (not a random common mover).
    if (!bestMover) {
        const anchor = (_a = cards.find((c) => c.cardName && c.price >= 50)) !== null && _a !== void 0 ? _a : cards[0];
        if (anchor === null || anchor === void 0 ? void 0 : anchor.cardName) {
            bestMover = {
                cardId: anchor.cardId,
                cardName: anchor.cardName,
                imageSmall: anchor.imageSmall,
                change7dPct: null,
                changeAbs: null,
            };
        }
    }
    return {
        metrics: {
            price7dPct,
            price30dPct,
            volumeChangePct,
            liquidityTier: liq.tier,
            liquidityLabel: liq.tier === 'strong' ? 'High' : liq.tier === 'ok' ? 'Moderate' : liq.tier === 'thin' ? 'Thin' : 'Low',
        },
        sparkline: aggSpark,
        topAffectedCard: bestMover,
    };
}
async function enrichInvestmentSignal(raw) {
    var _a, _b, _c, _d, _e, _f, _g;
    const category = mapSignalCategory(raw.sourceType, raw.riskType);
    const resolvedSet = extractSetName(raw.title, raw.summary, raw.setName);
    const eventTitle = cleanEventTitle(raw.title, resolvedSet);
    const eventDetail = parseEventDetail(raw.title, raw.summary, category);
    let metrics = {
        price7dPct: null,
        price30dPct: null,
        volumeChangePct: null,
        liquidityTier: null,
        liquidityLabel: null,
    };
    let sparkline = [];
    let topAffectedCard = null;
    let hasCardMetrics = false;
    let hasSetMetrics = false;
    if (category === 'set_release' && resolvedSet) {
        const snap = await fetchSetMarketSnapshot(resolvedSet);
        metrics = snap.metrics;
        sparkline = snap.sparkline;
        topAffectedCard = snap.topAffectedCard;
        hasSetMetrics = metrics.price30dPct != null || metrics.price7dPct != null;
    }
    else if (raw.cardId && raw.cardName) {
        const snap = await fetchCardMarketSnapshot(raw.cardId);
        metrics = snap.metrics;
        sparkline = snap.sparkline;
        topAffectedCard = snap.topAffectedCard;
        hasCardMetrics = metrics.price7dPct != null || metrics.price30dPct != null;
    }
    else if (resolvedSet) {
        const snap = await fetchSetMarketSnapshot(resolvedSet);
        metrics = snap.metrics;
        sparkline = snap.sparkline;
        topAffectedCard = snap.topAffectedCard;
        hasSetMetrics = metrics.price30dPct != null || metrics.price7dPct != null;
    }
    const direction = computeSignalDirection({
        sentiment: raw.sentiment,
        price7dPct: metrics.price7dPct,
        price30dPct: metrics.price30dPct,
        riskType: raw.riskType,
        category,
    });
    const marketConfirmed = hasMarketConfirmation(metrics, sparkline);
    const entity = resolveSignalEntity({
        title: raw.title,
        summary: raw.summary,
        setName: resolvedSet,
        cardName: (_b = (_a = raw.cardName) !== null && _a !== void 0 ? _a : topAffectedCard === null || topAffectedCard === void 0 ? void 0 : topAffectedCard.cardName) !== null && _b !== void 0 ? _b : null,
        category,
    });
    const entityLabel = buildEntityLabel(entity.entityType, entity.entityName);
    const { sources, byType: sourcesByType } = await fetchSignalSources({
        primaryId: raw.id,
        primaryUrl: raw.sourceUrl,
        primaryTitle: raw.title,
        primarySummary: raw.summary,
        primarySourceType: raw.sourceType,
        primaryCreatedAt: raw.createdAt,
        cardId: raw.cardId,
        setName: resolvedSet !== null && resolvedSet !== void 0 ? resolvedSet : raw.setName,
        entityName: entity.entityName,
        entityType: entity.entityType,
        category,
    });
    const sourceCount = Math.max(sources.length, 1);
    const releaseDays = parseReleaseDaysAgo(eventDetail);
    const stalePenalty = staleReleasePenalty(releaseDays, category);
    let rawPriceForBulk = null;
    if (category === 'set_release') {
        if (topAffectedCard === null || topAffectedCard === void 0 ? void 0 : topAffectedCard.cardId) {
            const anchorRows = await all(`SELECT price FROM graded_prices
         WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
           AND COALESCE(verified, 0) = 1
         ORDER BY fetchedAt DESC LIMIT 1`, [topAffectedCard.cardId]);
            rawPriceForBulk = (_d = (_c = anchorRows[0]) === null || _c === void 0 ? void 0 : _c.price) !== null && _d !== void 0 ? _d : null;
        }
    }
    else if (raw.cardId) {
        rawPriceForBulk = await fetchRawPrice(raw.cardId);
    }
    const bulk = (0, opportunityBulkScoring_1.applyBulkAndEconomicScoring)({
        marketPrice: rawPriceForBulk !== null && rawPriceForBulk !== void 0 ? rawPriceForBulk : (category === 'set_release' ? 20 : null),
        changeAbs: (_e = topAffectedCard === null || topAffectedCard === void 0 ? void 0 : topAffectedCard.changeAbs) !== null && _e !== void 0 ? _e : null,
        changePct: (_f = metrics.price30dPct) !== null && _f !== void 0 ? _f : metrics.price7dPct,
        momentumDays: 30,
        soldListings: metrics.liquidityTier === 'strong' ? 10 : metrics.liquidityTier === 'ok' ? 5 : 1,
        liquidityTier: metrics.liquidityTier,
        buyoutScore: 0,
        velocityRatio: null,
        listedCount: null,
        listedCountPrev: null,
        netSentiment: raw.sentiment,
        hasCatalyst: category === 'tournament' ||
            category === 'ban_list' ||
            (category === 'set_release' && releaseDays != null && releaseDays <= 45),
        compMomentumPct: null,
    });
    let opportunityScore = computeOpportunityScore({
        relevance: raw.relevance,
        sentiment: raw.sentiment,
        direction,
        price30dPct: metrics.price30dPct,
        volumeChangePct: metrics.volumeChangePct,
        sourceCount,
        hasMarketData: hasCardMetrics || hasSetMetrics,
    });
    opportunityScore = clamp(Math.round(opportunityScore + bulk.economicBoost - bulk.penalty - stalePenalty), 0, 100);
    opportunityScore = boostSourceOnlyScore(opportunityScore, category, raw.relevance, raw.sentiment);
    const confidence = computeSignalConfidence({
        hasCardMetrics,
        hasSetMetrics,
        volumeChangePct: metrics.volumeChangePct,
        sourceCount,
        sparkPoints: sparkline.length,
    });
    const signalTitle = buildSignalTitle({
        entityName: entity.entityName,
        entityType: entity.entityType,
        direction,
        category,
        hasMarketConfirmation: marketConfirmed,
        metrics,
    });
    const sourceSummary = buildSourceSummary(sourcesByType, sources);
    const whyItMatters = buildWhyItMatters({
        category,
        direction,
        metrics,
        evidence: { totalSources: sourceCount, byType: sourcesByType, sources },
        hasMarketConfirmation: marketConfirmed,
        eventDetail,
    });
    const signalTier = classifySignalTier({
        opportunityScore,
        confidence,
        hasMarketConfirmation: marketConfirmed,
        direction,
    });
    const copy = buildInterpretation({ direction, metrics, category, sentiment: raw.sentiment });
    const drivers = buildDrivers({ sentiment: raw.sentiment, metrics, sourceCount });
    let explanation = copy.explanation;
    if (stalePenalty >= 28 && releaseDays != null) {
        explanation = `Legacy release (${releaseDays}d ago) — limited near-term upside. ${explanation}`;
    }
    else if (bulk.overrideActive && rawPriceForBulk != null && rawPriceForBulk < 5) {
        explanation = (0, opportunityBulkScoring_1.buildBulkAwareWhy)({
            marketPrice: rawPriceForBulk,
            bulk,
            baseWhy: explanation,
        });
    }
    return {
        id: raw.id,
        signalTitle,
        entityLabel,
        entityType: entity.entityType,
        sourceTitle: raw.title,
        signalTier,
        hasMarketConfirmation: marketConfirmed,
        whyItMatters,
        sourceSummary,
        eventTitle,
        eventDetail,
        category,
        categoryLabel: CATEGORY_LABELS[category],
        observedEffect: copy.observed,
        interpretation: copy.interpretation,
        opportunity: copy.opportunity,
        explanation,
        direction,
        directionLabel: DIRECTION_LABELS[direction],
        opportunityScore,
        confidence,
        horizon: (_g = HORIZON_BY_CATEGORY[category]) !== null && _g !== void 0 ? _g : '2–8 weeks',
        metrics,
        sparkline,
        cardId: raw.cardId,
        cardName: raw.cardName,
        setName: resolvedSet,
        topAffectedCard,
        sourceUrl: raw.sourceUrl,
        createdAt: raw.createdAt,
        sources,
        evidence: { totalSources: sourceCount, byType: sourcesByType, sources },
        drivers,
    };
}
function buildMarketPulse(signals, analyzedLast24h = 0) {
    const pulse = {
        bullish: 0,
        bearish: 0,
        watch: 0,
        neutral: 0,
        highRisk: 0,
        total: signals.length,
        analyzedLast24h,
        bullishInsight: null,
        watchInsight: null,
        highRiskInsight: null,
        strongestSignal: null,
        highestRisk: null,
    };
    let bestScore = -1;
    let worstRisk = -1;
    for (const s of signals) {
        if (s.direction === 'bullish')
            pulse.bullish++;
        else if (s.direction === 'bearish')
            pulse.bearish++;
        else if (s.direction === 'watch')
            pulse.watch++;
        else if (s.direction === 'high_risk')
            pulse.highRisk++;
        else
            pulse.neutral++;
        const actionable = s.signalTier === 'actionable' && s.opportunityScore >= 35 && s.direction !== 'neutral';
        if (actionable && s.opportunityScore > bestScore) {
            bestScore = s.opportunityScore;
            pulse.strongestSignal = {
                signalTitle: s.signalTitle,
                entityLabel: s.entityLabel,
                detail: `${s.directionLabel} · Score ${s.opportunityScore} · Based on ${s.evidence.totalSources} source${s.evidence.totalSources === 1 ? '' : 's'}`,
                score: s.opportunityScore,
                confidence: s.confidence,
                sourceCount: s.evidence.totalSources,
            };
        }
        if (s.direction === 'high_risk' && s.opportunityScore > worstRisk) {
            worstRisk = s.opportunityScore;
            pulse.highestRisk = {
                signalTitle: s.signalTitle,
                entityLabel: s.entityLabel,
                detail: s.explanation.slice(0, 100),
                score: s.opportunityScore,
            };
        }
    }
    pulse.bullishInsight = summarizeDirectionInsight(signals, 'bullish');
    pulse.watchInsight = summarizeDirectionInsight(signals, 'watch');
    pulse.highRiskInsight =
        pulse.highRisk === 0
            ? 'None currently flagged'
            : summarizeDirectionInsight(signals, 'high_risk');
    return pulse;
}
function partitionSignalsByTier(signals) {
    const actionable = signals.filter((s) => s.signalTier === 'actionable');
    const emerging = signals.filter((s) => s.signalTier === 'emerging' || s.signalTier === 'monitor');
    return { actionable, emerging };
}
function sortInvestmentSignals(signals, sort) {
    const copy = [...signals];
    switch (sort) {
        case 'confidence':
            return copy.sort((a, b) => b.confidence - a.confidence);
        case 'newest':
            return copy.sort((a, b) => { var _a, _b; return ((_a = b.createdAt) !== null && _a !== void 0 ? _a : '').localeCompare((_b = a.createdAt) !== null && _b !== void 0 ? _b : ''); });
        case 'price_impact':
            return copy.sort((a, b) => {
                var _a, _b, _c, _d;
                return Math.abs((_b = (_a = b.metrics.price30dPct) !== null && _a !== void 0 ? _a : b.metrics.price7dPct) !== null && _b !== void 0 ? _b : 0) -
                    Math.abs((_d = (_c = a.metrics.price30dPct) !== null && _c !== void 0 ? _c : a.metrics.price7dPct) !== null && _d !== void 0 ? _d : 0);
            });
        case 'volume':
            return copy.sort((a, b) => { var _a, _b; return ((_a = b.metrics.volumeChangePct) !== null && _a !== void 0 ? _a : 0) - ((_b = a.metrics.volumeChangePct) !== null && _b !== void 0 ? _b : 0); });
        case 'score':
        default:
            return copy.sort((a, b) => b.opportunityScore - a.opportunityScore);
    }
}
