import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import type { AuthResult, PublicUser } from '../types/auth';
import { AppError } from '../utils/app-error';
import { signAccessToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { toPublicUser } from '../utils/public-user';
import type { LoginBody, RegisterBody } from '../validation/auth.schema';

function isUniqueEmailConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export const authService = {
  async register(input: RegisterBody): Promise<AuthResult> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existing) {
      throw new AppError('EMAIL_IN_USE', 'An account with this email already exists', 409);
    }

    const passwordHash = await hashPassword(input.password);

    try {
      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
        },
      });

      return issueAuthResult(user);
    } catch (error) {
      if (isUniqueEmailConstraint(error)) {
        throw new AppError('EMAIL_IN_USE', 'An account with this email already exists', 409);
      }

      throw error;
    }
  },

  async login(input: LoginBody): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    return issueAuthResult(user);
  },
};

function issueAuthResult(user: PublicUser): AuthResult {
  return {
    user: toPublicUser(user),
    token: signAccessToken(user.id),
  };
}
