# wooo

**All of crypto, one command away — your terminal-native copilot for trading, DeFi, and on-chain execution.**

Swap on Uniswap, lend on Aave, trade perps on Hyperliquid, or route through the best supported DEX — without ever leaving your terminal. wooo brings CEX trading, DeFi, and on-chain execution across EVM and Solana into a single CLI with consistent flags, structured output, and built-in wallet management.

## Quick Start

```bash
# Install
bun install -g wooo-cli

# Set up a local wallet
wooo config init
wooo wallet generate my-wallet   # prompts for the master password unless WOOO_MASTER_PASSWORD is set

# Start using
wooo market price BTC
wooo swap USDC ETH 100 --chain arbitrum --dry-run
wooo lend aave rates USDC --chain ethereum --market AaveV3Ethereum
wooo lend morpho markets --chain ethereum
```

## What Can It Do?

| Category | Protocols | What You Get |
|----------|-----------|-------------|
| **CEX Trading** | OKX, Binance, Bybit | Spot buy/sell, futures long/short, balance, positions |
| **DEX Swaps** | Uniswap V3, Curve, Jupiter | Swap, quote, token lists — EVM + Solana |
| **Lending** | Aave V3, Morpho Markets V1 | Aave supply/borrow/rates/positions, Morpho market discovery, positions, and market-native lend/borrow writes |
| **Staking** | Lido | Stake ETH, view stETH balance & rewards |
| **Perps** | Hyperliquid | Long/short with leverage, funding rates |
| **Aggregated Swap** | Auto-routed | Compares DEXes, picks best quote |

**Chains:** Ethereum, Arbitrum, Optimism, Polygon, Base, Solana

Common EVM chain aliases are supported in CLI flags, for example `eth`,
`arb`, `op`, and `matic`.

## Usage Examples

### Wallet Management

```bash
wooo wallet generate trading-wallet
wooo wallet import 0xprivatekey... --name imported
wooo wallet discover --url http://127.0.0.1:8787/ --json
wooo wallet connect ledger-main --chain ethereum --address 0xabc... --command '["/usr/local/bin/wooo-signer-ledger","--profile","main"]'
wooo wallet connect signer-service --url http://127.0.0.1:8787/
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
wooo lend aave markets --chain ethereum
wooo lend aave markets --chain ethereum --market AaveV3Ethereum
wooo lend aave rates USDC --chain ethereum --market AaveV3Ethereum
wooo lend aave supply USDC 1000 --chain ethereum --market AaveV3Ethereum --yes
wooo lend aave withdraw USDC 250 --chain ethereum --market AaveV3Ethereum --yes
wooo lend aave borrow ETH 0.5 --chain ethereum --market AaveV3Ethereum --yes
wooo lend aave repay ETH 0.1 --chain ethereum --market AaveV3Ethereum --yes
wooo lend aave positions --chain ethereum --market AaveV3Ethereum

# Morpho Markets V1 — market discovery, positions, and market-native writes
wooo lend morpho markets --chain ethereum
wooo lend morpho market 0x0123...abcd --chain ethereum
wooo lend morpho positions --chain ethereum
wooo lend morpho supply 0xb323...86cc 100 --chain ethereum --yes
wooo lend morpho supply-collateral 0xb323...86cc 0.1 --chain ethereum --yes
wooo lend morpho borrow 0xb323...86cc 10 --chain ethereum --yes
wooo lend morpho repay 0xb323...86cc --all --chain ethereum --yes

# Lido — liquid staking
wooo stake lido stake 5 --yes
wooo stake lido balance
wooo stake lido rewards
```

For chains with multiple Aave markets, token-specific and account-specific
commands require `--market`. Use `wooo lend aave markets --chain <chain>` to
discover available market names and pool addresses.

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
├── wallet       — connect, generate, import, list, balance, switch
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
│   ├── aave     — markets, supply, withdraw, borrow, repay, positions, rates
│   └── morpho   — markets, market, positions, supply, withdraw, supply-collateral, withdraw-collateral, borrow, repay
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

On-chain operations execute through a signer backend, not through private key export.

For a local encrypted wallet:

```bash
wooo wallet generate my-wallet
wooo wallet import 0xprivatekey... --name imported
```

`wooo wallet generate` and `wooo wallet import` prompt for the master password on
TTYs. `WOOO_MASTER_PASSWORD` remains available for controlled local automation and tests.

For an external wallet system, register a command-based signer:

```bash
wooo wallet connect signer-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["/usr/local/bin/wooo-signer","--profile","main"]'
```

For an external wallet system that exposes a local service instead of a CLI command:

```bash
wooo wallet connect signer-service \
  --url http://127.0.0.1:8787/
```

This repo also ships a reference command signer for local development and as an
implementation template:

```bash
export WOOO_SIGNER_SECRET_FILE="$HOME/.config/wooo/dev-wallet.secret"

wooo wallet connect signer-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["bun","run","src/examples/command-signer.ts"]'
```

And a reference local signer service:

```bash
export WOOO_SIGNER_SECRET_FILE="$HOME/.config/wooo/dev-wallet.secret"
bun run src/examples/signer-service.ts --port 8787

wooo wallet connect signer-service \
  --chain ethereum \
  --address 0xabc123... \
  --url http://127.0.0.1:8787/
```

The external signer command receives `--request-file <path>` and
`--response-file <path>` arguments. The request file contains a JSON payload
describing the action to authorize. The signer command is expected to perform
local confirmation or policy checks, sign or send the request, write a JSON
response file, and exit.

For service-based signers, `wooo` sends the same JSON payload over HTTP `POST`
to the configured local URL and expects the same JSON response contract.
You can inspect signer service metadata first with `wooo wallet discover --url ...`.

The reference signer resolves its secret from, in order:

- `--secret-file <path>`
- `WOOO_SIGNER_SECRET_FILE`
- `WOOO_SIGNER_SECRET`
- interactive prompt

It is suitable for local development, testing, and as a template. For production,
replace secret resolution with a hardware wallet, OS keychain, HSM, MPC signer,
or your own trusted local signing daemon.

For local-keystore wallets, `wooo` applies signer policy and audit logging inside
the signer subprocess. This keeps the main CLI process focused on planning and
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

You can write these values with `wooo config set`, including JSON arrays and
objects:

```bash
wooo config set signerPolicy.agent-wallet.autoApprove true
wooo config set signerPolicy.agent-wallet.allowProtocols '["uniswap"]'
wooo config set signerPolicy.agent-wallet.evm '{"allowChains":["arbitrum"],"approvals":{"denyUnlimited":true}}'
```

Local signer audit records are appended to `~/.config/wooo/signer-audit.jsonl`.
External signers should implement equivalent policy and audit controls on their side.

Security model:

- The main CLI process never exposes private keys through the command surface.
- Local-keystore wallets sign through an internal signer subprocess.
- External signer wallets can keep keys entirely outside `wooo`, either as a local command or a local service.
- `--yes` skips the CLI confirmation prompt, but signer-level authorization is still enforced by the signer backend.
- `config.signerPolicy[walletName]` is enforced on the signer side, not in the planner.
- Local signer approvals and rejections are logged to `~/.config/wooo/signer-audit.jsonl`.
- External signer subprocesses do not inherit the full parent environment. `wooo` forwards `WOOO_CONFIG_DIR`, common terminal/path variables, and `WOOO_SIGNER_*` variables only.
- Signer service URLs must point to a local host such as `127.0.0.1`, `::1`, or `localhost`.
- Service-based signers currently support EVM and Solana write flows. Hyperliquid still requires a synchronous signer transport, so use a command signer or local-keystore wallet there.

See [docs/external-signer.md](docs/external-signer.md) for the full external signer integration contract.

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
