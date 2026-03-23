# OWS Wallet Migration Design

## Overview

Replace wooo's custom wallet system (keystore, wallet-store, signer-policy, signer-audit) with the Open Wallet Standard (OWS) via `@open-wallet-standard/core` Node SDK. Retain external wallet signing capability (command/service/broker transports) alongside OWS local wallets.

**No backward compatibility required** — this is a clean replacement.

## Goals

1. Adopt OWS as the wallet storage and signing layer for local wallets
2. Use CAIP-2/CAIP-10 chain identifiers throughout
3. Leverage OWS policy engine and audit logging
4. Single mnemonic derives both EVM and Solana addresses
5. Retain external signer transport for hardware wallets and remote signing services

## Architecture

### Before

```
WalletStore (JSON manifest) + Keystore (AES-256-GCM) + SignerPolicy (config)
  → SignerBackend → SignerAudit → Signer (local subprocess / external transport)
```

### After

```
OWS SDK (~/.ows/ vault) + External Wallet Registry (~/.config/wooo/external-wallets.json)
  → OWS Policy + OWS Signing (local) | External Transport (command/service/broker)
  → OWS Audit Log (~/.ows/logs/audit.jsonl)
```

### Two Wallet Sources

| Source | Storage | Signing | Policy |
|--------|---------|---------|--------|
| OWS (local) | `~/.ows/wallets/` (AES-256-GCM + scrypt) | OWS SDK `signTransaction`/`signAndSend`/`signMessage`/`signTypedData` | OWS policy engine (declarative rules + executables) |
| External | `~/.config/wooo/external-wallets.json` (address + transport config only) | command subprocess / HTTP service / HTTP broker | None (external system's responsibility) |

## File Changes

### Delete (replaced by OWS SDK)

- `src/core/keystore.ts` — OWS handles encrypted storage
- `src/core/wallet-store.ts` — OWS `createWallet`/`listWallets`/`getWallet` replace this
- `src/core/signer-policy.ts` — OWS policy engine replaces this
- `src/core/signer-audit.ts` — OWS audit log replaces this
- `src/core/signer-backend.ts` — split: OWS signing + external signing
- `src/commands/wallet/__local-wallet-bridge.ts` — no subprocess signing needed
- `src/commands/wallet/generate.ts` — replaced by `create.ts`

### Delete (tests for removed modules)

- `tests/core/keystore.test.ts`
- `tests/core/signer-policy.test.ts`
- `tests/core/signer-audit.test.ts`

### Rewrite

- `src/core/signer-protocol.ts` — **keep external transport types only** (`SignerCommandRequest`, `SignerCommandResponse`, `SignerWalletContext`). Remove OWS-superseded types (policy types, audit types). Keep Hyperliquid-specific types (`HyperliquidActionSigningRequest`, `HyperliquidActionSignature`, `HyperliquidActionContext`). Keep serialization helpers for external transport.
- `src/core/signers.ts` — unified `WoooSigner` interface backed by OWS or external transport
- `src/core/context.ts` — wallet resolution via OWS SDK + external registry
- `src/core/config.ts` — remove `signerPolicy`, add CAIP chain mapping
- `src/core/chains.ts` — **merge into new `chain-ids.ts`**. Move `normalizeChainName`, `EVM_CHAIN_HELP_TEXT`, `evmChainArg` to use CAIP-2 internally. Delete `chains.ts` after migration.
- `src/core/tx-gateway.ts` — update `EvmSigner` references to `WoooSigner`
- `src/core/solana-gateway.ts` — update `SolanaSigner` references to `WoooSigner`
- `src/commands/wallet/index.ts` — new subcommand structure
- `src/commands/wallet/create.ts` — new, wraps OWS `createWallet`
- `src/commands/wallet/import.ts` — rewrite to use OWS import functions
- `src/commands/wallet/list.ts` — merge OWS + external wallets
- `src/commands/wallet/connect.ts` — write to external wallet registry
- `src/commands/wallet/switch.ts` — update wooo config active wallet
- `src/commands/wallet/balance.ts` — resolve address from OWS wallet accounts
- `src/commands/wallet/discover.ts` — keep as-is (minor type updates)

### Rewrite (tests)

- `tests/core/signers.test.ts` — update for new `WoooSigner` interface
- `tests/core/config.test.ts` — update for removed signerPolicy
- `tests/commands/wallet.test.ts` — rewrite for OWS-based wallet commands
- `tests/commands/wallet-connect.test.ts` — update for external wallet registry
- `tests/commands/wallet-discover.test.ts` — minor type updates
- `tests/fixtures/mock-command-signer.ts` — update for new signer protocol types
- `tests/e2e/anvil-harness.ts` / `tests/e2e/anvil-harness.test.ts` — update signer setup
- `tests/examples-signer-broker.test.ts` — update for new examples
- `tests/protocols/hyperliquid/client.test.ts` — update for `WoooSigner`
- `tests/protocols/x402/client.test.ts` — update for signer changes
- `tests/protocols/error-paths.test.ts` — update error expectations
- `tests/smoke.test.ts` — update wallet commands
- `tests/services/okx-onchain-client.test.ts` — minor updates

### New Files

- `src/commands/wallet/info.ts` — detailed wallet info (OWS `getWallet`)
- `src/commands/wallet/export.ts` — OWS `exportWallet`
- `src/commands/wallet/delete.ts` — OWS `deleteWallet`
- `src/commands/wallet/disconnect.ts` — remove external wallet from registry
- `src/commands/wallet/policy/index.ts` — policy subcommand group
- `src/commands/wallet/policy/create.ts` — OWS `createPolicy`
- `src/commands/wallet/policy/list.ts` — OWS `listPolicies`
- `src/commands/wallet/policy/show.ts` — OWS `getPolicy`
- `src/commands/wallet/policy/delete.ts` — OWS `deletePolicy`
- `src/commands/wallet/key/index.ts` — API key subcommand group
- `src/commands/wallet/key/create.ts` — OWS `createApiKey`
- `src/commands/wallet/key/list.ts` — OWS `listApiKeys`
- `src/commands/wallet/key/revoke.ts` — OWS `revokeApiKey`
- `src/core/external-wallets.ts` — external wallet registry (CRUD: add, remove, list, get)
- `src/core/chain-ids.ts` — CAIP-2 chain alias mapping (absorbs `chains.ts`)

### Modify (protocol files)

These protocol files import `EvmSigner`/`SolanaSigner`/`getActiveEvmSigner`/`getActiveSolanaSigner` and must be updated to use `WoooSigner`/`getActiveSigner`:

**EVM signer users:**
- `src/protocols/aave/operations.ts`
- `src/protocols/lido/operations.ts`
- `src/protocols/curve/operations.ts`
- `src/protocols/uniswap/operations.ts`
- `src/protocols/morpho/operations.ts`
- `src/protocols/hyperliquid/operations.ts`
- `src/protocols/hyperliquid/client.ts` — uses `EvmSigner` as a stored field + Hyperliquid-specific signing types
- `src/protocols/x402/operations.ts`
- `src/protocols/mpp/operations.ts`
- `src/protocols/polymarket/client.ts`
- `src/protocols/polymarket/commands.ts`

**Solana signer users:**
- `src/protocols/jupiter/operations.ts`

**Address-only users (getActiveWallet):**
- `src/protocols/aave/commands.ts`
- `src/protocols/lido/commands.ts`
- `src/protocols/morpho/commands.ts` / `operations.ts`
- `src/protocols/hyperliquid/positions.ts` / `operations.ts`
- `src/protocols/polymarket/client.ts`
- `src/protocols/x402/client.ts`
- `src/protocols/mpp/client.ts`

**Raw private key users (CRITICAL — see special handling below):**
- `src/protocols/x402/client.ts` — calls `getActiveLocalSecret("evm")`
- `src/protocols/mpp/client.ts` — calls `getActiveLocalSecret("evm")`

### Modify (other)

- `src/core/evm.ts` — remove `getWalletClient`/`getAccountAddress`, keep public client
- `src/core/solana.ts` — remove `getSolanaKeypair`/`getSolanaAddress`, keep connection
- `src/core/write-operation.ts` — generic type `TAuth` changes from `EvmSigner`/`SolanaSigner` to `WoooSigner`
- `src/core/execution-plan.ts` — keep `accountType` as `"evm" | "exchange-api" | "solana"` for now (internal concept)

### Update (examples)

- `src/examples/signer-service.ts` — update imports from `signer-backend`/`signer-protocol`
- `src/examples/command-signer.ts` — update imports
- `src/examples/signer-broker.ts` — update imports from `signer-protocol`/`wallet-store`
- `src/examples/signer-example-utils.ts` — update supporting utilities

## Command Structure

```
wooo wallet
├── create      # Create new OWS wallet (BIP-39 mnemonic, derives EVM+Solana)
├── import      # Import mnemonic or private key into OWS
├── export      # Export mnemonic or private key from OWS
├── list        # List all wallets (OWS + external)
├── info        # Detailed wallet info (accounts per chain)
├── delete      # Delete OWS wallet (secure overwrite)
├── switch      # Set active wallet
├── balance     # Check balance (public client, no signing)
├── connect     # Register external wallet (command/service/broker)
├── disconnect  # Remove external wallet from registry
├── discover    # Inspect external signer service
├── policy      # Policy management
│   ├── create  # Create policy (JSON file)
│   ├── list    # List policies
│   ├── show    # Show policy details
│   └── delete  # Delete policy
└── key         # OWS API key management
    ├── create  # Create API key (bind to wallets + policies)
    ├── list    # List API keys
    └── revoke  # Revoke API key
```

## Data Models

### External Wallet Registry

```typescript
// ~/.config/wooo/external-wallets.json
interface ExternalWalletRegistry {
  wallets: ExternalWalletRecord[]
}

interface ExternalWalletRecord {
  name: string
  address: string
  chainType: "evm" | "solana"  // chain family, NOT specific CAIP-2 chain
  transport: ExternalTransport
}

type ExternalTransport =
  | { type: "command"; command: string[] }
  | { type: "service"; url: string }
  | { type: "broker"; url: string; authEnv?: string }
```

**Note**: External wallets use `chainType` (chain family) rather than a specific CAIP-2 `chainId`. An EVM hardware wallet registered once works on all EVM chains (ethereum, arbitrum, base, etc.) — the same address is valid across all `eip155:*` networks. For Solana external wallets, the address is valid on all Solana networks.

### CAIP-2 Chain Alias Map

```typescript
const CHAIN_ALIASES: Record<string, string> = {
  ethereum: "eip155:1",
  arbitrum: "eip155:42161",
  optimism: "eip155:10",
  polygon: "eip155:137",
  base: "eip155:8453",
  bsc: "eip155:56",
  avalanche: "eip155:43114",
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "solana-devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
}

// Helper to extract chain family from CAIP-2
function getChainFamily(chainId: string): "evm" | "solana" {
  if (chainId.startsWith("eip155:")) return "evm"
  if (chainId.startsWith("solana:")) return "solana"
  throw new Error(`Unsupported chain namespace: ${chainId}`)
}
```

Users use short names (`--chain base`), internally resolved to CAIP-2 before any OWS call.

### Active Wallet Configuration

```typescript
// wooo.config.json (existing config file)
{
  "default": {
    "wallet": "my-agent",  // OWS wallet name or external wallet name
    "chain": "base"        // short alias, resolved to CAIP-2
  }
}
```

OWS has no "active wallet" concept, so this stays in wooo config.

## Signer Interface

### Unified Signer

```typescript
interface WoooSigner {
  walletName: string
  address: string  // resolved for the active chain

  // EVM operations
  signTypedData(chainId: string, request: EIP712Request): Promise<Hex>
  writeContract(chainId: string, request: WriteContractRequest): Promise<Hash>

  // Solana operations
  sendTransaction(network: string, serializedTx: string): Promise<string>

  // Hyperliquid L1 action signing (EIP-712 structured, returns {r, s, v})
  signHyperliquidL1Action(request: HyperliquidActionSigningRequest): Promise<HyperliquidActionSignature>

  // Generic message signing
  signMessage(chainId: string, message: string): Promise<string>
}

// Retained from current signer-protocol.ts
interface HyperliquidActionSigningRequest {
  action: unknown
  nonce: number
  vaultAddress?: string
  expiresAfter?: number
  sandbox?: boolean
}

interface HyperliquidActionSignature {
  r: Hex
  s: Hex
  v: number
}
```

### WriteContractRequest

```typescript
interface WriteContractRequest {
  address: Address
  abi: Abi
  functionName: string
  args?: unknown[]
  value?: bigint
  // Approval tracking (for audit/policy)
  approval?: {
    token: Address
    spender: Address
    amount: bigint | "unlimited"
  }
}
```

### Signer Factory

```typescript
function createSigner(wallet: ResolvedWallet): WoooSigner {
  if (wallet.source === "ows") {
    return new OwsSigner(wallet)       // OWS SDK signing
  } else {
    return new ExternalSigner(wallet)  // existing transport layer
  }
}
```

### OWS Signer Implementation

```typescript
class OwsSigner implements WoooSigner {
  // Uses OWS SDK functions:
  // - signTransaction(walletId, chainId, txHex, passphrase)
  // - signAndSend(walletId, chainId, txHex, rpcUrl, passphrase)
  // - signMessage(walletId, chainId, message, passphrase)
  // - signTypedData(walletId, chainId, domain, types, value, passphrase)
  //
  // Passphrase resolution:
  // 1. OWS_API_KEY env → agent mode (no passphrase needed, policy enforced)
  // 2. OWS_PASSPHRASE env → owner mode
  // 3. Interactive prompt → owner mode
  //
  // For signHyperliquidL1Action:
  // Constructs EIP-712 typed data from the action fields and calls OWS signTypedData.
  // Parses the returned signature into {r, s, v} components.
}
```

### External Signer Implementation

Keeps existing `SignerCommandRequest`/`SignerCommandResponse` protocol and transport logic (command subprocess, HTTP service, HTTP broker). Extracted from current `signers.ts`.

The external signer passes `SignerRequestOrigin` (protocol, command, group) for audit logging and confirmation prompts. This is part of the `SignerCommandRequest` protocol retained in `signer-protocol.ts`.

## Raw Private Key Access (x402 and MPP)

**Problem**: `src/protocols/x402/client.ts` and `src/protocols/mpp/client.ts` call `getActiveLocalSecret("evm")` to get a raw private key, then use `privateKeyToAccount()` directly. The signer abstraction is bypassed.

**Solution**: Use OWS `exportWallet` to get the raw private key when needed:

```typescript
// New helper in context.ts
async function getActivePrivateKey(chainType: "evm" | "solana"): Promise<string> {
  const wallet = await resolveActiveWallet(chainType)
  if (wallet.source === "external") {
    throw new Error("Raw key export not available for external wallets")
  }
  const passphrase = await resolvePassphrase()
  const exported = await exportWallet(wallet.walletId, "raw", passphrase, chainType)
  return exported.privateKey
}
```

This requires passphrase authentication (or API key with appropriate policy). The raw key is used only for the duration of the operation — same security posture as the current `getActiveLocalSecret`.

## Authentication Model

| Mode | Credential | Policy | Use Case |
|------|-----------|--------|----------|
| Owner | Passphrase (prompt or `OWS_PASSPHRASE`) | None | Interactive CLI use |
| Agent | API key (`OWS_API_KEY=ows_key_...`) | All attached policies enforced | Automated scripts, AI agents |

Replaces `WOOO_MASTER_PASSWORD` with `OWS_PASSPHRASE` for local wallet access.
Replaces `WOOO_SIGNER_AUTO_APPROVE` with OWS API key + policy.

## Wallet Resolution Flow

```typescript
async function resolveWallet(name?: string, chain?: string): Promise<ResolvedWallet> {
  const walletName = name ?? config.default.wallet  // --wallet flag or config
  const chainAlias = chain ?? config.default.chain  // --chain flag or config
  const chainId = resolveChainId(chainAlias)        // "base" → "eip155:8453"
  const chainFamily = getChainFamily(chainId)       // "eip155:8453" → "evm"

  // Try OWS first
  const owsWallet = await getWallet(walletName)
  if (owsWallet) {
    // OWS wallets derive one key per chain family.
    // For EVM: same address on all eip155:* chains.
    // Find account by chain family namespace.
    const account = owsWallet.accounts.find(a =>
      getChainFamily(a.chain_id) === chainFamily
    )
    if (!account) {
      throw new Error(`Wallet "${walletName}" has no ${chainFamily} account`)
    }
    return {
      source: "ows",
      name: walletName,
      walletId: owsWallet.id,
      address: account.address,
      chainId,  // the specific chain requested (e.g. eip155:8453)
    }
  }

  // Try external registry
  const extWallet = getExternalWallet(walletName)
  if (extWallet) {
    if (extWallet.chainType !== chainFamily) {
      throw new Error(
        `Wallet "${walletName}" is ${extWallet.chainType}, but chain ${chainAlias} requires ${chainFamily}`
      )
    }
    return {
      source: "external",
      name: walletName,
      address: extWallet.address,
      chainId,
      transport: extWallet.transport,
    }
  }

  throw new Error(`Wallet "${walletName}" not found`)
}
```

**Key insight**: OWS wallet accounts are matched by chain family (EVM vs Solana), not by specific CAIP-2 chain. A single EVM-derived address works on all `eip155:*` chains. The `chainId` in `ResolvedWallet` is the specific chain requested, used for signing and transaction broadcast.

## Environment Variables

### New/Changed

- `OWS_PASSPHRASE` — OWS vault passphrase (replaces `WOOO_MASTER_PASSWORD`)
- `OWS_API_KEY` — OWS API key for agent mode (replaces `WOOO_SIGNER_AUTO_APPROVE`)

### Removed

- `WOOO_MASTER_PASSWORD` — replaced by `OWS_PASSPHRASE`
- `WOOO_SIGNER_AUTO_APPROVE` — replaced by OWS API key + policy

### Kept

- `WOOO_CONFIG_DIR` — wooo config directory
- `WOOO_SIGNER_*` — forwarded to external signer subprocesses (command transport)
- `WOOO_HTTP_SIGNER_POLL_INTERVAL_MS` — external signer polling
- `WOOO_HTTP_SIGNER_TIMEOUT_MS` — external signer timeout
- Exchange API key env vars (OKX, Binance, Bybit)

## Protocol Integration Changes

Protocol code that uses signers will need updates:

```typescript
// Before
const signer = await getActiveEvmSigner()
const txHash = await signer.writeContract("ethereum", request)

// After
const signer = await getActiveSigner("evm")  // resolves OWS or external
const txHash = await signer.writeContract("eip155:1", request)
```

Key changes:
1. Chain names become CAIP-2 IDs (or use `resolveChainId()` helper)
2. Single `getActiveSigner(chainType)` replaces `getActiveEvmSigner`/`getActiveSolanaSigner`
3. Signer interface methods remain functionally the same
4. `signHyperliquidL1Action` preserved on the unified interface
5. x402/mpp use `getActivePrivateKey("evm")` instead of `getActiveLocalSecret("evm")`

## Testing Strategy

### Delete (tests for removed modules)
- `tests/core/keystore.test.ts`
- `tests/core/signer-policy.test.ts`
- `tests/core/signer-audit.test.ts`

### Rewrite
- `tests/core/signers.test.ts` — test `WoooSigner` factory + OWS/external routing
- `tests/core/config.test.ts` — remove signerPolicy tests
- `tests/commands/wallet.test.ts` — OWS-based wallet commands
- `tests/commands/wallet-connect.test.ts` — external wallet registry
- `tests/commands/wallet-discover.test.ts` — minor type updates
- `tests/fixtures/mock-command-signer.ts` — update for new protocol types
- `tests/e2e/anvil-harness.ts` — update signer setup for OWS
- `tests/protocols/hyperliquid/client.test.ts` — `WoooSigner` with Hyperliquid
- `tests/protocols/x402/client.test.ts` — `getActivePrivateKey` path
- `tests/protocols/error-paths.test.ts` — update error expectations
- `tests/smoke.test.ts` — update wallet command tests

### New Tests
- Chain alias resolution (`resolveChainId`, `getChainFamily`)
- External wallet registry CRUD
- Wallet resolution flow (OWS vs external, chain family matching)
- OWS wallet create/import/list/delete
- OWS policy and API key management commands

## Dependencies

### Add

- `@open-wallet-standard/core` — OWS Node SDK (NAPI binding, prebuilt for linux/darwin x64/arm64)

### Remove

None (existing deps like viem, @solana/web3.js still needed for public clients and tx building)

## Migration Path

Since no backward compatibility is required:
1. Install `@open-wallet-standard/core` dependency
2. Create `chain-ids.ts` with CAIP-2 mapping (absorb `chains.ts`)
3. Create `external-wallets.ts` registry
4. Rewrite `signer-protocol.ts` (keep external transport types only)
5. Rewrite `signers.ts` with unified `WoooSigner` interface
6. Rewrite `context.ts` with OWS-based wallet resolution
7. Delete old modules (keystore, wallet-store, signer-policy, signer-audit, signer-backend)
8. Rewrite wallet commands
9. Add policy and key subcommands
10. Update all protocol files
11. Update examples
12. Update and create tests
13. Update CLAUDE.md and README
