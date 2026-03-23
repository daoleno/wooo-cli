import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { defineCommand } from "citty";
import { formatEther, isAddress } from "viem";
import {
  EVM_OR_SOLANA_CHAIN_HELP_TEXT,
  getChainFamily,
  normalizeChainName,
  resolveChainId,
} from "../../core/chain-ids";
import { loadWoooConfig } from "../../core/config";
import { getActiveWallet } from "../../core/context";
import { getChain, getPublicClient } from "../../core/evm";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { getSolanaConnection } from "../../core/solana";

export default defineCommand({
  meta: { name: "balance", description: "Check wallet balance" },
  args: {
    address: {
      type: "positional",
      description: "Address (defaults to active wallet)",
      required: false,
    },
    chain: {
      type: "string",
      description: EVM_OR_SOLANA_CHAIN_HELP_TEXT,
      required: false,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const config = await loadWoooConfig();
    const out = createOutput(resolveOutputOptions(args));
    let address: string;
    let walletType: "evm" | "solana";

    if (args.address) {
      address = args.address;
      if (address.startsWith("0x")) {
        if (!isAddress(address)) {
          console.error(`Invalid EVM address: ${address}`);
          process.exit(1);
        }
        walletType = "evm";
      } else {
        walletType = "solana";
      }
    } else {
      const active = await getActiveWallet();
      address = active.address;
      const family = getChainFamily(active.chainId);
      walletType = family;
    }

    if (walletType === "solana") {
      try {
        const network = args.chain || "mainnet-beta";
        const connection = getSolanaConnection(network);
        const balance = await connection.getBalance(new PublicKey(address));
        out.data({
          address,
          balance: (balance / LAMPORTS_PER_SOL).toString(),
          unit: "SOL",
          chain: network,
        });
      } catch {
        console.error(`Invalid Solana address: ${address}`);
        process.exit(1);
      }
      return;
    }

    const configuredDefaultChain = config.default?.chain;
    const chainInput =
      args.chain ||
      (configuredDefaultChain &&
      configuredDefaultChain !== "solana" &&
      (() => {
        try {
          return (
            getChainFamily(resolveChainId(configuredDefaultChain)) === "evm"
          );
        } catch {
          return false;
        }
      })()
        ? configuredDefaultChain
        : "ethereum");
    const chain = normalizeChainName(chainInput);
    const client = getPublicClient(chain);
    const nativeSymbol = getChain(chain).nativeCurrency.symbol;
    const balance = await client.getBalance({
      address: address as `0x${string}`,
    });
    out.data({
      address,
      balance: formatEther(balance),
      unit: nativeSymbol,
      chain,
    });
  },
});
