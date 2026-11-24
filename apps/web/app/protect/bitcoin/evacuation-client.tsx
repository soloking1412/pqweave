'use client';

import { useState } from 'react';
import {
  buildBitcoinReadinessPlan,
  createBitcoinPlanBundle,
  restoreBitcoinPlanBundle,
  revalidateBitcoinPlan,
  parseDerivationPath,
  formatDerivationPath,
  classifyBitcoinAddress,
  describePsbt,
  bitcoinAddressNetwork,
  isBitcoinAddressOnNetwork,
  verifySweepMatchesPlan,
  type DestinationCheck,
  type EvacuationPlan,
  type EvacuationTier,
  type BitcoinPlanBundle,
} from '@pqweave/sdk/bitcoin';

/**
 * Evacuation kit (watch-only). Builds RBF sweep PSBTs at three fee tiers from a
 * source address you control to a fresh destination. Signing happens only in
 * your own wallet or air-gapped device — this page never sees a private key.
 * Signing reveals nothing new on-chain before broadcast. This shrinks reaction
 * time; it is not quantum safety. Taproot keys are already visible on-chain.
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
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(clean)) throw new Error('Wallet returned invalid PSBT hex');
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
  const [destCheck, setDestCheck] = useState<DestinationCheck | null>(null);
  const [ownsDestination, setOwnsDestination] = useState(false);
  const [plainCoins, setPlainCoins] = useState(false);
  const [bundle, setBundle] = useState<BitcoinPlanBundle | null>(null);
  const [pubkey, setPubkey] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [path, setPath] = useState('');

  const net = testnet ? 'testnet' : 'bitcoin';

  function reset() {
    setUtxos(null);
    setPlan(null);
    setSigned({});
    setError(null);
    setDestCheck(null);
    setOwnsDestination(false);
    setPlainCoins(false);
    setBundle(null);
  }

  async function loadAndBuild() {
    setError(null);
    setBusy('build');
    reset();
    try {
      const sourceNetwork = bitcoinAddressNetwork(source);
      if (sourceNetwork !== 'bitcoin' && sourceNetwork !== 'testnet') {
        throw new Error('Enter a valid Bitcoin mainnet or testnet source address you control.');
      }
      if (!isBitcoinAddressOnNetwork(destination, sourceNetwork)) {
        throw new Error('Enter a valid fresh destination on the same Bitcoin network.');
      }
      const isTest = sourceNetwork === 'testnet';
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
      if (check.verdict !== 'safe')
        throw new Error([...check.problems, ...check.warnings].join(' '));

      // Legacy (1…) and wrapped SegWit (3…) inputs cannot be signed without the
      // full previous transaction, so fetch one per distinct funding txid.
      const prevTxById: Record<string, string> = {};
      let fundingBytes = 0;
      {
        if (fetched.length > 100)
          throw new Error(
            'At most 100 inputs per plan. Use separately reviewed batches in your wallet.',
          );
        const ids = [...new Set(fetched.map((u) => u.txid))];
        // Bound concurrent upstream requests for large addresses.
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, ids.length) }, async () => {
            while (cursor < ids.length) {
              const txid = ids[cursor++]!;
              const j = await fetch(`/api/btc?op=txhex&network=${network}&txid=${txid}`, {
                cache: 'no-store',
              }).then((r) => r.json());
              const r = { txid, hex: j.hex as string | undefined };
              if (!r.hex) {
                throw new Error(
                  `Could not verify the funding transaction for ${r.txid.slice(0, 12)}… Rebuild when the indexer is available.`,
                );
              }
              fundingBytes += r.hex.length;
              if (fundingBytes > 7_000_000) {
                cursor = ids.length;
                throw new Error(
                  'Funding data exceeds the kit limit. Use a smaller reviewed batch in your wallet.',
                );
              }
              prevTxById[r.txid] = r.hex;
            }
          }),
        );
      }

      if (pubkey && !/^(02|03)[a-fA-F0-9]{64}$/.test(pubkey))
        throw new Error('Enter a compressed public key (66 hex characters), never a private key.');
      if (Boolean(fingerprint) !== Boolean(path))
        throw new Error('Supply both master fingerprint and full derivation path.');
      const params = {
        inputs: fetched.map((u) => ({
          ...u,
          address: source,
          ...(prevTxById[u.txid] ? { prevTxHex: prevTxById[u.txid] } : {}),
          ...(pubkey
            ? { pubkey: Uint8Array.from(pubkey.match(/../g)!.map((b) => parseInt(b, 16))) }
            : {}),
          ...(fingerprint && path
            ? { masterFingerprint: fingerprint, pathComponents: parseDerivationPath(path) }
            : {}),
        })),
        destination,
        feeRates: feeRes.tiers,
        testnet: isTest,
      };
      const built = buildBitcoinReadinessPlan(params);
      setPlan(built);
      setBundle(createBitcoinPlanBundle(params));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare the Bitcoin plan.');
    } finally {
      setBusy(null);
    }
  }

  async function recheck() {
    if (!bundle) throw new Error('Build or restore a plan first.');
    if (!ownsDestination || !plainCoins)
      throw new Error('Confirm destination ownership and ordinary BTC inputs first.');
    await revalidateBitcoinPlan(bundle, {
      apiUrl: '/api/btc/esplora',
      fetchImpl: ((url, init) =>
        fetch(`${String(url)}?network=${net}`, { ...init, cache: 'no-store' })) as typeof fetch,
      retries: 0,
    });
    const res = await fetch(
      `/api/btc?op=destcheck&network=${net}&address=${encodeURIComponent(bundle.request.destination)}&sources=${encodeURIComponent(source)}`,
      { cache: 'no-store' },
    ).then((r) => r.json());
    if (!res.check || res.check.verdict !== 'safe')
      throw new Error('Destination freshness could not be confirmed. Rebuild and review the plan.');
  }

  function writePsbt(b64: string, filename: string) {
    const blob = new Blob([base64ToBytes(b64)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPsbt(tier: EvacuationTier) {
    setError(null);
    setBusy(`download-${tier.label}`);
    try {
      await recheck();
      writePsbt(tier.psbtBase64, `pqweave-bitcoin-${tier.label}.psbt`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not recheck plan');
    } finally {
      setBusy(null);
    }
  }

  async function signWithWallet(tier: EvacuationTier) {
    setError(null);
    setBusy(`sign-${tier.label}`);
    try {
      await recheck();
      // Unisat (hex PSBT) first — stable and synchronous-ish.
      const unisat = (window as unknown as { unisat?: { signPsbt(hex: string): Promise<string> } })
        .unisat;
      if (unisat?.signPsbt) {
        const hexPsbt = bytesToHex(base64ToBytes(tier.psbtBase64));
        const signedHex = await unisat.signPsbt(hexPsbt);
        acceptSigned(tier, hexToBase64(signedHex));
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
        acceptSigned(tier, res.result.psbt);
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

  function acceptSigned(tier: EvacuationTier, b64: string) {
    if (!plan) throw new Error('Build a plan first');
    const match = verifySweepMatchesPlan(b64, plan, tier);
    if (!match.ok) throw new Error(`PSBT differs from the plan: ${match.mismatches.join('; ')}`);
    setSigned((s) => ({ ...s, [tier.label]: b64 }));
  }

  function onUploadSigned(tier: EvacuationTier, file: File) {
    if (file.size > 4_000_000) {
      setError('PSBT file is too large.');
      return;
    }
    setBusy(`upload-${tier.label}`);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = new Uint8Array(reader.result as ArrayBuffer);
        acceptSigned(tier, bytesToBase64(buf));
        setError(null);
      } catch (e) {
        setSigned((s) => {
          const next = { ...s };
          delete next[tier.label];
          return next;
        });
        setError(e instanceof Error ? e.message : 'Could not read that PSBT file.');
      }
    };
    reader.onerror = () => {
      setBusy(null);
      setError('Could not read PSBT');
    };
    reader.onloadend = () => setBusy(null);
    reader.readAsArrayBuffer(file);
  }

  async function exportCheckedTier(tier: EvacuationTier) {
    setError(null);
    setBusy(`cast-${tier.label}`);
    try {
      await recheck();
      const signedPsbt = signed[tier.label];
      if (!signedPsbt) throw new Error('Sign this tier first.');
      if (!plan) throw new Error('Build a plan first.');
      const match = verifySweepMatchesPlan(signedPsbt, plan, tier);
      if (!match.ok)
        throw new Error(`Signed PSBT does not match the plan: ${match.mismatches.join('; ')}`);
      writePsbt(signedPsbt, `pqweave-bitcoin-${tier.label}-checked.psbt`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export the checked PSBT.');
    } finally {
      setBusy(null);
    }
  }

  function saveBundle() {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pqweave-evacuation-bundle.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBundle(file: File) {
    if (busy) return;
    reset();
    setBusy('restore');
    try {
      if (file.size > 8_000_000) throw new Error('Plan file is too large');
      const restored = restoreBitcoinPlanBundle(await file.text());
      const sources = [...new Set(restored.inputs.map((i) => i.address))];
      if (sources.length !== 1)
        throw new Error(
          'This page supports one source address per plan. Use the SDK for fleet batches.',
        );
      setBundle(restored.bundle);
      setPlan(restored.plan);
      setUtxos(restored.inputs);
      setSource(sources[0]!);
      setDestination(restored.plan.destination);
      setTestnet(restored.plan.network === 'testnet');
      setPubkey(restored.bundle.request.inputs[0]?.pubkey ?? '');
      setFingerprint(restored.inputs[0]?.masterFingerprint ?? '');
      setPath(
        restored.inputs[0]?.pathComponents
          ? formatDerivationPath(restored.inputs[0].pathComponents)
          : '',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid plan file');
    } finally {
      setBusy(null);
    }
  }

  const destType =
    destination && bitcoinAddressNetwork(destination) ? classifyBitcoinAddress(destination) : null;

  return (
    <div className="rounded-panel border border-rule bg-panel p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Bitcoin preparation kit</h2>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
          watch-only · you sign
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Create an unsigned transaction plan for a reviewed sweep from one address you control to a
        fresh native SegWit address. We build the transactions from public data only —{' '}
        <span className="text-zinc-200">no private key is ever requested</span>; you sign in your
        own wallet or an air-gapped device. Signing adds nothing to the chain until broadcast.
        Taproot source keys are already visible on-chain.
      </p>
      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
        This route reduces exposure and does not add a post-quantum signature. Plans expire after 24
        hours and are rechecked before signing or exporting. Your wallet validates signatures and
        broadcasts; this website does not relay transactions.
      </div>
      <label className="mt-4 block text-sm text-zinc-300">
        Restore an unsigned plan
        <input
          type="file"
          accept=".json,application/json"
          disabled={Boolean(busy)}
          onChange={(e) => e.target.files?.[0] && restoreBundle(e.target.files[0])}
          className="mt-2 block w-full text-xs"
        />
      </label>
      <p className="mt-2 text-xs text-zinc-400">
        A file checksum detects edits, not its author. Independently check the destination and
        amounts on your signing device.
      </p>

      <div className="mt-5 grid gap-3">
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Source address (one you control)
        </label>
        <input
          value={source}
          onChange={(e) => {
            reset();
            setSource(e.target.value.trim());
          }}
          disabled={Boolean(busy)}
          aria-label="Source Bitcoin address"
          placeholder="bc1q… address holding the coins"
          spellCheck={false}
          className="rounded-control bg-black/30 px-4 py-3 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-brand/60"
        />
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Fresh destination address (never used)
        </label>
        <input
          value={destination}
          onChange={(e) => {
            reset();
            setDestination(e.target.value.trim());
          }}
          disabled={Boolean(busy)}
          aria-label="Destination Bitcoin address"
          placeholder="bc1q… brand-new address from your wallet"
          spellCheck={false}
          className="rounded-control bg-black/30 px-4 py-3 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-brand/60"
        />
        {destType === 'p2tr' && (
          <p className="text-xs text-amber-300">
            Taproot exposes its output key immediately. This kit accepts only a native SegWit P2WPKH
            destination.
          </p>
        )}
        <details className="rounded-control border border-rule p-3 text-xs text-zinc-300">
          <summary className="cursor-pointer">
            Public signer details (for hardware, wrapped SegWit, or Taproot inputs)
          </summary>
          <p className="my-2">
            Export these public details from your wallet. Never enter a seed phrase or private key.
          </p>
          {[
            ['Compressed public key', pubkey, setPubkey],
            ['Master fingerprint', fingerprint, setFingerprint],
            ['Full derivation path', path, setPath],
          ].map(([label, value, setter]) => (
            <label key={label as string} className="mt-2 block">
              {label as string}
              <input
                value={value as string}
                disabled={Boolean(busy)}
                onChange={(e) => {
                  reset();
                  (setter as (v: string) => void)(e.target.value.trim());
                }}
                className="mt-1 block w-full rounded-control bg-black/30 p-2 font-mono ring-1 ring-white/10"
              />
            </label>
          ))}
        </details>
        <button
          onClick={loadAndBuild}
          disabled={Boolean(busy) || !source || !destination}
          className="mt-1 w-fit rounded-control bg-[#285f96] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#326fa9] active:bg-[#204f7d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:opacity-60"
        >
          {busy === 'build' ? 'Preparing…' : 'Prepare Bitcoin plan'}
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
                ? 'Public key origins included · verify device compatibility'
                : 'Public key origins missing · your wallet may need to add them'}
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
          <label className="flex items-start gap-2.5 rounded-lg border border-rule p-3 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={plainCoins}
              onChange={(e) => setPlainCoins(e.target.checked)}
              className="mt-0.5"
            />
            I checked that these are ordinary BTC outputs, with no inscriptions, Runes, or other
            assets. I understand a sweep combines all coins at this address and can link them
            publicly.
          </label>

          {plan.tiers.map((tier) => (
            <div
              key={tier.label}
              className={`rounded-control border border-rule bg-black/20 p-4 transition ${
                ownsDestination && plainCoins ? '' : 'opacity-40'
              }`}
              aria-disabled={!ownsDestination || !plainCoins}
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
                  disabled={!ownsDestination || !plainCoins || Boolean(busy)}
                  className="rounded-lg bg-[#285f96] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#326fa9] active:bg-[#204f7d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:opacity-60"
                >
                  {busy === `sign-${tier.label}` ? 'Signing…' : 'Sign in browser wallet'}
                </button>
                <button
                  onClick={() => downloadPsbt(tier)}
                  disabled={!ownsDestination || !plainCoins || Boolean(busy)}
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
                    disabled={!ownsDestination || !plainCoins || Boolean(busy)}
                    onChange={(e) => e.target.files?.[0] && onUploadSigned(tier, e.target.files[0])}
                  />
                </label>
                {signed[tier.label] && (
                  <button
                    onClick={() => exportCheckedTier(tier)}
                    disabled={!ownsDestination || !plainCoins || Boolean(busy)}
                    className="rounded-lg bg-rose-500/90 px-3 py-2 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
                  >
                    {busy === `cast-${tier.label}` ? 'Rechecking…' : 'Export checked PSBT'}
                  </button>
                )}
                {signed[tier.label] && (
                  <span className="text-xs text-emerald-300">
                    Transaction matches plan · wallet must verify signatures
                  </span>
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
            Save unsigned plan (.json)
          </button>
          <p className="text-xs leading-relaxed text-zinc-500">
            Save the plan for review; restore it here within 24 hours or rebuild from current coins.
            Signed PSBTs are spend authorizations: keep them offline and use your wallet to validate
            and broadcast one selected fee tier.
          </p>
        </div>
      )}
    </div>
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
