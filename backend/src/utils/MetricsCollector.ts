import { RedisClient } from '../services/RedisClient';
import { MatchMode } from '../types';

const METRICS_PREFIX = 'metrics';

interface MinuteMetrics {
  mode: MatchMode;
  totalMatches: number;
  totalWaitTime: number;
  totalScores: number;
  scoreSquaredSum: number;
  accepted: number;
  rejected: number;
  timestamp: number;
}

export class MetricsCollector {
  private redis: RedisClient;
  private interval: NodeJS.Timeout | null = null;

  constructor(redisUrl?: string) {
    this.redis = RedisClient.getInstance(redisUrl);
  }

  async recordMatch(
    mode: MatchMode,
    waitTimeSeconds: number,
    score: number,
    accepted: boolean
  ): Promise<void> {
    const minuteKey = this.getMinuteKey(mode);
    const metrics = await this.redis.get<MinuteMetrics>(minuteKey);

    if (metrics) {
      metrics.totalMatches += 1;
      metrics.totalWaitTime += waitTimeSeconds;
      metrics.totalScores += score;
      metrics.scoreSquaredSum += score * score;
      if (accepted) metrics.accepted += 1;
      else metrics.rejected += 1;
      await this.redis.set(minuteKey, metrics);
    } else {
      await this.redis.set(minuteKey, {
        mode,
        totalMatches: 1,
        totalWaitTime: waitTimeSeconds,
        totalScores: score,
        scoreSquaredSum: score * score,
        accepted: accepted ? 1 : 0,
        rejected: accepted ? 0 : 1,
        timestamp: Date.now(),
      });
    }
  }

  async getAverageWaitTime(mode: MatchMode, minutes: number = 5): Promise<number> {
    const metricsList = await this.getRecentMetrics(mode, minutes);
    if (metricsList.length === 0) return 0;

    const totalWait = metricsList.reduce((sum, m) => sum + m.totalWaitTime, 0);
    const totalMatches = metricsList.reduce((sum, m) => sum + m.totalMatches, 0);

    return totalMatches > 0 ? totalWait / totalMatches : 0;
  }

  async getScoreStandardDeviation(mode: MatchMode, minutes: number = 5): Promise<number> {
    const metricsList = await this.getRecentMetrics(mode, minutes);
    if (metricsList.length === 0) return 0;

    const totalScores = metricsList.reduce((sum, m) => sum + m.totalScores, 0);
    const totalMatches = metricsList.reduce((sum, m) => sum + m.totalMatches, 0);
    const scoreSquaredSum = metricsList.reduce((sum, m) => sum + m.scoreSquaredSum, 0);

    if (totalMatches <= 1) return 0;

    const mean = totalScores / totalMatches;
    const variance = (scoreSquaredSum / totalMatches) - (mean * mean);
    return Math.sqrt(Math.max(0, variance));
  }

  async getAcceptanceRate(mode: MatchMode, minutes: number = 5): Promise<number> {
    const metricsList = await this.getRecentMetrics(mode, minutes);
    if (metricsList.length === 0) return 100;

    const accepted = metricsList.reduce((sum, m) => sum + m.accepted, 0);
    const rejected = metricsList.reduce((sum, m) => sum + m.rejected, 0);
    const total = accepted + rejected;

    return total > 0 ? (accepted / total) * 100 : 100;
  }

  async getAllMetrics(mode?: MatchMode): Promise<{
    mode: MatchMode;
    avgWaitTime: number;
    scoreStdDev: number;
    acceptanceRate: number;
    totalMatches: number;
  }[]> {
    const modes: MatchMode[] = mode ? [mode] : ['fast', 'precise', 'mixed'];
    const result = [];

    for (const m of modes) {
      result.push({
        mode: m,
        avgWaitTime: await this.getAverageWaitTime(m),
        scoreStdDev: await this.getScoreStandardDeviation(m),
        acceptanceRate: await this.getAcceptanceRate(m),
        totalMatches: await this.getTotalMatches(m),
      });
    }

    return result;
  }

  formatPrometheus(): string {
    this.getAllMetrics().then(metrics => {
      let output = '';
      for (const m of metrics) {
        output += `# TYPE matchflow_avg_wait_time gauge\n`;
        output += `matchflow_avg_wait_time{mode="${m.mode}"} ${m.avgWaitTime}\n`;
        output += `# TYPE matchflow_score_std_dev gauge\n`;
        output += `matchflow_score_std_dev{mode="${m.mode}"} ${m.scoreStdDev}\n`;
        output += `# TYPE matchflow_acceptance_rate gauge\n`;
        output += `matchflow_acceptance_rate{mode="${m.mode}"} ${m.acceptanceRate}\n`;
        output += `# TYPE matchflow_total_matches gauge\n`;
        output += `matchflow_total_matches{mode="${m.mode}"} ${m.totalMatches}\n`;
      }
      return output;
    });
    return '';
  }

  async cleanupOldMetrics(): Promise<void> {
    const keys = await this.redis.keys(`${METRICS_PREFIX}:*:minute:*`);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    for (const key of keys) {
      const metrics = await this.redis.get<MinuteMetrics>(key);
      if (metrics && metrics.timestamp < cutoff) {
        await this.redis.del(key);
      }
    }
  }

  startAutoCleanup(intervalHours: number = 24): void {
    this.interval = setInterval(() => {
      this.cleanupOldMetrics();
    }, intervalHours * 60 * 60 * 1000);
  }

  stopAutoCleanup(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async getRecentMetrics(mode: MatchMode, minutes: number): Promise<MinuteMetrics[]> {
    const metrics: MinuteMetrics[] = [];
    const now = Date.now();
    const cutoff = now - minutes * 60 * 1000;

    for (let i = 0; i < minutes; i++) {
      const key = `${METRICS_PREFIX}:${mode}:minute:${Math.floor((now - i * 60000) / 60000)}`;
      const m = await this.redis.get<MinuteMetrics>(key);
      if (m && m.timestamp >= cutoff) {
        metrics.push(m);
      }
    }

    return metrics;
  }

  private async getTotalMatches(mode: MatchMode): Promise<number> {
    const metricsList = await this.getRecentMetrics(mode, 60);
    return metricsList.reduce((sum, m) => sum + m.totalMatches, 0);
  }

  private getMinuteKey(mode: MatchMode): string {
    const minute = Math.floor(Date.now() / 60000);
    return `${METRICS_PREFIX}:${mode}:minute:${minute}`;
  }
}

export const metricsCollector = new MetricsCollector();