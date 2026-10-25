import { isAxiosError } from 'axios';
import type { ApiSuccess } from '../types/api';
import { api } from './api';

export async function openQueueDashboard(): Promise<void> {
  try {
    const response = await api.post<ApiSuccess<{ path: string }>>(
      '/api/admin/queues/session',
      {},
      { withCredentials: true },
    );
    const path = response.data.data.path;
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
    window.open(`${base}${path}`, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      throw new Error('Queue dashboard access is restricted for your account.');
    }
    throw error;
  }
}
