import Redis from 'ioredis';

const inMemoryStore = new Map<string, { value: string; expiry?: number }>();

const inMemory = {
  setex: async (key: string, ttl: number, value: string) => {
    inMemoryStore.set(key, { value, expiry: Date.now() + ttl * 1000 });
  },
  get: async (key: string) => {
    const item = inMemoryStore.get(key);
    if (!item) return null;
    if (item.expiry && item.expiry < Date.now()) {
      inMemoryStore.delete(key);
      return null;
    }
    return item.value;
  },
  del: async (key: string) => inMemoryStore.delete(key) ? 1 : 0,
  set: async (key: string, value: string) => inMemoryStore.set(key, { value }),
  keys: async () => Array.from(inMemoryStore.keys()),
  ping: async () => 'PONG',
  quit: async () => inMemoryStore.clear(),
};

export class RedisClient {
  private static instance: RedisClient;
  private client: Redis | typeof inMemory;
  private isInMemory: boolean = false;

  private constructor(redisUrl?: string) {
    if (!redisUrl) {
      console.log('No REDIS_URL, using in-memory store');
      this.client = inMemory;
      this.isInMemory = true;
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        retryStrategy: () => null,
        maxRetriesPerRequest: 1,
      });
      
      this.client.on('error', (err: Error) => {
        console.log('Redis error, using in-memory:', err.message);
        this.isInMemory = true;
        this.client = inMemory;
      });

      (this.client as Redis).connect().catch(() => {
        console.log('Redis unavailable, using in-memory');
        this.isInMemory = true;
        this.client = inMemory;
      });
    } catch {
      console.log('Redis unavailable, using in-memory');
      this.client = inMemory;
      this.isInMemory = true;
    }
  }

  static getInstance(redisUrl?: string): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient(redisUrl);
    }
    return RedisClient.instance;
  }

  async ping() {
    return this.client.ping();
  }

  async setex(key: string, ttl: number, value: unknown) {
    const serialized = JSON.stringify(value);
    return this.client.setex(key, ttl, serialized);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return this.client.set(key, serialized);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async keys(pattern?: string) {
    if (this.isInMemory) {
      if (!pattern) return inMemoryStore.keys();
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(inMemoryStore.keys()).filter(k => regex.test(k));
    }
    return (this.client as Redis).keys(pattern || '*');
  }

  async lpush(key: string, value: unknown) {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      const list = existing ? JSON.parse(existing) : [];
      list.unshift(JSON.stringify(value));
      inMemoryStore.set(key, { value: JSON.stringify(list) });
      return list.length;
    }
    return (this.client as Redis).lpush(key, JSON.stringify(value));
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      if (!existing) return [];
      const list = JSON.parse(existing);
      return list.slice(start, stop === -1 ? undefined : stop + 1) as T[];
    }
    const items = await (this.client as Redis).lrange(key, start, stop);
    return items.map(item => {
      try { return JSON.parse(item); } catch { return item; }
    }) as T[];
  }

  async ltrim(key: string, start: number, stop: number) {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      if (!existing) return;
      const list = JSON.parse(existing);
      const trimmed = stop === -1 ? list.slice(start) : list.slice(start, stop + 1);
      inMemoryStore.set(key, { value: JSON.stringify(trimmed) });
      return;
    }
    return (this.client as Redis).ltrim(key, start, stop);
  }

  async zadd(key: string, score: number, member: unknown) {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      const list: { score: number; member: string }[] = existing ? JSON.parse(existing) : [];
      const idx = list.findIndex(m => m.member === JSON.stringify(member));
      if (idx !== -1) list[idx] = { score, member: JSON.stringify(member) };
      else list.push({ score, member: JSON.stringify(member) });
      list.sort((a, b) => a.score - b.score);
      inMemoryStore.set(key, { value: JSON.stringify(list) });
      return 1;
    }
    return (this.client as Redis).zadd(key, score, JSON.stringify(member));
  }

  async zscore(key: string, member: unknown) {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      if (!existing) return null;
      const list: { score: number; member: string }[] = JSON.parse(existing);
      const found = list.find(m => m.member === JSON.stringify(member));
      return found ? String(found.score) : null;
    }
    return (this.client as Redis).zscore(key, JSON.stringify(member));
  }

  async zrem(key: string, ...members: unknown[]) {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      if (!existing) return 0;
      const list: { score: number; member: string }[] = JSON.parse(existing);
      const original = list.length;
      for (const m of members) {
        const idx = list.findIndex(x => x.member === JSON.stringify(m));
        if (idx !== -1) list.splice(idx, 1);
      }
      inMemoryStore.set(key, { value: JSON.stringify(list) });
      return original - list.length;
    }
    const args = members.map(m => JSON.stringify(m));
    return (this.client as Redis).zrem(key, ...args);
  }

  async zcard(key: string) {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      return existing ? JSON.parse(existing).length : 0;
    }
    return (this.client as Redis).zcard(key);
  }

  async zrevrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      if (!existing) return [];
      const list = JSON.parse(existing);
      const result = list.slice(start, stop === -1 ? undefined : stop + 1).reverse();
      return result.map((m: any) => {
        try { return JSON.parse(m.member || m); } catch { return m.member || m; }
      }) as T[];
    }
    const items = await (this.client as Redis).zrevrange(key, start, stop);
    return items.map(item => {
      try { return JSON.parse(item); } catch { return item; }
    }) as T[];
  }

  async zremrangebyscore(key: string, min: number, max: number) {
    if (this.isInMemory) {
      const existing = await inMemory.get(key);
      if (!existing) return 0;
      const list: { score: number; member: string }[] = JSON.parse(existing);
      const filtered = list.filter(m => m.score < min || m.score > max);
      inMemoryStore.set(key, { value: JSON.stringify(filtered) });
      return list.length - filtered.length;
    }
    return (this.client as Redis).zremrangebyscore(key, min, max);
  }

  async zrank(key: string, member: unknown) {
    const data = await this.zrevrange(key, 0, -1);
    const idx = data.findIndex((m: any) => JSON.stringify(m) === JSON.stringify(member));
    return idx === -1 ? null : idx;
  }

  async zrevrank(key: string, member: unknown) {
    const data = await this.zrevrange(key, 0, -1);
    const idx = data.findIndex((m: any) => JSON.stringify(m) === JSON.stringify(member));
    return idx === -1 ? null : idx;
  }

  async publish(channel: string, message: string) {
    if (this.isInMemory) {
      console.log(`[Pub] ${channel}: ${message}`);
      return 0;
    }
    return (this.client as Redis).publish(channel, message);
  }

  async getRaw(key: string) {
    return this.client.get(key);
  }

  async quit() {
    if (!this.isInMemory) {
      await (this.client as Redis).quit();
    } else {
      inMemoryStore.clear();
    }
  }
}

export const redisClient = RedisClient.getInstance(process.env.REDIS_URL);