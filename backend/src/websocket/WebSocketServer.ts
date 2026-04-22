import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import Redis from 'ioredis';
import { QueueManager } from '../services/QueueManager';
import { HybridMatcher } from '../algorithms/HybridMatcher';
import { TeamBalancer } from '../services/TeamBalancer';
import { FilterEngine } from '../services/FilterEngine';
import { applyFilters, filterCandidates } from '../services/FilterEngine';
import {
  UserProfile,
  MatchRequest,
  QueueEntry,
  MatchResult,
  Feedback,
  MatchMode,
  TeamSize,
  MatchFilters,
  Weights
} from '../types';
import { GlickoSimplified } from '../algorithms/GlickoSimplified';

interface UserState {
  userId: string;
  socketId: string;
  queueEntry?: QueueEntry;
  mode?: MatchMode;
  teamSize?: TeamSize;
  filters?: MatchFilters;
  teamMembers?: string[];
}

export class WebSocketServer {
  private io: Server;
  private redis: Redis;
  private queueManager: QueueManager;
  private matcher: HybridMatcher;
  private userStates: Map<string, UserState> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private readonly STATE_TTL = 30;
  private readonly STATE_PREFIX = 'user:state';

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.redis = new Redis();
    this.queueManager = new QueueManager();
    this.matcher = new HybridMatcher();

    this.setupEventHandlers();
    this.queueManager.startHeartbeat();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('authenticate', async (userId: string) => {
        await this.authenticateUser(socket.id, userId);
      });

      socket.on('join-queue', async (data: {
        userId: string;
        mode: MatchMode;
        teamSize: TeamSize;
        filters: MatchFilters;
        teamMembers?: string[];
      }) => {
        await this.handleJoinQueue(socket.id, data);
      });

      socket.on('leave-queue', async (data: { userId: string }) => {
        await this.handleLeaveQueue(socket.id, data.userId);
      });

      socket.on('update-weights', async (data: { userId: string; weights: Weights }) => {
        await this.handleUpdateWeights(data.userId, data.weights);
      });

      socket.on('feedback', async (data: Feedback) => {
        await this.handleFeedback(data);
      });

      socket.on('disconnect', async () => {
        await this.handleDisconnect(socket.id);
      });

      socket.on('reconnect', async (data: { userId: string }) => {
        await this.handleReconnect(socket.id, data.userId);
      });
    });
  }

  private async authenticateUser(socketId: string, userId: string): Promise<void> {
    const stateJson = await this.redis.get(`${this.STATE_PREFIX}:${userId}`);
    if (stateJson) {
      const state = JSON.parse(stateJson) as UserState;
      state.socketId = socketId;
      this.userStates.set(socketId, state);
      await this.redis.setex(
        `${this.STATE_PREFIX}:${userId}`,
        this.STATE_TTL,
        JSON.stringify(state)
      );
      this.io.to(socketId).emit('session-restored', state);
    } else {
      this.userStates.set(socketId, { userId, socketId });
    }
  }

  private async handleJoinQueue(socketId: string, data: {
    userId: string;
    mode: MatchMode;
    teamSize: TeamSize;
    filters: MatchFilters;
    teamMembers?: string[];
  }): Promise<void> {
    const queueEntry: QueueEntry = {
      userId: data.userId,
      timestamp: Date.now(),
      priorityBonus: 0,
      teamMembers: data.teamMembers
    };

    await this.queueManager.addToQueue(data.userId, queueEntry);

    const state: UserState = {
      userId: data.userId,
      socketId,
      queueEntry,
      mode: data.mode,
      teamSize: data.teamSize,
      filters: data.filters,
      teamMembers: data.teamMembers
    };

    this.userStates.set(socketId, state);
    await this.saveState(data.userId, state);

    const queueSize = await this.queueManager.getQueueSize(data.mode, data.teamSize);
    this.io.to(socketId).emit('queue-update', {
      position: queueSize,
      estimatedTime: queueSize * 60
    });

    this.scheduleMatch(socketId, data.mode, data.teamSize, data.filters, data.userId);
  }

  private async handleLeaveQueue(socketId: string, userId: string): Promise<void> {
    const state = this.userStates.get(socketId);
    if (state) {
      await this.queueManager.removeFromQueue(userId);
      this.userStates.delete(socketId);
      await this.redis.del(`${this.STATE_PREFIX}:${userId}`);
      this.io.to(socketId).emit('left-queue');
    }
  }

  private async handleUpdateWeights(userId: string, weights: Weights): Promise<void> {
    const profile = this.userProfiles.get(userId);
    if (profile) {
      profile.weights = weights;
      this.userProfiles.set(userId, profile);
    }
  }

  private async handleFeedback(feedback: Feedback): Promise<void> {
    console.log('Feedback received:', feedback);

    const matchResultJson = await this.redis.get(`match:${feedback.matchId}`);
    if (!matchResultJson) return;

    const matchResult = JSON.parse(matchResultJson);

    for (const playerId of matchResult.players) {
      const profile = this.userProfiles.get(playerId);
      if (!profile) continue;

      const otherPlayers = matchResult.players.filter(p => p !== playerId);
      const opponentRatings = otherPlayers.map(opId => {
        const opProfile = this.userProfiles.get(opId);
        return {
          rating: opProfile?.skillRating.rating || 1500,
          rd: opProfile?.skillRating.rd || 200
        };
      });

      const results = otherPlayers.map(() => feedback.rating / 5);
      const newRating = GlickoSimplified.calculateMultipleMatches(
        profile.skillRating,
        opponentRatings,
        results
      );

      profile.skillRating = newRating;
      this.userProfiles.set(playerId, profile);
    }
  }

  private async handleDisconnect(socketId: string): Promise<void> {
    const state = this.userStates.get(socketId);
    if (state) {
      await this.saveState(state.userId, state);
    }
    console.log(`Client disconnected: ${socketId}`);
  }

  private async handleReconnect(socketId: string, userId: string): Promise<void> {
    const stateJson = await this.redis.get(`${this.STATE_PREFIX}:${userId}`);
    if (stateJson) {
      const state = JSON.parse(stateJson) as UserState;
      state.socketId = socketId;
      this.userStates.set(socketId, state);
      await this.redis.del(`${this.STATE_PREFIX}:${userId}`);
      this.io.to(socketId).emit('session-restored', state);
    }
  }

  private async saveState(userId: string, state: UserState): Promise<void> {
    await this.redis.setex(
      `${this.STATE_PREFIX}:${userId}`,
      this.STATE_TTL,
      JSON.stringify(state)
    );
  }

  private async scheduleMatch(
    socketId: string,
    mode: MatchMode,
    teamSize: TeamSize,
    filters: MatchFilters,
    userId: string
  ): Promise<void> {
    setTimeout(async () => {
      const state = this.userStates.get(socketId);
      if (!state) return;

      const candidates = await this.queueManager.getCandidates(mode, teamSize);
      const user = this.userProfiles.get(userId);

      if (!user) {
        this.io.to(socketId).emit('match-error', { message: 'User not found' });
        return;
      }

      const filtered = filterCandidates(user, candidates.map(c => {
        const profile = this.userProfiles.get(c.userId);
        return profile || { id: c.userId, name: '', skillRating: { rating: 1500, rd: 200, volatility: 0.06 }, personality: 0.5, scheduleOverlap: [], language: 'en', location: { lat: 0, lng: 0 }, reputation: 50, tags: [], blacklist: [], weights: { skillWeight: 0.7, personalityWeight: 0.1, scheduleWeight: 0.1, languageWeight: 0.05, proximityWeight: 0.05 } };
      }), filters);

      if (filtered.length === 0) {
        this.io.to(socketId).emit('waiting-time-update', { time: 30 });
        this.scheduleMatch(socketId, mode, teamSize, filters, userId);
        return;
      }

      const matchedUserId = this.matcher.selectMatch(filtered, userId);
      if (!matchedUserId) {
        this.scheduleMatch(socketId, mode, teamSize, filters, userId);
        return;
      }

      const matchedProfile = this.userProfiles.get(matchedUserId);
      if (!matchedProfile) return;

      const players = [user, matchedProfile];
      const teams = TeamBalancer.balanceTeams(players, teamSize);

      const matchResult: MatchResult = {
        matchId: `match_${Date.now()}`,
        players: players.map(p => p.id),
        score: Math.random(),
        timestamp: Date.now(),
        teamAssignment: teams.map((team, i) => ({
          teamId: i,
          players: team.map(p => p.id)
        }))
      };

      await this.redis.setex(
        `match:${matchResult.matchId}`,
        3600,
        JSON.stringify(matchResult)
      );

      this.matcher.recordMatch(userId, matchedUserId);
      this.matcher.recordMatch(matchedUserId, userId);

      await this.queueManager.removeFromQueue(userId);
      await this.queueManager.removeFromQueue(matchedUserId);

      this.io.to(socketId).emit('match-found', matchResult);
    }, 3000);
  }

  setUserProfile(userId: string, profile: UserProfile): void {
    this.userProfiles.set(userId, profile);
  }

  async shutdown(): Promise<void> {
    this.queueManager.stopHeartbeat();
    await this.queueManager.disconnect();
    await this.redis.quit();
    this.io.close();
  }
}