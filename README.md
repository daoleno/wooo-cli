# wooo-cli

**All of crypto, one command away — your terminal-native copilot for trading, DeFi, and on-chain execution.**

Swap on Uniswap, lend on Aave, trade perps on Hyperliquid, query Polymarket, or route through the best supported DEX without ever leaving your terminal. wooo-cli brings CEX trading, DeFi, prediction markets, and on-chain execution across EVM and Solana into a single CLI with consistent flags, structured output, and built-in wallet management.

External wallet integrations:

- overview and rollout guidance: [docs/external-wallet.md](./docs/external-wallet.md)
- formal wire contract: [docs/wallet-transport-v1.md](./docs/wallet-transport-v1.md)

## Quick Start

```bash
# Install
npm install -g wooo-cli

# Set up a local wallet
wooo-cli config init
wooo-cli wallet generate my-wallet   # prompts for the master password unless WOOO_MASTER_PASSWORD is set

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
wooo-cli wallet generate trading-wallet
wooo-cli wallet import 0xprivatekey... --name imported
wooo-cli wallet discover --url http://127.0.0.1:8787/ --json
wooo-cli wallet discover --broker-url https://broker.example.com/ --auth-env WOOO_BROKER_TOKEN --json
wooo-cli wallet connect ledger-main --chain ethereum --address 0xabc... --command '["/usr/local/bin/wooo-signer-ledger","--profile","main"]'
wooo-cli wallet connect signer-service --url http://127.0.0.1:8787/
wooo-cli wallet connect broker-main --broker-url https://broker.example.com/ --auth-env WOOO_BROKER_TOKEN
wooo-cli wallet list
wooo-cli wallet switch trading-wallet
wooo-cli wallet balance
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
├── wallet       — connect, generate, import, list, balance, switch
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

On-chain operations execute through a signer backend, not through private key export.

For a local encrypted wallet:

```bash
wooo-cli wallet generate my-wallet
wooo-cli wallet import 0xprivatekey... --name imported
```

`wooo-cli wallet generate` and `wooo-cli wallet import` prompt for the master password on
TTYs. `WOOO_MASTER_PASSWORD` remains available for controlled local automation and tests.

For an external wallet that exposes a local command signer, register a command transport:

```bash
wooo-cli wallet connect signer-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["/usr/local/bin/wooo-signer","--profile","main"]'
```

For an external wallet system that exposes a local signer service instead of a CLI command:

```bash
wooo-cli wallet connect signer-service \
  --url http://127.0.0.1:8787/
```

For a wallet system that coordinates approval through a remote backend plus frontend wallet:

```bash
wooo-cli wallet connect broker-main \
  --broker-url https://broker.example.com/ \
  --auth-env WOOO_BROKER_TOKEN
```

This repo also ships a reference external signer over command transport for local development and as an
implementation template:

```bash
export WOOO_SIGNER_SECRET_FILE="$HOME/.config/wooo/dev-wallet.secret"

wooo-cli wallet connect signer-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["bun","run","src/examples/command-signer.ts"]'
```

And a reference local signer service:

```bash
export WOOO_SIGNER_SECRET_FILE="$HOME/.config/wooo/dev-wallet.secret"
bun run src/examples/signer-service.ts --port 8787

wooo-cli wallet connect signer-service \
  --chain ethereum \
  --address 0xabc123... \
  --url http://127.0.0.1:8787/
```

And a reference wallet broker that demonstrates the async `pending` flow used by
backend-plus-frontend wallet systems:

```bash
export WOOO_BROKER_AUTH_TOKEN=dev-broker-token
bun run src/examples/signer-broker.ts \
  --address 0xabc123... \
  --chain ethereum \
  --port 8788

wooo-cli wallet connect broker-dev \
  --broker-url http://127.0.0.1:8788/ \
  --auth-env WOOO_BROKER_AUTH_TOKEN
```

The command signer receives `--request-file <path>` and
`--response-file <path>` arguments. The request file contains a JSON payload
describing the action to authorize. The signer command is expected to perform
local confirmation or policy checks, sign or send the request, write a JSON
response file, and exit.

For service-based signers, `wooo-cli` sends the same JSON payload over HTTP `POST`
to the configured local URL and expects the same JSON response contract.
You can inspect signer service metadata first with `wooo-cli wallet discover --url ...`.

For wallet broker transports, `wooo-cli` uses the same JSON signer request/response
contract over HTTP, but talks to an explicit remote broker URL and reads the
bearer token from the configured env var instead of storing it in wallet config.

The reference broker does not hold a secret. It queues requests, exposes
`GET /requests/:requestId` for polling, and lets you resolve them through a dev
endpoint so you can model a browser-wallet or app-wallet approval loop before
swapping in your real backend.

For local testing, inspect and resolve pending broker requests with:

```bash
curl -H "Authorization: Bearer $WOOO_BROKER_AUTH_TOKEN" \
  http://127.0.0.1:8788/dev/requests

curl -X POST \
  -H "Authorization: Bearer $WOOO_BROKER_AUTH_TOKEN" \
  -H "content-type: application/json" \
  http://127.0.0.1:8788/dev/requests/<request-id>/resolve \
  --data '{"ok":true,"txHash":"0x..."}'
```

For teams integrating an external wallet with `wooo-cli`, use:

- [docs/external-wallet.md](./docs/external-wallet.md) for the integration guide
- [docs/wallet-transport-v1.md](./docs/wallet-transport-v1.md) for the exact transport and payload contract

The reference signer resolves its secret from, in order:

- `--secret-file <path>`
- `WOOO_SIGNER_SECRET_FILE`
- `WOOO_SIGNER_SECRET`
- interactive prompt

It is suitable for local development, testing, and as a template. For production,
replace secret resolution with a hardware wallet, OS keychain, HSM, MPC signer,
or your own trusted local signing daemon.

For local wallets, `wooo-cli` applies signer policy and audit logging inside the
signer subprocess. This keeps the main CLI process focused on planning and
execution routing, not secret handling.

Example signer policy:

```json
{
  "signerPolicy": {
    "agent-wallet": {
      "autoApprove": true,
      "expiresAt": "2026-03-16T18:00:00Z",
      "allowProtocols": ["uniswap"],
      "allowCommands": ["swap"],
      "evm": {
        "allowChains": ["arbitrum"],
        "allowFunctions": ["approve", "exactInputSingle"],
        "approvals": {
          "denyUnlimited": true,
          "maxAmount": "1000000000"
        }
      }
    }
  }
}
```

You can write these values with `wooo-cli config set`, including JSON arrays and
objects:

```bash
wooo-cli config set signerPolicy.agent-wallet.autoApprove true
wooo-cli config set signerPolicy.agent-wallet.allowProtocols '["uniswap"]'
wooo-cli config set signerPolicy.agent-wallet.evm '{"allowChains":["arbitrum"],"approvals":{"denyUnlimited":true}}'
```

Local signer audit records are appended to `~/.config/wooo/signer-audit.jsonl`.
External wallet transports should implement equivalent policy and audit controls on their side.

Security model:

- The main CLI process never exposes private keys through the command surface.
- Local wallets sign through an internal signer subprocess.
- External wallets can keep keys entirely outside `wooo-cli`, either as a command transport, a local signer service transport, or a broker transport.
- `--yes` skips the CLI confirmation prompt, but signer-level authorization is still enforced by the signer backend.
- `config.signerPolicy[walletName]` is enforced on the signer side, not in the planner.
- Local signer approvals and rejections are logged to `~/.config/wooo/signer-audit.jsonl`.
- External command signer subprocesses do not inherit the full parent environment. `wooo-cli` forwards `WOOO_CONFIG_DIR`, common terminal/path variables, and `WOOO_SIGNER_*` variables only.
- Local signer service URLs must point to a local host such as `127.0.0.1`, `::1`, or `localhost`.
- Wallet broker URLs may be remote, but non-local brokers must use `https://`, and broker auth only authorizes request creation, not approval bypass.
- External wallet transports support EVM writes, EVM typed-data signing, Solana sends, and Hyperliquid signing through the same request/response contract.

See [docs/external-wallet.md](docs/external-wallet.md) for the full external wallet integration contract.

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
