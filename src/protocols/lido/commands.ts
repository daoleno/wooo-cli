import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { validateAmount } from "../../core/validation";
import { runWriteOperation } from "../../core/write-operation";
import type { ProtocolDefinition } from "../types";
import { LidoClient } from "./client";
import { createLidoStakeOperation } from "./operations";

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
    const amount = validateAmount(args.amount, "Stake amount");
    await runWriteOperation(
      args,
      createLidoStakeOperation({
        amount,
      }),
    );
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
  writeAccountType: "evm",
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
