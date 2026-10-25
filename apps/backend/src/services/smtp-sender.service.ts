import { Prisma, SmtpAccountKind, type SmtpSenderAccount } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { redis } from '../queue/redis';
import { AppError } from '../utils/app-error';
import { decryptSecret, encryptSecret } from '../utils/secret-cipher';
import { hasEtherealCredentials } from './email-delivery.service';

export type PublicSmtpSenderAccount = {
  id: string;
  label: string;
  kind: SmtpAccountKind;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  mailFrom: string;
  hourlyQuota: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateSmtpAccountInput = {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  mailFrom: string;
  hourlyQuota: number;
};

const transportCache = new Map<string, Transporter>();

export const ENV_SENDER_LABEL = 'Default (environment)';

function toPublic(account: SmtpSenderAccount): PublicSmtpSenderAccount {
  return {
    id: account.id,
    label: account.label,
    kind: account.kind,
    host: account.host,
    port: account.port,
    secure: account.secure,
    username: account.username,
    mailFrom: account.mailFrom,
    hourlyQuota: account.hourlyQuota,
    enabled: account.enabled,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export async function ensureEnvBackedSenderAccount(userId: string): Promise<SmtpSenderAccount | null> {
  if (!hasEtherealCredentials()) {
    return null;
  }

  const existing = await prisma.smtpSenderAccount.findFirst({
    where: { userId, kind: SmtpAccountKind.ENV },
  });
  if (existing) {
    const envDrift =
      existing.username !== env.ETHEREAL_USER ||
      existing.host !== env.ETHEREAL_HOST ||
      existing.port !== env.ETHEREAL_PORT ||
      existing.secure !== env.ETHEREAL_SECURE ||
      existing.mailFrom !== env.MAIL_FROM;
    if (envDrift) {
      const updated = await prisma.smtpSenderAccount.update({
        where: { id: existing.id },
        data: {
          username: env.ETHEREAL_USER,
          host: env.ETHEREAL_HOST,
          port: env.ETHEREAL_PORT,
          secure: env.ETHEREAL_SECURE,
          mailFrom: env.MAIL_FROM,
        },
      });
      transportCache.delete(updated.id);
      return updated;
    }
    return existing;
  }

  return prisma.smtpSenderAccount.create({
    data: {
      userId,
      label: ENV_SENDER_LABEL,
      kind: SmtpAccountKind.ENV,
      host: env.ETHEREAL_HOST,
      port: env.ETHEREAL_PORT,
      secure: env.ETHEREAL_SECURE,
      username: env.ETHEREAL_USER,
      passwordCipher: null,
      mailFrom: env.MAIL_FROM,
      hourlyQuota: env.DEFAULT_SENDER_HOURLY_QUOTA,
      enabled: true,
    },
  });
}

export async function listSmtpAccountsForUser(userId: string): Promise<PublicSmtpSenderAccount[]> {
  await ensureEnvBackedSenderAccount(userId);
  const accounts = await prisma.smtpSenderAccount.findMany({
    where: { userId },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  });
  return accounts.map(toPublic);
}

export async function createSmtpAccount(
  userId: string,
  input: CreateSmtpAccountInput,
): Promise<PublicSmtpSenderAccount> {
  try {
    const account = await prisma.smtpSenderAccount.create({
      data: {
        userId,
        label: input.label,
        kind: SmtpAccountKind.CUSTOM,
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        passwordCipher: encryptSecret(input.password),
        mailFrom: input.mailFrom,
        hourlyQuota: input.hourlyQuota,
        enabled: true,
      },
    });
    return toPublic(account);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('SMTP_LABEL_IN_USE', 'An SMTP account with this label already exists', 409);
    }
    throw error;
  }
}

export async function setSmtpAccountEnabled(
  userId: string,
  accountId: string,
  enabled: boolean,
): Promise<PublicSmtpSenderAccount> {
  const account = await prisma.smtpSenderAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw new AppError('SMTP_ACCOUNT_NOT_FOUND', 'SMTP account not found', 404);
  }
  if (account.kind === SmtpAccountKind.ENV) {
    throw new AppError('SMTP_ENV_IMMUTABLE', 'The environment-backed sender cannot be disabled', 400);
  }
  const updated = await prisma.smtpSenderAccount.update({
    where: { id: account.id },
    data: { enabled },
  });
  transportCache.delete(updated.id);
  return toPublic(updated);
}

export async function getSmtpAccountForUser(
  userId: string,
  accountId: string,
): Promise<SmtpSenderAccount> {
  const account = await prisma.smtpSenderAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    throw new AppError('SMTP_ACCOUNT_NOT_FOUND', 'SMTP account not found', 404);
  }
  return account;
}

export async function listEligibleSenderAccounts(userId: string): Promise<SmtpSenderAccount[]> {
  await ensureEnvBackedSenderAccount(userId);
  return prisma.smtpSenderAccount.findMany({
    where: { userId, enabled: true },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function selectSenderRoundRobin(userId: string): Promise<SmtpSenderAccount> {
  const accounts = await listEligibleSenderAccounts(userId);
  if (accounts.length === 0) {
    throw new AppError(
      'SMTP_NOT_CONFIGURED',
      'No enabled SMTP sender accounts are configured',
      503,
    );
  }
  const index = Number(await redis.incr(`smtp:rr:${userId}`)) - 1;
  const selected = accounts[index % accounts.length];
  if (!selected) {
    throw new AppError('SMTP_NOT_CONFIGURED', 'No enabled SMTP sender accounts are configured', 503);
  }
  return selected;
}

function resolvePassword(account: SmtpSenderAccount): string {
  if (account.kind === SmtpAccountKind.ENV) {
    if (!env.ETHEREAL_PASS) {
      throw new AppError('SMTP_NOT_CONFIGURED', 'Environment SMTP credentials are missing', 503);
    }
    return env.ETHEREAL_PASS;
  }
  if (!account.passwordCipher) {
    throw new AppError('SMTP_NOT_CONFIGURED', 'SMTP account credentials are missing', 503);
  }
  return decryptSecret(account.passwordCipher);
}

export function getTransportForAccount(account: SmtpSenderAccount): Transporter {
  const cached = transportCache.get(account.id);
  if (cached) {
    return cached;
  }

  const password = resolvePassword(account);
  const transport = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: {
      user: account.username,
      pass: password,
    },
  });
  transportCache.set(account.id, transport);
  return transport;
}

export function clearTransportCache(): void {
  transportCache.clear();
}
