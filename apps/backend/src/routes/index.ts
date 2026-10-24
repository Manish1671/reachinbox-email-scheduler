import { Router } from 'express';
import { authRouter } from './auth.routes';
import { campaignsRouter } from './campaigns.routes';
import { emailRouter } from './emails.routes';
import { healthRouter } from './health.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/emails', emailRouter);
apiRouter.use('/campaigns', campaignsRouter);
