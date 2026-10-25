import type { RedisOptions } from 'ioredis';
import { env } from '../config/env';

/**
 * Build ioredis/BullMQ connection options from a Redis URL (redis:// or rediss://).
 * Includes auth and TLS so managed providers (e.g. Render Key Value) work.
 */
export function buildBullMqConnectionFromUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const options: RedisOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    maxRetriesPerRequest: null,
  };

  if (url.password) {
    options.password = decodeURIComponent(url.password);
  }
  if (url.username) {
    options.username = decodeURIComponent(url.username);
  }
  if (url.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
}

/**
 * Connection options for BullMQ Queue/Worker instances.
 * maxRetriesPerRequest must be null so BullMQ can use blocking Redis commands.
 */
export function getBullMqConnection(): RedisOptions {
  return buildBullMqConnectionFromUrl(env.REDIS_URL);
}
