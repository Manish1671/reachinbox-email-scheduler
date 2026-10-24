import { env } from '../config/env';

/**
 * Connection options for BullMQ Queue/Worker instances.
 * maxRetriesPerRequest must be null so BullMQ can use blocking Redis commands.
 */
export function getBullMqConnection(): {
  host: string;
  port: number;
  maxRetriesPerRequest: null;
} {
  const redisUrl = new URL(env.REDIS_URL);

  return {
    host: redisUrl.hostname,
    port: redisUrl.port ? Number(redisUrl.port) : 6379,
    maxRetriesPerRequest: null,
  };
}
