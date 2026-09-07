/**
 * Rough token estimator used ONLY when the provider does not return usage.
 * CJK characters ≈ 1 token each (often less for common words, more for rare ones);
 * Latin text ≈ 1 token per 4 characters (≈ 0.75 words).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xff00 && cp <= 0xffef) ||
      (cp >= 0x3000 && cp <= 0x303f)
    )
      cjk++;
    else other++;
  }
  return Math.round(cjk * 1.0 + other / 4);
}

export function estimateMessagesTokens(messages: { content: unknown }[]): number {
  let n = 0;
  for (const m of messages) {
    if (typeof m.content === "string") n += estimateTokens(m.content);
    else if (Array.isArray(m.content)) for (const p of m.content) if (p && typeof p.text === "string") n += estimateTokens(p.text);
    n += 4; // per-message overhead
  }
  return n;
}
