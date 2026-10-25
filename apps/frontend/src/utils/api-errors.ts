import { AxiosError, isAxiosError } from 'axios';
import type { ApiErrorBody } from '../types/api';

export function mapApiError(status?: number, code?: string): string | null {
  if (code === 'INVALID_SCHEDULE_TIME') {
    return 'Please choose a future time.';
  }
  if (code === 'QUEUE_ENQUEUE_FAILED') {
    return 'Your email was saved but could not be queued yet. Please try again later.';
  }
  if (code === 'RECIPIENTS_EMPTY') {
    return 'Add at least one valid recipient address.';
  }
  if (code === 'RECIPIENTS_TOO_LARGE' || code === 'RECIPIENTS_TOO_MANY') {
    return 'The recipient list is too large. Remove some addresses and try again.';
  }
  if (code === 'EMAIL_IN_USE') {
    return 'This email is already registered.';
  }
  if (code === 'INVALID_CREDENTIALS') {
    return 'Invalid email or password.';
  }
  if (code === 'GOOGLE_EMAIL_ALREADY_REGISTERED') {
    return 'This email already has a password account. Sign in with email and password.';
  }
  if (code === 'GOOGLE_NOT_CONFIGURED') {
    return 'Google sign-in is not available on this server.';
  }
  if (code === 'GOOGLE_EXCHANGE_INVALID') {
    return 'Google sign-in expired. Please try again.';
  }
  if (code === 'SEARCH_UNAVAILABLE') {
    return 'Search is temporarily unavailable. Try the dashboard instead.';
  }
  if (code === 'FORBIDDEN') {
    return 'You do not have permission to perform this action.';
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
