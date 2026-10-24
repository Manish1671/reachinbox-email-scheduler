import { env } from './env';

export function getCorsOrigins(): string[] {
  const origins = new Set<string>([env.FRONTEND_URL]);
  const parsed = new URL(env.FRONTEND_URL);

  if (parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'localhost';
    origins.add(parsed.origin);
  } else if (parsed.hostname === 'localhost') {
    parsed.hostname = '127.0.0.1';
    origins.add(parsed.origin);
  }

  return [...origins];
}
