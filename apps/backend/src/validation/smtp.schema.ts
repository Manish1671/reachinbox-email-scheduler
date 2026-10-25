import { z } from 'zod';
import { CAMPAIGN_MAX_HOURLY_QUOTA, CAMPAIGN_MIN_HOURLY_QUOTA } from '../config/constants';

export const createSmtpAccountBodySchema = z.object({
  label: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1),
  port: z.coerce.number().int().positive(),
  secure: z.coerce.boolean(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  mailFrom: z.string().trim().min(3),
  hourlyQuota: z.coerce
    .number()
    .int()
    .min(CAMPAIGN_MIN_HOURLY_QUOTA)
    .max(CAMPAIGN_MAX_HOURLY_QUOTA),
});

export const smtpAccountIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const updateSmtpEnabledBodySchema = z.object({
  enabled: z.boolean(),
});

export type CreateSmtpAccountBody = z.infer<typeof createSmtpAccountBodySchema>;
