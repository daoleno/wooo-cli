import { defineCommand } from "citty";
import {
  encodeFunctionData,
  type Address,
  type Hash,
  erc20Abi,
  isAddress,
  maxUint256,
  parseAbi,
} from "viem";
import { confirmTransaction } from "../../core/confirm";
import { getActiveWalletPort } from "../../core/context";
import { resolveChainId } from "../../core/chain-ids";
import { getPublicClient } from "../../core/evm";
import {
  createApprovalStep,
  createExecutionPlan,
  createTransactionStep,
} from "../../core/execution-plan";
import { createOutput, resolveOutputOptions } from "../../core/output";
import type { ProtocolDefinition } from "../types";
import {
  AssetType,
  getPolymarketContractConfig,
  OrderType,
  type PolymarketAuthOptions,
  PolymarketClient,
  type PolymarketEventListParams,
  type PolymarketListParams,
  type PolymarketMarketListParams,
  type PolymarketSeriesListParams,
  type PolymarketTeamListParams,
  resolvePolymarketAddress,
  resolvePolymarketAuthOptions,
  Side,
} from "./client";

const ERC1155_ABI = parseAbi([
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
]);

const JSON_OUTPUT_ARGS = {
  json: { type: "boolean" as const, default: false },
  format: { type: "string" as const, default: "table" },
};

const WRITE_ARGS = {
  yes: { type: "boolean" as const, default: false },
  "dry-run": { type: "boolean" as const, default: false },
  ...JSON_OUTPUT_ARGS,
};

const POLYMARKET_AUTH_ARGS = {
  "signature-type": {
    type: "string" as const,
    description: "Polymarket signer mode: eoa, proxy, gnosis-safe",
    default: "eoa",
  },
  "funder-address": {
    type: "string" as const,
    description:
      "Polymarket profile or proxy address to fund orders from when using proxy or gnosis-safe mode",
    required: false,
  },
};

interface ApprovalTarget {
  address: Address;
  name: string;
}

function validatePositiveInteger(
  value: string | undefined,
  label: string,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`Error: ${label} must be a non-negative integer`);
    process.exit(1);
  }
  return parsed;
}

function validateOptionalPositiveInteger(
  value: string | undefined,
  label: string,
): number | undefined {
  if (!value) {
    return undefined;
  }
  return validatePositiveInteger(value, label, 0);
}

function validateAddress(
  value: string | undefined,
  label: string,
): Address | undefined {
  if (!value) {
    return undefined;
  }

  if (!isAddress(value)) {
    console.error(`Error: ${label} must be a valid EVM address`);
    process.exit(1);
  }

  return value;
}

function validateRequiredAddress(value: string, label: string): Address {
  const address = validateAddress(value, label);
  if (!address) {
    console.error(`Error: ${label} is required`);
    process.exit(1);
  }
  return address;
}

function validateTokenId(value: string, label = "Token ID"): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    console.error(`Error: ${label} must be a numeric string`);
    process.exit(1);
  }
  return normalized;
}

function validateConditionId(value: string, label = "Condition ID"): string {
  const normalized = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    console.error(`Error: ${label} must be a 32-byte hex string`);
    process.exit(1);
  }
  return normalized;
}

function validateSide(value: string): Side {
  const normalized = value.trim().toLowerCase();
  if (normalized === "buy") {
    return Side.BUY;
  }
  if (normalized === "sell") {
    return Side.SELL;
  }
  console.error('Error: side must be "buy" or "sell"');
  process.exit(1);
}

function validateAssetType(value: string): AssetType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "collateral") {
    return AssetType.COLLATERAL;
  }
  if (normalized === "conditional") {
    return AssetType.CONDITIONAL;
  }
  console.error('Error: asset type must be "collateral" or "conditional"');
  process.exit(1);
}

function validateOrderType<const TAllowed extends readonly OrderType[]>(
  value: string,
  allowed: TAllowed,
  label = "order type",
): TAllowed[number] {
  const normalized = value.trim().toUpperCase();
  const match = allowed.find((item) => item === normalized);
  if (!match) {
    console.error(
      `Error: ${label} must be one of ${allowed.map((item) => item.toString()).join(", ")}`,
    );
    process.exit(1);
  }
  return match;
}

function validateDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    console.error("Error: date must use YYYY-MM-DD format");
    process.exit(1);
  }
  return value.trim();
}

function validateNumberString(value: string, label: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Error: ${label} must be a positive number`);
    process.exit(1);
  }
  return parsed;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseTokenIds(value: string): string[] {
  return parseCsv(value).map((item, index) =>
    validateTokenId(item, `Token ID #${index + 1}`),
  );
}

function parseOrderIds(value: string): string[] {
  const ids = parseCsv(value);
  if (ids.length === 0) {
    console.error("Error: at least one order ID is required");
    process.exit(1);
  }
  return ids;
}

function emitData(
  args: { json?: boolean; format?: string },
  payload: unknown,
): void {
  const out = createOutput(resolveOutputOptions(args));
  out.data(payload);
}

function formatBoolean(value: boolean): string {
  return value ? "true" : "false";
}

async function mapTokenResults<T>(
  tokens: string,
  callback: (token: string) => Promise<T>,
): Promise<Array<{ token: string; value: T }>> {
  const tokenIds = parseTokenIds(tokens);
  return await Promise.all(
    tokenIds.map(async (token) => ({
      token,
      value: await callback(token),
    })),
  );
}

function readListParams(args: {
  ascending?: boolean;
  limit?: string;
  offset?: string;
  order?: string;
}): PolymarketListParams {
  return {
    limit: validatePositiveInteger(args.limit, "limit", 25),
    offset: validateOptionalPositiveInteger(args.offset, "offset"),
    order: args.order,
    ascending: Boolean(args.ascending),
  };
}

function getApprovalTargets(): ApprovalTarget[] {
  const resolved = getPolymarketContractConfig();
  return [
    { name: "CTF Exchange", address: resolved.exchange },
    { name: "Neg Risk Exchange", address: resolved.negRiskExchange },
    ...(resolved.negRiskAdapter
      ? [{ name: "Neg Risk Adapter", address: resolved.negRiskAdapter }]
      : []),
  ];
}

async function resolveAuth(args: {
  "signature-type"?: string;
  "funder-address"?: string;
}): Promise<PolymarketAuthOptions> {
  return resolvePolymarketAuthOptions(
    args["signature-type"],
    validateAddress(args["funder-address"], "funder address"),
  );
}

async function readApprovalStatus(address: Address) {
  const publicClient = getPublicClient("polygon");
  const contractConfig = getPolymarketContractConfig();
  const usdcAddress = contractConfig.collateral;
  const conditionalTokens = contractConfig.conditionalTokens;
  const targets = getApprovalTargets();

  return await Promise.all(
    targets.map(async (target) => {
      const [usdcAllowance, ctfApproved] = await Promise.all([
        publicClient.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, target.address],
        }),
        publicClient.readContract({
          address: conditionalTokens,
          abi: ERC1155_ABI,
          functionName: "isApprovedForAll",
          args: [address, target.address],
        }),
      ]);

      return {
        contract: target.name,
        address: target.address,
        usdcAllowance: usdcAllowance.toString(),
        ctfApproved,
      };
    }),
  );
}

const markets = defineCommand({
  meta: { name: "markets", description: "Query Polymarket markets" },
  subCommands: {
    list: () =>
      defineCommand({
        meta: { name: "list", description: "List Polymarket markets" },
        args: {
          active: { type: "boolean", required: false },
          closed: { type: "boolean", required: false },
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          order: { type: "string", required: false },
          ascending: { type: "boolean", default: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const params: PolymarketMarketListParams = {
            ...readListParams(args),
            active: args.active,
            closed: args.closed,
          };
          emitData(args, { markets: await client.listMarkets(params) });
        },
      }),
    get: () =>
      defineCommand({
        meta: { name: "get", description: "Get a market by ID or slug" },
        args: {
          id: {
            type: "positional",
            required: true,
            description: "Market ID or slug",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, await client.getMarket(args.id));
        },
      }),
    tags: () =>
      defineCommand({
        meta: { name: "tags", description: "Get tags for a market" },
        args: {
          id: { type: "positional", required: true, description: "Market ID" },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, {
            marketId: args.id,
            tags: await client.getMarketTags(args.id),
          });
        },
      }),
  },
});

const events = defineCommand({
  meta: { name: "events", description: "Query Polymarket events" },
  subCommands: {
    list: () =>
      defineCommand({
        meta: { name: "list", description: "List Polymarket events" },
        args: {
          active: { type: "boolean", required: false },
          closed: { type: "boolean", required: false },
          tag: { type: "string", required: false },
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          order: { type: "string", required: false },
          ascending: { type: "boolean", default: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const params: PolymarketEventListParams = {
            ...readListParams(args),
            active: args.active,
            closed: args.closed,
            tag: args.tag,
          };
          emitData(args, { events: await client.listEvents(params) });
        },
      }),
    get: () =>
      defineCommand({
        meta: { name: "get", description: "Get an event by ID or slug" },
        args: {
          id: {
            type: "positional",
            required: true,
            description: "Event ID or slug",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, await client.getEvent(args.id));
        },
      }),
    tags: () =>
      defineCommand({
        meta: { name: "tags", description: "Get tags for an event" },
        args: {
          id: { type: "positional", required: true, description: "Event ID" },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, {
            eventId: args.id,
            tags: await client.getEventTags(args.id),
          });
        },
      }),
  },
});

const tags = defineCommand({
  meta: { name: "tags", description: "Query Polymarket tags" },
  subCommands: {
    list: () =>
      defineCommand({
        meta: { name: "list", description: "List Polymarket tags" },
        args: {
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          ascending: { type: "boolean", default: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, { tags: await client.listTags(readListParams(args)) });
        },
      }),
    get: () =>
      defineCommand({
        meta: { name: "get", description: "Get a tag by ID or slug" },
        args: {
          id: {
            type: "positional",
            required: true,
            description: "Tag ID or slug",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, await client.getTag(args.id));
        },
      }),
    related: () =>
      defineCommand({
        meta: {
          name: "related",
          description: "Get related tag relationships for a Polymarket tag",
        },
        args: {
          id: { type: "positional", required: true, description: "Tag ID" },
          "omit-empty": { type: "boolean", default: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, {
            tagId: args.id,
            related: await client.getRelatedTagLinks(
              args.id,
              args["omit-empty"],
            ),
          });
        },
      }),
    "related-tags": () =>
      defineCommand({
        meta: {
          name: "related-tags",
          description: "Resolve related tag objects for a Polymarket tag",
        },
        args: {
          id: { type: "positional", required: true, description: "Tag ID" },
          "omit-empty": { type: "boolean", default: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, {
            tagId: args.id,
            tags: await client.getRelatedTags(args.id, args["omit-empty"]),
          });
        },
      }),
  },
});

const series = defineCommand({
  meta: { name: "series", description: "Query Polymarket series" },
  subCommands: {
    list: () =>
      defineCommand({
        meta: { name: "list", description: "List Polymarket series" },
        args: {
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          order: { type: "string", required: false },
          ascending: { type: "boolean", default: false },
          closed: { type: "boolean", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const params: PolymarketSeriesListParams = {
            ...readListParams(args),
            closed: args.closed,
          };
          emitData(args, { series: await client.listSeries(params) });
        },
      }),
    get: () =>
      defineCommand({
        meta: { name: "get", description: "Get a Polymarket series by ID" },
        args: {
          id: { type: "positional", required: true, description: "Series ID" },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, await client.getSeries(args.id));
        },
      }),
  },
});

const sports = defineCommand({
  meta: { name: "sports", description: "Query Polymarket sports metadata" },
  subCommands: {
    list: () =>
      defineCommand({
        meta: {
          name: "list",
          description: "List sports supported by Polymarket",
        },
        args: JSON_OUTPUT_ARGS,
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, { sports: await client.listSports() });
        },
      }),
    "market-types": () =>
      defineCommand({
        meta: {
          name: "market-types",
          description: "List Polymarket sports market type identifiers",
        },
        args: JSON_OUTPUT_ARGS,
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, await client.listSportMarketTypes());
        },
      }),
    teams: () =>
      defineCommand({
        meta: { name: "teams", description: "List sports teams" },
        args: {
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          order: { type: "string", required: false },
          ascending: { type: "boolean", default: false },
          league: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const params: PolymarketTeamListParams = {
            ...readListParams(args),
            league: args.league,
          };
          emitData(args, { teams: await client.listTeams(params) });
        },
      }),
  },
});

const data = defineCommand({
  meta: {
    name: "data",
    description: "Query Polymarket position and trading data",
  },
  subCommands: {
    positions: () =>
      defineCommand({
        meta: { name: "positions", description: "List open positions" },
        args: {
          address: { type: "string", required: false },
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const address = await resolvePolymarketAddress(args.address);
          emitData(args, {
            address,
            positions: await client.getPositions(address, {
              limit: validatePositiveInteger(args.limit, "limit", 25),
              offset: validateOptionalPositiveInteger(args.offset, "offset"),
            }),
          });
        },
      }),
    "closed-positions": () =>
      defineCommand({
        meta: {
          name: "closed-positions",
          description: "List closed positions",
        },
        args: {
          address: { type: "string", required: false },
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const address = await resolvePolymarketAddress(args.address);
          emitData(args, {
            address,
            positions: await client.getClosedPositions(address, {
              limit: validatePositiveInteger(args.limit, "limit", 25),
              offset: validateOptionalPositiveInteger(args.offset, "offset"),
            }),
          });
        },
      }),
    value: () =>
      defineCommand({
        meta: { name: "value", description: "Get total portfolio value" },
        args: {
          address: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const address = await resolvePolymarketAddress(args.address);
          emitData(args, await client.getValue(address));
        },
      }),
    traded: () =>
      defineCommand({
        meta: {
          name: "traded",
          description: "Get the number of unique markets traded by a wallet",
        },
        args: {
          address: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const address = await resolvePolymarketAddress(args.address);
          emitData(args, await client.getTraded(address));
        },
      }),
    trades: () =>
      defineCommand({
        meta: { name: "trades", description: "Get trade history" },
        args: {
          address: { type: "string", required: false },
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const address = await resolvePolymarketAddress(args.address);
          emitData(args, {
            address,
            trades: await client.getTrades(address, {
              limit: validatePositiveInteger(args.limit, "limit", 25),
              offset: validateOptionalPositiveInteger(args.offset, "offset"),
            }),
          });
        },
      }),
    activity: () =>
      defineCommand({
        meta: { name: "activity", description: "Get wallet activity" },
        args: {
          address: { type: "string", required: false },
          limit: { type: "string", default: "25" },
          offset: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const address = await resolvePolymarketAddress(args.address);
          emitData(args, {
            address,
            activity: await client.getActivity(address, {
              limit: validatePositiveInteger(args.limit, "limit", 25),
              offset: validateOptionalPositiveInteger(args.offset, "offset"),
            }),
          });
        },
      }),
    volume: () =>
      defineCommand({
        meta: { name: "volume", description: "Get live volume for an event" },
        args: {
          id: {
            type: "positional",
            required: true,
            description: "Polymarket event ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          emitData(args, await client.getLiveVolume(args.id));
        },
      }),
  },
});

const clob = defineCommand({
  meta: {
    name: "clob",
    description: "Polymarket CLOB market data and trading",
  },
  subCommands: {
    ok: () =>
      defineCommand({
        meta: { name: "ok", description: "Check CLOB health" },
        args: JSON_OUTPUT_ARGS,
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, await client.getOk());
        },
      }),
    time: () =>
      defineCommand({
        meta: { name: "time", description: "Get CLOB server time" },
        args: JSON_OUTPUT_ARGS,
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, { serverTime: await client.getServerTime() });
        },
      }),
    price: () =>
      defineCommand({
        meta: { name: "price", description: "Get price for a token" },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          side: { type: "string", required: true, description: "buy or sell" },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await client.getPrice(
              validateTokenId(args.token),
              validateSide(args.side),
            ),
          );
        },
      }),
    "batch-prices": () =>
      defineCommand({
        meta: {
          name: "batch-prices",
          description: "Get prices for multiple tokens",
        },
        args: {
          tokens: {
            type: "positional",
            required: true,
            description: "Comma-separated Polymarket token IDs",
          },
          side: { type: "string", required: true, description: "buy or sell" },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          const side = validateSide(args.side);
          emitData(
            args,
            await client.getPrices(
              parseTokenIds(args.tokens).map((token_id) => ({
                token_id,
                side,
              })),
            ),
          );
        },
      }),
    midpoint: () =>
      defineCommand({
        meta: {
          name: "midpoint",
          description: "Get midpoint price for a token",
        },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, await client.getMidpoint(validateTokenId(args.token)));
        },
      }),
    midpoints: () =>
      defineCommand({
        meta: {
          name: "midpoints",
          description: "Get midpoint prices for multiple tokens",
        },
        args: {
          tokens: {
            type: "positional",
            required: true,
            description: "Comma-separated Polymarket token IDs",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await mapTokenResults(args.tokens, async (token) =>
              client.getMidpoint(token),
            ),
          );
        },
      }),
    spread: () =>
      defineCommand({
        meta: { name: "spread", description: "Get bid-ask spread for a token" },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, await client.getSpread(validateTokenId(args.token)));
        },
      }),
    spreads: () =>
      defineCommand({
        meta: {
          name: "spreads",
          description: "Get bid-ask spreads for multiple tokens",
        },
        args: {
          tokens: {
            type: "positional",
            required: true,
            description: "Comma-separated Polymarket token IDs",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await mapTokenResults(args.tokens, async (token) =>
              client.getSpread(token),
            ),
          );
        },
      }),
    book: () =>
      defineCommand({
        meta: { name: "book", description: "Get order book for a token" },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await client.getOrderBook(validateTokenId(args.token)),
          );
        },
      }),
    books: () =>
      defineCommand({
        meta: {
          name: "books",
          description: "Get order books for multiple tokens",
        },
        args: {
          tokens: {
            type: "positional",
            required: true,
            description: "Comma-separated Polymarket token IDs",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await mapTokenResults(args.tokens, async (token) =>
              client.getOrderBook(token),
            ),
          );
        },
      }),
    "last-trade": () =>
      defineCommand({
        meta: {
          name: "last-trade",
          description: "Get last trade price for a token",
        },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await client.getLastTradePrice(validateTokenId(args.token)),
          );
        },
      }),
    "last-trades": () =>
      defineCommand({
        meta: {
          name: "last-trades",
          description: "Get last trade prices for multiple tokens",
        },
        args: {
          tokens: {
            type: "positional",
            required: true,
            description: "Comma-separated Polymarket token IDs",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await mapTokenResults(args.tokens, async (token) =>
              client.getLastTradePrice(token),
            ),
          );
        },
      }),
    market: () =>
      defineCommand({
        meta: {
          name: "market",
          description: "Get CLOB market metadata by condition ID",
        },
        args: {
          conditionId: {
            type: "positional",
            required: true,
            description: "Polymarket condition ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await client.getMarket(validateConditionId(args.conditionId)),
          );
        },
      }),
    markets: () =>
      defineCommand({
        meta: { name: "markets", description: "List CLOB markets" },
        args: {
          cursor: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, await client.getMarkets(args.cursor));
        },
      }),
    "sampling-markets": () =>
      defineCommand({
        meta: {
          name: "sampling-markets",
          description: "List reward-eligible CLOB markets",
        },
        args: {
          cursor: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, await client.getSamplingMarkets(args.cursor));
        },
      }),
    "simplified-markets": () =>
      defineCommand({
        meta: {
          name: "simplified-markets",
          description: "List simplified CLOB markets",
        },
        args: {
          cursor: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, await client.getSimplifiedMarkets(args.cursor));
        },
      }),
    "sampling-simplified-markets": () =>
      defineCommand({
        meta: {
          name: "sampling-simplified-markets",
          description: "List simplified reward-eligible CLOB markets",
        },
        args: {
          cursor: { type: "string", required: false },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(
            args,
            await client.getSamplingSimplifiedMarkets(args.cursor),
          );
        },
      }),
    "tick-size": () =>
      defineCommand({
        meta: {
          name: "tick-size",
          description: "Get minimum tick size for a token",
        },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, {
            token: validateTokenId(args.token),
            tickSize: await client.getTickSize(validateTokenId(args.token)),
          });
        },
      }),
    "fee-rate": () =>
      defineCommand({
        meta: {
          name: "fee-rate",
          description: "Get base fee rate for a token",
        },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, {
            token: validateTokenId(args.token),
            feeRateBps: await client.getFeeRateBps(validateTokenId(args.token)),
          });
        },
      }),
    "neg-risk": () =>
      defineCommand({
        meta: {
          name: "neg-risk",
          description: "Check whether a token is in a neg-risk market",
        },
        args: {
          token: {
            type: "positional",
            required: true,
            description: "Polymarket token ID",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient().createPublicClobClient();
          emitData(args, {
            token: validateTokenId(args.token),
            negRisk: await client.getNegRisk(validateTokenId(args.token)),
          });
        },
      }),
    orders: () =>
      defineCommand({
        meta: { name: "orders", description: "List authenticated open orders" },
        args: {
          market: { type: "string", required: false },
          asset: { type: "string", required: false },
          cursor: { type: "string", required: false },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.getOpenOrders(
              {
                market: args.market,
                asset_id: args.asset
                  ? validateTokenId(args.asset, "Asset token ID")
                  : undefined,
              },
              false,
              args.cursor,
            ),
          );
        },
      }),
    order: () =>
      defineCommand({
        meta: {
          name: "order",
          description: "Get a single authenticated order",
        },
        args: {
          orderId: {
            type: "positional",
            required: true,
            description: "Order ID",
          },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.getOrder(args.orderId));
        },
      }),
    balance: () =>
      defineCommand({
        meta: {
          name: "balance",
          description:
            "Get balance and allowance for collateral or conditional assets",
        },
        args: {
          "asset-type": {
            type: "string",
            required: true,
            description: "collateral or conditional",
          },
          token: {
            type: "string",
            required: false,
            description: "Conditional token ID",
          },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const assetType = validateAssetType(args["asset-type"]);
          if (assetType === AssetType.CONDITIONAL && !args.token) {
            console.error(
              "Error: --token is required for conditional balances",
            );
            process.exit(1);
          }
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.getBalanceAllowance({
              asset_type: assetType,
              token_id: args.token
                ? validateTokenId(args.token, "Conditional token ID")
                : undefined,
            }),
          );
        },
      }),
    trades: () =>
      defineCommand({
        meta: { name: "trades", description: "List authenticated trades" },
        args: {
          market: { type: "string", required: false },
          asset: { type: "string", required: false },
          cursor: { type: "string", required: false },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.getTradesPaginated(
              {
                market: args.market,
                asset_id: args.asset
                  ? validateTokenId(args.asset, "Asset token ID")
                  : undefined,
              },
              args.cursor,
            ),
          );
        },
      }),
    notifications: () =>
      defineCommand({
        meta: {
          name: "notifications",
          description: "List authenticated notifications",
        },
        args: {
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.getNotifications());
        },
      }),
    rewards: () =>
      defineCommand({
        meta: {
          name: "rewards",
          description: "List authenticated daily rewards",
        },
        args: {
          date: { type: "string", required: true, description: "YYYY-MM-DD" },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.getEarningsForUserForDay(validateDate(args.date)),
          );
        },
      }),
    earnings: () =>
      defineCommand({
        meta: {
          name: "earnings",
          description: "Get authenticated total earnings for a day",
        },
        args: {
          date: { type: "string", required: true, description: "YYYY-MM-DD" },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.getTotalEarningsForUserForDay(validateDate(args.date)),
          );
        },
      }),
    "earnings-markets": () =>
      defineCommand({
        meta: {
          name: "earnings-markets",
          description: "Get daily earnings with reward config context",
        },
        args: {
          date: { type: "string", required: true, description: "YYYY-MM-DD" },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.getUserEarningsAndMarketsConfig(
              validateDate(args.date),
            ),
          );
        },
      }),
    "reward-percentages": () =>
      defineCommand({
        meta: {
          name: "reward-percentages",
          description: "Get reward percentage configuration",
        },
        args: {
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.getRewardPercentages());
        },
      }),
    "current-rewards": () =>
      defineCommand({
        meta: {
          name: "current-rewards",
          description: "List current reward programs",
        },
        args: {
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.getCurrentRewards());
        },
      }),
    "market-reward": () =>
      defineCommand({
        meta: {
          name: "market-reward",
          description: "Get reward details for a market",
        },
        args: {
          conditionId: {
            type: "positional",
            required: true,
            description: "Polymarket condition ID",
          },
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.getRawRewardsForMarket(
              validateConditionId(args.conditionId),
            ),
          );
        },
      }),
    "account-status": () =>
      defineCommand({
        meta: {
          name: "account-status",
          description: "Check closed-only account mode",
        },
        args: {
          ...POLYMARKET_AUTH_ARGS,
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.getClosedOnlyMode());
        },
      }),
    "create-order": () =>
      defineCommand({
        meta: {
          name: "create-order",
          description: "Create and post a limit order",
        },
        args: {
          token: {
            type: "string",
            required: true,
            description: "Polymarket token ID",
          },
          side: { type: "string", required: true, description: "buy or sell" },
          price: { type: "string", required: true, description: "Limit price" },
          size: {
            type: "string",
            required: true,
            description: "Order size in shares",
          },
          "order-type": { type: "string", default: "GTC" },
          "post-only": { type: "boolean", default: false },
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          const token = validateTokenId(args.token);
          const side = validateSide(args.side);
          const price = validateNumberString(args.price, "price");
          const size = validateNumberString(args.size, "size");
          const orderType = validateOrderType(args["order-type"], [
            OrderType.GTC,
            OrderType.GTD,
          ] as const);

          const client = new PolymarketClient();
          const publicClob = client.createPublicClobClient();
          const tickSize = await publicClob.getTickSize(token);
          const negRisk = await publicClob.getNegRisk(token);

          const preview = {
            action: "Post Polymarket limit order",
            details: {
              token,
              side,
              price,
              size,
              orderType,
              tickSize,
              negRisk: formatBoolean(negRisk),
            },
          };

          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: `Post a Polymarket ${side.toLowerCase()} limit order`,
                group: "prediction",
                protocol: "polymarket",
                command: "create-order",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep("Sign CLOB order payload", {
                    token,
                    side,
                    orderType,
                    price,
                    size,
                  }),
                  createTransactionStep("Post order to Polymarket CLOB", {
                    token,
                    tickSize,
                    negRisk,
                  }),
                ],
              }),
            );
            return;
          }

          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.createAndPostOrder(
              {
                tokenID: token,
                side,
                price,
                size,
              },
              { tickSize, negRisk },
              orderType,
              false,
              args["post-only"],
            ),
          );
        },
      }),
    "market-order": () =>
      defineCommand({
        meta: {
          name: "market-order",
          description: "Create and post a market order",
        },
        args: {
          token: {
            type: "string",
            required: true,
            description: "Polymarket token ID",
          },
          side: { type: "string", required: true, description: "buy or sell" },
          amount: {
            type: "string",
            required: true,
            description: "Buy amount in collateral or sell amount in shares",
          },
          "order-type": { type: "string", default: "FOK" },
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          const token = validateTokenId(args.token);
          const side = validateSide(args.side);
          const amount = validateNumberString(args.amount, "amount");
          const orderType = validateOrderType(args["order-type"], [
            OrderType.FOK,
            OrderType.FAK,
          ] as const);

          const client = new PolymarketClient();
          const publicClob = client.createPublicClobClient();
          const tickSize = await publicClob.getTickSize(token);
          const negRisk = await publicClob.getNegRisk(token);

          const preview = {
            action: "Post Polymarket market order",
            details: {
              token,
              side,
              amount,
              orderType,
              tickSize,
              negRisk: formatBoolean(negRisk),
            },
          };

          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: `Post a Polymarket ${side.toLowerCase()} market order`,
                group: "prediction",
                protocol: "polymarket",
                command: "market-order",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep("Sign market order payload", {
                    token,
                    side,
                    amount,
                    orderType,
                  }),
                  createTransactionStep(
                    "Post market order to Polymarket CLOB",
                    {
                      token,
                      tickSize,
                      negRisk,
                    },
                  ),
                ],
              }),
            );
            return;
          }

          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.createAndPostMarketOrder(
              {
                tokenID: token,
                side,
                amount,
                orderType,
              },
              { tickSize, negRisk },
              orderType,
              false,
            ),
          );
        },
      }),
    cancel: () =>
      defineCommand({
        meta: { name: "cancel", description: "Cancel a single order" },
        args: {
          orderId: {
            type: "positional",
            required: true,
            description: "Order ID",
          },
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          const preview = {
            action: "Cancel Polymarket order",
            details: {
              orderId: args.orderId,
            },
          };
          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: "Cancel a Polymarket order",
                group: "prediction",
                protocol: "polymarket",
                command: "cancel",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep("Cancel order on Polymarket CLOB", {
                    orderId: args.orderId,
                  }),
                ],
              }),
            );
            return;
          }
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.cancelOrder({ orderID: args.orderId }));
        },
      }),
    "cancel-orders": () =>
      defineCommand({
        meta: { name: "cancel-orders", description: "Cancel multiple orders" },
        args: {
          orderIds: {
            type: "positional",
            required: true,
            description: "Comma-separated order IDs",
          },
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          const orderIds = parseOrderIds(args.orderIds);
          const preview = {
            action: "Cancel multiple Polymarket orders",
            details: {
              orders: orderIds.length,
            },
          };
          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: `Cancel ${orderIds.length} Polymarket orders`,
                group: "prediction",
                protocol: "polymarket",
                command: "cancel-orders",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep("Cancel orders on Polymarket CLOB", {
                    orders: orderIds.length,
                  }),
                ],
              }),
            );
            return;
          }
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.cancelOrders(orderIds));
        },
      }),
    "cancel-all": () =>
      defineCommand({
        meta: { name: "cancel-all", description: "Cancel all open orders" },
        args: {
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          const preview = {
            action: "Cancel all Polymarket orders",
            details: {},
          };
          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: "Cancel all open Polymarket orders",
                group: "prediction",
                protocol: "polymarket",
                command: "cancel-all",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep(
                    "Cancel all orders on Polymarket CLOB",
                    {},
                  ),
                ],
              }),
            );
            return;
          }
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(args, await authed.cancelAll());
        },
      }),
    "cancel-market": () =>
      defineCommand({
        meta: {
          name: "cancel-market",
          description: "Cancel all orders for a market or token",
        },
        args: {
          market: { type: "string", required: false },
          asset: { type: "string", required: false },
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          if (!args.market && !args.asset) {
            console.error("Error: provide at least one of --market or --asset");
            process.exit(1);
          }
          const preview = {
            action: "Cancel Polymarket orders by market filter",
            details: {
              market: args.market ?? "",
              asset: args.asset ?? "",
            },
          };
          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: "Cancel filtered Polymarket orders",
                group: "prediction",
                protocol: "polymarket",
                command: "cancel-market",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep(
                    "Cancel matching orders on Polymarket CLOB",
                    {
                      market: args.market ?? null,
                      asset: args.asset ?? null,
                    },
                  ),
                ],
              }),
            );
            return;
          }
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          emitData(
            args,
            await authed.cancelMarketOrders({
              market: args.market,
              asset_id: args.asset
                ? validateTokenId(args.asset, "Asset token ID")
                : undefined,
            }),
          );
        },
      }),
    "delete-notifications": () =>
      defineCommand({
        meta: {
          name: "delete-notifications",
          description: "Delete notifications by ID",
        },
        args: {
          ids: {
            type: "positional",
            required: true,
            description: "Comma-separated notification IDs",
          },
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          const ids = parseCsv(args.ids);
          const preview = {
            action: "Delete Polymarket notifications",
            details: {
              notifications: ids.length,
            },
          };
          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: `Delete ${ids.length} Polymarket notifications`,
                group: "prediction",
                protocol: "polymarket",
                command: "delete-notifications",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep(
                    "Delete notifications via Polymarket API",
                    {
                      notifications: ids.length,
                    },
                  ),
                ],
              }),
            );
            return;
          }
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          await authed.dropNotifications({ ids });
          emitData(args, { ok: true, deleted: ids.length });
        },
      }),
    "update-balance": () =>
      defineCommand({
        meta: {
          name: "update-balance",
          description: "Refresh balance allowance on Polymarket",
        },
        args: {
          "asset-type": {
            type: "string",
            required: true,
            description: "collateral or conditional",
          },
          token: {
            type: "string",
            required: false,
            description: "Conditional token ID",
          },
          ...POLYMARKET_AUTH_ARGS,
          ...WRITE_ARGS,
        },
        async run({ args }) {
          const assetType = validateAssetType(args["asset-type"]);
          if (assetType === AssetType.CONDITIONAL && !args.token) {
            console.error(
              "Error: --token is required for conditional balances",
            );
            process.exit(1);
          }
          const preview = {
            action: "Refresh Polymarket balance allowance",
            details: {
              assetType,
              token: args.token ?? "",
            },
          };
          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: "Refresh Polymarket balance allowance",
                group: "prediction",
                protocol: "polymarket",
                command: "update-balance",
                chain: "polygon",
                accountType: "evm",
                steps: [
                  createTransactionStep(
                    "Refresh balance allowance via Polymarket API",
                    {
                      assetType,
                      token: args.token ?? null,
                    },
                  ),
                ],
              }),
            );
            return;
          }
          const client = new PolymarketClient();
          const authed = await client.createAuthenticatedClobClient(
            await resolveAuth(args),
          );
          await authed.updateBalanceAllowance({
            asset_type: assetType,
            token_id: args.token
              ? validateTokenId(args.token, "Conditional token ID")
              : undefined,
          });
          emitData(args, { ok: true });
        },
      }),
  },
});

const approve = defineCommand({
  meta: {
    name: "approve",
    description: "Check or set Polymarket trading approvals",
  },
  subCommands: {
    check: () =>
      defineCommand({
        meta: {
          name: "check",
          description: "Check Polygon approvals required for Polymarket",
        },
        args: {
          address: {
            type: "string",
            required: false,
            description: "Wallet address",
          },
          ...JSON_OUTPUT_ARGS,
        },
        async run({ args }) {
          const address = args.address
            ? validateRequiredAddress(args.address, "address")
            : validateRequiredAddress(
                await resolvePolymarketAddress(),
                "address",
              );
          emitData(args, {
            address,
            approvals: await readApprovalStatus(address),
          });
        },
      }),
    set: () =>
      defineCommand({
        meta: {
          name: "set",
          description: "Approve Polymarket exchange contracts on Polygon",
        },
        args: WRITE_ARGS,
        async run({ args }) {
          const contractConfig = getPolymarketContractConfig();
          const targets = getApprovalTargets();
          const preview = {
            action: "Approve Polymarket exchange contracts",
            details: {
              chain: "polygon",
              targets: targets.length,
              collateral: contractConfig.collateral,
              conditionalTokens: contractConfig.conditionalTokens,
            },
          };

          const confirmed = await confirmTransaction(preview, args);
          if (!confirmed) {
            emitData(
              args,
              createExecutionPlan({
                summary: "Approve Polymarket trading contracts on Polygon",
                group: "prediction",
                protocol: "polymarket",
                command: "approve",
                chain: "polygon",
                accountType: "evm",
                steps: targets.flatMap((target) => [
                  createApprovalStep(`Approve USDC for ${target.name}`, {
                    token: contractConfig.collateral,
                    spender: target.address,
                    amount: maxUint256.toString(),
                  }),
                  createApprovalStep(
                    `Approve conditional tokens for ${target.name}`,
                    {
                      token: contractConfig.conditionalTokens,
                      operator: target.address,
                      approved: true,
                    },
                  ),
                ]),
              }),
            );
            return;
          }

          const walletPort = await getActiveWalletPort("evm");
          const publicClient = getPublicClient("polygon");
          const polygonChainId = resolveChainId("polygon");
          const results: Array<{
            contract: string;
            txHash: string;
            type: "erc20" | "erc1155";
          }> = [];

          for (const target of targets) {
            const approveHash = await walletPort.signAndSendTransaction(
              polygonChainId,
              {
                format: "evm-transaction",
                to: contractConfig.collateral,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [target.address, maxUint256],
                }),
              },
              {
                group: "prediction",
                protocol: "polymarket",
                command: "approve",
              },
              {
                action: `Approve collateral spend for ${target.name}`,
                details: {
                  contract: target.name,
                  token: contractConfig.collateral,
                  spender: target.address,
                },
              },
              {
                kind: "token-approval",
                token: contractConfig.collateral,
                spender: target.address,
                amount: maxUint256,
              },
            );
            await publicClient.waitForTransactionReceipt({
              hash: approveHash as Hash,
            });
            results.push({
              contract: target.name,
              txHash: approveHash,
              type: "erc20",
            });

            const approvalForAllHash = await walletPort.signAndSendTransaction(
              polygonChainId,
              {
                format: "evm-transaction",
                to: contractConfig.conditionalTokens,
                data: encodeFunctionData({
                  abi: ERC1155_ABI,
                  functionName: "setApprovalForAll",
                  args: [target.address, true],
                }),
              },
              {
                group: "prediction",
                protocol: "polymarket",
                command: "approve",
              },
              {
                action: `Approve conditional tokens for ${target.name}`,
                details: {
                  contract: target.name,
                  operator: target.address,
                  approved: true,
                },
              },
            );
            await publicClient.waitForTransactionReceipt({
              hash: approvalForAllHash as Hash,
            });
            results.push({
              contract: target.name,
              txHash: approvalForAllHash,
              type: "erc1155",
            });
          }

          emitData(args, {
            chain: "polygon",
            results,
          });
        },
      }),
  },
});

export const polymarketProtocol: ProtocolDefinition = {
  name: "polymarket",
  displayName: "Polymarket",
  type: "prediction",
  chains: ["polygon"],
  writeAccountType: "evm",
  setup: () =>
    defineCommand({
      meta: {
        name: "polymarket",
        description: "Polymarket prediction market protocol",
      },
      subCommands: {
        markets: () => Promise.resolve(markets),
        events: () => Promise.resolve(events),
        tags: () => Promise.resolve(tags),
        series: () => Promise.resolve(series),
        sports: () => Promise.resolve(sports),
        data: () => Promise.resolve(data),
        clob: () => Promise.resolve(clob),
        approve: () => Promise.resolve(approve),
      },
    }),
};
