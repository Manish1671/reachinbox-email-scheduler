import { Router } from 'express';
import {
  createCampaignHandler,
  getCampaign,
  listCampaigns,
} from '../controllers/campaign.controller';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  campaignIdParamsSchema,
  createCampaignBodySchema,
  listCampaignsQuerySchema,
} from '../validation/campaign.schema';

export const campaignsRouter = Router();

campaignsRouter.use(authenticate);

campaignsRouter.post('/', validateBody(createCampaignBodySchema), asyncHandler(createCampaignHandler));
campaignsRouter.get('/', validateQuery(listCampaignsQuerySchema), asyncHandler(listCampaigns));
campaignsRouter.get(
  '/:id',
  validateParams(campaignIdParamsSchema),
  asyncHandler(getCampaign),
);
