export function calculateStaggeredScheduledAt(
  startAt: Date,
  sequenceIndex: number,
  minDelayMs: number,
): Date {
  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
    throw new RangeError('sequenceIndex must be a non-negative integer');
  }

  if (!Number.isFinite(minDelayMs) || minDelayMs < 0) {
    throw new RangeError('minDelayMs must be a non-negative number');
  }

  return new Date(startAt.getTime() + sequenceIndex * minDelayMs);
}
