"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const captureSessionStore_1 = require("../captureSessionStore");
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
describe('captureSessionStore', () => {
    it('creates a scan session that becomes ready after front upload', () => {
        var _a, _b;
        const session = (0, captureSessionStore_1.createCaptureSession)('scan');
        expect(session.status).toBe('waiting');
        const uploaded = (0, captureSessionStore_1.uploadCaptureImage)(session.id, 'front', tinyPng);
        expect(uploaded.error).toBeUndefined();
        expect((_a = uploaded.session) === null || _a === void 0 ? void 0 : _a.status).toBe('ready');
        expect((_b = uploaded.session) === null || _b === void 0 ? void 0 : _b.frontImage).toBe(tinyPng);
    });
    it('supports grade front + back then consume', () => {
        var _a, _b, _c, _d, _e;
        const session = (0, captureSessionStore_1.createCaptureSession)('grade');
        (0, captureSessionStore_1.uploadCaptureImage)(session.id, 'front', tinyPng);
        expect((_a = (0, captureSessionStore_1.getCaptureSession)(session.id)) === null || _a === void 0 ? void 0 : _a.status).toBe('partial');
        (0, captureSessionStore_1.uploadCaptureImage)(session.id, 'back', tinyPng);
        const completed = (0, captureSessionStore_1.completeCaptureSession)(session.id);
        expect((_b = completed.session) === null || _b === void 0 ? void 0 : _b.status).toBe('ready');
        const consumed = (0, captureSessionStore_1.consumeCaptureSession)(session.id);
        expect((_c = consumed.session) === null || _c === void 0 ? void 0 : _c.frontImage).toBe(tinyPng);
        expect((_d = consumed.session) === null || _d === void 0 ? void 0 : _d.backImage).toBe(tinyPng);
        expect((_e = (0, captureSessionStore_1.getCaptureSession)(session.id)) === null || _e === void 0 ? void 0 : _e.status).toBe('consumed');
    });
    it('cancels sessions', () => {
        const session = (0, captureSessionStore_1.createCaptureSession)('scan');
        expect((0, captureSessionStore_1.cancelCaptureSession)(session.id)).toBe(true);
        expect((0, captureSessionStore_1.getCaptureSession)(session.id)).toBeNull();
    });
});
