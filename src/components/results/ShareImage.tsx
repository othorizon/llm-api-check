import * as React from "react";
import { Check, ClipboardCopy, Download, Loader2 } from "lucide-react";
import { useT } from "@/i18n";
import { interpolate, useLocale } from "@/i18n/core";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Overlay";
import type { Session } from "@/lib/store/results";
import { sessionImageDoc } from "@/lib/results/image-model";
import { canvasToPngBlob, renderSessionImage } from "@/lib/results/image";
import { downloadBlob } from "@/lib/utils/download";

interface Rendered {
  url: string;
  blob: Blob;
  width: number;
  height: number;
}

function canCopyImages(): boolean {
  return typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function";
}

/** Renders the session as a share image, previews it, and offers download / copy. */
export function ShareImageDialog({ session, filename, open, onOpenChange }: { session: Session; filename: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const locale = useLocale();
  const [rendered, setRendered] = React.useState<Rendered | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url: string | null = null;
    setRendered(null);
    setFailed(false);
    setCopied(false);
    // Let the dialog paint its loading state before the (synchronous) canvas work.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const canvas = renderSessionImage(sessionImageDoc(session, t, locale));
          const blob = await canvasToPngBlob(canvas);
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setRendered({ url, blob, width: canvas.width, height: canvas.height });
        } catch (e) {
          console.error(e);
          if (!cancelled) setFailed(true);
        }
      })();
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, session, t, locale]);

  const copy = async () => {
    if (!rendered) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": rendered.blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* permission denied or unsupported — the download button still works */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t.results.imageDialogTitle} description={t.results.imageDialogHint} wide>
      <div className="space-y-4">
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-[#0d0d0d] p-2">
          {rendered ? (
            <img src={rendered.url} alt={t.results.imageDialogTitle} width={rendered.width} height={rendered.height} className="mx-auto block h-auto w-full max-w-[720px]" />
          ) : (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
              {failed ? null : <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {failed ? t.results.imageFailed : t.results.imageRendering}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!rendered} onClick={() => rendered && downloadBlob(filename, rendered.blob)}>
            <Download className="h-4 w-4" /> {t.results.imageDownload}
          </Button>
          {canCopyImages() ? (
            <Button variant="outline" disabled={!rendered} onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />} {copied ? t.common.copied : t.results.imageCopy}
            </Button>
          ) : null}
          {rendered ? <span className="tnum ml-auto text-xs text-muted">{interpolate(t.results.imageSize, { w: rendered.width, h: rendered.height })}</span> : null}
        </div>
      </div>
    </Dialog>
  );
}
