import type { ProtocolDefinition } from "./types";
import { hyperliquidProtocol } from "./hyperliquid/commands";

const protocols: ProtocolDefinition[] = [hyperliquidProtocol];

export function registerProtocol(protocol: ProtocolDefinition): void {
  protocols.push(protocol);
}

export function getProtocol(name: string): ProtocolDefinition | undefined {
  return protocols.find((p) => p.name === name);
}

export function listProtocols(): ProtocolDefinition[] {
  return [...protocols];
}
