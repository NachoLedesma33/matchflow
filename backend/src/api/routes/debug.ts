import { Router, Request, Response } from 'express';
import Redis from 'ioredis';
import { UserProfile, Weights, MatchResult, QueueEntry, MatchMode, TeamSize } from '../../types';

const router = Router();
const redis = new Redis();

const USER_PREFIX = 'user:profile';
const QUEUE_PREFIX = 'queue';
const MATCH_PREFIX = 'match:id';
const STATS_PREFIX = 'user:stats';
const DEBUG_PREFIX = 'debug:session';

interface SimulationStats {
  startTime: number;
  totalUsers: number;
  matchesCreated: number;
  successRate: number;
  averageWaitTime: number;
  maxWaitTime: number;
  scoreStdDev: number;
}

const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'zh', 'ja', 'ko'];
const TAGS = ['fps', 'rts', 'moba', 'card', 'puzzle', 'racing', 'sports', 'strategy'];

function generateId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateRandomUser(): UserProfile {
  const weights: Weights = {
    skillWeight: randomFloat(0.5, 0.9),
    personalityWeight: randomFloat(0.05, 0.3),
    scheduleWeight: randomFloat(0.05, 0.2),
    languageWeight: randomFloat(0.0, 0.15),
    proximityWeight: randomFloat(0.0, 0.1)
  };

  const skillRating = randomBetween(800, 2500);

  const scheduleOverlap: number[] = [];
  const hours = randomBetween(2, 10);
  for (let i = 0; i < hours; i++) {
    scheduleOverlap.push(randomBetween(0, 23));
  }

  const tags: string[] = [];
  const tagCount = randomBetween(1, 4);
  for (let i = 0; i < tagCount; i++) {
    const tag = randomElement(TAGS);
    if (!tags.includes(tag)) tags.push(tag);
  }

  return {
    id: generateId(),
    name: `User_${Math.random().toString(36).substr(2, 6)}`,
    skillRating: {
      rating: skillRating,
      rd: randomBetween(50, 250),
      volatility: randomFloat(0.03, 0.15)
    },
    personality: randomFloat(0, 1),
    scheduleOverlap,
    language: randomElement(LANGUAGES),
    location: {
      lat: randomFloat(-90, 90),
      lng: randomFloat(-180, 180)
    },
    reputation: randomBetween(30, 100),
    tags,
    blacklist: [],
    weights
  };
}

router.post('/debug/simulate', async (req: Request, res: Response) => {
  try {
    const { userCount = 20, teamSize = 1, mode = 'fast' } = req.body;

    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Debug endpoints not available in production' });
      return;
    }

    await redis.set(`${DEBUG_PREFIX}:start`, Date.now().toString());
    await redis.set(`${DEBUG_PREFIX}:users`, '0');
    await redis.set(`${DEBUG_PREFIX}:matches`, '0');

    const users: UserProfile[] = [];
    for (let i = 0; i < userCount; i++) {
      const user = generateRandomUser();
      await redis.set(`${USER_PREFIX}:${user.id}`, JSON.stringify(user));
      users.push(user);

      const queueEntry: QueueEntry = {
        userId: user.id,
        timestamp: Date.now(),
        priorityBonus: 0
      };

      const queueKey = `${QUEUE_PREFIX}:${mode}:${teamSize}`;
      await redis.zadd(queueKey, 0, JSON.stringify(queueEntry));
    }

    await redis.set(`${DEBUG_PREFIX}:users`, userCount.toString());

    res.json({
      message: `Created ${userCount} users and added to queue`,
      users: users.map(u => ({ id: u.id, name: u.name, skill: u.skillRating.rating })),
      config: { teamSize, mode }
    });
  } catch (error) {
    res.status(500).json({ error: 'Simulation failed' });
  }
});

router.get('/debug/metrics', async (_req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Debug endpoints not available in production' });
      return;
    }

    const startTime = await redis.get(`${DEBUG_PREFIX}:start`);
    const totalUsers = parseInt(await redis.get(`${DEBUG_PREFIX}:users`) || '0');
    const matchesCreated = parseInt(await redis.get(`${DEBUG_PREFIX}:matches`) || '0');

    const matchKeys = await redis.keys(`${MATCH_PREFIX}:*`);
    const scores: number[] = [];
    const waitTimes: number[] = [];

    for (const key of matchKeys) {
      const matchJson = await redis.get(key);
      if (matchJson) {
        const match: MatchResult = JSON.parse(matchJson);
        scores.push(match.score);

        for (const playerId of match.players) {
          const queueKey = await redis.get(`queue:key:${playerId}`);
          if (queueKey) {
            const ts = await redis.zscore(`${QUEUE_PREFIX}:ts:${queueKey}`, playerId);
            if (ts) {
              waitTimes.push((match.timestamp - parseInt(ts)) / 1000);
            }
          }
        }
      }
    }

    const avgWaitTime = waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;

    const maxWaitTime = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;

    const scoreStdDev = scores.length > 1
      ? Math.sqrt(
          scores.map(s => Math.pow(s - (scores.reduce((a, b) => a + b, 0) / scores.length), 2))
            .reduce((a, b) => a + b, 0) / scores.length
        )
      : 0;

    const successRate = totalUsers > 0 ? (matchesCreated / totalUsers) * 100 : 0;

    const metrics: SimulationStats = {
      startTime: startTime ? parseInt(startTime) : Date.now(),
      totalUsers,
      matchesCreated,
      successRate,
      averageWaitTime: Math.round(avgWaitTime),
      maxWaitTime: Math.round(maxWaitTime),
      scoreStdDev: Math.round(scoreStdDev * 100) / 100
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

router.get('/debug/export', async (_req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Debug endpoints not available in production' });
      return;
    }

    const users: UserProfile[] = [];
    const userKeys = await redis.keys(`${USER_PREFIX}:*`);

    for (const key of userKeys) {
      const userJson = await redis.get(key);
      if (userJson) {
        users.push(JSON.parse(userJson));
      }
    }

    const matches: MatchResult[] = [];
    const matchKeys = await redis.keys(`${MATCH_PREFIX}:*`);

    for (const key of matchKeys) {
      const matchJson = await redis.get(key);
      if (matchJson) {
        matches.push(JSON.parse(matchJson));
      }
    }

    const exportData = {
      exportedAt: Date.now(),
      users,
      matches
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=simulation.json');
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export data' });
  }
});

router.post('/debug/reset', async (_req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Debug endpoints not available in production' });
      return;
    }

    const userKeys = await redis.keys(`${USER_PREFIX}:*`);
    const queueKeys = await redis.keys(`${QUEUE_PREFIX}:*`);
    const matchKeys = await redis.keys(`${MATCH_PREFIX}:*`);
    const debugKeys = await redis.keys(`${DEBUG_PREFIX}:*`);

    for (const key of [...userKeys, ...queueKeys, ...matchKeys, ...debugKeys]) {
      await redis.del(key);
    }

    res.json({ message: 'Debug state reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset debug state' });
  }
});

export default router;
export { router as debugRoutes };