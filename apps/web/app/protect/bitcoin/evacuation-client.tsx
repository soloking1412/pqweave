'use client';

import { useState } from 'react';
import {
  buildEvacuationPsbts,
  classifyBitcoinAddress,
  describePsbt,
  finalizeSweep,
  isBitcoinAddress,
  type DestinationCheck,
  type EvacuationPlan,
  type EvacuationTier,
} from '@pqweave/sdk/bitcoin';

/**
 * Evacuation kit (watch-only). Builds RBF sweep PSBTs at three fee tiers from a
 * source address you control to a fresh destination. Signing happens only in
 * your own wallet or air-gapped device — this page never sees a private key.
 * Pre-signing reveals nothing on-chain; the key is exposed only when you
 * broadcast. This shrinks reaction time; it is not quantum safety.
 */

interface UtxoLite {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

// hex/base64 helpers (kept local; wallets differ on PSBT encoding).
// Returns an ArrayBuffer-backed view so it is a valid BlobPart.
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function hexToBase64(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return bytesToBase64(bytes);
}

const fmtBtc = (sats: bigint) =>
  (Number(sats) / 1e8).toLocaleString('en-US', { maximumFractionDigits: 8 });

/**
 * Decode the PSBT and state what it actually does. Signing is irreversible once
 * broadcast, so the transaction should be readable here rather than trusted
 * because we built it.
 */
function DryRun({ psbtBase64, testnet }: { psbtBase64: string; testnet: boolean }) {
  let summary: ReturnType<typeof describePsbt>;
  try {
    summary = describePsbt(psbtBase64, testnet);
  } catch {
    return null;
  }
  const out = summary.outputs[0];
  return (
    <details className="mt-3 rounded-lg border border-white/5 bg-black/30 p-2.5 text-xs text-zinc-400">
      <summary className="cursor-pointer text-zinc-300">Verify before signing</summary>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-3">
          <dt>Spends</dt>
          <dd className="text-zinc-200">
            {summary.inputCount} input{summary.inputCount === 1 ? '' : 's'}
            {summary.totalInputSats !== undefined && ` · ${fmtBtc(summary.totalInputSats)}`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Pays</dt>
          <dd className="break-all text-right font-mono text-zinc-200">
            {out?.address ?? 'unknown'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Amount</dt>
          <dd className="text-zinc-200">{out ? fmtBtc(out.amountSats) : '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Fee</dt>
          <dd className="text-zinc-200">
            {summary.feeSats !== undefined ? fmtBtc(summary.feeSats) : '—'}
            {summary.feeRate !== undefined && ` (~${summary.feeRate} sat/vB)`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Change</dt>
          <dd className="text-zinc-200">{summary.isSweep ? 'none — full sweep' : 'present'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Fee-bumpable (RBF)</dt>
          <dd className="text-zinc-200">{summary.replaceable ? 'yes' : 'no'}</dd>
        </div>
      </dl>
      {summary.notes.map((note) => (
        <p key={note} className="mt-1.5 text-amber-200">
          {note}
        </p>
      ))}
    </details>
  );
}

export function EvacuationClient() {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [testnet, setTestnet] = useState(false);
  const [utxos, setUtxos] = useState<UtxoLite[] | null>(null);
  const [plan, setPlan] = useState<EvacuationPlan | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState<Record<string, string>>({});
  const [destCheck, setDestCheck] = useState<DestinationCheck | null>(null);
  const [ownsDestination, setOwnsDestination] = useState(false);

  const net = testnet ? 'testnet' : 'bitcoin';

  function reset() {
    setUtxos(null);
    setPlan(null);
    setSigned({});
    setBroadcast({});
    setError(null);
    setDestCheck(null);
    setOwnsDestination(false);
  }

  async function loadAndBuild() {
    setError(null);
    setBusy('build');
    reset();
    try {
      if (!isBitcoinAddress(source)) throw new Error('Enter a valid source address you control.');
      if (!isBitcoinAddress(destination))
        throw new Error('Enter a valid fresh destination address.');
      const isTest = source.startsWith('tb1') || source.startsWith('m') || source.startsWith('n');
      setTestnet(isTest);
      const network = isTest ? 'testnet' : 'bitcoin';

      const [utxoRes, feeRes] = await Promise.all([
        fetch(`/api/btc?op=utxos&network=${network}&address=${encodeURIComponent(source)}`).then(
          (r) => r.json(),
        ),
        fetch(`/api/btc?op=fees&network=${network}`).then((r) => r.json()),
      ]);
      if (utxoRes.error) throw new Error(utxoRes.error);
      if (feeRes.error) throw new Error(feeRes.error);
      const fetched = utxoRes.utxos as UtxoLite[];
      if (!fetched || fetched.length === 0) throw new Error('No UTXOs found at that address.');
      setUtxos(fetched);

      // Refuse a destination that is already used (or is the source itself)
      // before building anything — sweeping to an exposed address protects
      // nothing.
      const destRes = await fetch(
        `/api/btc?op=destcheck&network=${network}&address=${encodeURIComponent(destination)}&sources=${encodeURIComponent(source)}`,
      ).then((r) => r.json());
      if (destRes.error) throw new Error(destRes.error);
      const check = destRes.check as DestinationCheck;
      setDestCheck(check);
      if (check.verdict === 'unsafe') throw new Error(check.problems.join(' '));

      // Legacy (1…) and wrapped SegWit (3…) inputs cannot be signed without the
      // full previous transaction, so fetch one per distinct funding txid.
      const sourceType = classifyBitcoinAddress(source);
      const prevTxById: Record<string, string> = {};
      if (sourceType === 'p2pkh' || sourceType === 'p2sh') {
        const ids = [...new Set(fetched.map((u) => u.txid))];
        const results = await Promise.all(
          ids.map((txid) =>
            fetch(`/api/btc?op=txhex&network=${network}&txid=${txid}`)
              .then((r) => r.json())
              .then((j) => ({ txid, hex: j.hex as string | undefined, error: j.error })),
          ),
        );
        for (const r of results) {
          if (!r.hex) {
            throw new Error(
              `Could not fetch the previous transaction for ${r.txid.slice(0, 12)}… — a ${sourceType === 'p2pkh' ? 'legacy' : 'wrapped SegWit'} input cannot be signed without it.`,
            );
          }
          prevTxById[r.txid] = r.hex;
        }
      }

      const built = buildEvacuationPsbts({
        inputs: fetched.map((u) => ({
          ...u,
          address: source,
          ...(prevTxById[u.txid] ? { prevTxHex: prevTxById[u.txid] } : {}),
        })),
        destination,
        feeRates: feeRes.tiers,
        testnet: isTest,
      });
      setPlan(built);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build the evacuation kit.');
    } finally {
      setBusy(null);
    }
  }

  function downloadPsbt(tier: EvacuationTier) {
    const blob = new Blob([base64ToBytes(tier.psbtBase64)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pqweave-evacuation-${tier.label}.psbt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function signWithWallet(tier: EvacuationTier) {
    setError(null);
    setBusy(`sign-${tier.label}`);
    try {
      // Unisat (hex PSBT) first — stable and synchronous-ish.
      const unisat = (window as unknown as { unisat?: { signPsbt(hex: string): Promise<string> } })
        .unisat;
      if (unisat?.signPsbt) {
        const hexPsbt = bytesToHex(base64ToBytes(tier.psbtBase64));
        const signedHex = await unisat.signPsbt(hexPsbt);
        setSigned((s) => ({ ...s, [tier.label]: hexToBase64(signedHex) }));
        return;
      }
      // Xverse / Leather via sats-connect.
      const { request } = await import('sats-connect');
      const res = await request('signPsbt', {
        psbt: tier.psbtBase64,
        broadcast: false,
        signInputs: { [source]: plan!.tiers.length ? utxos!.map((_, i) => i) : [] },
      });
      if (res.status === 'success' && res.result?.psbt) {
        setSigned((s) => ({ ...s, [tier.label]: res.result.psbt }));
      } else {
        throw new Error('Wallet did not return a signed PSBT.');
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Wallet signing failed (${caught.message}). Use "Download PSBT" and sign in your own wallet instead.`
          : 'Wallet signing failed. Use the download option.',
      );
    } finally {
      setBusy(null);
    }
  }

  function onUploadSigned(tier: EvacuationTier, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = new Uint8Array(reader.result as ArrayBuffer);
        setSigned((s) => ({ ...s, [tier.label]: bytesToBase64(buf) }));
        setError(null);
      } catch {
        setError('Could not read that signed PSBT file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function broadcastTier(tier: EvacuationTier) {
    setError(null);
    setBusy(`cast-${tier.label}`);
    try {
      const signedPsbt = signed[tier.label];
      if (!signedPsbt) throw new Error('Sign this tier first.');
      const { hex } = finalizeSweep(signedPsbt);
      const res = await fetch(`/api/btc?op=broadcast&network=${net}`, {
        method: 'POST',
        body: hex,
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setBroadcast((b) => ({ ...b, [tier.label]: res.txid }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Broadcast failed.');
    } finally {
      setBusy(null);
    }
  }

  function saveBundle() {
    if (!plan) return;
    const bundle = {
      version: 1,
      createdAt: new Date().toISOString(),
      network: plan.network,
      source,
      destination,
      note: 'PQWeave evacuation kit. Signed PSBTs, one per fee tier. Broadcast on a quantum-trigger event. Transitional protection, not quantum safety.',
      tiers: plan.tiers.map((t) => ({
        label: t.label,
        feeRate: t.feeRate,
        unsignedPsbt: t.psbtBase64,
        signedPsbt: signed[t.label] ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pqweave-evacuation-bundle.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  const destType =
    destination && isBitcoinAddress(destination) ? classifyBitcoinAddress(destination) : null;

  return (
    <div className="rounded-panel border border-rule bg-panel p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Evacuation kit</h2>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
          watch-only · you sign
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Pre-build sweep transactions from an address you control to a fresh one, ready to broadcast
        within minutes if a quantum threat becomes real. We build the transactions from public data
        only — <span className="text-zinc-200">no key is ever requested</span>; you sign in your own
        wallet or an air-gapped device. Pre-signing exposes nothing: the public key only appears
        when you broadcast.
      </p>
      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
        This is reaction-time reduction, not quantum safety. When you broadcast, the spend still
        reveals the key and races the mempool. Rebuild the kit whenever you receive new coins — a
        pre-signed sweep only covers the UTXOs that existed when it was built.
      </div>

      <div className="mt-5 grid gap-3">
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Source address (one you control)
        </label>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value.trim())}
          placeholder="bc1q… address holding the coins"
          spellCheck={false}
          className="rounded-control bg-black/30 px-4 py-3 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-brand/60"
        />
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Fresh destination address (never used)
        </label>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value.trim())}
          placeholder="bc1q… brand-new address from your wallet"
          spellCheck={false}
          className="rounded-control bg-black/30 px-4 py-3 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-brand/60"
        />
        {destType === 'p2tr' && (
          <p className="text-xs text-amber-300">
            Taproot destination re-exposes the key on the next spend — prefer a native SegWit
            (bc1q…) destination.
          </p>
        )}
        <button
          onClick={loadAndBuild}
          disabled={busy === 'build' || !source || !destination}
          className="mt-1 w-fit rounded-control bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
        >
          {busy === 'build' ? 'Building…' : 'Build evacuation kit'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {plan && utxos && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-xs text-zinc-400">
            {utxos.length} UTXO{utxos.length === 1 ? '' : 's'} · {fmtBtc(plan.totalInputSats)}{' '}
            {plan.network === 'testnet' ? 'tBTC' : 'BTC'} to sweep · est. {plan.vsize} vB
          </div>

          {destCheck && destCheck.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              {destCheck.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}

          {/* Who can sign this. A PSBT without key derivation is useless to a
              hardware wallet, and finding that out at signing time is too late. */}
          <div
            className={`rounded-lg border p-3 text-xs leading-relaxed ${
              plan.signability.ready
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            <div className="font-medium">
              {plan.signability.ready
                ? 'Ready for hardware signing'
                : 'Signable by your wallet software, not by a hardware device'}
            </div>
            {plan.signability.warnings.map((w) => (
              <p key={w} className="mt-1">
                {w}
              </p>
            ))}
            {plan.signability.inputs.some((i) => i.issues.length > 0) && (
              <ul className="mt-1 space-y-1">
                {plan.signability.inputs
                  .filter((i) => i.issues.length > 0)
                  .slice(0, 3)
                  .map((i) => (
                    <li key={i.index}>
                      Input {i.index} ({i.type}): {i.issues.join(' ')}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* A sweep sends the entire balance with no change output. If the
              destination is not actually yours, the coins are gone for good, so
              this is confirmed explicitly rather than assumed. */}
          <label className="flex items-start gap-2.5 rounded-lg border border-rule bg-black/20 p-3 text-xs leading-relaxed text-zinc-300">
            <input
              type="checkbox"
              checked={ownsDestination}
              onChange={(e) => setOwnsDestination(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#3f7fbf]"
            />
            <span>
              I control{' '}
              <span className="break-all font-mono text-zinc-200">{plan.destination}</span> and can
              still spend from it. This sweep moves the whole balance with no change output — if
              this address is not mine, the coins cannot be recovered.
            </span>
          </label>

          {plan.tiers.map((tier) => (
            <div
              key={tier.label}
              className={`rounded-control border border-rule bg-black/20 p-4 transition ${
                ownsDestination ? '' : 'pointer-events-none opacity-40'
              }`}
              aria-disabled={!ownsDestination}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold capitalize text-white">
                  {tier.label} · {tier.feeRate} sat/vB
                </div>
                <div className="text-xs text-zinc-400">
                  fee {fmtBtc(tier.feeSats)} → sweeps {fmtBtc(tier.outputSats)}
                </div>
              </div>
              <DryRun psbtBase64={tier.psbtBase64} testnet={plan.network === 'testnet'} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => signWithWallet(tier)}
                  disabled={busy === `sign-${tier.label}`}
                  className="rounded-lg bg-brand/90 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand disabled:opacity-60"
                >
                  {busy === `sign-${tier.label}` ? 'Signing…' : 'Sign in browser wallet'}
                </button>
                <button
                  onClick={() => downloadPsbt(tier)}
                  className="rounded-lg border border-rule px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/5"
                >
                  Download PSBT
                </button>
                <label className="cursor-pointer rounded-lg border border-rule px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/5">
                  Upload signed
                  <input
                    type="file"
                    accept=".psbt,application/octet-stream"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onUploadSigned(tier, e.target.files[0])}
                  />
                </label>
                {signed[tier.label] && !broadcast[tier.label] && (
                  <button
                    onClick={() => broadcastTier(tier)}
                    disabled={busy === `cast-${tier.label}`}
                    className="rounded-lg bg-rose-500/90 px-3 py-2 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
                  >
                    {busy === `cast-${tier.label}` ? 'Broadcasting…' : 'Broadcast now'}
                  </button>
                )}
                {signed[tier.label] && <span className="text-xs text-emerald-300">signed ✓</span>}
                {broadcast[tier.label] && (
                  <a
                    href={`https://blockstream.info/${plan.network === 'testnet' ? 'testnet/' : ''}tx/${broadcast[tier.label]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-brand-bright hover:underline"
                  >
                    broadcast → view tx
                  </a>
                )}
              </div>
            </div>
          ))}

          {plan.skipped.map((s) => (
            <div key={s.label} className="text-xs text-zinc-500">
              {s.label} tier skipped — {s.reason}.
            </div>
          ))}

          <button
            onClick={saveBundle}
            className="rounded-control border border-rule px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
          >
            Save evacuation bundle (.json)
          </button>
          <p className="text-xs leading-relaxed text-zinc-500">
            Store the bundle offline. To act later, re-open it, finish signing any tier, and
            broadcast — or import the signed PSBT into any wallet. Keep your own copy; we store
            nothing.
          </p>
        </div>
      )}
    </div>
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
