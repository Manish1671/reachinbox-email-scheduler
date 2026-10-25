import type { AddressInfo } from 'node:net';
import { createApp } from '../app';
import { prisma } from '../db/prisma';
import { authService } from '../services/auth.service';
import type { Server } from 'node:http';

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

export function futureIso(msFromNow = 60 * 60 * 1000): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

export function pastIso(msAgo = 60 * 60 * 1000): string {
  return new Date(Date.now() - msAgo).toISOString();
}

export async function createTestUser(label: string) {
  const email = uniqueEmail(label);
  const result = await authService.register({ email, password: 'password123' });
  return { ...result, createdEmail: email };
}

export function startTestServer(): { server: Server; baseUrl: string } {
  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export type ApiJson<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export async function apiRequest<T = unknown>(
  baseUrl: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: ApiJson<T> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      Connection: 'close',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const json = (await response.json()) as ApiJson<T>;
  return { status: response.status, json };
}

export async function deleteUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
