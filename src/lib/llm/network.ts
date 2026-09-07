/** Address-space helpers for plain-HTTP endpoints called from an HTTPS page. */

export type AddressSpace = "loopback" | "local" | "public";

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^0\./];
const LOCAL_SUFFIXES = [".local", ".localdomain", ".internal", ".lan", ".home", ".intranet", ".corp", ".private"];

export function addressSpaceOf(hostname: string): AddressSpace {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127\./.test(h)) return "loopback";
  if (PRIVATE_V4.some((re) => re.test(h))) return "local";
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return "local";
  if (LOCAL_SUFFIXES.some((s) => h.endsWith(s))) return "local";
  if (!h.includes(".") && !h.includes(":")) return "local"; // bare hostnames such as "nas" or "gpu-box"
  return "public";
}

/** True when the page is HTTPS and `url` is plain http:// to anything but loopback — the browser's mixed-content rule applies. */
export function isMixedContent(url: string): boolean {
  try {
    if (typeof location === "undefined" || location.protocol !== "https:") return false;
    const u = new URL(url);
    return u.protocol === "http:" && addressSpaceOf(u.hostname) !== "loopback";
  } catch {
    return false;
  }
}

/**
 * Extra fetch() options for a URL: Chromium's Local Network Access lets an HTTPS page
 * call a plain-HTTP local-network address after a permission prompt, but only when the
 * request declares the target address space.
 */
export function fetchInitFor(url: string): Record<string, unknown> {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" && addressSpaceOf(u.hostname) === "local") return { targetAddressSpace: "local" };
  } catch {
    /* ignore */
  }
  return {};
}

/** fetch() with the address-space hint; falls back to a plain call on browsers that reject the option. */
export async function fetchWithHints(url: string, init: RequestInit): Promise<Response> {
  const extra = fetchInitFor(url);
  if (Object.keys(extra).length === 0) return fetch(url, init);
  try {
    return await fetch(url, { ...init, ...extra } as RequestInit);
  } catch (e) {
    if (e instanceof TypeError && /targetAddressSpace|enum/i.test(e.message)) return fetch(url, init);
    throw e;
  }
}
