import { env } from '../config/env';
import { AppError } from '../utils/app-error';

const GOOGLE_ISSUER = 'https://accounts.google.com';

export function validateGoogleIdTokenClaims(claims: Record<string, unknown>): {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
} {
  const iss = typeof claims.iss === 'string' ? claims.iss : '';
  if (iss !== GOOGLE_ISSUER && iss !== `${GOOGLE_ISSUER}/`) {
    throw new AppError('GOOGLE_INVALID_TOKEN', 'Invalid Google token issuer', 401);
  }

  const aud = claims.aud;
  const audienceOk =
    aud === env.GOOGLE_CLIENT_ID ||
    (Array.isArray(aud) && aud.includes(env.GOOGLE_CLIENT_ID));
  if (!audienceOk) {
    throw new AppError('GOOGLE_INVALID_TOKEN', 'Invalid Google token audience', 401);
  }

  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!sub) {
    throw new AppError('GOOGLE_INVALID_TOKEN', 'Google subject is missing', 401);
  }

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (!email) {
    throw new AppError('GOOGLE_INVALID_TOKEN', 'Google email is missing', 401);
  }

  const emailVerified =
    claims.email_verified === true || claims.email_verified === 'true';
  if (!emailVerified) {
    throw new AppError('GOOGLE_EMAIL_NOT_VERIFIED', 'Google email is not verified', 403);
  }

  const exp =
    typeof claims.exp === 'number'
      ? claims.exp
      : typeof claims.exp === 'string'
        ? Number(claims.exp)
        : NaN;
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
    throw new AppError('GOOGLE_INVALID_TOKEN', 'Google token expired', 401);
  }

  return {
    sub,
    email,
    emailVerified,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    picture: typeof claims.picture === 'string' ? claims.picture : undefined,
  };
}
