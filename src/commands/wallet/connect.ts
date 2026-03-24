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
  getRemoteAccountRegistry,
} from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  fetchSignerMetadata,
  normalizeSignerUrl,
  validateSignerAuthEnv,
} from "../../core/signers";

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

function selectAdvertisedAccount(
  accounts: Array<{
    address: string;
    chainFamily: "evm" | "solana";
    operations: string[];
  }>,
  address?: string,
  chain?: string,
): {
  address: string;
  chainFamily: "evm" | "solana";
  operations: string[];
} {
  const requestedChain = chain ? resolveChainFamily(chain) : null;
  if (chain && !requestedChain) {
    throw new Error(
      `Unsupported chain family: ${chain}. Available: evm, solana`,
    );
  }

  const matching = accounts.filter((account) => {
    if (
      address &&
      account.address !== validateWalletAddress(address, account.chainFamily)
    ) {
      return false;
    }
    if (requestedChain && account.chainFamily !== requestedChain) {
      return false;
    }
    return true;
  });

  if (matching.length === 0) {
    throw new Error(
      "The configured signer endpoint did not advertise an account matching the requested address/chain family",
    );
  }

  if (matching.length > 1) {
    throw new Error(
      "The configured signer endpoint advertised multiple matching accounts. Provide --address or --chain to choose one explicitly.",
    );
  }

  return matching[0];
}

export default defineCommand({
  meta: {
    name: "connect",
    description: "Connect a remote account over HTTP signer transport",
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
        "Account chain family: evm, solana. Optional when signer discovery yields one match",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const registry = getRemoteAccountRegistry();

    if (!args.signer) {
      throw new Error("Missing --signer value");
    }

    const out = createOutput(resolveOutputOptions(args));

    const url = normalizeSignerUrl(args.signer);
    const authEnv = validateSignerAuthEnv(args["auth-env"]);
    const metadata = await fetchSignerMetadata(url, authEnv);
    const selected = selectAdvertisedAccount(
      metadata.accounts,
      args.address,
      args.chain,
    );
    registry.add({
      label: args.name,
      address: selected.address,
      chainFamily: selected.chainFamily,
      signerUrl: url,
      ...(authEnv ? { authEnv } : {}),
    });
    bootstrapDefaultWallet(args.name);
    out.data({
      name: args.name,
      address: selected.address,
      chainFamily: selected.chainFamily,
      operations: selected.operations,
      signerUrl: url,
    });
  },
});
