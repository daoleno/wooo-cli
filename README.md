# wooo-cli

[![npm version](https://img.shields.io/npm/v/wooo-cli?logo=npm)](https://www.npmjs.com/package/wooo-cli)

**All of crypto, one command away — your terminal-native copilot for trading, DeFi, and on-chain execution.**

Swap on Uniswap, lend on Aave, trade perps on Hyperliquid, query Polymarket, or route through the best supported DEX without ever leaving your terminal. wooo-cli brings CEX trading, DeFi, prediction markets, and on-chain execution across EVM and Solana into a single CLI with consistent flags, structured output, and built-in wallet management.

External wallet integration: [docs/external-wallet.md](./docs/external-wallet.md)

## Quick Start

```bash
# Install
npm install -g wooo-cli

# Set up a local wallet
wooo-cli config init
wooo-cli wallet create my-wallet   # prompts for passphrase unless OWS_PASSPHRASE is set

# Start using
wooo-cli market price BTC
wooo-cli swap USDC ETH 100 --chain arbitrum --dry-run
wooo-cli lend aave rates USDC --chain ethereum --market AaveV3Ethereum
wooo-cli lend morpho markets --chain ethereum
```

## What Can It Do?

| Category | Protocols | What You Get |
|----------|-----------|-------------|
| **CEX Trading** | OKX, Binance, Bybit | Spot buy/sell, futures long/short, balance, positions |
| **DEX Swaps** | Uniswap V3, Curve, Jupiter | Swap, quote, token lists — EVM + Solana |
| **Lending** | Aave V3, Morpho Markets V1 | Aave supply/borrow/rates/positions, Morpho market discovery, positions, and market-native lend/borrow writes |
| **Staking** | Lido | Stake ETH, view stETH balance & rewards |
| **Perps** | Hyperliquid | Long/short with leverage, funding rates |
| **Prediction Markets** | Polymarket | Gamma discovery, positions, CLOB market data, approvals, and signer-backed trading |
| **Onchain Data** | OKX Onchain OS | Token search, market metrics, portfolio balances and PnL analysis, tx history |
| **Aggregated Swap** | Auto-routed | Compares DEXes, picks best quote |

**Chains:** Ethereum, Arbitrum, Optimism, Polygon, Base, Solana

Common EVM chain aliases are supported in CLI flags, for example `eth`,
`arb`, `op`, and `matic`.

## Usage Examples

### Wallet Management

```bash
wooo-cli wallet create trading-wallet
wooo-cli wallet import my-import --mnemonic
wooo-cli wallet import my-key 0xprivatekey...
wooo-cli wallet list
wooo-cli wallet info trading-wallet
wooo-cli wallet switch trading-wallet
wooo-cli wallet balance
wooo-cli wallet export trading-wallet --confirm
wooo-cli wallet discover --broker http://127.0.0.1:8787/ --json
wooo-cli wallet connect ledger --broker http://127.0.0.1:8787/
wooo-cli wallet connect remote-signer --broker https://signer.example.com --auth-env SIGNER_TOKEN
wooo-cli wallet disconnect ledger
```

### Market Data

```bash
wooo-cli market price BTC          # Aggregated price across exchanges
wooo-cli market price ETH/USDT     # Specific pair
wooo-cli market search DOGE         # Search markets
wooo-cli market okx chains
wooo-cli market okx search weth --chains ethereum,optimism
wooo-cli market okx token ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2
wooo-cli market okx metrics base 0x4200000000000000000000000000000000000006
wooo-cli market okx trades ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2 --limit 20
wooo-cli market okx candles ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2 --bar 15m
wooo-cli market okx holders solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
wooo-cli market okx ranking --chains solana,base --sort volume --window 24h
wooo-cli portfolio okx chains
wooo-cli portfolio okx overview 0xabc... ethereum --window 7d
wooo-cli portfolio okx recent-pnl 0xabc... ethereum --limit 20
wooo-cli portfolio okx latest-pnl 0xabc... ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2
wooo-cli portfolio okx dex-history 0xabc... ethereum 1700000000000 1710000000000 --type buy,sell
```

### Swapping Tokens

```bash
# Aggregated swap — auto-picks best DEX
wooo-cli swap ETH USDC 1 --chain ethereum --dry-run
wooo-cli swap SOL USDC 10 --chain solana --yes

# Direct protocol access
wooo-cli dex uniswap swap ETH USDC 1 --chain arbitrum --yes
wooo-cli dex curve swap USDT USDC 1000 --dry-run
wooo-cli dex jupiter swap SOL USDC 10 --yes
```

### Lending and Staking

```bash
# Aave V3 — lending & borrowing
wooo-cli lend aave markets --chain ethereum
wooo-cli lend aave markets --chain ethereum --market AaveV3Ethereum
wooo-cli lend aave rates USDC --chain ethereum --market AaveV3Ethereum
wooo-cli lend aave supply USDC 1000 --chain ethereum --market AaveV3Ethereum --yes
wooo-cli lend aave withdraw USDC 250 --chain ethereum --market AaveV3Ethereum --yes
wooo-cli lend aave borrow ETH 0.5 --chain ethereum --market AaveV3Ethereum --yes
wooo-cli lend aave repay ETH 0.1 --chain ethereum --market AaveV3Ethereum --yes
wooo-cli lend aave positions --chain ethereum --market AaveV3Ethereum

# Morpho Markets V1 — market discovery, positions, and market-native writes
wooo-cli lend morpho markets --chain ethereum
wooo-cli lend morpho market 0x0123...abcd --chain ethereum
wooo-cli lend morpho positions --chain ethereum
wooo-cli lend morpho supply 0xb323...86cc 100 --chain ethereum --yes
wooo-cli lend morpho supply-collateral 0xb323...86cc 0.1 --chain ethereum --yes
wooo-cli lend morpho borrow 0xb323...86cc 10 --chain ethereum --yes
wooo-cli lend morpho repay 0xb323...86cc --all --chain ethereum --yes

# Lido — liquid staking
wooo-cli stake lido stake 5 --yes
wooo-cli stake lido balance
wooo-cli stake lido rewards
```

For chains with multiple Aave markets, token-specific and account-specific
commands require `--market`. Use `wooo-cli lend aave markets --chain <chain>` to
discover available market names and pool addresses.

### Perpetual Futures

```bash
wooo-cli perps hyperliquid long BTC 1000 --leverage 5 --yes
wooo-cli perps hyperliquid positions
```

### Prediction Markets

```bash
wooo-cli prediction polymarket markets list --limit 10
wooo-cli prediction polymarket events get 2890
wooo-cli prediction polymarket clob ok
wooo-cli prediction polymarket approve check
```

### On-Chain Utilities

```bash
wooo-cli chain tx 0xabc123...                          # View transaction
wooo-cli chain balance 0xabc... --chain ethereum        # Native balance
wooo-cli chain balance 0xabc... --token 0xerc20...      # Token balance
wooo-cli chain ens vitalik.eth                          # ENS lookup
wooo-cli chain call 0x... "totalSupply()(uint256)"      # Read contract
wooo-cli chain okx history 0xabc... --chains ethereum,base
wooo-cli chain okx tx arbitrum 0xabc123...
```

### OKX Onchain Data

```bash
wooo-cli market okx chains
wooo-cli market okx search weth --chains ethereum,optimism
wooo-cli market okx price ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2
wooo-cli market okx trades ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2 --limit 20
wooo-cli market okx candles ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2 --bar 15m
wooo-cli market okx holders ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2 --tag whale
wooo-cli market okx ranking --chains ethereum,base --sort volume --window 24h
wooo-cli portfolio okx chains
wooo-cli portfolio okx overview 0xabc... ethereum --window 7d
wooo-cli portfolio okx recent-pnl 0xabc... ethereum --limit 20
wooo-cli portfolio okx latest-pnl 0xabc... ethereum 0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2
wooo-cli portfolio okx dex-history 0xabc... ethereum 1700000000000 1710000000000 --type buy,sell
wooo-cli portfolio okx value 0xabc... --chains ethereum,base
wooo-cli portfolio okx balances 0xabc... --chains ethereum,base
wooo-cli portfolio okx balance 0xabc... ethereum native
wooo-cli chain okx history 0xabc... --chains ethereum,base --limit 20
wooo-cli chain okx tx ethereum 0xabc123...
```

## Command Structure

```
wooo-cli
├── config       — init, set, get, list
├── wallet       — create, import, export, list, info, delete, switch, balance, connect, disconnect, discover, policy, key
├── market       — price, search, okx
├── portfolio    — overview, okx
├── chain        — tx, balance, ens, call, okx
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
│   ├── aave     — markets, supply, withdraw, borrow, repay, positions, rates
│   └── morpho   — markets, market, positions, supply, withdraw, supply-collateral, withdraw-collateral, borrow, repay
├── stake
│   └── lido     — stake, balance, rewards
├── perps
│   └── hyperliquid — long, short, positions, funding
├── prediction
│   └── polymarket — gamma data, CLOB market data, approvals, authenticated trading
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

Set via environment variables or `wooo-cli config set`:

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

### OKX Onchain Data API

OKX Onchain data commands use API credentials only. They do not use or weaken
the signer boundary for private keys.

```bash
export WOOO_OKX_ONCHAIN_API_KEY=...
export WOOO_OKX_ONCHAIN_SECRET=...
export WOOO_OKX_ONCHAIN_PASSPHRASE=...

# Optional for local testing or mocks
export WOOO_OKX_ONCHAIN_BASE_URL=http://127.0.0.1:8787
```

Equivalent config keys:

```bash
wooo-cli config set okxOnchain.apiKey ...
wooo-cli config set okxOnchain.secret ...
wooo-cli config set okxOnchain.passphrase ...
```

### On-Chain Protocols

On-chain operations use the OWS (Open Wallet Standard) vault for local wallets and HTTP broker transport for external wallets.

For a local wallet:

```bash
wooo-cli wallet create my-wallet
wooo-cli wallet import my-key 0xprivatekey...
```

`wooo-cli wallet create` and `wooo-cli wallet import` prompt for the vault passphrase on TTYs. Set `OWS_PASSPHRASE` for non-interactive use, or `OWS_API_KEY` for agent/automated access with policy enforcement.

For an external wallet, connect to an HTTP signing broker:

```bash
wooo-cli wallet connect my-signer --broker http://127.0.0.1:8787/
wooo-cli wallet connect remote --broker https://signer.example.com --auth-env SIGNER_TOKEN
```

Reference signer implementations ship in `src/examples/`:

```bash
# Local signer service
export WOOO_SIGNER_SECRET_FILE="$HOME/.config/wooo/dev-wallet.secret"
bun run src/examples/signer-service.ts --port 8787
wooo-cli wallet connect dev --broker http://127.0.0.1:8787/

# Async broker (demonstrates pending/polling flow)
export WOOO_BROKER_AUTH_TOKEN=dev-broker-token
bun run src/examples/signer-broker.ts --address 0xabc... --chain ethereum --port 8788
wooo-cli wallet connect broker-dev --broker http://127.0.0.1:8788/ --auth-env WOOO_BROKER_AUTH_TOKEN
```

OWS policy management:

```bash
wooo-cli wallet policy create policy.json
wooo-cli wallet policy list
wooo-cli wallet key create agent-key --wallet my-wallet --policy policy-id
wooo-cli wallet key list
wooo-cli wallet key revoke key-id
```

Security model:

- Local wallets are stored in the OWS vault at `~/.ows/` with AES-256-GCM encryption
- Policy is enforced by the OWS policy engine before signing
- Audit log at `~/.ows/logs/audit.jsonl`
- `--yes` skips CLI confirmation only; signer-side authorization remains separate
- External wallets connect via HTTP broker — keys never enter the CLI process
- For teams integrating an external wallet, see [docs/external-wallet.md](docs/external-wallet.md)

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

# Optional: pin custom upstream RPCs / block numbers
ANVIL_FORK_URLS_ETHEREUM="https://ethereum.publicnode.com https://rpc.flashbots.net" \
ANVIL_FORK_BLOCK_NUMBER=24652791 \
ANVIL_FORK_URL_POLYGON=https://polygon-bor-rpc.publicnode.com \
ANVIL_FORK_BLOCK_NUMBER_POLYGON=69400000 \
bun run test:e2e:anvil

# Type check
bun run type-check

# Lint & format
bun run lint:fix
```

The anvil e2e flow uses a local Ethereum fork and an ephemeral wallet, so it exercises
real EVM write paths for `chain`, `dex uniswap`, and `lend aave` without using real funds.
It supports fork RPC fallback lists through `ANVIL_FORK_URLS_ETHEREUM` and
`ANVIL_FORK_URLS_POLYGON`, and still accepts the single-URL overrides
`ANVIL_FORK_URL_ETHEREUM` and `ANVIL_FORK_URL_POLYGON`.

## Release

This repo ships two GitHub Actions workflows:

- `.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch. It installs dependencies, runs build/lint/type-check/unit tests, performs `npm pack --dry-run`, and then runs the Anvil fork E2E suite.
- `.github/workflows/publish.yml` runs on semver tags such as `v0.1.0` and publishes the package to the public npm registry after repeating release verification and Anvil fork E2E.

Release flow:

```bash
# 1. Bump package.json version
npm version patch

# 2. Push the branch and semver tag
git push origin main --follow-tags
```

The publish workflow verifies that the pushed git tag matches `package.json`
and skips the publish step when the target version already exists on npm.

For npm authentication, configure npm trusted publishing for the
`publish.yml` workflow. The workflow is set up for GitHub Actions OIDC publishing
and does not require an `NPM_TOKEN` repository secret.
For the initial package bootstrap and other maintainer release notes, see
[`docs/release.md`](docs/release.md).

## Architecture

wooo-cli is built around a protocol registry plus a shared write-command contract.
Each protocol exports a manifest from `commands.ts`, keeps protocol I/O in `client.ts`,
and can expose reusable write flows in `operations.ts` when the same behavior is shared
across direct protocol commands and aggregated commands such as `wooo-cli swap`.

Protocols are grouped into mutually exclusive CLI buckets (`dex`, `lend`, `stake`, `perps`, `prediction`, `cex`) and auto-registered into the command tree.
Every write command returns an `ExecutionPlan` on `--dry-run --json`.

See [docs/architecture.md](docs/architecture.md) for details.

## License

[MIT](LICENSE)
