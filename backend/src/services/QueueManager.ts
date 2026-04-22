import Redis from 'ioredis';
import { QueueEntry, MatchMode, TeamSize } from '../types';

export class QueueManager {
  private redis: Redis;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly QUEUE_PREFIX = 'queue';
  private readonly PRIORITY_INTERVAL = 10000;
  private readonly MAX_PRIORITY_BONUS = 0.5;
  private readonly PRIORITY_INCREMENT = 0.02;

  constructor(redisUrl?: string) {
    this.redis = redisUrl ? new Redis(redisUrl) : new Redis();
  }

  async addToQueue(userId: string, entry: QueueEntry): Promise<void> {
    const key = this.getQueueKey(entry.teamMembers ? 'group' : 'solo', entry.teamMembers?.length || 1);
    const scoredEntry = {
      ...entry,
      priorityBonus: Math.min(entry.priorityBonus, this.MAX_PRIORITY_BONUS)
    };
    await this.redis.zadd(key, scoredEntry.priorityBonus, JSON.stringify(scoredEntry));

    if (entry.teamMembers) {
      for (const memberId of entry.teamMembers) {
        await this.redis.set(`${this.QUEUE_PREFIX}:user:${memberId}`, key);
      }
    }
    await this.redis.set(`${this.QUEUE_PREFIX}:user:${userId}`, key);
    await this.redis.zadd(`${this.QUEUE_PREFIX}:ts:${key}`, Date.now(), userId);
  }

  async removeFromQueue(userId: string): Promise<QueueEntry | null> {
    const key = await this.redis.get(`${this.QUEUE_PREFIX}:user:${userId}`);
    if (!key) return null;

    const entryData = await this.redis.zscore(key, userId);
    if (!entryData) return null;

    const entry = JSON.parse(entryData) as QueueEntry;
    await this.redis.zrem(key, userId);
    await this.redis.del(`${this.QUEUE_PREFIX}:user:${userId}`);
    await this.redis.zrem(`${this.QUEUE_PREFIX}:ts:${key}`, userId);

    return entry;
  }

  async getQueueSize(mode: MatchMode, teamSize: TeamSize): Promise<number> {
    const key = this.getQueueKey(mode, teamSize);
    return this.redis.zcard(key);
  }

  async getWaitingTime(userId: string): Promise<number | null> {
    const timestamp = await this.redis.zscore(`${this.QUEUE_PREFIX}:ts:*`, userId);
    if (!timestamp) return null;
    return (Date.now() - parseInt(timestamp)) / 1000;
  }

  async getCandidates(mode: MatchMode, teamSize: TeamSize, limit: number = 50): Promise<QueueEntry[]> {
    const key = this.getQueueKey(mode, teamSize);
    const entries = await this.redis.zrevrange(key, 0, limit - 1);
    return entries.map(e => JSON.parse(e) as QueueEntry);
  }

  async getAllQueues(): Promise<{ mode: MatchMode; teamSize: TeamSize; count: number }[]> {
    const modes: MatchMode[] = ['fast', 'precise', 'mixed'];
    const sizes: TeamSize[] = [1, 2, 3];
    const result: { mode: MatchMode; teamSize: TeamSize; count: number }[] = [];

    for (const mode of modes) {
      for (const size of sizes) {
        const count = await this.getQueueSize(mode, size);
        result.push({ mode, teamSize: size, count });
      }
    }
    return result;
  }

  startHeartbeat(interval: number = this.PRIORITY_INTERVAL): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      await this.updatePriorities();
    }, interval);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async updatePriorities(): Promise<void> {
    const modes: MatchMode[] = ['fast', 'precise', 'mixed'];
    const sizes: TeamSize[] = [1, 2, 3];

    for (const mode of modes) {
      for (const size of sizes) {
        const key = this.getQueueKey(mode, size);
        const entries = await this.redis.zrange(key, 0, -1);

        for (const entryData of entries) {
          const entry = JSON.parse(entryData) as QueueEntry;
          const newBonus = Math.min(entry.priorityBonus + this.PRIORITY_INCREMENT, this.MAX_PRIORITY_BONUS);
          entry.priorityBonus = newBonus;
          await this.redis.zadd(key, newBonus, JSON.stringify(entry));
        }
      }
    }
  }

  private getQueueKey(mode: MatchMode, teamSize: TeamSize): string {
    return `${this.QUEUE_PREFIX}:${mode}:${teamSize}`;
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    await this.redis.quit();
  }
}