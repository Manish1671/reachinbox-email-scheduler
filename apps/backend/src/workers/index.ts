import { logger } from '../utils/logger';
import { startEmailWorkerRuntime } from './runtime';

async function main(): Promise<void> {
  const runtime = await startEmailWorkerRuntime();

  const exit = async (signal: string): Promise<void> => {
    try {
      await runtime.shutdown(signal);
      process.exit(0);
    } catch (error) {
      logger.error('[worker] error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void exit('SIGINT');
  });
  process.on('SIGTERM', () => {
    void exit('SIGTERM');
  });
}

main().catch((error: unknown) => {
  logger.error('[worker] failed to start', { error });
  process.exit(1);
});
