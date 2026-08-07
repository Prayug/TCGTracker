"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmailConfigured = isEmailConfigured;
exports.sendEmail = sendEmail;
exports.formatAlertEmail = formatAlertEmail;
const net_1 = __importDefault(require("net"));
const tls_1 = __importDefault(require("tls"));
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
function isEmailConfigured() {
    return Boolean(env_1.env.email.host && env_1.env.email.port && env_1.env.email.user && env_1.env.email.password);
}
function readSmtpResponse(socket) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const onData = (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split(/\r?\n/).filter((l) => l.length > 0);
            if (!lines.length)
                return;
            const last = lines[lines.length - 1];
            // Complete SMTP reply: "250 OK" (code + space) vs multiline "250-..."
            if (/^\d{3} /.test(last)) {
                cleanup();
                resolve(buffer);
            }
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const onClose = () => {
            cleanup();
            reject(new Error('SMTP connection closed unexpectedly'));
        };
        const cleanup = () => {
            socket.off('data', onData);
            socket.off('error', onError);
            socket.off('close', onClose);
        };
        socket.on('data', onData);
        socket.on('error', onError);
        socket.on('close', onClose);
    });
}
async function writeCommand(socket, command) {
    socket.write(command + '\r\n');
    return readSmtpResponse(socket);
}
function expectCode(response, ...codes) {
    const code = parseInt(response.slice(0, 3), 10);
    if (!codes.includes(code)) {
        throw new Error(`SMTP unexpected reply ${code}: ${response.trim().slice(0, 200)}`);
    }
}
function connectPlain(host, port) {
    return new Promise((resolve, reject) => {
        const socket = net_1.default.connect({ host, port }, () => resolve(socket));
        socket.once('error', reject);
    });
}
function upgradeToTls(socket, host) {
    return new Promise((resolve, reject) => {
        const secure = tls_1.default.connect({ socket, host, servername: host }, () => resolve(secure));
        secure.once('error', reject);
    });
}
function connectTls(host, port) {
    return new Promise((resolve, reject) => {
        const socket = tls_1.default.connect({ host, port, servername: host }, () => resolve(socket));
        socket.once('error', reject);
    });
}
function encodeAddressHeader(from, to, subject, text) {
    const normalized = text.replace(/\r?\n/g, '\r\n');
    return [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        normalized,
        '',
    ].join('\r\n');
}
/**
 * Minimal SMTP sender (no nodemailer). Supports STARTTLS (587) and implicit TLS (465).
 * No-ops when SMTP env is incomplete.
 */
async function sendEmail(options) {
    if (!isEmailConfigured()) {
        return false;
    }
    const host = env_1.env.email.host;
    const port = env_1.env.email.port;
    const user = env_1.env.email.user;
    const password = env_1.env.email.password;
    const from = env_1.env.email.from;
    const { to, subject, text } = options;
    let socket = null;
    try {
        if (port === 465) {
            socket = await connectTls(host, port);
        }
        else {
            socket = await connectPlain(host, port);
        }
        expectCode(await readSmtpResponse(socket), 220);
        expectCode(await writeCommand(socket, `EHLO tcgtracker`), 250);
        if (port !== 465) {
            expectCode(await writeCommand(socket, 'STARTTLS'), 220);
            socket = await upgradeToTls(socket, host);
            expectCode(await writeCommand(socket, `EHLO tcgtracker`), 250);
        }
        expectCode(await writeCommand(socket, 'AUTH LOGIN'), 334);
        expectCode(await writeCommand(socket, Buffer.from(user).toString('base64')), 334);
        expectCode(await writeCommand(socket, Buffer.from(password).toString('base64')), 235);
        expectCode(await writeCommand(socket, `MAIL FROM:<${from}>`), 250);
        expectCode(await writeCommand(socket, `RCPT TO:<${to}>`), 250, 251);
        expectCode(await writeCommand(socket, 'DATA'), 354);
        const message = encodeAddressHeader(from, to, subject, text);
        // Terminate DATA with <CRLF>.<CRLF>; escape lines starting with '.'
        const escaped = message
            .split(/\r?\n/)
            .map((line) => (line.startsWith('.') ? '.' + line : line))
            .join('\r\n');
        expectCode(await writeCommand(socket, escaped + '\r\n.'), 250);
        await writeCommand(socket, 'QUIT').catch(() => undefined);
        logger_1.logger.info('Email sent', { to, subject });
        return true;
    }
    catch (err) {
        logger_1.logger.warn('Failed to send email (non-fatal)', {
            to,
            subject,
            error: (err === null || err === void 0 ? void 0 : err.message) || String(err),
        });
        return false;
    }
    finally {
        try {
            socket === null || socket === void 0 ? void 0 : socket.destroy();
        }
        catch (_a) {
            /* ignore */
        }
    }
}
function formatAlertEmail(alert) {
    const type = alert.alert_type || 'price_threshold';
    const subject = `TCGTracker alert: ${alert.card_name}`;
    const lines = [
        `Your alert for "${alert.card_name}" (${alert.card_id}) was triggered.`,
        '',
        `Type: ${type}`,
    ];
    if (type === 'price_threshold' && alert.target_price != null) {
        lines.push(`Condition: ${alert.condition || 'n/a'} $${Number(alert.target_price).toFixed(2)}`);
    }
    if (alert.threshold_pct != null) {
        lines.push(`Threshold: ${alert.threshold_pct}%`);
    }
    lines.push('', '— TCGTracker');
    return { subject, text: lines.join('\n') };
}
