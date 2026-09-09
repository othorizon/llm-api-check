// Presentation helpers shared by the capability matrix and the exported share image:
// how a session's probes are grouped into rows and what the per-model highlights say.
import type { Dict } from "@/i18n/en";
import type { CapSession, CapSuiteId } from "@/lib/caps/types";
import { SUITE_ORDER, testsForSuites } from "@/lib/caps/registry";

/** Groups for the message-format suite (display only). */
export const MESSAGE_GROUPS: Record<string, string[]> = {
  system: ["messages.multi_system_start", "messages.system_mid"],
  turns: ["messages.consecutive_user", "messages.consecutive_assistant", "messages.assistant_last"],
  tools: ["messages.tool_call_no_result", "messages.orphan_tool_result"],
  other: ["messages.content_parts"],
};

export function suitesInSession(session: CapSession): CapSuiteId[] {
  const present = new Set<CapSuiteId>();
  for (const s of SUITE_ORDER) if (session.config.suites[s] || s === "connectivity") present.add(s);
  return SUITE_ORDER.filter((s) => present.has(s));
}

export interface MatrixGroup {
  title: string;
  ids: string[];
}

/** Rows of the matrix, grouped by suite (or by message-format group), in display order. Empty groups are dropped. */
export function matrixGroups(session: CapSession, dict: Dict): MatrixGroup[] {
  const tests = testsForSuites(session.config.suites);
  const rowsFor = (suite: CapSuiteId) => tests.filter((x) => x.suite === suite).map((x) => x.id);
  const groups: MatrixGroup[] = [];
  if (session.kind === "messages") {
    groups.push({ title: dict.caps.suiteInfo.connectivity.name, ids: rowsFor("connectivity") });
    for (const [g, ids] of Object.entries(MESSAGE_GROUPS)) groups.push({ title: (dict.msgs.groups as Record<string, string>)[g], ids: ids.filter((id) => tests.some((x) => x.id === id)) });
  } else for (const s of suitesInSession(session)) groups.push({ title: dict.caps.suiteInfo[s].name, ids: rowsFor(s) });
  return groups.filter((g) => g.ids.length > 0);
}

export interface Highlight {
  tone: "good" | "warning" | "critical" | "neutral";
  text: string;
  /** Extra values rendered as their own (monospace) badges so long lists wrap instead of overflowing. */
  items?: string[];
}

export function highlightsFor(session: CapSession, modelId: string, dict: Dict): Highlight[] {
  const o = session.results[modelId]?.outcomes ?? {};
  const out: Highlight[] = [];
  const h = dict.caps.highlights;
  const st = (id: string) => o[id]?.status;
  if (st("reasoning.default") === "pass") out.push({ tone: "neutral", text: h.reasoning_on });
  else if (st("reasoning.default") === "fail") out.push({ tone: "neutral", text: h.reasoning_off });
  const tog = o["reasoning.toggle"];
  if (tog?.suggestions?.length) out.push({ tone: "good", text: h.toggle.replace("{dialect}", "").replace(/[:：]\s*$/, ""), items: tog.suggestions.map((x) => x.label) });
  const toolModes = [
    ["tools.auto", "auto"],
    ["tools.required", "required"],
    ["tools.named", "named"],
    ["tools.parallel", "parallel"],
    ["tools.streaming", "stream"],
  ].filter(([id]) => st(id) === "pass");
  if (o["tools.auto"]) out.push(toolModes.length ? { tone: "good", text: h.tools.replace("{modes}", toolModes.map((x) => x[1]).join(", ")) } : { tone: "critical", text: h.toolsNo });
  const structModes = [
    ["structured.json_object", "json_object"],
    ["structured.json_schema", "json_schema"],
    ["structured.json_schema_strict", "strict"],
    ["structured.json_schema_nested", "nested"],
  ].filter(([id]) => st(id) === "pass");
  if (o["structured.json_object"]) out.push(structModes.length ? { tone: "good", text: h.structured.replace("{modes}", structModes.map((x) => x[1]).join(", ")) } : { tone: "critical", text: h.structuredNo });
  if (o["vision.base64"]) out.push(st("vision.base64") === "pass" ? { tone: "good", text: h.vision } : { tone: "critical", text: h.visionNo });
  if (o["cache.auto"]) out.push(st("cache.auto") === "pass" ? { tone: "good", text: h.cache } : { tone: "warning", text: h.cacheNo });
  return out;
}
