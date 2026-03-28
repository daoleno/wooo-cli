# Remote Signer Integration Guide

This guide is for teams integrating a remote signer with `wooo-cli`.

Use this document when you need to decide:

- how to expose your signer as an HTTP transport
- how to advertise remote accounts to `wooo-cli`
- what security properties the integration must preserve
- what users can expect when humans and AI both drive the CLI

## Core Model

`wooo-cli` is the planner and execution router. The signer is the trust boundary.

That means:

- `wooo-cli` may prepare a transaction or typed-data payload
- the signer decides whether that operation is allowed
- the signer signs or broadcasts locally
- `wooo-cli` only receives a tx hash, hex signature, or protocol-specific signature

This keeps the core safety property intact:

- AI can use the CLI
- AI does not need the private key
- signer-side policy can still deny or require human approval

## Recommended External Test Path

For external integration testing, prefer an Anvil mainnet fork over testnets.

Why:

- `wooo-cli` ships mainnet protocol addresses and market names
- fork tests validate the exact contracts and execution paths used in production
- you can exercise real DeFi writes without risking real funds

For EVM DeFi testing, the recommended shape is:

1. start an Anvil fork with the mainnet chain id preserved
2. point `wooo-cli`'s `ethereum` RPC to the fork
3. point your signer backend to the same fork RPC
4. connect the signer with `wooo-cli wallet connect`
5. run DeFi commands with `--chain ethereum`

Do not treat testnets as the canonical release or integration gate for this repo.

## Integration Shape

Remote accounts connect via an HTTP signer transport. The signer endpoint:

1. Exposes `GET /` to return transport metadata
2. Accepts `POST /` with a JSON request
3. Either completes immediately or returns `pending` plus a `requestId`
4. If `pending`, exposes `GET /requests/:requestId` so `wooo-cli` can poll for completion
5. Enforces approval or policy before signing
6. Returns a terminal JSON response

Authentication is optional. When configured, `wooo-cli` reads a bearer token from an environment variable and sends it as `Authorization: Bearer <token>`.

Use a dedicated env name that matches `WOOO_SIGNER_AUTH_*`, for example `WOOO_SIGNER_AUTH_TOKEN`.

## Fastest Path To A Working Integration

1. Expose an HTTP endpoint.
2. Implement `GET /` to return transport metadata.
3. Implement `POST /` to accept request JSON.
4. Respect `clientRequestId` as an idempotency key for repeated `POST /` calls.
5. Either complete immediately or return `pending` plus a `requestId`.
6. If `pending`, implement `GET /requests/:requestId` for polling.
7. Coordinate the real approval flow in your backend, frontend, wallet app, or hardware device.
8. Return a terminal signer response JSON.

Discover and connect:

```bash
wooo-cli wallet discover --signer http://127.0.0.1:8787/ --json

wooo-cli wallet connect my-signer --signer http://127.0.0.1:8787/
```

With authentication:

```bash
wooo-cli wallet connect remote-signer \
  --signer https://signer.example.com/ \
  --auth-env WOOO_SIGNER_AUTH_TOKEN
```

If the signer advertises multiple accounts, specify one explicitly:

```bash
wooo-cli wallet connect my-signer \
  --signer http://127.0.0.1:8787/ \
  --address 0xabc123... \
  --chain evm
```

## Anvil Fork Recipe For External Wallet Testing

Start a fork:

```bash
anvil --fork-url https://ethereum.publicnode.com --chain-id 1 --port 8545
```

Point `wooo-cli` at the fork:

```json
{
  "chains": {
    "ethereum": {
      "rpc": "http://127.0.0.1:8545"
    }
  }
}
```

Connect the signer:

```bash
export WOOO_SIGNER_AUTH_TOKEN=...

wooo-cli wallet connect external-fork-signer \
  --signer http://127.0.0.1:8787/ \
  --auth-env WOOO_SIGNER_AUTH_TOKEN

wooo-cli wallet switch external-fork-signer
```

Run fork-backed validation commands:

```bash
wooo-cli dex uniswap swap ETH USDC 0.1 --chain ethereum --yes
wooo-cli lend aave supply USDC 100 --chain ethereum --market AaveV3Ethereum --yes
wooo-cli lend aave borrow WETH 0.001 --chain ethereum --market AaveV3Ethereum --yes
wooo-cli lend aave repay WETH 0.001 --chain ethereum --market AaveV3Ethereum --yes
wooo-cli lend morpho supply 0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc 50 --chain ethereum --yes
```

Important details:

1. Keep the forked chain id as `1` for Ethereum mainnet compatibility.
2. Your signer must broadcast to the fork RPC, not to a real mainnet RPC.
3. The CLI should still use mainnet chain names like `ethereum` and mainnet market names like `AaveV3Ethereum`.
4. If the signer enforces policy, that policy should still apply in the fork environment.

## Metadata Discovery

The signer must expose metadata on `GET /`:

```json
{
  "version": 1,
  "kind": "wooo-wallet-transport",
  "transport": "http-signer",
  "accounts": [
    {
      "address": "0xabc123...",
      "chainFamily": "evm",
      "operations": [
        "sign-typed-data",
        "sign-and-send-transaction",
        "sign-protocol-payload"
      ]
    }
  ]
}
```

The key design change is that capabilities are account-scoped, not signer-scoped.

## Operation Contract

All requests and responses use JSON.

Supported operations:

| Operation | Use Case |
|----------|----------|
| `sign-typed-data` | EIP-712 signing such as Polymarket auth |
| `sign-and-send-transaction` | EVM or Solana transaction execution |
| `sign-protocol-payload` | Protocol-specific signing such as Hyperliquid L1 actions |

Response shapes:

| Response | When |
|----------|------|
| `{ "ok": true, "status": "pending", "requestId": "..." }` | Async approval, poll later |
| `{ "ok": true, "txHash": "0x..." }` | Transaction execution success |
| `{ "ok": true, "signatureHex": "0x..." }` | Typed-data signing success |
| `{ "ok": true, "signature": { "r": "0x...", "s": "0x...", "v": 27 } }` | Protocol payload signing success |
| `{ "ok": false, "error": "..." }` | Rejection or failure |

`bigint` values in request payloads use tagged encoding:

```json
{ "$type": "bigint", "value": "1000000000000000000" }
```

See the formal wire contract in [Wallet Transport Protocol](./wallet-transport.md).

## User Experience After Integration

Once connected, the remote account works transparently:

```bash
wooo-cli wallet switch my-signer
wooo-cli swap ETH USDC 1 --chain ethereum --yes
wooo-cli dex uniswap swap ETH USDC 1 --chain ethereum --yes
wooo-cli dex jupiter swap SOL USDC 10 --yes
```

This is true whether the command is launched by a human, a script, or an AI agent.

This repository has automated coverage for the fork-backed remote signer path.
The remote signer E2E suite validates Uniswap, Aave, Morpho, and Polymarket
flows against forked networks before release.

## Security Checklist

An integration is aligned with the intended model when:

1. `wooo-cli` never receives raw private keys, seed phrases, or wallet backups
2. the signer enforces its own allowlist, rate limits, policy, or human approval
3. signer auth authorizes request creation, not implicit signing
4. rejections are fail-closed; malformed or unsupported requests return errors
5. audit logs are kept on the signer side

## Reference Implementations

This repo includes two reference implementations:

- local signer service: [src/examples/signer-service.ts](../src/examples/signer-service.ts)
- async signer example: [src/examples/async-signer.ts](../src/examples/async-signer.ts)

The async signer example is intentionally a coordinator, not the signing key holder. It demonstrates metadata discovery, authenticated request creation, async `pending` polling, idempotent request handling, and out-of-band request resolution.
