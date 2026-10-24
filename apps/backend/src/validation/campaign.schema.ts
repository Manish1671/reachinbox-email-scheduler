import { z } from 'zod';
import {
  BODY_MAX_LENGTH,
  CAMPAIGN_IDEMPOTENCY_KEY_MAX_LENGTH,
  CAMPAIGN_MAX_DELAY_MS,
  CAMPAIGN_MAX_HOURLY_QUOTA,
  CAMPAIGN_MIN_DELAY_MS,
  CAMPAIGN_MIN_HOURLY_QUOTA,
  CAMPAIGN_RECIPIENTS_MAX_BYTES,
  DEFAULT_CAMPAIGN_LIST_LIMIT,
  MAX_CAMPAIGN_LIST_LIMIT,
  SUBJECT_MAX_LENGTH,
} from '../config/constants';

const isoInstantSchema = z
  .string({ required_error: 'startAt is required' })
  .trim()
  .min(1, 'startAt is required')
  .refine((value) => /[zZ]|[+-]\d{2}:\d{2}$/.test(value), {
    message: 'startAt must be an ISO 8601 timestamp with a timezone (Z or offset)',
  })
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'startAt must be a valid ISO 8601 timestamp',
  })
  .transform((value) => new Date(value));

export const createCampaignBodySchema = z.object({
  subject: z
    .string({ required_error: 'Subject is required' })
    .trim()
    .min(1, 'Subject is required')
    .max(SUBJECT_MAX_LENGTH, `Subject must be at most ${SUBJECT_MAX_LENGTH} characters`),
  body: z
    .string({ required_error: 'Body is required' })
    .trim()
    .min(1, 'Body is required')
    .max(BODY_MAX_LENGTH, `Body must be at most ${BODY_MAX_LENGTH} characters`),
  startAt: isoInstantSchema,
  minDelayMs: z.coerce
    .number()
    .int()
    .min(CAMPAIGN_MIN_DELAY_MS)
    .max(CAMPAIGN_MAX_DELAY_MS, `minDelayMs must be at most ${CAMPAIGN_MAX_DELAY_MS}`),
  hourlyQuota: z.coerce
    .number()
    .int()
    .min(CAMPAIGN_MIN_HOURLY_QUOTA)
    .max(CAMPAIGN_MAX_HOURLY_QUOTA, `hourlyQuota must be at most ${CAMPAIGN_MAX_HOURLY_QUOTA}`),
  recipients: z
    .string({ required_error: 'Recipients are required' })
    .max(
      CAMPAIGN_RECIPIENTS_MAX_BYTES,
      `Recipients payload must be at most ${CAMPAIGN_RECIPIENTS_MAX_BYTES} bytes`,
    ),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(CAMPAIGN_IDEMPOTENCY_KEY_MAX_LENGTH)
    .optional(),
});

export const campaignIdParamsSchema = z.object({
  id: z.string().uuid('Campaign id must be a UUID'),
});

export const listCampaignsQuerySchema = z.object({
  limit: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : Number(value)),
    z
      .number()
      .int()
      .min(1)
      .max(MAX_CAMPAIGN_LIST_LIMIT)
      .optional()
      .default(DEFAULT_CAMPAIGN_LIST_LIMIT),
  ),
});

export type CreateCampaignBody = z.infer<typeof createCampaignBodySchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
