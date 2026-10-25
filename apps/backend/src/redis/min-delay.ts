import type Redis from 'ioredis';

/** Read-only check used before quota reservation (no side effects). */
const MIN_DELAY_PEEK_SCRIPT = `
local last = tonumber(redis.call('GET', KEYS[1])) or 0
local minDelay = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local nextAllowed = last + minDelay
if now < nextAllowed then
  return nextAllowed - now
end
return 0
`;

/**
 * Atomically claims a campaign min-delay slot before SMTP.
 * Sets last-sent to now when the slot is available so concurrent workers cannot pass together.
 */
const MIN_DELAY_ACQUIRE_SCRIPT = `
local last = tonumber(redis.call('GET', KEYS[1])) or 0
local minDelay = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local nextAllowed = last + minDelay
if now < nextAllowed then
  return nextAllowed - now
end
redis.call('SET', KEYS[1], now)
return 0
`;

export function campaignMinDelayKey(campaignId: string): string {
  return `send:campaign:${campaignId}:last-sent-ms`;
}

export async function getCampaignMinDelayWaitMs(
  redis: Redis,
  campaignId: string,
  minDelayMs: number,
  nowMs: number,
): Promise<number> {
  if (minDelayMs <= 0) {
    return 0;
  }
  const waitMs = (await redis.eval(
    MIN_DELAY_PEEK_SCRIPT,
    1,
    campaignMinDelayKey(campaignId),
    String(minDelayMs),
    String(nowMs),
  )) as number;
  return Math.max(0, Number(waitMs));
}

export async function acquireCampaignMinDelaySlot(
  redis: Redis,
  campaignId: string,
  minDelayMs: number,
  nowMs: number,
): Promise<number> {
  if (minDelayMs <= 0) {
    return 0;
  }
  const waitMs = (await redis.eval(
    MIN_DELAY_ACQUIRE_SCRIPT,
    1,
    campaignMinDelayKey(campaignId),
    String(minDelayMs),
    String(nowMs),
  )) as number;
  return Math.max(0, Number(waitMs));
}
