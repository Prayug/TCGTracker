"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const validation_1 = require("../middleware/validation");
const apiResponse_1 = require("../utils/apiResponse");
const captureSessionStore_1 = require("../services/captureSessionStore");
const lanAddresses_1 = require("../utils/lanAddresses");
const createSchema = zod_1.z.object({
    body: zod_1.z.object({
        mode: zod_1.z.enum(['scan', 'grade']),
    }),
});
const uploadSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        side: zod_1.z.enum(['front', 'back']).default('front'),
        image: zod_1.z.string().min(1),
    }),
});
const idParamsSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
const router = (0, express_1.Router)();
router.get('/network', (_req, res) => {
    var _a;
    const lanHosts = (0, lanAddresses_1.getLanIpv4Addresses)();
    return (0, apiResponse_1.ok)(res, {
        lanHosts,
        primaryHost: (_a = lanHosts[0]) !== null && _a !== void 0 ? _a : null,
    });
});
router.post('/', (0, validation_1.validate)(createSchema), (req, res) => {
    var _a;
    const session = (0, captureSessionStore_1.createCaptureSession)(req.body.mode);
    const lanHosts = (0, lanAddresses_1.getLanIpv4Addresses)();
    return (0, apiResponse_1.ok)(res, {
        ...(0, captureSessionStore_1.toPublicSession)(session),
        capturePath: `/capture/${session.id}`,
        lanHosts,
        primaryLanHost: (_a = lanHosts[0]) !== null && _a !== void 0 ? _a : null,
    }, 201);
});
router.get('/:id', (0, validation_1.validate)(idParamsSchema), (req, res) => {
    const session = (0, captureSessionStore_1.getCaptureSession)(req.params.id);
    if (!session)
        return (0, apiResponse_1.fail)(res, 'Capture session not found or expired', 404);
    const includeImages = req.query.includeImages === '1' || req.query.includeImages === 'true';
    // Only return bulky images once the session is ready (or partial for preview).
    const allowImages = includeImages && (session.status === 'ready' || session.status === 'partial');
    return (0, apiResponse_1.ok)(res, (0, captureSessionStore_1.toPublicSession)(session, allowImages));
});
router.post('/:id/image', (0, validation_1.validate)(uploadSchema), (req, res) => {
    const result = (0, captureSessionStore_1.uploadCaptureImage)(req.params.id, req.body.side, req.body.image);
    if (result.error)
        return (0, apiResponse_1.fail)(res, result.error, result.status || 400);
    return (0, apiResponse_1.ok)(res, (0, captureSessionStore_1.toPublicSession)(result.session));
});
router.post('/:id/complete', (0, validation_1.validate)(idParamsSchema), (req, res) => {
    const result = (0, captureSessionStore_1.completeCaptureSession)(req.params.id);
    if (result.error)
        return (0, apiResponse_1.fail)(res, result.error, result.status || 400);
    return (0, apiResponse_1.ok)(res, (0, captureSessionStore_1.toPublicSession)(result.session));
});
router.post('/:id/consume', (0, validation_1.validate)(idParamsSchema), (req, res) => {
    const result = (0, captureSessionStore_1.consumeCaptureSession)(req.params.id);
    if (result.error)
        return (0, apiResponse_1.fail)(res, result.error, result.status || 400);
    return (0, apiResponse_1.ok)(res, (0, captureSessionStore_1.toPublicSession)(result.session, true));
});
router.delete('/:id', (0, validation_1.validate)(idParamsSchema), (req, res) => {
    (0, captureSessionStore_1.cancelCaptureSession)(req.params.id);
    return (0, apiResponse_1.ok)(res, { cancelled: true });
});
exports.default = router;
