import { EmailStatus } from '@prisma/client';
import { z } from 'zod';

export const emailSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.nativeEnum(EmailStatus).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  sort: z.enum(['updatedAt', 'scheduledAt', 'sentAt']).default('updatedAt'),
});

export type EmailSearchQuery = z.infer<typeof emailSearchQuerySchema>;
