'use client';

import { useMemo, useState } from 'react';
import { Buffer } from 'buffer';
import { hexToBytes, type Hex } from 'viem';
import { QRCodeSVG } from 'qrcode.react';
import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Operation,
  TransactionBuilder,
  buildAuthorizationEntryPreimage,
  hash,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction as freighterSign,
} from '@stellar/freighter-api';
import { HashSigSigner } from '@pqweave/sdk/pqc';
import { signStellarAuth } from '@pqweave/sdk/stellar-vault';
import { PqcKeygen, type PqcKeyState, KEY_TREE_SIZE } from '@/components/pqc-keygen';
import { decryptSeed } from '@/lib/keystore';
import {
  deriveVaultContractId,
  pqSignatureScVal,
  vaultConstructorArgs,
  xlmToStroopsScVal,
} from '@/lib/stellar';
import type { StellarVaultConfig } from '@/lib/contracts';

type Busy = null | 'deploy' | 'withdraw';

function leafKey(vaultId: string) {
  return `pqweave-stellar-leaf-${vaultId}`;
}

async function waitForTx(server: rpc.Server, hash: string) {
  for (let i = 0; i < 30; i++) {
    const res = await server.getTransaction(hash);
    if (res.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) return res;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('timed out waiting for confirmation');
}

export function StellarVaultClient({ vault }: { vault: StellarVaultConfig | null }) {
  const [keyState, setKeyState] = useState<PqcKeyState | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');

  const rootBytes = useMemo(() => (keyState ? hexToBytes(keyState.root) : null), [keyState]);

  // The deterministic vault address for this key + this deployer. Verified to
  // match Soroban's on-chain derivation.
  const vaultId = useMemo(() => {
    if (!vault || !wallet || !rootBytes) return null;
    try {
      return deriveVaultContractId(wallet, rootBytes, vault.networkPassphrase);
    } catch {
      return null;
    }
  }, [vault, wallet, rootBytes]);

  const explorer =
    vault?.network === 'mainnet' || vault?.network === 'public'
      ? 'https://stellar.expert/explorer/public'
      : 'https://stellar.expert/explorer/testnet';

  async function connectWallet() {
    setWalletError(null);
    try {
      const conn = await isConnected();
      if (!conn.isConnected) {
        setWalletError('Freighter not detected. Install the Freighter extension and reload.');
        return;
      }
      const access = await requestAccess();
      if (access.error) throw new Error(access.error.message ?? 'access denied');
      const got = access.address ? access : await getAddress();
      if (!got.address) throw new Error('no address returned');
      setWallet(got.address);
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'could not connect Freighter');
    }
  }

  async function deployVault() {
    if (!vault || !wallet || !rootBytes || !vaultId) return;
    setBusy('deploy');
    setError(null);
    setTxHash(null);
    try {
      const server = new rpc.Server(vault.rpcUrl);
      const source = await server.getAccount(wallet);
      const op = Operation.createCustomContract({
        address: new Address(wallet),
        wasmHash: Buffer.from(vault.wasmHash, 'hex'),
        salt: Buffer.from(rootBytes),
        constructorArgs: vaultConstructorArgs(
          rootBytes,
          keyState?.keystore.treeSize ?? KEY_TREE_SIZE,
        ),
      });
      const built = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: vault.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(180)
        .build();
      const prepared = await server.prepareTransaction(built);
      const { signedTxXdr, error: signErr } = await freighterSign(prepared.toXDR(), {
        networkPassphrase: vault.networkPassphrase,
        address: wallet,
      });
      if (signErr) throw new Error(signErr.message ?? 'signing rejected');
      const sent = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedTxXdr, vault.networkPassphrase),
      );
      if (sent.status === 'ERROR') throw new Error('the network rejected the deploy');
      const confirmed = await waitForTx(server, sent.hash);
      if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error('deploy did not succeed on-chain');
      }
      setDeployedId(vaultId);
      setTxHash(sent.hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'deploy failed');
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    if (!vault || !wallet || !keyState) return;
    const target = deployedId ?? vaultId;
    if (!target) return;
    if (!recipient.trim() || !amount.trim()) {
      setError('Enter a destination address and an amount.');
      return;
    }
    setBusy('withdraw');
    setError(null);
    setTxHash(null);
    try {
      const seed = (await decryptSeed(keyState.keystore, password)) as Hex;
      const treeSize = keyState.keystore.treeSize ?? KEY_TREE_SIZE;
      const nextLeaf = Number(localStorage.getItem(leafKey(target)) ?? '0');
      const signer = HashSigSigner.restore({
        masterSeed: seed,
        treeSize,
        root: keyState.root,
        nextLeafIndex: nextLeaf,
      });

      const server = new rpc.Server(vault.rpcUrl);
      const source = await server.getAccount(wallet);
      const sac = new Contract(Asset.native().contractId(vault.networkPassphrase));
      const transfer = sac.call(
        'transfer',
        new Address(target).toScVal(),
        new Address(recipient.trim()).toScVal(),
        xlmToStroopsScVal(amount),
      );
      const probe = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: vault.networkPassphrase,
      })
        .addOperation(transfer)
        .setTimeout(180)
        .build();

      const sim = await server.simulateTransaction(probe);
      if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
      const latest = await server.getLatestLedger();
      const validUntil = latest.sequence + 60;

      // Sign the vault's authorization entry with the post-quantum key. Soroban
      // hashes the call into the preimage, so the signature is bound to this
      // recipient and amount.
      const entries = sim.result?.auth ?? [];
      let signedVault = false;
      for (const entry of entries) {
        const cred = entry.credentials();
        if (cred.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) continue;
        const addr = Address.fromScAddress(cred.address().address()).toString();
        if (addr !== target) continue;
        const preimage = buildAuthorizationEntryPreimage(
          entry,
          validUntil,
          vault.networkPassphrase,
        );
        const payload = new Uint8Array(hash(preimage.toXDR()));
        const components = signStellarAuth(signer, payload);
        cred.address().signatureExpirationLedger(validUntil);
        cred.address().signature(pqSignatureScVal(components));
        signedVault = true;
      }
      if (!signedVault) throw new Error('simulation did not require the vault to authorize');

      const func = transfer.body().invokeHostFunctionOp().hostFunction();
      const authed = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: vault.networkPassphrase,
      })
        .addOperation(Operation.invokeHostFunction({ func, auth: entries }))
        .setTimeout(180)
        .build();
      const assembled = rpc.assembleTransaction(authed, sim).build();

      const { signedTxXdr, error: signErr } = await freighterSign(assembled.toXDR(), {
        networkPassphrase: vault.networkPassphrase,
        address: wallet,
      });
      if (signErr) throw new Error(signErr.message ?? 'signing rejected');
      const sent = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedTxXdr, vault.networkPassphrase),
      );
      if (sent.status === 'ERROR') throw new Error('the network rejected the withdrawal');
      const confirmed = await waitForTx(server, sent.hash);
      if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error('withdrawal reverted — the one-time key may already be spent; try again');
      }
      // Persist the advanced one-time-key index only after success.
      localStorage.setItem(leafKey(target), String(signer.nextLeafIndex));
      setTxHash(sent.hash);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'withdrawal failed');
    } finally {
      setBusy(null);
    }
  }

  if (!vault) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0b0b12] p-5">
        <h2 className="text-xl font-semibold tracking-tight">Try the vault</h2>
        <p className="mt-2 text-sm text-zinc-400">
          The vault is not wired to a network in this build. Deploy the wasm with{' '}
          <span className="font-mono text-zinc-300">packages/stellar-vault/deploy.sh</span> and set{' '}
          <span className="font-mono text-zinc-300">NEXT_PUBLIC_STELLAR_VAULT_WASM_HASH</span> to
          enable the interactive flow.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0b12] p-5">
      <h2 className="text-xl font-semibold tracking-tight">Try the vault on {vault.network}</h2>
      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
        Testnet only, unaudited. This creates a new post-quantum account; it does not protect your
        existing Stellar wallet. Only funds you sweep in are protected, and your old key stays
        exposed. Use throwaway testnet XLM.
      </div>

      {/* Step 1 — key */}
      <div className="mt-5">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Step 1 — post-quantum key
        </div>
        <div className="mt-2">
          <PqcKeygen onChange={setKeyState} />
        </div>
      </div>

      {/* Step 2 — wallet */}
      <div className="mt-6 border-t border-white/5 pt-5">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Step 2 — connect Stellar wallet
        </div>
        {wallet ? (
          <p className="mt-2 break-all font-mono text-xs text-emerald-300">{wallet}</p>
        ) : (
          <button
            onClick={connectWallet}
            disabled={!keyState}
            className="mt-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-50"
          >
            Connect Freighter
          </button>
        )}
        {walletError && <p className="mt-2 text-sm text-rose-300">{walletError}</p>}
      </div>

      {/* Step 3 — vault address + deploy */}
      {vaultId && (
        <div className="mt-6 border-t border-white/5 pt-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Step 3 — your vault address
          </div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="rounded-lg bg-white p-2">
              <QRCodeSVG value={vaultId} size={104} />
            </div>
            <div className="min-w-0">
              <a
                href={`${explorer}/contract/${vaultId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all font-mono text-xs text-accent hover:underline"
              >
                {vaultId}
              </a>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Deploy this vault, then send testnet XLM to the address above from any Stellar
                wallet to sweep funds in. The address is fixed by your key, so it is the same every
                time.
              </p>
              {!deployedId ? (
                <button
                  onClick={deployVault}
                  disabled={busy !== null}
                  className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-50"
                >
                  {busy === 'deploy' ? 'Deploying…' : 'Deploy my vault'}
                </button>
              ) : (
                <p className="mt-3 text-sm text-emerald-300">Vault deployed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — withdraw */}
      {vaultId && (
        <div className="mt-6 border-t border-white/5 pt-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Step 4 — withdraw with your post-quantum key
          </div>
          <div className="mt-3 grid gap-3">
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Destination address (G…)"
              className="rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (XLM)"
                inputMode="decimal"
                className="rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Keystore password"
                className="rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
              />
            </div>
            <button
              onClick={withdraw}
              disabled={busy !== null}
              className="rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-50"
            >
              {busy === 'withdraw' ? 'Signing & submitting…' : 'Withdraw'}
            </button>
            <p className="text-xs leading-relaxed text-zinc-500">
              Each withdrawal consumes one one-time key. The signature is produced in your browser
              and verified on-chain by the vault; the contract rejects any reused key.
            </p>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      {txHash && (
        <a
          href={`${explorer}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block break-all text-sm text-emerald-300 hover:underline"
        >
          Confirmed — view transaction ↗
        </a>
      )}
    </div>
  );
}
