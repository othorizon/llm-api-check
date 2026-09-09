import { useT } from "@/i18n";
import { ClientOnly, Page } from "@/components/layout/AppShell";
import { ProbeHeader, ProbeWorkbench } from "@/components/capabilities/ProbeWorkbench";
import { CAPABILITY_SUITES, MESSAGE_SUITES } from "@/lib/caps/registry";
import { DEFAULT_CAP_CONFIG, DEFAULT_MESSAGES_CONFIG } from "@/lib/caps/types";

export function CapabilitiesPage() {
  const t = useT();
  return (
    <Page>
      <ProbeHeader title={t.caps.title} subtitle={t.caps.subtitle} />
      <ClientOnly>
        <ProbeWorkbench kind="capability" suites={CAPABILITY_SUITES} defaults={DEFAULT_CAP_CONFIG} startLabel={t.caps.start} storageKey="wlcu:cap-config" selectionKey="wlcu:cap-models" />
      </ClientOnly>
    </Page>
  );
}

export function MessagesPage() {
  const t = useT();
  return (
    <Page>
      <ProbeHeader title={t.msgs.title} subtitle={t.msgs.subtitle} intro={t.msgs.intro} />
      <ClientOnly>
        <ProbeWorkbench kind="messages" suites={MESSAGE_SUITES} defaults={DEFAULT_MESSAGES_CONFIG} startLabel={t.msgs.start} storageKey="wlcu:msgs-config" selectionKey="wlcu:msgs-models" />
      </ClientOnly>
    </Page>
  );
}
