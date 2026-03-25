import { aaveProtocol } from "./aave/commands";
import { binanceProtocol } from "./binance/commands";
import { bybitProtocol } from "./bybit/commands";
import { curveProtocol } from "./curve/commands";
import { hyperliquidProtocol } from "./hyperliquid/commands";
import { jupiterProtocol } from "./jupiter/commands";
import { lidoProtocol } from "./lido/commands";
import { lifiProtocol } from "./lifi/commands";
import { morphoProtocol } from "./morpho/commands";
import { mppProtocol } from "./mpp/commands";
import { okxProtocol } from "./okx/commands";
import { okxBridgeProtocol } from "./okx-bridge/commands";
import { polymarketProtocol } from "./polymarket/commands";
import {
  PROTOCOL_TYPE_TO_GROUP,
  type ProtocolDefinition,
  type ProtocolGroup,
} from "./types";
import { uniswapProtocol } from "./uniswap/commands";
import { x402Protocol } from "./x402/commands";

const protocols: ProtocolDefinition[] = [
  // CEX
  okxProtocol,
  binanceProtocol,
  bybitProtocol,
  // Perps DEX
  hyperliquidProtocol,
  // Prediction markets
  polymarketProtocol,
  // DEX
  uniswapProtocol,
  curveProtocol,
  jupiterProtocol,
  // Lending and staking
  aaveProtocol,
  morphoProtocol,
  lidoProtocol,
  // Payments
  mppProtocol,
  x402Protocol,
  // Bridge
  lifiProtocol,
  okxBridgeProtocol,
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
    prediction: [],
    pay: [],
  };
  for (const p of protocols) {
    const group = PROTOCOL_TYPE_TO_GROUP[p.type];
    groups[group].push(p);
  }
  return groups;
}
