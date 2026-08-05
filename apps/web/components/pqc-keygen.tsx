'use client';

import { useState } from 'react';
import { toHex, type Hex } from 'viem';
import { createHashSigKey } from '@pqweave/sdk/pqc';
import { type EncryptedKeystore, encryptSeed } from '@/lib/keystore';

export const KEY_TREE_SIZE = 64; // one-time post-quantum keys before a rotation is needed

export interface PqcKeyState {
  root: Hex;
  keystore: EncryptedKeystore;
  seedSaved: boolean;
}

export function downloadKeystore(file: EncryptedKeystore) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pqweave-keystore.json';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Shared post-quantum key generation step: password → fresh CSPRNG seed →
 * Lamport+Merkle key → encrypted keystore download. The seed is never shown
 * and never derived from a wallet signature. Reports state changes upward so
 * the surrounding flow can gate on `seedSaved`.
 */
export function PqcKeygen({
  disabled = false,
  onChange,
}: {
  disabled?: boolean;
  onChange: (state: PqcKeyState | null) => void;
}) {
  const [pqcRoot, setPqcRoot] = useState<Hex | null>(null);
  const [keystore, setKeystore] = useState<EncryptedKeystore | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [seedSaved, setSeedSaved] = useState(false);

  async function generateAndEncrypt() {
    setKeyError(null);
    if (password.length < 8) {
      setKeyError('Use a password of at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setKeyError('Passwords do not match.');
      return;
    }
    setGenerating(true);
    try {
      // Fresh, independent entropy — NOT derived from the wallet's ECDSA key, so a
      // future quantum break of that key cannot reproduce the post-quantum key.
      // The seed stays in this local scope and is never shown or stored in state.
      const seed = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const root = createHashSigKey(seed, KEY_TREE_SIZE).root;
      const file = await encryptSeed(seed, password, root, KEY_TREE_SIZE);
      setPqcRoot(root);
      setKeystore(file);
      downloadKeystore(file);
      setPassword('');
      setConfirmPassword('');
      onChange({ root, keystore: file, seedSaved: false });
    } catch {
      setKeyError('Could not generate the key. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function toggleSaved(saved: boolean) {
    setSeedSaved(saved);
    if (pqcRoot && keystore) onChange({ root: pqcRoot, keystore, seedSaved: saved });
  }

  if (keystore && pqcRoot) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-300">
          Encrypted recovery file downloaded (pqweave-keystore.json). Your secret key was encrypted
          with your password and never shown on screen.
        </p>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
          Keep both the file <span className="font-medium">and</span> your password safe. The file
          is useless without the password, and together they are the only way to control your
          account. We cannot recover either.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => downloadKeystore(keystore)}
            className="rounded-control border border-rule px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
          >
            Download again
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={seedSaved}
              onChange={(event) => toggleSaved(event.target.checked)}
              className="h-4 w-4 accent-[#3f7fbf]"
            />
            I have saved the file and will remember my password
          </label>
        </div>
        <div className="rounded-lg border border-white/5 bg-black/20 p-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Post-quantum public key (root)
          </div>
          <div className="mt-1 break-all font-mono text-xs text-accent">{pqcRoot}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-zinc-400">
        Choose a password, then generate a hash-based (Lamport + Merkle) post-quantum key in your
        browser. The key is created from fresh randomness, encrypted with your password
        (AES-256-GCM), and downloaded as a file. The raw secret is never displayed.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Encryption password"
          className="rounded-control bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm password"
          className="rounded-control bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
        />
      </div>
      <button
        onClick={generateAndEncrypt}
        disabled={disabled || generating}
        className="mt-4 rounded-control bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
      >
        {generating ? 'Generating…' : 'Generate & download encrypted key'}
      </button>
      {keyError && <p className="mt-3 text-sm text-rose-300">{keyError}</p>}
    </div>
  );
}
