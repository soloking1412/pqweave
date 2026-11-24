import Link from 'next/link';
export default function SecurityPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-5 py-12 text-zinc-300">
      <h1 className="text-3xl font-semibold text-white">Bitcoin security boundaries</h1>
      <p>
        This release prepares standard Bitcoin transactions for an existing wallet to sign. It
        reduces public-key exposure; it does not add post-quantum signatures.
      </p>
      <h2 className="text-xl font-semibold text-white">Your wallet retains control</h2>
      <p>
        We never request seed phrases or private keys. The API reads public data and cannot
        broadcast. Check the destination, amount, network and fee on your trusted signer. A matching
        PSBT is a transaction comparison, not proof that its signatures are valid.
      </p>
      <h2 className="text-xl font-semibold text-white">Supported coins and limits</h2>
      <p>
        Single-key legacy, native SegWit, wrapped SegWit and key-only Taproot sources; fresh P2WPKH
        destinations. Up to 100 confirmed ordinary BTC inputs. Every fee tier is limited to 100,000
        sats and 5% of the selected balance. Plans expire after 24 hours and are rechecked before
        export.
      </p>
      <p>
        Multisig, custom scripts, inscriptions, Runes and QSB transactions require separate support
        and review. Do not weaken an existing custody policy to use this kit.
      </p>
      <h2 className="text-xl font-semibold text-white">Public data is still sensitive</h2>
      <p>
        Extended public keys are processed in the browser. Derived addresses are queried through the
        server and its configured indexer, which can correlate them. A scan cannot prove ownership,
        complete wallet history, or the absence of off-chain key disclosure.
      </p>
      <h2 className="text-xl font-semibold text-white">Release candidate</h2>
      <p>
        Automated tests and Bitcoin Core integration have passed. Independent security review,
        physical signer compatibility, recovery drills and deployment verification remain required
        before a broad funds-handling launch. No audit certification is claimed.
      </p>
      <Link
        className="inline-flex min-h-11 items-center text-accent underline"
        href="/protect/bitcoin"
      >
        Open the Bitcoin preparation kit
      </Link>
    </article>
  );
}
