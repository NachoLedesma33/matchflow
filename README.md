# MatchFlow - Find Your Squad

Real-time matchmaking system with hybrid algorithms for competitive gaming. Find the perfect teammates for your favorite games instantly.

## Features

- **12 Popular Games Supported**: Valorant, League of Legends, CS2, Dota 2, Apex Legends, Call of Duty, Overwatch 2, Rocket League, Fortnite, Rainbow Six Siege, PUBG, FIFA
- **Hybrid Matching Algorithm**: 70% best score, 20% second best, 10% random (top 10)
- **Glicko-2 Rating System**: Skill tracking with RD (rating deviation) for fair matches
- **Priority Queues**: Dynamic priority bonus (+0.02 every 10s, max 0.5) reduces wait times
- **Real-time WebSocket**: Socket.io for instant match notifications
- **Team Balancing**: Greedy algorithm for balanced teams
- **Match Feedback**: Win/Draw/Loss rating system to improve match quality
- **In-Memory Storage**: No external Redis required - runs entirely in memory for easy deployment

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, Socket.io
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Deployment**: Vercel (frontend), Render (backend)

## Quick Start

### Prerequisites

- Node.js 18+

### Installation

```bash
# Install all dependencies
npm install
```

### Development

Run both frontend and backend:

```bash
npm run dev
```

Or run separately:

```bash
# Terminal 1 - Backend (http://localhost:3001)
cd backend && npm run dev

# Terminal 2 - Frontend (http://localhost:5173)
cd frontend && npm run dev
```

### Environment Variables

**Backend** (create `.env` in `/backend`):
```env
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Frontend** (create `.env` in `/frontend`):
```env
VITE_API_URL=http://localhost:3001
```

## Project Structure

```
matchflow/
├── backend/
│   ├── src/
│   │   ├── algorithms/     # HybridMatcher, GlickoSimplified
│   │   ├── api/routes/    # REST endpoints
│   │   ├── services/    # QueueManager, MatchingEngine, etc.
│   │   ├── types/      # TypeScript interfaces
│   │   ├── utils/      # MetricsCollector, ReconnectionHandler
│   │   ├── websocket/  # Socket.io server
│   │   └── index.ts    # Entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/  # WaitingRoom, MatchNotification
│   │   ├── contexts/    # SocketProvider
│   │   ├── hooks/       # useSocket
│   │   ├── App.tsx     # Main app
│   │   └── main.tsx    # Entry point
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── vercel.json    # Vercel deployment config
├── package.json        # Root workspace
├── tsconfig.base.json
└── README.md
```

## Supported Games & Modes

| Game | Queue Modes |
|------|-----------|
| Valorant | Competitive, Unrated, Spike Rush |
| League of Legends | Ranked Solo/Duo, Flex, ARAM |
| CS2 | Competitive, Wingman, Casual |
| Dota 2 | Ranked, Unranked, Turbo |
| Apex Legends | Ranked, pubs, LTMs |
| Call of Duty | Warzone, Multiplayer |
| Overwatch 2 | Competitive, Quick Play |
| Rocket League | Ranked, Casual, Extra Modes |
| Fortnite | Battle Royale, Zero Build |
| Rainbow Six Siege | Ranked, Quick Match |
| PUBG | Royale, Arena |
| FIFA | Ultimate Team, Seasons |

## API Endpoints

### Users
- `POST /users` - Create user profile
- `GET /users/:id` - Get user profile
- `PUT /users/:id/weights` - Update matching weights
- `GET /users/:id/history` - Match history
- `GET /users/:id/stats` - User statistics

### Webhooks
- `POST /webhooks/register` - Register webhook
- `GET /webhooks/test` - Test webhooks
- `GET /webhooks` - List webhooks

### Debug (development only)
- `POST /debug/simulate` - Create test users
- `GET /debug/metrics` - System metrics

### Health
- `GET /health` - Server health check

## WebSocket Events

### Client → Server
- `authenticate` - Authenticate user
- `join-queue` - Join matchmaking queue
- `leave-queue` - Leave queue
- `update-weights` - Update weights
- `feedback` - Submit match feedback (win/draw/loss)

### Server → Client
- `match-found` - Match found notification
- `queue-update` - Queue position update
- `waiting-time-update` - Waiting time update
- `queue-restored` - Session restored

## Deployment

### Frontend (Vercel)

Connect your GitHub repository to Vercel:
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

The `VITE_API_URL` is configured in `vercel.json` to point to the backend.

### Backend (Render)

Deploy to Render:
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Environment: Node

## Algorithms

### Hybrid Matcher
- Calculates compatibility score using weighted factors
- Selects match with 70% best, 20% second best, 10% random (top 10)
- Maintains history of last 5 matches per user to avoid repetition

### Glicko-2 (Simplified)
- Rating range: 0-3000
- RD range: 30-350
- Volatility range: 0.03-1.2

### Priority Queue
- Priority bonus increases every 10 seconds (+0.02)
- Maximum priority bonus: 0.5
- Sorted by priority for match selection

## License

ISC