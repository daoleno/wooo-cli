import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { fetchSignerMetadata, normalizeSignerUrl } from "../../core/signers";

export default defineCommand({
  meta: {
    name: "discover",
    description: "Inspect an HTTP signer and list its advertised wallets",
  },
  args: {
    broker: {
      type: "string",
      description: "HTTP signer broker URL, for example http://127.0.0.1:8787/",
      required: true,
    },
    "auth-env": {
      type: "string",
      description: "Environment variable that holds the signer bearer token",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    if (!args.broker) {
      throw new Error("Missing --broker value");
    }

    const url = normalizeSignerUrl(args.broker);
    const metadata = await fetchSignerMetadata(url, args["auth-env"]);
    const out = createOutput(resolveOutputOptions(args));

    if (args.json || args.format === "json") {
      out.data({
        url,
        ...metadata,
        ...(args["auth-env"] ? { authEnv: args["auth-env"] } : {}),
      });
      return;
    }

    if (args.format !== "csv") {
      out.data(`Signer: ${url}`);
      out.data(`Supported kinds: ${metadata.supportedKinds.join(", ")}`);
      if (args["auth-env"]) {
        out.data(`Auth env: ${args["auth-env"]}`);
      }
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
