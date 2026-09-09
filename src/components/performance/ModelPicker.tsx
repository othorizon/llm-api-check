import * as React from "react";
import { useT } from "@/i18n";
import { providerLabel, useProviders } from "@/lib/store/providers";
import { useSecrets } from "@/lib/store/secrets";
import { getPreset } from "@/lib/providers/presets";
import { CheckRow } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LLink } from "@/components/layout/LLink";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { SeriesDot } from "@/components/ui/Misc";

/**
 * Model ids selected on a page, remembered in localStorage under `storageKey` so a reload keeps the
 * choice. Ids of models that no longer exist are dropped; when nothing usable is stored, the first
 * `fallback` models are selected.
 */
export function useModelSelection(storageKey: string, fallback: number) {
  const models = useProviders((s) => s.models);
  const [selected, setSelectedState] = React.useState<string[]>(() => {
    const ids = models.map((m) => m.id);
    try {
      const raw = localStorage.getItem(storageKey);
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(stored)) {
        const kept = stored.filter((id): id is string => typeof id === "string" && ids.includes(id));
        if (kept.length || stored.length === 0) return kept;
      }
    } catch {
      /* ignore */
    }
    return ids.slice(0, fallback);
  });
  const setSelected = React.useCallback(
    (ids: string[]) => {
      setSelectedState(ids);
      try {
        localStorage.setItem(storageKey, JSON.stringify(ids));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );
  // Drop models deleted meanwhile (keeps the array identity when nothing changed).
  React.useEffect(() => setSelectedState((s) => (s.every((id) => models.some((m) => m.id === id)) ? s : s.filter((id) => models.some((m) => m.id === id)))), [models]);
  return [selected, setSelected] as const;
}

export function ModelPicker({ selected, onChange, disabled }: { selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const t = useT();
  const { models, providers } = useProviders();
  const keys = useSecrets((s) => s.keys);
  const toggle = (id: string, on: boolean) => onChange(on ? [...selected, id] : selected.filter((x) => x !== id));
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle>{t.perf.selectModels}</CardTitle>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onChange(models.map((m) => m.id))} disabled={disabled || models.length === 0}>
            {t.common.selectAll}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={disabled || selected.length === 0}>
            {t.common.selectNone}
          </Button>
        </div>
      </CardHeader>
      <CardBody className="px-3 py-2">
        {models.length === 0 ? (
          <div className="px-2 py-4 text-sm text-ink-2">
            {t.perf.noModels}{" "}
            <LLink to="/models" className="text-accent-ink underline">
              {t.models.addModel}
            </LLink>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {models.map((m) => {
              const p = providers.find((x) => x.id === m.providerId);
              const needsKey = p ? getPreset(p.presetId).requiresKey && !keys[p.id] : false;
              const idx = selected.indexOf(m.id);
              return (
                <CheckRow
                  key={m.id}
                  checked={idx !== -1}
                  onCheckedChange={(v) => toggle(m.id, v)}
                  disabled={disabled}
                  label={
                    <span className="inline-flex items-center gap-2">
                      {idx !== -1 ? <SeriesDot index={idx} /> : <span className="inline-block h-2.5 w-2.5 rounded-full border border-border-strong" />}
                      {m.label || m.model}
                      {needsKey ? <Badge tone="warning">{t.models.keyMissing}</Badge> : null}
                    </span>
                  }
                  hint={
                    <span className="mono">
                      {providerLabel(p)} · {m.model}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
