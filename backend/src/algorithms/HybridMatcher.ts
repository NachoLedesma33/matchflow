import { UserProfile, MatchResult } from '../types';

interface ScoreEntry {
  userId: string;
  score: number;
}

export class HybridMatcher {
  private matchHistory: Map<string, string[]> = new Map();
  private readonly HISTORY_LIMIT = 5;

  selectMatch(candidates: UserProfile[], userId: string, previousMatches: string[] = []): string | null {
    if (candidates.length === 0) return null;

    const scored = this.scoreCandidates(candidates, userId);
    const sorted = scored.sort((a, b) => b.score - a.score);

    const history = this.getHistory(userId);
    const filtered = this.filterRecent(sorted, history);
    const top10 = filtered.slice(0, 10);

    if (top10.length === 0) return null;

    const rand = Math.random();
    if (rand < 0.7 && top10.length > 0) {
      return top10[0].userId;
    } else if (rand < 0.9 && top10.length > 1) {
      return top10[1].userId;
    } else {
      const randomIndex = Math.floor(Math.random() * Math.min(top10.length, 10));
      return top10[randomIndex].userId;
    }
  }

  private scoreCandidates(candidates: UserProfile[], userId: string): ScoreEntry[] {
    const user = candidates.find(c => c.id === userId);
    if (!user) return candidates.map(c => ({ userId: c.id, score: 0 }));

    return candidates
      .filter(c => c.id !== userId)
      .filter(c => !user.blacklist.includes(c.id))
      .map(c => ({
        userId: c.id,
        score: this.calculateCompatibility(user, c)
      }));
  }

  private calculateCompatibility(a: UserProfile, b: UserProfile): number {
    const w = a.weights;

    const skillDiff = Math.abs(a.skillRating.rating - b.skillRating.rating);
    const skillScore = Math.max(0, 1 - skillDiff / 1000);

    const personalityDiff = Math.abs(a.personality - b.personality);
    const personalityScore = 1 - personalityDiff;

    const scheduleOverlap = this.calculateScheduleOverlap(a.scheduleOverlap, b.scheduleOverlap);
    const languageMatch = a.language === b.language ? 1 : 0;
    const proximity = this.calculateProximity(a.location, b.location);

    return (
      skillScore * w.skillWeight +
      personalityScore * w.personalityWeight +
      scheduleOverlap * w.scheduleWeight +
      languageMatch * w.languageWeight +
      proximity * w.proximityWeight
    );
  }

  private calculateScheduleOverlap(a: number[], b: number[]): number {
    const overlap = a.filter(h => b.includes(h)).length;
    return overlap / Math.max(a.length, b.length, 1);
  }

  private calculateProximity(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const distance = Math.sqrt(
      Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2)
    );
    return Math.max(0, 1 - distance / 100);
  }

  private filterRecent(scored: ScoreEntry[], history: string[]): ScoreEntry[] {
    if (history.length === 0) return scored;
    return scored.filter(s => !history.includes(s.userId));
  }

  recordMatch(userId: string, matchedUserId: string): void {
    const history = this.getHistory(userId);
    if (history.length >= this.HISTORY_LIMIT) {
      history.shift();
    }
    history.push(matchedUserId);
    this.matchHistory.set(userId, history);
  }

  private getHistory(userId: string): string[] {
    return this.matchHistory.get(userId) || [];
  }

  clearHistory(userId: string): void {
    this.matchHistory.delete(userId);
  }
}