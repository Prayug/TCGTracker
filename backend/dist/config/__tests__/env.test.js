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
const vitest_1 = require("vitest");
const OLD_ENV = process.env;
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.resetModules();
    process.env = Object.assign({}, OLD_ENV);
    vitest_1.vi.spyOn(process, 'exit').mockImplementation((() => { }));
    vitest_1.vi.spyOn(console, 'error').mockImplementation(() => { });
    vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => { });
});
(0, vitest_1.afterAll)(() => {
    process.env = OLD_ENV;
    vitest_1.vi.restoreAllMocks();
});
(0, vitest_1.describe)('env validation', () => {
    (0, vitest_1.it)('parses valid environment variables successfully', () => __awaiter(void 0, void 0, void 0, function* () {
        process.env.JWT_SECRET = 'a'.repeat(32);
        process.env.NODE_ENV = 'development';
        yield (0, vitest_1.expect)(Promise.resolve().then(() => __importStar(require('../env')))).resolves.toBeDefined();
    }));
    (0, vitest_1.it)('rejects missing JWT_SECRET (less than 32 chars)', () => __awaiter(void 0, void 0, void 0, function* () {
        process.env.JWT_SECRET = 'short';
        process.env.NODE_ENV = 'development';
        yield (0, vitest_1.expect)(Promise.resolve().then(() => __importStar(require('../env')))).rejects.toThrow();
    }));
    (0, vitest_1.it)('rejects invalid NODE_ENV', () => __awaiter(void 0, void 0, void 0, function* () {
        process.env.JWT_SECRET = 'a'.repeat(32);
        process.env.NODE_ENV = 'invalid';
        yield (0, vitest_1.expect)(Promise.resolve().then(() => __importStar(require('../env')))).rejects.toThrow();
    }));
});
