import { UserProfile } from '../types';

interface PlayerGroup {
  id: string;
  members: UserProfile[];
  skillRating: number;
}

export function balanceTeams(players: UserProfile[], teamSize: number): UserProfile[][] {
  if (players.length === 0 || teamSize === 0) return [];

  const groups = groupPlayers(players);
  const numTeams = Math.ceil(groups.length / teamSize);

  if (teamSize === 1) {
    return balance1v1(groups);
  }

  return balanceMultiple(groups, numTeams);
}

function groupPlayers(players: UserProfile[]): PlayerGroup[] {
  return players.map(p => ({
    id: p.id,
    members: [p],
    skillRating: p.skillRating.rating
  }));
}

function balance1v1(groups: PlayerGroup[]): UserProfile[][] {
  const sorted = [...groups].sort((a, b) => b.skillRating - a.skillRating);
  const teams: UserProfile[][] = [];

  for (let i = 0; i < sorted.length; i += 2) {
    if (i + 1 < sorted.length) {
      teams.push([...sorted[i].members, ...sorted[i + 1].members]);
    } else {
      teams.push(sorted[i].members);
    }
  }

  return teams;
}

function balanceMultiple(groups: PlayerGroup[], numTeams: number): UserProfile[][] {
  const sorted = [...groups].sort((a, b) => b.skillRating - a.skillRating);
  const teams: PlayerGroup[][] = Array.from({ length: numTeams }, () => []);

  let currentTeam = 0;
  for (const group of sorted) {
    teams[currentTeam].push(group);
    currentTeam = (currentTeam + 1) % numTeams;
  }

  return teams.map(team => {
    const players: UserProfile[] = [];
    for (const group of team) {
      players.push(...group.members);
    }
    return players;
  });
}

export function calculateTeamSkill(players: UserProfile[]): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, p) => acc + p.skillRating.rating, 0);
  return sum / players.length;
}

export function calculateSkillDifference(teams: UserProfile[][]): number {
  if (teams.length < 2) return 0;

  const teamSkills = teams.map(t => calculateTeamSkill(t));
  const maxSkill = Math.max(...teamSkills);
  const minSkill = Math.min(...teamSkills);

  return maxSkill - minSkill;
}