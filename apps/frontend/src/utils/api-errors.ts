import { AxiosError, isAxiosError } from 'axios';
import type { ApiErrorBody } from '../types/api';

export function mapApiError(status?: number, code?: string): string | null {
  if (code === 'INVALID_SCHEDULE_TIME') {
    return 'Please choose a future time.';
  }
  if (code === 'QUEUE_ENQUEUE_FAILED') {
    return 'Your email was saved but could not be queued yet. Please try again later.';
  }
  if (code === 'EMAIL_IN_USE') {
    return 'This email is already registered.';
  }
  if (code === 'INVALID_CREDENTIALS') {
    return 'Invalid email or password.';
  }
  if (status === 401) {
    return 'Your session has expired. Please log in again.';
  }
  return null;
}

export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;
    const status = axiosError.response?.status;
    const code = axiosError.response?.data.error.code;
    const mapped = mapApiError(status, code);
    if (mapped) {
      return mapped;
    }

    if (axiosError.response?.data.error.message) {
      return axiosError.response.data.error.message;
    }

    if (!axiosError.response) {
      return 'Unable to reach the server. Please try again.';
    }
  }

  return 'Something went wrong. Please try again.';
}
