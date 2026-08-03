import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Database } from 'sqlite3';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { isEmailConfigured, sendEmail } from './emailService';

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  email_verified?: number;
  email_verification_token?: string | null;
  email_verification_expires?: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicUser = {
  id: number;
  username: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
};

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    email_verified: Boolean(user.email_verified),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function run(db: Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function get<T>(db: Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function signToken(user: { id: number; email: string; username: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn } as SignOptions
  );
}

function buildVerificationLink(token: string): string {
  return `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

export class AuthService {
  private db: Database;
  private initialized = false;

  constructor(db: Database) {
    this.db = db;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    await run(
      this.db,
      `
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
      `
    );

    // Older installs: ensure verification columns exist even before migration 25 runs.
    const cols = await new Promise<Array<{ name: string }>>((resolve, reject) => {
      this.db.all('PRAGMA table_info(users)', [], (err, rows) =>
        err ? reject(err) : resolve((rows || []) as Array<{ name: string }>)
      );
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
    await run(
      this.db,
      'CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(email_verification_token)'
    );
  }

  private async issueVerificationToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
    await run(
      this.db,
      `UPDATE users
       SET email_verification_token = ?,
           email_verification_expires = ?,
           email_verified = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [token, expires, userId]
    );
    return token;
  }

  private async sendVerificationEmail(
    email: string,
    username: string,
    token: string
  ): Promise<{ emailSent: boolean; verifyUrl: string }> {
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

    if (!isEmailConfigured()) {
      logger.warn('SMTP not configured — verification email not sent', { email, verifyUrl });
      return { emailSent: false, verifyUrl };
    }

    const emailSent = await sendEmail({ to: email, subject, text });
    if (!emailSent) {
      logger.warn('Verification email failed to send', { email, verifyUrl });
    } else {
      logger.info('Verification email sent', { email });
    }
    return { emailSent, verifyUrl };
  }

  async register(username: string, email: string, password: string): Promise<{
    user: PublicUser;
    requiresVerification: true;
    emailSent: boolean;
    /** Included when the email could not be delivered so the UI can still show the link. */
    verifyUrl?: string;
  }> {
    const hash = await bcrypt.hash(password, env.bcrypt.rounds);

    let userId: number;
    try {
      userId = await new Promise<number>((resolve, reject) => {
        this.db.run(
          `INSERT INTO users (username, email, password_hash, email_verified)
           VALUES (?, ?, ?, 0)`,
          [username, email, hash],
          function (this: { lastID: number }, err: Error | null) {
            if (err) {
              if (err.message.includes('UNIQUE constraint failed')) {
                return reject(new Error('Username or email already exists'));
              }
              return reject(err);
            }
            resolve(this.lastID);
          }
        );
      });
    } catch (err) {
      throw err;
    }

    const token = await this.issueVerificationToken(userId);
    const { emailSent, verifyUrl } = await this.sendVerificationEmail(email, username, token);

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found after register');

    // Never auto-verify — account stays unverified until the email link is opened.
    return {
      user,
      requiresVerification: true,
      emailSent,
      // Always expose the link when mail failed so local testing isn't blocked.
      ...(!emailSent ? { verifyUrl } : {}),
    };
  }

  async login(email: string, password: string): Promise<{
    user: PublicUser;
    token: string;
  }> {
    const user = await get<User>(this.db, 'SELECT * FROM users WHERE email = ?', [email]);
    if (!user) throw new Error('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) throw new Error('Invalid credentials');

    if (!user.email_verified) {
      throw new Error('EMAIL_NOT_VERIFIED');
    }

    return {
      user: toPublicUser(user),
      token: signToken(user),
    };
  }

  async verifyEmailToken(token: string): Promise<{
    user: PublicUser;
    authToken: string;
  }> {
    if (!token || token.length < 16) {
      throw new Error('Invalid or expired verification link');
    }

    const user = await get<User>(
      this.db,
      'SELECT * FROM users WHERE email_verification_token = ?',
      [token]
    );
    if (!user) throw new Error('Invalid or expired verification link');

    if (
      user.email_verification_expires &&
      new Date(user.email_verification_expires).getTime() < Date.now()
    ) {
      throw new Error('Verification link has expired. Request a new one.');
    }

    await run(
      this.db,
      `UPDATE users
       SET email_verified = 1,
           email_verification_token = NULL,
           email_verification_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [user.id]
    );

    const updated = await this.getUserById(user.id);
    if (!updated) throw new Error('User not found');

    return {
      user: updated,
      authToken: signToken({ id: user.id, email: user.email, username: user.username }),
    };
  }

  async resendVerificationEmail(email: string): Promise<{
    emailSent: boolean;
    verifyUrl?: string;
  }> {
    const user = await get<User>(this.db, 'SELECT * FROM users WHERE email = ?', [email]);
    // Don't reveal whether the email exists
    if (!user) {
      return { emailSent: true };
    }
    if (user.email_verified) {
      return { emailSent: true };
    }

    const token = await this.issueVerificationToken(user.id);
    const { emailSent, verifyUrl } = await this.sendVerificationEmail(
      user.email,
      user.username,
      token
    );
    return {
      emailSent,
      ...(!emailSent ? { verifyUrl } : {}),
    };
  }

  async getUserById(id: number): Promise<PublicUser | null> {
    const user = await get<User>(
      this.db,
      `SELECT id, username, email, email_verified, created_at, updated_at,
              password_hash, email_verification_token, email_verification_expires
       FROM users WHERE id = ?`,
      [id]
    );
    if (!user) return null;
    return toPublicUser(user);
  }

  async updateUser(
    id: number,
    updates: { username?: string; email?: string }
  ): Promise<PublicUser> {
    const fields: string[] = [];
    const values: unknown[] = [];

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
    } catch (err: any) {
      if (err?.message?.includes('UNIQUE constraint failed')) {
        throw new Error('Username or email already exists');
      }
      throw err;
    }

    if (updates.email) {
      const user = await get<User>(this.db, 'SELECT * FROM users WHERE id = ?', [id]);
      if (user) {
        const token = await this.issueVerificationToken(id);
        await this.sendVerificationEmail(updates.email, user.username, token);
      }
    }

    const user = await this.getUserById(id);
    if (!user) throw new Error('User not found');
    return user;
  }

  async changePassword(id: number, oldPassword: string, newPassword: string): Promise<void> {
    const row = await get<{ password_hash: string }>(
      this.db,
      'SELECT password_hash FROM users WHERE id = ?',
      [id]
    );
    if (!row) throw new Error('User not found');

    const isMatch = await bcrypt.compare(oldPassword, row.password_hash);
    if (!isMatch) throw new Error('Invalid current password');

    const hash = await bcrypt.hash(newPassword, env.bcrypt.rounds);
    await run(
      this.db,
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hash, id]
    );
  }
}
