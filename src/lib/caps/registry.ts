import { connectivityTests } from "./tests/connectivity";
import { reasoningTests } from "./tests/reasoning";
import { toolTests } from "./tests/tools";
import { structuredTests } from "./tests/structured";
import { visionTests } from "./tests/vision";
import { cacheTests } from "./tests/cache";
import { compatTests } from "./tests/compat";
import { messageTests } from "./tests/messages";
import type { CapSuiteId, CapTestDef } from "./types";

export const SUITE_ORDER: CapSuiteId[] = ["connectivity", "reasoning", "tools", "structured", "vision", "cache", "compat", "messages"];
/** Suites offered on the Capabilities page (the message-format suite has its own page). */
export const CAPABILITY_SUITES: CapSuiteId[] = ["reasoning", "tools", "structured", "vision", "cache", "compat"];
export const MESSAGE_SUITES: CapSuiteId[] = ["messages"];

export const ALL_TESTS: CapTestDef[] = [...connectivityTests, ...reasoningTests, ...toolTests, ...structuredTests, ...visionTests, ...cacheTests, ...compatTests, ...messageTests];

export const TEST_MAP: Record<string, CapTestDef> = Object.fromEntries(ALL_TESTS.map((t) => [t.id, t]));

export function testsForSuites(enabled: Record<CapSuiteId, boolean>): CapTestDef[] {
  // Connectivity always runs first: it gates everything else.
  return ALL_TESTS.filter((t) => t.suite === "connectivity" || enabled[t.suite]);
}

export function suiteTests(suite: CapSuiteId): CapTestDef[] {
  return ALL_TESTS.filter((t) => t.suite === suite);
}
