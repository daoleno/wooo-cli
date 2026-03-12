import { defineCommand } from "citty";
import { confirmTransaction } from "../../core/confirm";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount } from "../../core/validation";
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
    const amount = validateAmount(args.amount, "Stake amount");

    const confirmed = await confirmTransaction(
      {
        action: `Stake ${amount} ETH via Lido → ~${amount} stETH`,
        details: {
          amountETH: amount,
          estimatedStETH: amount,
          protocol: "Lido",
          chain: "ethereum",
        },
      },
      args,
    );

    if (!confirmed) {
      if (args["dry-run"]) {
        out.data({
          action: "STAKE",
          amountETH: amount,
          estimatedStETH: amount,
          protocol: "Lido",
          status: "dry-run",
        });
      }
      return;
    }

    const privateKey = await getActivePrivateKey("evm");
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
    const privateKey = await getActivePrivateKey("evm");
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
    const privateKey = await getActivePrivateKey("evm");
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
