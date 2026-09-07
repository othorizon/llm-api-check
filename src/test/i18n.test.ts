import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { en } from "@/i18n/en";
import { zh } from "@/i18n/zh";
import { ALL_TESTS } from "@/lib/caps/registry";
import { interpolate } from "@/i18n/core";

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("i18n catalogue", () => {
  it("covers every message code used by the engine, in both languages", () => {
    const codes = new Set<string>();
    for (const file of walk(join(process.cwd(), "src/lib"))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/"((?:cap|score)\.[a-z0-9_.]+)"/g)) codes.add(m[1]);
    }
    const missingEn = [...codes].filter((c) => !(c in en.messages));
    const missingZh = [...codes].filter((c) => !(c in zh.messages));
    expect(missingEn).toEqual([]);
    expect(missingZh).toEqual([]);
  });
  it("has a name/desc/why for every registered probe", () => {
    for (const t of ALL_TESTS) {
      expect((en.caps.tests as Record<string, unknown>)[t.id], t.id).toBeDefined();
      expect((zh.caps.tests as Record<string, unknown>)[t.id], t.id).toBeDefined();
      expect(en.caps.suiteInfo[t.suite]).toBeDefined();
    }
  });
  it("interpolates params", () => {
    expect(interpolate("{a} of {b}", { a: 1, b: "x" })).toBe("1 of x");
  });
});
