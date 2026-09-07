import * as React from "react";
import { Eye, EyeOff, ExternalLink, AlertTriangle } from "lucide-react";
import { LLink } from "@/components/layout/LLink";
import { addressSpaceOf } from "@/lib/llm/network";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/core";
import { interpolate } from "@/i18n/core";
import { Dialog } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PROVIDER_PRESETS, getPreset, type Region } from "@/lib/providers/presets";
import { useProviders } from "@/lib/store/providers";
import { useSecrets } from "@/lib/store/secrets";
import type { ProviderConfig } from "@/lib/store/types";

export function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}
export function headersToText(h: Record<string, string>): string {
  return Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function CorsBadge({ presetId }: { presetId: string }) {
  const t = useT();
  const cors = getPreset(presetId).cors;
  const tone = cors === "yes" || cors === "header" ? "good" : cors === "local" ? "accent" : "neutral";
  return (
    <Badge tone={tone} title={t.models.corsHelp}>
      {t.models.corsBadge[cors]}
    </Badge>
  );
}

/** Plain-http endpoint that an HTTPS page cannot call directly (loopback is exempt). */
export function httpBlockKind(baseUrl: string): "local" | "public" | null {
  try {
    if (typeof location !== "undefined" && location.protocol !== "https:") return null;
    const u = new URL(baseUrl);
    if (u.protocol !== "http:") return null;
    const space = addressSpaceOf(u.hostname);
    return space === "loopback" ? null : space;
  } catch {
    return null;
  }
}

export function HttpBadge({ baseUrl }: { baseUrl: string }) {
  const t = useT();
  const kind = httpBlockKind(baseUrl);
  if (!kind) return null;
  return (
    <Badge tone="warning" title={kind === "local" ? t.models.httpWarnLocal : t.models.httpWarnPublic}>
      <AlertTriangle className="h-3 w-3" /> {t.models.httpBadge}
    </Badge>
  );
}

export function HttpWarning({ baseUrl }: { baseUrl: string }) {
  const t = useT();
  const kind = httpBlockKind(baseUrl);
  if (!kind) return null;
  return (
    <div className="mt-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs leading-5 text-ink-2">
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-ink" />
        <div>
          <p className="font-medium text-ink">{kind === "local" ? t.models.httpWarnLocal : t.models.httpWarnPublic}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {t.models.httpOptions.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <LLink to="/docs/providers#http" className="mt-1 inline-block text-accent-ink underline underline-offset-2">
            {t.common.learnMore}
          </LLink>
        </div>
      </div>
    </div>
  );
}

export function ProviderForm({ open, onOpenChange, provider, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; provider?: ProviderConfig | null; onSaved?: (p: ProviderConfig) => void }) {
  const t = useT();
  const locale = useLocale();
  const { addProvider, updateProvider } = useProviders();
  const keys = useSecrets((s) => s.keys);
  const setKey = useSecrets((s) => s.setKey);
  const removeKey = useSecrets((s) => s.removeKey);

  const [presetId, setPresetId] = React.useState(provider?.presetId ?? "openai");
  const preset = getPreset(presetId);
  const [name, setName] = React.useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = React.useState(provider?.baseUrl ?? preset.baseUrl);
  const [apiKey, setApiKey] = React.useState(provider ? (keys[provider.id] ?? "") : "");
  const [showKey, setShowKey] = React.useState(false);
  const [authHeader, setAuthHeader] = React.useState(provider?.authHeader ?? preset.authHeader ?? "");
  const [authPrefix, setAuthPrefix] = React.useState(provider?.authPrefix ?? preset.authPrefix ?? "");
  const [extraHeaders, setExtraHeaders] = React.useState(headersToText(provider?.extraHeaders ?? preset.extraHeaders ?? {}));
  const [advanced, setAdvanced] = React.useState(!!(provider?.authHeader || Object.keys(provider?.extraHeaders ?? {}).length));

  React.useEffect(() => {
    if (!open) return;
    const p = provider ? getPreset(provider.presetId) : getPreset("openai");
    setPresetId(provider?.presetId ?? "openai");
    setName(provider?.name ?? "");
    setBaseUrl(provider?.baseUrl ?? p.baseUrl);
    setApiKey(provider ? (keys[provider.id] ?? "") : "");
    setAuthHeader(provider?.authHeader ?? p.authHeader ?? "");
    setAuthPrefix(provider?.authPrefix ?? p.authPrefix ?? "");
    setExtraHeaders(headersToText(provider?.extraHeaders ?? p.extraHeaders ?? {}));
    setAdvanced(!!(provider?.authHeader || Object.keys(provider?.extraHeaders ?? {}).length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider?.id]);

  const onPreset = (id: string) => {
    const p = getPreset(id);
    setPresetId(id);
    setBaseUrl(p.baseUrl);
    setAuthHeader(p.authHeader ?? "");
    setAuthPrefix(p.authPrefix ?? "");
    setExtraHeaders(headersToText(p.extraHeaders ?? {}));
    if (!provider) setName("");
  };

  const groups: { region: Region; label: string }[] = [
    { region: "global", label: t.models.presetGroups.global },
    { region: "cn", label: t.models.presetGroups.cn },
    { region: "local", label: t.models.presetGroups.local },
    { region: "custom", label: t.models.presetGroups.custom },
  ];
  const displayName = (id: string) => {
    const p = getPreset(id);
    return locale === "zh" && p.nameZh ? p.nameZh : p.name;
  };
  const valid = baseUrl.trim().length > 0 && /^https?:\/\//.test(baseUrl.trim());

  const save = () => {
    const data = { presetId, name: name.trim() || displayName(presetId), baseUrl: baseUrl.trim().replace(/\/+$/, ""), authHeader: authHeader.trim() || undefined, authPrefix: authHeader.trim() ? authPrefix : undefined, extraHeaders: parseHeaders(extraHeaders) };
    let saved: ProviderConfig;
    if (provider) {
      updateProvider(provider.id, data);
      saved = { ...provider, ...data };
    } else saved = addProvider(data);
    if (apiKey.trim()) setKey(saved.id, apiKey.trim());
    else removeKey(saved.id);
    onSaved?.(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={provider ? t.models.editProvider : t.models.addProvider}>
      <div className="space-y-4">
        <Field label={t.models.preset}>
          <Select value={presetId} onChange={(e) => onPreset(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g.region} label={g.label}>
                {PROVIDER_PRESETS.filter((p) => p.region === g.region).map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p.id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CorsBadge presetId={presetId} />
          {preset.keysUrl ? (
            <a href={preset.keysUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
              {t.models.getKey} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {preset.docsUrl ? (
            <a href={preset.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
              {t.models.docs} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        {preset.notes ? <p className="rounded-md bg-surface-2 px-3 py-2 text-xs leading-5 text-ink-2">{locale === "zh" ? preset.notes.zh : preset.notes.en}</p> : null}
        <Field label={t.models.baseUrl} hint={interpolate(t.models.baseUrlHint, { baseUrl: "{baseUrl}" })} error={baseUrl && !valid ? "http(s)://…" : undefined}>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} autoComplete="off" />
          <HttpWarning baseUrl={baseUrl} />
          {preset.altBaseUrls?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[{ label: "Default", url: preset.baseUrl }, ...preset.altBaseUrls].map((a) => (
                <button key={a.url} type="button" onClick={() => setBaseUrl(a.url)} className={`rounded-md border px-2 py-0.5 text-[11px] ${baseUrl === a.url ? "border-ink bg-ink text-bg" : "border-border text-ink-2 hover:bg-surface-2"}`}>
                  {a.label}
                </button>
              ))}
            </div>
          ) : null}
        </Field>
        <Field label={t.models.apiKey} hint={t.models.apiKeyHint} htmlFor="provider-api-key">
          <div className="relative">
            <Input id="provider-api-key" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={preset.requiresKey ? "sk-…" : t.common.optional} autoComplete="off" spellCheck={false} className="pr-10" />
            <button type="button" onClick={() => setShowKey((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" aria-label={showKey ? t.common.hide : t.common.show}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label={t.models.name} hint={t.common.optional}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={displayName(presetId)} />
        </Field>
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-xs text-accent-ink hover:underline">
          {advanced ? t.common.less : t.common.more} · {t.models.authHeader} / {t.models.extraHeaders}
        </button>
        {advanced ? (
          <div className="space-y-4 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.models.authHeader} hint={t.models.authHeaderHint}>
                <Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Authorization" spellCheck={false} />
              </Field>
              <Field label={t.models.authPrefix}>
                <Input value={authPrefix} onChange={(e) => setAuthPrefix(e.target.value)} placeholder="Bearer " spellCheck={false} />
              </Field>
            </div>
            <Field label={t.models.extraHeaders} hint={t.models.extraHeadersHint}>
              <Textarea value={extraHeaders} onChange={(e) => setExtraHeaders(e.target.value)} className="mono text-xs" rows={3} spellCheck={false} />
            </Field>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {t.common.save}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
