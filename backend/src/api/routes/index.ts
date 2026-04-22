import { Router, Request, Response } from 'express';
import { userRoutes } from './routes/users';
import { webhookRoutes } from './routes/webhooks';
import { debugRoutes } from './routes/debug';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

router.use(userRoutes);
router.use(webhookRoutes);
router.use(debugRoutes);

export default router;
export { router as apiRoutes };