import { Router, Request, Response } from 'express';
import { userRoutes } from './users';
import { webhookRoutes } from './webhooks';
import { debugRoutes } from './debug';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

router.use(userRoutes);
router.use(webhookRoutes);
router.use(debugRoutes);

export default router;
export { router as apiRoutes };