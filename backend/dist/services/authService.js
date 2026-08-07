"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const emailService_1 = require("./emailService");
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
function toPublicUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        email_verified: Boolean(user.email_verified),
        created_at: user.created_at,
        updated_at: user.updated_at,
    };
}
function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
}
function get(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function signToken(user) {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, username: user.username }, env_1.env.jwt.secret, { expiresIn: env_1.env.jwt.expiresIn });
}
function buildVerificationLink(token) {
    return `${env_1.env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
}
class AuthService {
    constructor(db) {
        this.initialized = false;
        this.db = db;
    }
    async init() {
        if (this.initialized)
            return;
        this.initialized = true;
        await run(this.db, `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          email_verified INTEGER NOT NULL DEFAULT 0,
          email_verification_token TEXT,
          email_verification_expires TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
        // Older installs: ensure verification columns exist even before migration 25 runs.
        const cols = await new Promise((resolve, reject) => {
            this.db.all('PRAGMA table_info(users)', [], (err, rows) => err ? reject(err) : resolve((rows || [])));
        });
        const names = new Set(cols.map((c) => c.name));
        if (!names.has('email_verified')) {
            await run(this.db, 'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
            await run(this.db, 'UPDATE users SET email_verified = 1');
        }
        if (!names.has('email_verification_token')) {
            await run(this.db, 'ALTER TABLE users ADD COLUMN email_verification_token TEXT');
        }
        if (!names.has('email_verification_expires')) {
            await run(this.db, 'ALTER TABLE users ADD COLUMN email_verification_expires TEXT');
        }
        await run(this.db, 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await run(this.db, 'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
        await run(this.db, 'CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(email_verification_token)');
    }
    async issueVerificationToken(userId) {
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
        await run(this.db, `UPDATE users
       SET email_verification_token = ?,
           email_verification_expires = ?,
           email_verified = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [token, expires, userId]);
        return token;
    }
    async sendVerificationEmail(email, username, token) {
        const verifyUrl = buildVerificationLink(token);
        const subject = 'Verify your TCGTracker email';
        const text = [
            `Hi ${username},`,
            '',
            'Thanks for creating a TCGTracker account. Confirm your email with this link:',
            '',
            verifyUrl,
            '',
            'This link expires in 24 hours. If you did not sign up, you can ignore this message.',
            '',
            '— TCGTracker',
        ].join('\n');
        if (!(0, emailService_1.isEmailConfigured)()) {
            logger_1.logger.warn('SMTP not configured — verification email not sent', { email, verifyUrl });
            return { emailSent: false, verifyUrl };
        }
        const emailSent = await (0, emailService_1.sendEmail)({ to: email, subject, text });
        if (!emailSent) {
            logger_1.logger.warn('Verification email failed to send', { email, verifyUrl });
        }
        else {
            logger_1.logger.info('Verification email sent', { email });
        }
        return { emailSent, verifyUrl };
    }
    async register(username, email, password) {
        const hash = await bcryptjs_1.default.hash(password, env_1.env.bcrypt.rounds);
        let userId;
        try {
            userId = await new Promise((resolve, reject) => {
                this.db.run(`INSERT INTO users (username, email, password_hash, email_verified)
           VALUES (?, ?, ?, 0)`, [username, email, hash], function (err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            return reject(new Error('Username or email already exists'));
                        }
                        return reject(err);
                    }
                    resolve(this.lastID);
                });
            });
        }
        catch (err) {
            throw err;
        }
        const token = await this.issueVerificationToken(userId);
        const { emailSent, verifyUrl } = await this.sendVerificationEmail(email, username, token);
        const user = await this.getUserById(userId);
        if (!user)
            throw new Error('User not found after register');
        // Never auto-verify — account stays unverified until the email link is opened.
        return {
            user,
            requiresVerification: true,
            emailSent,
            // Always expose the link when mail failed so local testing isn't blocked.
            ...(!emailSent ? { verifyUrl } : {}),
        };
    }
    async login(email, password) {
        const user = await get(this.db, 'SELECT * FROM users WHERE email = ?', [email]);
        if (!user)
            throw new Error('Invalid credentials');
        const isMatch = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isMatch)
            throw new Error('Invalid credentials');
        if (!user.email_verified) {
            throw new Error('EMAIL_NOT_VERIFIED');
        }
        return {
            user: toPublicUser(user),
            token: signToken(user),
        };
    }
    async verifyEmailToken(token) {
        if (!token || token.length < 16) {
            throw new Error('Invalid or expired verification link');
        }
        const user = await get(this.db, 'SELECT * FROM users WHERE email_verification_token = ?', [token]);
        if (!user)
            throw new Error('Invalid or expired verification link');
        if (user.email_verification_expires &&
            new Date(user.email_verification_expires).getTime() < Date.now()) {
            throw new Error('Verification link has expired. Request a new one.');
        }
        await run(this.db, `UPDATE users
       SET email_verified = 1,
           email_verification_token = NULL,
           email_verification_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [user.id]);
        const updated = await this.getUserById(user.id);
        if (!updated)
            throw new Error('User not found');
        return {
            user: updated,
            authToken: signToken({ id: user.id, email: user.email, username: user.username }),
        };
    }
    async resendVerificationEmail(email) {
        const user = await get(this.db, 'SELECT * FROM users WHERE email = ?', [email]);
        // Don't reveal whether the email exists
        if (!user) {
            return { emailSent: true };
        }
        if (user.email_verified) {
            return { emailSent: true };
        }
        const token = await this.issueVerificationToken(user.id);
        const { emailSent, verifyUrl } = await this.sendVerificationEmail(user.email, user.username, token);
        return {
            emailSent,
            ...(!emailSent ? { verifyUrl } : {}),
        };
    }
    async getUserById(id) {
        const user = await get(this.db, `SELECT id, username, email, email_verified, created_at, updated_at,
              password_hash, email_verification_token, email_verification_expires
       FROM users WHERE id = ?`, [id]);
        if (!user)
            return null;
        return toPublicUser(user);
    }
    async updateUser(id, updates) {
        var _a;
        const fields = [];
        const values = [];
        if (updates.username) {
            fields.push('username = ?');
            values.push(updates.username);
        }
        if (updates.email) {
            fields.push('email = ?');
            values.push(updates.email);
            // Changing email requires re-verification
            fields.push('email_verified = 0');
        }
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        try {
            await run(this.db, `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
        }
        catch (err) {
            if ((_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.includes('UNIQUE constraint failed')) {
                throw new Error('Username or email already exists');
            }
            throw err;
        }
        if (updates.email) {
            const user = await get(this.db, 'SELECT * FROM users WHERE id = ?', [id]);
            if (user) {
                const token = await this.issueVerificationToken(id);
                await this.sendVerificationEmail(updates.email, user.username, token);
            }
        }
        const user = await this.getUserById(id);
        if (!user)
            throw new Error('User not found');
        return user;
    }
    async changePassword(id, oldPassword, newPassword) {
        const row = await get(this.db, 'SELECT password_hash FROM users WHERE id = ?', [id]);
        if (!row)
            throw new Error('User not found');
        const isMatch = await bcryptjs_1.default.compare(oldPassword, row.password_hash);
        if (!isMatch)
            throw new Error('Invalid current password');
        const hash = await bcryptjs_1.default.hash(newPassword, env_1.env.bcrypt.rounds);
        await run(this.db, 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, id]);
    }
}
exports.AuthService = AuthService;
