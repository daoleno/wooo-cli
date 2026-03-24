# External Wallet Integration Guide

This guide is for teams integrating their own external wallet system with `wooo-cli`.

Use this document when you need to decide:

- how to expose your wallet system as a signing broker
- how to connect it to `wooo-cli`
- what security properties the integration must preserve
- what users can expect when humans and AI both drive the CLI

## What `wooo-cli` Assumes

`wooo-cli` is the planner and execution router. The signer is the trust boundary.

That means:

- `wooo-cli` may build a request such as "swap USDC to ETH on Uniswap"
- the signer decides whether the request is allowed
- the signer signs or broadcasts locally
- `wooo-cli` only receives a tx hash or a protocol-specific signature

This keeps the core safety property intact:

- AI can use the CLI
- AI does not need the private key
- signer-side policy can still deny or require human approval

## Integration Shape

External wallets connect via an HTTP signing broker. The broker is an HTTP endpoint that:

1. Exposes `GET /` to return signer metadata (advertised wallets, supported request kinds)
2. Accepts `POST /` with a JSON signer request
3. Either completes immediately or returns `pending` plus a `requestId`
4. If `pending`, exposes `GET /requests/:requestId` so `wooo-cli` can poll for completion
5. Enforces approval or policy before signing
6. Returns a terminal JSON response (tx hash, signature, or error)

Authentication is optional. When configured, `wooo-cli` reads a bearer token from an environment variable and sends it as `Authorization: Bearer <token>`.

## Fastest Path To A Working Integration

1. Expose an HTTP endpoint.
2. Implement `GET /` to return signer metadata.
3. Implement `POST /` to accept the signer request JSON.
4. Either complete immediately or return `pending` plus a `requestId`.
5. If `pending`, implement `GET /requests/:requestId` for polling.
6. Coordinate the real wallet approval in your backend/frontend/app.
7. Return the terminal signer response JSON.

Discover and connect:

```bash
wooo-cli wallet discover --broker http://127.0.0.1:8787/ --json

wooo-cli wallet connect my-signer --broker http://127.0.0.1:8787/
```

With authentication:

```bash
wooo-cli wallet connect remote-signer \
  --broker https://signer.example.com/ \
  --auth-env SIGNER_TOKEN
```

If the broker advertises multiple wallets, specify one explicitly:

```bash
wooo-cli wallet connect my-signer \
  --broker http://127.0.0.1:8787/ \
  --address 0xabc123...
```

## Metadata Discovery

The broker must expose metadata on `GET /`:

```json
{
  "version": 1,
  "kind": "wooo-signer",
  "supportedKinds": [
    "evm-sign-typed-data",
    "evm-write-contract",
    "hyperliquid-sign-l1-action",
    "solana-send-versioned-transaction"
  ],
  "wallets": [
    { "address": "0xabc123...", "chain": "evm" }
  ]
}
```

## Request / Response Contract

All requests and responses use JSON. See the request kind examples below.

**Supported request kinds:**

| Kind | Use Case |
|------|----------|
| `evm-sign-typed-data` | EIP-712 signing (Polymarket auth, etc.) |
| `evm-write-contract` | EVM contract writes |
| `solana-send-versioned-transaction` | Solana transaction submission |
| `hyperliquid-sign-l1-action` | Hyperliquid L1 action signing |

**Response shapes:**

| Response | When |
|----------|------|
| `{ "ok": true, "status": "pending", "requestId": "..." }` | Async, poll later |
| `{ "ok": true, "txHash": "0x..." }` | EVM/Solana execution success |
| `{ "ok": true, "signatureHex": "0x..." }` | EIP-712 signing success |
| `{ "ok": true, "signature": { "r": "0x...", "s": "0x...", "v": 27 } }` | Hyperliquid signing success |
| `{ "ok": false, "error": "..." }` | Rejection or failure |

`bigint` values in request payloads use tagged encoding: `{ "$type": "bigint", "value": "1000000000000000000" }`.

## User Experience After Integration

Once connected, the wallet works transparently:

```bash
wooo-cli wallet switch my-signer
wooo-cli swap ETH USDC 1 --chain ethereum --yes
wooo-cli dex uniswap swap ETH USDC 1 --chain ethereum --yes
wooo-cli dex jupiter swap SOL USDC 10 --yes
```

This is true whether the command is launched by a human, a script, or an AI agent.

## Security Checklist

An integration is aligned with the intended model when:

1. `wooo-cli` never receives raw private keys, seed phrases, or wallet backups
2. The signer enforces its own allowlist, rate limits, policy, or human approval
3. Broker auth authorizes request creation, not implicit signing
4. Rejections are fail-closed — malformed or unsupported requests return errors
5. Audit logs are kept on the signer side

## Reference Implementations

This repo includes two reference implementations:

- local signer service: [src/examples/signer-service.ts](../src/examples/signer-service.ts)
- async wallet broker: [src/examples/signer-broker.ts](../src/examples/signer-broker.ts)

The broker example is intentionally a coordinator, not a signer. It demonstrates metadata discovery, authenticated request creation, async `pending` polling, and out-of-band request resolution.
