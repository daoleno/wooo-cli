# Wallet Transport Protocol v1

This document is the formal protocol contract for integrating an external wallet
transport with `wooo-cli`.

Status:

- protocol version: `1`
- implementation status: `beta`
- transport: HTTP signer

The design goal is simple:

- `wooo-cli` may plan and route writes
- the trusted signer authorizes and signs
- private keys never need to enter the main `wooo-cli` process

For a higher-level integration walkthrough, see
[External Wallet Integration Guide](./external-wallet.md).

## 1. Scope

This spec defines:

- the HTTP signer transport contract
- asynchronous completion via pending/polling
- metadata discovery
- the JSON request and response payloads
- the serialization rules required for `bigint` values

This spec does not define:

- remote authentication scheme design beyond basic bearer token hooks
- wallet backup or secret storage formats
- how a signer performs policy checks, human confirmation, hardware prompts, or audit logging internally

## 2. Security Model

Implementers should preserve these invariants:

1. The signer is the trust boundary. `wooo-cli` constructs a request, but the signer decides whether to authorize it.
2. Private keys must remain outside the main `wooo-cli` process.
3. Human approval and policy enforcement belong inside the signer, not just inside the planner.
4. Non-local signer URLs must use `https://`.
5. Signer auth authorizes request creation, not implicit signing. The signer must still require user approval or equivalent signer-side policy before returning a terminal success response.
6. `--yes` only skips the CLI confirmation layer. It does not remove signer-side approval or signer-side policy.

## 3. Versioning Rules

All protocol payloads in this spec carry `version: 1`.

Compatibility rules:

- a signer implementation for this spec must accept `version: 1`
- a signer must reject unknown request `kind` values
- backward-incompatible wire changes require a new protocol version
- additive fields are allowed, but current `wooo-cli` only relies on the fields defined here

## 4. Transport

Register a wallet backed by an HTTP signer:

```bash
wooo-cli wallet connect my-signer --signer http://127.0.0.1:8787/
wooo-cli wallet connect remote --signer https://signer.example.com/ --auth-env SIGNER_TOKEN
```

Before connecting, users can inspect the signer:

```bash
wooo-cli wallet discover --signer http://127.0.0.1:8787/ --json
```

Transport contract:

- `GET /` returns signer metadata
- `POST /` accepts the signer request JSON and returns either a terminal response or a pending response
- if `POST /` returns a pending response, `GET /requests/:requestId` returns the current status

URL requirements:

- supported URL schemes are `http://` and `https://`
- non-local signer URLs must use `https://`
- auth token is resolved from an env var name stored on the wallet record, not persisted in config

Request requirements:

- if `authEnv` is configured, `wooo-cli` sends `Authorization: Bearer <token>` with every request
- the signer should authenticate the caller before accepting a signer request

## 5. Metadata Discovery

The signer must expose metadata on `GET /`.

Required payload:

```json
{
  "version": 1,
  "kind": "wooo-signer",
  "supportedKinds": [
    "evm-sign-typed-data",
    "evm-write-contract",
    "hyperliquid-sign-l1-action"
  ],
  "wallets": [
    {
      "address": "0xabc123...",
      "chain": "evm"
    }
  ]
}
```

Schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `version` | `1` | yes | Metadata schema version |
| `kind` | `"wooo-signer"` | yes | Identifies the transport contract |
| `supportedKinds` | `string[]` | yes | Subset of request kinds from section 7 |
| `wallets` | `array` | yes | At least one advertised wallet |

Wallet descriptor schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `address` | `string` | yes | EVM checksum or Solana base58 address |
| `chain` | `"evm"` or `"solana"` | yes | Wallet family, not a specific EVM chain |

## 6. Serialization Rules

All payloads are UTF-8 JSON objects.

`bigint` encoding:

```json
{
  "$type": "bigint",
  "value": "1000000000000000000"
}
```

This applies to fields such as `contract.value` and `approval.amount`.

## 7. Request Payloads

Every request extends the same base shape.

### 7.1 Base Request Fields

| Field | Type | Required | Notes |
|------|------|----------|------|
| `version` | `1` | yes | Protocol version |
| `kind` | request kind | yes | See below |
| `wallet` | object | yes | Wallet metadata, not secret material |
| `origin` | object | no | Planner context for policy and audit |

`wallet` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `name` | `string` | yes | Wallet name inside `wooo-cli` |
| `address` | `string` | yes | Wallet address |
| `chain` | `string` | yes | `evm` or `solana` |
| `mode` | `"local"` or `"external"` | yes | Wallet source |

`origin` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `command` | `string` | no | CLI command name |
| `group` | `string` | no | Top-level group such as `dex`, `lend`, `perps` |
| `protocol` | `string` | no | Protocol name such as `uniswap`, `aave`, `hyperliquid` |

Prompt schema used by some request kinds:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `action` | `string` | yes | Human-facing summary |
| `details` | `Record<string, boolean \| number \| string \| null>` | no | Human-facing structured context |

### 7.2 `evm-sign-typed-data`

EVM typed-data signing (EIP-712). Used for Polymarket CLOB auth, order signing, etc.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `chainName` | `string` | yes | Specific EVM chain |
| `typedData` | object | yes | EIP-712 typed-data payload |
| `prompt` | object | no | Human-facing signer prompt |

### 7.3 `evm-write-contract`

EVM contract writes.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `chainName` | `string` | yes | Specific EVM chain |
| `contract` | object | yes | Contract write request (address, abi, functionName, args, value) |
| `approval` | object | no | Token approval context (token, spender, amount) |
| `prompt` | object | no | Human-facing signer prompt |

### 7.4 `solana-send-versioned-transaction`

Solana versioned transactions.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `network` | `string` | yes | e.g. `mainnet-beta` |
| `serializedTransactionBase64` | `string` | yes | Unsigned versioned transaction bytes |
| `prompt` | object | no | Human-facing signer prompt |

### 7.5 `hyperliquid-sign-l1-action`

Hyperliquid L1 action signing.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `request` | object | yes | Action, nonce, context, vaultAddress, expiresAfter, sandbox, prompt |

## 8. Response Payloads

Every response is a JSON object with `ok: true` or `ok: false`.

### 8.1 Pending Response

For async operations where approval happens out-of-band (browser wallet, app, etc.).

```json
{
  "ok": true,
  "status": "pending",
  "requestId": "req_123",
  "pollAfterMs": 1000
}
```

Return with HTTP `202 Accepted`. `wooo-cli` polls `GET /requests/:requestId` until a terminal response is returned.

### 8.2 Transaction Hash Success

```json
{ "ok": true, "txHash": "0xabc123..." }
```

### 8.3 Hex Signature Success

```json
{ "ok": true, "signatureHex": "0xabc123..." }
```

### 8.4 Structured Signature Success (Hyperliquid)

```json
{ "ok": true, "signature": { "r": "0xabc...", "s": "0xdef...", "v": 27 } }
```

### 8.5 Error Response

```json
{ "ok": false, "error": "Signer request rejected" }
```

## 9. Implementation Checklist

An external wallet transport is ready for `wooo-cli` when:

1. it accepts the payloads in section 7 as JSON
2. it returns the payloads in section 8 as JSON
3. it performs approval and policy checks before signing
4. it never exposes raw private key material to `wooo-cli`
5. it implements `GET /` metadata and `POST /` request acceptance
6. if async, it implements `GET /requests/:requestId` for polling
7. if authenticated, it does not let signer auth bypass signer-side approval
