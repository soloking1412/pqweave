'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function current(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Follows the system setting until the visitor flips the switch. After that the
 * choice is stored and wins on every visit.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(current());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => setTheme(current());
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  function flip() {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Storage can be blocked; the choice still holds for this page.
    }
    setTheme(next);
  }

  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={flip}
      className="ml-2 inline-flex min-h-11 items-center gap-2 px-1 text-ink-dim hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="label hidden sm:inline">{dark ? 'Dark' : 'Light'}</span>
      <span className="relative h-5 w-9 rounded-full border border-rule-strong bg-well">
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-ink transition-[left] duration-200 ease-out ${
            dark ? 'left-[1.1rem]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
