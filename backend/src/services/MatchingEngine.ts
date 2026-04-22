import Redis from 'ioredis';
import { QueueManager } from './QueueManager';
import { HybridMatcher } from '../algorithms/HybridMatcher';
import { TeamBalancer, calculateTeamSkill, calculateSkillDifference } from './TeamBalancer';
import { applyFilters, filterCandidates } from './FilterEngine';
import { ScoreCalculator } from './ScoreCalculator';
import {
  UserProfile,
  MatchMode,
  TeamSize,
  MatchResult,
  MatchFilters,
  QueueEntry
} from '../types';

interface MatchJob {
  playerId: string;
  mode: MatchMode;
  teamSize: TeamSize;
  filters: MatchFilters;
  teamMembers?: string[];
}

export class MatchingEngine {
  private redis: Redis;
  private queueManager: QueueManager;
  private matcher: HybridMatcher;
  private scoreCalculator: ScoreCalculator;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private onMatchFound?: (result: MatchResult) => void;

  private readonly INTERVALS = {
    fast: 1000,
    precise: 5000,
    mixed: 2000
  };

  constructor(redisUrl?: string) {
    this.redis = redisUrl ? new Redis(redisUrl) : new Redis();
    this.queueManager = new QueueManager(redisUrl);
    this.matcher = new HybridMatcher();
    this.scoreCalculator = new ScoreCalculator();
  }

  setUserProfile(userId: string, profile: UserProfile): void {
    this.userProfiles.set(userId, profile);
  }

  setMatchCallback(callback: (result: MatchResult) => void): void {
    this.onMatchFound = callback;
  }

  start(): void {
    console.log('MatchingEngine started');

    for (const mode of ['fast', 'precise', 'mixed'] as MatchMode[]) {
      for (const size of [1, 2, 3] as TeamSize[]) {
        const key = `${mode}:${size}`;
        const interval = this.INTERVALS[mode];

        this.intervals.set(key, setInterval(() => {
          this.processQueue(mode, size);
        }, interval));
      }
    }

    this.queueManager.startHeartbeat();
  }

  stop(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    this.queueManager.stopHeartbeat();
    console.log('MatchingEngine stopped');
  }

  private async processQueue(mode: MatchMode, teamSize: TeamSize): Promise<void> {
    const candidates = await this.getQueuedUsers(mode, teamSize);
    if (candidates.length < teamSize) return;

    for (let i = 0; i < candidates.length; i++) {
      const player = candidates[i];
      const otherPlayers = candidates.slice(i + 1);

      const suitableMatches = await this.findMatches(
        player,
        otherPlayers,
        player.filters,
        mode
      );

      if (suitableMatches.length > 0) {
        const matched = suitableMatches[0];
        const matchResult = await this.createMatch(
          [player.playerId, matched.playerId],
          mode,
          teamSize
        );

        if (this.onMatchFound) {
          this.onMatchFound(matchResult);
        }

        await this.notifyMatch(matchResult);
        await this.removeFromQueue(player.playerId);
        await this.removeFromQueue(matched.playerId);
      }
    }
  }

  private async getQueuedUsers(
    mode: MatchMode,
    teamSize: TeamSize
  ): Promise<MatchJob[]> {
    const entries = await this.queueManager.getCandidates(mode, teamSize, 100);
    return entries.map(e => ({
      playerId: e.userId,
      mode,
      teamSize,
      filters: {},
      teamMembers: e.teamMembers
    }));
  }

  private async findMatches(
    player: MatchJob,
    candidates: MatchJob[],
    filters: MatchFilters,
    mode: MatchMode
  ): Promise<MatchJob[]> {
    const suitable: MatchJob[] = [];

    for (const candidate of candidates) {
      const playerProfile = this.userProfiles.get(player.playerId);
      const candidateProfile = this.userProfiles.get(candidate.playerId);

      if (!playerProfile || !candidateProfile) continue;

      const passesFilters = this.applyCrossFilters(playerProfile, candidateProfile, filters);
      if (!passesFilters) continue;

      suitable.push(candidate);
    }

    return suitable;
  }

  private applyCrossFilters(
    user: UserProfile,
    candidate: UserProfile,
    filters: MatchFilters
  ): boolean {
    if (candidate.id === user.id) return false;
    if (user.blacklist.includes(candidate.id)) return false;
    if (candidate.blacklist.includes(user.id)) return false;
    if (candidate.reputation < 30) return false;

    if (filters.minLevel !== undefined) {
      if (candidate.skillRating.rating < filters.minLevel) return false;
    }
    if (filters.maxLevel !== undefined) {
      if (candidate.skillRating.rating > filters.maxLevel) return false;
    }
    if (filters.requiredTags && filters.requiredTags.length > 0) {
      const hasAllTags = filters.requiredTags.every(tag =>
        candidate.tags.includes(tag)
      );
      if (!hasAllTags) return false;
    }

    return true;
  }

  private async createMatch(
    playerIds: string[],
    mode: MatchMode,
    teamSize: TeamSize
  ): Promise<MatchResult> {
    const players = playerIds
      .map(id => this.userProfiles.get(id))
      .filter((p): p is UserProfile => p !== undefined);

    const teams = TeamBalancer.balanceTeams(players, teamSize);

    const skillDiff = calculateSkillDifference(teams);
    const avgSkill = players.reduce((sum, p) => sum + p.skillRating.rating, 0) / players.length;

    const matchResult: MatchResult = {
      matchId: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      players: playerIds,
      score: 100 - skillDiff,
      timestamp: Date.now(),
      teamAssignment: teams.map((team, i) => ({
        teamId: i,
        players: team.map(p => p.id)
      }))
    };

    await this.saveMatch(matchResult);
    return matchResult;
  }

  private async saveMatch(match: MatchResult): Promise<void> {
    await this.redis.setex(
      `match:${match.matchId}`,
      3600,
      JSON.stringify(match)
    );

    const matchHistory = await this.redis.lrange('match:history', 0, 99);
    matchHistory.unshift(JSON.stringify(match));
    await this.redis.ltrim('match:history', 0, 99);
  }

  private async notifyMatch(match: MatchResult): Promise<void> {
    const key = `match:${match.matchId}`;
    const socketIds = match.players.map(p => `user:${p}`);
    this.redis.publish('match:notify', JSON.stringify({ match, sockets }));
  }

  private async removeFromQueue(userId: string): Promise<void> {
    await this.queueManager.removeFromQueue(userId);
  }

  async getMatchHistory(limit: number = 10): Promise<MatchResult[]> {
    const history = await this.redis.lrange('match:history', 0, limit - 1);
    return history.map(h => JSON.parse(h) as MatchResult);
  }

  async getQueueStats(): Promise<{ mode: MatchMode; teamSize: TeamSize; count: number }[]> {
    return this.queueManager.getAllQueues();
  }

  async shutdown(): Promise<void> {
    this.stop();
    await this.queueManager.disconnect();
    await this.redis.quit();
  }
}