import { api } from './api';
import type { ApiSuccess } from '../types/api';
import type { CreateCampaignInput, CreateCampaignResult, EmailCampaign } from '../types/campaign';

export async function createCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult> {
  const response = await api.post<ApiSuccess<CreateCampaignResult>>('/api/campaigns', input);
  return response.data.data;
}

export async function getCampaigns(): Promise<EmailCampaign[]> {
  const response = await api.get<ApiSuccess<EmailCampaign[]>>('/api/campaigns');
  return response.data.data;
}

export async function getCampaign(id: string): Promise<EmailCampaign> {
  const response = await api.get<ApiSuccess<EmailCampaign>>(`/api/campaigns/${id}`);
  return response.data.data;
}
