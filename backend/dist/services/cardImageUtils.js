"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.getImageColumnSelectFragment = exports.hasImageMetadataColumns = exports.buildDeterministicImageUrls = exports.buildPlaceholderImage = void 0;
// Card image handling utilities
const setCodeService_1 = require("./setCodeService");
const buildPlaceholderImage = (name, set) => ('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' +
    encodeURIComponent(name) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' +
    encodeURIComponent(set) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E');
exports.buildPlaceholderImage = buildPlaceholderImage;
const buildDeterministicImageUrls = (setId, cardNumber, setName) => __awaiter(void 0, void 0, void 0, function* () {
    return setCodeService_1.setCodeService.buildDeterministicImageUrls(setId, cardNumber, setName);
});
exports.buildDeterministicImageUrls = buildDeterministicImageUrls;
const IMAGE_COLUMN_FRAGMENT = 'cm.imageSmall, cm.imageLarge, cm.imageSource, cm.imageLastUpdated,';
const IMAGE_COLUMN_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
let imageColumnCache = null;
const hasImageMetadataColumns = () => __awaiter(void 0, void 0, void 0, function* () {
    if (imageColumnCache &&
        Date.now() - imageColumnCache.checkedAt < IMAGE_COLUMN_CACHE_TTL) {
        return imageColumnCache.hasColumns;
    }
    const { getDb } = yield Promise.resolve().then(() => __importStar(require('../db/database')));
    const db = getDb();
    const hasColumns = yield new Promise((resolve) => {
        db.all("PRAGMA table_info(card_mappings)", [], (err, rows) => {
            if (err || !rows) {
                resolve(false);
            }
            else {
                resolve(rows.some((row) => row.name === 'imageSmall'));
            }
        });
    });
    imageColumnCache = { hasColumns, checkedAt: Date.now() };
    return hasColumns;
});
exports.hasImageMetadataColumns = hasImageMetadataColumns;
const getImageColumnSelectFragment = () => __awaiter(void 0, void 0, void 0, function* () {
    return (yield (0, exports.hasImageMetadataColumns)()) ? IMAGE_COLUMN_FRAGMENT : '';
});
exports.getImageColumnSelectFragment = getImageColumnSelectFragment;
