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
  'w-full rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-brand/60 aria-[invalid=true]:ring-rose-500/60';

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
      setServerError('Network error — please try again.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-2xl text-emerald-300">
          ✓
        </div>
        <h2 className="mt-4 text-xl font-semibold text-white">Thanks — we&apos;ll be in touch</h2>
        <p className="mt-2 text-sm text-zinc-300">
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
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        aria-busy={status === 'sending'}
        className="rounded-xl bg-brand px-6 py-3 font-medium text-white transition hover:bg-brand-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-[#06060a] disabled:opacity-60"
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
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-zinc-200">
        {label}
        {optional && <span className="ml-1.5 text-xs font-normal text-zinc-500">optional</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
