import { Router } from 'express';
import { createQueueDashboardSession } from '../controllers/queue-dashboard.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';

export const adminRouter = Router();

adminRouter.post('/queues/session', authenticate, asyncHandler(createQueueDashboardSession));
