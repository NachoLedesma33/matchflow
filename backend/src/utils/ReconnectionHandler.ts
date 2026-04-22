import { Server } from 'socket.io';
import { QueueEntry, MatchResult, MatchMode, TeamSize } from '../types';
import { redisClient } from '../services/RedisClient';

const QUEUE_KEY_PREFIX = 'queue';
const USER_STATE_PREFIX = 'user:state';
const PENDING_MATCH_PREFIX = 'match:pending';
const STATE_TTL = 30;

interface UserState {
  userId: string;
  socketId: string;
  mode: MatchMode;
  teamSize: TeamSize;
  queueEntry: QueueEntry;
  timestamp: number;
}

export class ReconnectionHandler {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  async handleReconnect(userId: string, socketId: string): Promise<void> {
    const state = await this.getUserState(userId);
    if (!state) {
      console.log(`No state found for user ${userId}`);
      return;
    }

    await this.restoreQueuePosition(userId, state);

    await this.checkPendingMatch(userId, socketId);

    await this.cleanup(userId);
  }

  private async getUserState(userId: string): Promise<UserState | null> {
    const key = `${USER_STATE_PREFIX}:${userId}`;
    return redisClient.get<UserState>(key);
  }

  private async restoreQueuePosition(userId: string, state: UserState): Promise<void> {
    const queueKey = `${QUEUE_KEY_PREFIX}:${state.mode}:${state.teamSize}`;

    const existingEntry = await redisClient.getRaw(`${queueKey}:${userId}`);
    if (existingEntry) {
      const priority = await redisClient.zscore(queueKey, existingEntry);
      if (priority !== null) {
        const position = await redisClient.zrank(queueKey, existingEntry);
        this.io.emit('queue-restored', {
          userId,
          position: position !== null ? position + 1 : 1,
          priorityBonus: state.queueEntry.priorityBonus,
          timestamp: state.queueEntry.timestamp,
          mode: state.mode,
          teamSize: state.teamSize
        });
        console.log(`Restored queue position for user ${userId}: ${position}`);
        return;
      }
    }

    await redisClient.zadd(queueKey, state.queueEntry.priorityBonus, state.queueEntry);
    await redisClient.setex(
      `${USER_STATE_PREFIX}:${userId}`,
      STATE_TTL,
      state
    );

    const position = await redisClient.zrevrank(queueKey, state.queueEntry);
    this.io.emit('queue-restored', {
      userId,
      position: position !== null ? position + 1 : 1,
      priorityBonus: state.queueEntry.priorityBonus,
      timestamp: state.queueEntry.timestamp,
      mode: state.mode,
      teamSize: state.teamSize
    });

    console.log(`Restored user ${userId} to queue`);
  }

  private async checkPendingMatch(userId: string, socketId: string): Promise<void> {
    const matchKey = `${PENDING_MATCH_PREFIX}:${userId}`;
    const pendingMatch = await redisClient.get<MatchResult>(matchKey);

    if (pendingMatch) {
      this.io.to(socketId).emit('match-found', pendingMatch);
      console.log(`Resent pending match to user ${userId}: ${pendingMatch.matchId}`);

      await redisClient.del(matchKey);
    }
  }

  private async cleanup(userId: string): Promise<void> {
    setTimeout(async () => {
      await redisClient.del(`${USER_STATE_PREFIX}:${userId}`);
      console.log(`Cleaned up old state for user ${userId}`);
    }, STATE_TTL * 1000);
  }

  async saveUserState(userId: string, state: UserState): Promise<void> {
    await redisClient.setex(
      `${USER_STATE_PREFIX}:${userId}`,
      STATE_TTL,
      state
    );
  }

  async savePendingMatch(userId: string, match: MatchResult): Promise<void> {
    const matchKey = `${PENDING_MATCH_PREFIX}:${userId}`;
    await redisClient.setex(matchKey, STATE_TTL, match);
  }

  async clearUserState(userId: string): Promise<void> {
    await redisClient.del(`${USER_STATE_PREFIX}:${userId}`);
    await redisClient.del(`${PENDING_MATCH_PREFIX}:${userId}`);
  }
}