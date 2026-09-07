import { sendBound, targetFor, type BoundModel } from "@/lib/llm/model-client";
import { LlmError, toLlmError } from "@/lib/llm/errors";
import { testsForSuites } from "./registry";
import { msg, trimForStorage, type CapConfig, type CapContext, type CapModelResult, type CapOutcome, type CapTestDef } from "./types";

export interface CapProgress {
  modelId: string;
  testId: string | null;
  done: number;
  total: number;
}

export interface CapRunInput {
  config: CapConfig;
  models: BoundModel[];
  signal: AbortSignal;
  onOutcome: (modelId: string, outcome: CapOutcome) => void;
  onProgress: (p: CapProgress) => void;
  publicOrigin: string | null;
}

function skipped(test: CapTestDef, reason: ReturnType<typeof msg>): CapOutcome {
  return { testId: test.id, status: "skipped", summary: reason, evidence: { notes: [] }, durationMs: 0, startedAt: Date.now() };
}

async function runModel(bm: BoundModel, tests: CapTestDef[], input: CapRunInput): Promise<CapModelResult> {
  const outcomes = new Map<string, CapOutcome>();
  const order: string[] = [];
  const ctx: CapContext = {
    model: bm.model,
    target: targetFor(bm),
    signal: input.signal,
    outcomes,
    lang: input.config.lang,
    publicOrigin: input.publicOrigin,
    send: (req, opts = {}) => sendBound(bm, req, { signal: input.signal, retryOnRateLimit: true, ...opts }),
  };
  let gateFailed: CapOutcome | null = null;
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    if (input.signal.aborted) break;
    input.onProgress({ modelId: bm.model.id, testId: test.id, done: i, total: tests.length });
    let outcome: CapOutcome;
    const startedAt = Date.now();
    const t0 = performance.now();
    if (gateFailed) outcome = skipped(test, msg("cap.skipped_gate", { message: String(gateFailed.summary.params?.message ?? gateFailed.summary.code) }));
    else {
      const blocker = (test.dependsOn ?? []).map((d) => outcomes.get(d)).find((o) => o && (o.status === "error" || o.status === "skipped"));
      if (blocker) outcome = skipped(test, msg("cap.skipped_dependency", { test: blocker.testId }));
      else {
        try {
          const partial = await test.run(ctx);
          outcome = { ...partial, testId: test.id, durationMs: Math.round(performance.now() - t0), startedAt } as CapOutcome;
        } catch (e) {
          const err = toLlmError(e);
          if (err.kind === "aborted") break;
          outcome = { testId: test.id, status: "error", summary: msg("cap.error", { kind: err.kind, message: err.message }), evidence: { notes: [], error: err instanceof LlmError ? err.toJSON() : String(e) }, durationMs: Math.round(performance.now() - t0), startedAt };
        }
      }
    }
    outcome.evidence = trimForStorage(outcome.evidence);
    outcomes.set(test.id, outcome);
    order.push(test.id);
    input.onOutcome(bm.model.id, outcome);
    if (test.id === "connectivity.basic" && outcome.status === "error") {
      const kind = (outcome.evidence.error as any)?.kind;
      if (kind === "auth" || kind === "network" || kind === "not_found" || kind === "timeout") gateFailed = outcome;
    }
  }
  input.onProgress({ modelId: bm.model.id, testId: null, done: order.length, total: tests.length });
  return { modelId: bm.model.id, outcomes: Object.fromEntries(outcomes), order };
}

export async function runCapabilities(input: CapRunInput): Promise<Record<string, CapModelResult>> {
  const tests = testsForSuites(input.config.suites);
  const results: Record<string, CapModelResult> = {};
  const queue = [...input.models];
  const workers = Array.from({ length: Math.max(1, Math.min(input.config.concurrency, queue.length)) }, async () => {
    while (queue.length && !input.signal.aborted) {
      const bm = queue.shift()!;
      results[bm.model.id] = await runModel(bm, tests, input);
    }
  });
  await Promise.all(workers);
  return results;
}
