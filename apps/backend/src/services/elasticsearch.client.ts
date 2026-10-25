import { Client, type ClientOptions } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let client: Client | undefined;
let lastHealthCheck: { ok: boolean; at: number } | undefined;

export function isElasticsearchConfigured(): boolean {
  return env.ELASTICSEARCH_ENABLED && Boolean(env.ELASTICSEARCH_URL);
}

export function getElasticsearchClient(): Client | null {
  if (!isElasticsearchConfigured()) {
    return null;
  }
  if (!client) {
    const options: ClientOptions = {
      node: env.ELASTICSEARCH_URL,
    };
    if (env.ELASTICSEARCH_API_KEY) {
      options.auth = { apiKey: env.ELASTICSEARCH_API_KEY };
    }
    client = new Client(options);
  }
  return client;
}

export async function pingElasticsearch(): Promise<boolean> {
  const es = getElasticsearchClient();
  if (!es) {
    return false;
  }
  try {
    const ok = await es.ping();
    lastHealthCheck = { ok, at: Date.now() };
    return ok;
  } catch (error) {
    logger.warn('[elasticsearch] ping failed', { error });
    lastHealthCheck = { ok: false, at: Date.now() };
    return false;
  }
}

export function getLastElasticsearchHealth(): { ok: boolean; at: number } | undefined {
  return lastHealthCheck;
}
