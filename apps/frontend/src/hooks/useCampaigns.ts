import { useCallback, useEffect, useState } from 'react';
import { getCampaigns } from '../services/campaigns';
import type { EmailCampaign } from '../types/campaign';
import { getApiErrorMessage } from '../utils/api-errors';

export function useCampaigns(): {
  campaigns: EmailCampaign[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCampaigns();
      setCampaigns(data);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { campaigns, loading, error, refresh };
}
