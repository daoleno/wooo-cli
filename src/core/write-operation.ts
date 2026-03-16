import { confirmTransaction, type TransactionPreview } from "./confirm";
import type { ExecutionPlan } from "./execution-plan";
import { createOutput, resolveOutputOptions } from "./output";

export interface WriteCommandArgs {
  yes?: boolean;
  "dry-run"?: boolean;
  json?: boolean;
  format?: string;
}

export interface WriteOperation<TPrepared, TAuth, TResult> {
  protocol: string;
  prepare: () => Promise<TPrepared>;
  createPreview: (prepared: TPrepared) => TransactionPreview;
  createPlan: (prepared: TPrepared) => ExecutionPlan;
  resolveAuth: () => Promise<TAuth>;
  execute: (prepared: TPrepared, auth: TAuth) => Promise<TResult>;
}

export interface WriteOperationRuntimeOptions<TPrepared, TResult> {
  formatPlan?: (plan: ExecutionPlan, prepared: TPrepared) => unknown;
  formatResult?: (result: TResult, prepared: TPrepared) => unknown;
}

export async function runPreparedWriteOperation<TPrepared, TAuth, TResult>(
  args: WriteCommandArgs,
  operation: WriteOperation<TPrepared, TAuth, TResult>,
  prepared: TPrepared,
  options: WriteOperationRuntimeOptions<TPrepared, TResult> = {},
): Promise<void> {
  const out = createOutput(resolveOutputOptions(args));
  const confirmed = await confirmTransaction(
    operation.createPreview(prepared),
    args,
  );

  if (!confirmed) {
    if (args["dry-run"]) {
      const plan = operation.createPlan(prepared);
      out.data(options.formatPlan ? options.formatPlan(plan, prepared) : plan);
    }
    return;
  }

  const auth = await operation.resolveAuth();
  const result = await operation.execute(prepared, auth);
  out.data(
    options.formatResult ? options.formatResult(result, prepared) : result,
  );
}

export async function runWriteOperation<TPrepared, TAuth, TResult>(
  args: WriteCommandArgs,
  operation: WriteOperation<TPrepared, TAuth, TResult>,
  options: WriteOperationRuntimeOptions<TPrepared, TResult> = {},
): Promise<void> {
  const prepared = await operation.prepare();
  await runPreparedWriteOperation(args, operation, prepared, options);
}
