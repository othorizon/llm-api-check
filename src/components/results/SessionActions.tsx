import * as React from "react";
import { Check, ClipboardCopy, Download, FileSpreadsheet, Trash2 } from "lucide-react";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/Button";
import type { Session } from "@/lib/store/results";
import { useResults } from "@/lib/store/results";
import { sessionToCsv, sessionToMarkdown } from "@/lib/results/export";
import { copyText, downloadText } from "@/lib/utils/download";
import { Tip } from "@/components/ui/Overlay";

export function SessionActions({ session, onDeleted }: { session: Session; onDeleted?: () => void }) {
  const t = useT();
  const remove = useResults((s) => s.remove);
  const [copied, setCopied] = React.useState(false);
  const stamp = new Date(session.createdAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `llmapicheck-${session.kind}-${stamp}`;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Tip content={t.results.exportJson}>
        <Button size="sm" variant="ghost" onClick={() => downloadText(`${base}.json`, JSON.stringify(session, null, 2))} aria-label={t.results.exportJson}>
          <Download className="h-4 w-4" /> JSON
        </Button>
      </Tip>
      <Tip content={t.results.exportCsv}>
        <Button size="sm" variant="ghost" onClick={() => downloadText(`${base}.csv`, sessionToCsv(session, t), "text/csv")} aria-label={t.results.exportCsv}>
          <FileSpreadsheet className="h-4 w-4" /> CSV
        </Button>
      </Tip>
      <Tip content={t.results.copyMarkdown}>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t.results.copyMarkdown}
          onClick={async () => {
            if (await copyText(sessionToMarkdown(session, t))) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />} {copied ? t.common.copied : "Markdown"}
        </Button>
      </Tip>
      {session.status !== "running" ? (
        <Tip content={t.results.deleteSession}>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t.results.deleteSession}
            onClick={() => {
              if (confirm(t.common.confirmDelete)) {
                remove(session.id);
                onDeleted?.();
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </Tip>
      ) : null}
    </div>
  );
}
