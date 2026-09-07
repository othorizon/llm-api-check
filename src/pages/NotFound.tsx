import { useT } from "@/i18n";
import { Page } from "@/components/layout/AppShell";
import { LLink } from "@/components/layout/LLink";
import { Button } from "@/components/ui/Button";

export function NotFoundPage() {
  const t = useT();
  return (
    <Page className="flex flex-col items-center py-24 text-center">
      <div className="mono text-6xl font-semibold text-muted">404</div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t.notFound.title}</h1>
      <p className="mt-2 text-ink-2">{t.notFound.body}</p>
      <LLink to="/" className="mt-6">
        <Button variant="primary">{t.notFound.home}</Button>
      </LLink>
    </Page>
  );
}
