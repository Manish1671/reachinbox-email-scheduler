import { api } from './api';
import type { ApiSuccess } from '../types/api';
import type { PublicSmtpAccount, SlackStatus } from '../types/settings';

export async function getSmtpAccounts(): Promise<PublicSmtpAccount[]> {
  const response = await api.get<ApiSuccess<PublicSmtpAccount[]>>('/api/smtp-accounts');
  return response.data.data;
}

export async function createSmtpAccount(input: {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  mailFrom: string;
  hourlyQuota: number;
}): Promise<PublicSmtpAccount> {
  const response = await api.post<ApiSuccess<PublicSmtpAccount>>('/api/smtp-accounts', input);
  return response.data.data;
}

export async function setSmtpAccountEnabled(id: string, enabled: boolean): Promise<PublicSmtpAccount> {
  const response = await api.patch<ApiSuccess<PublicSmtpAccount>>(`/api/smtp-accounts/${id}/enabled`, {
    enabled,
  });
  return response.data.data;
}

export async function getSlackStatus(): Promise<SlackStatus> {
  const response = await api.get<ApiSuccess<SlackStatus>>('/api/slack/status');
  return response.data.data;
}

export async function connectSlack(): Promise<string> {
  const response = await api.get<ApiSuccess<{ url: string }>>('/api/slack/connect');
  return response.data.data.url;
}

export async function disconnectSlack(): Promise<void> {
  await api.delete('/api/slack/disconnect');
}
