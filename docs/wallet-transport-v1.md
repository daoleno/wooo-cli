# Wallet Transport Protocol v1

This document is the formal protocol contract for integrating an external wallet
transport with `wooo-cli`.

Status:

- protocol version: `1`
- implementation status: `beta`
- intended transports: local command, local HTTP service, and remote HTTP broker

The design goal is simple:

- `wooo-cli` may plan and route writes
- the trusted signer authorizes and signs locally
- private keys never need to enter the main `wooo-cli` process

For a higher-level integration walkthrough, see
[External Wallet Integration Guide](./external-wallet.md).

## 1. Scope

This spec defines:

- the command transport contract
- the local HTTP service transport contract
- the remote HTTP broker transport contract
- asynchronous completion for local HTTP service transport
- metadata discovery for HTTP transports
- the JSON request and response payloads shared by all transports
- the serialization rules required for `bigint` values

This spec does not define:

- remote authentication scheme design beyond basic broker transport hooks
- wallet backup or secret storage formats
- how a signer performs policy checks, human confirmation, hardware prompts, or audit logging internally

## 2. Security Model

Implementers should preserve these invariants:

1. The signer is the trust boundary. `wooo-cli` constructs a request, but the signer decides whether to authorize it.
2. Private keys must remain outside the main `wooo-cli` process.
3. Human approval and policy enforcement belong inside the signer, not just inside the planner.
4. Service transport is local-only. Current `wooo-cli` only trusts loopback URLs such as `127.0.0.1`, `::1`, and `localhost` for service transport.
5. Broker transport is a separate trust model. It may be remote, but it must be explicitly configured and must not treat API authentication as a replacement for signer-side user approval.
6. `--yes` only skips the CLI confirmation layer. It does not remove signer-side approval or signer-side policy.

## 3. Versioning Rules

All protocol payloads in this spec carry `version: 1`.

Compatibility rules:

- a signer implementation for this spec must accept `version: 1`
- a signer must reject unknown request `kind` values
- backward-incompatible wire changes require a new protocol version
- additive fields are allowed, but current `wooo-cli` only relies on the fields defined here

## 4. Transport Options

`wooo-cli` supports three external wallet transport shapes.

### 4.1 Command Transport

Register a wallet backed by a local signer executable:

```bash
wooo-cli wallet connect ledger-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["/usr/local/bin/my-signer","--profile","main"]'
```

Runtime contract:

1. `wooo-cli` serializes the signer request to a JSON file.
2. `wooo-cli` launches the configured command.
3. `wooo-cli` appends:
   `--request-file <path> --response-file <path>`
4. The signer reads the request file, authorizes or rejects the action locally,
   writes the response JSON file, and exits.

Exit semantics:

- success: exit code `0` and a success response body
- rejection or failure: non-zero exit code and an error response body

Current CLI behavior:

- if the command exits non-zero and the response body is `{ "ok": false, "error": "..." }`,
  `wooo-cli` surfaces that `error`
- if the command exits non-zero without a valid error response, `wooo-cli` treats it as signer failure

Environment behavior:

- command signers do not inherit the full parent environment
- `wooo-cli` forwards `WOOO_CONFIG_DIR`, `WOOO_SIGNER_*`, and a minimal set of shell and terminal variables such as `PATH`, `HOME`, and `TERM`
- `WOOO_MASTER_PASSWORD` is not forwarded to external wallet transports

### 4.2 Service Transport

Register a wallet backed by a local HTTP signer service:

```bash
wooo-cli wallet connect signer-service \
  --url http://127.0.0.1:8787/
```

Before connecting, users can inspect the service:

```bash
wooo-cli wallet discover --url http://127.0.0.1:8787/ --json
```

Transport contract:

- `GET /` returns signer metadata
- `POST /` accepts the signer request JSON and returns either a terminal signer response JSON body or a pending response
- if `POST /` returns a pending response, `GET /requests/:requestId` returns the current pending or terminal response body

Locality requirements:

- current `wooo-cli` only accepts loopback hosts
- supported hostnames are `127.0.0.1`, `::1`, and `localhost`
- supported URL schemes are `http://` and `https://`

Service response requirements:

- the response body must not be empty
- the response body must be valid JSON
- async services should return HTTP `202 Accepted` while a request is still pending
- on failure or rejection, implementations should return `{ "ok": false, "error": "..." }`
- `wooo-cli` can surface the error body on non-2xx responses when the JSON matches the protocol

### 4.3 Broker Transport

Register a wallet backed by a wallet broker:

```bash
wooo-cli wallet connect broker-main \
  --broker-url https://broker.example.com/ \
  --auth-env WOOO_BROKER_TOKEN
```

Before connecting, users can inspect the broker:

```bash
wooo-cli wallet discover \
  --broker-url https://broker.example.com/ \
  --auth-env WOOO_BROKER_TOKEN \
  --json
```

Transport contract:

- `GET /` returns broker metadata
- `POST /` accepts the signer request JSON and returns either a terminal signer response JSON body or a pending response
- if `POST /` returns a pending response, `GET /requests/:requestId` returns the current pending or terminal response body

Broker URL requirements:

- supported URL schemes are `http://` and `https://`
- non-local broker URLs must use `https://`
- broker auth is supplied by an env var name stored on the wallet record, not by persisting the token itself in CLI config

Broker request requirements:

- the broker must authenticate the caller before accepting a signer request
- broker authentication authorizes request creation, not implicit signing
- the broker must still require user approval or equivalent wallet-side policy before returning a terminal success response

## 5. Metadata Discovery

HTTP transports must expose metadata on `GET /`.

Required payload:

```json
{
  "version": 1,
  "kind": "wooo-signer-service",
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
| `kind` | `"wooo-signer-service"` or `"wooo-wallet-broker"` | yes | Identifies the HTTP transport contract |
| `supportedKinds` | `string[]` | yes | Subset of request kinds from section 7 |
| `wallets` | `array` | yes | At least one advertised wallet |

Wallet descriptor schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `address` | `string` | yes | EVM checksum or Solana base58 address |
| `chain` | `"evm"` or `"solana"` | yes | Wallet family, not a specific EVM chain |

Current `wooo-cli` behavior:

- a service or broker must advertise at least one wallet
- if multiple wallets match the user's requested filters, the user must supply `--address`
- `supportedKinds` is displayed by discovery tooling and should be accurate

## 6. Serialization Rules

All transports use the same JSON payloads.

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
| `name` | `string` | yes | Wallet name inside `wooo-cli` |
| `address` | `string` | yes | Wallet address |
| `chain` | `string` | yes | `evm` or `solana` in current implementations |
| `mode` | `"local"` or `"external"` | yes | Whether `wooo-cli` is using a local wallet or an external wallet transport |

`origin` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `command` | `string` | no | CLI command name |
| `group` | `string` | no | Top-level group such as `dex`, `lend`, `perps`, or `prediction` |
| `protocol` | `string` | no | Protocol name such as `uniswap`, `aave`, `hyperliquid`, or `polymarket` |

Prompt schema used by some request kinds:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `action` | `string` | yes | Human-facing summary |
| `details` | `Record<string, boolean \| number \| string \| null>` | no | Human-facing structured context |

### 7.2 `evm-sign-typed-data`

Use this request kind for EVM typed-data signing flows such as Polymarket CLOB
authentication and order signing.

Additional fields:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `chainName` | `string` | yes | Specific EVM chain, for example `polygon` |
| `typedData` | object | yes | EIP-712 typed-data payload |
| `prompt` | object | no | Human-facing signer prompt override |

`typedData` schema:

| Field | Type | Required | Notes |
|------|------|----------|------|
| `domain` | `object` | yes | EIP-712 domain |
| `types` | `Record<string, { name: string, type: string }[]>` | yes | EIP-712 type definitions |
| `primaryType` | `string` | yes | EIP-712 primary type |
| `message` | `object` | yes | EIP-712 message body |

Example:

```json
{
  "version": 1,
  "kind": "evm-sign-typed-data",
  "wallet": {
    "name": "prediction-main",
    "address": "0x1111111111111111111111111111111111111111",
    "chain": "evm",
    "mode": "external"
  },
  "origin": {
    "group": "prediction",
    "protocol": "polymarket",
    "command": "order"
  },
  "chainName": "polygon",
  "typedData": {
    "domain": {
      "name": "ClobAuthDomain",
      "version": "1",
      "chainId": 137
    },
    "types": {
      "ClobAuth": [
        { "name": "address", "type": "address" },
        { "name": "timestamp", "type": "string" },
        { "name": "nonce", "type": "uint256" },
        { "name": "message", "type": "string" }
      ]
    },
    "primaryType": "ClobAuth",
    "message": {
      "address": "0x1111111111111111111111111111111111111111",
      "timestamp": "1700000000",
      "nonce": 1,
      "message": "This message attests that I control the given wallet"
    }
  },
  "prompt": {
    "action": "Authorize Polymarket CLOB authentication",
    "details": {
      "domain": "ClobAuthDomain",
      "primaryType": "ClobAuth"
    }
  }
}
```

### 7.3 `evm-write-contract`

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
    "mode": "external"
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

### 7.4 `solana-send-versioned-transaction`

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
    "mode": "external"
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

### 7.5 `hyperliquid-sign-l1-action`

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

- command signers support this request kind
- local signer services support this request kind
- wallet brokers support this request kind
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
    "mode": "external"
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

### 8.1 Pending Response

Use this for service or broker transport when signer execution will complete asynchronously,
for example when a local bridge or remote broker hands the request to a browser wallet or desktop app.

```json
{
  "ok": true,
  "status": "pending",
  "requestId": "req_123",
  "pollAfterMs": 1000
}
```

Rules:

- `requestId` must uniquely identify the accepted signer request within the transport
- `pollAfterMs` is optional and hints how long `wooo-cli` should wait before polling again
- command transport does not use this response shape
- service and broker transport should return this response with HTTP `202 Accepted`

### 8.2 Transaction Hash Success

Use this for EVM and Solana execution results.

```json
{
  "ok": true,
  "txHash": "0xabc123..."
}
```

### 8.3 Signature Success

Use this for EVM typed-data signing.

```json
{
  "ok": true,
  "signatureHex": "0xabc123..."
}
```

### 8.4 Signature Success

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

### 8.5 Error Response

Use this for rejection, policy denial, missing approval, unsupported request
kind, or execution failure.

```json
{
  "ok": false,
  "error": "Signer request rejected"
}
```

Error handling rules:

- command signers should still write a response body before exiting non-zero
- local signer services should still return a valid JSON body on non-2xx responses
- broker transports should still return a valid JSON body on non-2xx responses
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
- [src/examples/signer-broker.ts](../src/examples/signer-broker.ts)

## 10. Current Capability Matrix

Current `wooo-cli` support by wallet transport:

| Capability | Local wallet | Command signer | Local signer service | Wallet broker |
|------|------|------|------|------|
| EVM typed-data signing | yes | yes | yes | yes |
| EVM writes | yes | yes | yes | yes |
| Solana writes | yes | yes | yes | yes |
| Hyperliquid L1 action signing | yes | yes | yes | yes |

## 11. Implementation Checklist

An external wallet transport is ready for `wooo-cli` when all of the following are true:

1. it accepts the payloads in section 7 exactly as JSON
2. it returns the payloads in section 8 exactly as JSON
3. it performs local approval and policy checks before signing
4. it never exposes raw private key material to `wooo-cli`
5. if it uses service transport, it binds to loopback and implements `GET /` and `POST /`
6. if it uses async service or broker transport, it also implements `GET /requests/:requestId`
7. if it uses broker transport, it authenticates the caller and does not let broker auth bypass signer-side approval
8. if it uses command transport, it accepts `--request-file` and `--response-file`
