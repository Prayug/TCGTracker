"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCaptureSession = createCaptureSession;
exports.getCaptureSession = getCaptureSession;
exports.uploadCaptureImage = uploadCaptureImage;
exports.completeCaptureSession = completeCaptureSession;
exports.consumeCaptureSession = consumeCaptureSession;
exports.cancelCaptureSession = cancelCaptureSession;
exports.toPublicSession = toPublicSession;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 200;
const MAX_IMAGE_CHARS = 12000000;
const STORE_DIR = path_1.default.join(os_1.default.tmpdir(), 'tcgtracker-capture-sessions');
const sessions = new Map();
function ensureStoreDir() {
    try {
        fs_1.default.mkdirSync(STORE_DIR, { recursive: true });
    }
    catch (_a) {
        // ignore
    }
}
function metaPath(id) {
    return path_1.default.join(STORE_DIR, `${id}.json`);
}
function imagePath(id, side) {
    return path_1.default.join(STORE_DIR, `${id}-${side}.jpg`);
}
function dataUrlToBuffer(dataUrl) {
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s.exec(dataUrl);
    if (!(match === null || match === void 0 ? void 0 : match[1]))
        return null;
    try {
        return Buffer.from(match[1], 'base64');
    }
    catch (_a) {
        return null;
    }
}
function bufferToJpegDataUrl(buf) {
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
function writeImageFile(id, side, dataUrl) {
    const buf = dataUrlToBuffer(dataUrl);
    if (!buf || buf.length < 32)
        return false;
    ensureStoreDir();
    fs_1.default.writeFileSync(imagePath(id, side), buf);
    return true;
}
function readImageFile(id, side) {
    try {
        const buf = fs_1.default.readFileSync(imagePath(id, side));
        if (buf.length < 32)
            return undefined;
        return bufferToJpegDataUrl(buf);
    }
    catch (_a) {
        return undefined;
    }
}
function deleteImageFiles(id) {
    for (const side of ['front', 'back']) {
        try {
            fs_1.default.unlinkSync(imagePath(id, side));
        }
        catch (_a) {
            // ignore
        }
    }
}
function persistMeta(session) {
    try {
        ensureStoreDir();
        const meta = {
            id: session.id,
            mode: session.mode,
            status: session.status,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            completedAt: session.completedAt,
            consumedAt: session.consumedAt,
            hasFront: Boolean(session.frontImage) || fs_1.default.existsSync(imagePath(session.id, 'front')),
            hasBack: Boolean(session.backImage) || fs_1.default.existsSync(imagePath(session.id, 'back')),
        };
        fs_1.default.writeFileSync(metaPath(session.id), JSON.stringify(meta), 'utf8');
    }
    catch (_a) {
        // Best-effort disk mirror.
    }
}
function deletePersistedSession(id) {
    try {
        fs_1.default.unlinkSync(metaPath(id));
    }
    catch (_a) {
        // ignore
    }
    deleteImageFiles(id);
}
function loadPersistedSession(id) {
    try {
        const raw = fs_1.default.readFileSync(metaPath(id), 'utf8');
        const meta = JSON.parse(raw);
        if (!(meta === null || meta === void 0 ? void 0 : meta.id) || meta.id !== id)
            return null;
        const session = {
            id: meta.id,
            mode: meta.mode,
            status: meta.status,
            createdAt: meta.createdAt,
            expiresAt: meta.expiresAt,
            completedAt: meta.completedAt,
            consumedAt: meta.consumedAt,
            frontImage: meta.hasFront ? readImageFile(id, 'front') : undefined,
            backImage: meta.hasBack ? readImageFile(id, 'back') : undefined,
        };
        sessions.set(id, session);
        return session;
    }
    catch (_a) {
        return null;
    }
}
function purgeExpired(now = Date.now()) {
    for (const [id, session] of sessions) {
        if (session.expiresAt <= now || session.status === 'consumed') {
            if (session.status === 'consumed' && session.consumedAt && now - session.consumedAt > 60000) {
                sessions.delete(id);
                deletePersistedSession(id);
            }
            else if (session.expiresAt <= now) {
                if (session.status !== 'consumed') {
                    session.status = 'expired';
                }
                sessions.delete(id);
                deletePersistedSession(id);
            }
        }
    }
    try {
        ensureStoreDir();
        for (const file of fs_1.default.readdirSync(STORE_DIR)) {
            if (!file.endsWith('.json'))
                continue;
            const id = file.slice(0, -5);
            if (sessions.has(id))
                continue;
            const loaded = loadPersistedSession(id);
            if (!loaded) {
                deletePersistedSession(id);
                continue;
            }
            if (loaded.expiresAt <= now || loaded.status === 'consumed') {
                sessions.delete(id);
                deletePersistedSession(id);
            }
        }
    }
    catch (_a) {
        // ignore
    }
    if (sessions.size <= MAX_SESSIONS)
        return;
    const ordered = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
    const overflow = sessions.size - MAX_SESSIONS;
    for (let i = 0; i < overflow; i++) {
        sessions.delete(ordered[i].id);
        deletePersistedSession(ordered[i].id);
    }
}
function recomputeStatus(session) {
    if (session.status === 'consumed' || session.status === 'expired')
        return session.status;
    if (session.completedAt)
        return 'ready';
    if (session.mode === 'scan' && session.frontImage)
        return 'ready';
    if (session.frontImage)
        return 'partial';
    return 'waiting';
}
function createCaptureSession(mode) {
    purgeExpired();
    const now = Date.now();
    const session = {
        id: (0, crypto_1.randomUUID)(),
        mode,
        status: 'waiting',
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
    };
    sessions.set(session.id, session);
    persistMeta(session);
    return session;
}
function getCaptureSession(id) {
    purgeExpired();
    let session = sessions.get(id) || loadPersistedSession(id);
    if (!session)
        return null;
    if (session.expiresAt <= Date.now()) {
        session.status = 'expired';
        sessions.delete(id);
        deletePersistedSession(id);
        return null;
    }
    // Hydrate images from disk if memory only has metadata after restart.
    if (!session.frontImage)
        session.frontImage = readImageFile(id, 'front');
    if (!session.backImage)
        session.backImage = readImageFile(id, 'back');
    session.status = recomputeStatus(session);
    return session;
}
function uploadCaptureImage(id, side, image) {
    const session = getCaptureSession(id);
    if (!session)
        return { error: 'Capture session not found or expired', status: 404 };
    if (session.status === 'consumed') {
        return { error: 'Capture session already consumed', status: 409 };
    }
    if (session.status === 'ready' && session.completedAt) {
        return { error: 'Capture session already completed', status: 409 };
    }
    if (!image.startsWith('data:image/')) {
        return { error: 'Image must be a base64 data URL', status: 400 };
    }
    if (image.length > MAX_IMAGE_CHARS) {
        return { error: 'Image too large', status: 413 };
    }
    if (side === 'back' && session.mode === 'scan') {
        return { error: 'Scan sessions only accept a front image', status: 400 };
    }
    if (side === 'back' && !session.frontImage) {
        return { error: 'Capture the front of the card first', status: 400 };
    }
    if (!writeImageFile(id, side, image)) {
        return { error: 'Could not store image — retake and try again', status: 400 };
    }
    if (side === 'front')
        session.frontImage = image;
    else
        session.backImage = image;
    if (session.mode === 'scan') {
        session.completedAt = Date.now();
    }
    session.status = recomputeStatus(session);
    persistMeta(session);
    return { session };
}
function completeCaptureSession(id) {
    const session = getCaptureSession(id);
    if (!session)
        return { error: 'Capture session not found or expired', status: 404 };
    if (session.status === 'consumed') {
        return { error: 'Capture session already consumed', status: 409 };
    }
    if (!session.frontImage) {
        return { error: 'Front image is required before completing', status: 400 };
    }
    session.completedAt = Date.now();
    session.status = 'ready';
    persistMeta(session);
    return { session };
}
function consumeCaptureSession(id) {
    const session = getCaptureSession(id);
    if (!session)
        return { error: 'Capture session not found or expired', status: 404 };
    if (session.status === 'consumed') {
        return { error: 'Capture session already consumed', status: 409 };
    }
    if (!session.frontImage) {
        return { error: 'No images available yet', status: 400 };
    }
    session.status = 'consumed';
    session.consumedAt = Date.now();
    const snapshot = {
        ...session,
        frontImage: session.frontImage,
        backImage: session.backImage,
    };
    session.frontImage = undefined;
    session.backImage = undefined;
    persistMeta(session);
    // Keep binary files briefly so a late poll can still hydrate if needed, then
    // purgeExpired/deletePersistedSession cleans them after the consumed TTL.
    return { session: snapshot };
}
function cancelCaptureSession(id) {
    const existed = sessions.delete(id) || fs_1.default.existsSync(metaPath(id));
    deletePersistedSession(id);
    return existed;
}
function toPublicSession(session, includeImages = false) {
    var _a, _b, _c;
    return {
        id: session.id,
        mode: session.mode,
        status: session.status,
        hasFront: Boolean(session.frontImage),
        hasBack: Boolean(session.backImage),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        completedAt: (_a = session.completedAt) !== null && _a !== void 0 ? _a : null,
        ...(includeImages
            ? {
                frontImage: (_b = session.frontImage) !== null && _b !== void 0 ? _b : null,
                backImage: (_c = session.backImage) !== null && _c !== void 0 ? _c : null,
            }
            : {}),
    };
}
