import type { EmailStatus } from '../types/email';

const styles: Record<EmailStatus, string> = {
  SCHEDULED: 'bg-amber-50 text-amber-800 ring-amber-200',
  QUEUED: 'bg-sky-50 text-sky-800 ring-sky-200',
  PROCESSING: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  SENT: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  FAILED: 'bg-red-50 text-red-800 ring-red-200',
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {status}
    </span>
  );
}
