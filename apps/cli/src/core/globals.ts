import { CHAIN_HELP_TEXT_WITH_CONFIG_DEFAULT } from "./chain-ids";

export const globalArgs = {
  json: {
    type: "boolean" as const,
    description: "Force JSON output",
    default: false,
  },
  format: {
    type: "string" as const,
    description: "Output format: table, csv, json",
    default: "table",
  },
  chain: {
    type: "string" as const,
    description: CHAIN_HELP_TEXT_WITH_CONFIG_DEFAULT,
  },
  wallet: {
    type: "string" as const,
    description: "Specify wallet (default: active wallet)",
  },
  yes: {
    type: "boolean" as const,
    description: "Skip confirmations (agent-friendly)",
    default: false,
  },
  "dry-run": {
    type: "boolean" as const,
    description: "Preview without executing",
    default: false,
  },
  verbose: {
    type: "boolean" as const,
    description: "Show debug logs",
    default: false,
  },
  quiet: {
    type: "boolean" as const,
    description: "Suppress non-essential output",
    default: false,
  },
  config: {
    type: "string" as const,
    description: "Config directory path",
  },
};
