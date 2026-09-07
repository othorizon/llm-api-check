import * as React from "react";
import { useT } from "@/i18n";
import { Dialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { getPreset } from "@/lib/providers/presets";
import { providerLabel, useProviders } from "@/lib/store/providers";
import { useSecrets } from "@/lib/store/secrets";
import type { ModelConfig } from "@/lib/store/types";
import { listModels } from "@/lib/llm/client";
import { toLlmError } from "@/lib/llm/errors";

export function ModelForm({ open, onOpenChange, model, defaultProviderId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; model?: ModelConfig | null; defaultProviderId?: string; onSaved?: (m: ModelConfig) => void }) {
  const t = useT();
  const { providers, addModel, updateModel } = useProviders();
  const keys = useSecrets((s) => s.keys);
  const [providerId, setProviderId] = React.useState(model?.providerId ?? defaultProviderId ?? providers[0]?.id ?? "");
  const provider = providers.find((p) => p.id === providerId);
  const preset = getPreset(provider?.presetId ?? "custom");
  const [modelId, setModelId] = React.useState(model?.model ?? "");
  const [label, setLabel] = React.useState(model?.label ?? "");
  const [maxTokensParam, setMaxTokensParam] = React.useState<ModelConfig["maxTokensParam"]>(model?.maxTokensParam ?? preset.maxTokensParam);
  const [extraBody, setExtraBody] = React.useState(model && Object.keys(model.extraBody ?? {}).length ? JSON.stringify(model.extraBody, null, 2) : "");
  const [timeout, setTimeoutS] = React.useState(model?.timeoutMs ? String(model.timeoutMs / 1000) : "180");
  const [notes, setNotes] = React.useState(model?.notes ?? "");
  const [fetched, setFetched] = React.useState<string[] | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const pid = model?.providerId ?? defaultProviderId ?? providers[0]?.id ?? "";
    setProviderId(pid);
    const pr = providers.find((p) => p.id === pid);
    setModelId(model?.model ?? "");
    setLabel(model?.label ?? "");
    setMaxTokensParam(model?.maxTokensParam ?? getPreset(pr?.presetId ?? "custom").maxTokensParam);
    setExtraBody(model && Object.keys(model.extraBody ?? {}).length ? JSON.stringify(model.extraBody, null, 2) : "");
    setTimeoutS(model?.timeoutMs ? String(model.timeoutMs / 1000) : "180");
    setNotes(model?.notes ?? "");
    setFetched(null);
    setFetchError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, model?.id, defaultProviderId]);

  let extraError: string | undefined;
  let extraParsed: Record<string, unknown> = {};
  if (extraBody.trim()) {
    try {
      const v = JSON.parse(extraBody);
      if (!v || typeof v !== "object" || Array.isArray(v)) extraError = t.models.extraBodyInvalid;
      else extraParsed = v;
    } catch {
      extraError = t.models.extraBodyInvalid;
    }
  }
  const valid = !!provider && modelId.trim().length > 0 && !extraError;

  const fetchList = async () => {
    if (!provider) return;
    setFetching(true);
    setFetchError(null);
    try {
      const list = await listModels({ baseUrl: provider.baseUrl, apiKey: keys[provider.id] ?? "", authHeader: provider.authHeader, authPrefix: provider.authPrefix, extraHeaders: provider.extraHeaders });
      setFetched(list);
    } catch (e) {
      const err = toLlmError(e);
      setFetchError(err.providerMessage ?? err.message);
    } finally {
      setFetching(false);
    }
  };

  const save = () => {
    if (!provider) return;
    const data = { providerId: provider.id, model: modelId.trim(), label: label.trim() || modelId.trim(), maxTokensParam, extraBody: extraParsed, timeoutMs: Math.max(5, Number(timeout) || 180) * 1000, notes: notes.trim() || undefined };
    let saved: ModelConfig;
    if (model) {
      updateModel(model.id, data);
      saved = { ...model, ...data };
    } else saved = addModel(data);
    onSaved?.(saved);
    onOpenChange(false);
  };

  const suggestions = fetched ?? preset.suggestedModels;
  const listId = React.useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={model ? t.models.editModel : t.models.addModel}>
      {providers.length === 0 ? (
        <p className="text-sm text-ink-2">{t.models.noProviders}</p>
      ) : (
        <div className="space-y-4">
          <Field label={t.models.selectProvider}>
            <Select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                const pr = providers.find((p) => p.id === e.target.value);
                setMaxTokensParam(getPreset(pr?.presetId ?? "custom").maxTokensParam);
                setFetched(null);
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {providerLabel(p)} · {p.baseUrl}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t.models.modelId}
            hint={fetchError ? `${t.models.fetchFailed}: ${fetchError}` : t.models.modelIdHint}
            right={
              <Button size="sm" variant="ghost" onClick={fetchList} loading={fetching} className="h-6 px-2 text-xs">
                {t.models.fetchModels}
              </Button>
            }
          >
            <Input list={listId} value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder={preset.suggestedModels[0] ?? "model-id"} spellCheck={false} autoComplete="off" />
            <datalist id={listId}>
              {suggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {suggestions.length ? (
              <div className="mt-1.5 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {suggestions.slice(0, 40).map((m) => (
                  <button key={m} type="button" onClick={() => setModelId(m)} className={`mono rounded-md border px-1.5 py-0.5 text-[11px] ${modelId === m ? "border-ink bg-ink text-bg" : "border-border text-ink-2 hover:bg-surface-2"}`}>
                    {m}
                  </button>
                ))}
              </div>
            ) : null}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.models.label} hint={t.models.labelHint}>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={modelId || t.common.optional} />
            </Field>
            <Field label={t.models.maxTokensParam} hint={t.models.maxTokensHint}>
              <Select value={maxTokensParam} onChange={(e) => setMaxTokensParam(e.target.value as ModelConfig["maxTokensParam"])}>
                <option value="max_tokens">max_tokens</option>
                <option value="max_completion_tokens">max_completion_tokens</option>
              </Select>
            </Field>
          </div>
          <Field label={t.models.extraBody} hint={t.models.extraBodyHint} error={extraError}>
            <Textarea value={extraBody} onChange={(e) => setExtraBody(e.target.value)} className="mono text-xs" rows={3} placeholder='{ "thinking": { "type": "disabled" } }' spellCheck={false} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.models.timeout}>
              <Input type="number" min={5} value={timeout} onChange={(e) => setTimeoutS(e.target.value)} />
            </Field>
            <Field label={t.models.notes}>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.common.optional} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" onClick={save} disabled={!valid}>
              {t.common.save}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
