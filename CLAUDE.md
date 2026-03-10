# CLAUDE.md

## Development Commands

- `bun run dev` - Run CLI in development mode
- `bun run dev -- <command>` - Run specific command (e.g. `bun run dev -- wallet list`)
- `bun test` - Run all tests
- `bun run type-check` - TypeScript type checking
- `bun run lint` - Biome linting
- `bun run lint:fix` - Auto-fix lint issues
- `bun run build` - Build with tsdown

## Architecture

Crypto all-in-one CLI using Citty (unjs). Each exchange/DeFi protocol is its own command group under `src/protocols/`.

### Key Directories
- `src/core/` - Config (c12), output engine, keystore (AES-256-GCM), logger, error handling
- `src/protocols/` - Each protocol has commands.ts + client.ts + types.ts
- `src/protocols/cex-base/` - Shared CEX base client and command templates
- `src/commands/` - Universal commands (wallet, config, market, portfolio)
- `tests/` - Mirrors src structure

### Adding a Protocol
1. Create `src/protocols/<name>/types.ts` (protocol-specific types)
2. Create `src/protocols/<name>/client.ts` (API wrapper)
3. Create `src/protocols/<name>/commands.ts` (define ProtocolDefinition + CLI commands)
4. Add to `src/protocols/registry.ts`

### Global Flags
All commands support: `--json`, `--format`, `--chain`, `--wallet`, `--yes`, `--dry-run`, `--verbose`, `--quiet`

### Adding a CEX Exchange
For CCXT-supported exchanges, even simpler:
1. Create `src/protocols/<name>/commands.ts` using `createCexCommands()` from cex-base
2. Add to `src/protocols/registry.ts`
(OKX, Binance, Bybit already use this pattern)

### Environment Variables
- `WOOO_MASTER_PASSWORD` - Required for wallet operations
- `WOOO_CONFIG_DIR` - Override config directory (default: ~/.config/wooo)
- `WOOO_OKX_API_KEY` / `WOOO_OKX_API_SECRET` / `WOOO_OKX_PASSPHRASE` - OKX credentials
- `WOOO_BINANCE_API_KEY` / `WOOO_BINANCE_API_SECRET` - Binance credentials
- `WOOO_BYBIT_API_KEY` / `WOOO_BYBIT_API_SECRET` - Bybit credentials

## Tech Stack
- **Runtime**: Bun (primary), Node.js compatible
- **CLI Framework**: Citty (unjs)
- **Config**: c12 (unjs)
- **Exchanges**: CCXT
- **EVM**: Viem
- **Build**: tsdown
- **Linting**: Biome

## Design Principles
- No premature abstraction — direct implementations
- Protocol-as-command-group architecture (`wooo <protocol> <action>`)
- Dual-mode output: TTY auto-detect + `--json` for agents
- Use Bun for runtime and testing
