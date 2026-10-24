import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { TextArea } from '../components/TextArea';
import { TextField } from '../components/TextField';
import { createEmail } from '../services/emails';
import { getApiErrorMessage } from '../utils/api-errors';
import {
  defaultScheduleParts,
  formatScheduledAt,
  isLocalDateTimeInPast,
  toIsoFromLocalDateTime,
} from '../utils/datetime';

const RECIPIENT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  recipient?: string;
  subject?: string;
  body?: string;
  date?: string;
  time?: string;
};

export function ComposePage() {
  const navigate = useNavigate();
  const defaults = defaultScheduleParts();
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!recipient.trim()) {
      next.recipient = 'Recipient is required.';
    } else if (!RECIPIENT_PATTERN.test(recipient.trim())) {
      next.recipient = 'Enter a valid email address.';
    }
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const nextErrors = validate();
    setFieldErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const scheduledAt = toIsoFromLocalDateTime(date, time);
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
        Schedule a plain-text email. Times are in your local timezone and stored as UTC on the server.
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Recipient"
          name="recipient"
          type="email"
          autoComplete="email"
          value={recipient}
          error={fieldErrors.recipient}
          onChange={(event) => setRecipient(event.target.value)}
        />
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
            label="Scheduled date"
            name="scheduledDate"
            type="date"
            value={date}
            error={fieldErrors.date}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextField
            label="Scheduled time"
            name="scheduledTime"
            type="time"
            value={time}
            error={fieldErrors.time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>

        {formError ? (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Scheduling…' : 'Schedule email'}
        </Button>
      </form>
    </section>
  );
}
