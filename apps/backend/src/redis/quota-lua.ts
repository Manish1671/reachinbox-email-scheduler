import type Redis from 'ioredis';
import {
  campaignQuotaCounterKey,
  campaignQuotaHoldKey,
  getUtcHourBucket,
  QUOTA_COUNTER_TTL_SECONDS,
  senderQuotaCounterKey,
  senderQuotaHoldKey,
} from './quota-hour';

export type QuotaReserveResult =
  | { ok: true; alreadyHeld: boolean }
  | { ok: false; reason: 'exhausted' };

const RESERVE_QUOTA_SCRIPT = `
local counterKey = KEYS[1]
local holdKey = KEYS[2]
local limit = tonumber(ARGV[1])
local hourBucket = ARGV[2]
local ttl = tonumber(ARGV[3])

local existing = redis.call('GET', holdKey)
if existing == hourBucket then
  return {1, 1}
end
if existing == 'confirmed:' .. hourBucket then
  return {1, 1}
end

local count = tonumber(redis.call('GET', counterKey)) or 0
if count >= limit then
  return {0, 0}
end

redis.call('INCR', counterKey)
redis.call('EXPIRE', counterKey, ttl)
redis.call('SET', holdKey, hourBucket, 'EX', ttl)
return {1, 0}
`;

const RELEASE_QUOTA_SCRIPT = `
local counterKey = KEYS[1]
local holdKey = KEYS[2]
local hourBucket = ARGV[1]

local existing = redis.call('GET', holdKey)
if existing ~= hourBucket then
  return 0
end

redis.call('DEL', holdKey)
local count = tonumber(redis.call('GET', counterKey)) or 0
if count > 0 then
  redis.call('DECR', counterKey)
end
return 1
`;

const CONFIRM_QUOTA_SCRIPT = `
local holdKey = KEYS[1]
local hourBucket = ARGV[1]
local ttl = tonumber(ARGV[2])
local existing = redis.call('GET', holdKey)
if existing == hourBucket then
  redis.call('SET', holdKey, 'confirmed:' .. hourBucket, 'EX', ttl)
  return 1
end
return 0
`;

export async function reserveHourlyQuota(
  redis: Redis,
  scope: 'campaign' | 'sender',
  scopeId: string,
  emailId: string,
  limit: number,
  now = new Date(),
): Promise<QuotaReserveResult> {
  const hourBucket = getUtcHourBucket(now);
  const counterKey =
    scope === 'campaign'
      ? campaignQuotaCounterKey(scopeId, hourBucket)
      : senderQuotaCounterKey(scopeId, hourBucket);
  const holdKey =
    scope === 'campaign'
      ? campaignQuotaHoldKey(scopeId, emailId)
      : senderQuotaHoldKey(scopeId, emailId);

  const response = (await redis.eval(
    RESERVE_QUOTA_SCRIPT,
    2,
    counterKey,
    holdKey,
    String(limit),
    hourBucket,
    String(QUOTA_COUNTER_TTL_SECONDS),
  )) as [number, number];

  if (response[0] === 1) {
    return { ok: true, alreadyHeld: response[1] === 1 };
  }
  return { ok: false, reason: 'exhausted' };
}

export async function releaseHourlyQuotaReservation(
  redis: Redis,
  scope: 'campaign' | 'sender',
  scopeId: string,
  emailId: string,
  now = new Date(),
): Promise<void> {
  const hourBucket = getUtcHourBucket(now);
  const counterKey =
    scope === 'campaign'
      ? campaignQuotaCounterKey(scopeId, hourBucket)
      : senderQuotaCounterKey(scopeId, hourBucket);
  const holdKey =
    scope === 'campaign'
      ? campaignQuotaHoldKey(scopeId, emailId)
      : senderQuotaHoldKey(scopeId, emailId);

  await redis.eval(RELEASE_QUOTA_SCRIPT, 2, counterKey, holdKey, hourBucket);
}

export async function confirmHourlyQuotaReservation(
  redis: Redis,
  scope: 'campaign' | 'sender',
  scopeId: string,
  emailId: string,
  now = new Date(),
): Promise<void> {
  const hourBucket = getUtcHourBucket(now);
  const holdKey =
    scope === 'campaign'
      ? campaignQuotaHoldKey(scopeId, emailId)
      : senderQuotaHoldKey(scopeId, emailId);

  await redis.eval(
    CONFIRM_QUOTA_SCRIPT,
    1,
    holdKey,
    hourBucket,
    String(QUOTA_COUNTER_TTL_SECONDS),
  );
}
