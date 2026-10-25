import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { SelectField } from '../components/SelectField';
import { StatusBadge } from '../components/StatusBadge';
import { TableSkeleton } from '../components/TableSkeleton';
import { TextField } from '../components/TextField';
import { getApiErrorMessage } from '../services/api';
import { searchEmails, type EmailSearchHit } from '../services/search';
import type { EmailStatus } from '../types/email';
import { formatDateTime } from '../utils/datetime';
import { buildSearchQueryParams, shouldShowSearchUnavailable, type SearchFilters } from '../utils/search-state';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
];

const PAGE_SIZE = 20;

export function SearchPage() {
  const [draft, setDraft] = useState<SearchFilters>({ q: '', status: '', fromDate: '', toDate: '' });
  const [applied, setApplied] = useState<SearchFilters>({ q: '', status: '', fromDate: '', toDate: '' });
  const [page, setPage] = useState(1);
  const [hits, setHits] = useState<EmailSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (filters: SearchFilters, nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = buildSearchQueryParams(filters, nextPage, PAGE_SIZE);
      const result = await searchEmails(params);
      setAvailable(result.available);
      setHits(result.hits);
      setTotal(result.total);
      setPage(result.page);
    } catch (searchError) {
      setError(getApiErrorMessage(searchError));
      setHits([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(applied, 1);
  }, [applied, runSearch]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setApplied({ ...draft });
    setPage(1);
  }

  function handleClearFilters(): void {
    const empty = { q: '', status: '', fromDate: '', toDate: '' };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showUnavailable = shouldShowSearchUnavailable(available, loading);
  const showEmpty =
    !loading && !error && !showUnavailable && hits.length === 0 && (applied.q || applied.status || applied.fromDate || applied.toDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search emails"
        description="Full-text search across your indexed messages. Results may lag behind the dashboard by a short time."
      />

      {showUnavailable ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          <p className="font-medium">Search is temporarily unavailable.</p>
          <p className="mt-1">
            Elasticsearch may be disabled or unreachable. Use the{' '}
            <Link to="/dashboard" className="font-medium underline">dashboard</Link> for live delivery status.
          </p>
        </div>
      ) : null}

      <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
        <div className="sm:col-span-2">
          <TextField
            label="Search"
            name="q"
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Subject, body snippet, or recipient"
          />
        </div>
        <SelectField
          label="Status"
          name="status"
          value={draft.status}
          options={STATUS_OPTIONS}
          onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
        />
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {loading ? 'Searching…' : 'Search'}
          </Button>
          <Button type="button" variant="secondary" onClick={handleClearFilters} disabled={loading}>
            Clear
          </Button>
        </div>
        <TextField
          label="Updated from"
          name="fromDate"
          type="date"
          value={draft.fromDate}
          onChange={(event) => setDraft((prev) => ({ ...prev, fromDate: event.target.value }))}
        />
        <TextField
          label="Updated through"
          name="toDate"
          type="date"
          value={draft.toDate}
          onChange={(event) => setDraft((prev) => ({ ...prev, toDate: event.target.value }))}
        />
      </form>

      {error ? <ErrorState message={error} onRetry={() => void runSearch(applied, page)} /> : null}

      {loading ? <TableSkeleton rows={5} columns={4} /> : null}

      {showEmpty ? (
        <EmptyState title="No matches" description="Try a different query, status, or date range." />
      ) : null}

      {!loading && !error && !showUnavailable && hits.length === 0 && !showEmpty ? (
        <EmptyState
          title="Run a search"
          description="Enter a query or filter and press Search to load indexed emails."
        />
      ) : null}

      {!loading && !error && hits.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hits.map((hit) => (
                <tr key={hit.emailId} className="align-top">
                  <td className="px-4 py-3 text-slate-900">{hit.recipient}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{hit.subject}</div>
                    {hit.bodySnippet ? (
                      <div className="mt-0.5 line-clamp-2 text-slate-500">{hit.bodySnippet}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={hit.status as EmailStatus} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(hit.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && totalPages > 1 && hits.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Page {page} of {totalPages} ({total} results)
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={page <= 1 || loading}
              onClick={() => void runSearch(applied, page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={page >= totalPages || loading}
              onClick={() => void runSearch(applied, page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
