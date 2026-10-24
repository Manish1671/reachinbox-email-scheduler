import { api } from './api';
import type { ApiSuccess } from '../types/api';
import type { CreateEmailInput, EmailStatus, ScheduledEmail } from '../types/email';

export async function createEmail(input: CreateEmailInput): Promise<ScheduledEmail> {
  const response = await api.post<ApiSuccess<ScheduledEmail>>('/api/emails', input);
  return response.data.data;
}

export async function getEmails(status?: EmailStatus): Promise<ScheduledEmail[]> {
  const response = await api.get<ApiSuccess<ScheduledEmail[]>>('/api/emails', {
    params: status ? { status } : undefined,
  });
  return response.data.data;
}

export async function getScheduledEmails(): Promise<ScheduledEmail[]> {
  const response = await api.get<ApiSuccess<ScheduledEmail[]>>('/api/emails/scheduled');
  return response.data.data;
}

export async function getSentEmails(): Promise<ScheduledEmail[]> {
  const response = await api.get<ApiSuccess<ScheduledEmail[]>>('/api/emails/sent');
  return response.data.data;
}

export async function getFailedEmails(): Promise<ScheduledEmail[]> {
  return getEmails('FAILED');
}

export async function getEmail(id: string): Promise<ScheduledEmail> {
  const response = await api.get<ApiSuccess<ScheduledEmail>>(`/api/emails/${id}`);
  return response.data.data;
}
