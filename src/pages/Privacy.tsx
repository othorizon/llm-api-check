import * as React from "react";
import { Trash2 } from "lucide-react";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/core";
import { interpolate } from "@/i18n/core";
import { ClientOnly, Page } from "@/components/layout/AppShell";
import { SectionTitle } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Toggle";
import { PrivacyContent } from "@/content/privacy";
import { clearAllAppData, storageUsage } from "@/lib/store/storage";
import { useSettings } from "@/lib/store/settings";
import { setSecretsStorageKind, useSecrets } from "@/lib/store/secrets";
import { useProviders } from "@/lib/store/providers";
import { useResults } from "@/lib/store/results";

function DataControls() {
  const t = useT();
  const [usage, setUsage] = React.useState(() => storageUsage());
  const [wiped, setWiped] = React.useState(false);
  const persistKeys = useSettings((s) => s.persistKeys);
  const setPersistKeys = useSettings((s) => s.setPersistKeys);
  React.useEffect(() => {
    const id = setInterval(() => setUsage(storageUsage()), 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-8 rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">{t.privacy.persistKeys}</div>
          <div className="text-xs text-muted">{t.models.keyStorageHint}</div>
        </div>
        <Switch
          checked={persistKeys}
          onCheckedChange={(v) => {
            setPersistKeys(v);
            setSecretsStorageKind(v ? "local" : "session");
          }}
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
        <div className="text-sm text-ink-2">{interpolate(t.privacy.storageUsage, { kb: (usage.bytes / 1024).toFixed(1), n: usage.keys.length })}</div>
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            if (!confirm(t.common.confirmDelete)) return;
            useProviders.getState().reset();
            useResults.getState().clear();
            useSecrets.getState().clear();
            clearAllAppData();
            setUsage(storageUsage());
            setWiped(true);
          }}
        >
          <Trash2 className="h-4 w-4" /> {t.privacy.wipe}
        </Button>
      </div>
      {wiped ? <div className="mt-3 text-sm text-good-ink">{t.privacy.wiped}</div> : null}
    </div>
  );
}

export function PrivacyPage() {
  const t = useT();
  const locale = useLocale();
  return (
    <Page className="max-w-3xl">
      <SectionTitle title={t.privacy.title} subtitle={t.meta.pages.privacy.description} />
      <PrivacyContent locale={locale} />
      <ClientOnly skeleton={null}>
        <DataControls />
      </ClientOnly>
    </Page>
  );
}
