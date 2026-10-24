import type { ReactNode } from 'react';
import type { ScheduledEmail } from '../types/email';
import { StatusBadge } from './StatusBadge';

export type EmailTableColumn = {
  key: string;
  header: string;
  className?: string;
  render: (email: ScheduledEmail) => ReactNode;
};

export function EmailTable({
  emails,
  columns,
  caption,
}: {
  emails: ScheduledEmail[];
  columns: EmailTableColumn[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`whitespace-nowrap px-4 py-3 ${column.className ?? ''}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {emails.map((email) => (
            <tr key={email.id} className="align-top">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 text-slate-800 ${column.className ?? ''}`}>
                  {column.render(email)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Truncate({ children }: { children: string }) {
  return (
    <span className="block max-w-[18rem] truncate" title={children}>
      {children}
    </span>
  );
}

export function EmailStatusCell({ email }: { email: ScheduledEmail }) {
  return <StatusBadge status={email.status} />;
}
