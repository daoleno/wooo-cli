import ansis from "ansis";
import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import type { ProtocolDefinition } from "../types";
import { LidoClient } from "./client";

const stake = defineCommand({
  meta: { name: "stake", description: "Stake ETH for stETH via Lido" },
  args: {
    amount: {
      type: "positional",
      description: "Amount of ETH to stake",
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

    if (args["dry-run"]) {
      out.data({
        action: "STAKE",
        amountETH: amount,
        estimatedStETH: amount,
        protocol: "Lido",
        status: "dry-run",
      });
      return;
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ About to stake ${amount} ETH via Lido → ~${amount} stETH. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();
    const client = new LidoClient(privateKey);
    const result = await client.stake(amount);
    out.data(result);
  },
});

const rewards = defineCommand({
  meta: { name: "rewards", description: "View Lido staking rewards" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const privateKey = await getActivePrivateKey();
    const client = new LidoClient(privateKey);
    const result = await client.rewards();
    out.data(result);
  },
});

const balance = defineCommand({
  meta: { name: "balance", description: "View stETH balance" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const privateKey = await getActivePrivateKey();
    const client = new LidoClient(privateKey);
    const stethBalance = await client.balance();
    out.data({ stETH: stethBalance, protocol: "Lido" });
  },
});

export const lidoProtocol: ProtocolDefinition = {
  name: "lido",
  displayName: "Lido Staking",
  type: "staking",
  chains: ["ethereum"],
  requiresAuth: false,
  setup: () =>
    defineCommand({
      meta: { name: "lido", description: "Lido liquid staking" },
      subCommands: {
        stake: () => Promise.resolve(stake),
        rewards: () => Promise.resolve(rewards),
        balance: () => Promise.resolve(balance),
      },
    }),
};
