import type { CommandDef } from "citty";

export interface ProtocolDefinition {
  name: string;
  displayName: string;
  type: "cex" | "dex" | "lending" | "staking" | "bridge" | "perps";
  chains?: string[];
  requiresAuth: boolean;
  setup: () => CommandDef;
}
