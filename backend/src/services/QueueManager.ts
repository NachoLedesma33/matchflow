import { QueueEntry, MatchMode, TeamSize } from '../types';

interface InMemoryQueue {
  data: Map<string, { score: number; value: string }[]>;
  userKeys: Map<string, string>;
  timestamps: Map<string, number>;
}

export class QueueManager {
  private inMemory: InMemoryQueue;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly QUEUE_PREFIX = 'queue';
  private readonly PRIORITY_INTERVAL = 10000;
  private readonly MAX_PRIORITY_BONUS = 0.5;
  private readonly PRIORITY_INCREMENT = 0.02;

  constructor(_redisUrl?: string) {
    this.inMemory = {
      data: new Map(),
      userKeys: new Map(),
      timestamps: new Map()
    };
  }

  async addToQueue(userId: string, entry: QueueEntry): Promise<void> {
    const mode: MatchMode = entry.teamMembers ? 'ranked-flex' : 'ranked-solo';
    const key = `${this.QUEUE_PREFIX}:${mode}:${entry.teamMembers?.length || 1}`;
    const scoredEntry = {
      ...entry,
      priorityBonus: Math.min(entry.priorityBonus, this.MAX_PRIORITY_BONUS)
    };

    const queue = this.inMemory.data.get(key) || [];
    queue.push({ score: scoredEntry.priorityBonus, value: JSON.stringify(scoredEntry) });
    queue.sort((a, b) => b.score - a.score);
    this.inMemory.data.set(key, queue);
    
    this.inMemory.userKeys.set(userId, key);
    this.inMemory.timestamps.set(`${key}:${userId}`, Date.now());
  }

  async removeFromQueue(userId: string): Promise<QueueEntry | null> {
    const key = this.inMemory.userKeys.get(userId);
    if (!key) return null;

    const queue = this.inMemory.data.get(key) || [];
    const idx = queue.findIndex(q => JSON.parse(q.value).userId === userId);
    if (idx === -1) return null;

    const entry = JSON.parse(queue[idx].value) as QueueEntry;
    queue.splice(idx, 1);
    this.inMemory.data.set(key, queue);
    this.inMemory.userKeys.delete(userId);
    this.inMemory.timestamps.delete(`${key}:${userId}`);

    return entry;
  }

  async getQueueSize(mode: MatchMode, teamSize: TeamSize): Promise<number> {
    const key = `${this.QUEUE_PREFIX}:${mode}:${teamSize}`;
    return (this.inMemory.data.get(key) || []).length;
  }

  async getWaitingTime(userId: string): Promise<number | null> {
    const key = this.inMemory.userKeys.get(userId);
    if (!key) return null;
    const timestamp = this.inMemory.timestamps.get(`${key}:${userId}`);
    if (!timestamp) return null;
    return (Date.now() - timestamp) / 1000;
  }

  async getCandidates(mode: MatchMode, teamSize: TeamSize, limit: number = 50): Promise<QueueEntry[]> {
    const key = `${this.QUEUE_PREFIX}:${mode}:${teamSize}`;
    const queue = this.inMemory.data.get(key) || [];
    return queue.slice(0, limit).map(q => JSON.parse(q.value) as QueueEntry);
  }

  async getAllQueues(): Promise<{ mode: MatchMode; teamSize: TeamSize; count: number }[]> {
    const modes: MatchMode[] = ['ranked-solo', 'ranked-flex', 'casual', 'tournament'];
    const sizes: TeamSize[] = [1, 2, 3, 4, 5];
    const result: { mode: MatchMode; teamSize: TeamSize; count: number }[] = [];

    for (const mode of modes) {
      for (const size of sizes) {
        const count = await this.getQueueSize(mode, size as TeamSize);
        if (count > 0) {
          result.push({ mode, teamSize: size as TeamSize, count });
        }
      }
    }

    return result;
  }

  private getQueueKey(mode: MatchMode, teamSize: TeamSize): string {
    return `${this.QUEUE_PREFIX}:${mode}:${teamSize}`;
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
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
    const now = Date.now();
    for (const [key, queue] of this.inMemory.data) {
      for (const item of queue) {
        const entry = JSON.parse(item.value) as QueueEntry;
        const waitTime = now - entry.timestamp;
        const bonus = Math.min(waitTime / 60000 * this.PRIORITY_INCREMENT, this.MAX_PRIORITY_BONUS);
        item.score = entry.priorityBonus + bonus;
      }
      queue.sort((a, b) => b.score - a.score);
    }
  }
}