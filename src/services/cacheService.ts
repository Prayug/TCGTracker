interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  lastAccessed: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000;
  private readonly MAX_ENTRIES = 500;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        this.clearExpired();
      }, 2 * 60 * 1000);
    }
  }

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictLRU();
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      lastAccessed: Date.now(),
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const isExpired = now - entry.timestamp > entry.ttl;

    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    entry.lastAccessed = now;
    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) return false;

    const now = Date.now();
    const isExpired = now - entry.timestamp > entry.ttl;

    if (isExpired) {
      this.cache.delete(key);
      return false;
    }

    entry.lastAccessed = now;
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  size(): number {
    return this.cache.size;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  private evictLRU(): void {
    let oldest = Infinity;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldest) {
        oldest = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

export const cacheService = new CacheService();
