"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAiExplanation = generateAiExplanation;
exports.isAiExplanation = isAiExplanation;
const env_1 = require("../config/env");
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CATEGORY_LABELS = {
    'strong-buy': 'Strong Buy',
    buy: 'Buy',
    recovery: 'Recovery Play',
    momentum: 'Momentum',
    speculative: 'Speculative',
    caution: 'Caution',
    stagnant: 'Stagnant',
    avoid: 'Avoid',
    downtrend: 'Downtrend',
};
function buildPrompt(ctx) {
    var _a, _b;
    const signals = parseExternalSignals(ctx.externalSignals);
    const categoryLabel = (_a = CATEGORY_LABELS[ctx.category]) !== null && _a !== void 0 ? _a : ctx.category;
    const setAgeDesc = ctx.setAgeDays !== null
        ? ctx.setAgeDays < 30
            ? 'brand new set (high demand, limited supply)'
            : ctx.setAgeDays < 90
                ? 'recent set (still being opened)'
                : ctx.setAgeDays < 180
                    ? 'maturing set (supply stabilizing)'
                    : 'older set (supply may be drying up)'
        : '';
    const ret7 = ctx.predictedReturns.d7;
    const ret30 = ctx.predictedReturns.d30;
    const ret90 = ctx.predictedReturns.d90;
    return `You are a Pokemon TCG market analyst writing for collectors and investors. Write a 2-3 sentence explanation that a non-technical person can understand.

Card: ${ctx.cardName} from ${ctx.setName}
Rarity: ${(_b = ctx.rarity) !== null && _b !== void 0 ? _b : 'Unknown'}
Current price: $${ctx.currentPrice.toFixed(2)}
Set info: ${setAgeDesc || 'Set age unknown'}
Prediction: ${categoryLabel} (${ctx.confidence}% confidence, ${ctx.riskScore}/100 risk)
Expected price movement: ~${fmtRet(ret7)} in 7 days, ~${fmtRet(ret30)} in 30 days, ~${fmtRet(ret90)} in 90 days
${signals}

Write 2-3 sentences. Explain WHY this card is a ${categoryLabel} in plain language. Reference specific factors like: set age/supply, tournament demand, reprint risk, rotation status, or community buzz when relevant. Mention the expected price movement naturally. Do not use bullet points.`;
}
function fmtRet(val) {
    if (val === null)
        return 'N/A';
    const pct = (val * 100).toFixed(1);
    return val >= 0 ? `+${pct}%` : `${pct}%`;
}
function parseExternalSignals(raw) {
    var _a;
    if (!raw || raw === '[]' || raw.includes('unavailable'))
        return '';
    let signals;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0)
            return '';
        signals = parsed;
    }
    catch (_b) {
        return '';
    }
    const humanSignals = [];
    for (const s of signals) {
        const type = s.type || s.sourceType || 'unknown';
        const title = s.title || '';
        const summary = s.summary || '';
        const sentiment = (_a = s.sentiment) !== null && _a !== void 0 ? _a : 0;
        switch (type) {
            case 'tournament_meta':
                humanSignals.push(`Tournament buzz: ${title}`);
                break;
            case 'ban_list':
                humanSignals.push(`Regulation/ban list concern: ${title}`);
                break;
            case 'reprint':
                humanSignals.push(`Reprint risk: ${title}`);
                break;
            case 'upcoming_set':
                humanSignals.push(`New set incoming: ${title}`);
                break;
            case 'manipulation':
                humanSignals.push(`Price manipulation warning: ${title}`);
                break;
            case 'character_hype':
                humanSignals.push(`Community hype: ${title}`);
                break;
            case 'news':
                humanSignals.push(`Recent news: ${title}`);
                break;
            default:
                if (title)
                    humanSignals.push(title);
        }
    }
    if (humanSignals.length === 0)
        return '';
    const top = humanSignals.slice(0, 4);
    return `External factors to consider:\n${top.map(s => `- ${s}`).join('\n')}`;
}
async function callGroqApi(prompt) {
    var _a, _b, _c;
    const apiKey = env_1.env.apis.groq;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY not configured');
    }
    const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a friendly Pokemon TCG market analyst. Write concise, plain-language explanations that collectors and investors can understand. Avoid jargon. Reference specific factors that affect price.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.5,
            max_tokens: 250,
        }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Groq API error ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    const text = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
    if (!text || typeof text !== 'string') {
        throw new Error('Groq returned empty or malformed response');
    }
    return text.trim();
}
async function generateAiExplanation(ctx) {
    const prompt = buildPrompt(ctx);
    const result = await callGroqApi(prompt);
    return `[AI] ${result}`;
}
function isAiExplanation(explanation) {
    return explanation.startsWith('[AI] ');
}
