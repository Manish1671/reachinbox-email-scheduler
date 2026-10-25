import { env } from '../config/env';
import { AppError } from './app-error';

export function assertQueueDashboardAccess(email: string): void {
  const allowed = env.QUEUE_DASHBOARD_ADMIN_EMAILS;
  if (allowed.length > 0 && !allowed.includes(email.toLowerCase())) {
    throw new AppError('FORBIDDEN', 'Queue dashboard access is restricted', 403);
  }
}
