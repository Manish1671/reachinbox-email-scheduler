import { Link, useLocation } from 'react-router-dom';
import { Button } from '../components/Button';
import { CampaignStatusBadge } from '../components/CampaignStatusBadge';
import { EmailStatusCell, EmailTable, Truncate, type EmailTableColumn } from '../components/EmailTable';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { TableSkeleton } from '../components/TableSkeleton';
import { useCampaigns } from '../hooks/useCampaigns';
import { useDashboardEmails } from '../hooks/useDashboardEmails';
import type { CreateCampaignResult, EmailCampaign } from '../types/campaign';
import type { ScheduledEmail } from '../types/email';
import { formatScheduledAt, formatSentAt } from '../utils/datetime';

const LIST_LIMIT_NOTE = 'Showing up to 50 records per section (most recent or soonest scheduled).';

const scheduledColumns: EmailTableColumn[] = [
  { key: 'recipient', header: 'Recipient', render: (email) => <Truncate>{email.recipient}</Truncate> },
  { key: 'subject', header: 'Subject', render: (email) => <Truncate>{email.subject}</Truncate> },
  { key: 'scheduledAt', header: 'Scheduled for', render: (email) => formatScheduledAt(email.scheduledAt) },
  {
    key: 'deferral',
    header: 'Deferral',
    render: (email) =>
      email.deferralReason ? (
        <span className="text-xs text-amber-700">{email.deferralReason.replaceAll('_', ' ')}</span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  { key: 'status', header: 'Status', render: (email) => <EmailStatusCell email={email} /> },
];

const processingColumns: EmailTableColumn[] = [
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
      Compose
    </Link>
  );
}

function Section({
  title,
  description,
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
  description?: string;
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
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        <p className="text-xs text-slate-400">{LIST_LIMIT_NOTE}</p>
      </div>
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

function CampaignTable({ campaigns, caption }: { campaigns: EmailCampaign[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Recipients</th>
            <th className="px-4 py-3">Starts</th>
            <th className="px-4 py-3">Pacing</th>
            <th className="px-4 py-3">Progress</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-900">
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td className="px-4 py-3">
                <Truncate>{campaign.subject}</Truncate>
              </td>
              <td className="px-4 py-3">{campaign.recipientCount}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatScheduledAt(campaign.startAt)}</td>
              <td className="px-4 py-3 text-slate-600">
                {campaign.minDelayMs / 1000}s delay · {campaign.hourlyQuota}/hr
              </td>
              <td className="px-4 py-3 text-slate-600">
                {campaign.stats.sent}/{campaign.stats.total} sent
                {campaign.stats.processing > 0 ? ` · ${campaign.stats.processing} processing` : ''}
                {campaign.stats.queued > 0 ? ` · ${campaign.stats.queued} queued` : ''}
                {campaign.stats.failed > 0 ? ` · ${campaign.stats.failed} failed` : ''}
              </td>
              <td className="px-4 py-3">
                <CampaignStatusBadge status={campaign.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DashboardLocationState = {
  notice?: string;
  invalidLines?: CreateCampaignResult['invalidLines'];
  idempotentReplay?: boolean;
};

export function DashboardPage() {
  const location = useLocation();
  const { data, loading, error, refresh } = useDashboardEmails();
  const {
    campaigns,
    loading: campaignsLoading,
    error: campaignsError,
    refresh: refreshCampaigns,
  } = useCampaigns();

  const locationState =
    typeof location.state === 'object' && location.state !== null
      ? (location.state as DashboardLocationState)
      : null;
  const successMessage = locationState?.notice ?? null;
  const invalidLines = locationState?.invalidLines ?? null;

  const scheduled = data?.scheduled ?? [];
  const processing = data?.processing ?? [];
  const sent = data?.sent ?? [];
  const failed = data?.failed ?? [];

  const deferredCount = scheduled.filter((email) => Boolean(email.deferralReason)).length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Campaign progress and email delivery status from the live API."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                void refreshCampaigns();
              }}
              disabled={loading || campaignsLoading}
            >
              Refresh
            </Button>
            <ComposeLink />
          </>
        }
      />

      {successMessage ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {successMessage}
          {locationState?.idempotentReplay ? ' (Existing campaign returned from your idempotency key.)' : ''}
        </p>
      ) : null}

      {invalidLines && invalidLines.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          <p className="font-medium">{invalidLines.length} recipient line(s) were skipped during validation:</p>
          <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
            {invalidLines.slice(0, 20).map((line) => (
              <li key={`${line.line}-${line.reason}`}>
                Line {line.line}: {line.reason}
              </li>
            ))}
          </ul>
          {invalidLines.length > 20 ? <p className="mt-2 text-xs">…and {invalidLines.length - 20} more.</p> : null}
        </div>
      ) : null}

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Campaigns', value: campaignsLoading ? '—' : campaigns.length },
          { label: 'Scheduled / queued', value: loading ? '—' : scheduled.length },
          { label: 'Processing', value: loading ? '—' : processing.length },
          { label: 'Sent', value: loading ? '—' : sent.length },
          { label: 'Failed', value: loading ? '—' : failed.length },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <dt className="text-sm text-slate-500">{card.label}</dt>
            <dd className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</dd>
          </div>
        ))}
      </dl>

      {deferredCount > 0 ? (
        <p className="mt-4 text-sm text-amber-800">
          {deferredCount} scheduled email(s) are temporarily deferred (quota or pacing). See the deferral column below.
        </p>
      ) : null}

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Campaigns</h2>
          <p className="text-xs text-slate-400">{LIST_LIMIT_NOTE}</p>
        </div>
        <div className="mt-4">
          {campaignsLoading ? <TableSkeleton columns={6} /> : null}
          {!campaignsLoading && campaignsError ? (
            <ErrorState message={campaignsError} onRetry={() => void refreshCampaigns()} />
          ) : null}
          {!campaignsLoading && !campaignsError && campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns yet."
              description="Upload a recipient list on the Compose page to schedule a staggered campaign."
              action={<ComposeLink />}
            />
          ) : null}
          {!campaignsLoading && !campaignsError && campaigns.length > 0 ? (
            <CampaignTable campaigns={campaigns} caption="Email campaigns" />
          ) : null}
        </div>
      </section>

      <Section
        title="Scheduled and queued"
        description="Includes SCHEDULED and QUEUED emails waiting for the worker."
        loading={loading}
        error={error}
        emptyTitle="No scheduled or queued emails."
        emptyDescription="Schedule a message and it will appear here until the worker picks it up."
        emails={scheduled}
        columns={scheduledColumns}
        caption="Scheduled and queued emails"
        onRetry={refresh}
        showComposeCta
      />

      <Section
        title="Processing"
        description="Emails currently being sent by the worker."
        loading={loading}
        error={error}
        emptyTitle="Nothing is processing right now."
        emails={processing}
        columns={processingColumns}
        caption="Processing emails"
        onRetry={refresh}
      />

      <Section
        title="Sent"
        loading={loading}
        error={error}
        emptyTitle="No emails have been sent yet."
        emptyDescription="After the worker delivers a message, it will show up here."
        emails={sent}
        columns={sentColumns}
        caption="Sent emails"
        onRetry={refresh}
      />

      <Section
        title="Failed"
        loading={loading}
        error={error}
        emptyTitle="No failed deliveries."
        emails={failed}
        columns={failedColumns}
        caption="Failed emails"
        onRetry={refresh}
      />
    </div>
  );
}
