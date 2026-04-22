---
name: wooo-cli
description: >
  Guide for using wooo-cli, the all-in-one crypto terminal CLI for trading,
  DeFi, and on-chain execution. Use this skill whenever the user wants to:
  trade or buy/sell crypto on exchanges (OKX, Binance, Bybit spot or futures),
  swap tokens on DEXes (Uniswap, Curve, Jupiter), lend/borrow/supply on DeFi
  (Aave, Morpho), stake ETH (Lido), open leveraged long/short positions
  (Hyperliquid perps), check prediction markets (Polymarket), bridge tokens
  cross-chain (LI.FI, OKX Bridge), check token prices or market rankings,
  view on-chain token volume/candles/holders/trades, query wallet balances or
  portfolio PnL across chains, resolve ENS names, inspect transactions, read
  smart contracts, manage wallets (create/import/switch/connect hardware),
  or configure exchange API keys. Trigger on any crypto CLI operation — even
  when the user doesn't say "wooo" explicitly. If they mention buying BTC,
  swapping tokens, checking DeFi positions, staking rewards, funding rates,
  bridging USDC, token rankings, or portfolio overview from the terminal,
  this skill applies. Do NOT trigger for: writing smart contracts or dApps,
  using ethers.js/web3.js/viem in code, deploying contracts with Hardhat/Foundry,
  building trading bots in Python, or general blockchain education questions.
---

# wooo-cli Usage Guide

wooo-cli is a terminal-native crypto CLI that unifies CEX trading, DEX swaps, DeFi lending, staking, perps, prediction markets, cross-chain bridges, and on-chain utilities into a single tool with consistent flags, structured output, and built-in wallet management.

The CLI binary is **`wooo-cli`** (not `wooo`). Always use the full name.

## Core Philosophy

wooo-cli treats real money the same way a gun treats bullets — every command that moves funds has a safety mechanism. Your job is to keep that safety on until the user is ready to fire.

**The Safety Checklist** (follow for every write operation):

1. **Verify prerequisites** — Is the wallet set up? Are API keys configured? Is there enough balance?
2. **Dry-run first** — Always run with `--dry-run` before executing. This shows the full execution plan without spending anything.
3. **Confirm chain and amounts** — Read back what will happen: "This will swap 1 ETH for ~3,200 USDC on Arbitrum. Gas estimated at ~$0.03."
4. **Let the user confirm** — Never add `--yes` unless the user explicitly asks for unattended execution.
5. **Execute** — Only after the user reviews and approves.

Read-only commands (price, balance, positions, markets) are always safe and don't need this ceremony.

---

## Command Structure

```
wooo-cli [global-flags] <group> <protocol> <action> [args]
```

**Universal commands** are top-level: `config`, `wallet`, `market`, `portfolio`, `chain`, `swap`.

**Protocol commands** are grouped by type:

| Group | Protocols | Actions |
|-------|-----------|---------|
| `cex` | okx, binance, bybit | buy, sell, long, short, balance, positions |
| `dex` | uniswap, curve, jupiter | swap, quote, tokens/pools |
| `lend` | aave, morpho | markets, supply, withdraw, borrow, repay, positions, rates |
| `stake` | lido | stake, balance, rewards |
| `perps` | hyperliquid | long, short, positions, funding |
| `prediction` | polymarket | markets, events, clob, approve, and CLOB trading |
| `bridge` | lifi, okx | bridge, quote, status, chains |
| `pay` | mpp, x402 | machine payment protocols |

---

## Global Flags

Available on every command:

| Flag | Purpose |
|------|---------|
| `--json` | Force JSON output (useful for piping or automation) |
| `--format table\|json\|csv` | Choose output format |
| `--chain <name>` | Target chain (see Chain Support below) |
| `--wallet <name>` | Use a specific wallet instead of the active one |
| `--yes` | Skip confirmation prompts — **use with caution** |
| `--dry-run` | Preview execution plan without sending transactions |
| `--verbose` | Show debug output |
| `--quiet` | Suppress non-essential output |

---

## Chain Support

| Chain | Canonical Name | Aliases |
|-------|---------------|---------|
| Ethereum | `ethereum` | `eth`, `mainnet` |
| Arbitrum | `arbitrum` | `arb` |
| Optimism | `optimism` | `op` |
| Polygon | `polygon` | `matic`, `poly` |
| Base | `base` | — |
| BSC | `bsc` | — |
| Avalanche | `avalanche` | — |
| Solana | `solana` | `sol` |

**EVM protocols** (Uniswap, Curve, Aave, Morpho, Lido, bridges) work on EVM chains only.
**Jupiter** is Solana-only (no `--chain` flag needed).
**Aggregated swap** (`wooo-cli swap`) auto-routes to the right DEX based on chain — uses Jupiter for Solana, Uniswap/Curve for EVM.

### Validation Policy

For external testing, default to the mainnet-fork Anvil E2E flow rather than testnets.
This repo treats fork-backed validation as the authoritative way to verify protocol
addresses, token manifests, and execution paths without risking real funds.

If you are acting as an agent:

1. Prefer `bun run test:e2e:anvil` when validating on-chain changes.
2. Assume mainnet addresses are the source of truth unless the repo explicitly says otherwise.
3. Do not present testnet support as a guarantee unless the CLI docs say so.
4. If a change touches protocol constants or routing, make sure fork-backed E2E coverage exists.

---

## Setup & Configuration

### First-Time Setup

```bash
npm install -g wooo-cli
wooo-cli config init
wooo-cli wallet create my-wallet      # prompts for passphrase
```

Or import an existing key:

```bash
wooo-cli wallet import my-key 0xprivatekey...
wooo-cli wallet import my-mnemonic --mnemonic   # interactive prompt
wooo-cli wallet import from-file --file /path/to/keyfile
```

For non-interactive / automation:

```bash
export OWS_PASSPHRASE=your-vault-passphrase
export OWS_API_KEY=your-api-key    # agent access with policy enforcement
```

### CEX API Keys

Required for any `wooo-cli cex` commands. Set via env vars or config:

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

Or via config:
```bash
wooo-cli config set okx.apiKey ...
wooo-cli config set okx.apiSecret ...
wooo-cli config set okx.passphrase ...
```

### OKX Onchain Data API (separate credentials)

Required for `market okx`, `portfolio okx`, and `chain okx` commands:

```bash
export WOOO_OKX_ONCHAIN_API_KEY=...
export WOOO_OKX_ONCHAIN_SECRET=...
export WOOO_OKX_ONCHAIN_PASSPHRASE=...
```

---

## Complete Command Reference

### Wallet Management

```bash
wooo-cli wallet create <name> [--words 12|24]
wooo-cli wallet import <name> [key] [--mnemonic] [--file <path>] [--chain evm|solana]
wooo-cli wallet export <name> --confirm
wooo-cli wallet list
wooo-cli wallet info <name>
wooo-cli wallet switch <name>
wooo-cli wallet delete <name> --confirm
wooo-cli wallet balance [address] [--chain <chain>]
```

Remote / hardware wallets:

```bash
wooo-cli wallet discover --signer http://127.0.0.1:8787/
wooo-cli wallet connect <name> --signer <url> [--address <addr>] [--auth-env <var>]
wooo-cli wallet disconnect <name>
```

Policy & API key management:

```bash
wooo-cli wallet policy create <file.json>
wooo-cli wallet policy list
wooo-cli wallet policy show <id>
wooo-cli wallet policy delete <id>
wooo-cli wallet key create <name> --wallet <wallet> --policy <policy-id>
wooo-cli wallet key list
wooo-cli wallet key revoke <key-id>
```

### Market Data (read-only, always safe)

```bash
wooo-cli market price <symbol>              # e.g. BTC, ETH/USDT
wooo-cli market search <keyword>            # e.g. DOGE
wooo-cli market search <keyword> --exchange binance
```

OKX Onchain data (requires OKX Onchain API credentials):

```bash
wooo-cli market okx chains
wooo-cli market okx search <query> --chains ethereum,base [--max 20]
wooo-cli market okx token <chain> <address>
wooo-cli market okx metrics <chain> <address>
wooo-cli market okx price <chain> <address>
wooo-cli market okx trades <chain> <address> [--limit 20]
wooo-cli market okx candles <chain> <address> [--bar 1m|5m|15m|1H|4H|1D]
wooo-cli market okx holders <chain> <address> [--tag whale]
wooo-cli market okx ranking --chains ethereum,base [--sort volume|change|market-cap] [--window 5m|1h|4h|24h]

# OKX Agent market intelligence (public)
wooo-cli market okx filter --instType SPOT|SWAP|FUTURES [--sortBy volUsd24h|oiUsd|fundingRate|last|chg24hPct|marketCapUsd|listTime]
wooo-cli market okx oi-history <instId> [--bar 5m|15m|1H|4H|1D] [--limit 50]
wooo-cli market okx oi-change --instType SWAP|FUTURES [--bar 5m|15m|1H|4H|1D] [--sortBy oiDeltaPct|oiDeltaUsd|oiUsd|volUsd24h|last]
```

OKX news / sentiment radar (requires OKX API credentials):

```bash
wooo-cli news okx latest [--coins BTC,ETH] [--platform blockbeats] [--lang zh-CN|en-US] [--limit 10]
wooo-cli news okx important [--coins BTC,ETH] [--lang zh-CN|en-US] [--limit 10]
wooo-cli news okx by-coin --coins BTC,ETH [--importance high|low] [--platform blockbeats]
wooo-cli news okx search <keyword> [--coins BTC] [--sentiment bullish|bearish|neutral]
wooo-cli news okx by-sentiment --sentiment bullish|bearish|neutral [--coins BTC]
wooo-cli news okx detail <id>
wooo-cli news okx platforms
wooo-cli news okx coin-sentiment --coins BTC,ETH [--period 1h|4h|24h]
wooo-cli news okx coin-trend <coin> [--period 1h|4h|24h] [--points 24]
wooo-cli news okx sentiment-rank [--period 1h|4h|24h] [--sortBy hot|bullish|bearish]
```

### Token Swaps

**Aggregated swap** (auto-picks best DEX route):

```bash
wooo-cli swap <tokenIn> <tokenOut> <amount> --chain <chain> [--dry-run] [--yes]

# Examples:
wooo-cli swap ETH USDC 1 --chain arbitrum --dry-run
wooo-cli swap SOL USDC 10 --chain solana --dry-run
```

**Direct DEX access:**

```bash
# Uniswap V3 (EVM chains)
wooo-cli dex uniswap swap <tokenIn> <tokenOut> <amount> --chain <chain> [--dry-run]
wooo-cli dex uniswap quote <tokenIn> <tokenOut> <amount> --chain <chain>
wooo-cli dex uniswap tokens --chain <chain>

# Curve (EVM chains, optimized for stablecoins)
wooo-cli dex curve swap <tokenIn> <tokenOut> <amount> --chain <chain> [--dry-run]
wooo-cli dex curve quote <tokenIn> <tokenOut> <amount> --chain <chain>
wooo-cli dex curve pools --chain <chain>

# Jupiter (Solana only — no --chain flag)
wooo-cli dex jupiter swap <tokenIn> <tokenOut> <amount> [--dry-run]
wooo-cli dex jupiter quote <tokenIn> <tokenOut> <amount>
wooo-cli dex jupiter tokens
```

### CEX Trading

Same pattern for all exchanges (okx, binance, bybit):

```bash
# Account
wooo-cli cex <exchange> balance
wooo-cli cex <exchange> positions

# Spot trading
wooo-cli cex <exchange> buy <pair> <amount> [--dry-run]     # e.g. BTC/USDT 500
wooo-cli cex <exchange> sell <pair> <amount> [--dry-run]    # e.g. ETH/USDT 0.5

# Futures
wooo-cli cex <exchange> long <symbol> <size> [--leverage <n>] [--dry-run]
wooo-cli cex <exchange> short <symbol> <size> [--leverage <n>] [--dry-run]
```

- `<pair>`: Trading pair like `BTC/USDT`, `ETH/USDC`
- `<amount>`: Amount in quote currency for buy, base currency for sell
- `<symbol>`: Futures symbol like `BTC/USDT:USDT`
- `<size>`: Position size in USD
- `--leverage`: Leverage multiplier (default: 1)

### Lending — Aave V3

```bash
# Discovery (read-only)
wooo-cli lend aave markets --chain <chain>
wooo-cli lend aave rates <token> --chain <chain> --market <market>
wooo-cli lend aave positions --chain <chain> --market <market>

# Write operations
wooo-cli lend aave supply <token> <amount> --chain <chain> --market <market> [--dry-run]
wooo-cli lend aave withdraw <token> [amount] [--all] --chain <chain> --market <market> [--dry-run]
wooo-cli lend aave borrow <token> <amount> --chain <chain> --market <market> [--dry-run]
wooo-cli lend aave repay <token> [amount] [--all] --chain <chain> --market <market> [--dry-run]
```

**Important**: On chains with multiple Aave markets, `--market` is required for token-specific and position commands. Discover available markets first with `wooo-cli lend aave markets --chain <chain>`. The market name looks like `AaveV3Ethereum` — use it exactly.

### Lending — Morpho Markets V1

```bash
# Discovery
wooo-cli lend morpho markets --chain <chain> [--search <q>] [--loan-token <sym>] [--collateral-token <sym>] [--limit 10]
wooo-cli lend morpho market <marketId> --chain <chain>
wooo-cli lend morpho positions --chain <chain>

# Write operations (marketId is a 32-byte hex string like 0xb323...86cc)
wooo-cli lend morpho supply <marketId> <amount> --chain <chain> [--dry-run]
wooo-cli lend morpho withdraw <marketId> [amount] [--all] --chain <chain> [--dry-run]
wooo-cli lend morpho supply-collateral <marketId> <amount> --chain <chain> [--dry-run]
wooo-cli lend morpho withdraw-collateral <marketId> [amount] [--all] --chain <chain> [--dry-run]
wooo-cli lend morpho borrow <marketId> <amount> --chain <chain> [--dry-run]
wooo-cli lend morpho repay <marketId> [amount] [--all] --chain <chain> [--dry-run]
```

### Staking — Lido

```bash
wooo-cli stake lido stake <amount> [--dry-run]      # Stake ETH → stETH (Ethereum only)
wooo-cli stake lido balance                          # stETH balance
wooo-cli stake lido rewards                          # Staking rewards
```

### Perpetual Futures — Hyperliquid

```bash
wooo-cli perps hyperliquid long <symbol> <size> [--leverage <n>] [--dry-run]
wooo-cli perps hyperliquid short <symbol> <size> [--leverage <n>] [--dry-run]
wooo-cli perps hyperliquid positions
wooo-cli perps hyperliquid funding
```

- `<symbol>`: Asset symbol like `BTC`, `ETH`
- `<size>`: Position size in USD
- `--leverage`: Leverage multiplier (default: 1)

### Prediction Markets — Polymarket

```bash
wooo-cli prediction polymarket markets list [--limit 10]
wooo-cli prediction polymarket events get <eventId>
wooo-cli prediction polymarket clob ok                    # Check CLOB connectivity
wooo-cli prediction polymarket approve check              # Check token approvals
wooo-cli prediction polymarket approve set [--dry-run]    # Set approvals for trading
```

Polymarket CLOB trading supports `--signature-type` (eoa, proxy, gnosis-safe) and `--funder-address` for proxy mode.

### Cross-Chain Bridges

```bash
# LI.FI (EVM cross-chain aggregator)
wooo-cli bridge lifi bridge <token> <amount> --from-chain <chain> --to-chain <chain> [--to <destToken>] [--dry-run]
wooo-cli bridge lifi quote <token> <amount> --from-chain <chain> --to-chain <chain> [--to <destToken>]
wooo-cli bridge lifi status <txHash> --from-chain <chain> --to-chain <chain>
wooo-cli bridge lifi chains [--tokens]

# OKX Bridge
wooo-cli bridge okx bridge <token> <amount> --from-chain <chain> --to-chain <chain> [--to <destToken>] [--dry-run]
wooo-cli bridge okx quote <token> <amount> --from-chain <chain> --to-chain <chain> [--to <destToken>]
wooo-cli bridge okx status <txHash>
wooo-cli bridge okx chains [--tokens]
```

Bridge flags use `--from-chain` and `--to-chain` (not `--chain`). Both are EVM-only in this version.

### On-Chain Utilities

```bash
wooo-cli chain tx <hash> [--chain <chain>]
wooo-cli chain balance <address> [--token <tokenAddr>] [--chain <chain>]
wooo-cli chain ens <nameOrAddress>                              # ENS ↔ address (Ethereum only)
wooo-cli chain call <contract> <signature> [args] [--chain <chain>]
```

OKX Onchain history:

```bash
wooo-cli chain okx history <address> --chains ethereum,base [--token <addr>] [--limit 20]
wooo-cli chain okx tx <chain> <txHash>
```

### Portfolio

```bash
wooo-cli portfolio overview                    # Aggregated CEX balances

# OKX Onchain portfolio
wooo-cli portfolio okx chains
wooo-cli portfolio okx overview <address> <chain> [--window 1d|3d|7d|1m|3m]
wooo-cli portfolio okx value <address> --chains ethereum,base [--asset-type all|token|defi]
wooo-cli portfolio okx balances <address> --chains ethereum,base
wooo-cli portfolio okx balance <address> <chain> <token|native>
wooo-cli portfolio okx recent-pnl <address> <chain> [--limit 20]
wooo-cli portfolio okx latest-pnl <address> <chain> <tokenAddress>
wooo-cli portfolio okx dex-history <address> <chain> <beginMs> <endMs> [--type buy,sell]
```

### Configuration

```bash
wooo-cli config init
wooo-cli config set <key> <value>
wooo-cli config get <key>
wooo-cli config list
```

---

## Decision Guide: What Command to Use

| User wants to... | Command |
|-------------------|---------|
| Check token price | `wooo-cli market price <symbol>` |
| Swap tokens (any chain) | `wooo-cli swap <in> <out> <amount> --chain <chain> --dry-run` |
| Swap on specific DEX | `wooo-cli dex <protocol> swap ...` |
| Buy crypto on exchange | `wooo-cli cex <exchange> buy <pair> <amount> --dry-run` |
| Check exchange balance | `wooo-cli cex <exchange> balance` |
| Open leveraged long | `wooo-cli perps hyperliquid long <sym> <size> --leverage <n> --dry-run` |
| Lend on Aave | `wooo-cli lend aave supply <token> <amount> --chain <chain> --market <market> --dry-run` |
| Check DeFi positions | `wooo-cli lend aave positions --chain <chain> --market <market>` |
| Stake ETH | `wooo-cli stake lido stake <amount> --dry-run` |
| Bridge tokens | `wooo-cli bridge lifi bridge <token> <amount> --from-chain <src> --to-chain <dst> --dry-run` |
| Check wallet balance | `wooo-cli wallet balance [--chain <chain>]` |
| Check on-chain balance | `wooo-cli chain balance <address> --chain <chain>` |
| Look up ENS name | `wooo-cli chain ens <name>` |
| View portfolio PnL | `wooo-cli portfolio okx overview <addr> <chain> --window 7d` |
| Find trending tokens | `wooo-cli market okx ranking --chains ethereum,base --sort volume --window 24h` |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "No wallet found" | No active wallet | `wooo-cli wallet list` → `wooo-cli wallet create <name>` |
| "API key not configured" | Missing CEX credentials | `env \| grep WOOO_` or set env vars |
| "Chain not supported" | Wrong chain for protocol | Check protocol's supported chains |
| "Market not found" (Aave) | Missing `--market` flag | `wooo-cli lend aave markets --chain <chain>` to find name |
| Transaction fails | Insufficient balance/gas | Check balance first, use `--dry-run` to preview |
| "Unknown chain" | Typo or unsupported | Use canonical names or aliases: eth, arb, op, matic, base, sol |

## External Testing

Use the fork-backed suite when you need confidence that the CLI will work against
real protocol deployments:

```bash
bun run test:e2e:anvil
```

Useful overrides:

```bash
ANVIL_FORK_URLS_ETHEREUM="https://ethereum.publicnode.com https://rpc.flashbots.net" \
ANVIL_FORK_BLOCK_NUMBER=24652791 \
bun run test:e2e:anvil
```

This is the preferred path for agent verification because it exercises the same
mainnet contract addresses used by `chain`, `dex uniswap`, `swap`, `lend aave`,
and `lend morpho`.

---

## Agent / Automation Patterns

For scripts, CI/CD, or agent-driven workflows:

```bash
# Machine-readable output
wooo-cli market price BTC --json

# Get execution plan without executing
wooo-cli swap ETH USDC 1 --chain ethereum --dry-run --json

# Auto-confirm after verifying plan
wooo-cli swap ETH USDC 1 --chain ethereum --yes

# Set passphrase for non-interactive wallet access
export OWS_PASSPHRASE=...
# Or use API key with policy enforcement
export OWS_API_KEY=...
```

The `--dry-run --json` combination returns an `ExecutionPlan` object describing every step (approvals, transactions, estimated costs) without executing. This is the foundation for building approval workflows where a human or policy engine reviews before committing.
