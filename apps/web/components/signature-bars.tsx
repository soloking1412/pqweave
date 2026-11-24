'use client';

import { motion, useReducedMotion } from 'framer-motion';

const ROWS = [
  {
    title: 'Signature size on chain',
    unit: 'bytes',
    lamport: 24_736,
    winternitz: 2_304,
  },
  {
    title: 'Gas to verify, calldata included',
    unit: 'gas',
    lamport: 670_832,
    winternitz: 254_992,
  },
] as const;

const format = (value: number) => value.toLocaleString('en-US');

/** Two measured comparisons from VerifierGas.t.sol. Bar lengths are the real ratios. */
export function SignatureBars() {
  const reduce = useReducedMotion();

  return (
    <figure className="panel p-5 sm:p-6">
      <figcaption className="label">Two hash-based verifiers, measured</figcaption>
      <div className="mt-5 space-y-7">
        {ROWS.map((row) => (
          <div key={row.title}>
            <div className="text-sm font-semibold text-ink">{row.title}</div>
            {(
              [
                ['Lamport', row.lamport, 'bg-ink-faint'],
                ['Winternitz', row.winternitz, 'bg-brand'],
              ] as const
            ).map(([name, value, fill]) => (
              <div
                key={name}
                className="mt-2.5 grid grid-cols-[5.5rem_1fr_5rem] items-center gap-3"
              >
                <span className="text-[13px] text-ink-2">{name}</span>
                <div className="h-3 bg-well">
                  <motion.div
                    className={`h-full origin-left ${fill}`}
                    style={{ width: `${(value / row.lamport) * 100}%` }}
                    initial={reduce ? false : { scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.5, ease: [0.16, 0.84, 0.44, 1] }}
                  />
                </div>
                <span className="tabular text-right text-[13px] text-ink">{format(value)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-ink-dim">
        Winternitz rebuilds the one-time public key from the signature instead of sending it. Same
        construction family Ethereum chose for leanSig, here on keccak256. Run{' '}
        <code className="tabular text-ink">forge test --match-contract VerifierGas -vv</code> to
        reproduce.
      </p>
    </figure>
  );
}
