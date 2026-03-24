import { PublicKey } from "@solana/web3.js";
import { defineCommand } from "citty";
import { isAddress } from "viem";
import {
  type ChainFamily,
  isEvmChain,
  isSolanaChain,
} from "../../core/chain-ids";
import {
  bootstrapDefaultWallet,
  getExternalWalletRegistry,
} from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { fetchSignerMetadata, normalizeSignerUrl } from "../../core/signers";

/**
 * Resolve a user-supplied chain string like "evm", "eth", "ethereum",
 * "solana", or "sol" to a ChainFamily.
 * Returns null if the input cannot be mapped.
 */
function resolveChainFamily(input: string): ChainFamily | null {
  const lower = input.trim().toLowerCase();
  if (lower === "evm" || isEvmChain(lower)) return "evm";
  if (lower === "solana" || isSolanaChain(lower)) return "solana";
  return null;
}

function validateWalletAddress(
  address: string,
  chain: "evm" | "solana",
): string {
  if (chain === "evm") {
    if (!isAddress(address)) {
      throw new Error(`Invalid EVM address: ${address}`);
    }
    return address;
  }

  try {
    return new PublicKey(address).toBase58();
  } catch {
    throw new Error(`Invalid Solana address: ${address}`);
  }
}

function selectAdvertisedWallet(
  wallets: Array<{ address: string; chain: "evm" | "solana" }>,
  address?: string,
  chain?: string,
): { address: string; chain: "evm" | "solana" } {
  const requestedChain = chain ? resolveChainFamily(chain) : null;
  if (chain && !requestedChain) {
    throw new Error(
      `Unsupported wallet type: ${chain}. Available: evm, solana`,
    );
  }

  const matching = wallets.filter((wallet) => {
    if (
      address &&
      wallet.address !== validateWalletAddress(address, wallet.chain)
    ) {
      return false;
    }
    if (requestedChain && wallet.chain !== requestedChain) {
      return false;
    }
    return true;
  });

  if (matching.length === 0) {
    throw new Error(
      "The configured signer endpoint did not advertise a wallet matching the requested address/chain",
    );
  }

  if (matching.length > 1) {
    throw new Error(
      "The configured signer endpoint advertised multiple matching wallets. Provide --address or --chain to choose one explicitly.",
    );
  }

  return matching[0];
}

export default defineCommand({
  meta: {
    name: "connect",
    description: "Connect an external wallet over HTTP signer transport",
  },
  args: {
    name: {
      type: "positional",
      description: "Wallet name",
      required: true,
    },
    address: {
      type: "string",
      description:
        "Wallet address. Optional when signer discovery yields one match",
    },
    signer: {
      type: "string",
      description: "HTTP signer URL, for example http://127.0.0.1:8787/",
      required: true,
    },
    "auth-env": {
      type: "string",
      description: "Environment variable that holds the signer bearer token",
    },
    chain: {
      type: "string",
      description:
        "Wallet chain type: evm, solana. Optional when signer discovery yields one match",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const registry = getExternalWalletRegistry();

    if (!args.signer) {
      throw new Error("Missing --signer value");
    }

    const out = createOutput(resolveOutputOptions(args));

    const url = normalizeSignerUrl(args.signer);
    const metadata = await fetchSignerMetadata(url, args["auth-env"]);
    const selected = selectAdvertisedWallet(
      metadata.wallets,
      args.address,
      args.chain,
    );
    registry.add({
      name: args.name,
      address: selected.address,
      chainType: selected.chain,
      signerUrl: url,
      ...(args["auth-env"] ? { authEnv: args["auth-env"] } : {}),
    });
    bootstrapDefaultWallet(args.name);
    out.data({
      name: args.name,
      address: selected.address,
      chain: selected.chain,
      signerUrl: url,
    });
  },
});
