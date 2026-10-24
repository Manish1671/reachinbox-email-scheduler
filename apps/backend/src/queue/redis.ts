import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Shared ioredis client for health checks and non-BullMQ commands.
 * BullMQ Queue/Worker instances should use getBullMqConnection() instead.
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

export const redis = globalForRedis.redis ?? createRedisConnection();

if (env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export async function connectRedis(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== 'PONG') {
    throw new Error(`Unexpected Redis ping response: ${pong}`);
  }
  logger.info('Redis connected');
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'end') {
    return;
  }
  await redis.quit();
}
