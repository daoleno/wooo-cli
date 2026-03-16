import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  fetchSignerServiceMetadata,
  normalizeSignerServiceUrl,
} from "../../core/signers";

export default defineCommand({
  meta: {
    name: "discover",
    description:
      "Inspect a local signer service and list its advertised wallets",
  },
  args: {
    url: {
      type: "string",
      description: "Local HTTP signer service URL",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const url = normalizeSignerServiceUrl(args.url);
    const metadata = await fetchSignerServiceMetadata(url);
    const out = createOutput(resolveOutputOptions(args));

    if (args.json || args.format === "json") {
      out.data({
        url,
        ...metadata,
      });
      return;
    }

    if (args.format !== "csv") {
      out.data(`Signer service: ${url}`);
      out.data(`Supported kinds: ${metadata.supportedKinds.join(", ")}`);
    }

    out.table(
      metadata.wallets.map((wallet) => ({
        address: wallet.address,
        chain: wallet.chain,
      })),
      {
        columns: ["address", "chain"],
        title: "Advertised Wallets",
      },
    );
  },
});
