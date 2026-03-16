import { describe, expect, test } from "bun:test";
import { evaluateSignerPolicy } from "../../src/core/signer-policy";
import type { SignerCommandRequest } from "../../src/core/signer-protocol";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SPENDER_ADDRESS = "0x1111111111111111111111111111111111111111";
const TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";

function createEvmRequest(): Extract<
  SignerCommandRequest,
  { kind: "evm-write-contract" }
> {
  return {
    version: 1,
    kind: "evm-write-contract",
    wallet: {
      name: "policy-wallet",
      address: ZERO_ADDRESS,
      chain: "evm",
      authKind: "local-keystore",
    },
    origin: {
      group: "dex",
      protocol: "uniswap",
      command: "swap",
    },
    chainName: "arbitrum",
    contract: {
      address: SPENDER_ADDRESS,
      abi: [],
      functionName: "exactInputSingle",
    },
  };
}

describe("evaluateSignerPolicy", () => {
  test("denies unlimited approvals when policy forbids them", () => {
    const request = createEvmRequest();
    request.contract.functionName = "approve";
    request.approval = {
      token: TOKEN_ADDRESS,
      spender: SPENDER_ADDRESS,
      amount: 2n ** 256n - 1n,
    };

    const decision = evaluateSignerPolicy(request, {
      evm: {
        approvals: {
          denyUnlimited: true,
        },
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0]).toContain("Unlimited token approvals");
  });

  test("auto-approves allowed protocol and command within chain policy", () => {
    const request = createEvmRequest();

    const decision = evaluateSignerPolicy(request, {
      autoApprove: true,
      allowProtocols: ["uniswap"],
      allowCommands: ["swap"],
      evm: {
        allowChains: ["arbitrum"],
        allowFunctions: ["exactInputSingle"],
      },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.autoApprove).toBe(true);
  });

  test("denies expired policy windows", () => {
    const request = createEvmRequest();

    const decision = evaluateSignerPolicy(
      request,
      {
        autoApprove: true,
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
      new Date("2026-03-16T00:00:00.000Z"),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0]).toContain("expired");
  });

  test("denies hyperliquid leverage beyond the configured maximum", () => {
    const request: Extract<
      SignerCommandRequest,
      { kind: "hyperliquid-sign-l1-action" }
    > = {
      version: 1,
      kind: "hyperliquid-sign-l1-action",
      wallet: {
        name: "policy-wallet",
        address: ZERO_ADDRESS,
        chain: "evm",
        authKind: "local-keystore",
      },
      origin: {
        group: "perps",
        protocol: "hyperliquid",
        command: "long",
      },
      request: {
        action: {
          type: "updateLeverage",
        },
        context: {
          actionType: "updateLeverage",
          leverage: 8,
          symbol: "BTC/USDC:USDC",
        },
        nonce: 1,
      },
    };

    const decision = evaluateSignerPolicy(request, {
      hyperliquid: {
        allowActions: ["updateLeverage"],
        maxLeverage: 5,
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0]).toContain("exceeds policy maximum");
  });

  test("denies unsupported solana networks", () => {
    const request: Extract<
      SignerCommandRequest,
      { kind: "solana-send-versioned-transaction" }
    > = {
      version: 1,
      kind: "solana-send-versioned-transaction",
      wallet: {
        name: "sol-wallet",
        address: "11111111111111111111111111111111",
        chain: "solana",
        authKind: "command",
      },
      origin: {
        group: "dex",
        protocol: "jupiter",
        command: "swap",
      },
      network: "devnet",
      serializedTransactionBase64: "AQ==",
    };

    const decision = evaluateSignerPolicy(request, {
      solana: {
        allowNetworks: ["mainnet-beta"],
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0]).toContain("Solana network");
  });
});
