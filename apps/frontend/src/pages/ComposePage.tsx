import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { TextArea } from '../components/TextArea';
import { TextField } from '../components/TextField';
import { createCampaign } from '../services/campaigns';
import { createEmail } from '../services/emails';
import { getApiErrorMessage } from '../utils/api-errors';
import {
  defaultScheduleParts,
  formatScheduledAt,
  isLocalDateTimeInPast,
  toIsoFromLocalDateTime,
} from '../utils/datetime';

const RECIPIENT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ComposeMode = 'single' | 'campaign';

type SingleFieldErrors = {
  recipient?: string;
  subject?: string;
  body?: string;
  date?: string;
  time?: string;
};

type CampaignFieldErrors = SingleFieldErrors & {
  recipients?: string;
  minDelaySeconds?: string;
  hourlyQuota?: string;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `campaign-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ComposePage() {
  const navigate = useNavigate();
  const defaults = defaultScheduleParts();
  const [mode, setMode] = useState<ComposeMode>('single');
  const campaignIdempotencyKey = useRef(createIdempotencyKey());

  const [recipient, setRecipient] = useState('');
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [minDelaySeconds, setMinDelaySeconds] = useState('5');
  const [hourlyQuota, setHourlyQuota] = useState('100');
  const [fieldErrors, setFieldErrors] = useState<CampaignFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const recipientHint = useMemo(() => {
    if (!recipients.trim()) {
      return 'Paste addresses or upload a CSV/text file. The server validates and deduplicates recipients.';
    }
    const lineCount = recipients.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    return `${lineCount} non-empty line(s) in the upload. Final recipient count is determined by the server.`;
  }, [recipients]);

  function validateSharedFields(): CampaignFieldErrors {
    const next: CampaignFieldErrors = {};
    if (!subject.trim()) {
      next.subject = 'Subject is required.';
    }
    if (!body.trim()) {
      next.body = 'Body is required.';
    }
    if (!date) {
      next.date = 'Date is required.';
    }
    if (!time) {
      next.time = 'Time is required.';
    }
    if (date && time && isLocalDateTimeInPast(date, time)) {
      next.time = 'Please choose a future time.';
    }
    return next;
  }

  function validateSingle(): SingleFieldErrors {
    const next = validateSharedFields();
    if (!recipient.trim()) {
      next.recipient = 'Recipient is required.';
    } else if (!RECIPIENT_PATTERN.test(recipient.trim())) {
      next.recipient = 'Enter a valid email address.';
    }
    return next;
  }

  function validateCampaign(): CampaignFieldErrors {
    const next = validateSharedFields();
    if (!recipients.trim()) {
      next.recipients = 'Add at least one recipient line or upload a file.';
    }
    const delay = Number(minDelaySeconds);
    if (!Number.isFinite(delay) || delay < 0) {
      next.minDelaySeconds = 'Enter a non-negative delay in seconds.';
    }
    const quota = Number(hourlyQuota);
    if (!Number.isInteger(quota) || quota < 1) {
      next.hourlyQuota = 'Hourly quota must be at least 1.';
    }
    return next;
  }

  async function handleRecipientsFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setRecipients(text);
    setFormNotice(`Loaded ${file.name}. Review the list below before scheduling.`);
    event.target.value = '';
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const nextErrors = mode === 'single' ? validateSingle() : validateCampaign();
    setFieldErrors(nextErrors);
    setFormError(null);
    setFormNotice(null);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const scheduledAt = toIsoFromLocalDateTime(date, time);
      if (mode === 'single') {
        await createEmail({
          recipient: recipient.trim(),
          subject: subject.trim(),
          body: body.trim(),
          scheduledAt,
        });
        navigate('/dashboard', {
          replace: true,
          state: {
            notice: `Email scheduled successfully. Scheduled for ${formatScheduledAt(scheduledAt)}.`,
          },
        });
        return;
      }

      const result = await createCampaign({
        subject: subject.trim(),
        body: body.trim(),
        startAt: scheduledAt,
        minDelayMs: Math.round(Number(minDelaySeconds) * 1000),
        hourlyQuota: Number(hourlyQuota),
        recipients,
        idempotencyKey: campaignIdempotencyKey.current,
      });

      const warning =
        result.invalidLines && result.invalidLines.length > 0
          ? ` ${result.invalidLines.length} line(s) were skipped as invalid.`
          : '';

      navigate('/dashboard', {
        replace: true,
        state: {
          notice: `Campaign scheduled for ${result.recipientCount} recipient(s) starting ${formatScheduledAt(result.startAt)}.${warning}`,
        },
      });
    } catch (submitError) {
      setFormError(getApiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Compose</h1>
      <p className="mt-1 text-sm text-slate-600">
        Schedule a single email or upload a recipient list for a staggered campaign. Times use your local timezone and
        are stored as UTC on the server.
      </p>

      <div className="mt-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === 'single' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
          onClick={() => setMode('single')}
        >
          Single email
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === 'campaign' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
          onClick={() => setMode('campaign')}
        >
          Campaign
        </button>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        {mode === 'single' ? (
          <TextField
            label="Recipient"
            name="recipient"
            type="email"
            autoComplete="email"
            value={recipient}
            error={fieldErrors.recipient}
            onChange={(event) => setRecipient(event.target.value)}
          />
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="recipientFile">
                Recipient file (CSV or text)
              </label>
              <input
                id="recipientFile"
                name="recipientFile"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                onChange={(event) => void handleRecipientsFile(event)}
              />
              <p className="mt-1 text-xs text-slate-500">{recipientHint}</p>
            </div>
            <TextArea
              label="Recipients"
              name="recipients"
              value={recipients}
              error={fieldErrors.recipients}
              onChange={(event) => setRecipients(event.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Minimum delay between sends (seconds)"
                name="minDelaySeconds"
                type="number"
                min={0}
                step={1}
                value={minDelaySeconds}
                error={fieldErrors.minDelaySeconds}
                onChange={(event) => setMinDelaySeconds(event.target.value)}
              />
              <TextField
                label="Hourly quota"
                name="hourlyQuota"
                type="number"
                min={1}
                step={1}
                value={hourlyQuota}
                error={fieldErrors.hourlyQuota}
                onChange={(event) => setHourlyQuota(event.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500">
              Hourly quota is saved with the campaign and will be enforced in a later phase. Sends are staggered by the
              minimum delay from the campaign start time.
            </p>
          </>
        )}

        <TextField
          label="Subject"
          name="subject"
          value={subject}
          error={fieldErrors.subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <TextArea
          label="Body"
          name="body"
          value={body}
          error={fieldErrors.body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={mode === 'single' ? 'Scheduled date' : 'Campaign start date'}
            name="scheduledDate"
            type="date"
            value={date}
            error={fieldErrors.date}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextField
            label={mode === 'single' ? 'Scheduled time' : 'Campaign start time'}
            name="scheduledTime"
            type="time"
            value={time}
            error={fieldErrors.time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>

        {formNotice ? (
          <p className="text-sm text-slate-600" role="status">
            {formNotice}
          </p>
        ) : null}

        {formError ? (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting}>
          {submitting
            ? mode === 'single'
              ? 'Scheduling…'
              : 'Creating campaign…'
            : mode === 'single'
              ? 'Schedule email'
              : 'Schedule campaign'}
        </Button>
      </form>
    </section>
  );
}
