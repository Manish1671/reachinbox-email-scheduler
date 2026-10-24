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
});

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

  return parsed.data;
}

export const env = loadEnv();
