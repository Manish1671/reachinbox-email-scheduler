import { Router } from 'express';
import {
  disconnectSlackHandler,
  getSlackStatus,
  slackOAuthCallback,
  startSlackConnect,
} from '../controllers/slack.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';

export const slackRouter = Router();

slackRouter.get('/callback', asyncHandler(slackOAuthCallback));
slackRouter.get('/status', authenticate, asyncHandler(getSlackStatus));
slackRouter.get('/connect', authenticate, asyncHandler(startSlackConnect));
slackRouter.delete('/disconnect', authenticate, asyncHandler(disconnectSlackHandler));
