import { Route, Routes, useLocation } from "react-router";
import { LocaleContext, LOCALES, localeFromPath, localizePath } from "./i18n/core";
import { ROUTES, type PageKey } from "./routes";
import { AppShell } from "./components/layout/AppShell";
import { TooltipProvider } from "./components/ui/Overlay";
import { HomePage } from "./pages/Home";
import { ModelsPage } from "./pages/Models";
import { PerformancePage } from "./pages/Performance";
import { CapabilitiesPage, MessagesPage } from "./pages/Capabilities";
import { ResultsPage } from "./pages/Results";
import { DocsPage, DocsCapabilitiesPage, DocsProvidersPage } from "./pages/Docs";
import { PrivacyPage } from "./pages/Privacy";
import { NotFoundPage } from "./pages/NotFound";

const PAGES: Record<PageKey, () => React.JSX.Element> = {
  home: HomePage,
  models: ModelsPage,
  performance: PerformancePage,
  capabilities: CapabilitiesPage,
  messages: MessagesPage,
  results: ResultsPage,
  docs: DocsPage,
  docsCapabilities: DocsCapabilitiesPage,
  docsProviders: DocsProvidersPage,
  privacy: PrivacyPage,
};

export function App() {
  const location = useLocation();
  const locale = localeFromPath(location.pathname);
  return (
    <LocaleContext.Provider value={locale}>
      <TooltipProvider>
        <AppShell>
          <Routes>
            {LOCALES.flatMap((loc) =>
              ROUTES.map((r) => {
                const Comp = PAGES[r.key];
                return <Route key={`${loc}${r.path}`} path={localizePath(r.path, loc)} element={<Comp />} />;
              }),
            )}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </TooltipProvider>
    </LocaleContext.Provider>
  );
}
