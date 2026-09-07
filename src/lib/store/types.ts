export interface ProviderConfig {
  id: string;
  presetId: string;
  /** Display name, defaults to preset name. */
  name: string;
  baseUrl: string;
  authHeader?: string;
  authPrefix?: string;
  extraHeaders: Record<string, string>;
  createdAt: number;
}

export interface ModelConfig {
  id: string;
  providerId: string;
  /** Model identifier sent as `model`. */
  model: string;
  /** Human label; defaults to model id. */
  label: string;
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  /** Extra JSON merged into every request body (e.g. { "thinking": { "type": "disabled" } }). */
  extraBody: Record<string, unknown>;
  /** Per-request timeout override (ms). */
  timeoutMs?: number;
  notes?: string;
  createdAt: number;
}

/** Frozen copy stored inside a result session so history survives edits/deletions. */
export interface ModelSnapshot {
  id: string;
  label: string;
  model: string;
  providerName: string;
  presetId: string;
  baseUrl: string;
  extraBody: Record<string, unknown>;
}

export function snapshotModel(m: ModelConfig, p: ProviderConfig | undefined): ModelSnapshot {
  return { id: m.id, label: m.label || m.model, model: m.model, providerName: p?.name ?? "?", presetId: p?.presetId ?? "custom", baseUrl: p?.baseUrl ?? "", extraBody: m.extraBody ?? {} };
}
