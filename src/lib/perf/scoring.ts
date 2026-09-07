import { msg, type Msg } from "@/lib/caps/types";
import { interp } from "./stats";
import type { CacheCondition, Grade, ModeStats, ScenarioId, ScenarioScore } from "./types";

export const SCENARIOS: ScenarioId[] = ["voice", "chat", "agent", "batch"];

export function gradeOf(score: number | null): Grade | null {
  if (score == null) return null;
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function failurePenalty(stats: ModeStats | null, reasons: Msg[]): number {
  if (!stats || stats.n === 0) return 0;
  const failed = stats.n - stats.ok;
  if (failed > 0) {
    reasons.push(msg("score.failures", { n: failed, total: stats.n }));
    return Math.min(60, failed * 20);
  }
  return 0;
}

/**
 * Real-time voice conversation: the LLM sits between ASR and TTS. The budget
 * for the whole turn is ~800 ms–1 s, so the first *audible* token must arrive
 * fast and consistently. Throughput only needs to outrun speech (~4–6 tok/s).
 */
function scoreVoice(stream: ModeStats | null): ScenarioScore {
  const reasons: Msg[] = [];
  if (!stream || !stream.ttfc || stream.ok === 0) return { id: "voice", score: null, grade: null, reasons: [msg("score.needs_stream")] };
  const p50 = stream.ttfc.p50;
  let score = interp(p50, [
    [250, 100],
    [500, 88],
    [800, 70],
    [1200, 48],
    [2000, 22],
    [3000, 5],
    [4000, 0],
  ]);
  reasons.push(msg("score.ttfc", { ms: Math.round(p50) }));
  if (stream.ttfc.n >= 3) {
    const p95 = stream.ttfc.p95;
    if (p95 > Math.max(1200, p50 * 2)) {
      score -= 12;
      reasons.push(msg("score.p95", { ms: Math.round(p95) }));
    }
  }
  if (stream.decodeTps) {
    const tps = stream.decodeTps.p50;
    if (tps < 8) {
      score -= 30;
      reasons.push(msg("score.tps_low", { tps: tps.toFixed(1) }));
    } else if (tps < 15) {
      score -= 10;
      reasons.push(msg("score.tps_low", { tps: tps.toFixed(1) }));
    } else reasons.push(msg("score.tps_ok", { tps: tps.toFixed(1) }));
  }
  if (stream.reasoningDelayMs != null && stream.reasoningDelayMs > 300) reasons.push(msg("score.reasoning_delay", { ms: Math.round(stream.reasoningDelayMs) }));
  score -= failurePenalty(stream, reasons);
  if (stream.estimated) reasons.push(msg("score.estimated"));
  const s = clamp(score);
  return { id: "voice", score: s, grade: gradeOf(s), reasons };
}

/** Interactive chat UI with streaming text. */
function scoreChat(stream: ModeStats | null): ScenarioScore {
  const reasons: Msg[] = [];
  if (!stream || !stream.ttfc || stream.ok === 0) return { id: "chat", score: null, grade: null, reasons: [msg("score.needs_stream")] };
  const p50 = stream.ttfc.p50;
  let score = interp(p50, [
    [400, 100],
    [1000, 88],
    [2000, 68],
    [4000, 40],
    [6000, 20],
    [10000, 0],
  ]);
  reasons.push(msg("score.ttfc", { ms: Math.round(p50) }));
  if (stream.decodeTps) {
    const tps = stream.decodeTps.p50;
    const tpsScore = interp(tps, [
      [5, 30],
      [15, 70],
      [30, 90],
      [50, 100],
    ]);
    score = score * 0.65 + tpsScore * 0.35;
    reasons.push(tps < 20 ? msg("score.tps_low", { tps: tps.toFixed(1) }) : msg("score.tps_ok", { tps: tps.toFixed(1) }));
  }
  if (stream.reasoningDelayMs != null && stream.reasoningDelayMs > 300) reasons.push(msg("score.reasoning_delay", { ms: Math.round(stream.reasoningDelayMs) }));
  score -= failurePenalty(stream, reasons);
  if (stream.estimated) reasons.push(msg("score.estimated"));
  const s = clamp(score);
  return { id: "chat", score: s, grade: gradeOf(s), reasons };
}

/** Agent / coding loops: many sequential calls, long outputs; throughput dominates. */
function scoreAgent(stream: ModeStats | null, nonStream: ModeStats | null): ScenarioScore {
  const reasons: Msg[] = [];
  const src = stream?.decodeTps ? stream : nonStream?.e2eTps ? nonStream : null;
  if (!src) return { id: "agent", score: null, grade: null, reasons: [msg("score.needs_any")] };
  const tps = (src.decodeTps ?? src.e2eTps)!.p50;
  let score = interp(tps, [
    [5, 5],
    [15, 35],
    [30, 62],
    [50, 82],
    [80, 95],
    [120, 100],
  ]);
  reasons.push(msg("score.tps_ok", { tps: tps.toFixed(1) }));
  const ttft = stream?.ttft?.p50 ?? null;
  if (ttft != null) {
    if (ttft > 1000) {
      const pen = Math.min(30, ((ttft - 1000) / 1000) * 10);
      score -= pen;
      reasons.push(msg("score.ttft_high", { ms: Math.round(ttft) }));
    } else reasons.push(msg("score.ttft", { ms: Math.round(ttft) }));
  }
  score -= failurePenalty(src, reasons);
  if (src.estimated) reasons.push(msg("score.estimated"));
  const s = clamp(score);
  return { id: "agent", score: s, grade: gradeOf(s), reasons };
}

/** Batch / offline processing: reliability and end-to-end throughput only. */
function scoreBatch(stream: ModeStats | null, nonStream: ModeStats | null): ScenarioScore {
  const reasons: Msg[] = [];
  const src = nonStream?.e2eTps ? nonStream : stream?.e2eTps ? stream : null;
  if (!src) return { id: "batch", score: null, grade: null, reasons: [msg("score.needs_any")] };
  const tps = src.e2eTps!.p50;
  let score = interp(tps, [
    [3, 10],
    [10, 45],
    [20, 70],
    [40, 88],
    [80, 100],
  ]);
  reasons.push(msg("score.e2e_tps", { tps: tps.toFixed(1) }));
  if (src.total) reasons.push(msg("score.total", { ms: Math.round(src.total.p50) }));
  score -= failurePenalty(src, reasons) * 1.5;
  if (src.estimated) reasons.push(msg("score.estimated"));
  const s = clamp(score);
  return { id: "batch", score: s, grade: gradeOf(s), reasons };
}

export function computeScores(stream: ModeStats | null, nonStream: ModeStats | null, scoredFrom: CacheCondition | null): ScenarioScore[] {
  const scores = [scoreVoice(stream), scoreChat(stream), scoreAgent(stream, nonStream), scoreBatch(stream, nonStream)];
  if (scoredFrom === "hit") for (const s of scores) if (s.score != null) s.reasons.push(msg("score.from_hit"));
  return scores;
}
