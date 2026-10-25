import { z } from 'zod';
import './load-env';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  FRONTEND_URL: z.string().url().default('http://127.0.0.1:5173'),
  ETHEREAL_HOST: z.string().min(1).default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().int().positive().default(587),
  ETHEREAL_USER: z.string().optional().default(''),
  ETHEREAL_PASS: z.string().optional().default(''),
  ETHEREAL_SECURE: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
    .optional()
    .default('false')
    .transform((value) => value === true || value === 'true' || value === '1'),
  MAIL_FROM: z.string().min(1).default('Outbox Scheduler <no-reply@ethereal.email>'),
  EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(2),
  EMAIL_RATE_LIMIT_DURATION_MS: z.coerce.number().int().positive().default(1000),
  EMAIL_PROCESSING_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  CREDENTIALS_ENCRYPTION_KEY: z.string().min(16).optional(),
  DEFAULT_SENDER_HOURLY_QUOTA: z.coerce.number().int().positive().default(200),
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().optional().default(''),
  SLACK_SCOPES: z.string().min(1).default('incoming-webhook,chat:write'),
  SLACK_NOTIFY_DEBOUNCE_MS: z.coerce.number().int().positive().default(300_000),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().optional().default(''),
  GOOGLE_FRONTEND_CALLBACK_URL: z.string().optional().default(''),
  ELASTICSEARCH_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
    .optional()
    .default('false')
    .transform((value) => value === true || value === 'true' || value === '1'),
  ELASTICSEARCH_URL: z.string().optional().default(''),
  ELASTICSEARCH_API_KEY: z.string().optional().default(''),
  QUEUE_DASHBOARD_ADMIN_EMAILS: z.string().optional().default(''),
}).transform((value) => ({
  ...value,
  CREDENTIALS_ENCRYPTION_KEY: value.CREDENTIALS_ENCRYPTION_KEY ?? value.JWT_SECRET,
  SLACK_REDIRECT_URI:
    value.SLACK_REDIRECT_URI && value.SLACK_REDIRECT_URI.length > 0
      ? value.SLACK_REDIRECT_URI
      : `http://127.0.0.1:${value.PORT}/api/slack/callback`,
  GOOGLE_REDIRECT_URI:
    value.GOOGLE_REDIRECT_URI && value.GOOGLE_REDIRECT_URI.length > 0
      ? value.GOOGLE_REDIRECT_URI
      : `http://127.0.0.1:${value.PORT}/api/auth/google/callback`,
  GOOGLE_FRONTEND_CALLBACK_URL:
    value.GOOGLE_FRONTEND_CALLBACK_URL && value.GOOGLE_FRONTEND_CALLBACK_URL.length > 0
      ? value.GOOGLE_FRONTEND_CALLBACK_URL
      : `${value.FRONTEND_URL}/auth/google/callback`,
  QUEUE_DASHBOARD_ADMIN_EMAILS: value.QUEUE_DASHBOARD_ADMIN_EMAILS
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0),
}));

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    const message = Object.entries(details)
      .map(([key, errors]) => `${key}: ${errors?.join(', ') ?? 'invalid'}`)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${message}`);
  }

  const data = parsed.data;
  if (data.NODE_ENV === 'production' && !process.env.CREDENTIALS_ENCRYPTION_KEY?.trim()) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must be set explicitly when NODE_ENV=production',
    );
  }

  return data;
}

export const env = loadEnv();
