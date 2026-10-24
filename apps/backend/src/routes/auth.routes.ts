import { Router } from 'express';
import { login, me, register } from '../controllers/auth.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { loginBodySchema, registerBodySchema } from '../validation/auth.schema';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerBodySchema), asyncHandler(register));
authRouter.post('/login', validateBody(loginBodySchema), asyncHandler(login));
authRouter.get('/me', authenticate, asyncHandler(me));
