import { useCallback, useEffect, useState } from 'react';
import {
  getFailedEmails,
  getProcessingEmails,
  getScheduledEmails,
  getSentEmails,
} from '../services/emails';
import type { ScheduledEmail } from '../types/email';
import { getApiErrorMessage } from '../utils/api-errors';

export type DashboardData = {
  scheduled: ScheduledEmail[];
  processing: ScheduledEmail[];
  sent: ScheduledEmail[];
  failed: ScheduledEmail[];
};

type DashboardState = {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
};

export function useDashboardEmails(): DashboardState & { refresh: () => Promise<void> } {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduled, processing, sent, failed] = await Promise.all([
        getScheduledEmails(),
        getProcessingEmails(),
        getSentEmails(),
        getFailedEmails(),
      ]);
      setData({ scheduled, processing, sent, failed });
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
