import { defineCommand } from "citty";
import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";
import { getWalletStore } from "../../core/context";
import { loadWoooConfig } from "../../core/config";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "balance", description: "Check wallet balance" },
  args: {
    address: { type: "positional", description: "Address (defaults to active wallet)", required: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const config = await loadWoooConfig();
    const rpc = config.chains?.ethereum?.rpc || "https://eth.llamarpc.com";
    let address: string;
    if (args.address) {
      address = args.address;
    } else {
      const store = getWalletStore();
      const active = await store.getActive();
      if (!active) { console.error("No active wallet. Run `wooo wallet generate` first."); process.exit(1); }
      address = active.address;
    }
    const client = createPublicClient({ chain: mainnet, transport: http(rpc) });
    const balance = await client.getBalance({ address: address as `0x${string}` });
    const out = createOutput(resolveOutputOptions(args));
    out.data({ address, balance: formatEther(balance), unit: "ETH" });
  },
});
