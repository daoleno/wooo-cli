# CLAUDE.md

## Development Commands

- `bun run dev` - Run CLI in development mode
- `bun run dev -- <command>` - Run specific command (e.g. `bun run dev -- cex okx balance`)
- `bun test` - Run all tests
- `bun run type-check` - TypeScript type checking
- `bun run lint` - Biome linting
- `bun run lint:fix` - Auto-fix lint issues
- `bun run build` - Build with tsdown

## Architecture

Crypto all-in-one CLI using Citty (unjs). Protocols are grouped by type under `src/protocols/` and exposed as `wooo <group> <protocol> <action>` (e.g. `wooo cex okx buy`, `wooo perps hyperliquid long`).

### Key Directories
- `src/core/` - Config (c12), output engine, keystore (AES-256-GCM), signer protocol/adapters, signer policy/audit, EVM/Solana clients, logger
- `src/protocols/` - Each protocol has commands.ts + client.ts + types.ts + constants.ts
- `src/protocols/cex-base/` - Shared CEX base client and command templates (CCXT)
- `src/commands/` - Universal commands (wallet, config, market, portfolio, chain, swap)
- `tests/` - Mirrors src structure

### Command Structure
```
wooo
├── config                # Configuration management
├── wallet                # Wallet management (connect, generate, import, list, balance, switch)
├── market                # Aggregated market data (price, search)
├── portfolio             # Cross-protocol portfolio (overview)
├── chain                 # On-chain operations (tx, balance, ens, call)
├── swap                  # Aggregated swap — auto-selects best DEX route
├── cex <exchange>        # CEX: okx, binance, bybit
├── dex <protocol>        # DEX: uniswap, curve, jupiter
├── defi <protocol>       # DeFi: aave, lido
├── perps <protocol>      # Perps DEX: hyperliquid, gmx
└── bridge <protocol>     # Bridges: stargate
```
Grouping is automatic via `ProtocolDefinition.type` → `PROTOCOL_TYPE_TO_GROUP` mapping in `src/protocols/types.ts`.

### Adding a Protocol
1. Create `src/protocols/<name>/types.ts` (protocol-specific types)
2. Create `src/protocols/<name>/client.ts` (API wrapper or contract interaction)
3. Create `src/protocols/<name>/constants.ts` (addresses, ABIs)
4. Create `src/protocols/<name>/commands.ts` (define ProtocolDefinition with correct `type`)
5. Add to `src/protocols/registry.ts`
Protocol auto-appears under its group (cex/dex/defi/perps/bridge) — no changes to index.ts needed.

### Adding a CEX Exchange
For CCXT-supported exchanges, even simpler:
1. Create `src/protocols/<name>/commands.ts` using `createCexCommands()` from cex-base
2. Add to `src/protocols/registry.ts`
(OKX, Binance, Bybit already use this pattern)

### Global Flags
All commands support: `--json`, `--format`, `--chain`, `--wallet`, `--yes`, `--dry-run`, `--verbose`, `--quiet`

### Chain Support
- **EVM chains**: ethereum, arbitrum, optimism, polygon, base (via Viem in `src/core/evm.ts`)
- **Solana**: via @solana/web3.js in `src/core/solana.ts`
- Token addresses and ABIs live in each protocol's `constants.ts`

### Environment Variables
- `WOOO_MASTER_PASSWORD` - Optional master password source for local-keystore wallet generation/import and local signer execution; interactive prompt is preferred on TTYs
- `WOOO_SIGNER_AUTO_APPROVE` - Unsafe test-only bypass for local signer confirmation
- `WOOO_CONFIG_DIR` - Override config directory (default: ~/.config/wooo)
- `WOOO_OKX_API_KEY` / `WOOO_OKX_API_SECRET` / `WOOO_OKX_PASSPHRASE` - OKX credentials
- `WOOO_BINANCE_API_KEY` / `WOOO_BINANCE_API_SECRET` - Binance credentials
- `WOOO_BYBIT_API_KEY` / `WOOO_BYBIT_API_SECRET` - Bybit credentials

### Signer Security Model
- On-chain writes resolve to signer backends, not raw private keys in protocol code
- `config.signerPolicy[walletName]` is enforced by the local signer subprocess
- Local signer audit records are written to `~/.config/wooo/signer-audit.jsonl`
- `--yes` bypasses CLI confirmation only; signer-side authorization remains separate
- External signer subprocesses receive `WOOO_CONFIG_DIR`, `WOOO_SIGNER_*`, and basic shell env only, not the full parent environment
- External signer services are restricted to local HTTP endpoints
- Hyperliquid currently requires a synchronous signer transport, so service signers are for EVM/Solana flows

## Tech Stack
- **Runtime**: Bun (primary), Node.js compatible
- **CLI Framework**: Citty (unjs)
- **Config**: c12 (unjs)
- **Exchanges**: CCXT
- **EVM**: Viem
- **Solana**: @solana/web3.js
- **Build**: tsdown
- **Linting**: Biome

## Design Principles
- No premature abstraction — direct implementations
- Grouped protocol architecture (`wooo <group> <protocol> <action>`)
- Dual-mode output: TTY auto-detect + `--json` for agents
- Use Bun for runtime and testing
