import { redisClient } from './RedisClient';

const ANALYTICS_PREFIX = 'analytics';
const QUEUE_STATS_PREFIX = 'queue:stats';
const USER_PREFERENCES_PREFIX = 'user:preferences';
const PEAK_THRESHOLD = 20;
const PEAK_WINDOW_MS = 600000;

interface HourlyStats {
  hour: number;
  avgWaitTime: number;
  totalMatches: number;
  avgSkillDiff: number;
}

interface DayStats {
  dayOfWeek: number;
  avgWaitTime: number;
  totalMatches: number;
}

export class PredictiveAnalytics {
  async recordQueueEntry(userId: string): Promise<void> {
    const key = `${QUEUE_STATS_PREFIX}:current`;
    const entry = { userId, timestamp: Date.now() };
    await redisClient.zadd(key, Date.now(), entry);
  }

  async removeQueueEntry(userId: string): Promise<void> {
    const key = `${QUEUE_STATS_PREFIX}:current`;
    const entry = { userId, timestamp: Date.now() };
    await redisClient.zrem(key, entry);
  }

  async recordMatch(waitTimeSeconds: number, skillDiff: number): Promise<void> {
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();

    await this.recordHourlyStats(hour, waitTimeSeconds, skillDiff);
    await this.recordDayStats(dayOfWeek, waitTimeSeconds);

    await this.checkPeakTime();
  }

  private async recordHourlyStats(hour: number, waitTime: number, skillDiff: number): Promise<void> {
    const key = `${ANALYTICS_PREFIX}:hourly:${hour}`;
    const stats = await redisClient.get<{
      totalWaitTime: number;
      totalMatches: number;
      totalSkillDiff: number;
      count: number;
    }>(key);

    if (stats) {
      stats.totalWaitTime += waitTime;
      stats.totalMatches += 1;
      stats.totalSkillDiff += skillDiff;
      stats.count += 1;
      await redisClient.set(key, stats);
    } else {
      await redisClient.set(key, {
        totalWaitTime: waitTime,
        totalMatches: 1,
        totalSkillDiff: skillDiff,
        count: 1
      });
    }
  }

  private async recordDayStats(dayOfWeek: number, waitTime: number): Promise<void> {
    const key = `${ANALYTICS_PREFIX}:day:${dayOfWeek}`;
    const stats = await redisClient.get<{
      totalWaitTime: number;
      totalMatches: number;
      count: number;
    }>(key);

    if (stats) {
      stats.totalWaitTime += waitTime;
      stats.totalMatches += 1;
      stats.count += 1;
      await redisClient.set(key, stats);
    } else {
      await redisClient.set(key, {
        totalWaitTime: waitTime,
        totalMatches: 1,
        count: 1
      });
    }
  }

  async getBestTimeToQueue(userId: string): Promise<{
    suggestedHour: number;
    avgWaitTime: number;
    confidence: number;
  }> {
    const prefs = await this.getUserPreferences(userId);
    const now = new Date();
    let bestHour = now.getHours();
    let minAvgWait = Infinity;
    let confidence = 0;

    const hoursToCheck = prefs.preferredHours.length > 0
      ? prefs.preferredHours
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

    for (const hour of hoursToCheck) {
      const key = `${ANALYTICS_PREFIX}:hourly:${hour}`;
      const stats = await redisClient.get<{
        totalWaitTime: number;
        totalMatches: number;
        count: number;
      }>(key);

      if (stats && stats.count > 0) {
        const avgWait = stats.totalWaitTime / stats.count;
        if (avgWait < minAvgWait) {
          minAvgWait = avgWait;
          bestHour = hour;
          confidence = Math.min(stats.count / 50, 1);
        }
      }
    }

    return {
      suggestedHour: bestHour,
      avgWaitTime: minAvgWait,
      confidence
    };
  }

  async getHourlyStats(): Promise<HourlyStats[]> {
    const stats: HourlyStats[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const key = `${ANALYTICS_PREFIX}:hourly:${hour}`;
      const data = await redisClient.get<{
        totalWaitTime: number;
        totalMatches: number;
        totalSkillDiff: number;
        count: number;
      }>(key);

      stats.push({
        hour,
        avgWaitTime: data ? data.totalWaitTime / (data.count || 1) : 0,
        totalMatches: data?.totalMatches || 0,
        avgSkillDiff: data ? data.totalSkillDiff / (data.count || 1) : 0
      });
    }

    return stats;
  }

  async getDayStats(): Promise<DayStats[]> {
    const stats: DayStats[] = [];

    for (let day = 0; day < 7; day++) {
      const key = `${ANALYTICS_PREFIX}:day:${day}`;
      const data = await redisClient.get<{
        totalWaitTime: number;
        totalMatches: number;
        count: number;
      }>(key);

      stats.push({
        dayOfWeek: day,
        avgWaitTime: data ? data.totalWaitTime / (data.count || 1) : 0,
        totalMatches: data?.totalMatches || 0
      });
    }

    return stats;
  }

  async checkPeakTime(): Promise<{ isPeak: boolean; queueSize: number }> {
    const key = `${QUEUE_STATS_PREFIX}:current`;
    const cutoff = Date.now() - PEAK_WINDOW_MS;

    await redisClient.zremrangebyscore(key, 0, cutoff);

    const currentQueue = await redisClient.zcard(key);

    return {
      isPeak: currentQueue > PEAK_THRESHOLD,
      queueSize: currentQueue
    };
  }

  private async getUserPreferences(userId: string): Promise<{
    preferredHours: number[];
    preferredDays: number[];
  }> {
    const key = `${USER_PREFERENCES_PREFIX}:${userId}`;
    const prefs = await redisClient.get<{
      preferredHours: number[];
      preferredDays: number[];
    }>(key);

    return prefs || { preferredHours: [], preferredDays: [] };
  }

  async setUserPreferences(
    userId: string,
    preferences: {
      preferredHours: number[];
      preferredDays: number[];
    }
  ): Promise<void> {
    const key = `${USER_PREFERENCES_PREFIX}:${userId}`;
    await redisClient.set(key, preferences);
  }
}

export const predictiveAnalytics = new PredictiveAnalytics();