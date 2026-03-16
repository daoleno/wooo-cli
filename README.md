# wooo

**All of crypto, one command away — your terminal-native copilot for trading, DeFi, and on-chain execution.**

Swap on Uniswap, lend on Aave, trade perps on Hyperliquid, or route through the best supported DEX — without ever leaving your terminal. wooo brings CEX trading, DeFi, and on-chain execution across EVM and Solana into a single CLI with consistent flags, structured output, and built-in wallet management.

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
wooo lend aave rates USDC --chain ethereum
```

## What Can It Do?

| Category | Protocols | What You Get |
|----------|-----------|-------------|
| **CEX Trading** | OKX, Binance, Bybit | Spot buy/sell, futures long/short, balance, positions |
| **DEX Swaps** | Uniswap V3, Curve, Jupiter | Swap, quote, token lists — EVM + Solana |
| **Lending** | Aave V3 | Supply, borrow, view rates & positions |
| **Staking** | Lido | Stake ETH, view stETH balance & rewards |
| **Perps** | Hyperliquid | Long/short with leverage, funding rates |
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

### Lending and Staking

```bash
# Aave V3 — lending & borrowing
wooo lend aave rates USDC --chain ethereum
wooo lend aave supply USDC 1000 --chain ethereum --yes
wooo lend aave borrow ETH 0.5 --chain ethereum --yes
wooo lend aave positions --chain ethereum

# Lido — liquid staking
wooo stake lido stake 5 --yes
wooo stake lido balance
wooo stake lido rewards
```

### Perpetual Futures

```bash
wooo perps hyperliquid long BTC 1000 --leverage 5 --yes
wooo perps hyperliquid positions
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
├── lend
│   └── aave     — supply, borrow, positions, rates
├── stake
│   └── lido     — stake, balance, rewards
├── perps
│   └── hyperliquid — long, short, positions, funding
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

### On-Chain Protocols

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
real EVM write paths for `chain`, `dex uniswap`, and `lend aave` without using real funds.

## Architecture

wooo is built around a protocol registry plus a shared write-command contract.
Each protocol exports a manifest from `commands.ts`, keeps protocol I/O in `client.ts`,
and can expose reusable write flows in `operations.ts` when the same behavior is shared
across direct protocol commands and aggregated commands such as `wooo swap`.

Protocols are grouped into mutually exclusive CLI buckets (`dex`, `lend`, `stake`, `perps`, `cex`) and auto-registered into the command tree.
Every write command returns an `ExecutionPlan` on `--dry-run --json`.

See [docs/architecture.md](docs/architecture.md) for details.

## License

[MIT](LICENSE)
