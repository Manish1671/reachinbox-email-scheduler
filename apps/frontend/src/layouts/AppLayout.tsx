import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { useAuth } from '../hooks/useAuth';
import { openQueueDashboard } from '../services/admin';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
    isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  }`;

export function AppLayout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link to="/dashboard" className="text-sm font-semibold text-slate-900">
            Outbox Email Scheduler
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            <NavLink to="/dashboard" className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/compose" className={navClass}>
              Compose
            </NavLink>
            <NavLink to="/search" className={navClass}>
              Search
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
            <Button variant="ghost" type="button" onClick={() => void openQueueDashboard()}>
              Queues
            </Button>
            {user ? (
              <div className="hidden items-center gap-2 px-2 sm:flex">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                  />
                ) : null}
                <div className="text-sm text-slate-600">
                  <div className="font-medium text-slate-900">{user.name ?? user.email}</div>
                  {user.name ? <div className="text-xs">{user.email}</div> : null}
                </div>
              </div>
            ) : null}
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
