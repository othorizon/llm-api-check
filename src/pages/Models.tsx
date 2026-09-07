import * as React from "react";
import { Boxes, Copy, Download, KeyRound, Pencil, Plus, Server, Trash2, Upload, Zap } from "lucide-react";
import { useT } from "@/i18n";
import { interpolate, useLocale } from "@/i18n/core";
import { ClientOnly, Page } from "@/components/layout/AppShell";
import { LLink } from "@/components/layout/LLink";
import { SectionTitle, EmptyState } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Popover, Tip } from "@/components/ui/Overlay";
import { Switch } from "@/components/ui/Toggle";
import { ProviderForm, CorsBadge } from "@/components/models/ProviderForm";
import { ModelForm } from "@/components/models/ModelForm";
import { providerLabel, useProviders } from "@/lib/store/providers";
import { setSecretsStorageKind, useSecrets } from "@/lib/store/secrets";
import { useSettings } from "@/lib/store/settings";
import { getPreset } from "@/lib/providers/presets";
import type { ModelConfig, ProviderConfig } from "@/lib/store/types";
import { sendBound } from "@/lib/llm/model-client";
import { toLlmError, type LlmError } from "@/lib/llm/errors";
import { downloadText } from "@/lib/utils/download";
import { useRun } from "@/lib/store/run";

export function describeError(err: LlmError, t: ReturnType<typeof useT>): string {
  const base = interpolate((t.errors as Record<string, string>)[err.kind] ?? t.errors.unknown, { status: err.status ?? "" });
  return err.providerMessage ? `${base} ${err.providerMessage}` : base;
}

function ConnectionTest({ model }: { model: ModelConfig }) {
  const t = useT();
  const [state, setState] = React.useState<{ status: "idle" | "running" | "ok" | "fail"; ms?: number; message?: string }>({ status: "idle" });
  const run = async () => {
    const { models, providers } = useProviders.getState();
    const m = models.find((x) => x.id === model.id) ?? model;
    const provider = providers.find((p) => p.id === m.providerId);
    if (!provider) return;
    const apiKey = useSecrets.getState().keys[provider.id] ?? "";
    setState({ status: "running" });
    try {
      const res = await sendBound({ model: m, provider, apiKey }, { messages: [{ role: "user", content: "Reply with OK." }] }, { maxTokens: 64 });
      setState({ status: "ok", ms: Math.round(res.timing.totalMs) });
    } catch (e) {
      const err = toLlmError(e);
      setState({ status: "fail", message: describeError(err, t) });
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Tip content={t.models.testHint}>
        <Button size="sm" variant="outline" onClick={run} loading={state.status === "running"}>
          <Zap className="h-3.5 w-3.5" /> {t.models.quickTest}
        </Button>
      </Tip>
      {state.status === "ok" ? <Badge tone="good">{interpolate(t.models.testOk, { ms: state.ms ?? 0 })}</Badge> : null}
      {state.status === "fail" ? (
        <Popover trigger={<button type="button" className="text-left"><Badge tone="critical">{t.models.testFail}</Badge></button>}>
          <p className="text-sm leading-6 text-ink-2">{state.message}</p>
        </Popover>
      ) : null}
    </div>
  );
}

function ImportExport() {
  const t = useT();
  const { providers, models, importAll } = useProviders();
  const keys = useSecrets((s) => s.keys);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [mode, setMode] = React.useState<"merge" | "replace">("merge");
  const [msg, setMsg] = React.useState<string | null>(null);
  const exportJson = (withKeys: boolean) => {
    if (withKeys && !confirm(t.models.exportWithKeysWarn)) return;
    const payload = { app: "which-llm-i-can-use", version: 1, exportedAt: new Date().toISOString(), providers, models, ...(withKeys ? { secrets: keys } : {}) };
    downloadText(`whichllm-models-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
  };
  const onFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.providers) && !Array.isArray(data.models)) throw new Error("bad");
      importAll({ providers: data.providers ?? [], models: data.models ?? [] }, mode);
      if (data.secrets && typeof data.secrets === "object") for (const [pid, k] of Object.entries(data.secrets)) if (typeof k === "string") useSecrets.getState().setKey(pid, k);
      setMsg(interpolate(t.models.importOk, { models: (data.models ?? []).length, providers: (data.providers ?? []).length }));
    } catch {
      setMsg(t.models.importFailed);
    }
  };
  return (
    <Popover
      align="end"
      trigger={
        <Button variant="outline" size="md">
          <Download className="h-4 w-4" /> {t.models.importExport}
        </Button>
      }
    >
      <div className="space-y-2">
        <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => exportJson(false)} disabled={!providers.length}>
          <Download className="h-3.5 w-3.5" /> {t.models.exportAll}
        </Button>
        <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => exportJson(true)} disabled={!providers.length}>
          <KeyRound className="h-3.5 w-3.5" /> {t.models.exportWithKeys}
        </Button>
        <div className="border-t border-border pt-2">
          <div className="mb-2 flex items-center gap-2 text-xs text-ink-2">
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} /> {t.models.importMerge}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> {t.models.importReplace}
            </label>
          </div>
          <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {t.models.importFile}
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
        {msg ? <p className="text-xs text-ink-2">{msg}</p> : null}
      </div>
    </Popover>
  );
}

function ModelsWorkbench() {
  const t = useT();
  const locale = useLocale();
  const { providers, models, removeProvider, removeModel, duplicateModel } = useProviders();
  const keys = useSecrets((s) => s.keys);
  const persistKeys = useSettings((s) => s.persistKeys);
  const setPersistKeys = useSettings((s) => s.setPersistKeys);
  const active = useRun((s) => s.active);
  const [providerForm, setProviderForm] = React.useState<{ open: boolean; provider?: ProviderConfig | null }>({ open: false });
  const [modelForm, setModelForm] = React.useState<{ open: boolean; model?: ModelConfig | null; providerId?: string }>({ open: false });

  return (
    <>
      <div className="-mt-4 mb-5 flex flex-wrap justify-end gap-2">
        <ImportExport />
        <Button variant="outline" onClick={() => setProviderForm({ open: true, provider: null })}>
          <Server className="h-4 w-4" /> {t.models.addProvider}
        </Button>
        <Button variant="primary" onClick={() => setModelForm({ open: true, model: null })} disabled={providers.length === 0}>
          <Plus className="h-4 w-4" /> {t.models.addModel}
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title={t.models.empty}
          hint={t.models.emptyHint}
          action={
            <Button variant="primary" onClick={() => setProviderForm({ open: true, provider: null })}>
              <Server className="h-4 w-4" /> {t.models.addProvider}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t.models.providers}</CardTitle>
                <Badge>{providers.length}</Badge>
              </CardHeader>
              <ul className="divide-y divide-border">
                {providers.map((p) => {
                  const preset = getPreset(p.presetId);
                  const hasKey = !!keys[p.id];
                  return (
                    <li key={p.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{providerLabel(p)}</span>
                            {p.name && p.name !== preset.name ? <Badge>{locale === "zh" && preset.nameZh ? preset.nameZh : preset.name}</Badge> : null}
                          </div>
                          <div className="mono mt-0.5 truncate text-xs text-muted" title={p.baseUrl}>
                            {p.baseUrl}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge tone={hasKey ? "good" : preset.requiresKey ? "warning" : "neutral"}>
                              <KeyRound className="h-3 w-3" /> {hasKey ? t.models.keySet : t.models.keyMissing}
                            </Badge>
                            <CorsBadge presetId={p.presetId} />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Tip content={t.models.addModel}>
                            <Button size="icon" variant="ghost" onClick={() => setModelForm({ open: true, model: null, providerId: p.id })} aria-label={t.models.addModel}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </Tip>
                          <Tip content={t.common.edit}>
                            <Button size="icon" variant="ghost" onClick={() => setProviderForm({ open: true, provider: p })} aria-label={t.common.edit}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Tip>
                          <Tip content={t.common.delete}>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={t.common.delete}
                              onClick={() => {
                                if (confirm(`${t.models.deleteProviderWarn}\n${t.common.confirmDelete}`)) {
                                  removeProvider(p.id);
                                  useSecrets.getState().removeKey(p.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </Tip>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <CardBody className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{t.models.keyStorage}</div>
                  <div className="text-xs leading-5 text-muted">{t.models.keyStorageHint}</div>
                </div>
                <Switch
                  checked={persistKeys}
                  onCheckedChange={(v) => {
                    setPersistKeys(v);
                    setSecretsStorageKind(v ? "local" : "session");
                  }}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.models.modelsList}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge>{models.length}</Badge>
                {models.length ? (
                  <LLink to="/performance">
                    <Button size="sm" variant="primary" disabled={!!active}>
                      {t.nav.performance} →
                    </Button>
                  </LLink>
                ) : null}
              </div>
            </CardHeader>
            {models.length === 0 ? (
              <CardBody>
                <EmptyState
                  title={t.models.empty}
                  hint={t.models.emptyHint}
                  action={
                    <Button variant="primary" onClick={() => setModelForm({ open: true, model: null })}>
                      <Plus className="h-4 w-4" /> {t.models.addModel}
                    </Button>
                  }
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {models.map((m) => {
                  const p = providers.find((x) => x.id === m.providerId);
                  const extra = Object.keys(m.extraBody ?? {});
                  return (
                    <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{m.label || m.model}</span>
                          {m.label && m.label !== m.model ? <span className="mono text-xs text-muted">{m.model}</span> : null}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {providerLabel(p)} · <span className="mono">{m.maxTokensParam}</span>
                          {m.notes ? <> · {m.notes}</> : null}
                        </div>
                        {extra.length ? (
                          <Tip content={<pre className="mono text-[11px]">{JSON.stringify(m.extraBody, null, 2)}</pre>}>
                            <span className="mt-1.5 inline-block">
                              <Badge tone="accent">extra: {extra.join(", ")}</Badge>
                            </span>
                          </Tip>
                        ) : null}
                        <div className="mt-2">
                          <ConnectionTest model={m} />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Tip content={t.common.duplicate}>
                          <Button size="icon" variant="ghost" onClick={() => duplicateModel(m.id)} aria-label={t.common.duplicate}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </Tip>
                        <Tip content={t.common.edit}>
                          <Button size="icon" variant="ghost" onClick={() => setModelForm({ open: true, model: m })} aria-label={t.common.edit}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Tip>
                        <Tip content={t.common.delete}>
                          <Button size="icon" variant="ghost" aria-label={t.common.delete} onClick={() => confirm(t.common.confirmDelete) && removeModel(m.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </Tip>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      <ProviderForm open={providerForm.open} onOpenChange={(o) => setProviderForm((s) => ({ ...s, open: o }))} provider={providerForm.provider} onSaved={(p) => providers.length === 0 && setModelForm({ open: true, model: null, providerId: p.id })} />
      <ModelForm open={modelForm.open} onOpenChange={(o) => setModelForm((s) => ({ ...s, open: o }))} model={modelForm.model} defaultProviderId={modelForm.providerId} />
    </>
  );
}

export function ModelsPage() {
  const t = useT();
  return (
    <Page>
      <SectionTitle title={t.models.title} subtitle={t.models.subtitle} />
      <ClientOnly>
        <ModelsWorkbench />
      </ClientOnly>
    </Page>
  );
}
