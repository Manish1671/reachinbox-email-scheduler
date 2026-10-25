import type { EmailStatus } from '@prisma/client';
import type { estypes } from '@elastic/elasticsearch';
import { EMAIL_SEARCH_INDEX } from '../search/email-index-document';
import { AppError } from '../utils/app-error';
import { getElasticsearchClient, isElasticsearchConfigured, pingElasticsearch } from './elasticsearch.client';
import { ensureEmailSearchIndex } from './email-search-index.service';

export type EmailSearchInput = {
  userId: string;
  q?: string;
  status?: EmailStatus;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
  sort: 'updatedAt' | 'scheduledAt' | 'sentAt';
};

export type EmailSearchHit = {
  emailId: string;
  recipient: string;
  subject: string;
  bodySnippet: string;
  status: string;
  campaignId: string | null;
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
};

export type EmailSearchResult = {
  available: boolean;
  total: number;
  page: number;
  pageSize: number;
  hits: EmailSearchHit[];
};

export async function searchEmailsForUser(input: EmailSearchInput): Promise<EmailSearchResult> {
  if (!isElasticsearchConfigured()) {
    return { available: false, total: 0, page: input.page, pageSize: input.pageSize, hits: [] };
  }

  const es = getElasticsearchClient();
  if (!es || !(await pingElasticsearch())) {
    return { available: false, total: 0, page: input.page, pageSize: input.pageSize, hits: [] };
  }

  await ensureEmailSearchIndex();

  const must: estypes.QueryDslQueryContainer[] = [{ term: { userId: input.userId } }];
  if (input.status) {
    must.push({ term: { status: input.status } });
  }
  if (input.from || input.to) {
    must.push({
      range: {
        updatedAt: {
          ...(input.from ? { gte: input.from.toISOString() } : {}),
          ...(input.to ? { lte: input.to.toISOString() } : {}),
        },
      },
    });
  }

  const should: estypes.QueryDslQueryContainer[] = [];
  if (input.q?.trim()) {
    should.push(
      { match: { subject: { query: input.q, operator: 'and' } } },
      { match: { bodySnippet: { query: input.q, operator: 'and' } } },
      { term: { recipient: input.q.toLowerCase() } },
    );
  }

  const from = (input.page - 1) * input.pageSize;
  const sortField = input.sort;

  try {
    const response = await es.search({
      index: EMAIL_SEARCH_INDEX,
      from,
      size: input.pageSize,
      query: {
        bool: {
          must,
          ...(should.length > 0 ? { should, minimum_should_match: 1 } : {}),
        },
      },
      sort: [{ [sortField]: { order: 'desc', missing: '_last' } }],
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    const hits: EmailSearchHit[] = response.hits.hits.map((hit) => {
      const source = hit._source as Record<string, unknown>;
      return {
        emailId: String(source.emailId ?? hit._id),
        recipient: String(source.recipient ?? ''),
        subject: String(source.subject ?? ''),
        bodySnippet: String(source.bodySnippet ?? ''),
        status: String(source.status ?? ''),
        campaignId: source.campaignId ? String(source.campaignId) : null,
        scheduledAt: String(source.scheduledAt ?? ''),
        sentAt: source.sentAt ? String(source.sentAt) : null,
        updatedAt: String(source.updatedAt ?? ''),
      };
    });

    return {
      available: true,
      total,
      page: input.page,
      pageSize: input.pageSize,
      hits,
    };
  } catch {
    throw new AppError('SEARCH_UNAVAILABLE', 'Search is temporarily unavailable', 503);
  }
}
