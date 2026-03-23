import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { runWriteOperation } from "../../core/write-operation";
import type { ProtocolDefinition } from "../types";
import { MppClient } from "./client";
import { DEFAULT_MAX_DEPOSIT } from "./constants";
import { createMppCallOperation } from "./operations";

// --- Read Commands ---

const services = defineCommand({
  meta: { name: "services", description: "Browse MPP service directory" },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new MppClient();
    const serviceList = await client.listServices();
    if (serviceList.length === 0) {
      out.data({ message: "No services found in MPP directory." });
      return;
    }
    out.table(
      serviceList.map((s) => ({
        name: s.name,
        url: s.url,
        description: s.description ?? "",
      })),
      { columns: ["name", "url", "description"], title: "MPP Services" },
    );
  },
});

const balance = defineCommand({
  meta: {
    name: "balance",
    description: "View balance on Tempo chain (USD native)",
  },
  args: {
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const client = new MppClient();
    const result = await client.getBalance();
    out.data(result);
  },
});

// --- Write Commands ---

const call = defineCommand({
  meta: {
    name: "call",
    description: "Make an MPP-authenticated request (auto-handles 402)",
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
    "max-deposit": {
      type: "string",
      description: `Max payment amount in USD (default: ${DEFAULT_MAX_DEPOSIT})`,
      default: DEFAULT_MAX_DEPOSIT,
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    await runWriteOperation(
      args,
      createMppCallOperation({
        url: args.url,
        method: args.method,
        body: args.body,
        maxDeposit: args["max-deposit"],
      }),
    );
  },
});

// --- Protocol Definition ---

export const mppProtocol: ProtocolDefinition = {
  name: "mpp",
  displayName: "Machine Payments Protocol",
  type: "payments",
  chains: ["tempo"],
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: {
        name: "mpp",
        description: "Machine Payments Protocol (MPP)",
      },
      subCommands: {
        services: () => Promise.resolve(services),
        balance: () => Promise.resolve(balance),
        call: () => Promise.resolve(call),
      },
    }),
};
