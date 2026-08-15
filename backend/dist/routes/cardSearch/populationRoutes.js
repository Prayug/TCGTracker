"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const populationService_1 = require("../../services/populationService");
const gradedRefreshService_1 = require("../../services/gradedRefreshService");
const router = (0, express_1.Router)();
router.get('/population', async (req, res) => {
    try {
        const { cardId, cardName, setId, setName, cardNumber, variant, language, matchName, game, cardImageId } = req.query;
        if (!cardName || typeof cardName !== 'string') {
            return res.status(400).json({
                error: 'cardName query parameter is required',
            });
        }
        const result = await (0, populationService_1.getPopulationCounts)({
            cardId: typeof cardId === 'string' ? cardId.trim() : undefined,
            cardName: cardName.trim(),
            setId: typeof setId === 'string' ? setId.trim() : undefined,
            setName: typeof setName === 'string' ? setName.trim() : undefined,
            cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
            variant: typeof variant === 'string' ? variant.trim() : undefined,
            language: typeof language === 'string' ? language.trim() : undefined,
            matchName: typeof matchName === 'string' ? matchName.trim() : undefined,
            game: game === 'onepiece' || game === 'pokemon' ? game : undefined,
            cardImageId: typeof cardImageId === 'string' ? cardImageId.trim() : undefined,
        });
        if (result.cardId) {
            void (0, gradedRefreshService_1.recordGradedRequest)({
                cardId: result.cardId,
                cardName: result.cardName,
                setId: result.setId,
                setName: result.setName,
                cardNumber: result.cardNumber,
                language: typeof language === 'string' ? language.trim() : undefined,
                matchName: typeof matchName === 'string' ? matchName.trim() : undefined,
                variant: typeof variant === 'string' ? variant.trim() : undefined,
            });
        }
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({
            error: 'Failed to fetch population counts',
            message: error.message,
        });
    }
});
exports.default = router;
