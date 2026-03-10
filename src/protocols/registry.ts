import { binanceProtocol } from "./binance/commands";
import { bybitProtocol } from "./bybit/commands";
import { hyperliquidProtocol } from "./hyperliquid/commands";
import { okxProtocol } from "./okx/commands";
import type { ProtocolDefinition } from "./types";

const protocols: ProtocolDefinition[] = [
  hyperliquidProtocol,
  okxProtocol,
  binanceProtocol,
  bybitProtocol,
];

export function registerProtocol(protocol: ProtocolDefinition): void {
  protocols.push(protocol);
}

export function getProtocol(name: string): ProtocolDefinition | undefined {
  return protocols.find((p) => p.name === name);
}

export function listProtocols(): ProtocolDefinition[] {
  return [...protocols];
}
