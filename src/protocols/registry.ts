import { aaveProtocol } from "./aave/commands";
import { binanceProtocol } from "./binance/commands";
import { bybitProtocol } from "./bybit/commands";
import { curveProtocol } from "./curve/commands";
import { hyperliquidProtocol } from "./hyperliquid/commands";
import { jupiterProtocol } from "./jupiter/commands";
import { lidoProtocol } from "./lido/commands";
import { okxProtocol } from "./okx/commands";
import {
  PROTOCOL_TYPE_TO_GROUP,
  type ProtocolDefinition,
  type ProtocolGroup,
} from "./types";
import { uniswapProtocol } from "./uniswap/commands";

const protocols: ProtocolDefinition[] = [
  // CEX
  okxProtocol,
  binanceProtocol,
  bybitProtocol,
  // Perps DEX
  hyperliquidProtocol,
  // DEX
  uniswapProtocol,
  curveProtocol,
  jupiterProtocol,
  // Lending and staking
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

/** Group protocols by their CLI group (cex, dex, lend, stake, perps, bridge) */
export function listProtocolsByGroup(): Record<
  ProtocolGroup,
  ProtocolDefinition[]
> {
  const groups: Record<ProtocolGroup, ProtocolDefinition[]> = {
    cex: [],
    dex: [],
    lend: [],
    stake: [],
    perps: [],
    bridge: [],
  };
  for (const p of protocols) {
    const group = PROTOCOL_TYPE_TO_GROUP[p.type];
    groups[group].push(p);
  }
  return groups;
}
