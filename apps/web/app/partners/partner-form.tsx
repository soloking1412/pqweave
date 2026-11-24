'use client';

import { type FormEvent, useState } from 'react';

const PARTNER_TYPES = ['Wallet', 'Exchange', 'Custodian', 'Infrastructure', 'Other'] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Status = 'idle' | 'sending' | 'sent' | 'error';

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

const inputClass =
  'w-full rounded-control bg-well px-4 py-3 text-sm text-ink outline-none ring-1 ring-rule transition placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-brand/60 aria-[invalid=true]:ring-danger/60';

export function PartnerForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    handle: '',
    type: PARTNER_TYPES[0] as string,
    message: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = 'Tell us your name.';
    if (!EMAIL.test(form.email)) next.email = 'Enter a valid email.';
    if (form.message.trim().length < 10) next.message = 'A sentence or two helps us route you.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    if (!validate()) return;

    setStatus('sending');
    try {
      const response = await fetch('/api/partner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setServerError(data.error ?? 'Something went wrong.');
        setStatus('error');
      } else {
        setStatus('sent');
      }
    } catch {
      setServerError('Network error. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-panel border border-ok/30 bg-ok/10 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/20 text-2xl text-ok">
          ✓
        </div>
        <h2 className="mt-4 text-xl font-semibold text-ink">Thanks. We&apos;ll be in touch</h2>
        <p className="mt-2 text-sm text-ink-2">
          We read every partnership note and reply within a couple of business days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <input
            id="name"
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            aria-invalid={Boolean(errors.name)}
            className={inputClass}
            placeholder="Satoshi N."
          />
        </Field>
        <Field label="Work email" htmlFor="email" error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            aria-invalid={Boolean(errors.email)}
            className={inputClass}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Organization" htmlFor="organization" optional>
          <input
            id="organization"
            name="organization"
            autoComplete="organization"
            value={form.organization}
            onChange={(e) => update('organization', e.target.value)}
            className={inputClass}
            placeholder="Company or project"
          />
        </Field>
        <Field label="Telegram or X" htmlFor="handle" optional>
          <input
            id="handle"
            name="handle"
            value={form.handle}
            onChange={(e) => update('handle', e.target.value)}
            className={inputClass}
            placeholder="@handle"
          />
        </Field>
      </div>

      <Field label="What are you building?" htmlFor="type">
        <select
          id="type"
          name="type"
          value={form.type}
          onChange={(e) => update('type', e.target.value)}
          className={inputClass}
        >
          {PARTNER_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </Field>

      <Field label="How can we help?" htmlFor="message" error={errors.message}>
        <textarea
          id="message"
          name="message"
          rows={4}
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
          aria-invalid={Boolean(errors.message)}
          className={inputClass}
          placeholder="Which chains, how many users, what you'd integrate…"
        />
      </Field>

      {serverError && (
        <p className="rounded-control border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        aria-busy={status === 'sending'}
        className="rounded-control bg-brand px-6 py-3 font-medium text-paper transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:opacity-60"
      >
        {status === 'sending' ? 'Sending…' : 'Request partnership'}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1.5 text-xs font-normal text-ink-dim">optional</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
