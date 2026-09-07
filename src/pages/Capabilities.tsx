import { useT } from "@/i18n";
import { ClientOnly, Page } from "@/components/layout/AppShell";
import { ProbeWorkbench } from "@/components/capabilities/ProbeWorkbench";
import { CAPABILITY_SUITES, MESSAGE_SUITES } from "@/lib/caps/registry";
import { DEFAULT_CAP_CONFIG, DEFAULT_MESSAGES_CONFIG } from "@/lib/caps/types";

export function CapabilitiesPage() {
  const t = useT();
  return (
    <Page>
      <ClientOnly>
        <ProbeWorkbench kind="capability" suites={CAPABILITY_SUITES} defaults={DEFAULT_CAP_CONFIG} title={t.caps.title} subtitle={t.caps.subtitle} startLabel={t.caps.start} storageKey="wlcu:cap-config" />
      </ClientOnly>
    </Page>
  );
}

export function MessagesPage() {
  const t = useT();
  return (
    <Page>
      <ClientOnly>
        <ProbeWorkbench kind="messages" suites={MESSAGE_SUITES} defaults={DEFAULT_MESSAGES_CONFIG} title={t.msgs.title} subtitle={t.msgs.subtitle} startLabel={t.msgs.start} intro={t.msgs.intro} storageKey="wlcu:msgs-config" />
      </ClientOnly>
    </Page>
  );
}
