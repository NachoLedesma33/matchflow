import { Feedback } from '../types';
import { redisClient } from './RedisClient';
import { GlickoSimplified } from '../algorithms/GlickoSimplified';

const USER_REP_PREFIX = 'user:reputation';
const FEEDBACK_HISTORY_PREFIX = 'feedback:history';
const QUEUE_REPLAY_PREFIX = 'queue:replay';
const USER_PROFILE_PREFIX = 'user:profile';
const REPORT_THRESHOLD = 3;
const TOXICITY_PENALTY = 10;
const MIN_REPUTATION = 0;
const MAX_REPUTATION = 100;

export class FeedbackProcessor {
  async processFeedback(feedback: Feedback): Promise<{ updatedReputation: number; alert?: string; ratingChange?: number }> {
    const matchKey = `match:${feedback.matchId}`;
    const match = await redisClient.get<{ players: string[]; teamAssignment?: { teamId: number; players: string[] }[] }>(matchKey);

    if (!match) {
      throw new Error('Match not found');
    }

    const userId = feedback.userId || 'unknown';
    let ratingChange = 0;

    if (feedback.result) {
      ratingChange = await this.updateSkillRating(userId, feedback.result, match);
    }

    const otherPlayers = match.players.filter(p => p !== userId);

    for (const playerId of otherPlayers) {
      await this.updateReputation(playerId, feedback.rating);

      if (feedback.report && feedback.report.toLowerCase().includes('toxic')) {
        await this.handleReport(playerId);
      }
    }

    if (feedback.wouldPlayAgain) {
      await this.handleReplay(match.players, otherPlayers[0]);
    }

    await this.saveFeedback(feedback);

    const finalReputation = otherPlayers.length > 0
      ? await this.getReputation(otherPlayers[0])
      : 50;

    return { updatedReputation: finalReputation, ratingChange };
  }

  private async updateSkillRating(userId: string, result: 'win' | 'loss' | 'draw', match: { players: string[]; teamAssignment?: { teamId: number; players: string[] }[] }): Promise<number> {
    const profileKey = `${USER_PROFILE_PREFIX}:${userId}`;
    const profile = await redisClient.get<{ skillRating: { rating: number; rd: number; volatility: number } }>(profileKey);

    const currentRating = profile?.skillRating || { rating: 1500, rd: 200, volatility: 0.06 };
    
    const opponentRatings = match.players
      .filter(p => p !== userId)
      .map(async (opponentId) => {
        const oppProfile = await redisClient.get<{ skillRating: { rating: number; rd: number } }>(`${USER_PROFILE_PREFIX}:${opponentId}`);
        return oppProfile?.skillRating || { rating: 1500, rd: 200 };
      });

    const opponents = await Promise.all(opponentRatings);
    const numericResult = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5;

    const updatedRating = GlickoSimplified.calculateMultipleMatches(
      currentRating,
      opponents.map(o => ({ rating: o.rating, rd: o.rd })),
      opponents.map(() => numericResult)
    );

    await redisClient.setex(profileKey, 86400 * 30, {
      ...profile,
      skillRating: updatedRating
    });

    return updatedRating.rating - currentRating.rating;
  }

  private async updateReputation(userId: string, rating: number): Promise<void> {
    const key = `${USER_REP_PREFIX}:${userId}`;
    const history = await redisClient.lrange<{ rating: number; timestamp: number }>(key, 0, 9);

    const newEntry = { rating, timestamp: Date.now() };
    await redisClient.lpush(key, newEntry);
    await redisClient.ltrim(key, 0, 9);

    const ratings = [newEntry, ...history].map(e => e.rating);
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

    const reputation = Math.round(mapRange(avgRating, 1, 5, MIN_REPUTATION, MAX_REPUTATION));

    await redisClient.set(key, { reputation, lastUpdated: Date.now() });
  }

  private async handleReport(playerId: string): Promise<void> {
    const key = `${USER_REP_PREFIX}:${playerId}`;
    const current = await redisClient.get<{ reputation: number }>(key);

    const currentRep = current?.reputation || 50;
    const newRep = Math.max(MIN_REPUTATION, currentRep - TOXICITY_PENALTY);

    await redisClient.set(key, { reputation: newRep, lastUpdated: Date.now() });

    console.log(`Alert: User ${playerId} reported as toxic. Reputation reduced to ${newRep}`);
  }

  private async handleReplay(userIds: string[], opponentId: string): Promise<void> {
    for (const userId of userIds) {
      const key = `${QUEUE_REPLAY_PREFIX}:${userId}`;
      const existing = await redisClient.get<string[]>(key);

      if (!existing) {
        await redisClient.set(key, [opponentId]);
      } else if (!existing.includes(opponentId)) {
        existing.push(opponentId);
        await redisClient.set(key, existing);

        if (existing.length >= 2) {
          await this.createDirectMatch(existing);
        }
      }
    }
  }

  private async createDirectMatch(userIds: string[]): Promise<void> {
    console.log(`Creating direct match for users: ${userIds.join(', ')}`);

    await redisClient.del(`${QUEUE_REPLAY_PREFIX}:${userIds[0]}`);
    await redisClient.del(`${QUEUE_REPLAY_PREFIX}:${userIds[1]}`);
  }

  private async saveFeedback(feedback: Feedback): Promise<void> {
    const key = `${FEEDBACK_HISTORY_PREFIX}:${feedback.matchId}`;
    await redisClient.setex(key, 86400 * 30, feedback);
  }

  async getReputation(userId: string): Promise<number> {
    const key = `${USER_REP_PREFIX}:${userId}`;
    const data = await redisClient.get<{ reputation: number }>(key);
    return data?.reputation || 50;
  }

  async getFeedbackHistory(userId: string, limit: number = 10): Promise<Feedback[]> {
    const keys = await redisClient.keys(`${FEEDBACK_HISTORY_PREFIX}:*`);
    const feedbackList: Feedback[] = [];

    const keyArray = Array.from(keys).slice(0, limit);
    for (const key of keyArray) {
      const feedback = await redisClient.get<Feedback>(key);
      if (feedback) {
        feedbackList.push(feedback);
      }
    }

    return feedbackList;
  }

  async getReplayQueue(userId: string): Promise<string[]> {
    const key = `${QUEUE_REPLAY_PREFIX}:${userId}`;
    return redisClient.get<string[]>(key) || [];
  }
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

export const feedbackProcessor = new FeedbackProcessor();