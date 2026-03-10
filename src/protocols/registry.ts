import { aaveProtocol } from "./aave/commands";
import { binanceProtocol } from "./binance/commands";
import { bybitProtocol } from "./bybit/commands";
import { hyperliquidProtocol } from "./hyperliquid/commands";
import { lidoProtocol } from "./lido/commands";
import { okxProtocol } from "./okx/commands";
import { uniswapProtocol } from "./uniswap/commands";
import {
  PROTOCOL_TYPE_TO_GROUP,
  type ProtocolDefinition,
  type ProtocolGroup,
} from "./types";

const protocols: ProtocolDefinition[] = [
  // CEX
  okxProtocol,
  binanceProtocol,
  bybitProtocol,
  // Perps DEX
  hyperliquidProtocol,
  // DEX
  uniswapProtocol,
  // DeFi (lending + staking)
  aaveProtocol,
  lidoProtocol,
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

/** Group protocols by their CLI group (cex, dex, defi, perps, bridge) */
export function listProtocolsByGroup(): Record<
  ProtocolGroup,
  ProtocolDefinition[]
> {
  const groups: Record<ProtocolGroup, ProtocolDefinition[]> = {
    cex: [],
    dex: [],
    defi: [],
    perps: [],
    bridge: [],
  };
  for (const p of protocols) {
    const group = PROTOCOL_TYPE_TO_GROUP[p.type];
    groups[group].push(p);
  }
  return groups;
}
