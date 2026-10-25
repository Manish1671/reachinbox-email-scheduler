import axios, { isAxiosError } from 'axios';
import { clearToken, getStoredToken } from './tokenStorage';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const AUTH_ENDPOINTS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google/exchange',
]);

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      const requestUrl = error.config?.url ?? '';
      const isCredentialRequest = AUTH_ENDPOINTS.has(new URL(requestUrl, 'http://local').pathname);

      if (!isCredentialRequest) {
        clearToken();
        onUnauthorized?.();
      }
    }

    return Promise.reject(error);
  },
);

export { getApiErrorMessage } from '../utils/api-errors';
