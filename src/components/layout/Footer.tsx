import { useT } from "@/i18n";
import { REPO_URL } from "@/routes";
import { LLink } from "./LLink";
import { Logo } from "./Header";

export function Footer() {
  const t = useT();
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <Logo className="h-5 w-5 text-ink-2" />
          <span>{t.footer.madeWith}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <LLink to="/docs" className="hover:text-ink">
            {t.footer.docs}
          </LLink>
          <LLink to="/privacy" className="hover:text-ink">
            {t.footer.privacy}
          </LLink>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
            {t.footer.source}
          </a>
        </div>
      </div>
    </footer>
  );
}
