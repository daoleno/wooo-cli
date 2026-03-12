import { defineCommand } from "citty";
import { confirmTransaction } from "../../core/confirm";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import {
  validateAmount,
  validateChain,
  validateTokenSymbol,
} from "../../core/validation";
import type { ProtocolDefinition } from "../types";
import { StargateClient } from "./client";

const SUPPORTED_CHAINS = [
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "base",
];

const bridge = defineCommand({
  meta: {
    name: "bridge",
    description: "Bridge tokens across chains via Stargate",
  },
  args: {
    token: {
      type: "positional",
      description: "Token to bridge (e.g. USDC, ETH)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to bridge",
      required: true,
    },
    from: {
      type: "positional",
      description: "Source chain (e.g. ethereum)",
      required: true,
    },
    to: {
      type: "positional",
      description: "Destination chain (e.g. arbitrum)",
      required: true,
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const token = validateTokenSymbol(args.token);
    const amount = validateAmount(args.amount);
    const fromChain = validateChain(args.from, SUPPORTED_CHAINS);
    const toChain = validateChain(args.to, SUPPORTED_CHAINS);

    const client = new StargateClient();
    const quoteResult = await client.quote(token, amount, fromChain, toChain);

    const confirmed = await confirmTransaction(
      {
        action: `Bridge ${amount} ${token}: ${fromChain} → ${toChain}`,
        details: {
          token,
          amount,
          from: fromChain,
          to: toChain,
          nativeFee: `${quoteResult.nativeFee} ETH`,
          protocol: "Stargate V2",
        },
      },
      args,
    );

    if (!confirmed) {
      if (args["dry-run"]) {
        out.data({
          action: "BRIDGE",
          ...quoteResult,
          protocol: "Stargate V2",
          status: "dry-run",
        });
      }
      return;
    }

    const privateKey = await getActivePrivateKey("evm");
    const authClient = new StargateClient(privateKey);
    const result = await authClient.bridge(token, amount, fromChain, toChain);
    out.data(result);
  },
});

const quote = defineCommand({
  meta: { name: "quote", description: "Get a bridge fee quote" },
  args: {
    token: {
      type: "positional",
      description: "Token to bridge",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount to bridge",
      required: true,
    },
    from: {
      type: "positional",
      description: "Source chain",
      required: true,
    },
    to: {
      type: "positional",
      description: "Destination chain",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const token = validateTokenSymbol(args.token);
    const amount = validateAmount(args.amount);
    const fromChain = validateChain(args.from, SUPPORTED_CHAINS);
    const toChain = validateChain(args.to, SUPPORTED_CHAINS);
    const client = new StargateClient();
    const result = await client.quote(token, amount, fromChain, toChain);
    out.data(result);
  },
});

const routes = defineCommand({
  meta: { name: "routes", description: "List supported bridge routes" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new StargateClient();
    out.data(client.supportedRoutes());
  },
});

export const stargateProtocol: ProtocolDefinition = {
  name: "stargate",
  displayName: "Stargate V2",
  type: "bridge",
  chains: SUPPORTED_CHAINS,
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "stargate", description: "Stargate cross-chain bridge" },
      subCommands: {
        bridge: () => Promise.resolve(bridge),
        quote: () => Promise.resolve(quote),
        routes: () => Promise.resolve(routes),
      },
    }),
};
