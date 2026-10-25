import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Application } from 'express';
import { API_PREFIX } from '../config/constants';
import { bullBoardAuth } from '../middleware/bull-board-auth';
import { getEmailQueue } from './email.queue';

const DASHBOARD_BASE_PATH = `${API_PREFIX}/admin/queues`;

export function mountQueueDashboard(app: Application): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(DASHBOARD_BASE_PATH);

  const emailQueue = getEmailQueue();
  const adapter = new BullMQAdapter(emailQueue, {
    readOnlyMode: true,
  });

  createBullBoard({
    queues: [adapter],
    serverAdapter,
  });

  app.use(DASHBOARD_BASE_PATH, bullBoardAuth, serverAdapter.getRouter());
}

export function getQueueDashboardPath(): string {
  return DASHBOARD_BASE_PATH;
}
