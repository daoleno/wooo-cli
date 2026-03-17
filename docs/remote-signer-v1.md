# Remote Signer Protocol v1

This document is the formal protocol contract for integrating a remote signer
with `wooo`.

Status:

- protocol version: `1`
- implementation status: `beta`
- intended transports: local command and local HTTP service

The design goal is simple:

- `wooo` may plan and route writes
- the trusted signer authorizes and signs locally
- private keys never need to enter the main `wooo` process

For a higher-level integration walkthrough, see
[Remote Signer Integration Guide](./remote-signer.md).

## 1. Scope

This spec defines:

- the command transport contract
- the local HTTP service transport contract
- metadata discovery for remote signers using service transport
- the JSON request and response payloads shared by both transports
- the serialization rules required for `bigint` values

This spec does not define:

- remote signer authentication over the internet
- wallet backup or secret storage formats
- how a signer performs policy checks, human confirmation, hardware prompts, or audit logging internally

## 2. Security Model

Implementers should preserve these invariants:

1. The signer is the trust boundary. `wooo` constructs a request, but the signer decides whether to authorize it.
2. Private keys must remain outside the main `wooo` process.
3. Human approval and policy enforcement belong inside the signer, not just inside the planner.
4. Service signers are local-only. Current `wooo` builds only trust loopback URLs such as `127.0.0.1`, `::1`, and `localhost`.
5. `--yes` only skips the CLI confirmation layer. It does not remove signer-side approval or signer-side policy.

## 3. Versioning Rules

All protocol payloads in this spec carry `version: 1`.

Compatibility rules:

- a signer implementation for this spec must accept `version: 1`
- a signer must reject unknown request `kind` values
- backward-incompatible wire changes require a new protocol version
- additive fields are allowed, but current `wooo` only relies on the fields defined here

## 4. Transport Options

`wooo` supports two remote signer transport shapes.

### 4.1 Command Transport

Register a wallet backed by a local signer executable:

```bash
wooo wallet connect ledger-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["/usr/local/bin/my-signer","--profile","main"]'
```

Runtime contract:

1. `wooo` serializes the signer request to a JSON file.
2. `wooo` launches the configured command.
3. `wooo` appends:
   `--request-file <path> --response-file <path>`
4. The signer reads the request file, authorizes or rejects the action locally,
   writes the response JSON file, and exits.

Exit semantics:

- success: exit code `0` and a success response body
- rejection or failure: non-zero exit code and an error response body

Current CLI behavior:

- if the command exits non-zero and the response body is `{ "ok": false, "error": "..." }`,
  `wooo` surfaces that `error`
- if the command exits non-zero without a valid error response, `wooo` treats it as signer failure

Environment behavior:

- remote signer commands do not inherit the full parent environment
- `wooo` forwards `WOOO_CONFIG_DIR`, `WOOO_SIGNER_*`, and a minimal set of shell and terminal variables such as `PATH`, `HOME`, and `TERM`
- `WOOO_MASTER_PASSWORD` is not forwarded to remote signers

### 4.2 Service Transport

Register a wallet backed by a local HTTP signer service:

```bash
wooo wallet connect signer-service \
  --url http://127.0.0.1:8787/
```

Before connecting, users can inspect the service:

```bash
wooo wallet discover --url http://127.0.0.1:8787/ --json
```

Transport contract:

- `GET /` returns signer metadata
- `POST /` accepts the signer request JSON and returns the signer response JSON

Locality requirements:

- current `wooo` only accepts loopback hosts
- supported hostnames are `127.0.0.1`, `::1`, and `localhost`
- supported URL schemes are `http://` and `https://`

Service response requirements:

- the response body must not be empty
- the response body must be valid JSON
- on failure or rejection, implementations should return `{ "ok": false, "error": "..." }`
- `wooo` can surface the error body on non-2xx responses when the JSON matches the protocol

## 5. Metadata Discovery

Service signers must expose metadata on `GET /`.

Required payload:

```json
{
  "version": 1,
  "kind": "wooo-signer-service",
  "supportedKinds": [
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
| `kind` | `"wooo-signer-service"` | yes | Identifies the service contract |
| `supportedKinds` | `string[]` | yes | Subset of request kinds from section 7 |
| `wallets` | `array` | yes | At least one advertised wallet |

Wallet descriptor schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `address` | `string` | yes | EVM checksum or Solana base58 address |
| `chain` | `"evm"` or `"solana"` | yes | Wallet family, not a specific EVM chain |

Current `wooo` behavior:

- a service must advertise at least one wallet
- if multiple wallets match the user's requested filters, the user must supply `--address`
- `supportedKinds` is displayed by discovery tooling and should be accurate

## 6. Serialization Rules

Both transports use the same JSON payloads.

Encoding rules:

- payloads are UTF-8 JSON objects
- `bigint` values are encoded using a tagged object
- request and response examples in this document use the exact wire shape

`bigint` encoding:

```json
{
  "$type": "bigint",
  "value": "1000000000000000000"
}
```

This applies to fields such as:

- `contract.value`
- `approval.amount`

Arrays and nested objects otherwise use ordinary JSON encoding.

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
| `name` | `string` | yes | Wallet name inside `wooo` |
| `address` | `string` | yes | Wallet address |
| `chain` | `string` | yes | `evm` or `solana` in current implementations |
| `mode` | `"local"` or `"remote"` | yes | Whether `wooo` is using a local wallet or a remote signer |

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

### 7.2 `evm-write-contract`

Use this request kind for EVM contract writes.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `chainName` | `string` | yes | Specific EVM chain, for example `ethereum` or `arbitrum` |
| `contract` | object | yes | Contract write request |
| `approval` | object | no | Token approval context when relevant |
| `prompt` | object | no | Human-facing signer prompt override |

`contract` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `address` | `string` | yes | Target contract |
| `abi` | `array` | yes | Standard JSON ABI fragments |
| `functionName` | `string` | yes | Function to call |
| `args` | `array` | no | JSON-serializable call arguments |
| `value` | encoded `bigint` | no | Native token value |

`approval` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `token` | `string` | yes | ERC-20 token address |
| `spender` | `string` | yes | Approval spender |
| `amount` | encoded `bigint` | yes | Approval amount |

Example:

```json
{
  "version": 1,
  "kind": "evm-write-contract",
  "wallet": {
    "name": "ledger-main",
    "address": "0x1111111111111111111111111111111111111111",
    "chain": "evm",
    "mode": "remote"
  },
  "origin": {
    "group": "dex",
    "protocol": "uniswap",
    "command": "swap"
  },
  "chainName": "ethereum",
  "contract": {
    "address": "0x2222222222222222222222222222222222222222",
    "abi": [
      {
        "type": "function",
        "name": "swapExactInputSingle"
      }
    ],
    "functionName": "swapExactInputSingle",
    "args": ["0x3333333333333333333333333333333333333333"],
    "value": {
      "$type": "bigint",
      "value": "1000000000000000000"
    }
  },
  "prompt": {
    "action": "Swap ETH for USDC",
    "details": {
      "chain": "ethereum",
      "slippageBps": 50
    }
  }
}
```

### 7.3 `solana-send-versioned-transaction`

Use this request kind for Solana versioned transactions.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `network` | `string` | yes | For example `mainnet-beta` |
| `serializedTransactionBase64` | `string` | yes | Unsigned or partially prepared versioned transaction bytes |
| `prompt` | object | no | Human-facing signer prompt override |

Example:

```json
{
  "version": 1,
  "kind": "solana-send-versioned-transaction",
  "wallet": {
    "name": "sol-main",
    "address": "9xQeWvG816bUx9EPjHmaT23yvVMR8jVx1o7DH4pDq7hW",
    "chain": "solana",
    "mode": "remote"
  },
  "origin": {
    "group": "dex",
    "protocol": "jupiter",
    "command": "swap"
  },
  "network": "mainnet-beta",
  "serializedTransactionBase64": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAED",
  "prompt": {
    "action": "Swap SOL for USDC",
    "details": {
      "network": "mainnet-beta"
    }
  }
}
```

### 7.4 `hyperliquid-sign-l1-action`

Use this request kind for Hyperliquid L1 action signing.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `request` | object | yes | Hyperliquid signing payload |

`request` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `action` | `object` | yes | Raw Hyperliquid action payload |
| `nonce` | `number` | yes | Hyperliquid nonce |
| `context` | `object` | no | Human-friendly policy context |
| `vaultAddress` | `string` | no | Vault address |
| `expiresAfter` | `number` | no | Optional expiry |
| `sandbox` | `boolean` | no | Use sandbox mode |
| `prompt` | object | no | Human-facing signer prompt override |

Transport support:

- remote signers over command transport support this request kind
- remote signers over service transport support this request kind
- local wallets support this request kind

Example:

```json
{
  "version": 1,
  "kind": "hyperliquid-sign-l1-action",
  "wallet": {
    "name": "perps-main",
    "address": "0x1111111111111111111111111111111111111111",
    "chain": "evm",
    "mode": "remote"
  },
  "origin": {
    "group": "perps",
    "protocol": "hyperliquid",
    "command": "long"
  },
  "request": {
    "action": {
      "type": "order"
    },
    "nonce": 1234567890,
    "context": {
      "actionType": "order",
      "symbol": "BTC",
      "side": "long",
      "leverage": 5,
      "sizeUsd": 1000
    },
    "prompt": {
      "action": "Open Hyperliquid BTC long",
      "details": {
        "symbol": "BTC",
        "leverage": 5,
        "sizeUsd": 1000
      }
    }
  }
}
```

## 8. Response Payloads

Every response is a JSON object with `ok: true` or `ok: false`.

### 8.1 Transaction Hash Success

Use this for EVM and Solana execution results.

```json
{
  "ok": true,
  "txHash": "0xabc123..."
}
```

### 8.2 Signature Success

Use this for Hyperliquid action signing.

```json
{
  "ok": true,
  "signature": {
    "r": "0xabc...",
    "s": "0xdef...",
    "v": 27
  }
}
```

### 8.3 Error Response

Use this for rejection, policy denial, missing approval, unsupported request
kind, or execution failure.

```json
{
  "ok": false,
  "error": "Signer request rejected"
}
```

Error handling rules:

- remote signers over command transport should still write a response body before exiting non-zero
- remote signers over service transport should still return a valid JSON body on non-2xx responses
- `error` should be human-readable and safe to surface in terminal output

## 9. Recommended Signer Behavior

This section is not required by the wire format, but it is the intended security model.

Signer implementations should:

1. enforce allowlists and risk policy locally
2. require explicit human confirmation when a request is not auto-approved
3. audit approvals and rejections locally
4. fail closed on malformed or unsupported requests
5. avoid returning secret material, derived private keys, seed phrases, or wallet backups

The in-repo reference implementations share this model:

- [src/examples/command-signer.ts](../src/examples/command-signer.ts)
- [src/examples/signer-service.ts](../src/examples/signer-service.ts)

## 10. Current Capability Matrix

Current `wooo` support by wallet transport:

| Capability | Local wallet | Remote signer (command) | Remote signer (service) |
|------|------|------|------|
| EVM writes | yes | yes | yes |
| Solana writes | yes | yes | yes |
| Hyperliquid L1 action signing | yes | yes | yes |

## 11. Implementation Checklist

A remote signer is ready for `wooo` when all of the following are true:

1. it accepts the payloads in section 7 exactly as JSON
2. it returns the payloads in section 8 exactly as JSON
3. it performs local approval and policy checks before signing
4. it never exposes raw private key material to `wooo`
5. if it uses service transport, it binds to loopback and implements `GET /` and `POST /`
6. if it uses command transport, it accepts `--request-file` and `--response-file`
