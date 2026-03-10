import ansis from "ansis";
import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import type { ProtocolDefinition } from "../types";
import { StargateClient } from "./client";

const bridge = defineCommand({
  meta: { name: "bridge", description: "Bridge tokens across chains via Stargate" },
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
    const amount = Number.parseFloat(args.amount);

    const client = new StargateClient();
    const quoteResult = await client.quote(args.token, amount, args.from, args.to);

    if (args["dry-run"]) {
      out.data({
        action: "BRIDGE",
        ...quoteResult,
        protocol: "Stargate V2",
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ Bridge ${amount} ${args.token}: ${args.from} → ${args.to} (fee: ${quoteResult.nativeFee} ETH). Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();
    const authClient = new StargateClient(privateKey);
    const result = await authClient.bridge(args.token, amount, args.from, args.to);
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
    const amount = Number.parseFloat(args.amount);
    const client = new StargateClient();
    const result = await client.quote(args.token, amount, args.from, args.to);
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
  chains: ["ethereum", "arbitrum", "optimism", "polygon", "base"],
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
