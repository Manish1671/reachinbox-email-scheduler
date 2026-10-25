import { Router } from 'express';
import {
  createEmail,
  getEmail,
  listEmails,
  listScheduledEmails,
  listSentEmails,
} from '../controllers/email.controller';
import { reindexEmails, searchEmails } from '../controllers/email-search.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  createEmailBodySchema,
  emailIdParamsSchema,
  listEmailsQuerySchema,
} from '../validation/email.schema';
import { emailSearchQuerySchema } from '../validation/email-search.schema';

export const emailRouter = Router();

emailRouter.use(authenticate);

emailRouter.post('/', validateBody(createEmailBodySchema), asyncHandler(createEmail));
emailRouter.get('/scheduled', asyncHandler(listScheduledEmails));
emailRouter.get('/sent', asyncHandler(listSentEmails));
emailRouter.get('/search', validateQuery(emailSearchQuerySchema), asyncHandler(searchEmails));
emailRouter.post('/search/reindex', asyncHandler(reindexEmails));
emailRouter.get('/', validateQuery(listEmailsQuerySchema), asyncHandler(listEmails));
emailRouter.get('/:id', validateParams(emailIdParamsSchema), asyncHandler(getEmail));
