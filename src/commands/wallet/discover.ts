import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { fetchSignerMetadata, normalizeSignerUrl } from "../../core/signers";

export default defineCommand({
  meta: {
    name: "discover",
    description: "Inspect an HTTP signer and list its advertised wallets",
  },
  args: {
    url: {
      type: "string",
      description: "HTTP signer URL, for example http://127.0.0.1:8787/",
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
    if (!args.url) {
      throw new Error("Missing --url value");
    }

    const url = normalizeSignerUrl(args.url);
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
