import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../services/api';

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-slate-600">Sign in to schedule and review emails.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-4">
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={submitting}
          onClick={() => {
            setError(null);
            setSubmitting(true);
            void loginWithGoogle().catch((submitError) => {
              setError(getApiErrorMessage(submitError));
              setSubmitting(false);
            });
          }}
        >
          Continue with Google
        </Button>
      </div>

      <p className="mt-6 text-sm">
        Need an account?{' '}
        <Link to="/register" className="font-medium text-slate-900 underline">
          Register
        </Link>
      </p>
    </div>
  );
}
