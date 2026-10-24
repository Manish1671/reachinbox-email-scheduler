import { prisma } from '../db/prisma';
import { redis } from '../queue/redis';
import { logger } from '../utils/logger';

export type DependencyStatus = 'connected' | 'disconnected';

async function checkPostgres(): Promise<DependencyStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch (error) {
    logger.warn('Health check: PostgreSQL unreachable', { error });
    return 'disconnected';
  }
}

async function checkRedis(): Promise<DependencyStatus> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG' ? 'connected' : 'disconnected';
  } catch (error) {
    logger.warn('Health check: Redis unreachable', { error });
    return 'disconnected';
  }
}

export async function getHealthStatus(verbose: boolean) {
  const [postgres, redisStatus] = await Promise.all([checkPostgres(), checkRedis()]);
  const healthy = postgres === 'connected' && redisStatus === 'connected';

  const data = {
    status: healthy ? ('ok' as const) : ('degraded' as const),
    service: 'outbox-email-scheduler-api',
    timestamp: new Date().toISOString(),
    dependencies: {
      postgres,
      redis: redisStatus,
    },
  };

  if (!verbose) {
    return {
      status: data.status,
      service: data.service,
      timestamp: data.timestamp,
    };
  }

  return data;
}
