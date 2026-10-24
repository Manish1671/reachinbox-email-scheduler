import { Outlet } from 'react-router-dom';

export function PublicLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Outbox Email Scheduler</p>
        <div className="mt-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
