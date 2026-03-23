# OWS Wallet Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace wooo's custom wallet system with the Open Wallet Standard (OWS) via `@open-wallet-standard/core`, while retaining external signer transport capability.

**Architecture:** OWS SDK handles local wallet storage, encryption, signing, policy, and audit. External wallets (command/service/broker) continue using the existing transport protocol. A unified `WoooSigner` interface abstracts both backends. CAIP-2 chain identifiers used throughout.

**Tech Stack:** `@open-wallet-standard/core` (NAPI Rust binding), Viem (public clients), Citty (CLI), c12 (config)

**Spec:** `docs/superpowers/specs/2026-03-24-ows-wallet-migration-design.md`

---

## Task 1: Install OWS dependency and create chain-ids module

**Files:**
- Modify: `package.json`
- Create: `src/core/chain-ids.ts`
- Create: `tests/core/chain-ids.test.ts`

**Note:** Do NOT delete `src/core/chains.ts` yet — 13+ files still import from it. Deletion deferred to Task 8.

- [ ] **Step 1: Install `@open-wallet-standard/core`**

Run: `bun add @open-wallet-standard/core`

- [ ] **Step 2: Write failing tests for chain-ids**

```typescript
// tests/core/chain-ids.test.ts
import { describe, expect, test } from "bun:test";
import {
  resolveChainId,
  getChainFamily,
  normalizeChainName,
  evmChainArg,
  formatSupportedChains,
} from "../../src/core/chain-ids";

describe("resolveChainId", () => {
  test("resolves short alias to CAIP-2", () => {
    expect(resolveChainId("base")).toBe("eip155:8453");
    expect(resolveChainId("ethereum")).toBe("eip155:1");
    expect(resolveChainId("solana")).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
  });

  test("passes through valid CAIP-2 as-is", () => {
    expect(resolveChainId("eip155:42161")).toBe("eip155:42161");
  });

  test("resolves common aliases", () => {
    expect(resolveChainId("eth")).toBe("eip155:1");
    expect(resolveChainId("arb")).toBe("eip155:42161");
    expect(resolveChainId("sol")).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(resolveChainId("op")).toBe("eip155:10");
    expect(resolveChainId("poly")).toBe("eip155:137");
  });

  test("throws on unknown chain", () => {
    expect(() => resolveChainId("unknown")).toThrow();
  });
});

describe("getChainFamily", () => {
  test("returns evm for eip155 namespace", () => {
    expect(getChainFamily("eip155:1")).toBe("evm");
    expect(getChainFamily("eip155:8453")).toBe("evm");
  });

  test("returns solana for solana namespace", () => {
    expect(getChainFamily("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe("solana");
  });

  test("throws on unsupported namespace", () => {
    expect(() => getChainFamily("cosmos:cosmoshub-4")).toThrow();
  });
});

describe("normalizeChainName", () => {
  test("normalizes aliases to canonical names", () => {
    expect(normalizeChainName("eth")).toBe("ethereum");
    expect(normalizeChainName("arb")).toBe("arbitrum");
    expect(normalizeChainName("sol")).toBe("solana");
    expect(normalizeChainName("base")).toBe("base");
  });
});

describe("evmChainArg", () => {
  test("returns Citty arg descriptor", () => {
    const arg = evmChainArg();
    expect(arg.type).toBe("string");
    expect(arg.default).toBe("ethereum");
  });
});

describe("formatSupportedChains", () => {
  test("formats chain list with aliases", () => {
    const result = formatSupportedChains(["ethereum", "polygon"]);
    expect(result).toContain("ethereum");
    expect(result).toContain("eth");
    expect(result).toContain("polygon");
    expect(result).toContain("matic");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/core/chain-ids.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement chain-ids module**

```typescript
// src/core/chain-ids.ts
// Replaces src/core/chains.ts with CAIP-2 support.
// Re-exports all functions/constants from the old chains.ts for backward compat
// during migration, plus new CAIP-2 functions.

/** CAIP-2 chain ID aliases. Users type short names, internally resolved to CAIP-2. */
export const CHAIN_ALIASES: Record<string, string> = {
  ethereum: "eip155:1",
  arbitrum: "eip155:42161",
  optimism: "eip155:10",
  polygon: "eip155:137",
  base: "eip155:8453",
  bsc: "eip155:56",
  avalanche: "eip155:43114",
  tempo: "eip155:698",
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "solana-devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

/** Short alias → canonical name. */
const NAME_ALIASES: Record<string, string> = {
  eth: "ethereum",
  mainnet: "ethereum",
  arb: "arbitrum",
  op: "optimism",
  poly: "polygon",
  matic: "polygon",
  sol: "solana",
};

const CHAIN_ALIAS_LABELS: Partial<Record<string, string[]>> = {
  arbitrum: ["arb"],
  ethereum: ["eth"],
  optimism: ["op"],
  polygon: ["matic"],
  solana: ["sol"],
};

const EVM_CHAINS = ["ethereum", "arbitrum", "optimism", "polygon", "base", "bsc", "avalanche", "tempo"];
const SOLANA_CHAINS = ["solana", "solana-devnet"];

export type ChainFamily = "evm" | "solana";

/** Normalize user input to canonical chain name. */
export function normalizeChainName(input: string): string {
  const lower = input.toLowerCase().trim();
  return NAME_ALIASES[lower] ?? lower;
}

/** Format chain list with aliases for help text. */
export function formatSupportedChains(supported: string[]): string {
  return supported
    .map((chain) => {
      const aliases = CHAIN_ALIAS_LABELS[chain];
      if (!aliases?.length) return chain;
      return `${chain} (${aliases.join(", ")})`;
    })
    .join(", ");
}

/** Resolve a chain name or alias to CAIP-2 chain ID. Passes through valid CAIP-2 as-is. */
export function resolveChainId(input: string): string {
  if (input.includes(":")) return input;
  const canonical = normalizeChainName(input);
  const chainId = CHAIN_ALIASES[canonical];
  if (!chainId) {
    throw new Error(
      `Unknown chain: "${input}". Supported: ${Object.keys(CHAIN_ALIASES).join(", ")}`,
    );
  }
  return chainId;
}

/** Extract chain family from CAIP-2 chain ID. */
export function getChainFamily(chainId: string): ChainFamily {
  if (chainId.startsWith("eip155:")) return "evm";
  if (chainId.startsWith("solana:")) return "solana";
  throw new Error(`Unsupported chain namespace: ${chainId}`);
}

/** Get canonical chain name from CAIP-2 ID (reverse lookup). */
export function getChainName(chainId: string): string {
  for (const [name, id] of Object.entries(CHAIN_ALIASES)) {
    if (id === chainId) return name;
  }
  if (chainId.startsWith("eip155:")) return chainId;
  return chainId;
}

export function isEvmChain(name: string): boolean {
  return EVM_CHAINS.includes(normalizeChainName(name));
}

export function isSolanaChain(name: string): boolean {
  return SOLANA_CHAINS.includes(normalizeChainName(name));
}

// ── Help text constants (backward compat with chains.ts) ──

export const EVM_CHAIN_HELP_TEXT =
  "EVM chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, tempo";

export const EVM_CHAIN_HELP_TEXT_WITH_DEFAULT =
  "EVM chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, tempo (default: ethereum)";

export const CHAIN_HELP_TEXT_WITH_CONFIG_DEFAULT =
  "Chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, solana|sol (default from config)";

export const EVM_OR_SOLANA_CHAIN_HELP_TEXT =
  "EVM chain or Solana network override, e.g. eth, arb, op, matic, base, sol";

export const SWAP_CHAIN_HELP_TEXT_WITH_DEFAULT =
  "Chain, e.g. ethereum|eth, arbitrum|arb, optimism|op, polygon|matic, base, solana|sol (default: ethereum)";

/** Citty arg descriptor for EVM chain parameter. */
export function evmChainArg(defaultChain = "ethereum") {
  return {
    type: "string" as const,
    description: EVM_CHAIN_HELP_TEXT_WITH_DEFAULT,
    default: defaultChain,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/core/chain-ids.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lockb src/core/chain-ids.ts tests/core/chain-ids.test.ts && git commit -m "feat: add CAIP-2 chain-ids module with backward-compat exports"
```

---

## Task 2: Create external wallet registry

**Files:**
- Create: `src/core/external-wallets.ts`
- Create: `tests/core/external-wallets.test.ts`

- [ ] **Step 1: Write failing tests for external wallet registry**

```typescript
// tests/core/external-wallets.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { ExternalWalletRegistry } from "../../src/core/external-wallets";

const TEST_DIR = "/tmp/wooo-test-external-wallets";

function createRegistry(): ExternalWalletRegistry {
  mkdirSync(TEST_DIR, { recursive: true });
  return new ExternalWalletRegistry(TEST_DIR);
}

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("ExternalWalletRegistry", () => {
  test("add and list wallets", () => {
    const reg = createRegistry();
    reg.add({
      name: "hw-wallet",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      chainType: "evm",
      transport: { type: "command", command: ["/usr/bin/signer"] },
    });
    const wallets = reg.list();
    expect(wallets).toHaveLength(1);
    expect(wallets[0].name).toBe("hw-wallet");
  });

  test("get wallet by name", () => {
    const reg = createRegistry();
    reg.add({
      name: "test",
      address: "0xabc",
      chainType: "evm",
      transport: { type: "service", url: "http://127.0.0.1:8787/" },
    });
    expect(reg.get("test")?.name).toBe("test");
  });

  test("get returns undefined for unknown wallet", () => {
    const reg = createRegistry();
    expect(reg.get("nope")).toBeUndefined();
  });

  test("remove wallet", () => {
    const reg = createRegistry();
    reg.add({ name: "rm-me", address: "0x1", chainType: "evm", transport: { type: "command", command: ["/bin/s"] } });
    reg.remove("rm-me");
    expect(reg.list()).toHaveLength(0);
  });

  test("throws on duplicate name", () => {
    const reg = createRegistry();
    reg.add({ name: "dup", address: "0x1", chainType: "evm", transport: { type: "command", command: ["/bin/s"] } });
    expect(() =>
      reg.add({ name: "dup", address: "0x2", chainType: "evm", transport: { type: "command", command: ["/bin/s"] } }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/external-wallets.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement external wallet registry**

```typescript
// src/core/external-wallets.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ChainFamily } from "./chain-ids";

export type ExternalTransport =
  | { type: "command"; command: string[] }
  | { type: "service"; url: string }
  | { type: "broker"; url: string; authEnv?: string };

export interface ExternalWalletRecord {
  name: string;
  address: string;
  chainType: ChainFamily;
  transport: ExternalTransport;
}

interface RegistryData {
  wallets: ExternalWalletRecord[];
}

export class ExternalWalletRegistry {
  private filePath: string;

  constructor(configDir: string) {
    this.filePath = join(configDir, "external-wallets.json");
  }

  private load(): RegistryData {
    if (!existsSync(this.filePath)) return { wallets: [] };
    return JSON.parse(readFileSync(this.filePath, "utf-8")) as RegistryData;
  }

  private save(data: RegistryData): void {
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  list(): ExternalWalletRecord[] {
    return this.load().wallets;
  }

  get(name: string): ExternalWalletRecord | undefined {
    return this.load().wallets.find((w) => w.name === name);
  }

  add(wallet: ExternalWalletRecord): void {
    const data = this.load();
    if (data.wallets.some((w) => w.name === wallet.name)) {
      throw new Error(`External wallet "${wallet.name}" already exists`);
    }
    data.wallets.push(wallet);
    this.save(data);
  }

  remove(name: string): void {
    const data = this.load();
    const idx = data.wallets.findIndex((w) => w.name === name);
    if (idx === -1) throw new Error(`External wallet "${name}" not found`);
    data.wallets.splice(idx, 1);
    this.save(data);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/core/external-wallets.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/external-wallets.ts tests/core/external-wallets.test.ts && git commit -m "feat: add external wallet registry"
```

---

## Task 3: Rewrite signer-protocol.ts (keep external transport + metadata types)

**Files:**
- Modify: `src/core/signer-protocol.ts`

Keep: all external transport types (`SignerCommandRequest`/`SignerCommandResponse`), `SignerPrompt`/`SignerPromptValue`, `HttpSignerMetadata`/`SignerServiceMetadata`/`SignerBrokerMetadata`/`AdvertisedWalletDescriptor`, Hyperliquid types, serialization helpers, type guards.

Remove: any types only used by deleted modules (`signer-policy.ts`, `signer-audit.ts`, `signer-backend.ts`). In practice, the current `signer-protocol.ts` types are almost all used by the external transport path, so the changes are minimal — mainly removing any policy-specific types that may be mixed in.

- [ ] **Step 1: Read current signer-protocol.ts and identify removals**

Read the full file. Cross-reference against the deleted modules (`signer-policy.ts`, `signer-audit.ts`, `signer-backend.ts`) to find types that are ONLY used by those deleted modules and NOT by `signers.ts`, `tx-gateway.ts`, `solana-gateway.ts`, protocol clients, or examples.

- [ ] **Step 2: Remove only the unused types, keep everything else**

The key types that MUST be retained:
- `SignerWalletContext`, `WalletMode`, `SignerRequestOrigin`
- `SignerPrompt`, `SignerPromptValue`
- `HyperliquidActionContext`, `HyperliquidActionSigningRequest`, `HyperliquidActionSignature`
- `EvmContractWriteRequest`, `EvmApprovalRequest`, `EvmTypedDataSignRequest`
- All `SignerCommand*Request` union types
- All `SignerCommand*Response` union types
- `HttpSignerMetadata`, `SignerServiceMetadata`, `SignerBrokerMetadata`, `AdvertisedWalletDescriptor`, `HttpSignerMetadataKind`
- `serializeSignerPayload()`, `deserializeSignerPayload()`
- All `isSigner*Response()` type guards

- [ ] **Step 3: Verify compilation**

Run: `bun run type-check`
Expected: May show errors from other files — OK for now.

- [ ] **Step 4: Commit**

```bash
git add src/core/signer-protocol.ts && git commit -m "refactor: slim signer-protocol.ts, remove policy-only types"
```

---

## Task 4: Rewrite signers.ts with unified WoooSigner interface

**Files:**
- Rewrite: `src/core/signers.ts`
- Rewrite: `tests/core/signers.test.ts`

- [ ] **Step 1: Write failing tests for WoooSigner factory**

```typescript
// tests/core/signers.test.ts
import { describe, expect, test } from "bun:test";
import type { ResolvedWallet } from "../../src/core/signers";
import { createSigner } from "../../src/core/signers";

describe("createSigner", () => {
  test("creates OwsSigner for ows source wallet", () => {
    const wallet: ResolvedWallet = {
      source: "ows",
      name: "test",
      walletId: "uuid-123",
      address: "0xabc",
      chainId: "eip155:1",
    };
    const signer = createSigner(wallet);
    expect(signer.walletName).toBe("test");
    expect(signer.address).toBe("0xabc");
  });

  test("creates ExternalSigner for external source wallet", () => {
    const wallet: ResolvedWallet = {
      source: "external",
      name: "hw",
      address: "0xdef",
      chainId: "eip155:1",
      transport: { type: "command", command: ["/bin/signer"] },
    };
    const signer = createSigner(wallet);
    expect(signer.walletName).toBe("hw");
    expect(signer.address).toBe("0xdef");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/signers.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement new signers.ts**

Write the complete new `src/core/signers.ts`. Key components:

**WoooSigner interface:**
```typescript
export interface WoooSigner {
  walletName: string;
  address: string;
  signTypedData(chainId: string, request: EvmTypedDataSignRequest, origin?: SignerRequestOrigin, prompt?: SignerPrompt): Promise<Hex>;
  writeContract(chainId: string, request: EvmContractWriteRequest, origin?: SignerRequestOrigin, prompt?: SignerPrompt, approval?: EvmApprovalRequest): Promise<Hash>;
  sendTransaction(network: string, serializedTx: string, origin?: SignerRequestOrigin, prompt?: SignerPrompt): Promise<string>;
  signHyperliquidL1Action(request: HyperliquidActionSigningRequest, origin?: SignerRequestOrigin): Promise<HyperliquidActionSignature>;
  signMessage(chainId: string, message: string, origin?: SignerRequestOrigin): Promise<string>;
}
```

**ResolvedWallet type:**
```typescript
export type ResolvedWallet =
  | { source: "ows"; name: string; walletId: string; address: string; chainId: string }
  | { source: "external"; name: string; address: string; chainId: string; transport: ExternalTransport };
```

**OwsSigner class:**
- `writeContract()`: Use Viem `encodeFunctionData()` to encode the call, then `serializeTransaction()` to build raw tx hex, call OWS `signAndSend(wallet, chain, txHex, passphrase, 0, rpcUrl)`. Extract `txHash` from `SendResult`.
- `signTypedData()`: Serialize `{domain, types, primaryType, message}` to JSON string via `JSON.stringify()` (with bigint replacer). Call OWS `signTypedData(wallet, chain, json, passphrase)`. Return `SignResult.signature` as Hex.
- `signHyperliquidL1Action()`: **CRITICAL** — Migrate logic from current `signer-backend.ts` lines 200-215. Create a CCXT hyperliquid exchange instance, call `exchange.signL1Action(action, nonce, vaultAddress, expiresAfter)` — but this requires the private key. For OWS, instead construct EIP-712 typed data matching Hyperliquid's domain and call OWS `signTypedData()`, then parse the signature hex into `{r, s, v}` components using `hexToSignature()` from Viem.
- `sendTransaction()`: Call OWS `signAndSend(wallet, chain, txBase64, passphrase)` for Solana. Note: OWS expects hex, so convert base64 to hex first.
- `signMessage()`: Call OWS `signMessage(wallet, chain, message, passphrase)`. Return `SignResult.signature`.
- Passphrase resolution: lazy, cached per signer instance. Check `OWS_API_KEY` → `OWS_PASSPHRASE` → interactive prompt.

**ExternalSigner class:**
- Copy the external transport invocation logic from old `signers.ts`:
  - `invokeSignerCommand()` — subprocess spawn, temp files
  - `invokeHttpSigner()` — HTTP POST
  - `pollSignerResponse()` — poll pending responses
  - `createSignerChildEnv()` — env isolation
- Retain `fetchSignerServiceMetadata()`, `fetchSignerBrokerMetadata()`, `normalizeSignerServiceUrl()`, `normalizeSignerBrokerUrl()` as module-level exports.

**Signature parsing helper (for Hyperliquid):**
```typescript
import { hexToSignature } from "viem";

function parseSignatureToRSV(signatureHex: string): HyperliquidActionSignature {
  const sig = hexToSignature(signatureHex as Hex);
  return {
    r: sig.r,
    s: sig.s,
    v: Number(sig.v),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/core/signers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/signers.ts tests/core/signers.test.ts && git commit -m "feat: rewrite signers.ts with WoooSigner backed by OWS + external transport"
```

---

## Task 5: Rewrite context.ts (wallet resolution)

**Files:**
- Rewrite: `src/core/context.ts`

- [ ] **Step 1: Implement new context.ts**

Key exports:
- `getExternalWalletRegistry()` — singleton registry from config dir
- `resolvePassphrase()` — OWS_API_KEY → OWS_PASSPHRASE → interactive prompt
- `resolveWallet(name?, chain?)` — OWS lookup (match by chain family, not specific CAIP-2) → external registry fallback
- `getActiveWallet(requiredType?)` — for read-only address access
- `getActiveSigner(chainType)` — resolve wallet + create signer
- `getActivePrivateKey(chainType)` — OWS `exportWallet` for x402/mpp raw key access

**IMPORTANT — `getActivePrivateKey` for mnemonic wallets:**

OWS `exportWallet()` returns the mnemonic for mnemonic-based wallets. To get a private key from a mnemonic, use OWS `deriveAddress` to verify the chain, then use the `signMessage`/`signTypedData` SDK functions directly instead of exporting the raw key. However, x402 and mpp libraries require a viem `LocalAccount` object.

Solution: Use `@open-wallet-standard/core`'s `exportWallet()` which returns the mnemonic, then derive the private key using standard BIP-39/BIP-44 derivation (via viem's `mnemonicToAccount` or `HDKey`):

```typescript
import { mnemonicToAccount } from "viem/accounts";

export async function getActivePrivateKey(chainType: ChainFamily): Promise<`0x${string}`> {
  const wallet = await resolveWallet();
  if (wallet.source === "external") {
    throw new Error("Raw key export not available for external wallets");
  }
  const passphrase = await resolvePassphrase();
  const exported = await exportWallet(wallet.name, passphrase);

  // Try JSON format first (private key import)
  try {
    const parsed = JSON.parse(exported);
    if (chainType === "evm" && parsed.secp256k1) return parsed.secp256k1 as `0x${string}`;
    if (chainType === "solana" && parsed.ed25519) return parsed.ed25519 as `0x${string}`;
  } catch {
    // It's a mnemonic
  }

  // Derive from mnemonic
  if (chainType === "evm") {
    const account = mnemonicToAccount(exported);
    // Account has the private key internally — but viem doesn't expose it directly.
    // Use HDKey derivation instead:
    const { HDKey } = await import("@scure/bip32");
    const { mnemonicToSeedSync } = await import("@scure/bip39");
    const seed = mnemonicToSeedSync(exported);
    const hd = HDKey.fromMasterSeed(seed);
    const derived = hd.derive("m/44'/60'/0'/0/0");
    if (!derived.privateKey) throw new Error("Failed to derive private key");
    return `0x${Buffer.from(derived.privateKey).toString("hex")}` as `0x${string}`;
  }

  throw new Error(`Private key derivation for ${chainType} from mnemonic not yet supported`);
}
```

Note: viem already depends on `@scure/bip32` and `@scure/bip39`, so no new deps needed.

- [ ] **Step 2: Verify compilation**

Run: `bun run type-check`

- [ ] **Step 3: Commit**

```bash
git add src/core/context.ts && git commit -m "feat: rewrite context.ts with OWS wallet resolution"
```

---

## Task 6: Update config.ts (remove signerPolicy)

**Files:**
- Modify: `src/core/config.ts`

- [ ] **Step 1: Remove signerPolicy types and config**

Remove: `WalletSignerPolicy`, `EvmSignerPolicy`, `SolanaSignerPolicy`, `HyperliquidSignerPolicy`, `SignerApprovalPolicy` type definitions.
Remove: `signerPolicy` field from `WoooConfig` interface.
Keep: `default`, `chains`, `okxOnchain`, and all other protocol config.

- [ ] **Step 2: Verify compilation**

Run: `bun run type-check`

- [ ] **Step 3: Commit**

```bash
git add src/core/config.ts && git commit -m "refactor: remove signerPolicy from config"
```

---

## Task 7: Clean up evm.ts and solana.ts

**Files:**
- Modify: `src/core/evm.ts`
- Modify: `src/core/solana.ts`

- [ ] **Step 1: Remove private-key-dependent functions from evm.ts**

Remove `getWalletClient()` (lines 75-86) and `getAccountAddress()` (lines 88-91). Keep `CHAIN_MAP`, `getChain()`, `getRpcUrlForChain()`, `getPublicClient()`.

Also update `import { formatSupportedChains, normalizeChainName }` to import from `./chain-ids` instead of `./chains`.

- [ ] **Step 2: Remove private-key-dependent functions from solana.ts**

Remove `getSolanaKeypair()` (lines 26-33) and `getSolanaAddress()` (lines 35-37). Keep `getSolanaConnection()`.

- [ ] **Step 3: Verify compilation**

Run: `bun run type-check`

- [ ] **Step 4: Commit**

```bash
git add src/core/evm.ts src/core/solana.ts && git commit -m "refactor: remove private-key functions from evm.ts and solana.ts"
```

---

## Task 8: Delete old modules and migrate chains.ts consumers

**Files:**
- Delete: `src/core/keystore.ts`, `src/core/wallet-store.ts`, `src/core/signer-policy.ts`, `src/core/signer-audit.ts`, `src/core/signer-backend.ts`, `src/core/chains.ts`
- Delete: `src/commands/wallet/__local-wallet-bridge.ts`, `src/commands/wallet/generate.ts`
- Delete: `tests/core/keystore.test.ts`, `tests/core/signer-policy.test.ts`, `tests/core/signer-audit.test.ts`
- Modify: all files importing from `./chains` or `../chains`

- [ ] **Step 1: Migrate all chains.ts imports to chain-ids.ts**

The following files import from `chains.ts` and must be updated to import from `chain-ids.ts`:
- `src/core/globals.ts` — `CHAIN_HELP_TEXT_WITH_CONFIG_DEFAULT`
- `src/core/validation.ts` — `formatSupportedChains`, `normalizeChainName`
- `src/core/evm.ts` — already done in Task 7
- `src/services/okx-onchain/client.ts` — `normalizeChainName`
- `src/commands/chain/balance.ts` — `evmChainArg`, `normalizeChainName`
- `src/commands/chain/call.ts` — `evmChainArg`, `normalizeChainName`
- `src/commands/chain/tx.ts` — `evmChainArg`, `normalizeChainName`
- `src/commands/swap/index.ts` — `SWAP_CHAIN_HELP_TEXT_WITH_DEFAULT`
- `src/commands/wallet/balance.ts` — `EVM_OR_SOLANA_CHAIN_HELP_TEXT`, `normalizeChainName`
- `src/protocols/morpho/commands.ts` — `evmChainArg`
- `src/protocols/uniswap/commands.ts` — `evmChainArg`, `normalizeChainName`
- `src/protocols/aave/commands.ts` — `evmChainArg`
- `src/protocols/curve/commands.ts` — `evmChainArg`
- `src/protocols/x402/commands.ts` — `EVM_CHAIN_HELP_TEXT_WITH_DEFAULT`

For each file, change import path from `"../../core/chains"` (or `"../chains"`) to `"../../core/chain-ids"` (or `"../chain-ids"`). The function names and types are identical — `chain-ids.ts` re-exports everything from the old `chains.ts`.

- [ ] **Step 2: Delete old files**

```bash
rm -f src/core/keystore.ts src/core/wallet-store.ts src/core/signer-policy.ts \
  src/core/signer-audit.ts src/core/signer-backend.ts src/core/chains.ts \
  src/commands/wallet/__local-wallet-bridge.ts src/commands/wallet/generate.ts \
  tests/core/keystore.test.ts tests/core/signer-policy.test.ts tests/core/signer-audit.test.ts
```

- [ ] **Step 3: Fix any remaining import errors**

Run: `bun run type-check`
Fix any remaining references to deleted modules.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: delete old wallet modules, migrate chains.ts imports to chain-ids.ts"
```

---

## Task 9: Update tx-gateway.ts, solana-gateway.ts, write-operation.ts

**Files:**
- Modify: `src/core/tx-gateway.ts`
- Modify: `src/core/solana-gateway.ts`
- Modify: `src/core/write-operation.ts`

- [ ] **Step 1: Update tx-gateway.ts**

Replace `import type { EvmSigner } from "./signers"` with `import type { WoooSigner } from "./signers"`. Update the `TxGateway` constructor and field type. The `simulateAndWriteContract()` and `ensureAllowance()` methods call `signer.writeContract(chainName, ...)` — the `chainName` parameter should now accept CAIP-2 chain IDs.

- [ ] **Step 2: Update solana-gateway.ts**

Replace `import type { SolanaSigner } from "./signers"` with `import type { WoooSigner } from "./signers"`. Update `SolanaGateway` constructor and field. The `sendVersionedTransaction()` method calls `signer.sendTransaction()`.

- [ ] **Step 3: Verify write-operation.ts**

`write-operation.ts` uses `WriteOperation<TPrepared, TAuth, TResult>` as a generic. `TAuth` is `EvmSigner` or `SolanaSigner` at usage sites, not in the generic definition itself. No changes needed to `write-operation.ts` — the type parameter is generic and will accept `WoooSigner` at call sites. Verify this compiles.

- [ ] **Step 4: Verify compilation**

Run: `bun run type-check`

- [ ] **Step 5: Commit**

```bash
git add src/core/tx-gateway.ts src/core/solana-gateway.ts && git commit -m "refactor: update gateways to use WoooSigner"
```

---

## Task 10: Rewrite wallet commands

**Files:**
- Create: `src/commands/wallet/create.ts`
- Rewrite: `src/commands/wallet/import.ts`
- Create: `src/commands/wallet/export.ts`
- Rewrite: `src/commands/wallet/list.ts`
- Create: `src/commands/wallet/info.ts`
- Create: `src/commands/wallet/delete.ts`
- Rewrite: `src/commands/wallet/switch.ts`
- Rewrite: `src/commands/wallet/balance.ts`
- Rewrite: `src/commands/wallet/index.ts`

- [ ] **Step 1: Implement create.ts**

Wraps OWS `createWallet(name, passphrase?, words?)`. Shows all derived accounts.

- [ ] **Step 2: Rewrite import.ts**

Support `--mnemonic` (interactive prompt for mnemonic) and positional private key. Use OWS `importWalletMnemonic()` or `importWalletPrivateKey()`.

- [ ] **Step 3: Implement export.ts**

Use OWS `exportWallet()`. Require `--confirm` flag. Display mnemonic or key with security warning.

- [ ] **Step 4: Rewrite list.ts**

Merge `listWallets()` from OWS with `getExternalWalletRegistry().list()`. Show source column (ows/external). Mark active wallet.

- [ ] **Step 5: Implement info.ts**

Use OWS `getWallet()`. Show all accounts per chain with addresses and derivation paths.

- [ ] **Step 6: Implement delete.ts**

Use OWS `deleteWallet()`. Require `--confirm` flag.

- [ ] **Step 7: Rewrite switch.ts**

Validate wallet exists in OWS or external registry. Update `default.wallet` in wooo config.

- [ ] **Step 8: Rewrite balance.ts**

Update to use `resolveChainId()` and `getChainFamily()` from `chain-ids.ts`. Get address from `resolveWallet()` or positional arg.

- [ ] **Step 9: Rewrite index.ts**

```typescript
import { defineCommand } from "citty";
export default defineCommand({
  meta: { name: "wallet", description: "Wallet management" },
  subCommands: {
    create: () => import("./create").then((m) => m.default),
    import: () => import("./import").then((m) => m.default),
    export: () => import("./export").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
    info: () => import("./info").then((m) => m.default),
    delete: () => import("./delete").then((m) => m.default),
    switch: () => import("./switch").then((m) => m.default),
    balance: () => import("./balance").then((m) => m.default),
    connect: () => import("./connect").then((m) => m.default),
    disconnect: () => import("./disconnect").then((m) => m.default),
    discover: () => import("./discover").then((m) => m.default),
    policy: () => import("./policy/index").then((m) => m.default),
    key: () => import("./key/index").then((m) => m.default),
  },
});
```

- [ ] **Step 10: Commit**

```bash
git add src/commands/wallet/ && git commit -m "feat: rewrite wallet commands for OWS"
```

---

## Task 11: Rewrite connect.ts and add disconnect.ts

**Files:**
- Rewrite: `src/commands/wallet/connect.ts`
- Create: `src/commands/wallet/disconnect.ts`

- [ ] **Step 1: Rewrite connect.ts**

Replace `getWalletStore().connectExternalWallet()` with `getExternalWalletRegistry().add()`. Replace `resolveWalletType()` with chain family logic. Keep `parseCommandJson()`, `validateWalletAddress()`, `selectAdvertisedWallet()` helpers. Keep metadata fetching via `fetchSignerServiceMetadata()` and `fetchSignerBrokerMetadata()` from `signers.ts`.

- [ ] **Step 2: Implement disconnect.ts**

Simple: `getExternalWalletRegistry().remove(name)`.

- [ ] **Step 3: Commit**

```bash
git add src/commands/wallet/connect.ts src/commands/wallet/disconnect.ts && git commit -m "feat: rewrite connect, add disconnect for external wallets"
```

---

## Task 12: Add policy and key subcommands

**Files:**
- Create: `src/commands/wallet/policy/index.ts`
- Create: `src/commands/wallet/policy/create.ts`
- Create: `src/commands/wallet/policy/list.ts`
- Create: `src/commands/wallet/policy/show.ts`
- Create: `src/commands/wallet/policy/delete.ts`
- Create: `src/commands/wallet/key/index.ts`
- Create: `src/commands/wallet/key/create.ts`
- Create: `src/commands/wallet/key/list.ts`
- Create: `src/commands/wallet/key/revoke.ts`

- [ ] **Step 1: Implement policy subcommands**

Each wraps the OWS SDK: `createPolicy(policyJson)`, `listPolicies()`, `getPolicy(id)`, `deletePolicy(id)`. Policy `create` reads a JSON file path as positional arg, reads the file, passes JSON string to OWS.

- [ ] **Step 2: Implement key subcommands**

`key create` takes `--name`, `--wallet` (repeatable), `--policy` (repeatable), `--expires` options. Calls OWS `createApiKey()`. Displays the token once with a warning.
`key list` calls `listApiKeys()`.
`key revoke` takes ID as positional arg, calls `revokeApiKey(id)`.

- [ ] **Step 3: Wire up index files**

- [ ] **Step 4: Commit**

```bash
git add src/commands/wallet/policy/ src/commands/wallet/key/ && git commit -m "feat: add OWS policy and API key management commands"
```

---

## Task 13: Update protocol files

**Files:** All protocol files listed in the spec under "Modify (protocol files)".

Split into sub-steps by category for easier review:

- [ ] **Step 1: Update EVM signer operations files**

For each of these files, replace `getActiveEvmSigner` → `getActiveSigner("evm")` and `EvmSigner` → `WoooSigner`:
- `src/protocols/aave/operations.ts`
- `src/protocols/lido/operations.ts`
- `src/protocols/curve/operations.ts`
- `src/protocols/uniswap/operations.ts`
- `src/protocols/morpho/operations.ts`
- `src/protocols/hyperliquid/operations.ts`
- `src/protocols/x402/operations.ts`
- `src/protocols/mpp/operations.ts`

- [ ] **Step 2: Update Solana signer operations**

`src/protocols/jupiter/operations.ts`: Replace `getActiveSolanaSigner` → `getActiveSigner("solana")` and `SolanaSigner` → `WoooSigner`.

- [ ] **Step 3: Update hyperliquid/client.ts**

Replace `import type { EvmSigner } from "../../core/signers"` with `import type { WoooSigner } from "../../core/signers"`. Update field type and constructor. The `signHyperliquidL1Action` call stays the same.

- [ ] **Step 4: Update x402/client.ts**

Replace `getActiveLocalSecret("evm")` with `getActivePrivateKey("evm")` from context. The `privateKeyToAccount()` call stays the same.

- [ ] **Step 5: Update mpp/client.ts**

Replace `getActiveLocalSecret("evm")` and `getActiveWalletRecord("evm")` with `getActivePrivateKey("evm")`. Remove the `wallet.connection.mode !== "local"` check — `getActivePrivateKey` handles this.

- [ ] **Step 6: Update polymarket client and commands**

Replace signer type references. Update `getActiveWallet` calls.

- [ ] **Step 7: Update address-only getActiveWallet() calls**

For files that call `getActiveWallet("evm")` just for address (aave/commands.ts, lido/commands.ts, morpho/commands.ts, hyperliquid/positions.ts, etc.): update to use new `getActiveWallet("evm")` return type `{ name, address, chainId }`.

- [ ] **Step 8: Verify compilation**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/protocols/ && git commit -m "refactor: update all protocols for WoooSigner and OWS wallet"
```

---

## Task 14: Update discover.ts and examples

**Files:**
- Modify: `src/commands/wallet/discover.ts`
- Modify: `src/examples/signer-service.ts`
- Modify: `src/examples/command-signer.ts`
- Modify: `src/examples/signer-broker.ts`
- Modify: `src/examples/signer-example-utils.ts`

- [ ] **Step 1: Update discover.ts**

Update imports. This command inspects external signer endpoints — functionally unchanged.

- [ ] **Step 2: Update examples**

Update imports to new module paths. Remove references to `wallet-store`, `signer-backend`. The examples demonstrate external signer transport which still uses `SignerCommandRequest`/`SignerCommandResponse`.

- [ ] **Step 3: Commit**

```bash
git add src/commands/wallet/discover.ts src/examples/ && git commit -m "refactor: update discover and signer examples"
```

---

## Task 15: Update and create tests

**Files:**
- Rewrite: `tests/commands/wallet.test.ts`
- Rewrite: `tests/commands/wallet-connect.test.ts`
- Modify: `tests/commands/wallet-discover.test.ts`
- Modify: `tests/core/config.test.ts`
- Modify: `tests/fixtures/mock-command-signer.ts`
- Modify: `tests/e2e/anvil-harness.ts`, `tests/e2e/anvil-harness.test.ts`
- Modify: `tests/protocols/hyperliquid/client.test.ts`
- Modify: `tests/protocols/x402/client.test.ts`
- Modify: `tests/protocols/error-paths.test.ts`
- Modify: `tests/smoke.test.ts`
- Modify: `tests/services/okx-onchain-client.test.ts`
- Modify: `tests/examples-signer-broker.test.ts`

- [ ] **Step 1: Rewrite wallet command tests**

Test create, list, switch, delete via OWS SDK mocks.

- [ ] **Step 2: Rewrite wallet-connect test**

Use `ExternalWalletRegistry` instead of `WalletStore`.

- [ ] **Step 3: Update config test**

Remove signerPolicy test cases.

- [ ] **Step 4: Update mock-command-signer fixture**

Update for new signer protocol types.

- [ ] **Step 5: Update protocol tests**

- `hyperliquid/client.test.ts`: Use `WoooSigner` mock
- `x402/client.test.ts`: Mock `getActivePrivateKey` instead of `getActiveLocalSecret`
- `error-paths.test.ts`: Update error message expectations

- [ ] **Step 6: Update e2e and smoke tests**

Update signer setup for OWS, wallet command invocations.

- [ ] **Step 7: Update remaining tests**

- `services/okx-onchain-client.test.ts`: Minor import updates
- `examples-signer-broker.test.ts`: Update for new example code

- [ ] **Step 8: Run all tests**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add tests/ && git commit -m "test: update all tests for OWS wallet migration"
```

---

## Task 16: Update CLAUDE.md and run final checks

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Update:
- Environment variables: replace `WOOO_MASTER_PASSWORD` → `OWS_PASSPHRASE`, add `OWS_API_KEY`, remove `WOOO_SIGNER_AUTO_APPROVE`
- Command structure: add policy, key subcommands; replace generate with create; add disconnect
- Signer security model: reference OWS policy engine, vault at `~/.ows/`
- Key directories: note `src/core/chain-ids.ts` replaces `chains.ts`

- [ ] **Step 2: Run full type check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Run linter**

Run: `bun run lint:fix`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 5: Test build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: update CLAUDE.md for OWS wallet migration"
```
