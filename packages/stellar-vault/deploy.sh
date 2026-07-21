#!/usr/bin/env bash
# Upload the PQWeave Stellar vault wasm to a Soroban network (default: testnet)
# and record its hash. Per-user vault instances are deployed FROM this wasm hash
# by the web app (salt = pqc_root) — keys never touch us. Idempotent: the wasm
# hash is deterministic, so re-running just re-registers the same code.
#
#   ./deploy.sh [testnet|mainnet]
set -euo pipefail

NETWORK="${1:-testnet}"
IDENTITY="${STELLAR_DEPLOYER:-pqweave-stellar-$NETWORK}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

case "$NETWORK" in
  testnet)
    PASSPHRASE="Test SDF Network ; September 2015"
    RPC="https://soroban-testnet.stellar.org"
    EXPLORER="https://stellar.expert/explorer/testnet" ;;
  mainnet|public)
    PASSPHRASE="Public Global Stellar Network ; September 2015"
    RPC="https://mainnet.sorobanrpc.com"
    EXPLORER="https://stellar.expert/explorer/public" ;;
  *) echo "unknown network: $NETWORK" >&2; exit 1 ;;
esac

echo "→ building wasm"
stellar contract build >/dev/null
WASM="target/wasm32v1-none/release/pqweave_stellar_vault.wasm"

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  echo "→ generating + funding $NETWORK identity: $IDENTITY"
  stellar keys generate "$IDENTITY" --fund --network "$NETWORK"
fi
echo "→ deployer: $(stellar keys address "$IDENTITY")"

echo "→ uploading wasm to $NETWORK"
WASM_HASH="$(stellar contract upload \
  --source-account "$IDENTITY" \
  --wasm "$WASM" \
  --network "$NETWORK" 2>/dev/null | tail -1)"

if [ -z "$WASM_HASH" ]; then echo "upload failed: empty wasm hash" >&2; exit 1; fi
echo "→ wasm hash: $WASM_HASH"

mkdir -p deployments
cat > "deployments/$NETWORK.json" <<EOF
{
  "network": "$NETWORK",
  "networkPassphrase": "$PASSPHRASE",
  "rpcUrl": "$RPC",
  "explorer": "$EXPLORER",
  "wasmHash": "$WASM_HASH"
}
EOF
echo "→ wrote deployments/$NETWORK.json"

node write-stellar-env.mjs "$NETWORK"
