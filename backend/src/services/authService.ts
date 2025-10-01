import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Database } from 'sqlite3';
import { env } from '../config/env';

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
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
    await new Promise<void>((resolve, reject) => {
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

    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
      `, (err) => (err ? reject(err) : resolve()));
    });

    await new Promise<void>((resolve, reject) => {
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
      `, (err) => (err ? reject(err) : resolve()));
    });
  }

  async register(username: string, email: string, password: string): Promise<{
    user: Omit<User, 'password_hash'>;
    token: string;
  }> {
    return new Promise((resolve, reject) => {
      // Hash password
      bcrypt.hash(password, env.bcrypt.rounds, (err, hash) => {
        if (err) return reject(err);

        // Insert user
        this.db.run(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
          [username, email, hash],
          function (this: any, err: Error | null) {
            if (err) {
              if (err.message.includes('UNIQUE constraint failed')) {
                return reject(new Error('Username or email already exists'));
              }
              return reject(err);
            }

            const userId = this.lastID;

            // Generate JWT
            const token = jwt.sign(
              { id: userId, email, username },
              env.jwt.secret,
              { expiresIn: env.jwt.expiresIn } as SignOptions
            );

            resolve({
              user: { id: userId, username, email, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              token,
            });
          }
        );
      });
    });
  }

  async login(email: string, password: string): Promise<{
    user: Omit<User, 'password_hash'>;
    token: string;
  }> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE email = ?',
        [email],
        (err: Error | null, user: User | undefined) => {
          if (err) return reject(err);
          if (!user) return reject(new Error('Invalid credentials'));

          // Compare password
          bcrypt.compare(password, user.password_hash, (err, isMatch) => {
            if (err) return reject(err);
            if (!isMatch) return reject(new Error('Invalid credentials'));

            // Generate JWT
            const token = jwt.sign(
              { id: user.id, email: user.email, username: user.username },
              env.jwt.secret,
              { expiresIn: env.jwt.expiresIn } as SignOptions
            );

            const { password_hash, ...userWithoutPassword } = user;

            resolve({
              user: userWithoutPassword,
              token,
            });
          });
        }
      );
    });
  }

  async getUserById(id: number): Promise<Omit<User, 'password_hash'> | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id, username, email, created_at, updated_at FROM users WHERE id = ?',
        [id],
        (err: Error | null, user: Omit<User, 'password_hash'> | undefined) => {
          if (err) return reject(err);
          resolve(user || null);
        }
      );
    });
  }

  async updateUser(
    id: number,
    updates: { username?: string; email?: string }
  ): Promise<Omit<User, 'password_hash'>> {
    return new Promise((resolve, reject) => {
      const fields: string[] = [];
      const values: any[] = [];

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

      this.db.run(query, values, (err: Error | null) => {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return reject(new Error('Username or email already exists'));
          }
          return reject(err);
        }

        this.getUserById(id)
          .then((user) => {
            if (!user) return reject(new Error('User not found'));
            resolve(user);
          })
          .catch(reject);
      });
    });
  }

  async changePassword(id: number, oldPassword: string, newPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT password_hash FROM users WHERE id = ?',
        [id],
        (err: Error | null, row: { password_hash: string } | undefined) => {
          if (err) return reject(err);
          if (!row) return reject(new Error('User not found'));

          bcrypt.compare(oldPassword, row.password_hash, (err, isMatch) => {
            if (err) return reject(err);
            if (!isMatch) return reject(new Error('Invalid current password'));

            bcrypt.hash(newPassword, env.bcrypt.rounds, (err, hash) => {
              if (err) return reject(err);

              this.db.run(
                'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [hash, id],
                (err: Error | null) => {
                  if (err) return reject(err);
                  resolve();
                }
              );
            });
          });
        }
      );
    });
  }
}

