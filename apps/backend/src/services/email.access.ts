import { prisma } from '../db/prisma';
import { AppError } from '../utils/app-error';

/**
 * Email lookups for HTTP handlers must always be scoped to the authenticated user.
 * Never query by email id alone — a client-supplied userId is not an ownership check.
 */
export async function getEmailByIdForUser(emailId: string, ownerId: string) {
  const email = await prisma.email.findFirst({
    where: {
      id: emailId,
      userId: ownerId,
    },
  });

  if (!email) {
    throw new AppError('NOT_FOUND', 'Email not found', 404);
  }

  return email;
}

export function ownedByUser(ownerId: string) {
  return { userId: ownerId } as const;
}
