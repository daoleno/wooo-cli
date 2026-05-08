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

interface ApprovalPlanOutput {
  chain: string;
  kind: string;
  operation: { command: string; protocol: string };
  steps: Array<{ kind: string; title: string }>;
}

describe("polymarket polygon anvil e2e", () => {
  test(
    "checks deposit wallet approvals and previews relayer approval batch",
    async () => {
      const harness = new PolygonAnvilHarness();
      await harness.start();

      try {
        const approvalsBefore = await harness.runJson<ApprovalStatusOutput>([
          "prediction",
          "polymarket",
          "approve",
          "check",
          "--deposit-wallet",
          harness.address,
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

        const approvalPlan = await harness.runJson<ApprovalPlanOutput>([
          "prediction",
          "polymarket",
          "approve",
          "set",
          "--dry-run",
        ]);

        expect(approvalPlan.kind).toBe("execution-plan");
        expect(approvalPlan.chain).toBe("polygon");
        expect(approvalPlan.operation.protocol).toBe("polymarket");
        expect(approvalPlan.operation.command).toBe("approve");
        expect(approvalPlan.steps.length).toBeGreaterThanOrEqual(4);
        expect(
          approvalPlan.steps.every((step) => step.kind === "approval"),
        ).toBe(true);
      } finally {
        await harness.stop();
      }
    },
    { timeout: 180_000 },
  );
});
