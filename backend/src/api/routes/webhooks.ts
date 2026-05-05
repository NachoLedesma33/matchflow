import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = Router();

const WEBHOOK_PREFIX = 'webhook:config';
const WEBHOOK_LOG_PREFIX = 'webhook:log';

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: number;
  active: boolean;
}

interface WebhookPayload {
  matchId: string;
  players: string[];
  score: number;
  timestamp: number;
  event: string;
}

const webhookStore = new Map<string, WebhookConfig>();
const webhookLogStore = new Map<string, string[]>();

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 5000];

function generateId(): string {
  return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function signPayload(payload: WebhookPayload, secret: string): string {
  const data = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

router.post('/webhooks/register', async (req: Request, res: Response) => {
  try {
    const { url, events } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      res.status(400).json({ error: 'Missing url or events' });
      return;
    }

    const webhookId = generateId();
    const secret = generateSecret();

    const config: WebhookConfig = {
      id: webhookId,
      url,
      events,
      secret,
      createdAt: Date.now(),
      active: true
    };

    webhookStore.set(webhookId, config);

    res.status(201).json({
      id: webhookId,
      secret,
      message: 'Webhook registered successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});

router.get('/webhooks/test', async (_req: Request, res: Response) => {
  try {
    const webhooks = Array.from(webhookStore.values());
    if (webhooks.length === 0) {
      res.status(404).json({ error: 'No webhooks registered' });
      return;
    }

    const testPayload: WebhookPayload = {
      matchId: 'test_match_123',
      players: ['test_user_1', 'test_user_2'],
      score: 85,
      timestamp: Date.now(),
      event: 'test'
    };

    const results = [];

    for (const config of webhooks) {
      if (!config.active) continue;

      const signature = signPayload(testPayload, config.secret);

      try {
        await axios.post(config.url, testPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': 'test'
          },
          timeout: 5000
        });

        results.push({ webhookId: config.id, status: 'success' });
      } catch (err: any) {
        results.push({ webhookId: config.id, status: 'failed', error: err.message });
      }
    }

    res.json({ testPayload, results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to test webhooks' });
  }
});

router.get('/webhooks', async (_req: Request, res: Response) => {
  try {
    const webhooks: Omit<WebhookConfig, 'secret'>[] = [];

    for (const config of webhookStore.values()) {
      const { secret, ...configWithoutSecret } = config;
      webhooks.push(configWithoutSecret);
    }

    res.json({ webhooks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

router.delete('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!webhookStore.has(id)) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    webhookStore.delete(id);
    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

export async function triggerWebhook(event: string, payload: WebhookPayload): Promise<void> {
  for (const config of webhookStore.values()) {
    if (!config.active) continue;
    if (!config.events.includes(event)) continue;

    const signature = signPayload(payload, config.secret);
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event': event
    };

    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await axios.post(config.url, payload, { headers, timeout: 5000 });
        success = true;
        break;
      } catch (err: any) {
        console.log(`Webhook attempt ${attempt + 1} failed:`, err.message);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        }
      }
    }

    await logWebhookCall(config.id, event, payload, success);
  }
}

async function logWebhookCall(
  webhookId: string,
  event: string,
  payload: WebhookPayload,
  success: boolean
): Promise<void> {
  const logKey = `${WEBHOOK_LOG_PREFIX}:${webhookId}`;
  const logEntry = JSON.stringify({
    event,
    payload,
    success,
    timestamp: Date.now()
  });

  const logs = webhookLogStore.get(logKey) || [];
  logs.unshift(logEntry);
  webhookLogStore.set(logKey, logs.slice(0, 100));
}

export default router;
export { router as webhookRoutes };