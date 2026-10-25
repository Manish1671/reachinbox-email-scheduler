import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { API_PREFIX, CAMPAIGN_RECIPIENTS_MAX_BYTES } from './config/constants';
import { getCorsOrigins } from './config/cors';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { mountQueueDashboard } from './queue/queue-dashboard';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: getCorsOrigins(),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: `${CAMPAIGN_RECIPIENTS_MAX_BYTES}b` }));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use(API_PREFIX, apiRouter);
  mountQueueDashboard(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
