import type { Dict } from "@/i18n/en";
import { formatMsg, testInfo } from "@/i18n";
import type { CapSession } from "@/lib/caps/types";
import type { PerfSession } from "@/lib/perf/types";
import type { Session } from "@/lib/store/results";
import { fmtMs, fmtNum, fmtPct } from "@/lib/utils/format";
import { SUITE_ORDER } from "@/lib/caps/registry";
import { REASONING_DIALECTS } from "@/lib/caps/reasoning-dialects";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function perfToCsv(s: PerfSession): string {
  const header = ["model", "provider", "mode", "cache", "index", "warmup", "ok", "error", "ttft_ms", "ttf_content_ms", "total_ms", "prompt_tokens", "completion_tokens", "reasoning_tokens", "cached_tokens", "tokens_estimated", "decode_tps", "e2e_tps", "chunks", "finish_reason", "started_at"];
  const rows = [header.join(",")];
  for (const snap of s.models) {
    for (const r of s.results[snap.id]?.samples ?? []) {
      rows.push([snap.label, snap.providerName, r.mode, r.cache, r.index, r.warmup ? 1 : 0, r.ok ? 1 : 0, r.error?.message ?? "", r.ttftMs?.toFixed(1) ?? "", r.ttfcMs?.toFixed(1) ?? "", r.totalMs.toFixed(1), r.promptTokens ?? "", r.completionTokens ?? "", r.reasoningTokens ?? "", r.cachedTokens ?? "", r.tokensEstimated ? 1 : 0, r.decodeTps?.toFixed(2) ?? "", r.e2eTps?.toFixed(2) ?? "", r.chunkCount, r.finishReason ?? "", new Date(r.startedAt).toISOString()].map(csvCell).join(","));
    }
  }
  return rows.join("\n");
}

export function capToCsv(s: CapSession, dict: Dict): string {
  const header = ["model", "provider", "suite", "test", "status", "summary", "duration_ms"];
  const rows = [header.join(",")];
  for (const snap of s.models) {
    const r = s.results[snap.id];
    for (const id of r?.order ?? []) {
      const o = r.outcomes[id];
      rows.push([snap.label, snap.providerName, id.split(".")[0], testInfo(dict, id).name, o.status, formatMsg(dict, o.summary), o.durationMs].map(csvCell).join(","));
    }
  }
  return rows.join("\n");
}

export function sessionToCsv(s: Session, dict: Dict): string {
  return s.kind === "performance" ? perfToCsv(s) : capToCsv(s, dict);
}

function mdEscape(v: string) {
  return v.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function perfToMarkdown(s: PerfSession, dict: Dict): string {
  const m = dict.perf.metrics;
  const lines: string[] = [];
  lines.push(`# ${dict.results.reportTitle} · ${dict.perf.title}`);
  lines.push("");
  const dialect = s.config.disableReasoning ? (REASONING_DIALECTS.find((d) => d.id === s.config.disableReasoning)?.label ?? s.config.disableReasoning) : dict.perf.reasoningOffNone;
  lines.push(`${new Date(s.createdAt).toISOString()} · ${dict.perf.cacheModes[s.config.cacheMode].name} · ${dict.perf.promptSizes[s.config.promptSize]} · ${dict.perf.promptLangs[s.config.promptLang]} · ${s.config.runs} ${dict.common.runs} · max ${s.config.maxTokens} tokens · ${dict.perf.reasoningOff}: ${dialect}`);
  lines.push("");
  const conditions: ("miss" | "hit")[] = s.config.cacheMode === "compare" ? ["miss", "hit"] : [s.config.cacheMode];
  const cols = [dict.common.model, dict.perf.cacheMode, `${m.ttfc} p50`, `${m.ttfc} p95`, `${m.ttft} p50`, `${m.decodeTps} p50`, `${m.latency} (${m.nonStreaming}) p50`, `${m.e2eTps} p50`, m.cachedTokens, m.success];
  lines.push(`| ${cols.join(" | ")} |`);
  lines.push(`| ${cols.map(() => "---").join(" | ")} |`);
  for (const snap of s.models) {
    const r = s.results[snap.id];
    for (const cond of conditions) {
      const cs = cond === "miss" ? r?.miss : r?.hit;
      const all = (r?.samples ?? []).filter((x) => x.cache === cond && !x.warmup);
      const succ = all.length ? all.filter((x) => x.ok).length / all.length : null;
      const primary = cs?.stream ?? cs?.nonStream;
      const cached = primary?.cachedTokens != null ? (primary.promptTokens ? fmtPct(Math.min(1, primary.cachedTokens / primary.promptTokens)) : String(primary.cachedTokens)) : "—";
      lines.push(
        `| ${mdEscape(snap.label)} (${mdEscape(snap.providerName)}) | ${dict.perf.conditionShort[cond]} | ${fmtMs(cs?.stream?.ttfc?.p50)} | ${fmtMs(cs?.stream?.ttfc?.p95)} | ${fmtMs(cs?.stream?.ttft?.p50)} | ${cs?.stream?.estimated ? "≈" : ""}${fmtNum(cs?.stream?.decodeTps?.p50, 1)} | ${fmtMs(cs?.nonStream?.total?.p50)} | ${fmtNum(cs?.nonStream?.e2eTps?.p50, 1)} | ${cached} | ${fmtPct(succ)} |`,
      );
    }
    const c = r?.comparison;
    if (c) lines.push(`| | ${dict.perf.compare.title} | ${c.ttftImprovement != null ? `TTFT ${fmtPct(c.ttftImprovement)}` : "—"} | | | | ${c.totalImprovement != null ? `${m.total} ${fmtPct(c.totalImprovement)}` : "—"} | | ${c.reported ? fmtPct(c.hitRatio) : "—"} | |`);
  }
  lines.push("");
  lines.push(`## ${dict.perf.scenarioTitle}`);
  lines.push("");
  const scHeader = [dict.perf.scenarioTitle, ...s.models.map((x) => mdEscape(x.label))];
  lines.push(`| ${scHeader.join(" | ")} |`);
  lines.push(`| ${scHeader.map(() => "---").join(" | ")} |`);
  for (const sc of ["voice", "chat", "agent", "batch"] as const) {
    const cells = s.models.map((snap) => {
      const sco = s.results[snap.id]?.scores.find((x) => x.id === sc);
      return sco?.grade ? `**${sco.grade}** (${sco.score})` : "—";
    });
    lines.push(`| ${dict.perf.scenarios[sc].name} | ${cells.join(" | ")} |`);
  }
  lines.push("");
  for (const snap of s.models) {
    const r = s.results[snap.id];
    if (!r) continue;
    lines.push(`### ${mdEscape(snap.label)}`);
    for (const sco of r.scores) lines.push(`- **${dict.perf.scenarios[sco.id].name}**: ${sco.grade ?? "—"} ${sco.score != null ? `(${sco.score})` : ""} — ${sco.reasons.map((x) => formatMsg(dict, x)).join("; ")}`);
    lines.push("");
  }
  lines.push(`_${dict.results.generatedBy.replace("{site}", dict.meta.siteName)}_`);
  return lines.join("\n");
}

export function capToMarkdown(s: CapSession, dict: Dict): string {
  const lines: string[] = [];
  lines.push(`# ${dict.results.reportTitle} · ${dict.results.kind[s.kind]}`);
  lines.push("");
  lines.push(`${new Date(s.createdAt).toISOString()} · ${s.models.map((m) => `${m.label} (${m.providerName})`).join(", ")}`);
  lines.push("");
  const statusLabel = (st: string) => (dict.status as Record<string, string>)[st] ?? st;
  const header = [dict.common.test, ...s.models.map((x) => mdEscape(x.label))];
  const tests = new Set<string>();
  for (const snap of s.models) for (const id of s.results[snap.id]?.order ?? []) tests.add(id);
  for (const suite of SUITE_ORDER) {
    const ids = [...tests].filter((id) => id.startsWith(suite + "."));
    if (!ids.length) continue;
    lines.push(`## ${dict.caps.suiteInfo[suite].name}`);
    lines.push("");
    lines.push(`| ${header.join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const id of ids) {
      const cells = s.models.map((snap) => {
        const o = s.results[snap.id]?.outcomes[id];
        return o ? `${statusLabel(o.status)} — ${mdEscape(formatMsg(dict, o.summary))}` : "—";
      });
      lines.push(`| ${mdEscape(testInfo(dict, id).name)} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  lines.push(`_${dict.results.generatedBy.replace("{site}", dict.meta.siteName)}_`);
  return lines.join("\n");
}

export function sessionToMarkdown(s: Session, dict: Dict): string {
  return s.kind === "performance" ? perfToMarkdown(s, dict) : capToMarkdown(s, dict);
}
