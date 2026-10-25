import { Router } from 'express';
import { login, me, register } from '../controllers/auth.controller';
import {
  googleOAuthCallback,
  googleOAuthExchange,
  googleOAuthStart,
} from '../controllers/google-auth.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { loginBodySchema, registerBodySchema } from '../validation/auth.schema';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerBodySchema), asyncHandler(register));
authRouter.post('/login', validateBody(loginBodySchema), asyncHandler(login));
authRouter.get('/me', authenticate, asyncHandler(me));
authRouter.get('/google/start', asyncHandler(googleOAuthStart));
authRouter.get('/google/callback', asyncHandler(googleOAuthCallback));
authRouter.post('/google/exchange', asyncHandler(googleOAuthExchange));
