import type { CommandDef } from "citty";

export type ProtocolType =
  | "cex"
  | "dex"
  | "lending"
  | "staking"
  | "bridge"
  | "perps";

/** Maps protocol types to CLI group names */
export type ProtocolGroup = "cex" | "dex" | "defi" | "perps" | "bridge";

export const PROTOCOL_TYPE_TO_GROUP: Record<ProtocolType, ProtocolGroup> = {
  cex: "cex",
  dex: "dex",
  lending: "defi",
  staking: "defi",
  perps: "perps",
  bridge: "bridge",
};

export const PROTOCOL_GROUP_DESCRIPTIONS: Record<ProtocolGroup, string> = {
  cex: "Centralized exchanges (OKX, Binance, Bybit, ...)",
  dex: "Decentralized exchanges (Uniswap, Jupiter, ...)",
  defi: "DeFi protocols (Aave, Lido, Curve, ...)",
  perps: "Perpetual DEXs (Hyperliquid, GMX, ...)",
  bridge: "Cross-chain bridges (Stargate, ...)",
};

export interface ProtocolDefinition {
  name: string;
  displayName: string;
  type: ProtocolType;
  chains?: string[];
  requiresAuth: boolean;
  setup: () => CommandDef;
}
