import ansis from "ansis";
import { defineCommand } from "citty";
import { getActivePrivateKey } from "../../core/context";
import { createOutput, resolveOutputOptions } from "../../core/output";

interface SwapQuote {
  protocol: string;
  amountOut: string;
  price: number;
}

export default defineCommand({
  meta: {
    name: "swap",
    description: "Aggregated swap — auto-selects best route across DEXes",
  },
  args: {
    tokenIn: {
      type: "positional",
      description: "Token to sell (e.g. USDC, ETH)",
      required: true,
    },
    tokenOut: {
      type: "positional",
      description: "Token to buy (e.g. DAI, USDT)",
      required: true,
    },
    amount: {
      type: "positional",
      description: "Amount of tokenIn to swap",
      required: true,
    },
    chain: {
      type: "string",
      description: "Chain (default: ethereum, or solana)",
      default: "ethereum",
    },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const amount = Number.parseFloat(args.amount);
    const chain = args.chain;

    // Solana → Jupiter only
    if (chain === "solana") {
      const { JupiterClient } = await import(
        "../../protocols/jupiter/client"
      );
      const client = new JupiterClient();
      const quote = await client.quote(args.tokenIn, args.tokenOut, amount);

      if (args["dry-run"]) {
        out.data({
          action: "SWAP",
          bestRoute: "jupiter",
          tokenIn: args.tokenIn,
          tokenOut: args.tokenOut,
          amountIn: amount,
          amountOut: quote.outAmount,
          chain: "solana",
          status: "dry-run",
        });
        return;
      }

      if (!args.yes) {
        console.error(
          ansis.yellow(
            `⚠ Best route: Jupiter — ${amount} ${args.tokenIn} → ${quote.outAmount} ${args.tokenOut}. Use --yes to confirm.`,
          ),
        );
        process.exit(6);
      }

      const privateKey = await getActivePrivateKey();
      const authClient = new JupiterClient(privateKey);
      const result = await authClient.swap(
        args.tokenIn,
        args.tokenOut,
        amount,
      );
      out.data({ ...result, bestRoute: "jupiter" });
      return;
    }

    // EVM chains → compare Uniswap and Curve
    const quotes: SwapQuote[] = [];

    // Try Uniswap
    try {
      const { UniswapClient } = await import(
        "../../protocols/uniswap/client"
      );
      const uniClient = new UniswapClient(chain);
      const uniQuote = await uniClient.quote(
        args.tokenIn,
        args.tokenOut,
        amount,
      );
      quotes.push({
        protocol: "uniswap",
        amountOut: uniQuote.amountOut,
        price: uniQuote.price,
      });
    } catch {
      // Uniswap doesn't support this pair
    }

    // Try Curve
    try {
      const { CurveClient } = await import("../../protocols/curve/client");
      const curveClient = new CurveClient(chain);
      const curveQuote = await curveClient.quote(
        args.tokenIn,
        args.tokenOut,
        amount,
      );
      quotes.push({
        protocol: "curve",
        amountOut: curveQuote.amountOut,
        price: curveQuote.price,
      });
    } catch {
      // Curve doesn't support this pair
    }

    if (quotes.length === 0) {
      console.error(
        `No DEX route found for ${args.tokenIn} → ${args.tokenOut} on ${chain}`,
      );
      process.exit(1);
    }

    // Pick the best quote (highest output)
    quotes.sort(
      (a, b) => Number.parseFloat(b.amountOut) - Number.parseFloat(a.amountOut),
    );
    const best = quotes[0];

    if (args["dry-run"]) {
      out.data({
        action: "SWAP",
        bestRoute: best.protocol,
        tokenIn: args.tokenIn,
        tokenOut: args.tokenOut,
        amountIn: amount,
        amountOut: best.amountOut,
        chain,
        allQuotes: quotes,
        status: "dry-run",
      });
      return;
    }

    // Show comparison if multiple quotes
    if (quotes.length > 1) {
      console.error(ansis.dim("Route comparison:"));
      for (const q of quotes) {
        const marker = q === best ? ansis.green("★") : " ";
        console.error(
          `  ${marker} ${q.protocol.padEnd(10)} → ${q.amountOut} ${args.tokenOut}`,
        );
      }
    }

    if (!args.yes) {
      console.error(
        ansis.yellow(
          `⚠ Best route: ${best.protocol} — ${amount} ${args.tokenIn} → ${best.amountOut} ${args.tokenOut}. Use --yes to confirm.`,
        ),
      );
      process.exit(6);
    }

    const privateKey = await getActivePrivateKey();

    // Execute via best protocol
    if (best.protocol === "uniswap") {
      const { UniswapClient } = await import(
        "../../protocols/uniswap/client"
      );
      const client = new UniswapClient(chain, privateKey);
      const result = await client.swap(args.tokenIn, args.tokenOut, amount);
      out.data({ ...result, bestRoute: "uniswap" });
    } else {
      const { CurveClient } = await import("../../protocols/curve/client");
      const client = new CurveClient(chain, privateKey);
      const result = await client.swap(args.tokenIn, args.tokenOut, amount);
      out.data({ ...result, bestRoute: "curve" });
    }
  },
});
