import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './db/prisma';
import { closeEmailQueue } from './queue/email.queue';
import { connectRedis, disconnectRedis } from './queue/redis';
import { logger } from './utils/logger';

async function start(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('API server listening', { port: env.PORT, env: env.NODE_ENV });
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('API server shutting down', { signal });

    server.close((closeError) => {
      if (closeError) {
        logger.error('Error closing HTTP server', { error: closeError });
      }
    });

    try {
      await closeEmailQueue();
      await disconnectRedis();
      await disconnectDatabase();
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

start().catch((error: unknown) => {
  logger.error('API server failed to start', { error });
  process.exit(1);
});
