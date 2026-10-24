import type { Request, Response } from 'express';
import {
  createCampaign,
  getOwnedCampaign,
  listCampaignsForUser,
} from '../services/campaign.service';
import { success } from '../utils/api-response';
import { requireUser } from '../utils/request-user';
import type { CreateCampaignBody, ListCampaignsQuery } from '../validation/campaign.schema';

export async function createCampaignHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const body = req.body as CreateCampaignBody;
  const campaign = await createCampaign(user.id, body);
  res.status(201).json(success(campaign));
}

export async function listCampaigns(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const query = req.query as unknown as ListCampaignsQuery;
  const campaigns = await listCampaignsForUser(user.id, query.limit);
  res.json(success(campaigns));
}

export async function getCampaign(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const campaign = await getOwnedCampaign(req.params.id as string, user.id);
  res.json(success(campaign));
}
