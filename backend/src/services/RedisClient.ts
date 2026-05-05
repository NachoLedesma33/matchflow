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
  exists: async (key: string) => inMemoryStore.has(key) ? 1 : 0,
};

export class RedisClient {
  private static instance: RedisClient;
  private client: typeof inMemory;
  private isInMemory: boolean = true;

  private constructor(_redisUrl?: string) {
    console.log('Using in-memory store');
    this.client = inMemory;
    this.isInMemory = true;
  }

  static getInstance(_redisUrl?: string): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient(_redisUrl);
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
    if (!pattern) return Array.from(inMemoryStore.keys());
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(inMemoryStore.keys()).filter(k => regex.test(k));
  }

  async exists(key: string) {
    return this.client.exists(key);
  }

  async lpush(key: string, value: unknown) {
    const existing = await inMemory.get(key);
    const list = existing ? JSON.parse(existing) : [];
    list.unshift(JSON.stringify(value));
    inMemoryStore.set(key, { value: JSON.stringify(list) });
    return list.length;
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const existing = await inMemory.get(key);
    if (!existing) return [];
    const list = JSON.parse(existing);
    return list.slice(start, stop === -1 ? undefined : stop + 1) as T[];
  }

  async ltrim(key: string, start: number, stop: number) {
    const existing = await inMemory.get(key);
    if (!existing) return;
    const list = JSON.parse(existing);
    const trimmed = stop === -1 ? list.slice(start) : list.slice(start, stop + 1);
    inMemoryStore.set(key, { value: JSON.stringify(trimmed) });
    return;
  }

  async zadd(key: string, score: number, member: unknown) {
    const existing = await inMemory.get(key);
    const list: { score: number; member: string }[] = existing ? JSON.parse(existing) : [];
    const idx = list.findIndex(m => m.member === JSON.stringify(member));
    if (idx !== -1) list[idx] = { score, member: JSON.stringify(member) };
    else list.push({ score, member: JSON.stringify(member) });
    list.sort((a, b) => a.score - b.score);
    inMemoryStore.set(key, { value: JSON.stringify(list) });
    return 1;
  }

  async zscore(key: string, member: unknown) {
    const existing = await inMemory.get(key);
    if (!existing) return null;
    const list: { score: number; member: string }[] = JSON.parse(existing);
    const found = list.find(m => m.member === JSON.stringify(member));
    return found ? String(found.score) : null;
  }

  async zrem(key: string, ...members: unknown[]) {
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

  async zcard(key: string) {
    const existing = await inMemory.get(key);
    return existing ? JSON.parse(existing).length : 0;
  }

  async zrevrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const existing = await inMemory.get(key);
    if (!existing) return [];
    const list = JSON.parse(existing);
    const result = list.slice(start, stop === -1 ? undefined : stop + 1).reverse();
    return result.map((m: any) => {
      try { return JSON.parse(m.member || m); } catch { return m.member || m; }
    }) as T[];
  }

  async zremrangebyscore(key: string, min: number, max: number) {
    const existing = await inMemory.get(key);
    if (!existing) return 0;
    const list: { score: number; member: string }[] = JSON.parse(existing);
    const filtered = list.filter(m => m.score < min || m.score > max);
    inMemoryStore.set(key, { value: JSON.stringify(filtered) });
    return list.length - filtered.length;
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
    console.log(`[Pub] ${channel}: ${message}`);
    return 0;
  }

  async getRaw(key: string) {
    return this.client.get(key);
  }

  async quit() {
    inMemoryStore.clear();
  }
}

export const redisClient = RedisClient.getInstance();