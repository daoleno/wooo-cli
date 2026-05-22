import { defineCommand } from "citty";
import { createOutput, resolveOutputOptions } from "../../core/output";
import { createOkxAgentClientFromConfig } from "../../services/okx-agent/client";
import {
  formatOkxAgentAmount,
  formatOkxAgentPercent,
  formatOkxAgentTimestamp,
  formatOkxAgentUsd,
} from "../../services/okx-agent/presentation";

const OKX_AGENT_INST_TYPES = new Set(["SPOT", "SWAP", "FUTURES"]);
const OKX_AGENT_DERIVATIVE_INST_TYPES = new Set(["SWAP", "FUTURES"]);

const OKX_AGENT_OI_BARS = {
  "1d": "1D",
  "1h": "1H",
  "4h": "4H",
  "5m": "5m",
  "15m": "15m",
} as const satisfies Record<string, string>;

const OKX_AGENT_FILTER_SORT = {
  change: "chg24hPct",
  chg24h: "chg24hPct",
  "chg24h%": "chg24hPct",
  chg24hPct: "chg24hPct",
  funding: "fundingRate",
  fundingRate: "fundingRate",
  last: "last",
  listed: "listTime",
  listTime: "listTime",
  "market-cap": "marketCapUsd",
  marketcap: "marketCapUsd",
  marketCapUsd: "marketCapUsd",
  oi: "oiUsd",
  oiUsd: "oiUsd",
  volume: "volUsd24h",
  volUsd24h: "volUsd24h",
} as const satisfies Record<string, string>;

const OKX_AGENT_OI_CHANGE_SORT = {
  last: "last",
  "oi-delta": "oiDeltaUsd",
  "oi-delta-pct": "oiDeltaPct",
  oiDeltaPct: "oiDeltaPct",
  oiDeltaUsd: "oiDeltaUsd",
  oiUsd: "oiUsd",
  volume: "volUsd24h",
  volUsd24h: "volUsd24h",
} as const satisfies Record<string, string>;

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseOptionalTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Expected a Unix millisecond timestamp, received: ${value}`,
    );
  }
  return parsed;
}

function resolveInstType(value: string, supported: Set<string>): string {
  const normalized = value.trim().toUpperCase();
  if (!supported.has(normalized)) {
    throw new Error(
      `Unsupported OKX Agent instrument type: ${value}. Use ${Array.from(supported).join(", ")}.`,
    );
  }
  return normalized;
}

function resolveOiBar(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const resolved =
    OKX_AGENT_OI_BARS[
      value.trim().toLowerCase() as keyof typeof OKX_AGENT_OI_BARS
    ];
  if (!resolved) {
    throw new Error(
      `Unsupported OKX Agent OI bar: ${value}. Use 5m, 15m, 1H, 4H, or 1D.`,
    );
  }
  return resolved;
}

function resolveSortOrder(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized !== "asc" && normalized !== "desc") {
    throw new Error(
      `Unsupported OKX Agent sort order: ${value}. Use asc or desc.`,
    );
  }
  return normalized;
}

function resolveFilterSort(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const resolved =
    OKX_AGENT_FILTER_SORT[value.trim() as keyof typeof OKX_AGENT_FILTER_SORT] ??
    OKX_AGENT_FILTER_SORT[
      value.trim().toLowerCase() as keyof typeof OKX_AGENT_FILTER_SORT
    ];
  if (!resolved) {
    throw new Error(
      `Unsupported OKX Agent filter sort: ${value}. Use last, chg24hPct, marketCapUsd, volUsd24h, fundingRate, oiUsd, or listTime.`,
    );
  }
  return resolved;
}

function resolveOiChangeSort(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const resolved =
    OKX_AGENT_OI_CHANGE_SORT[
      value.trim() as keyof typeof OKX_AGENT_OI_CHANGE_SORT
    ] ??
    OKX_AGENT_OI_CHANGE_SORT[
      value.trim().toLowerCase() as keyof typeof OKX_AGENT_OI_CHANGE_SORT
    ];
  if (!resolved) {
    throw new Error(
      `Unsupported OKX Agent OI change sort: ${value}. Use oiUsd, oiDeltaUsd, oiDeltaPct, volUsd24h, or last.`,
    );
  }
  return resolved;
}

export function okxAgentMarketFilterCommand() {
  return defineCommand({
    meta: {
      name: "filter",
      description:
        "Screen OKX instruments by price, volume, market cap, funding, and OI",
    },
    args: {
      instType: {
        type: "string",
        description: "SPOT, SWAP, or FUTURES",
        required: true,
      },
      baseCcy: { type: "string", description: "Base currency, e.g. BTC" },
      quoteCcy: {
        type: "string",
        description:
          "Quote currency list, e.g. USDT or USDT,USDC. Defaults to USDT for SPOT.",
      },
      settleCcy: {
        type: "string",
        description: "Settlement currency for derivatives, e.g. USDT",
      },
      instFamily: {
        type: "string",
        description: "Instrument family for derivatives, e.g. BTC-USD",
      },
      ctType: {
        type: "string",
        description: "Contract type for derivatives: linear or inverse",
      },
      minLast: { type: "string", description: "Minimum last price" },
      maxLast: { type: "string", description: "Maximum last price" },
      minChg24hPct: {
        type: "string",
        description: "Minimum 24h change %, e.g. -5",
      },
      maxChg24hPct: {
        type: "string",
        description: "Maximum 24h change %, e.g. 10",
      },
      minMarketCapUsd: {
        type: "string",
        description: "Minimum market cap in USD",
      },
      maxMarketCapUsd: {
        type: "string",
        description: "Maximum market cap in USD",
      },
      minVolUsd24h: {
        type: "string",
        description: "Minimum 24h volume in USD",
      },
      maxVolUsd24h: {
        type: "string",
        description: "Maximum 24h volume in USD",
      },
      minFundingRate: {
        type: "string",
        description: "Minimum funding rate for SWAP",
      },
      maxFundingRate: {
        type: "string",
        description: "Maximum funding rate for SWAP",
      },
      minOiUsd: { type: "string", description: "Minimum OI in USD" },
      maxOiUsd: { type: "string", description: "Maximum OI in USD" },
      sortBy: {
        type: "string",
        description:
          "Sort by last, chg24hPct, marketCapUsd, volUsd24h, fundingRate, oiUsd, or listTime",
      },
      sortOrder: {
        type: "string",
        description: "asc or desc",
      },
      limit: {
        type: "string",
        description: "Max rows to return (default from OKX: 20, max: 100)",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const instType = resolveInstType(args.instType, OKX_AGENT_INST_TYPES);
      const quoteCcy =
        args.quoteCcy ?? (instType === "SPOT" ? "USDT" : undefined);
      const client = await createOkxAgentClientFromConfig();
      const result = await client.marketFilter({
        baseCcy: args.baseCcy,
        ctType: args.ctType,
        instFamily: args.instFamily,
        instType,
        limit: parseOptionalInteger(args.limit),
        maxChg24hPct: args.maxChg24hPct,
        maxFundingRate: args.maxFundingRate,
        maxLast: args.maxLast,
        maxMarketCapUsd: args.maxMarketCapUsd,
        maxOiUsd: args.maxOiUsd,
        maxVolUsd24h: args.maxVolUsd24h,
        minChg24hPct: args.minChg24hPct,
        minFundingRate: args.minFundingRate,
        minLast: args.minLast,
        minMarketCapUsd: args.minMarketCapUsd,
        minOiUsd: args.minOiUsd,
        minVolUsd24h: args.minVolUsd24h,
        quoteCcy,
        settleCcy: args.settleCcy,
        sortBy: resolveFilterSort(args.sortBy),
        sortOrder: resolveSortOrder(args.sortOrder),
      });
      const rows = result.rows ?? [];

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-market",
          filters: {
            instType,
            quoteCcy,
            sortBy: resolveFilterSort(args.sortBy) ?? null,
            sortOrder: resolveSortOrder(args.sortOrder) ?? null,
          },
          result,
        });
        return;
      }

      if (rows.length === 0) {
        out.warn(`No OKX Agent market filter rows found for ${instType}.`);
        return;
      }

      out.data(`Total: ${result.total ?? rows.length}`);
      out.table(
        rows.map((row) => ({
          rank: row.rank ?? "",
          instId: row.instId ?? "",
          last: formatOkxAgentAmount(row.last, 8),
          chg24h: formatOkxAgentPercent(row.chg24hPct),
          volume24h: formatOkxAgentUsd(row.volUsd24h),
          oi: formatOkxAgentUsd(row.oiUsd),
          funding: row.fundingRate ?? "",
          marketCap: formatOkxAgentUsd(row.marketCapUsd),
          listed: formatOkxAgentTimestamp(row.listTime),
          sortVal: row.sortVal ?? "",
        })),
        {
          columns: [
            "rank",
            "instId",
            "last",
            "chg24h",
            "volume24h",
            "oi",
            "funding",
            "marketCap",
            "listed",
            "sortVal",
          ],
          title: "OKX Agent Market Filter",
        },
      );
    },
  });
}

export function okxAgentMarketOiHistoryCommand() {
  return defineCommand({
    meta: {
      name: "oi-history",
      description: "Get OKX OI history with bar-over-bar deltas",
    },
    args: {
      instId: {
        type: "positional",
        description: "Instrument ID, e.g. BTC-USDT-SWAP",
        required: true,
      },
      bar: {
        type: "string",
        description: "5m, 15m, 1H, 4H, or 1D (default from OKX: 1H)",
      },
      limit: {
        type: "string",
        description: "Data points to return (default from OKX: 50, max: 500)",
      },
      ts: {
        type: "string",
        description: "Return bars with timestamp <= this Unix ms timestamp",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const client = await createOkxAgentClientFromConfig();
      const result = await client.getOiHistory({
        bar: resolveOiBar(args.bar),
        instId: args.instId,
        limit: parseOptionalInteger(args.limit),
        ts: parseOptionalTimestamp(args.ts),
      });
      const rows = result.rows ?? [];

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-market",
          instId: args.instId,
          result,
        });
        return;
      }

      if (rows.length === 0) {
        out.warn(`No OKX OI history found for ${args.instId}.`);
        return;
      }

      out.table(
        rows.map((row) => ({
          time: formatOkxAgentTimestamp(row.ts),
          oiUsd: formatOkxAgentUsd(row.oiUsd),
          deltaUsd: formatOkxAgentUsd(row.oiDeltaUsd),
          deltaPct: formatOkxAgentPercent(row.oiDeltaPct),
          oiCont: formatOkxAgentAmount(row.oiCont),
          oi: formatOkxAgentAmount(row.oi),
          oiCcy: row.oiCcy ?? "",
        })),
        {
          columns: [
            "time",
            "oiUsd",
            "deltaUsd",
            "deltaPct",
            "oiCont",
            "oi",
            "oiCcy",
          ],
          title:
            `OKX OI History: ${result.instId ?? args.instId} ${result.bar ?? ""}`.trim(),
        },
      );
    },
  });
}

export function okxAgentMarketOiChangeCommand() {
  return defineCommand({
    meta: {
      name: "oi-change",
      description: "Find OKX derivatives with the largest OI changes",
    },
    args: {
      instType: {
        type: "string",
        description: "SWAP or FUTURES",
        required: true,
      },
      bar: {
        type: "string",
        description: "5m, 15m, 1H, 4H, or 1D (default from OKX: 1H)",
      },
      minOiUsd: {
        type: "string",
        description: "Minimum current OI in USD",
      },
      minVolUsd24h: {
        type: "string",
        description: "Minimum 24h volume in USD",
      },
      minAbsOiDeltaPct: {
        type: "string",
        description: "Minimum absolute OI change %, e.g. 1.0",
      },
      sortBy: {
        type: "string",
        description: "Sort by oiUsd, oiDeltaUsd, oiDeltaPct, volUsd24h, last",
      },
      sortOrder: {
        type: "string",
        description: "asc or desc",
      },
      limit: {
        type: "string",
        description: "Max rows to return (default from OKX: 20, max: 100)",
      },
      json: { type: "boolean", default: false },
      format: { type: "string", default: "table" },
    },
    async run({ args }) {
      const out = createOutput(resolveOutputOptions(args));
      const instType = resolveInstType(
        args.instType,
        OKX_AGENT_DERIVATIVE_INST_TYPES,
      );
      const client = await createOkxAgentClientFromConfig();
      const rows = await client.filterOiChange({
        bar: resolveOiBar(args.bar),
        instType,
        limit: parseOptionalInteger(args.limit),
        minAbsOiDeltaPct: args.minAbsOiDeltaPct,
        minOiUsd: args.minOiUsd,
        minVolUsd24h: args.minVolUsd24h,
        sortBy: resolveOiChangeSort(args.sortBy),
        sortOrder: resolveSortOrder(args.sortOrder),
      });

      if (args.json || args.format === "json") {
        out.data({
          provider: "okx-agent-market",
          instType,
          rows,
        });
        return;
      }

      if (rows.length === 0) {
        out.warn(`No OKX OI change rows found for ${instType}.`);
        return;
      }

      out.table(
        rows.map((row) => ({
          rank: row.rank ?? "",
          instId: row.instId ?? "",
          last: formatOkxAgentAmount(row.last, 8),
          oi: formatOkxAgentUsd(row.oiUsd),
          deltaUsd: formatOkxAgentUsd(row.oiDeltaUsd),
          deltaPct: formatOkxAgentPercent(row.oiDeltaPct),
          pxChg: formatOkxAgentPercent(row.pxChgPct),
          volume24h: formatOkxAgentUsd(row.volUsd24h),
          funding: row.fundingRate ?? "",
        })),
        {
          columns: [
            "rank",
            "instId",
            "last",
            "oi",
            "deltaUsd",
            "deltaPct",
            "pxChg",
            "volume24h",
            "funding",
          ],
          title: "OKX OI Change",
        },
      );
    },
  });
}
