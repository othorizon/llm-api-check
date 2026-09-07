import type { Dict } from "@/i18n/en";

export type PageKey = "home" | "models" | "performance" | "capabilities" | "messages" | "results" | "docs" | "docsCapabilities" | "docsProviders" | "privacy";
export type SeoKey = keyof Dict["meta"]["pages"];

export interface RouteDef {
  path: string;
  key: PageKey;
  seo: SeoKey;
  /** Pages that only make sense with client state render a skeleton on the server. */
  app?: boolean;
}

export const ROUTES: RouteDef[] = [
  { path: "/", key: "home", seo: "home" },
  { path: "/models", key: "models", seo: "models", app: true },
  { path: "/performance", key: "performance", seo: "performance", app: true },
  { path: "/capabilities", key: "capabilities", seo: "capabilities", app: true },
  { path: "/messages", key: "messages", seo: "messages", app: true },
  { path: "/results", key: "results", seo: "results", app: true },
  { path: "/docs", key: "docs", seo: "docs" },
  { path: "/docs/capabilities", key: "docsCapabilities", seo: "docsCapabilities" },
  { path: "/docs/providers", key: "docsProviders", seo: "docsProviders" },
  { path: "/privacy", key: "privacy", seo: "privacy" },
];

export const REPO_URL = "https://github.com/othorizon/which-llm-i-can-use";
