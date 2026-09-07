import * as React from "react";
import { useSearchParams } from "react-router";
import { ChevronRight, Trash2, History } from "lucide-react";
import { useT } from "@/i18n";
import { interpolate, useLocale } from "@/i18n/core";
import { ClientOnly, Page } from "@/components/layout/AppShell";
import { SectionTitle, EmptyState } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { PerfSessionView } from "@/pages/Performance";
import { CapSessionView } from "@/components/capabilities/CapMatrix";
import { useResults, type Session } from "@/lib/store/results";
import { fmtDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

function statusPill(s: Session, t: ReturnType<typeof useT>) {
  if (s.status === "running") return <StatusPill status="running" label={t.common.running} compact />;
  if (s.status === "aborted") return <StatusPill status="skipped" label={t.common.aborted} compact />;
  if (s.status === "error") return <StatusPill status="error" label={t.common.error} compact />;
  return <StatusPill status="pass" label={t.common.done} compact />;
}

function ResultsWorkbench() {
  const t = useT();
  const locale = useLocale();
  const sessions = useResults((s) => s.sessions);
  const clear = useResults((s) => s.clear);
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = React.useState<string | null>(params.get("session"));
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const select = (id: string | null) => {
    setSelectedId(id);
    setParams(id ? { session: id } : {}, { replace: true });
  };

  if (sessions.length === 0) return <EmptyState icon={<History className="h-8 w-8" />} title={t.results.empty} hint={t.results.emptyHint} />;

  return (
    <>
      <div className="-mt-4 mb-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => confirm(t.results.clearAllConfirm) && (clear(), select(null))}>
          <Trash2 className="h-4 w-4" /> {t.results.clearAll}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="self-start overflow-hidden">
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {sessions.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => select(s.id)} className={cn("flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-surface-2", selected?.id === s.id && "bg-surface-2")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={s.kind === "performance" ? "accent" : s.kind === "messages" ? "neutral" : "outline"}>{t.results.kind[s.kind]}</Badge>
                      {statusPill(s, t)}
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{s.models.map((m) => m.label).join(", ")}</div>
                    <div className="text-xs text-muted">
                      {fmtDate(s.createdAt, locale === "zh" ? "zh-CN" : "en")} · {interpolate(t.results.modelsCount, { n: s.models.length })}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="min-w-0">
          {selected ? selected.kind === "performance" ? <PerfSessionView session={selected} /> : <CapSessionView session={selected} /> : <Card className="p-16 text-center text-sm text-ink-2">{t.results.emptyHint}</Card>}
        </div>
      </div>
    </>
  );
}

export function ResultsPage() {
  const t = useT();
  return (
    <Page>
      <SectionTitle title={t.results.title} subtitle={t.results.subtitle} />
      <ClientOnly>
        <ResultsWorkbench />
      </ClientOnly>
    </Page>
  );
}
