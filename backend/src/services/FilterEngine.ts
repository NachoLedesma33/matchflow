import { UserProfile, MatchFilters } from '../types';

const MIN_REPUTATION = 30;

export function applyFilters(
  user: UserProfile,
  candidate: UserProfile,
  filters: MatchFilters
): boolean {
  if (candidate.id === user.id) return false;

  if (candidate.blacklist.includes(user.id)) return false;

  if (candidate.reputation < MIN_REPUTATION) return false;

  if (filters.minLevel !== undefined && candidate.skillRating.rating < filters.minLevel) {
    return false;
  }

  if (filters.maxLevel !== undefined && candidate.skillRating.rating > filters.maxLevel) {
    return false;
  }

  if (filters.requiredTags && filters.requiredTags.length > 0) {
    const hasAllTags = filters.requiredTags.every(tag =>
      candidate.tags.includes(tag)
    );
    if (!hasAllTags) return false;
  }

  return true;
}

export function filterCandidates(
  user: UserProfile,
  candidates: UserProfile[],
  filters: MatchFilters
): UserProfile[] {
  return candidates.filter(candidate => applyFilters(user, candidate, filters));
}

export function applyAllFilters(
  user: UserProfile,
  candidates: UserProfile[],
  filters: MatchFilters
): { passed: UserProfile[]; rejected: UserProfile[] } {
  const passed: UserProfile[] = [];
  const rejected: UserProfile[] = [];

  for (const candidate of candidates) {
    if (applyFilters(user, candidate, filters)) {
      passed.push(candidate);
    } else {
      rejected.push(candidate);
    }
  }

  return { passed, rejected };
}