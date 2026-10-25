import { Router } from 'express';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { campaignsRouter } from './campaigns.routes';
import { emailRouter } from './emails.routes';
import { healthRouter } from './health.routes';
import { slackRouter } from './slack.routes';
import { smtpRouter } from './smtp.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/emails', emailRouter);
apiRouter.use('/campaigns', campaignsRouter);
apiRouter.use('/smtp-accounts', smtpRouter);
apiRouter.use('/slack', slackRouter);
apiRouter.use('/admin', adminRouter);
