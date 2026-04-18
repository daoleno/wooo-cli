import { describe, expect, test } from "bun:test";
import { PolygonAnvilHarness } from "./anvil-harness";

interface ApprovalStatusOutput {
  address: string;
  approvals: Array<{
    address: string;
    contract: string;
    ctfApproved: boolean;
    collateralAllowance: string;
  }>;
}

interface ApprovalSetOutput {
  chain: string;
  results: Array<{
    contract: string;
    txHash: string;
    type: "erc20" | "erc1155";
  }>;
}

describe("polymarket polygon anvil e2e", () => {
  test(
    "checks and sets Polymarket trading approvals on a Polygon fork",
    async () => {
      const harness = new PolygonAnvilHarness();
      await harness.start();

      try {
        const approvalsBefore = await harness.runJson<ApprovalStatusOutput>([
          "prediction",
          "polymarket",
          "approve",
          "check",
        ]);

        expect(approvalsBefore.address).toBe(harness.address);
        expect(approvalsBefore.approvals.length).toBeGreaterThan(0);
        expect(
          approvalsBefore.approvals.every(
            (approval) =>
              approval.address.startsWith("0x") &&
              approval.contract.length > 0 &&
              approval.ctfApproved === false &&
              BigInt(approval.collateralAllowance) >= 0n,
          ),
        ).toBe(true);

        const approvalSet = await harness.runJson<ApprovalSetOutput>([
          "prediction",
          "polymarket",
          "approve",
          "set",
          "--yes",
        ]);

        expect(approvalSet.chain).toBe("polygon");
        expect(approvalSet.results.length).toBeGreaterThanOrEqual(4);
        expect(
          approvalSet.results.every(
            (result) =>
              result.contract.length > 0 &&
              result.txHash.match(/^0x[0-9a-fA-F]{64}$/) !== null,
          ),
        ).toBe(true);

        const approvalTypes = new Set(
          approvalSet.results.map((result) => result.type),
        );
        expect(approvalTypes.has("erc20")).toBe(true);
        expect(approvalTypes.has("erc1155")).toBe(true);

        const approvalsAfter = await harness.runJson<ApprovalStatusOutput>([
          "prediction",
          "polymarket",
          "approve",
          "check",
        ]);

        expect(approvalsAfter.address).toBe(harness.address);
        expect(approvalsAfter.approvals).toHaveLength(
          approvalsBefore.approvals.length,
        );
        const allowancesBefore = new Map(
          approvalsBefore.approvals.map((approval) => [
            approval.contract,
            BigInt(approval.collateralAllowance),
          ]),
        );
        expect(
          approvalsAfter.approvals.every(
            (approval) =>
              approval.ctfApproved === true &&
              BigInt(approval.collateralAllowance) >=
                (allowancesBefore.get(approval.contract) ?? 0n),
          ),
        ).toBe(true);
      } finally {
        await harness.stop();
      }
    },
    { timeout: 180_000 },
  );
});
