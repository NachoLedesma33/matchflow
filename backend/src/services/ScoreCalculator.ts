import { UserProfile } from '../types';

export class ScoreCalculator {
  calculateCompatibility(user: UserProfile, candidate: UserProfile): number {
    const w = user.weights;

    const skillDiff = Math.abs(user.skillRating.rating - candidate.skillRating.rating);
    const skillScore = Math.max(0, 1 - skillDiff / 1000);

    const personalityDiff = Math.abs(user.personality - candidate.personality);
    const personalityScore = 1 - personalityDiff;

    const scheduleOverlap = this.calculateScheduleOverlap(
      user.scheduleOverlap,
      candidate.scheduleOverlap
    );

    const languageMatch = user.language === candidate.language ? 1 : 0;

    const proximity = this.calculateProximityScore(user.location, candidate.location);

    const totalScore =
      skillScore * w.skillWeight +
      personalityScore * w.personalityWeight +
      scheduleOverlap * w.scheduleWeight +
      languageMatch * w.languageWeight +
      proximity * w.proximityWeight;

    return Math.min(1, Math.max(0, totalScore));
  }

  calculateScheduleOverlap(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const overlap = a.filter(h => b.includes(h)).length;
    return overlap / Math.max(a.length, b.length);
  }

  calculateProximityScore(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ): number {
    const distance = Math.sqrt(
      Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2)
    );
    return Math.max(0, 1 - distance / 100);
  }

  calculateTeamCompatibility(teams: UserProfile[][]): number {
    if (teams.length < 2) return 1;

    const teamSkills = teams.map(team =>
      team.reduce((sum, p) => sum + p.skillRating.rating, 0) / team.length
    );

    const maxDiff = Math.max(...teamSkills) - Math.min(...teamSkills);
    return Math.max(0, 1 - maxDiff / 500);
  }
}