import Redis from 'ioredis';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
}

export interface UserNotificationPreferences {
  userId: string;
  email: boolean;
  push: boolean;
  sound: boolean;
  lastSeen: number;
}

export class NotificationService {
  private redis: Redis;
  private readonly PREF_PREFIX = 'notification:prefs';
  private readonly LAST_SEEN_PREFIX = 'user:lastseen';
  private readonly OFFLINE_THRESHOLD = 30000;

  constructor(redisUrl?: string) {
    this.redis = redisUrl ? new Redis(redisUrl) : new Redis();
  }

  async sendWebSocket(userId: string, event: string, data: unknown): Promise<void> {
    const key = `${this.LAST_SEEN_PREFIX}:${userId}`;
    const lastSeen = await this.redis.get(key);
    const isOnline = lastSeen && (Date.now() - parseInt(lastSeen)) < this.OFFLINE_THRESHOLD;

    if (!isOnline) {
      await this.sendPushNotification(userId, event, JSON.stringify(data));
    }
  }

  async sendEmail(userId: string, subject: string, body: string): Promise<void> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.email) {
      console.log(`Email disabled for user ${userId}`);
      return;
    }

    console.log(`[EMAIL] To user ${userId}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);
  }

  async sendPushNotification(
    userId: string,
    title: string,
    body: string
  ): Promise<void> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.push) {
      console.log(`Push disabled for user ${userId}`);
      return;
    }

    const payload: NotificationPayload = {
      title,
      body,
      sound: prefs.sound ? 'default' : undefined
    };

    console.log(`[PUSH] To user ${userId}:`, payload);
  }

  async notifyMatchFound(
    userId: string,
    matchData: {
      matchId: string;
      opponentId: string;
      opponentName: string;
      teamAssignment: { teamId: number; players: string[] }[];
    }
  ): Promise<void> {
    const prefs = await this.getPreferences(userId);
    const isOnline = await this.isUserOnline(userId);

    const message = `Match found with ${matchData.opponentName}`;
    const detail = `Team ${matchData.teamAssignment.find(t => t.players.includes(userId))?.teamId + 1}`;

    const payload: NotificationPayload = {
      title: 'Match Found!',
      body: `${message}. ${detail}`,
      data: {
        matchId: matchData.matchId,
        type: 'match_found'
      },
      sound: prefs.sound ? 'match_found.mp3' : undefined
    };

    if (isOnline) {
      await this.sendWebSocket(userId, 'match-found', payload);
    } else {
      if (prefs.push) {
        await this.sendPushNotification(userId, payload.title, payload.body);
      }
      if (prefs.email) {
        await this.sendEmail(
          userId,
          'Match Found!',
          `Your match with ${matchData.opponentName} is ready. Visit the app to join.`
        );
      }
    }
  }

  async notifyWaitingTime(userId: string, timeSeconds: number): Promise<void> {
    const isOnline = await this.isUserOnline(userId);
    if (!isOnline) return;

    const payload: NotificationPayload = {
      title: 'Queue Update',
      body: `Estimated wait: ${Math.ceil(timeSeconds / 60)} minutes`,
      data: { timeSeconds, type: 'waiting_update' }
    };

    await this.sendWebSocket(userId, 'waiting-time-update', payload);
  }

  async updateLastSeen(userId: string): Promise<void> {
    await this.redis.set(
      `${this.LAST_SEEN_PREFIX}:${userId}`,
      Date.now().toString()
    );
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const lastSeen = await this.redis.get(`${this.LAST_SEEN_PREFIX}:${userId}`);
    if (!lastSeen) return false;
    return (Date.now() - parseInt(lastSeen)) < this.OFFLINE_THRESHOLD;
  }

  async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    const key = `${this.PREF_PREFIX}:${userId}`;
    const prefsJson = await this.redis.get(key);

    if (prefsJson) {
      return JSON.parse(prefsJson);
    }

    return {
      userId,
      email: true,
      push: true,
      sound: true,
      lastSeen: Date.now()
    };
  }

  async setPreferences(prefs: UserNotificationPreferences): Promise<void> {
    const key = `${this.PREF_PREFIX}:${prefs.userId}`;
    await this.redis.set(key, JSON.stringify(prefs));
  }

  async getStats(): Promise<{ online: number; offline: number }> {
    const keys = await this.redis.keys(`${this.LAST_SEEN_PREFIX}:*`);
    let online = 0;
    let offline = 0;

    for (const key of keys) {
      const lastSeen = await this.redis.get(key);
      if (lastSeen) {
        if ((Date.now() - parseInt(lastSeen)) < this.OFFLINE_THRESHOLD) {
          online++;
        } else {
          offline++;
        }
      }
    }

    return { online, offline };
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}