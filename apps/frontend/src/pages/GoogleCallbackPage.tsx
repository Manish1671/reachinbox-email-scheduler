import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../services/api';
import { exchangeGoogleCode } from '../services/auth';
import { storeToken } from '../services/tokenStorage';

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isInitializing } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (isInitializing) {
      return;
    }
    if (user) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(searchParams.get('message') ?? 'Google sign-in failed.');
      return;
    }

    const code = searchParams.get('code');
    if (!code) {
      setError('Missing Google sign-in code.');
      return;
    }

    if (exchangeStarted.current) {
      return;
    }
    exchangeStarted.current = true;

    let cancelled = false;
    void exchangeGoogleCode(code)
      .then((result) => {
        if (cancelled) {
          return;
        }
        storeToken(result.token);
        window.location.assign('/dashboard');
      })
      .catch((submitError) => {
        if (!cancelled) {
          setError(getApiErrorMessage(submitError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isInitializing, navigate, searchParams, user]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Google sign-in</h1>
        <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-slate-900 underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-slate-600">
      Completing Google sign-in…
    </div>
  );
}
