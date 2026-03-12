# Architecture

## Overview

wooo-cli is a unified crypto CLI that wraps multiple protocols (CEX, DEX, lending, staking, perps, bridge) behind a consistent command interface. The design prioritizes simplicity — no adapter patterns, no factory abstractions, just direct implementations.

## Directory Structure

```
src/
├── index.ts              # Entry point — command registration, protocol group wiring
├── core/                 # Shared infrastructure
│   ├── config.ts         # Configuration loading (c12)
│   ├── context.ts        # Active wallet / private key resolution
│   ├── evm.ts            # Shared EVM clients (viem) — chain map, public/wallet clients
│   ├── solana.ts         # Shared Solana clients — connection, keypair
│   └── output.ts         # Structured output (table, JSON)
├── commands/             # Cross-protocol commands
│   ├── config/           # wooo config init/set/get/list
│   ├── wallet/           # wooo wallet generate/import/list/balance/switch/export
│   ├── market/           # wooo market price/search (aggregated CEX data)
│   ├── portfolio/        # wooo portfolio overview
│   ├── chain/            # wooo chain tx/balance/ens/call
│   └── swap/             # wooo swap (aggregated DEX routing)
├── protocols/            # Protocol modules (self-contained)
│   ├── types.ts          # ProtocolDefinition, ProtocolType, ProtocolGroup
│   ├── registry.ts       # Protocol registration, listProtocolsByGroup()
│   ├── okx/              # CEX: OKX
│   ├── binance/          # CEX: Binance
│   ├── bybit/            # CEX: Bybit
│   ├── uniswap/          # DEX: Uniswap V3 (EVM, multi-chain)
│   ├── curve/            # DEX: Curve (EVM, multi-chain)
│   ├── jupiter/          # DEX: Jupiter (Solana)
│   ├── aave/             # DeFi: Aave V3 lending (EVM, multi-chain)
│   ├── lido/             # DeFi: Lido staking (Ethereum only)
│   ├── hyperliquid/      # Perps: Hyperliquid
│   ├── gmx/              # Perps: GMX V2 (Arbitrum)
│   └── stargate/         # Bridge: Stargate V2 (LayerZero)
└── tests/
    ├── core/             # EVM chain resolution, address derivation
    ├── commands/          # Swap route selection logic
    └── protocols/         # Token resolution, amount precision, pool matching, error paths
```

## Protocol Module Pattern

Every protocol follows the same structure:

```
protocols/<name>/
├── constants.ts    # Addresses, ABIs, token registries (per-chain where applicable)
├── client.ts       # Business logic class (quote, swap, supply, etc.)
├── commands.ts     # CLI command definitions + ProtocolDefinition export
└── types.ts        # TypeScript interfaces
```

### constants.ts

Per-chain data maps. Example from Uniswap:

```typescript
export const SWAP_ROUTER: Record<string, Address> = {
  ethereum: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  base: "0x2626664c2603336E57B271c5C0b26F421741e481",
  // ...
};
```

### client.ts

Direct implementation — no interfaces, no adapters:

```typescript
export class UniswapClient {
  constructor(private chain: string, private privateKey?: string) {}
  async quote(tokenIn, tokenOut, amount) { /* viem contract call */ }
  async swap(tokenIn, tokenOut, amount) { /* viem contract call */ }
}
```

### commands.ts

Exports a `ProtocolDefinition` that auto-registers into the CLI:

```typescript
export const uniswapProtocol: ProtocolDefinition = {
  name: "uniswap",
  displayName: "Uniswap V3",
  type: "dex",           // maps to "dex" group → `wooo dex uniswap ...`
  chains: ["ethereum", "arbitrum", "optimism", "polygon", "base"],
  setup: () => defineCommand({ subCommands: { swap, quote, tokens } }),
};
```

## Protocol Registry & Grouping

Protocols declare a `type` (dex, lending, staking, perps, bridge, cex) which maps to a CLI group:

| Protocol Type | CLI Group | Example Command |
|--------------|-----------|-----------------|
| dex | `dex` | `wooo dex uniswap swap ...` |
| lending | `defi` | `wooo defi aave supply ...` |
| staking | `defi` | `wooo defi lido stake ...` |
| perps | `perps` | `wooo perps gmx long ...` |
| bridge | `bridge` | `wooo bridge stargate bridge ...` |
| cex | `cex` | `wooo cex binance buy ...` |

The mapping is defined in `src/protocols/types.ts` and wired in `src/index.ts`. Adding a new protocol requires zero changes to index.ts — just add it to the registry.

## Multi-Chain Support

### EVM Chains

`src/core/evm.ts` provides shared chain infrastructure:

- `CHAIN_MAP` — Maps chain names to viem Chain objects (ethereum, arbitrum, optimism, polygon, base)
- `getPublicClient(chain)` — Read-only RPC client
- `getWalletClient(key, chain)` — Signing client
- `getAccountAddress(key)` — Derive address from private key

Each protocol stores per-chain contract addresses and filters by the `--chain` flag:

```typescript
// Curve pools are per-chain
const CURVE_POOLS: Record<string, Record<string, CurvePoolConfig>> = {
  ethereum: { "3pool": { ... }, steth: { ... } },
  arbitrum: { "2pool": { ... }, tricrypto: { ... } },
};

// Client filters by this.chain
private resolvePool(tokenIn, tokenOut) {
  const chainPools = CURVE_POOLS[this.chain];
  // ...
}
```

### Solana

`src/core/solana.ts` provides Solana-specific infrastructure. Jupiter is the only Solana protocol currently — it uses the Jupiter REST API (`quote-api.jup.ag/v6`) for quotes and transaction building.

## Aggregated Swap

`wooo swap` compares quotes from multiple DEXes and picks the best:

- **Solana** → Jupiter (sole provider)
- **EVM** → Queries Uniswap and Curve in parallel via `Promise.allSettled`, picks highest `amountOut`, shows comparison table

## Output System

All commands support `--json` and `--format table` flags. The output module (`src/core/output.ts`) provides:

- `out.data(obj)` — Structured data (JSON or formatted)
- `out.table(rows, opts)` — Tabular display
- `out.success(msg)` / `out.error(msg)` — Status messages

## Adding a New Protocol

1. Create `src/protocols/<name>/` with constants, client, commands, types
2. Export a `ProtocolDefinition` from commands.ts
3. Import and add to the `protocols` array in `src/protocols/registry.ts`
4. Done — the CLI group command is auto-generated

No need to modify `src/index.ts` or any other file.
