import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  fetchSignerBrokerMetadata,
  fetchSignerServiceMetadata,
  normalizeSignerBrokerUrl,
  normalizeSignerServiceUrl,
} from "../../core/signers";

export default defineCommand({
  meta: {
    name: "discover",
    description:
      "Inspect a local signer service or wallet broker and list its advertised wallets",
  },
  args: {
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
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const hasServiceUrl = Boolean(args.url);
    const hasBrokerUrl = Boolean(args["broker-url"]);
    if (hasServiceUrl === hasBrokerUrl) {
      throw new Error("Provide exactly one of --url or --broker-url");
    }

    if (args["auth-env"] && !hasBrokerUrl) {
      throw new Error("--auth-env can only be used with --broker-url");
    }

    const [transport, url, metadata] = hasServiceUrl
      ? await (async () => {
          if (!args.url) {
            throw new Error("Missing --url value");
          }
          const url = normalizeSignerServiceUrl(args.url);
          return [
            "service",
            url,
            await fetchSignerServiceMetadata(url),
          ] as const;
        })()
      : await (async () => {
          if (!args["broker-url"]) {
            throw new Error("Missing --broker-url value");
          }
          const url = normalizeSignerBrokerUrl(args["broker-url"]);
          return [
            "broker",
            url,
            await fetchSignerBrokerMetadata(url, args["auth-env"]),
          ] as const;
        })();
    const out = createOutput(resolveOutputOptions(args));

    if (args.json || args.format === "json") {
      out.data({
        transport,
        url,
        ...metadata,
        ...(args["auth-env"] ? { authEnv: args["auth-env"] } : {}),
      });
      return;
    }

    if (args.format !== "csv") {
      out.data(
        `${transport === "broker" ? "Wallet broker" : "Signer service"}: ${url}`,
      );
      out.data(`Supported kinds: ${metadata.supportedKinds.join(", ")}`);
      if (transport === "broker" && args["auth-env"]) {
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
