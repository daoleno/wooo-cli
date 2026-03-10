import { defineCommand } from "citty";
import {
  type Abi,
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  isAddress,
  parseAbi,
} from "viem";
import { getPublicClient } from "../../core/evm";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: { name: "call", description: "Call a read-only contract method" },
  args: {
    contract: {
      type: "positional",
      description: "Contract address",
      required: true,
    },
    signature: {
      type: "positional",
      description: 'Function signature (e.g. "balanceOf(address)(uint256)")',
      required: true,
    },
    callArgs: {
      type: "positional",
      description: "Function arguments (comma-separated)",
      required: false,
    },
    chain: { type: "string", default: "ethereum" },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));

    if (!isAddress(args.contract)) {
      console.error(`Invalid contract address: ${args.contract}`);
      process.exit(2);
    }

    const publicClient = getPublicClient(args.chain);

    // Parse human-readable signature like "balanceOf(address)(uint256)"
    const sig = args.signature;
    const inputMatch = sig.match(/^(\w+)\(([^)]*)\)/);
    if (!inputMatch) {
      console.error(
        `Invalid function signature: ${sig}. Example: "balanceOf(address)(uint256)"`,
      );
      process.exit(2);
    }

    const funcName = inputMatch[1];
    const inputTypes = inputMatch[2];

    // Extract return types if specified
    const returnMatch = sig.match(/\)\(([^)]*)\)$/);
    const returnTypes = returnMatch ? returnMatch[1] : "uint256";

    const abiStr = `function ${funcName}(${inputTypes}) view returns (${returnTypes})`;
    const abi = parseAbi([abiStr]) as unknown as Abi;

    // Parse call arguments
    const callArgs = args.callArgs
      ? args.callArgs.split(",").map((a: string) => a.trim())
      : [];

    const data = encodeFunctionData({
      abi,
      functionName: funcName,
      args: callArgs,
    });

    const result = await publicClient.call({
      to: args.contract as Address,
      data,
    });

    if (!result.data) {
      console.error("Call returned no data");
      process.exit(1);
    }

    const decoded = decodeFunctionResult({
      abi,
      functionName: funcName,
      data: result.data,
    });

    out.data({
      contract: args.contract,
      function: funcName,
      result: String(decoded),
      chain: args.chain,
    });
  },
});
