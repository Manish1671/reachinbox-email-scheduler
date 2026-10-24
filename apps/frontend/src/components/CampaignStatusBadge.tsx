import type { CampaignStatus } from '../types/campaign';

const styles: Record<CampaignStatus, string> = {
  SCHEDULED: 'bg-amber-50 text-amber-800 ring-amber-200',
  QUEUED: 'bg-sky-50 text-sky-800 ring-sky-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  FAILED: 'bg-red-50 text-red-800 ring-red-200',
  PARTIAL: 'bg-orange-50 text-orange-800 ring-orange-200',
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {status}
    </span>
  );
}
