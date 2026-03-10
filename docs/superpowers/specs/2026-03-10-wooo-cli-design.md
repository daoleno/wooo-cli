# wooo-cli: Crypto All-in-One CLI

**Date**: 2026-03-10
**Status**: Approved

## Overview

wooo-cli is a **Unified Execution Layer** for crypto operations — an all-in-one CLI where every exchange and DeFi protocol is a first-class command group. It serves both AI agents and human power users equally, with dual-mode output (structured JSON for agents, beautiful terminal output for humans).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Core positioning | Unified Execution Layer | Agent + human parity |
| Scope | Everything Crypto | Trading + DeFi + on-chain + dev tools |
| Chain strategy | Multi-Chain Architecture | Universal interface, initial EVM + Hyperliquid |
| Relationship to wooo | Independent project | Can borrow ideas, no code coupling |
| CLI framework | Citty (unjs) | Modern, lightweight, cross-runtime |
| Output mode | Hybrid | TTY auto-detect + --json/--format override |

## Architecture: Core + Adapter

Single package with internal modularization. Each protocol lives in its own directory under `protocols/`. Clean boundaries allow future extraction into plugins if needed.

```
wooo-cli/
├── src/
│   ├── index.ts                    # Entry: Citty main command
│   ├── core/
│   │   ├── config.ts               # c12-based config management
│   │   ├── keystore.ts             # Wallet key encryption (AES-256-GCM)
│   │   ├── output.ts               # Dual-mode output engine
│   │   ├── logger.ts               # Logging (verbose/quiet)
│   │   └── error.ts                # Unified error handling + exit codes
│   ├── chains/
│   │   ├── types.ts                # ChainProvider universal interface
│   │   ├── evm.ts                  # EVM implementation (viem)
│   │   ├── solana.ts               # Solana (reserved)
│   │   └── registry.ts            # Chain registry
│   ├── protocols/                  # Each protocol = one directory
│   │   ├── types.ts                # Protocol universal interface
│   │   ├── registry.ts            # Protocol auto-registration
│   │   ├── okx/
│   │   │   ├── commands.ts         # wooo okx <action>
│   │   │   ├── client.ts           # OKX API wrapper
│   │   │   └── types.ts
│   │   ├── binance/
│   │   │   ├── commands.ts
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   ├── hyperliquid/
│   │   │   ├── commands.ts
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   ├── uniswap/
│   │   │   ├── commands.ts
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   ├── aave/
│   │   │   ├── commands.ts
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   ├── lido/
│   │   ├── curve/
│   │   ├── gmx/
│   │   ├── jupiter/
│   │   ├── pendle/
│   │   ├── eigenlayer/
│   │   ├── stargate/
│   │   └── across/
│   ├── commands/                   # Universal commands (not protocol-bound)
│   │   ├── wallet/
│   │   ├── market/
│   │   ├── portfolio/
│   │   ├── chain/
│   │   └── config/
│   └── utils/
│       ├── prompt.ts               # Interactive prompts (TTY only)
│       ├── table.ts                # Table rendering
│       └── spinner.ts              # Loading animations
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

## Command Design: Protocol = Command Group

Every exchange and DeFi protocol is its own top-level command group. The pattern is `wooo <protocol> <action> [args] [flags]`.

### Global Flags

- `--json` — Force JSON output
- `--format=table|csv|json` — Fine-grained output control
- `--chain <name>` — Specify chain (default from config; protocols can declare their own default)
- `--wallet <name>` — Specify wallet (default: active wallet)
- `--yes` — Skip confirmations (agent-friendly)
- `--dry-run` — Preview without executing
- `--verbose` — Show debug logs (logs go to stderr, stdout stays clean for piping)
- `--quiet` — Suppress all non-essential output

### Exchange Commands (CEX)

```bash
# OKX
wooo okx spot buy BTC/USDT 0.1
wooo okx futures long BTC 1000 --leverage 5
wooo okx balance
wooo okx positions
wooo okx orders
wooo okx withdraw USDT 100 --to <address>

# Binance
wooo binance spot buy ETH/USDT 1
wooo binance futures short ETH 500
wooo binance balance
wooo binance earn stake BNB 10

# Hyperliquid
wooo hyperliquid long BTC 1000
wooo hyperliquid short ETH 500
wooo hyperliquid positions
wooo hyperliquid funding

# Bybit, Bitget, etc.
wooo bybit long BTC 1000
wooo bitget spot buy SOL/USDT 10
```

### DeFi Protocol Commands

```bash
# Uniswap (DEX)
wooo uniswap swap ETH USDC 1.5
wooo uniswap pool ETH/USDC
wooo uniswap add-liquidity ETH/USDC 1000
wooo uniswap positions

# Aave (Lending)
wooo aave supply USDC 10000
wooo aave borrow ETH 2
wooo aave positions
wooo aave rates

# Curve (DEX)
wooo curve swap USDT USDC 10000
wooo curve pools

# Lido (Staking)
wooo lido stake ETH 10
wooo lido withdraw stETH 5
wooo lido rewards

# EigenLayer (Restaking)
wooo eigenlayer restake stETH 10

# Pendle (Yield Trading)
wooo pendle swap PT-stETH 100

# GMX (Perps DEX)
wooo gmx long ETH 1000 --leverage 5

# Jupiter (Solana DEX)
wooo jupiter swap SOL USDC 10
```

### Bridge Commands

```bash
wooo stargate bridge USDC 1000 ethereum arbitrum
wooo across bridge ETH 1 ethereum base
```

### Universal Commands (Not Protocol-Bound)

```bash
# Wallet management
wooo wallet generate [--chain evm|solana]
wooo wallet import <private-key>
wooo wallet list
wooo wallet balance [address]
wooo wallet export <name>
wooo wallet switch <name>

# Aggregated market data
wooo market price BTC
wooo market search <keyword>

# Cross-protocol portfolio
wooo portfolio overview
wooo portfolio exposure
wooo portfolio history [--days 30]

# On-chain operations
wooo chain tx <hash>
wooo chain call <contract> <method> [args]
wooo chain send <contract> <method> [args]
wooo chain decode <data>
wooo chain ens <name|address>
wooo chain balance <address> [--token <addr>]

# Configuration
wooo config init
wooo config set <key> <value>
wooo config get <key>
wooo config list
```

## Protocol Interface

Every protocol implements a common interface but exposes its own unique capabilities:

```typescript
// protocols/types.ts
interface ProtocolDefinition {
  name: string                    // "okx", "uniswap"
  displayName: string             // "OKX Exchange"
  type: 'cex' | 'dex' | 'lending' | 'staking' | 'bridge' | 'perps'
  chains?: string[]               // ["ethereum", "arbitrum"]
  requiresAuth: boolean           // CEX needs API keys
  setup: () => CittyCommand       // Returns sub-command group
}

// protocols/registry.ts — auto-registration
export const protocols: ProtocolDefinition[] = [
  okx, binance, hyperliquid,     // CEX
  uniswap, curve, jupiter,       // DEX
  aave, compound,                 // Lending
  lido, eigenlayer,               // Staking
  stargate, across,               // Bridge
  gmx, pendle,                    // Others
]
```

### CEX Client Strategy

CEX protocols use CCXT for API abstraction where possible. Hyperliquid uses its native SDK (proven in wooo). Each protocol's `client.ts` wraps the underlying library and normalizes to protocol-local types.

### Chain Handling

Each protocol declares its supported chains. The `--chain` flag overrides the global default. If a protocol does not support the specified chain, the CLI exits with code 2 and a clear error message listing supported chains.

### Portfolio Aggregation

Protocols may implement an optional `getHoldings()` method for cross-protocol portfolio aggregation. `wooo portfolio overview` queries all configured protocols that implement this method.

### ABI Resolution for Chain Commands

`wooo chain call/send` resolves ABIs automatically from block explorer APIs (Etherscan, Basescan, etc.) for verified contracts. Use `--abi <path>` for unverified contracts. ABI cache stored in `~/.config/wooo/abi-cache/`.

### Adding a New Protocol

1. Create directory under `protocols/<name>/`
2. Implement `client.ts` (API/contract interaction)
3. Implement `commands.ts` (register CLI commands)
4. Optionally implement `getHoldings()` for portfolio aggregation
5. Add to `protocols/registry.ts`
6. Done — `wooo <protocol-name> <action>` is available

## Dual-Mode Output Engine

Auto-detects TTY environment. Humans see formatted tables with colors; agents/scripts receive structured JSON.

```typescript
import { output } from '@/core/output'

// Auto-detect: TTY → human format, pipe → JSON
output.table(positions, {
  columns: ['symbol', 'side', 'size', 'pnl'],
  title: 'Open Positions'
})

// Agent: wooo hyperliquid positions --json
// → [{"symbol":"BTC","side":"LONG","size":0.5,"pnl":120.5}]

// Human:
// ┌─────────┬──────┬──────┬────────┐
// │ Symbol  │ Side │ Size │  PnL   │
// ├─────────┼──────┼──────┼────────┤
// │ BTC     │ LONG │ 0.5  │ +$120  │
// └─────────┴──────┴──────┴────────┘
```

### Exit Code Convention (Agent-Friendly)

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Argument error |
| 3 | Authentication failure |
| 4 | Network error |
| 5 | Insufficient balance / trade rejected |
| 6 | User cancelled (--yes bypasses) |

## Configuration

Powered by **c12** (unjs). Users can choose any format they prefer:

```typescript
// wooo.config.ts (or .json, .toml, .yaml, .wooorc)
export default {
  default: {
    chain: 'ethereum',
    wallet: 'main',
    format: 'table',
  },
  okx: {
    apiKey: '...',
    apiSecret: 'encrypted:...',
    passphrase: 'encrypted:...',
  },
  binance: {
    apiKey: '...',
    apiSecret: 'encrypted:...',
  },
  chains: {
    ethereum: { rpc: 'https://eth.llamarpc.com' },
    arbitrum: { rpc: 'https://arb1.arbitrum.io/rpc' },
    base: { rpc: 'https://mainnet.base.org' },
  },
}
```

- `wooo config init` — Interactive setup (TTY mode)
- API secrets and private keys encrypted with AES-256-GCM
- Environment variable override: `WOOO_OKX_API_KEY` > config file

## Security Model

- **Private keys**: AES-256-GCM encrypted at rest, master password unlock
- **API keys**: Same encrypted storage
- **Confirmation**: All fund-moving operations require confirmation; `--yes` skips (agent mode)
- **Dry-run**: `--dry-run` previews any operation without execution
- **Exit codes**: Deterministic codes for agent error handling

### Wallet Import Security

`wooo wallet import` reads from stdin when no argument is given, and supports `--file <path>` for file-based import. If a key is passed as a CLI argument, a warning is displayed about shell history exposure. Interactive prompt is used in TTY mode.

```bash
# Preferred: interactive prompt (TTY)
wooo wallet import
# Enter private key: ****

# From file
wooo wallet import --file ./key.txt

# From pipe (agent-friendly)
echo $KEY | wooo wallet import --yes

# Direct argument (warns about shell history)
wooo wallet import 0xabc...
```

### Encryption Lifecycle

1. On `wooo config init`, user sets a master password (min 32 chars)
2. Master key is derived via scrypt (CPU + memory hard) from password + random salt
3. Secrets (private keys, API secrets) are encrypted with AES-256-GCM before storage
4. At runtime, master password is obtained from: `WOOO_MASTER_PASSWORD` env var > interactive prompt
5. `wooo config encrypt` / `wooo config decrypt` commands allow manual encryption management

### CEX Authentication Setup

```bash
# Interactive setup (recommended)
wooo okx auth
# → Prompts for API key, secret, passphrase
# → Encrypts and stores in config

# Direct setup
wooo config set okx.api-key <key>
wooo config set okx.api-secret <secret>  # auto-encrypted

# Verify
wooo okx balance  # tests auth and shows balance
```

### Confirmation UX

Before any fund-moving operation, display a summary and prompt:

```
┌─ Trade Preview ──────────────────────┐
│ Action:  BUY 0.5 BTC @ Market       │
│ Value:   ~$32,500                    │
│ Fee:     ~$6.50                      │
│ Venue:   Hyperliquid                 │
└──────────────────────────────────────┘
Proceed? (y/N)
```

In `--json` mode without `--yes`, exit with code 6 (user cancelled).

## Technology Stack

| Component | Library | Last Published | Weekly Downloads |
|-----------|---------|----------------|-----------------|
| Runtime | Node.js (primary), Bun compatible (no Bun-specific APIs) | — | — |
| Language | TypeScript (strict) | — | — |
| CLI Framework | **Citty** (unjs) | Active | — |
| Config | **c12** (unjs) | Active | — |
| Exchanges | **CCXT** | Active | — |
| EVM | **Viem** | Active | — |
| Encryption | Node.js crypto (built-in) | — | — |
| Validation | **Zod** | Active | — |
| Table | **console-table-printer** | Recent | 3.3M |
| Colors | **ansis** | Oct 2025 | 15.9M |
| Prompts | **@clack/prompts** | Mar 2026 | 7.1M |
| Build | **tsdown** | Feb 2026 | 1.4M |
| Code Quality | **Biome** | Active | — |

All dependencies actively maintained (updated within 6 months).

## Error Handling

### JSON Error Schema

In `--json` mode, errors are returned as structured JSON to stderr:

```json
{"error": "Insufficient balance", "code": 5, "details": {"required": 1000, "available": 500}}
```

### Retry Policy

- **Retryable**: Network timeouts (code 4), rate limits (429 responses) — up to 3 retries with exponential backoff
- **Non-retryable**: Auth failures (code 3), insufficient balance (code 5), argument errors (code 2)
- Rate limit handling: respect exchange-specific headers (`X-RateLimit-*`)

### Timeout & Cancellation

- Default timeout: 30s for API calls, 120s for on-chain transactions
- Override with `--timeout <seconds>`
- SIGINT (Ctrl+C): graceful shutdown, cancel pending operations, report partial results

## Configuration Location

- **Default config directory**: `~/.config/wooo/`
- **Config file**: `~/.config/wooo/wooo.config.ts` (or .json, .toml, .yaml)
- **Keystore**: `~/.config/wooo/keystore/` (encrypted keys)
- **Override**: `WOOO_CONFIG_DIR` env var or `--config <path>` flag
- c12 also checks current directory for `wooo.config.*` (project-local overrides)

## Distribution

- **Primary**: npm (`npm install -g wooo-cli` or `bunx wooo-cli`)
- **Binary**: Optional standalone via `tsdown` bundling (no Node.js required)
- **Schema stability**: `--json` output schemas follow semver. Breaking changes to JSON output = major version bump.

## Testing Strategy

- **Unit tests**: Mocked clients per protocol. Each `client.ts` is testable in isolation.
- **Integration tests**: Testnets where available (Hyperliquid testnet, Sepolia for EVM).
- **CI**: Bun test runner. Unit tests on every PR, integration tests on merge to main.
- **Protocol tests**: Each protocol directory can include `__tests__/` with protocol-specific mocks.

## Agent Integration

Claude Code skills can call wooo-cli commands directly:

```typescript
// In a Claude Code skill
const result = await $`wooo hyperliquid long BTC 1000 --leverage 3 --json --yes`
const parsed = JSON.parse(result.stdout)
// { orderId: "xxx", symbol: "BTC", side: "LONG", size: 1000, ... }

// Query positions
const positions = await $`wooo hyperliquid positions --json`
// [{ symbol: "BTC", side: "LONG", size: 0.5, pnl: 120.5, ... }]

// Cross-protocol portfolio
const portfolio = await $`wooo portfolio overview --json`
// { totalValue: 50000, protocols: { hyperliquid: {...}, aave: {...} } }
```

## v1 Implementation Roadmap

### Wave 1 — Foundation (Get it running)

- Core: config (c12), output engine, keystore, Citty framework
- Universal: wallet, config, chain (tx/ens)
- Protocols: hyperliquid (existing experience), uniswap (DeFi benchmark)

### Wave 2 — CEX Coverage

- Protocols: okx, binance, bybit (fast onboarding via CCXT)
- Universal: market (aggregated pricing), portfolio (cross-protocol)

### Wave 3 — DeFi Expansion

- Protocols: aave, lido, curve, gmx, stargate
- Chains: Solana support (jupiter)
- Universal: aggregated swap (auto-select best route)
