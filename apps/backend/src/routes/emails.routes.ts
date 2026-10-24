import { Router } from 'express';
import {
  createEmail,
  getEmail,
  listEmails,
  listScheduledEmails,
  listSentEmails,
} from '../controllers/email.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  createEmailBodySchema,
  emailIdParamsSchema,
  listEmailsQuerySchema,
} from '../validation/email.schema';

export const emailRouter = Router();

emailRouter.use(authenticate);

emailRouter.post('/', validateBody(createEmailBodySchema), asyncHandler(createEmail));
emailRouter.get('/scheduled', asyncHandler(listScheduledEmails));
emailRouter.get('/sent', asyncHandler(listSentEmails));
emailRouter.get('/', validateQuery(listEmailsQuerySchema), asyncHandler(listEmails));
emailRouter.get('/:id', validateParams(emailIdParamsSchema), asyncHandler(getEmail));
