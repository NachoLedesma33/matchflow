import { Router, Request, Response } from 'express';
import Redis from 'ioredis';
import { UserProfile, Weights } from '../../types';

const router = Router();
const redis = new Redis();

const USER_PREFIX = 'user:profile';
const MATCH_PREFIX = 'user:matches';
const STATS_PREFIX = 'user:stats';

interface UserStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  averageWaitTime: number;
  acceptanceRate: number;
  eloHistory: { timestamp: number; rating: number }[];
}

function generateId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

router.post('/users', async (req: Request, res: Response) => {
  try {
    const {
      name,
      skillRating,
      personality,
      scheduleOverlap,
      language,
      location,
      tags,
      weights
    } = req.body;

    if (!name || !language || !location) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const userId = generateId();
    const defaultWeights: Weights = weights || {
      skillWeight: 0.7,
      personalityWeight: 0.1,
      scheduleWeight: 0.1,
      languageWeight: 0.05,
      proximityWeight: 0.05
    };

    const profile: UserProfile = {
      id: userId,
      name,
      skillRating: skillRating || { rating: 1500, rd: 200, volatility: 0.06 },
      personality: personality ?? 0.5,
      scheduleOverlap: scheduleOverlap || [],
      language,
      location,
      reputation: 50,
      tags: tags || [],
      blacklist: [],
      weights: defaultWeights
    };

    await redis.set(`${USER_PREFIX}:${userId}`, JSON.stringify(profile));

    const defaultStats: UserStats = {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      averageWaitTime: 0,
      acceptanceRate: 100,
      eloHistory: [{ timestamp: Date.now(), rating: profile.skillRating.rating }]
    };
    await redis.set(`${STATS_PREFIX}:${userId}`, JSON.stringify(defaultStats));

    res.status(201).json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profileJson = await redis.get(`${USER_PREFIX}:${id}`);

    if (!profileJson) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const profile = JSON.parse(profileJson);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.put('/users/:id/weights', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { weights } = req.body;

    const profileJson = await redis.get(`${USER_PREFIX}:${id}`);
    if (!profileJson) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const profile: UserProfile = JSON.parse(profileJson);
    profile.weights = weights;

    await redis.set(`${USER_PREFIX}:${id}`, JSON.stringify(profile));
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update weights' });
  }
});

router.get('/users/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const matchesJson = await redis.lrange(`${MATCH_PREFIX}:${id}`, 0, limit - 1);
    const matches = matchesJson.map(m => JSON.parse(m));

    res.json({ userId: id, matches });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get history' });
  }
});

router.get('/users/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const statsJson = await redis.get(`${STATS_PREFIX}:${id}`);

    if (!statsJson) {
      res.status(404).json({ error: 'User stats not found' });
      return;
    }

    const stats: UserStats = JSON.parse(statsJson);

    const eloHistory = stats.eloHistory.slice(-30);
    const eloGraph = eloHistory.map((e, i) => ({
      x: i,
      y: e.rating
    }));

    res.json({
      userId: id,
      totalMatches: stats.totalMatches,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      winRate: stats.totalMatches > 0 ? stats.wins / stats.totalMatches : 0,
      averageWaitTime: stats.averageWaitTime,
      acceptanceRate: stats.acceptanceRate,
      currentElo: stats.eloHistory[stats.eloHistory.length - 1]?.rating || 1500,
      eloGraph
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/users', async (_req: Request, res: Response) => {
  try {
    const keys = await redis.keys(`${USER_PREFIX}:*`);
    const users: UserProfile[] = [];

    for (const key of keys) {
      const profileJson = await redis.get(key);
      if (profileJson) {
        users.push(JSON.parse(profileJson));
      }
    }

    res.json({ users, count: users.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

export default router;
export { router as userRoutes };