const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  if (!date) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(date);
}

export function formatScheduledAt(value: string | null | undefined): string {
  return formatDateTime(value);
}

export function formatSentAt(value: string | null | undefined): string {
  return formatDateTime(value);
}

export function toIsoFromLocalDateTime(date: string, time: string): string {
  const dateParts = date.split('-').map((part) => Number(part));
  const timeParts = time.split(':').map((part) => Number(part));
  const year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts[2];
  const hours = timeParts[0];
  const minutes = timeParts[1];

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    throw new Error('Invalid date or time');
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

export function defaultScheduleParts(from = new Date(), minutesAhead = 5): { date: string; time: string } {
  const scheduled = new Date(from.getTime() + minutesAhead * 60_000);
  const year = scheduled.getFullYear();
  const month = String(scheduled.getMonth() + 1).padStart(2, '0');
  const day = String(scheduled.getDate()).padStart(2, '0');
  const hours = String(scheduled.getHours()).padStart(2, '0');
  const minutes = String(scheduled.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

export function isLocalDateTimeInPast(date: string, time: string, now = new Date()): boolean {
  try {
    return new Date(toIsoFromLocalDateTime(date, time)).getTime() <= now.getTime();
  } catch {
    return true;
  }
}
