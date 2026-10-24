import { Link, useLocation } from 'react-router-dom';
import { Button } from '../components/Button';
import { EmailStatusCell, EmailTable, Truncate, type EmailTableColumn } from '../components/EmailTable';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { TableSkeleton } from '../components/TableSkeleton';
import { useDashboardEmails } from '../hooks/useDashboardEmails';
import type { ScheduledEmail } from '../types/email';
import { formatScheduledAt, formatSentAt } from '../utils/datetime';

const scheduledColumns: EmailTableColumn[] = [
  { key: 'recipient', header: 'Recipient', render: (email) => <Truncate>{email.recipient}</Truncate> },
  { key: 'subject', header: 'Subject', render: (email) => <Truncate>{email.subject}</Truncate> },
  { key: 'scheduledAt', header: 'Scheduled for', render: (email) => formatScheduledAt(email.scheduledAt) },
  { key: 'status', header: 'Status', render: (email) => <EmailStatusCell email={email} /> },
];

const sentColumns: EmailTableColumn[] = [
  { key: 'recipient', header: 'Recipient', render: (email) => <Truncate>{email.recipient}</Truncate> },
  { key: 'subject', header: 'Subject', render: (email) => <Truncate>{email.subject}</Truncate> },
  { key: 'sentAt', header: 'Sent at', render: (email) => formatSentAt(email.sentAt) },
  { key: 'status', header: 'Status', render: (email) => <EmailStatusCell email={email} /> },
];

const failedColumns: EmailTableColumn[] = [
  { key: 'recipient', header: 'Recipient', render: (email) => <Truncate>{email.recipient}</Truncate> },
  { key: 'subject', header: 'Subject', render: (email) => <Truncate>{email.subject}</Truncate> },
  {
    key: 'reason',
    header: 'Failure reason',
    render: (email) => <span className="max-w-xs text-slate-600">{email.failureReason ?? 'Delivery failed'}</span>,
  },
  { key: 'updated', header: 'Updated', render: (email) => formatScheduledAt(email.updatedAt) },
  { key: 'status', header: 'Status', render: (email) => <EmailStatusCell email={email} /> },
];

function ComposeLink() {
  return (
    <Link
      to="/compose"
      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
    >
      Compose email
    </Link>
  );
}

function Section({
  title,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  emails,
  columns,
  caption,
  onRetry,
  showComposeCta,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyDescription?: string;
  emails: ScheduledEmail[];
  columns: EmailTableColumn[];
  caption: string;
  onRetry: () => void;
  showComposeCta?: boolean;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">
        {loading ? <TableSkeleton columns={columns.length} /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => void onRetry()} /> : null}
        {!loading && !error && emails.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={showComposeCta ? <ComposeLink /> : undefined}
          />
        ) : null}
        {!loading && !error && emails.length > 0 ? (
          <EmailTable emails={emails} columns={columns} caption={caption} />
        ) : null}
      </div>
    </section>
  );
}

export function DashboardPage() {
  const location = useLocation();
  const { data, loading, error, refresh } = useDashboardEmails();
  const successMessage =
    typeof location.state === 'object' &&
    location.state !== null &&
    'notice' in location.state &&
    typeof location.state.notice === 'string'
      ? location.state.notice
      : null;

  const scheduled = data?.scheduled ?? [];
  const sent = data?.sent ?? [];
  const failed = data?.failed ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Review scheduled, sent, and failed deliveries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </Button>
          <ComposeLink />
        </div>
      </div>

      {successMessage ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {successMessage}
        </p>
      ) : null}

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Scheduled', value: loading ? '—' : scheduled.length },
          { label: 'Sent', value: loading ? '—' : sent.length },
          { label: 'Failed', value: loading ? '—' : failed.length },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <dt className="text-sm text-slate-500">{card.label}</dt>
            <dd className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</dd>
          </div>
        ))}
      </dl>

      <Section
        title="Scheduled emails"
        loading={loading}
        error={error ? 'Unable to load scheduled emails.' : null}
        emptyTitle="You don't have any scheduled emails yet."
        emptyDescription="Schedule a message and it will appear here until the worker sends it."
        emails={scheduled}
        columns={scheduledColumns}
        caption="Scheduled emails"
        onRetry={refresh}
        showComposeCta
      />

      <Section
        title="Sent emails"
        loading={loading}
        error={error ? 'Unable to load sent emails.' : null}
        emptyTitle="No emails have been sent yet."
        emptyDescription="After the worker delivers a message, it will show up here."
        emails={sent}
        columns={sentColumns}
        caption="Sent emails"
        onRetry={refresh}
      />

      <Section
        title="Failed emails"
        loading={loading}
        error={error ? 'Unable to load failed emails.' : null}
        emptyTitle="No failed deliveries."
        emails={failed}
        columns={failedColumns}
        caption="Failed emails"
        onRetry={refresh}
      />
    </div>
  );
}
