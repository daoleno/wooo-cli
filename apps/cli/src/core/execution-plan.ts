export type ExecutionPlanAccountType = "evm" | "exchange-api" | "solana";
export type ExecutionPlanStepKind = "approval" | "wrap" | "transaction";
export type ExecutionPlanDetailValue = boolean | number | string | null;

export interface ExecutionPlanStep {
  kind: ExecutionPlanStepKind;
  title: string;
  details: Record<string, ExecutionPlanDetailValue>;
}

export interface ExecutionPlan {
  kind: "execution-plan";
  version: 1;
  status: "dry-run";
  summary: string;
  operation: {
    group: string;
    protocol: string;
    command: string;
  };
  chain: string;
  accountType: ExecutionPlanAccountType;
  requiresConfirmation: true;
  write: true;
  steps: ExecutionPlanStep[];
  warnings: string[];
  metadata?: Record<string, unknown>;
}

interface CreateExecutionPlanOptions {
  summary: string;
  group: string;
  protocol: string;
  command: string;
  chain: string;
  accountType: ExecutionPlanAccountType;
  steps: ExecutionPlanStep[];
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

interface CreateExecutionPlanStepOptions {
  kind: ExecutionPlanStepKind;
  title: string;
  details: Record<string, ExecutionPlanDetailValue>;
}

export function createExecutionPlanStep(
  options: CreateExecutionPlanStepOptions,
): ExecutionPlanStep {
  return {
    kind: options.kind,
    title: options.title,
    details: options.details,
  };
}

export function createApprovalStep(
  title: string,
  details: Record<string, ExecutionPlanDetailValue>,
): ExecutionPlanStep {
  return createExecutionPlanStep({ kind: "approval", title, details });
}

export function createWrapStep(
  title: string,
  details: Record<string, ExecutionPlanDetailValue>,
): ExecutionPlanStep {
  return createExecutionPlanStep({ kind: "wrap", title, details });
}

export function createTransactionStep(
  title: string,
  details: Record<string, ExecutionPlanDetailValue>,
): ExecutionPlanStep {
  return createExecutionPlanStep({ kind: "transaction", title, details });
}

export function createExecutionPlan(
  options: CreateExecutionPlanOptions,
): ExecutionPlan {
  return {
    kind: "execution-plan",
    version: 1,
    status: "dry-run",
    summary: options.summary,
    operation: {
      group: options.group,
      protocol: options.protocol,
      command: options.command,
    },
    chain: options.chain,
    accountType: options.accountType,
    requiresConfirmation: true,
    write: true,
    steps: options.steps,
    warnings: options.warnings ?? [],
    metadata: options.metadata,
  };
}
