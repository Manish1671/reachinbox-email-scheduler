import { prisma } from '../db/prisma';
import { EMAIL_SEARCH_INDEX, buildEmailSearchDocument } from '../search/email-index-document';
import {
  getElasticsearchClient,
  isElasticsearchConfigured,
  pingElasticsearch,
} from './elasticsearch.client';
import { logger } from '../utils/logger';

const INDEX_MAPPINGS = {
  mappings: {
    properties: {
      emailId: { type: 'keyword' },
      userId: { type: 'keyword' },
      campaignId: { type: 'keyword' },
      recipient: { type: 'keyword' },
      subject: { type: 'text' },
      bodySnippet: { type: 'text' },
      status: { type: 'keyword' },
      scheduledAt: { type: 'date' },
      sentAt: { type: 'date' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
};

export async function ensureEmailSearchIndex(): Promise<boolean> {
  const es = getElasticsearchClient();
  if (!es) {
    return false;
  }
  const exists = await es.indices.exists({ index: EMAIL_SEARCH_INDEX });
  if (!exists) {
    await es.indices.create({ index: EMAIL_SEARCH_INDEX, ...INDEX_MAPPINGS });
  }
  return true;
}

export async function indexEmailById(emailId: string): Promise<boolean> {
  if (!isElasticsearchConfigured()) {
    return false;
  }

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) {
    return false;
  }

  const es = getElasticsearchClient();
  if (!es) {
    await enqueueSearchOutbox(emailId, 'Elasticsearch client unavailable');
    return false;
  }

  try {
    await ensureEmailSearchIndex();
    const document = buildEmailSearchDocument(email);
    await es.index({
      index: EMAIL_SEARCH_INDEX,
      id: email.id,
      document,
      refresh: false,
    });
    await prisma.emailSearchOutbox.deleteMany({ where: { emailId } });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Index failed';
    await enqueueSearchOutbox(emailId, message);
    logger.warn('[search] index failed', { emailId, error: message });
    return false;
  }
}

export async function enqueueSearchOutbox(emailId: string, lastError?: string): Promise<void> {
  if (!isElasticsearchConfigured()) {
    return;
  }
  await prisma.emailSearchOutbox.upsert({
    where: { emailId },
    create: { emailId, attempts: 0, lastError: lastError ?? null },
    update: {
      attempts: { increment: 1 },
      lastError: lastError ?? null,
    },
  });
}

export async function scheduleCampaignEmailSearchIndex(campaignId: string): Promise<void> {
  if (!isElasticsearchConfigured()) {
    return;
  }
  const emails = await prisma.email.findMany({
    where: { campaignId },
    select: { id: true },
  });
  for (const email of emails) {
    scheduleEmailSearchIndex(email.id);
  }
}

export function scheduleEmailSearchIndex(emailId: string): void {
  if (!isElasticsearchConfigured()) {
    return;
  }
  void indexEmailById(emailId);
}

export async function processEmailSearchOutbox(batchSize = 50): Promise<number> {
  if (!isElasticsearchConfigured() || !(await pingElasticsearch())) {
    return 0;
  }

  const pending = await prisma.emailSearchOutbox.findMany({
    orderBy: { updatedAt: 'asc' },
    take: batchSize,
  });

  let indexed = 0;
  for (const row of pending) {
    const ok = await indexEmailById(row.emailId);
    if (ok) {
      indexed += 1;
    }
  }
  return indexed;
}

export async function reindexUserEmails(
  userId: string,
  batchSize = 100,
  cursor?: string,
): Promise<{ indexed: number; nextCursor: string | null }> {
  const emails = await prisma.email.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    take: batchSize,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  let indexed = 0;
  for (const email of emails) {
    const ok = await indexEmailById(email.id);
    if (ok) {
      indexed += 1;
    }
  }

  const nextCursor = emails.length === batchSize ? emails[emails.length - 1]?.id ?? null : null;
  return { indexed, nextCursor };
}
