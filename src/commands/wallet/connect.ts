import { PublicKey } from "@solana/web3.js";
import { defineCommand } from "citty";
import { isAddress } from "viem";
import { getWalletStore } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  fetchSignerBrokerMetadata,
  fetchSignerServiceMetadata,
  normalizeSignerBrokerUrl,
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

function selectAdvertisedWallet(
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
    description:
      "Connect an external wallet over command, local signer service, or wallet broker transport",
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
        "Wallet address. Required for command transport; optional when service or broker discovery yields one match",
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
    "broker-url": {
      type: "string",
      description: "Remote wallet broker URL",
    },
    "auth-env": {
      type: "string",
      description:
        "Environment variable that holds the wallet broker bearer token",
    },
    chain: {
      type: "string",
      description:
        "Wallet chain type: evm, solana. Required for command transport; optional when service or broker discovery yields one match",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const store = getWalletStore();
    const hasCommand = Boolean(args.command);
    const hasUrl = Boolean(args.url);
    const hasBrokerUrl = Boolean(args["broker-url"]);

    if ([hasCommand, hasUrl, hasBrokerUrl].filter(Boolean).length !== 1) {
      throw new Error(
        "Provide exactly one of --command, --url, or --broker-url",
      );
    }

    if (args["auth-env"] && !hasBrokerUrl) {
      throw new Error("--auth-env can only be used with --broker-url");
    }

    const wallet = hasCommand
      ? await (() => {
          if (!args.chain || !args.address) {
            throw new Error(
              "External wallets using command transport require both --chain and --address",
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
          return store.connectExternalWallet(
            args.name,
            validateWalletAddress(args.address, walletType),
            walletType,
            {
              transport: "command",
              command: parseCommandJson(args.command),
            },
          );
        })()
      : hasBrokerUrl
        ? await (async () => {
            if (!args["broker-url"]) {
              throw new Error("Missing --broker-url value");
            }
            const url = normalizeSignerBrokerUrl(args["broker-url"]);
            const metadata = await fetchSignerBrokerMetadata(
              url,
              args["auth-env"],
            );
            const selected = selectAdvertisedWallet(
              metadata.wallets,
              args.address,
              args.chain,
            );
            return store.connectExternalWallet(
              args.name,
              selected.address,
              selected.chain,
              {
                transport: "broker",
                url,
                ...(args["auth-env"] ? { authEnv: args["auth-env"] } : {}),
              },
            );
          })()
        : await (async () => {
            if (!args.url) {
              throw new Error("Missing --url value");
            }
            const url = normalizeSignerServiceUrl(args.url);
            const metadata = await fetchSignerServiceMetadata(url);
            const selected = selectAdvertisedWallet(
              metadata.wallets,
              args.address,
              args.chain,
            );
            return store.connectExternalWallet(
              args.name,
              selected.address,
              selected.chain,
              {
                transport: "service",
                url,
              },
            );
          })();
    const out = createOutput(resolveOutputOptions(args));
    out.data({
      name: wallet.name,
      address: wallet.address,
      chain: wallet.chain,
      mode: wallet.mode,
      ...(wallet.transport ? { transport: wallet.transport } : {}),
      active: wallet.active,
    });
  },
});
