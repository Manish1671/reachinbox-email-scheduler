import { Router } from 'express';
import {
  createSmtpAccountHandler,
  listSmtpAccounts,
  updateSmtpAccountEnabled,
} from '../controllers/smtp.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams } from '../middleware/validate';
import {
  createSmtpAccountBodySchema,
  smtpAccountIdParamsSchema,
  updateSmtpEnabledBodySchema,
} from '../validation/smtp.schema';

export const smtpRouter = Router();

smtpRouter.use(authenticate);

smtpRouter.get('/', asyncHandler(listSmtpAccounts));
smtpRouter.post('/', validateBody(createSmtpAccountBodySchema), asyncHandler(createSmtpAccountHandler));
smtpRouter.patch(
  '/:id/enabled',
  validateParams(smtpAccountIdParamsSchema),
  validateBody(updateSmtpEnabledBodySchema),
  asyncHandler(updateSmtpAccountEnabled),
);
