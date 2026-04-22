import Redis from 'ioredis';

export class RedisClient {
  private static instance: RedisClient;
  private client: Redis;
  private readonly DEFAULT_TTL = 30;

  private constructor(redisUrl?: string) {
    this.client = redisUrl ? new Redis(redisUrl) : new Redis();

    this.client.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis connected');
    });
  }

  static getInstance(redisUrl?: string): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient(redisUrl);
    }
    return RedisClient.instance;
  }

  async setex(key: string, ttl: number, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.client.setex(key, ttl, serialized);
  }

  async set(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.client.set(key, serialized);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  async getRaw(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.client.expire(key, ttl);
  }

  async sadd<T>(key: string, ...members: T[]): Promise<number> {
    const serialized = members.map(m => JSON.stringify(m));
    return this.client.sadd(key, ...serialized);
  }

  async smembers<T>(key: string): Promise<T[]> {
    const members = await this.client.smembers(key);
    return members.map(m => JSON.parse(m) as T);
  }

  async srem<T>(key: string, ...members: T[]): Promise<number> {
    const serialized = members.map(m => JSON.stringify(m));
    return this.client.srem(key, ...serialized);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async zadd(key: string, score: number, member: unknown): Promise<number> {
    const serialized = JSON.stringify(member);
    return this.client.zadd(key, score, serialized);
  }

  async zrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const members = await this.client.zrange(key, start, stop);
    return members.map(m => JSON.parse(m) as T);
  }

  async zrevrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const members = await this.client.zrevrange(key, start, stop);
    return members.map(m => JSON.parse(m) as T);
  }

  async zscore(key: string, member: unknown): Promise<number | null> {
    const serialized = JSON.stringify(member);
    return this.client.zscore(key, serialized);
  }

  async zrem(key: string, ...members: unknown[]): Promise<number> {
    const serialized = members.map(m => JSON.stringify(m));
    return this.client.zrem(key, ...serialized);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async zrank(key: string, member: unknown): Promise<number | null> {
    const serialized = JSON.stringify(member);
    return this.client.zrank(key, serialized);
  }

  async zrevrank(key: string, member: unknown): Promise<number | null> {
    const serialized = JSON.stringify(member);
    return this.client.zrevrank(key, serialized);
  }

  async lpush<T>(key: string, ...values: T[]): Promise<number> {
    const serialized = values.map(v => JSON.stringify(v));
    return this.client.lpush(key, ...serialized);
  }

  async rpush<T>(key: string, ...values: T[]): Promise<number> {
    const serialized = values.map(v => JSON.stringify(v));
    return this.client.rpush(key, ...serialized);
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const values = await this.client.lrange(key, start, stop);
    return values.map(v => JSON.parse(v) as T);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.client.ltrim(key, start, stop);
  }

  async llen(key: string): Promise<number> {
    return this.client.llen(key);
  }

  async hset(key: string, field: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.client.hset(key, field, serialized);
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    const value = await this.client.hget(key, field);
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const raw = await this.client.hgetall(key);
    const result: Record<string, T> = {};
    for (const [field, value] of Object.entries(raw)) {
      result[field] = JSON.parse(value) as T;
    }
    return result;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async flushdb(): Promise<void> {
    await this.client.flushdb();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async publish(channel: string, message: unknown): Promise<number> {
    const serialized = JSON.stringify(message);
    return this.client.publish(channel, serialized);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.client.duplicate();
    await subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}

export const redisClient = RedisClient.getInstance();