# Wallet Transport Protocol

This document defines the remote wallet transport contract used by `wooo-cli`.

Status:

- protocol version: `1`
- implementation status: `beta`
- transport: HTTP signer

Design goals:

- `wooo-cli` plans operations and prepares transactions
- the trusted signer approves and executes operations
- private keys never enter the main `wooo-cli` process
- transport semantics stay separate from wallet-vault semantics

For the higher-level integration flow, see
[Remote Signer Integration Guide](./external-wallet.md).

## 1. Scope

This spec defines:

- the HTTP transport contract for remote signing
- account discovery via `GET /`
- async completion via `pending` plus polling
- request and response payload shapes
- `bigint` serialization rules

This spec does not define:

- signer authentication schemes beyond bearer-token hooks
- wallet backup or secret-storage formats
- signer-side approval UX, policy logic, or audit log storage

## 2. Security Model

Implementers should preserve these invariants:

1. The signer is the trust boundary. `wooo-cli` may prepare an operation, but the signer decides whether to execute it.
2. Private keys must remain outside the main `wooo-cli` process.
3. Human approval and policy enforcement belong inside the signer.
4. Non-local signer URLs must use `https://`.
5. Signer auth authorizes request creation, not implicit signing.
6. `--yes` only skips the CLI confirmation layer. It does not disable signer-side approval or signer-side policy.

## 3. Versioning Rules

All protocol payloads in this spec carry `version: 1`.

Compatibility rules:

- a signer implementation for this spec must accept `version: 1`
- a signer must reject unknown `operation` values
- backward-incompatible wire changes require a new protocol version
- additive fields are allowed, but current `wooo-cli` only relies on the fields defined here

## 4. Transport

Register a remote account backed by an HTTP signer:

```bash
wooo-cli wallet connect my-signer --signer http://127.0.0.1:8787/
wooo-cli wallet connect remote --signer https://signer.example.com/ --auth-env WOOO_SIGNER_AUTH_TOKEN
```

Inspect the signer before connecting:

```bash
wooo-cli wallet discover --signer http://127.0.0.1:8787/ --json
```

Transport contract:

- `GET /` returns transport metadata
- `POST /` accepts a request and returns either a terminal response or a pending response
- if `POST /` returns a pending response, `GET /requests/:requestId` returns the current status

URL requirements:

- supported URL schemes are `http://` and `https://`
- non-local signer URLs must use `https://`
- auth token is resolved from an env var name stored on the connected account record, not persisted in config

Request requirements:

- if `authEnv` is configured, it must match `WOOO_SIGNER_AUTH_*`
- if `authEnv` is configured, `wooo-cli` sends `Authorization: Bearer <token>` with every request
- the signer should authenticate the caller before accepting a request

## 5. Metadata Discovery

The signer must expose metadata on `GET /`.

Required payload:

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

Schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `version` | `1` | yes | Metadata schema version |
| `kind` | `"wooo-wallet-transport"` | yes | Identifies the transport contract |
| `transport` | `"http-signer"` | yes | Current transport implementation |
| `accounts` | `array` | yes | Advertised accounts and their supported operations |

Advertised account schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `address` | `string` | yes | EVM checksum or Solana base58 address |
| `chainFamily` | `"evm"` or `"solana"` | yes | Curve/account family |
| `operations` | `string[]` | yes | Supported operations for this account |

## 6. Serialization Rules

All payloads are UTF-8 JSON objects.

`bigint` encoding:

```json
{
  "$type": "bigint",
  "value": "1000000000000000000"
}
```

This applies to fields such as transaction values and approval intent amounts.

## 7. Request Payloads

Every request extends the same base shape.

### 7.1 Base Request Fields

| Field | Type | Required | Notes |
|------|------|----------|------|
| `clientRequestId` | `string` | yes | Caller-generated idempotency key for safe retry of `POST /` |
| `version` | `1` | yes | Protocol version |
| `operation` | operation name | yes | See below |
| `account` | object | yes | Target account reference |
| `context` | object | no | Planner context for policy and audit |

`clientRequestId` semantics:

- a signer must treat repeated `POST /` requests with the same `clientRequestId` as the same logical request
- if the payload differs, the signer should reject the later request with a conflict error
- if the original request is still pending, the signer should return the same pending `requestId`
- if the original request already completed, the signer should return the same terminal response

`account` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `address` | `string` | yes | Target account address |
| `chainFamily` | `string` | yes | `evm` or `solana` |
| `label` | `string` | no | Local label from `wooo-cli`, for audit/debug only |

`context` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `command` | `string` | no | CLI command name |
| `group` | `string` | no | Top-level group such as `dex`, `lend`, `perps` |
| `protocol` | `string` | no | Protocol name such as `uniswap`, `aave`, `hyperliquid` |

Prompt schema used by some operations:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `action` | `string` | yes | Human-facing summary |
| `details` | `Record<string, boolean \| number \| string \| null>` | no | Human-facing structured context |

### 7.2 `sign-typed-data`

EVM typed-data signing.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `chainId` | `string` | yes | CAIP-2 chain ID such as `eip155:137` |
| `typedData` | object | yes | EIP-712 typed-data payload |
| `prompt` | object | no | Human-facing signer prompt |

### 7.3 `sign-and-send-transaction`

Transaction submission with signer-side authorization.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `chainId` | `string` | yes | CAIP-2 chain ID |
| `transaction` | object | yes | Transaction payload |
| `intent` | object | no | Optional policy hint such as token approval |
| `prompt` | object | no | Human-facing signer prompt |

Transaction payloads:

- EVM transaction:

```json
{
  "format": "evm-transaction",
  "to": "0xabc123...",
  "data": "0x...",
  "value": { "$type": "bigint", "value": "0" }
}
```

- Solana versioned transaction:

```json
{
  "format": "solana-versioned-transaction",
  "serializedTransactionBase64": "..."
}
```

### 7.4 `sign-protocol-payload`

Protocol-specific signing escape hatch for flows that are not ordinary chain transactions.

Current payload:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `payload.protocol` | `"hyperliquid"` | yes | Protocol identifier |
| `payload.payload` | object | yes | Hyperliquid L1 action payload |

## 8. Response Payloads

Every response is a JSON object with `ok: true` or `ok: false`.

### 8.1 Pending Response

For async approval flows:

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

### 8.4 Structured Signature Success

```json
{ "ok": true, "signature": { "r": "0xabc...", "s": "0xdef...", "v": 27 } }
```

### 8.5 Error Response

```json
{ "ok": false, "error": "Request rejected" }
```

## 9. Implementation Checklist

A signer integration is ready for `wooo-cli` when:

1. it accepts the request payloads in section 7 as JSON
2. it returns the response payloads in section 8 as JSON
3. it performs approval and policy checks before signing
4. it never exposes raw private key material to `wooo-cli`
5. it implements `GET /` metadata and `POST /` request acceptance
6. if async, it implements `GET /requests/:requestId` for polling
7. if authenticated, signer auth does not bypass signer-side approval
