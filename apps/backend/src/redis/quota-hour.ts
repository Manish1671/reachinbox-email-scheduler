/**
 * Hourly quota windows use UTC clock hours: bucket key YYYYMMDDHH (UTC).
 * Counters expire after 2 hours so keys do not accumulate forever.
 */

export const QUOTA_COUNTER_TTL_SECONDS = 7_200;

export function getUtcHourBucket(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}${month}${day}${hour}`;
}

export function getNextUtcHourStartMs(date = new Date()): number {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime();
}

export function campaignQuotaCounterKey(campaignId: string, hourBucket: string): string {
  return `quota:campaign:${campaignId}:${hourBucket}`;
}

export function campaignQuotaHoldKey(campaignId: string, emailId: string): string {
  return `quota:hold:campaign:${campaignId}:${emailId}`;
}

export function senderQuotaCounterKey(senderId: string, hourBucket: string): string {
  return `quota:sender:${senderId}:${hourBucket}`;
}

export function senderQuotaHoldKey(senderId: string, emailId: string): string {
  return `quota:hold:sender:${senderId}:${emailId}`;
}
