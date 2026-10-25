import type { ApiSuccess } from '../types/api';
import { api } from './api';

export type EmailSearchHit = {
  emailId: string;
  recipient: string;
  subject: string;
  bodySnippet: string;
  status: string;
  campaignId: string | null;
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
};

export type EmailSearchResult = {
  available: boolean;
  total: number;
  page: number;
  pageSize: number;
  hits: EmailSearchHit[];
};

export type EmailSearchParams = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sort?: 'updatedAt' | 'scheduledAt' | 'sentAt';
} & Record<string, string | number | undefined>;

export async function searchEmails(params: EmailSearchParams): Promise<EmailSearchResult> {
  const response = await api.get<ApiSuccess<EmailSearchResult>>('/api/emails/search', {
    params,
  });
  return response.data.data;
}
