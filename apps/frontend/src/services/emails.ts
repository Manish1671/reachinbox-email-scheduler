import { api } from './api';
import type { ApiSuccess } from '../types/api';
import type { CreateEmailInput, EmailStatus, ScheduledEmail } from '../types/email';

export async function createEmail(input: CreateEmailInput): Promise<ScheduledEmail> {
  const response = await api.post<ApiSuccess<ScheduledEmail>>('/api/emails', input);
  return response.data.data;
}

export async function getEmails(
  options: { status?: EmailStatus; limit?: number } = {},
): Promise<ScheduledEmail[]> {
  const response = await api.get<ApiSuccess<ScheduledEmail[]>>('/api/emails', {
    params: {
      ...(options.status ? { status: options.status } : {}),
      ...(options.limit ? { limit: options.limit } : {}),
    },
  });
  return response.data.data;
}

export async function getProcessingEmails(): Promise<ScheduledEmail[]> {
  return getEmails({ status: 'PROCESSING' });
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
  return getEmails({ status: 'FAILED' });
}

export async function getEmail(id: string): Promise<ScheduledEmail> {
  const response = await api.get<ApiSuccess<ScheduledEmail>>(`/api/emails/${id}`);
  return response.data.data;
}
