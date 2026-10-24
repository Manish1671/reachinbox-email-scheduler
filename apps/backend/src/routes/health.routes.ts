import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';
import { asyncHandler } from '../middleware/async-handler';
import { validateQuery } from '../middleware/validate';
import { healthQuerySchema } from '../types/health';

export const healthRouter = Router();

healthRouter.get('/', validateQuery(healthQuerySchema), asyncHandler(getHealth));
