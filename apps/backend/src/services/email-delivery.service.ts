import nodemailer from 'nodemailer';
import type { SentMessageInfo, Transporter } from 'nodemailer';
import { env } from '../config/env';
import { PermanentJobError, RetryableJobError } from '../utils/job-errors';
import { logger } from '../utils/logger';

export type DeliveryMessage = {
  recipient: string;
  subject: string;
  body: string;
};

export type DeliveryResult = {
  messageId?: string;
  previewUrl?: string;
};

export type MailTransport = {
  sendMail: (mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }) => Promise<SentMessageInfo>;
};

const TRANSIENT_SMTP_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNECTION',
  'ESOCKET',
  'ETLS',
  'EAI_AGAIN',
  'EPIPE',
  'EENVELOPE',
]);

export function hasEtherealCredentials(): boolean {
  return Boolean(env.ETHEREAL_USER && env.ETHEREAL_PASS);
}

export function getMailFromAddress(): string {
  return env.MAIL_FROM.includes('@') ? env.MAIL_FROM : env.ETHEREAL_USER;
}

function createEtherealTransport(): Transporter {
  return nodemailer.createTransport({
    host: env.ETHEREAL_HOST,
    port: env.ETHEREAL_PORT,
    secure: env.ETHEREAL_SECURE,
    auth: {
      user: env.ETHEREAL_USER,
      pass: env.ETHEREAL_PASS,
    },
  });
}

let defaultTransport: Transporter | undefined;

function getDefaultTransport(): Transporter {
  if (!defaultTransport) {
    defaultTransport = createEtherealTransport();
  }
  return defaultTransport;
}

export function classifyDeliveryError(error: unknown): RetryableJobError | PermanentJobError {
  if (error instanceof RetryableJobError || error instanceof PermanentJobError) {
    return error;
  }

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const responseCode =
    typeof error === 'object' && error !== null && 'responseCode' in error
      ? Number((error as { responseCode: unknown }).responseCode)
      : undefined;
  const message = error instanceof Error ? error.message : 'Email delivery failed';

  if (TRANSIENT_SMTP_CODES.has(code) || (responseCode !== undefined && responseCode >= 400 && responseCode < 500)) {
    return new RetryableJobError(message, { cause: error });
  }

  if (responseCode !== undefined && responseCode >= 500) {
    return new PermanentJobError(message, { cause: error });
  }

  return new RetryableJobError(message, { cause: error });
}

export async function sendEmail(
  message: DeliveryMessage,
  transport?: MailTransport,
): Promise<DeliveryResult> {
  if (!transport && !hasEtherealCredentials()) {
    throw new PermanentJobError(
      'Ethereal credentials are not configured. Set ETHEREAL_USER and ETHEREAL_PASS.',
    );
  }

  const from = getMailFromAddress();
  if (!from) {
    throw new PermanentJobError('MAIL_FROM is not configured');
  }

  const mailer = transport ?? getDefaultTransport();

  try {
    const info = await mailer.sendMail({
      from,
      to: message.recipient,
      subject: message.subject,
      text: message.body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (typeof previewUrl === 'string') {
      logger.info('Ethereal preview URL', { previewUrl });
    }

    return {
      messageId: typeof info.messageId === 'string' ? info.messageId : undefined,
      previewUrl: typeof previewUrl === 'string' ? previewUrl : undefined,
    };
  } catch (error) {
    throw classifyDeliveryError(error);
  }
}
