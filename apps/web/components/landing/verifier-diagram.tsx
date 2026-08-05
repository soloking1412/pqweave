'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * The Winternitz verifier, drawn.
 *
 * This is not decoration: it is what `WinternitzMerkleVerifier.sol` does on
 * every post-quantum authorization. Each row is one hash chain. The filled
 * nodes are the values the signature actually carries; the hollow ones are the
 * steps the verifier walks itself to recover the one-time public key — which is
 * why the signature never has to transmit it, and why it is 2,304 bytes instead
 * of 24,736. The chains then commit into a Merkle tree whose root is the only
 * thing stored on chain.
 */

const CHAINS = 8; // 67 in the real scheme; 8 reads at this size
const STEPS = 6; // W-1 = 15 in the real scheme

const ROW_GAP = 26;
const STEP_GAP = 27;
const ORIGIN_X = 8;
const ORIGIN_Y = 14;

const CHAIN_WIDTH = ORIGIN_X + (STEPS - 1) * STEP_GAP;
const TREE_X = CHAIN_WIDTH + 46;
const ROOT_X = TREE_X + 104;
const HEIGHT = ORIGIN_Y * 2 + (CHAINS - 1) * ROW_GAP;

/** Where each chain's signature stops. Deterministic, so SSR and client agree. */
const SIGNED_AT = [2, 4, 1, 3, 2, 5, 3, 1];

const rowY = (i: number) => ORIGIN_Y + i * ROW_GAP;
const stepX = (i: number) => ORIGIN_X + i * STEP_GAP;

/** Midpoint of a set of consecutive rows, for tree node placement. */
const spanY = (from: number, count: number) => rowY(from) + ((count - 1) * ROW_GAP) / 2;

export function VerifierDiagram() {
  const reduce = useReducedMotion();

  // One full pass: chains resolve, tree assembles, root locks, hold, repeat.
  const cycle = 7;
  const loop = (delay: number, duration = 0.45) =>
    reduce
      ? { duration: 0 }
      : {
          duration,
          delay,
          ease: [0.16, 0.84, 0.44, 1] as const,
          repeat: Infinity,
          repeatDelay: cycle - duration - delay,
        };

  return (
    <figure className="panel overflow-hidden bg-panel-raised p-4 sm:p-5">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
          Winternitz verification
        </span>
        <span className="tabular text-[11px] text-accent">67 chains → 1 root</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${ROOT_X + 12} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Eight hash chains resolving into a Merkle root. Filled nodes are the signature; hollow nodes are steps the verifier walks itself."
      >
        {Array.from({ length: CHAINS }, (_, row) => {
          const y = rowY(row);
          const signed = SIGNED_AT[row]!;
          return (
            <g key={row}>
              {/* The chain track. */}
              <line
                x1={stepX(0)}
                y1={y}
                x2={stepX(STEPS - 1)}
                y2={y}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={1}
              />
              {/* The portion the verifier walks, drawn as it is computed. */}
              <motion.line
                x1={stepX(signed)}
                y1={y}
                x2={stepX(STEPS - 1)}
                y2={y}
                stroke="rgba(52,226,228,0.55)"
                strokeWidth={1}
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={loop(0.3 + row * 0.07, 0.6)}
              />
              {Array.from({ length: STEPS }, (_, step) => {
                const isSignature = step === signed;
                const isCarried = step < signed;
                if (isCarried) {
                  // Steps below the signed digit are never revealed.
                  return (
                    <circle
                      key={step}
                      cx={stepX(step)}
                      cy={y}
                      r={2}
                      fill="rgba(255,255,255,0.14)"
                    />
                  );
                }
                if (isSignature) {
                  // The value the signature actually carries.
                  return (
                    <rect
                      key={step}
                      x={stepX(step) - 3.5}
                      y={y - 3.5}
                      width={7}
                      height={7}
                      rx={1}
                      fill="#9a8cff"
                    />
                  );
                }
                return (
                  <motion.circle
                    key={step}
                    cx={stepX(step)}
                    cy={y}
                    r={2.5}
                    fill="#34e2e4"
                    initial={{ opacity: reduce ? 1 : 0 }}
                    animate={{ opacity: 1 }}
                    transition={loop(0.3 + row * 0.07 + (step - signed) * 0.06, 0.25)}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Merkle tree: 8 leaves → 4 → 2 → root. */}
        {[
          { from: 0, count: 2, x: TREE_X },
          { from: 2, count: 2, x: TREE_X },
          { from: 4, count: 2, x: TREE_X },
          { from: 6, count: 2, x: TREE_X },
        ].map((node, i) => (
          <TreeNode
            key={`l1-${i}`}
            x={node.x}
            y={spanY(node.from, node.count)}
            childY={[rowY(node.from), rowY(node.from + 1)]}
            childX={stepX(STEPS - 1)}
            transition={loop(1.5 + i * 0.08, 0.4)}
            reduce={!!reduce}
          />
        ))}

        {[
          { from: 0, count: 4, x: TREE_X + 52 },
          { from: 4, count: 4, x: TREE_X + 52 },
        ].map((node, i) => (
          <TreeNode
            key={`l2-${i}`}
            x={node.x}
            y={spanY(node.from, node.count)}
            childY={[spanY(node.from, 2), spanY(node.from + 2, 2)]}
            childX={TREE_X}
            transition={loop(2.0 + i * 0.08, 0.4)}
            reduce={!!reduce}
          />
        ))}

        <TreeNode
          x={ROOT_X}
          y={spanY(0, CHAINS)}
          childY={[spanY(0, 4), spanY(4, 4)]}
          childX={TREE_X + 52}
          transition={loop(2.45, 0.4)}
          reduce={!!reduce}
          root
        />
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-rule pt-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[1px] bg-brand-bright" />
          carried in the signature
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          recomputed by the verifier
        </span>
      </div>
    </figure>
  );
}

function TreeNode({
  x,
  y,
  childX,
  childY,
  transition,
  reduce,
  root = false,
}: {
  x: number;
  y: number;
  childX: number;
  childY: [number, number];
  transition: object;
  reduce: boolean;
  root?: boolean;
}) {
  return (
    <g>
      {childY.map((cy, i) => (
        <motion.path
          key={i}
          d={`M ${childX} ${cy} H ${(childX + x) / 2} V ${y} H ${x}`}
          fill="none"
          stroke={root ? 'rgba(154,140,255,0.6)' : 'rgba(255,255,255,0.16)'}
          strokeWidth={1}
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={transition}
        />
      ))}
      <motion.circle
        cx={x}
        cy={y}
        r={root ? 6 : 3.5}
        fill={root ? '#9a8cff' : '#0a0a11'}
        stroke={root ? '#9a8cff' : 'rgba(255,255,255,0.35)'}
        strokeWidth={1}
        initial={{ scale: reduce ? 1 : 0.4, opacity: reduce ? 1 : 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        transition={transition}
      />
    </g>
  );
}
