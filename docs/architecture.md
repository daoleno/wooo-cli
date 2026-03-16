# Architecture

## Overview

wooo-cli is a protocol registry plus a small set of execution contracts.
The goal is not to force every protocol into the same file tree. The goal is
to make every command predictable for humans and AI:

- Read commands follow `parse -> fetch -> output`
- Write commands follow `parse -> prepare -> confirm -> dry-run(plan) -> execute -> output`
- `--dry-run --json` for every write command returns an `ExecutionPlan`
- Real execution is routed through a thin backend gateway appropriate for the target:
  EVM, Solana, or exchange API

That contract is the architecture. File layout is secondary.

## Directory Structure

```
src/
├── index.ts              # Entry point — command registration, protocol group wiring
├── core/                 # Shared infrastructure
│   ├── config.ts         # Configuration loading (c12)
│   ├── context.ts        # Active wallet / secret resolution
│   ├── evm.ts            # Shared EVM clients (viem)
│   ├── execution-plan.ts # Machine-readable dry-run contract
│   ├── exchange-gateway.ts # Thin execution wrapper for exchange APIs
│   ├── output.ts         # Structured output (table, JSON)
│   ├── solana-gateway.ts # Thin execution wrapper for Solana transactions
│   ├── solana.ts         # Shared Solana connection and keypair helpers
│   ├── tx-gateway.ts     # Thin execution wrapper for EVM contract writes
│   └── write-operation.ts # Shared write-command runner
├── commands/             # Cross-protocol commands
│   ├── chain/            # wooo chain tx/balance/ens/call
│   ├── config/           # wooo config init/set/get/list
│   ├── market/           # wooo market price/search
│   ├── portfolio/        # wooo portfolio overview
│   ├── swap/             # wooo swap (aggregated route selection)
│   └── wallet/           # wooo wallet generate/import/list/balance/switch/export
├── protocols/            # Protocol modules
│   ├── types.ts          # ProtocolManifest, ProtocolType, ProtocolGroup
│   ├── registry.ts       # Protocol registration, listProtocolsByGroup()
│   ├── aave/
│   ├── binance/
│   ├── bybit/
│   ├── cex-base/
│   ├── curve/
│   ├── hyperliquid/
│   ├── jupiter/
│   ├── lido/
│   ├── okx/
│   └── uniswap/
└── tests/
```

## Core Invariants

### 1. Protocol Registration Is Manifest-Based

Each protocol exports a manifest from `commands.ts` and the registry wires it into
the CLI group tree.

```typescript
export interface ProtocolManifest {
  name: string;
  displayName: string;
  type: ProtocolType;
  chains?: string[];
  writeAccountType?: "evm" | "solana" | "exchange-api";
  setup: () => CommandDef;
}
```

`type` controls grouping (`cex`, `dex`, `lend`, `stake`, `perps`, `bridge`).
`lending` protocols map to the `lend` CLI group and `staking` protocols map to `stake`,
so the top-level command tree stays mutually exclusive.
`writeAccountType` documents how authenticated write flows execute.

### 2. Write Commands Share One Runtime Contract

All write commands run through `src/core/write-operation.ts`.

A protocol-specific operation provides:

- `prepare()` — fetch quotes / previews / derived amounts
- `createPreview()` — user-facing confirmation payload
- `createPlan()` — `ExecutionPlan` for `--dry-run --json`
- `resolveAuth()` — how to get signing or API credentials
- `execute()` — real execution

The command layer stays thin: validate args, create an operation, hand it to the runner.

### 3. Dry-Run Output Is a First-Class API

`src/core/execution-plan.ts` defines the stable dry-run schema.

Every write command returns:

- `kind: "execution-plan"`
- `operation.group`
- `operation.protocol`
- `operation.command`
- `accountType`
- ordered `steps`
- `warnings`
- optional structured `metadata`

This is the contract AI should consume, not help text.

### 4. Execution Backends Are Thin and Concrete

No generic workflow engine is used. Execution stays concrete:

- `TxGateway` for EVM contract simulation, allowance handling, submission, and receipt waiting
- `SolanaGateway` for signing and confirming serialized versioned transactions
- `ExchangeGateway` for authenticated exchange order submission

Protocol clients keep business logic. Gateways handle the mechanical submission layer.

## Protocol Module Shape

Protocols are allowed to be multi-file. The required public surface is by intent, not file name.

Common files:

- `commands.ts` — protocol manifest plus CLI command tree
- `operations.ts` — reusable write-operation builders
- `client.ts` — protocol reads/writes against RPC, REST, SDK, or CCXT
- `constants.ts` — addresses, token registries, static config when needed
- `types.ts` — protocol result types

Examples:

- Uniswap / Curve / Jupiter expose swap operations that are used both by direct protocol commands and by aggregated `wooo swap`
- `cex-base/` centralizes reusable CEX order operations for OKX, Binance, and Bybit
- Hyperliquid is split into multiple command files because long/short/funding/positions are distinct user surfaces

Internal layout is flexible as long as the public surface remains stable.

## Aggregated Swap

`wooo swap` does not implement bespoke execution logic anymore.
It consumes protocol-level swap operations:

- Solana: Jupiter operation
- EVM: Uniswap and Curve operations

That means quote preparation, previews, dry-run plans, and execution behavior are inherited
from the selected protocol instead of being duplicated in the aggregator.

The aggregator only does three things:

1. prepare candidate routes
2. select the best quote
3. annotate the selected protocol plan/result with route comparison metadata

## Multi-Chain Support

### EVM

`src/core/evm.ts` provides:

- `CHAIN_MAP`
- `getPublicClient(chain)`
- `getWalletClient(key, chain)`
- `getAccountAddress(key)`

EVM write protocols use `TxGateway` on top of those helpers.

### Solana

`src/core/solana.ts` provides:

- `getSolanaConnection()`
- `getSolanaKeypair(privateKey)`
- `getSolanaAddress(privateKey)`

Solana write protocols use `SolanaGateway` for transaction submission.

### Exchange APIs

CCXT-backed exchange protocols resolve API credentials from env/config and submit
orders through `ExchangeGateway`.

## Adding a New Protocol

1. Implement the protocol client and any static config it needs.
2. Add protocol-specific `operations.ts` builders for each write flow.
3. Export a `ProtocolManifest` from `commands.ts`.
4. Register the manifest in `src/protocols/registry.ts`.
5. Add contract tests:
   the manifest should declare `writeAccountType`, and each write command should return an `ExecutionPlan` on `--dry-run --json`.

No changes to `src/index.ts` are required unless you are adding a brand-new top-level non-protocol command.
