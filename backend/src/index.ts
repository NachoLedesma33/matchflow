import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RedisClient } from './services/RedisClient';
import { MatchingEngine } from './services/MatchingEngine';
import { apiRoutes } from './api/routes';
import { triggerWebhook } from './api/routes/webhooks';
import { MetricsCollector } from './utils/MetricsCollector';
import { MatchResult, MatchMode } from './types';

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || undefined;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

let matchingEngine: MatchingEngine | null = null;
let redisClient: RedisClient | null = null;
let metricsCollector: MetricsCollector | null = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (NODE_ENV === 'production' && !req.path.startsWith('/debug')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.use(apiRoutes);

app.get('/', (_req, res) => {
  res.json({
    name: 'MatchFlow API',
    version: '1.0.0',
    status: 'running',
  });
});

async function initializeServices() {
  console.log('Initializing services...');

  redisClient = RedisClient.getInstance(REDIS_URL);
  await redisClient.ping();
  console.log('Redis connected');

  matchingEngine = new MatchingEngine(REDIS_URL);
  matchingEngine.setMatchCallback(handleMatchFound);
  matchingEngine.start();
  console.log('MatchingEngine started');

  metricsCollector = new MetricsCollector(REDIS_URL);
  metricsCollector.startAutoCleanup();
  console.log('MetricsCollector started');
}

async function handleMatchFound(match: MatchResult) {
  console.log(`Match found: ${match.matchId}`);

  io.to('match:notify').emit('match-found', match);

  await triggerWebhook('match-found', {
    matchId: match.matchId,
    players: match.players,
    score: match.score,
    timestamp: match.timestamp,
    event: 'match-found',
  });

  if (metricsCollector) {
    const waitTime = (match.timestamp - Date.now()) / 1000;
    await metricsCollector.recordMatch(match.players.length > 2 ? 'mixed' : 'fast', waitTime, match.score, true);
  }
}

function setupWebSocketHandlers() {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('authenticate', async (userId: string) => {
      socket.join('match:notify');
      console.log(`User authenticated: ${userId}`);
    });

    socket.on('join-queue', async (data: {
      userId: string;
      mode: string;
      teamSize: number;
      filters: Record<string, unknown>;
      teamMembers?: string[];
    }) => {
      console.log(`User ${data.userId} joining queue: ${data.mode} ${data.teamSize}v${data.teamSize}`);
      
      if (matchingEngine) {
        const userId = data.userId;
      }

      socket.emit('queue-update', {
        position: Math.floor(Math.random() * 20) + 1,
        estimatedTime: Math.floor(Math.random() * 300) + 30,
      });
    });

    socket.on('leave-queue', async (data: { userId: string }) => {
      console.log(`User ${data.userId} leaving queue`);
    });

    socket.on('update-weights', async (data: { userId: string; weights: unknown }) => {
      console.log(`User ${data.userId} updating weights`);
    });

    socket.on('feedback', async (data: { matchId: string; rating: number; wouldPlayAgain: boolean }) => {
      console.log(`Feedback for match ${data.matchId}: rating=${data.rating}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

async function startServer() {
  await initializeServices();
  setupWebSocketHandlers();

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
  });
}

async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  if (matchingEngine) {
    await matchingEngine.shutdown();
    console.log('MatchingEngine stopped');
  }

  if (redisClient) {
    await redisClient.quit();
    console.log('Redis disconnected');
  }

  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});