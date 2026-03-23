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

### Rewrite

- `src/core/signers.ts` — unified `WoooSigner` interface backed by OWS or external transport
- `src/core/context.ts` — wallet resolution via OWS SDK + external registry
- `src/core/config.ts` — remove `signerPolicy`, add CAIP chain mapping
- `src/commands/wallet/index.ts` — new subcommand structure
- `src/commands/wallet/create.ts` — new, wraps OWS `createWallet`
- `src/commands/wallet/import.ts` — rewrite to use OWS import functions
- `src/commands/wallet/list.ts` — merge OWS + external wallets
- `src/commands/wallet/connect.ts` — write to external wallet registry
- `src/commands/wallet/switch.ts` — update wooo config active wallet
- `src/commands/wallet/balance.ts` — resolve address from OWS wallet accounts
- `src/commands/wallet/discover.ts` — keep as-is (minor type updates)

### New Files

- `src/commands/wallet/info.ts` — detailed wallet info (OWS `getWallet`)
- `src/commands/wallet/export.ts` — OWS `exportWallet`
- `src/commands/wallet/delete.ts` — OWS `deleteWallet`
- `src/commands/wallet/policy/index.ts` — policy subcommand group
- `src/commands/wallet/policy/create.ts` — OWS `createPolicy`
- `src/commands/wallet/policy/list.ts` — OWS `listPolicies`
- `src/commands/wallet/policy/show.ts` — OWS `getPolicy`
- `src/commands/wallet/policy/delete.ts` — OWS `deletePolicy`
- `src/commands/wallet/key/index.ts` — API key subcommand group
- `src/commands/wallet/key/create.ts` — OWS `createApiKey`
- `src/commands/wallet/key/list.ts` — OWS `listApiKeys`
- `src/commands/wallet/key/revoke.ts` — OWS `revokeApiKey`
- `src/core/external-wallets.ts` — external wallet registry (simple JSON read/write)
- `src/core/chain-ids.ts` — CAIP-2 chain alias mapping

### Modify (minimal)

- `src/core/evm.ts` — remove `getWalletClient`/`getAccountAddress`, keep public client
- `src/core/solana.ts` — remove `getSolanaKeypair`/`getSolanaAddress`, keep connection
- Protocol files that call `getActiveEvmSigner`/`getActiveSolanaSigner` — update types

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
  chainId: string  // CAIP-2, e.g. "eip155:1"
  transport: ExternalTransport
}

type ExternalTransport =
  | { type: "command"; command: string[] }
  | { type: "service"; url: string }
  | { type: "broker"; url: string; authEnv?: string }
```

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

  // Generic message signing (Hyperliquid L1 actions, etc.)
  signMessage(chainId: string, message: string): Promise<string>
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
}
```

### External Signer Implementation

Keeps existing `SignerCommandRequest`/`SignerCommandResponse` protocol and transport logic (command subprocess, HTTP service, HTTP broker). Extracted from current `signers.ts`.

## Authentication Model

| Mode | Credential | Policy | Use Case |
|------|-----------|--------|----------|
| Owner | Passphrase (prompt or `OWS_PASSPHRASE`) | None | Interactive CLI use |
| Agent | API key (`OWS_API_KEY=ows_key_...`) | All attached policies enforced | Automated scripts, AI agents |

Replaces `WOOO_MASTER_PASSWORD` with `OWS_PASSPHRASE` for local wallet access.
Replaces `WOOO_SIGNER_AUTO_APPROVE` with OWS API key + policy `autoApprove` equivalent.

## Wallet Resolution Flow

```typescript
async function resolveWallet(name?: string, chain?: string): Promise<ResolvedWallet> {
  const walletName = name ?? config.default.wallet
  const chainAlias = chain ?? config.default.chain
  const chainId = resolveChainId(chainAlias)  // "base" → "eip155:8453"

  // Try OWS first
  const owsWallet = await getWallet(walletName)
  if (owsWallet) {
    const account = owsWallet.accounts.find(a => a.chain_id === chainId)
    if (!account) throw new Error(`Wallet "${walletName}" has no account for chain ${chainId}`)
    return {
      source: "ows",
      name: walletName,
      walletId: owsWallet.id,
      address: account.address,
      chainId,
    }
  }

  // Try external registry
  const extWallet = getExternalWallet(walletName)
  if (extWallet) {
    return {
      source: "external",
      name: walletName,
      address: extWallet.address,
      chainId: extWallet.chainId,
      transport: extWallet.transport,
    }
  }

  throw new Error(`Wallet "${walletName}" not found`)
}
```

## Environment Variables

### New/Changed

- `OWS_PASSPHRASE` — OWS vault passphrase (replaces `WOOO_MASTER_PASSWORD`)
- `OWS_API_KEY` — OWS API key for agent mode (replaces `WOOO_SIGNER_AUTO_APPROVE`)

### Removed

- `WOOO_MASTER_PASSWORD` — replaced by `OWS_PASSPHRASE`
- `WOOO_SIGNER_AUTO_APPROVE` — replaced by OWS API key + policy

### Kept

- `WOOO_CONFIG_DIR` — wooo config directory
- `WOOO_HTTP_SIGNER_POLL_INTERVAL_MS` — external signer polling
- `WOOO_HTTP_SIGNER_TIMEOUT_MS` — external signer timeout
- Exchange API key env vars (OKX, Binance, Bybit)

## Protocol Integration Changes

Protocol code that uses signers will need minimal updates:

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

## Testing Strategy

1. Unit tests for chain alias resolution (`resolveChainId`)
2. Unit tests for external wallet registry (CRUD)
3. Unit tests for signer factory (OWS vs external routing)
4. Integration tests for wallet create/import/list/delete via OWS SDK
5. Integration tests for signing (requires OWS vault setup)
6. E2E tests for external signer transport (existing tests, adapted)

## Dependencies

### Add

- `@open-wallet-standard/core` — OWS Node SDK (NAPI binding, prebuilt for linux/darwin x64/arm64)

### Remove

None (existing deps like viem, @solana/web3.js still needed for public clients and tx building)

## Migration Path

Since no backward compatibility is required:
1. Delete old wallet files
2. Implement new system
3. Update all protocol references
4. Update tests
5. Update documentation
