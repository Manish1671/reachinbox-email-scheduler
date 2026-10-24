import { EmailStatus } from '@prisma/client';
import { z } from 'zod';
import {
  BODY_MAX_LENGTH,
  DEFAULT_EMAIL_LIST_LIMIT,
  MAX_EMAIL_LIST_LIMIT,
  SUBJECT_MAX_LENGTH,
} from '../config/constants';

const recipientSchema = z
  .string({ required_error: 'Recipient is required' })
  .trim()
  .min(1, 'Recipient is required')
  .toLowerCase()
  .email('Enter a valid recipient email address');

/**
 * Require an explicit timezone (Z or numeric offset) so the API never
 * interprets a timezone-less local datetime.
 */
const isoInstantSchema = z
  .string({ required_error: 'scheduledAt is required' })
  .trim()
  .min(1, 'scheduledAt is required')
  .refine((value) => /[zZ]|[+-]\d{2}:\d{2}$/.test(value), {
    message: 'scheduledAt must be an ISO 8601 timestamp with a timezone (Z or offset)',
  })
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'scheduledAt must be a valid ISO 8601 timestamp',
  })
  .transform((value) => new Date(value));

export const createEmailBodySchema = z.object({
  recipient: recipientSchema,
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
  scheduledAt: isoInstantSchema,
});

export const emailIdParamsSchema = z.object({
  id: z.string().uuid('Email id must be a UUID'),
});

export const listEmailsQuerySchema = z.object({
  status: z.nativeEnum(EmailStatus).optional(),
  limit: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : Number(value)),
    z.number().int().min(1).max(MAX_EMAIL_LIST_LIMIT).optional().default(DEFAULT_EMAIL_LIST_LIMIT),
  ),
});

export type CreateEmailBody = z.infer<typeof createEmailBodySchema>;
export type ListEmailsQuery = z.infer<typeof listEmailsQuerySchema>;
