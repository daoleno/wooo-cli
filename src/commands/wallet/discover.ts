import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  fetchSignerMetadata,
  normalizeSignerUrl,
  validateSignerAuthRef,
} from "../../core/signers";

export default defineCommand({
  meta: {
    name: "discover",
    description: "Inspect an HTTP signer and list its advertised accounts",
  },
  args: {
    signer: {
      type: "string",
      description: "HTTP signer URL, for example http://127.0.0.1:8787/",
      required: true,
    },
    "auth-ref": {
      type: "string",
      description: "Secret ref for the signer bearer token",
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    if (!args.signer) {
      throw new Error("Missing --signer value");
    }

    const url = normalizeSignerUrl(args.signer);
    const authRef = validateSignerAuthRef(args["auth-ref"]);
    const metadata = await fetchSignerMetadata(url, authRef);
    const out = createOutput(resolveOutputOptions(args));

    if (args.json || args.format === "json") {
      out.data({
        signerUrl: url,
        ...metadata,
        ...(authRef ? { authRef } : {}),
      });
      return;
    }

    if (args.format !== "csv") {
      out.data(`Signer: ${url}`);
      if (authRef) {
        out.data(`Auth ref: ${authRef}`);
      }
    }

    out.table(
      metadata.accounts.map((account) => ({
        address: account.address,
        chainFamily: account.chainFamily,
        operations: account.operations.join(", "),
      })),
      {
        columns: ["address", "chainFamily", "operations"],
        title: "Advertised Accounts",
      },
    );
  },
});
