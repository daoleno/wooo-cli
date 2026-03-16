import { PublicKey } from "@solana/web3.js";
import { defineCommand } from "citty";
import { isAddress } from "viem";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  fetchSignerServiceMetadata,
  normalizeSignerServiceUrl,
} from "../../core/signers";
import { resolveWalletType } from "../../core/wallet-store";

function parseCommandJson(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid --command JSON: ${message}`);
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error(
      '--command must be a non-empty JSON array of strings, for example: ["/usr/local/bin/my-signer","--profile","main"]',
    );
  }

  return parsed;
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

function selectServiceWallet(
  wallets: Array<{ address: string; chain: "evm" | "solana" }>,
  address?: string,
  chain?: string,
): { address: string; chain: "evm" | "solana" } {
  const requestedChain = chain ? resolveWalletType(chain) : null;
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
      "Signer service did not advertise a wallet matching the requested address/chain",
    );
  }

  if (matching.length > 1) {
    throw new Error(
      "Signer service advertised multiple matching wallets. Provide --address to choose one explicitly.",
    );
  }

  return matching[0];
}

export default defineCommand({
  meta: { name: "connect", description: "Connect an external signer wallet" },
  args: {
    name: {
      type: "positional",
      description: "Wallet name",
      required: true,
    },
    address: {
      type: "string",
      description: "Wallet address controlled by the external signer",
    },
    command: {
      type: "string",
      description: "JSON array command to invoke the external signer",
    },
    url: {
      type: "string",
      description:
        "Local HTTP signer service URL, for example http://127.0.0.1:8787/",
    },
    chain: {
      type: "string",
      description: "Chain type: evm, solana",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const store = getWalletStore();
    const hasCommand = Boolean(args.command);
    const hasUrl = Boolean(args.url);

    if (hasCommand === hasUrl) {
      throw new Error("Provide exactly one of --command or --url");
    }

    const wallet = hasCommand
      ? await (() => {
          if (!args.chain || !args.address) {
            throw new Error(
              "Command signers require both --chain and --address",
            );
          }
          if (!args.command) {
            throw new Error("Missing --command value");
          }
          const walletType = resolveWalletType(args.chain);
          if (!walletType) {
            throw new Error(
              `Unsupported wallet type: ${args.chain}. Available: evm, solana`,
            );
          }
          return store.connectCommandWallet(
            args.name,
            validateWalletAddress(args.address, walletType),
            walletType,
            parseCommandJson(args.command),
          );
        })()
      : await (async () => {
          if (!args.url) {
            throw new Error("Missing --url value");
          }
          const url = normalizeSignerServiceUrl(args.url);
          const metadata = await fetchSignerServiceMetadata(url);
          const selected = selectServiceWallet(
            metadata.wallets,
            args.address,
            args.chain,
          );
          return store.connectServiceWallet(
            args.name,
            selected.address,
            selected.chain,
            url,
          );
        })();
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
      auth: wallet.authKind,
      active: wallet.active,
    });
  },
});
