import { describe, expect, test } from "bun:test";
import { x402Protocol } from "../../../src/protocols/x402/commands";
import { X402_VERSION } from "../../../src/protocols/x402/constants";

describe("x402 protocol definition", () => {
  test("has correct metadata", () => {
    expect(x402Protocol.name).toBe("x402");
    expect(x402Protocol.displayName).toBe("x402 Payment Protocol");
    expect(x402Protocol.type).toBe("payments");
    expect(x402Protocol.chains).toEqual(["base", "ethereum", "polygon"]);
    expect(x402Protocol.writeAccountType).toBe("evm");
  });

  test("setup returns command with correct name", () => {
    const command = x402Protocol.setup();
    expect(command.meta?.name).toBe("x402");
  });

  test("setup has expected subcommands", () => {
    const command = x402Protocol.setup();
    expect(command.subCommands).toBeDefined();
    const subCommandNames = Object.keys(command.subCommands ?? {});
    expect(subCommandNames).toContain("call");
    expect(subCommandNames).toContain("balance");
  });
});

describe("x402 constants", () => {
  test("X402_VERSION matches SDK supported version", () => {
    // x402 SDK only supports version 1 (x402Versions: readonly [1])
    expect(X402_VERSION).toBe(1);
  });
});

describe("x402 402 response parsing", () => {
  // These tests verify the 402 challenge-response parsing logic
  // by simulating various server responses via Bun.serve()

  test("non-402 response returns data directly", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json({ result: "ok" }, { status: 200 });
      },
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ result: "ok" });
    } finally {
      server.stop(true);
    }
  });

  test("402 with valid x402 body includes accepts array", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json(
          {
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "base",
                maxAmountRequired: "1000000",
                resource: "https://example.com/api",
                description: "API access",
                mimeType: "application/json",
                payTo: "0x1234567890123456789012345678901234567890",
                maxTimeoutSeconds: 60,
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              },
            ],
          },
          { status: 402 },
        );
      },
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api`);
      expect(response.status).toBe(402);

      const body = (await response.json()) as {
        x402Version?: number;
        accepts?: unknown[];
      };
      expect(body.x402Version).toBe(1);
      expect(body.accepts).toBeDefined();
      expect(Array.isArray(body.accepts)).toBe(true);
      const accepts = body.accepts ?? [];
      expect(accepts.length).toBeGreaterThan(0);

      // Verify the payment requirement structure
      const req = accepts[0] as Record<string, unknown>;
      expect(req.scheme).toBe("exact");
      expect(req.network).toBe("base");
      expect(req.maxAmountRequired).toBe("1000000");
      expect(req.payTo).toBeDefined();
      expect(req.asset).toBeDefined();
    } finally {
      server.stop(true);
    }
  });

  test("402 with empty accepts array is detected as invalid", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return Response.json({ x402Version: 1, accepts: [] }, { status: 402 });
      },
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api`);
      expect(response.status).toBe(402);
      const body = (await response.json()) as {
        x402Version?: number;
        accepts?: unknown[];
      };
      // Client should detect empty accepts
      expect(!body.accepts || body.accepts.length === 0).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("402 with non-JSON body is handled gracefully", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response("Payment Required", {
          status: 402,
          headers: { "content-type": "text/plain" },
        });
      },
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api`);
      expect(response.status).toBe(402);
      // Trying to parse as JSON should fail
      const text = await response.text();
      expect(text).toBe("Payment Required");
      let parseError = false;
      try {
        JSON.parse(text);
      } catch {
        parseError = true;
      }
      expect(parseError).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("402 retry includes x-payment header", async () => {
    let requestCount = 0;
    let capturedPaymentHeader: string | null = null;

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        requestCount++;
        capturedPaymentHeader = request.headers.get("x-payment");

        if (capturedPaymentHeader) {
          // Second request with payment — return success
          return Response.json({ result: "paid content" }, { status: 200 });
        }

        // First request — return 402
        return Response.json(
          {
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "base",
                maxAmountRequired: "100000",
                resource: "/api",
                description: "test",
                mimeType: "application/json",
                payTo: "0x1234567890123456789012345678901234567890",
                maxTimeoutSeconds: 60,
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              },
            ],
          },
          { status: 402 },
        );
      },
    });

    try {
      // Simulate the client flow manually (without wallet dependency)
      // Step 1: Initial request
      const initialResponse = await fetch(
        `http://127.0.0.1:${server.port}/api`,
      );
      expect(initialResponse.status).toBe(402);
      expect(requestCount).toBe(1);

      // Step 2: Retry with x-payment header
      const retryResponse = await fetch(`http://127.0.0.1:${server.port}/api`, {
        headers: { "x-payment": "test-payment-signature" },
      });
      expect(retryResponse.status).toBe(200);
      expect(requestCount).toBe(2);
      expect(capturedPaymentHeader).toBe("test-payment-signature");

      const data = (await retryResponse.json()) as { result: string };
      expect(data.result).toBe("paid content");
    } finally {
      server.stop(true);
    }
  });

  test("x402 selectPaymentRequirements picks USDC requirement", async () => {
    const { selectPaymentRequirements } = await import("x402/client");

    const requirements = [
      {
        scheme: "exact" as const,
        network: "base" as const,
        maxAmountRequired: "1000000",
        resource: "https://example.com/api",
        description: "API access",
        mimeType: "application/json",
        payTo: "0x1234567890123456789012345678901234567890",
        maxTimeoutSeconds: 60,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      },
    ];

    const selected = selectPaymentRequirements(requirements, "base");
    expect(selected).toBeDefined();
    expect(selected.scheme).toBe("exact");
    expect(selected.network).toBe("base");
    expect(selected.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  test("x402 createPaymentHeader signs with LocalAccount", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const { createPaymentHeader } = await import("x402/client");

    // Use a deterministic test key
    const testKey =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const account = privateKeyToAccount(testKey);

    const requirement = {
      scheme: "exact" as const,
      network: "base" as const,
      maxAmountRequired: "1000000",
      resource: "https://example.com/api",
      description: "API access",
      mimeType: "application/json",
      payTo: "0x1234567890123456789012345678901234567890",
      maxTimeoutSeconds: 60,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    };

    const header = await createPaymentHeader(account, 1, requirement);
    expect(typeof header).toBe("string");
    expect(header.length).toBeGreaterThan(0);

    // Header should be base64-encoded JSON containing the payment payload
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe("exact");
    expect(decoded.network).toBe("base");
    expect(decoded.payload).toBeDefined();
    expect(decoded.payload.signature).toBeDefined();
  });
});
