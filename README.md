# wooo

**All of crypto, one command away — your terminal-native copilot for trading, DeFi, and cross-chain operations.**

Swap on Uniswap, lend on Aave, bridge via Stargate, trade perps on Hyperliquid — without ever leaving your terminal. wooo unifies 11 protocols across EVM and Solana into a single CLI with consistent flags, structured output, and built-in wallet management.

## Quick Start

```bash
# Install
bun install -g wooo-cli

# Set up
wooo config init
wooo wallet generate my-wallet

# Start using
wooo market price BTC
wooo swap USDC ETH 100 --chain arbitrum --dry-run
wooo defi aave rates USDC --chain ethereum
```

## What Can It Do?

| Category | Protocols | What You Get |
|----------|-----------|-------------|
| **CEX Trading** | OKX, Binance, Bybit | Spot buy/sell, futures long/short, balance, positions |
| **DEX Swaps** | Uniswap V3, Curve, Jupiter | Swap, quote, token lists — EVM + Solana |
| **DeFi** | Aave V3, Lido | Supply, borrow, stake, view rates & rewards |
| **Perps** | Hyperliquid, GMX V2 | Long/short with leverage, funding rates |
| **Bridge** | Stargate V2 | Cross-chain token transfers via LayerZero |
| **Aggregated Swap** | Auto-routed | Compares DEXes, picks best quote |

**Chains:** Ethereum, Arbitrum, Optimism, Polygon, Base, Solana

## Usage Examples

### Wallet Management

```bash
wooo wallet generate trading-wallet
wooo wallet import 0xprivatekey... --name imported
wooo wallet list
wooo wallet switch trading-wallet
wooo wallet balance
```

### Market Data

```bash
wooo market price BTC          # Aggregated price across exchanges
wooo market price ETH/USDT     # Specific pair
wooo market search DOGE         # Search markets
```

### Swapping Tokens

```bash
# Aggregated swap — auto-picks best DEX
wooo swap ETH USDC 1 --chain ethereum --dry-run
wooo swap SOL USDC 10 --chain solana --yes

# Direct protocol access
wooo dex uniswap swap ETH USDC 1 --chain arbitrum --yes
wooo dex curve swap USDT USDC 1000 --dry-run
wooo dex jupiter swap SOL USDC 10 --yes
```

### DeFi Operations

```bash
# Aave V3 — lending & borrowing
wooo defi aave rates USDC --chain ethereum
wooo defi aave supply USDC 1000 --chain ethereum --yes
wooo defi aave borrow ETH 0.5 --chain ethereum --yes
wooo defi aave positions --chain ethereum

# Lido — liquid staking
wooo defi lido stake 5 --yes
wooo defi lido balance
wooo defi lido rewards
```

### Perpetual Futures

```bash
# Hyperliquid
wooo perps hyperliquid long BTC 1000 --leverage 5 --yes
wooo perps hyperliquid positions

# GMX V2
wooo perps gmx long ETH/USD 500 --leverage 3 --dry-run
wooo perps gmx markets
```

### Cross-Chain Bridge

```bash
wooo bridge stargate bridge USDC 1000 ethereum arbitrum --yes
wooo bridge stargate quote USDC 1000 ethereum arbitrum
wooo bridge stargate routes
```

### On-Chain Utilities

```bash
wooo chain tx 0xabc123...                          # View transaction
wooo chain balance 0xabc... --chain ethereum        # Native balance
wooo chain balance 0xabc... --token 0xerc20...      # Token balance
wooo chain ens vitalik.eth                          # ENS lookup
wooo chain call 0x... "totalSupply()(uint256)"      # Read contract
```

## Command Structure

```
wooo
├── config       — init, set, get, list
├── wallet       — generate, import, list, balance, switch, export
├── market       — price, search
├── portfolio    — overview
├── chain        — tx, balance, ens, call
├── swap         — aggregated DEX swap (auto-routes)
├── cex
│   ├── okx      — buy, sell, long, short, balance, positions
│   ├── binance  — buy, sell, long, short, balance, positions
│   └── bybit    — buy, sell, long, short, balance, positions
├── dex
│   ├── uniswap  — swap, quote, tokens
│   ├── curve    — swap, quote, pools
│   └── jupiter  — swap, quote, tokens
├── defi
│   ├── aave     — supply, borrow, positions, rates
│   └── lido     — stake, balance, rewards
├── perps
│   ├── hyperliquid — long, short, positions, funding
│   └── gmx      — long, short, positions, markets
└── bridge
    └── stargate  — bridge, quote, routes
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--format table\|json` | Choose output format |
| `--yes` | Skip confirmation prompts |
| `--dry-run` | Preview without executing |
| `--chain <name>` | Target chain (where applicable) |

## Configuration

### CEX API Keys

Set via environment variables or `wooo config set`:

```bash
# OKX
export WOOO_OKX_API_KEY=...
export WOOO_OKX_API_SECRET=...
export WOOO_OKX_PASSPHRASE=...

# Binance
export WOOO_BINANCE_API_KEY=...
export WOOO_BINANCE_API_SECRET=...

# Bybit
export WOOO_BYBIT_API_KEY=...
export WOOO_BYBIT_API_SECRET=...
```

### DeFi / DEX

On-chain operations use your local wallet. Generate or import one:

```bash
wooo wallet generate my-wallet
wooo wallet import 0xprivatekey... --name imported
```

## Development

```bash
# Install dependencies
bun install

# Run in dev mode
bun run dev

# Build
bun run build

# Test
bun test

# EVM fork e2e via anvil
bun run test:e2e:anvil

# Optional: pin a custom upstream RPC / block number
ANVIL_FORK_URL_ETHEREUM=https://ethereum.publicnode.com \
ANVIL_FORK_BLOCK_NUMBER=24652791 \
bun run test:e2e:anvil

# Type check
bun run type-check

# Lint & format
bun run lint:fix
```

The anvil e2e flow uses a local Ethereum fork and an ephemeral wallet, so it exercises
real EVM write paths for `chain`, `dex uniswap`, and `defi aave` without using real funds.

## Architecture

wooo is built around a protocol registry. Each protocol (Uniswap, Aave, etc.) is a self-contained module with:

- `constants.ts` — Contract addresses, ABIs, token registries (per-chain)
- `client.ts` — Business logic (quote, swap, supply, bridge, etc.)
- `commands.ts` — CLI command definitions
- `types.ts` — TypeScript type definitions

Protocols are grouped by type (`dex`, `defi`, `perps`, `bridge`, `cex`) and auto-registered into the CLI command tree.

See [docs/architecture.md](docs/architecture.md) for details.

## License

[MIT](LICENSE)
