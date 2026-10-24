import { api } from './api';
import type { ApiSuccess } from '../types/api';

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthPayload = {
  user: AuthUser;
  token: string;
};

export async function loginRequest(email: string, password: string): Promise<AuthPayload> {
  const response = await api.post<ApiSuccess<AuthPayload>>('/api/auth/login', { email, password });
  return response.data.data;
}

export async function registerRequest(email: string, password: string): Promise<AuthPayload> {
  const response = await api.post<ApiSuccess<AuthPayload>>('/api/auth/register', { email, password });
  return response.data.data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await api.get<ApiSuccess<AuthUser>>('/api/auth/me');
  return response.data.data;
}
