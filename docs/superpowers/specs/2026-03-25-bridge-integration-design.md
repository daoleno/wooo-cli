# Bridge Integration: LI.FI + OKX Bridge

## Summary

Integrate two bridge aggregator protocols into wooo-cli: **LI.FI** and **OKX DEX Cross-Chain**. Both appear as independent protocols under `wooo bridge <protocol>`, following the existing protocol architecture. Both use the unified WriteOperation flow for transaction execution.

**Scope**: EVM chains only for this iteration. Solana-to-EVM or cross-family bridging is out of scope — both protocols validate at the command level that `--from-chain` and `--to-chain` are EVM chains.

## Commands

Each bridge protocol exposes four subcommands:

```
wooo bridge lifi quote <token> --to <token> --amount <n> --from-chain <c> --to-chain <c>
wooo bridge lifi bridge <token> --to <token> --amount <n> --from-chain <c> --to-chain <c>
wooo bridge lifi status <txHash> --from-chain <c> --to-chain <c> [--bridge <name>]
wooo bridge lifi chains [--tokens]

wooo bridge okx quote <token> --to <token> --amount <n> --from-chain <c> --to-chain <c>
wooo bridge okx bridge <token> --to <token> --amount <n> --from-chain <c> --to-chain <c>
wooo bridge okx status <txHash>
wooo bridge okx chains [--tokens]
```

- `quote` — read-only, returns route + estimated output + fees + estimated time
- `bridge` — write operation via `runWriteOperation()`: prepare → preview → confirm → execute
- `status` — read-only, polls cross-chain transaction status. LI.FI requires `--from-chain`, `--to-chain`, optional `--bridge`; OKX only requires `<txHash>`
- `chains` — read-only, lists supported chains (optionally with tokens)

## Architecture

### Approach: Fully Independent Protocols (No bridge-base)

Each protocol has its own client/types/commands/operations. No shared bridge-base abstraction — the two APIs differ significantly in authentication, response format, and capabilities. Follows the project's "no premature abstraction" principle.

### Directory Structure

```
src/protocols/
├── lifi/
│   ├── types.ts          # LifiQuote, LifiRoute, LifiStatus, LifiChain, LifiToken
│   ├── client.ts         # @lifi/sdk wrapper (getQuote, getStatus, getChains, getTokens)
│   ├── operations.ts     # createLifiBridgeOperation() → WriteOperation
│   └── commands.ts       # lifiProtocol: ProtocolDefinition, type: "bridge", name: "lifi"
├── okx-bridge/           # Directory name avoids conflict with okx/ (CEX)
│   ├── types.ts          # OkxBridgeQuote, OkxBridgeRoute, OkxBridgeStatus
│   ├── client.ts         # OKX DEX cross-chain REST API + HMAC signing
│   ├── operations.ts     # createOkxBridgeOperation() → WriteOperation
│   └── commands.ts       # okxBridgeProtocol: ProtocolDefinition, type: "bridge", name: "okx"
```

Note: `protocol.name = "okx"` in the bridge protocol. The directory is named `okx-bridge/` to avoid filesystem conflict with the existing `okx/` CEX directory. CLI routing (`index.ts`) groups by type first then uses `protocol.name` as subcommand key, so `wooo cex okx` and `wooo bridge okx` don't collide.

`getProtocol(name)` currently uses `.find()` and would return the first match. Since it's not used in business code (only tests), we leave it as-is. If it's needed later, extend to `getProtocol(name, group?)`.

Both protocols omit the `chains` field in ProtocolDefinition (supported chains are dynamic, fetched from the `chains` subcommand at runtime). Neither needs a `constants.ts` file — both are API-based with no direct contract interactions.

## LI.FI Protocol

### SDK

Use `@lifi/sdk` (^3.16.3). Only use the SDK for data fetching (quote, status, chains, tokens), not for transaction execution.

### client.ts

```typescript
import { createConfig, getQuote, getStatus, getChains, getTokens } from '@lifi/sdk'

// Initialize once
createConfig({ integrator: 'wooo-cli' })
```

Methods:
- `getQuote(params)` → calls `@lifi/sdk` `getQuote()`. Returns route with `transactionRequest` (to, data, value, gasLimit, gasPrice).
- `getStatus(txHash, bridge, fromChain, toChain)` → calls `@lifi/sdk` `getStatus()`. Returns status (PENDING / DONE / FAILED) + substatus (COMPLETED / PARTIAL / REFUNDED).
- `getChains(chainTypes?)` → calls `@lifi/sdk` `getChains()`.
- `getTokens(chains?)` → calls `@lifi/sdk` `getTokens()`.

### operations.ts — WriteOperation

`createLifiBridgeOperation()`:
- `prepare()`: Call `getQuote()`. Extract `transactionRequest` + route metadata (estimated output, fees, duration, bridge name).
- `createPreview()`: Display source chain/token/amount → destination chain/token/estimated amount, fees, estimated time, bridge used.
- `createPlan()`: Build ExecutionPlan with:
  - `chain` set to the **source chain** (where the tx is submitted)
  - `metadata: { destinationChain, estimatedTime, bridgeName }` for the destination chain and other cross-chain info
  - Steps:
    1. `approval` step (if fromToken is ERC-20 and approval needed — check from quote response)
    2. `transaction` step (the bridge tx from `transactionRequest`)
- `resolveAuth()`: `await getActiveWalletPort("evm")` — resolves the EVM signer from OWS.
- `execute()`: Use resolved signer to send `transactionRequest`. Return tx hash.

Note: `formatResult` is not a WriteOperation method. It is passed via `WriteOperationRuntimeOptions` to `runWriteOperation()`. Shows tx hash + explorer link + suggestion to run `status`.

### Authentication

- `WOOO_LIFI_API_KEY` env var (optional). Passed via `createConfig({ integrator: 'wooo-cli', apiKey: process.env.WOOO_LIFI_API_KEY })`.
- Without API key: works with default rate limits (200 req/min).

## OKX Bridge Protocol

### API

Direct REST API calls to `https://web3.okx.com/api/v5/dex/cross-chain/`. No SDK — `@okx-dex/okx-dex-sdk` v1.0.18 does not support cross-chain operations.

### client.ts

Implements HMAC-SHA256 request signing (headers: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`, `OK-ACCESS-PROJECT`).

Methods:
- `getQuote(params)` → `GET /api/v5/dex/cross-chain/quote` — returns best route with tx calldata (to, data, value).
- `getApproveData(params)` → `GET /api/v5/dex/cross-chain/approve-transaction` — returns approve calldata if needed.
- `getStatus(txHash)` → `GET /api/v5/dex/cross-chain/status` — returns transaction status.
- `getSupportedChains()` → `GET /api/v5/dex/cross-chain/supported/chains`.
- `getSupportedTokens(chainId?)` → `GET /api/v5/dex/cross-chain/supported/tokens`.

### operations.ts — WriteOperation

`createOkxBridgeOperation()`:
- `prepare()`: Call `getQuote()` for route. Call `getApproveData()` if approval needed. Extract tx calldata.
- `createPreview()`: Display source/dest chain/token/amount, fees, bridge name, gas estimates.
- `createPlan()`: Build ExecutionPlan with:
  - `chain` set to the **source chain**
  - `metadata: { destinationChain, bridgeName }` for cross-chain info
  - Steps:
    1. `approval` step (if approve calldata returned)
    2. `transaction` step (bridge tx)
- `resolveAuth()`: `await getActiveWalletPort("evm")` — resolves the EVM signer from OWS.
- `execute()`: Use resolved signer to send transaction. Return tx hash.

Note: `formatResult` is passed via `WriteOperationRuntimeOptions`. Shows tx hash + explorer link + suggestion to run `status`.

### Authentication

Required env vars:
- `WOOO_OKX_API_KEY` (reuse existing)
- `WOOO_OKX_API_SECRET` (reuse existing)
- `WOOO_OKX_PASSPHRASE` (reuse existing)
- `WOOO_OKX_PROJECT_ID` (new — required for DEX API)

HMAC-SHA256 signing: `sign = Base64(HMAC-SHA256(timestamp + method + requestPath + queryString, secretKey))`.

## Registry Changes

In `src/protocols/registry.ts`:
- Import `lifiProtocol` from `./lifi/commands`
- Import `okxBridgeProtocol` from `./okx-bridge/commands`
- Add both to the `protocols` array under a `// Bridge` comment section

No changes to `index.ts` — the group routing automatically places `type: "bridge"` protocols under `wooo bridge`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WOOO_LIFI_API_KEY` | No | LI.FI API key (optional, for higher rate limits) |
| `WOOO_OKX_PROJECT_ID` | Yes (for OKX Bridge) | OKX DEX API project ID |
| `WOOO_OKX_API_KEY` | Yes (for OKX Bridge) | Reuse existing |
| `WOOO_OKX_API_SECRET` | Yes (for OKX Bridge) | Reuse existing |
| `WOOO_OKX_PASSPHRASE` | Yes (for OKX Bridge) | Reuse existing |

## Dependencies

- New: `@lifi/sdk` (^3.16.3)
- OKX Bridge: no new dependencies (fetch + custom HMAC signing)

## Testing

Each protocol gets tests mirroring src structure:
- `tests/protocols/lifi/` — client tests (mocked API responses), operation tests
- `tests/protocols/okx-bridge/` — client tests (mocked API responses), operation tests, HMAC signing tests
- Registry test updated to include both bridge protocols

## Error Handling

- **Missing credentials**: OKX Bridge commands fail early with a clear error if `WOOO_OKX_API_KEY`, `WOOO_OKX_API_SECRET`, `WOOO_OKX_PASSPHRASE`, or `WOOO_OKX_PROJECT_ID` are not set. LI.FI works without API key.
- **Rate limiting**: On 429 responses, surface the error to the user with a message suggesting they set an API key (LI.FI) or retry later.
- **Quote expiry**: Quotes are fetched in `prepare()` and used immediately in `execute()`. If the user takes too long to confirm and execution fails due to stale calldata, the error is surfaced and the user is prompted to retry.
- **Non-EVM chains**: Both protocols validate `--from-chain` and `--to-chain` are EVM chains. Non-EVM chains produce a clear error: "Only EVM chains are supported for bridging in this version."
- **Native token vs ERC-20**: The `approval` step is only added when the source token is an ERC-20 (not native ETH). Native token bridging sends value directly in the transaction without approval.
