"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
class AuthService {
    constructor(db) {
        this.initialized = false;
        this.db = db;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.initialized)
                return;
            this.initialized = true;
            yield new Promise((resolve, reject) => {
                this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => (err ? reject(err) : resolve()));
            });
            yield new Promise((resolve, reject) => {
                this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
      `, (err) => (err ? reject(err) : resolve()));
            });
            yield new Promise((resolve, reject) => {
                this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
      `, (err) => (err ? reject(err) : resolve()));
            });
        });
    }
    register(username, email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                // Hash password
                bcryptjs_1.default.hash(password, env_1.env.bcrypt.rounds, (err, hash) => {
                    if (err)
                        return reject(err);
                    // Insert user
                    this.db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash], function (err) {
                        if (err) {
                            if (err.message.includes('UNIQUE constraint failed')) {
                                return reject(new Error('Username or email already exists'));
                            }
                            return reject(err);
                        }
                        const userId = this.lastID;
                        // Generate JWT
                        const token = jsonwebtoken_1.default.sign({ id: userId, email, username }, env_1.env.jwt.secret, { expiresIn: env_1.env.jwt.expiresIn });
                        resolve({
                            user: { id: userId, username, email, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
                            token,
                        });
                    });
                });
            });
        });
    }
    login(email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
                    if (err)
                        return reject(err);
                    if (!user)
                        return reject(new Error('Invalid credentials'));
                    // Compare password
                    bcryptjs_1.default.compare(password, user.password_hash, (err, isMatch) => {
                        if (err)
                            return reject(err);
                        if (!isMatch)
                            return reject(new Error('Invalid credentials'));
                        // Generate JWT
                        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, username: user.username }, env_1.env.jwt.secret, { expiresIn: env_1.env.jwt.expiresIn });
                        const { password_hash } = user, userWithoutPassword = __rest(user, ["password_hash"]);
                        resolve({
                            user: userWithoutPassword,
                            token,
                        });
                    });
                });
            });
        });
    }
    getUserById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.db.get('SELECT id, username, email, created_at, updated_at FROM users WHERE id = ?', [id], (err, user) => {
                    if (err)
                        return reject(err);
                    resolve(user || null);
                });
            });
        });
    }
    updateUser(id, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const fields = [];
                const values = [];
                if (updates.username) {
                    fields.push('username = ?');
                    values.push(updates.username);
                }
                if (updates.email) {
                    fields.push('email = ?');
                    values.push(updates.email);
                }
                fields.push('updated_at = CURRENT_TIMESTAMP');
                values.push(id);
                const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
                this.db.run(query, values, (err) => {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            return reject(new Error('Username or email already exists'));
                        }
                        return reject(err);
                    }
                    this.getUserById(id)
                        .then((user) => {
                        if (!user)
                            return reject(new Error('User not found'));
                        resolve(user);
                    })
                        .catch(reject);
                });
            });
        });
    }
    changePassword(id, oldPassword, newPassword) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.db.get('SELECT password_hash FROM users WHERE id = ?', [id], (err, row) => {
                    if (err)
                        return reject(err);
                    if (!row)
                        return reject(new Error('User not found'));
                    bcryptjs_1.default.compare(oldPassword, row.password_hash, (err, isMatch) => {
                        if (err)
                            return reject(err);
                        if (!isMatch)
                            return reject(new Error('Invalid current password'));
                        bcryptjs_1.default.hash(newPassword, env_1.env.bcrypt.rounds, (err, hash) => {
                            if (err)
                                return reject(err);
                            this.db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, id], (err) => {
                                if (err)
                                    return reject(err);
                                resolve();
                            });
                        });
                    });
                });
            });
        });
    }
}
exports.AuthService = AuthService;
