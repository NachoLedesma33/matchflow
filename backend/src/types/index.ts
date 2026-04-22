export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface Weights {
  skillWeight: number;
  personalityWeight: number;
  scheduleWeight: number;
  languageWeight: number;
  proximityWeight: number;
}

export interface UserProfile {
  id: string;
  name: string;
  skillRating: Rating;
  personality: number;
  scheduleOverlap: number[];
  location: { lat: number; lng: number };
  reputation: number;
  tags: string[];
  blacklist: string[];
  weights: Weights;
}

export type MatchMode = 'fast' | 'precise' | 'mixed';
export type TeamSize = 1 | 2 | 3;

export interface MatchFilters {
  minLevel?: number;
  maxLevel?: number;
  requiredTags?: string[];
  preferredGender?: 'male' | 'female' | 'any';
}

export interface MatchRequest {
  userId: string;
  mode: MatchMode;
  teamSize: TeamSize;
  filters: MatchFilters;
}

export interface QueueEntry {
  userId: string;
  timestamp: number;
  priorityBonus: number;
  teamMembers?: string[];
}

export interface TeamAssignment {
  teamId: number;
  players: string[];
}

export interface MatchResult {
  matchId: string;
  players: string[];
  score: number;
  timestamp: number;
  teamAssignment: TeamAssignment[];
}

export interface Feedback {
  matchId: string;
  rating: number;
  report?: string;
  wouldPlayAgain: boolean;
}