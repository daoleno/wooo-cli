import { defineCommand } from "citty";
import { EVM_CHAIN_HELP_TEXT_WITH_DEFAULT } from "../../core/chains";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { runWriteOperation } from "../../core/write-operation";
import type { ProtocolDefinition } from "../types";
import { X402Client } from "./client";
import { DEFAULT_CHAIN } from "./constants";
import { createX402CallOperation } from "./operations";

const call = defineCommand({
  meta: {
    name: "call",
    description: "Make an x402 paid HTTP request (auto-handles 402)",
  },
  args: {
    url: {
      type: "positional",
      description: "URL to call",
      required: true,
    },
    method: {
      type: "string",
      description: "HTTP method (GET, POST)",
      default: "GET",
    },
    body: {
      type: "string",
      description: "Request body (JSON string)",
    },
    chain: {
      type: "string",
      description: `Chain to pay from (default: ${DEFAULT_CHAIN})`,
      default: DEFAULT_CHAIN,
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    await runWriteOperation(
      args,
      createX402CallOperation({
        url: args.url,
        method: args.method,
        body: args.body,
        chain: args.chain,
      }),
    );
  },
});

const balance = defineCommand({
  meta: {
    name: "balance",
    description: "View USDC balance for x402 payments",
  },
  args: {
    chain: {
      type: "string",
      description: EVM_CHAIN_HELP_TEXT_WITH_DEFAULT,
      default: DEFAULT_CHAIN,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new X402Client();
    const result = await client.getBalance(args.chain);
    out.data(result);
  },
});

export const x402Protocol: ProtocolDefinition = {
  name: "x402",
  displayName: "x402 Payment Protocol",
  type: "payments",
  chains: ["base", "ethereum", "polygon"],
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: {
        name: "x402",
        description: "x402 HTTP Payment Protocol",
      },
      subCommands: {
        call: () => Promise.resolve(call),
        balance: () => Promise.resolve(balance),
      },
    }),
};
