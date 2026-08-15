"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ebayChallengeResponse = ebayChallengeResponse;
const crypto_1 = __importDefault(require("crypto"));
/**
 * eBay Marketplace Account Deletion challenge hash.
 * SHA-256 hex of challengeCode + verificationToken + endpointUrl (exact portal URL).
 */
function ebayChallengeResponse(challengeCode, verificationToken, endpointUrl) {
    return crypto_1.default
        .createHash('sha256')
        .update(challengeCode + verificationToken + endpointUrl, 'utf8')
        .digest('hex');
}
