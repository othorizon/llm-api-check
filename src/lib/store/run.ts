import { create } from "zustand";
import type { BoundModel } from "@/lib/llm/model-client";
import { runPerformance, type LiveState, type PerfProgress } from "@/lib/perf/runner";
import { aggregate } from "@/lib/perf/runner";
import type { PerfConfig, PerfSession, RunSample } from "@/lib/perf/types";
import { runCapabilities, type CapProgress } from "@/lib/caps/runner";
import type { CapConfig, CapOutcome, CapSession, ProbeKind } from "@/lib/caps/types";
import { uid } from "@/lib/utils/id";
import { useProviders } from "./providers";
import { useSecrets } from "./secrets";
import { useResults } from "./results";
import { snapshotModel } from "./types";

interface ActiveRun {
  sessionId: string;
  kind: "performance" | "capability";
  controller: AbortController;
}

interface RunState {
  active: ActiveRun | null;
  perfProgress: PerfProgress | null;
  perfLive: LiveState | null;
  capProgress: Record<string, CapProgress>;
  startPerformance: (config: PerfConfig, modelIds: string[]) => Promise<string | null>;
  startCapabilities: (config: CapConfig, modelIds: string[], kind?: ProbeKind) => Promise<string | null>;
  stop: () => void;
}

export function bindModels(modelIds: string[]): BoundModel[] {
  const { models, providers } = useProviders.getState();
  const keys = useSecrets.getState().keys;
  const out: BoundModel[] = [];
  for (const id of modelIds) {
    const model = models.find((m) => m.id === id);
    if (!model) continue;
    const provider = providers.find((p) => p.id === model.providerId);
    if (!provider) continue;
    out.push({ model, provider, apiKey: keys[provider.id] ?? "" });
  }
  return out;
}

export function publicOrigin(): string | null {
  if (typeof location === "undefined") return null;
  const h = location.hostname;
  if (location.protocol !== "https:" || h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) return null;
  return location.origin;
}

export const useRun = create<RunState>()((set, get) => ({
  active: null,
  perfProgress: null,
  perfLive: null,
  capProgress: {},

  async startPerformance(config, modelIds) {
    if (get().active) return null;
    const bound = bindModels(modelIds);
    if (bound.length === 0) return null;
    const controller = new AbortController();
    const id = uid("perf");
    const session: PerfSession = {
      id,
      kind: "performance",
      createdAt: Date.now(),
      finishedAt: null,
      status: "running",
      config,
      models: bound.map((b) => snapshotModel(b.model, b.provider)),
      results: Object.fromEntries(bound.map((b) => [b.model.id, aggregate(b.model.id, [])])),
    };
    useResults.getState().upsert(session);
    set({ active: { sessionId: id, kind: "performance", controller }, perfProgress: null, perfLive: null });
    const samples: Record<string, RunSample[]> = Object.fromEntries(bound.map((b) => [b.model.id, []]));
    let lastFlush = 0;
    const flush = (force = false) => {
      const now = performance.now();
      if (!force && now - lastFlush < 250) return;
      lastFlush = now;
      useResults.getState().patch(id, (s) => ({ ...(s as PerfSession), results: Object.fromEntries(bound.map((b) => [b.model.id, aggregate(b.model.id, samples[b.model.id])])) }));
    };
    try {
      const results = await runPerformance({
        config,
        models: bound,
        signal: controller.signal,
        onSample: (sample) => {
          samples[sample.modelId].push(sample);
          flush(true);
        },
        onProgress: (p) => set({ perfProgress: p }),
        onLive: (l) => set({ perfLive: l }),
      });
      useResults.getState().patch(id, (s) => ({ ...(s as PerfSession), results, status: controller.signal.aborted ? "aborted" : "done", finishedAt: Date.now() }));
    } catch (e) {
      console.error(e);
      flush(true);
      useResults.getState().patch(id, (s) => ({ ...s, status: controller.signal.aborted ? "aborted" : "error", finishedAt: Date.now() }));
    } finally {
      set({ active: null, perfLive: null });
    }
    return id;
  },

  async startCapabilities(config, modelIds, kind = "capability") {
    if (get().active) return null;
    const bound = bindModels(modelIds);
    if (bound.length === 0) return null;
    const controller = new AbortController();
    const id = uid("cap");
    const session: CapSession = {
      id,
      kind,
      createdAt: Date.now(),
      finishedAt: null,
      status: "running",
      config,
      models: bound.map((b) => snapshotModel(b.model, b.provider)),
      results: Object.fromEntries(bound.map((b) => [b.model.id, { modelId: b.model.id, outcomes: {}, order: [] }])),
    };
    useResults.getState().upsert(session);
    set({ active: { sessionId: id, kind: "capability", controller }, capProgress: {} });
    try {
      const results = await runCapabilities({
        config,
        models: bound,
        signal: controller.signal,
        publicOrigin: publicOrigin(),
        onOutcome: (modelId, outcome: CapOutcome) => {
          useResults.getState().patch(id, (s) => {
            const cs = s as CapSession;
            const prev = cs.results[modelId] ?? { modelId, outcomes: {}, order: [] };
            return { ...cs, results: { ...cs.results, [modelId]: { ...prev, outcomes: { ...prev.outcomes, [outcome.testId]: outcome }, order: [...prev.order, outcome.testId] } } };
          });
        },
        onProgress: (p) => set((s) => ({ capProgress: { ...s.capProgress, [p.modelId]: p } })),
      });
      useResults.getState().patch(id, (s) => {
        const cs = s as CapSession;
        return { ...cs, results: { ...cs.results, ...results }, status: controller.signal.aborted ? "aborted" : "done", finishedAt: Date.now() };
      });
    } catch (e) {
      console.error(e);
      useResults.getState().patch(id, (s) => ({ ...s, status: controller.signal.aborted ? "aborted" : "error", finishedAt: Date.now() }));
    } finally {
      set({ active: null });
    }
    return id;
  },

  stop() {
    const a = get().active;
    if (a) a.controller.abort(new DOMException("Stopped by user", "AbortError"));
  },
}));
