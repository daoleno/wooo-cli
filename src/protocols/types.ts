import type { CommandDef } from "citty";
import type { ExecutionPlanAccountType } from "../core/execution-plan";

export type ProtocolType =
  | "cex"
  | "dex"
  | "lending"
  | "staking"
  | "bridge"
  | "perps";

/** Maps protocol types to mutually exclusive CLI group names */
export type ProtocolGroup =
  | "cex"
  | "dex"
  | "lend"
  | "stake"
  | "perps"
  | "bridge";

export const PROTOCOL_TYPE_TO_GROUP: Record<ProtocolType, ProtocolGroup> = {
  cex: "cex",
  dex: "dex",
  lending: "lend",
  staking: "stake",
  perps: "perps",
  bridge: "bridge",
};

export const PROTOCOL_GROUP_DESCRIPTIONS: Record<ProtocolGroup, string> = {
  cex: "Centralized exchanges (OKX, Binance, Bybit, ...)",
  dex: "Decentralized exchanges and swap routers (Uniswap, Curve, Jupiter, ...)",
  lend: "Lending markets (Aave, Morpho, ...)",
  stake: "Staking protocols (Lido, ...)",
  perps: "Perpetual DEXs (Hyperliquid, ...)",
  bridge: "Cross-chain bridges",
};

export interface ProtocolManifest {
  name: string;
  displayName: string;
  type: ProtocolType;
  chains?: string[];
  writeAccountType?: ExecutionPlanAccountType;
  setup: () => CommandDef;
}

export type ProtocolDefinition = ProtocolManifest;
