import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { TableSkeleton } from '../components/TableSkeleton';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { openQueueDashboard } from '../services/admin';
import {
  connectSlack,
  createSmtpAccount,
  disconnectSlack,
  getSlackStatus,
  getSmtpAccounts,
  setSmtpAccountEnabled,
} from '../services/settings';
import type { PublicSmtpAccount, SlackStatus } from '../types/settings';
import { getApiErrorMessage } from '../utils/api-errors';

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<PublicSmtpAccount[]>([]);
  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [queueOpening, setQueueOpening] = useState(false);

  const [label, setLabel] = useState('');
  const [host, setHost] = useState('smtp.ethereal.email');
  const [port, setPort] = useState('587');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mailFrom, setMailFrom] = useState('');
  const [hourlyQuota, setHourlyQuota] = useState('100');

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [smtpAccounts, slackStatus] = await Promise.all([getSmtpAccounts(), getSlackStatus()]);
      setAccounts(smtpAccounts);
      setSlack(slackStatus);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const slackParam = searchParams.get('slack');
    if (slackParam === 'connected') {
      setNotice('Slack connected successfully.');
    } else if (slackParam === 'error') {
      setError('Slack connection failed. Please try again.');
    }
  }, [searchParams]);

  async function handleCreateSmtp(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createSmtpAccount({
        label,
        host,
        port: Number(port),
        secure: false,
        username,
        password,
        mailFrom,
        hourlyQuota: Number(hourlyQuota),
      });
      setLabel('');
      setPassword('');
      setNotice('SMTP sender account added.');
      await refresh();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(account: PublicSmtpAccount): Promise<void> {
    if (account.kind === 'ENV' || togglingId) {
      return;
    }
    setTogglingId(account.id);
    setError(null);
    try {
      await setSmtpAccountEnabled(account.id, !account.enabled);
      await refresh();
    } catch (toggleError) {
      setError(getApiErrorMessage(toggleError));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleSlackConnect(): Promise<void> {
    try {
      const url = await connectSlack();
      window.location.href = url;
    } catch (connectError) {
      setError(getApiErrorMessage(connectError));
    }
  }

  async function handleSlackDisconnect(): Promise<void> {
    try {
      await disconnectSlack();
      setNotice('Slack disconnected.');
      await refresh();
    } catch (disconnectError) {
      setError(getApiErrorMessage(disconnectError));
    }
  }

  async function handleOpenQueues(): Promise<void> {
    if (queueOpening) {
      return;
    }
    setQueueOpening(true);
    setError(null);
    try {
      await openQueueDashboard();
    } catch (queueError) {
      setError(getApiErrorMessage(queueError));
    } finally {
      setQueueOpening(false);
    }
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Settings"
        description="Account, SMTP senders, Slack alerts, and operational tools."
      />

      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      ) : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      <section className="rounded-lg border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Account</h2>
        {user ? (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-14 w-14 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-600"
                aria-hidden
              >
                {(user.name ?? user.email).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-slate-900">{user.name ?? 'Signed in user'}</p>
              <p className="text-slate-600">{user.email}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              Sign out
            </Button>
          </div>
        ) : null}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-medium text-slate-900">Queue dashboard</h3>
          <p className="mt-1 text-sm text-slate-600">
            Opens the protected BullMQ dashboard in a new tab using your current session.
          </p>
          <Button className="mt-3" variant="secondary" onClick={() => void handleOpenQueues()} disabled={queueOpening}>
            {queueOpening ? 'Opening…' : 'Open queue dashboard'}
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">SMTP sender accounts</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enabled accounts are selected round-robin for each send. Passwords are stored encrypted and never returned to
          the browser.
        </p>
        <div className="mt-4">
          {loading ? <TableSkeleton columns={5} /> : null}
          {!loading && accounts.length === 0 ? (
            <EmptyState title="No SMTP accounts yet." description="Add a sender or configure Ethereal in the server environment." />
          ) : null}
          {!loading && accounts.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">From</th>
                    <th className="px-4 py-3">Host</th>
                    <th className="px-4 py-3">Hourly quota</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="px-4 py-3">{account.label}</td>
                      <td className="px-4 py-3">{account.mailFrom}</td>
                      <td className="px-4 py-3 text-slate-600">{account.host}</td>
                      <td className="px-4 py-3">{account.hourlyQuota}</td>
                      <td className="px-4 py-3">
                        {account.kind === 'ENV' ? (
                          <span className="text-slate-600">Environment default</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                account.enabled
                                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                                  : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                              }`}
                            >
                              {account.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <Button
                              variant="secondary"
                              disabled={togglingId === account.id}
                              onClick={() => void handleToggle(account)}
                            >
                              {togglingId === account.id ? 'Saving…' : account.enabled ? 'Disable' : 'Enable'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <form className="mt-8 grid max-w-2xl gap-4 rounded-lg border border-slate-200 bg-white p-5" onSubmit={handleCreateSmtp}>
          <h3 className="text-base font-medium text-slate-900">Add custom SMTP sender</h3>
          <TextField label="Label" name="label" value={label} required onChange={(e) => setLabel(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Host" name="host" value={host} required onChange={(e) => setHost(e.target.value)} />
            <TextField label="Port" name="port" type="number" value={port} required onChange={(e) => setPort(e.target.value)} />
          </div>
          <TextField label="Username" name="username" value={username} required onChange={(e) => setUsername(e.target.value)} />
          <TextField
            label="Password"
            name="password"
            type="password"
            value={password}
            required
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField label="Mail from" name="mailFrom" value={mailFrom} required onChange={(e) => setMailFrom(e.target.value)} />
          <TextField
            label="Hourly quota"
            name="hourlyQuota"
            type="number"
            min={1}
            value={hourlyQuota}
            required
            onChange={(e) => setHourlyQuota(e.target.value)}
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Add sender'}
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Slack notifications</h2>
        <p className="mt-1 text-sm text-slate-600">
          Connect Slack to receive debounced alerts when an SMTP sender hits its hourly quota.
        </p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-5 py-4">
          {loading ? <p className="text-sm text-slate-500">Loading Slack status…</p> : null}
          {!loading && slack ? (
            <div className="space-y-3 text-sm">
              <p>
                Status:{' '}
                <strong>{slack.connected ? 'Connected' : 'Not connected'}</strong>
                {!slack.configured ? ' (server OAuth not configured)' : ''}
              </p>
              {slack.connected ? (
                <>
                  <p className="text-slate-600">
                    Workspace: {slack.teamName ?? slack.teamId}
                    {slack.channelName ? ` · Channel: ${slack.channelName}` : ''}
                  </p>
                  <Button variant="secondary" onClick={() => void handleSlackDisconnect()}>
                    Disconnect Slack
                  </Button>
                </>
              ) : (
                <Button onClick={() => void handleSlackConnect()} disabled={!slack.configured}>
                  Connect Slack
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
